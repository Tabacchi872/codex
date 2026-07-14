// Edge Function send-push (fase 7): invia notifiche push Expo per nuovi
// messaggi e per creazione/modifica/annullamento appuntamenti.
//
// Sicurezza (principi non negoziabili):
// - funzione AUTENTICATA: il chiamante e' identificato SOLO dal JWT
//   (Authorization: Bearer), mai da un campo del body;
// - il DESTINATARIO non arriva mai dal client come user_id arbitrario: il
//   body contiene solo il clientId del thread/appuntamento, e la relazione
//   reale viene verificata sul database (coach_clients) — un coach puo'
//   notificare solo un PROPRIO cliente, un cliente solo il PROPRIO coach;
// - nessun segreto nell'app mobile: la service role key vive solo qui
//   (iniettata dal runtime), i token push vengono letti server-side.
//
// Body: { type: 'message' | 'appointment_created' | 'appointment_updated'
//         | 'appointment_cancelled', clientId: string, preview?: string }
//
// Anti-duplicati: i token del destinatario vengono deduplicati (Set) e ogni
// invocazione produce UNA sola richiesta all'API Expo per token; il client
// mobile chiama la function una volta per evento (mai in loop/retry).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ResultBody = { ok: true; data: unknown } | { ok: false; code: string; message: string };

function json(body: ResultBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const VALID_TYPES = ['message', 'appointment_created', 'appointment_updated', 'appointment_cancelled'] as const;
type PushEventType = (typeof VALID_TYPES)[number];

function buildContent(type: PushEventType, senderName: string, preview: string): { title: string; body: string } {
  switch (type) {
    case 'message':
      return { title: `Messaggio da ${senderName}`, body: preview || 'Hai ricevuto un nuovo messaggio.' };
    case 'appointment_created':
      return { title: 'Nuovo appuntamento', body: preview ? `${senderName}: ${preview}` : `${senderName} ha creato un appuntamento.` };
    case 'appointment_updated':
      return { title: 'Appuntamento aggiornato', body: preview ? `${senderName}: ${preview}` : `${senderName} ha modificato un appuntamento.` };
    case 'appointment_cancelled':
      return { title: 'Appuntamento annullato', body: preview ? `${senderName}: ${preview}` : `${senderName} ha annullato un appuntamento.` };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, code: 'method_not_allowed', message: 'Metodo non consentito.' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, code: 'server_misconfigured', message: 'Configurazione server mancante.' }, 500);
    }
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // --- Autenticazione: identita' SOLO dal JWT ------------------------
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return json({ ok: false, code: 'not_authenticated', message: 'Autenticazione mancante.' }, 401);
    }
    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(jwt);
    if (callerError || !callerData.user) {
      return json({ ok: false, code: 'not_authenticated', message: 'Sessione non valida.' }, 401);
    }
    const callerId = callerData.user.id;

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role,full_name')
      .eq('id', callerId)
      .maybeSingle();
    if (!callerProfile) {
      return json({ ok: false, code: 'not_authenticated', message: 'Profilo del chiamante non trovato.' }, 401);
    }
    const callerRole = callerProfile.role as string;
    const senderName = (callerProfile.full_name as string | null)?.trim() || 'FitCoach Pro';

    // --- Validazione body ----------------------------------------------
    let body: { type?: unknown; clientId?: unknown; preview?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, code: 'invalid_body', message: 'Corpo della richiesta non valido.' }, 400);
    }
    const type = typeof body.type === 'string' && (VALID_TYPES as readonly string[]).includes(body.type)
      ? (body.type as PushEventType)
      : null;
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    const preview = typeof body.preview === 'string' ? body.preview.slice(0, 160) : '';
    if (!type || !clientId) {
      return json({ ok: false, code: 'invalid_body', message: 'Tipo o clientId mancante.' }, 400);
    }

    // --- Risoluzione destinatario dalle relazioni REALI ------------------
    // Mai dal body: il client indica solo il thread (clientId); chi riceve
    // dipende da chi chiama.
    let recipientId: string | null = null;

    if (callerRole === 'coach' || callerRole === 'superadmin') {
      // Il coach notifica il cliente — SOLO se e' davvero un suo cliente.
      const { data: link } = await supabaseAdmin
        .from('coach_clients')
        .select('id')
        .eq('coach_id', callerId)
        .eq('client_id', clientId)
        .in('status', ['active', 'invited'])
        .maybeSingle();
      if (!link) {
        return json({ ok: false, code: 'forbidden', message: 'Il cliente indicato non risulta collegato a questo coach.' }, 403);
      }
      recipientId = clientId;
    } else if (callerRole === 'cliente') {
      // Il cliente notifica il proprio coach — il thread deve essere il suo.
      if (clientId !== callerId) {
        return json({ ok: false, code: 'forbidden', message: 'Un cliente puo\' notificare solo il proprio thread.' }, 403);
      }
      const { data: link } = await supabaseAdmin
        .from('coach_clients')
        .select('coach_id')
        .eq('client_id', callerId)
        .in('status', ['active', 'invited'])
        .maybeSingle();
      if (!link) {
        return json({ ok: false, code: 'forbidden', message: 'Nessun coach collegato a questo account.' }, 403);
      }
      recipientId = link.coach_id as string;
    } else {
      return json({ ok: false, code: 'forbidden', message: 'Ruolo non autorizzato.' }, 403);
    }

    // --- Token del destinatario (deduplicati) ---------------------------
    const { data: tokenRows, error: tokensError } = await supabaseAdmin
      .from('push_tokens')
      .select('token')
      .eq('user_id', recipientId);
    if (tokensError) {
      return json({ ok: false, code: 'tokens_lookup_failed', message: 'Impossibile leggere i token push.' }, 500);
    }
    const tokens = [...new Set((tokenRows ?? []).map((row) => row.token as string).filter(Boolean))];
    console.log('SEND_PUSH', { type, tokens: tokens.length });
    if (tokens.length === 0) {
      // Nessun device registrato: non e' un errore (l'utente puo' aver
      // negato il permesso o usare solo il web).
      return json({ ok: true, data: { sent: 0 } }, 200);
    }

    const { title, body: messageBody } = buildContent(type, senderName, preview);
    const pushMessages = tokens.map((token) => ({
      to: token,
      title,
      body: messageBody,
      sound: 'default',
      channelId: 'default',
      data: { type, clientId },
    }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(pushMessages),
    });
    if (!res.ok) {
      console.error('EXPO_PUSH_API_ERROR', { status: res.status });
      return json({ ok: false, code: 'push_send_failed', message: 'Invio push non riuscito.' }, 502);
    }
    const receipt = (await res.json()) as { data?: Array<{ status?: string }> };
    const sent = Array.isArray(receipt.data) ? receipt.data.filter((item) => item.status === 'ok').length : 0;
    console.log('SEND_PUSH_RESULT', { type, sent });
    return json({ ok: true, data: { sent } }, 200);
  } catch (err) {
    console.error('SEND_PUSH_ERROR', { message: err instanceof Error ? err.message : String(err) });
    return json({ ok: false, code: 'internal_error', message: 'Errore interno.' }, 500);
  }
});
