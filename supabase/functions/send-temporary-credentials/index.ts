// Edge Function: send-temporary-credentials
//
// NOME STORICO, COMPORTAMENTO AGGIORNATO (2026-07-24): non genera piu' una
// password in chiaro. Genera un link Supabase monouso (auth.admin.generateLink,
// type 'recovery') per un utente gia' esistente (coach o cliente) e lo invia
// via email: il destinatario imposta da se' la propria password aprendo il
// link, con lo stesso meccanismo gia' usato da "Password dimenticata"
// (mobile/src/components/forgot-password-screen.tsx +
// reset-password-screen.tsx). Nessuna password transita mai per questa
// funzione, ne' viene generata sul client mobile. Il nome della funzione e
// la stringa invocata da supabase.functions.invoke('send-temporary-credentials')
// restano invariati per non dover ricollegare/ridocumentare ogni riferimento:
// solo il comportamento interno e' cambiato (vedi docs/SUPABASE_TEMP_CREDENTIALS.md).
//
// Chiamata da mobile/src/lib/auth-service.ts (sendTemporaryCredentials)
// tramite supabase.functions.invoke, che allega automaticamente
// l'Authorization: Bearer <access_token> dell'utente loggato (vedi
// @supabase/supabase-js fetchWithAuth) — verify_jwt resta true (default del
// progetto), quindi solo richieste di un utente autenticato arrivano qui.
//
// Autorizzazione: solo il coach proprietario del cliente target (via
// coach_clients) o un superadmin possono richiedere l'invio. L'email di
// destinazione e il ruolo del target vengono SEMPRE riletti da public.profiles
// lato server, mai presi per buoni dal body della richiesta: altrimenti un
// chiamante malevolo potrebbe far arrivare il link di accesso di un account
// altrui al proprio indirizzo email.
//
// Variabili d'ambiente richieste (supabase secrets set ...):
// - BREVO_API_KEY: chiave API Brevo (https://app.brevo.com/settings/keys/api) per l'invio email.
// - BREVO_SENDER_EMAIL: indirizzo mittente verificato sul proprio account Brevo
//   (Brevo rifiuta l'invio se il mittente non e' verificato/autenticato).
// - BREVO_SENDER_NAME (opzionale): nome mittente mostrato al destinatario. Se
//   assente, usa "FitCoach".
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono iniettate automaticamente dal
// runtime delle Edge Function: non vanno impostate a mano.
//
// Vedi docs/SUPABASE_TEMP_CREDENTIALS.md per deploy, secrets e test end-to-end.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { buildEmail } from '../_shared/email-template.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ResultBody = { ok: true } | { ok: false; code: string; message: string };

function json(body: ResultBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sendAccessLinkEmail(params: {
  toEmail: string;
  fullName: string | null;
  role: 'coach' | 'cliente';
  actionLink: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const brevoApiKey = Deno.env.get('BREVO_API_KEY');
  if (!brevoApiKey) {
    return { ok: false, message: 'BREVO_API_KEY non configurata sulla Edge Function.' };
  }
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
  if (!senderEmail) {
    return { ok: false, message: 'BREVO_SENDER_EMAIL non configurata sulla Edge Function.' };
  }
  const senderName = Deno.env.get('BREVO_SENDER_NAME') || 'FitCoach';
  const greetingName = params.fullName?.trim() || (params.role === 'coach' ? 'Coach' : 'Cliente');

  const email = buildEmail({
    subject: 'Il tuo account FitCoach è pronto',
    title: 'Il tuo account FitCoach è pronto',
    preheader: 'Imposta la tua password personale per accedere a FitCoach.',
    greetingName,
    paragraphs: [
      'È stato preparato per te un accesso personale a FitCoach.',
      'Da oggi potrai consultare schede di allenamento, video e dettagli degli esercizi, storico dei carichi, metriche e progressi, appuntamenti e comunicazioni con il coach.',
      'Per attivare il tuo accesso imposta la tua password personale dal pulsante qui sotto.',
    ],
    button: { label: 'Imposta la tua password', url: params.actionLink },
    securityNote:
      "Il link è monouso e personale: se non hai richiesto questo invio, non aprirlo e contatta il tuo coach o l'assistenza.",
  });

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': brevoApiKey,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: params.toEmail }],
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    console.error('BREVO_SEND_FAILED', res.status, errorBody);
    return { ok: false, message: `Invio email fallito (Brevo ${res.status}).` };
  }
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, code: 'method_not_allowed', message: 'Metodo non consentito.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, code: 'server_misconfigured', message: 'Configurazione server mancante.' }, 500);
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

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

  let body: { userId?: unknown; redirectTo?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'invalid_body', message: 'Corpo della richiesta non valido.' }, 400);
  }
  const targetUserId = typeof body.userId === 'string' ? body.userId : '';
  // redirectTo: calcolato lato mobile (getWebRedirectUrl('/reimposta-password'),
  // stesso pattern di forgot-password-screen.tsx) — dinamico per porta/ambiente
  // su web, assente su nativo (fallback alla Site URL configurata su Supabase,
  // stesso limite noto del flusso "Password dimenticata"). Solo Supabase
  // valida che l'URL rientri tra le Redirect URLs configurate sul progetto:
  // stessa fiducia gia' accordata a emailRedirectTo altrove in questo codice,
  // nessuna validazione aggiuntiva qui.
  const redirectTo = typeof body.redirectTo === 'string' && body.redirectTo.trim() ? body.redirectTo.trim() : undefined;
  // email/role nel body (documentati nella spec della feature) sono solo
  // informativi lato chiamante: qui sotto vengono sempre riletti da
  // public.profiles, mai usati come destinazione o fonte di verita'.
  if (!UUID_RE.test(targetUserId)) {
    return json(
      { ok: false, code: 'invalid_target', message: 'Nessun account Supabase reale trovato per questo utente.' },
      400,
    );
  }

  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  if (callerProfileError || !callerProfile) {
    return json({ ok: false, code: 'not_authenticated', message: 'Profilo del chiamante non trovato.' }, 401);
  }

  const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, email, full_name')
    .eq('id', targetUserId)
    .maybeSingle();
  if (targetProfileError || !targetProfile) {
    return json(
      { ok: false, code: 'target_not_found', message: 'Nessun account Supabase reale trovato per questo utente.' },
      404,
    );
  }
  if (targetProfile.role !== 'coach' && targetProfile.role !== 'cliente') {
    return json({ ok: false, code: 'invalid_target', message: 'Ruolo utente non supportato per questa operazione.' }, 400);
  }

  const isSuperadmin = callerProfile.role === 'superadmin';
  let isOwningCoach = false;
  if (!isSuperadmin && callerProfile.role === 'coach' && targetProfile.role === 'cliente') {
    const { data: link } = await supabaseAdmin
      .from('coach_clients')
      .select('id')
      .eq('coach_id', callerId)
      .eq('client_id', targetUserId)
      .in('status', ['active', 'invited'])
      .maybeSingle();
    isOwningCoach = Boolean(link);
  }

  if (!isSuperadmin && !isOwningCoach) {
    return json({ ok: false, code: 'forbidden', message: 'Non autorizzato a generare credenziali per questo utente.' }, 403);
  }

  // Nessuna password generata/impostata qui: generateLink('recovery') crea
  // un link Supabase monouso per l'utente GIA' esistente, che il
  // destinatario usa per impostare da se' la propria password (stesso
  // meccanismo di "Password dimenticata"). Non invia alcuna email da solo:
  // l'action_link va spedito da questa funzione via Brevo, coerente con lo
  // stile grafico FitCoach.
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: targetProfile.email,
    options: redirectTo ? { redirectTo } : undefined,
  });
  if (linkError || !linkData?.properties?.action_link) {
    return json(
      {
        ok: false,
        code: 'generate_link_failed',
        message: `Impossibile generare il link di accesso: ${linkError?.message ?? 'risposta inattesa da Supabase.'}`,
      },
      500,
    );
  }

  const emailResult = await sendAccessLinkEmail({
    toEmail: targetProfile.email,
    fullName: targetProfile.full_name,
    role: targetProfile.role,
    actionLink: linkData.properties.action_link,
  });
  if (!emailResult.ok) {
    // Nessuna password e' mai stata impostata: un fallimento qui non lascia
    // alcuno stato incoerente sull'account, il chiamante puo' semplicemente
    // riprovare (rigenera un nuovo link e reinvia).
    return json({ ok: false, code: 'email_failed', message: emailResult.message }, 502);
  }

  return json({ ok: true }, 200);
});
