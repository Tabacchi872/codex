// Edge Function: send-temporary-credentials
//
// Genera una password provvisoria per un utente Supabase gia' esistente
// (coach o cliente) e la invia via email, senza MAI farla transitare o essere
// generata sul client mobile. Chiamata da mobile/src/lib/auth-service.ts
// (sendTemporaryCredentials) tramite supabase.functions.invoke, che allega
// automaticamente l'Authorization: Bearer <access_token> dell'utente loggato
// (vedi @supabase/supabase-js fetchWithAuth) — verify_jwt resta true (default
// del progetto), quindi solo richieste di un utente autenticato arrivano qui.
//
// Autorizzazione: solo il coach proprietario del cliente target (via
// coach_clients) o un superadmin possono richiedere il reset. L'email di
// destinazione e il ruolo del target vengono SEMPRE riletti da public.profiles
// lato server, mai presi per buoni dal body della richiesta: altrimenti un
// chiamante malevolo potrebbe far arrivare la password provvisoria di un
// account altrui al proprio indirizzo email.
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

// Set di caratteri senza ambigui (0/O, 1/l/I) per una password leggibile se
// mai dovesse essere trascritta a mano, comunque inviata solo via email.
const PASSWORD_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';

function generateTemporaryPassword(length = 16): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let password = '';
  for (let i = 0; i < length; i += 1) {
    // Rejection implicita non necessaria: PASSWORD_CHARSET.length (61) e
    // 2^32 non sono in rapporto esatto, ma il bias residuo su un charset di
    // questa dimensione e' trascurabile per una password provvisoria (non e'
    // materiale crittografico a lungo termine, viene sostituita al primo
    // accesso obbligato).
    password += PASSWORD_CHARSET[bytes[i] % PASSWORD_CHARSET.length];
  }
  return password;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendCredentialsEmail(params: {
  toEmail: string;
  fullName: string | null;
  role: 'coach' | 'cliente';
  temporaryPassword: string;
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

  const htmlContent =
    `<p>Ciao ${escapeHtml(greetingName)},</p>` +
    `<p>Ti sono state assegnate delle nuove credenziali di accesso a FitCoach.</p>` +
    `<p>Email: ${escapeHtml(params.toEmail)}<br/>` +
    `Password provvisoria: <strong>${escapeHtml(params.temporaryPassword)}</strong></p>` +
    `<p>Per motivi di sicurezza dovrai impostare una nuova password al primo accesso.</p>` +
    `<p>Se non hai richiesto questo invio, contatta il tuo coach o l'assistenza.</p>`;

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
      subject: 'Le tue credenziali FitCoach',
      htmlContent,
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

  let body: { userId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'invalid_body', message: 'Corpo della richiesta non valido.' }, 400);
  }
  const targetUserId = typeof body.userId === 'string' ? body.userId : '';
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

  const temporaryPassword = generateTemporaryPassword();

  const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
    password: temporaryPassword,
  });
  if (updateUserError) {
    return json(
      { ok: false, code: 'update_password_failed', message: `Impossibile impostare la password: ${updateUserError.message}` },
      500,
    );
  }

  const { error: flagError } = await supabaseAdmin
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', targetUserId);
  if (flagError) {
    // La password sul server e' gia' cambiata: non possiamo piu' inviare
    // quella vecchia via email, quindi non ha senso "annullare" tornando
    // indietro. Segnaliamo l'errore cosi' il chiamante puo' riprovare
    // (rigenera una nuova password e reinvia), invece di lasciare un flag
    // incoerente in silenzio.
    return json(
      { ok: false, code: 'flag_update_failed', message: `Password aggiornata ma stato account non salvato: ${flagError.message}. Riprova.` },
      500,
    );
  }

  const emailResult = await sendCredentialsEmail({
    toEmail: targetProfile.email,
    fullName: targetProfile.full_name,
    role: targetProfile.role,
    temporaryPassword,
  });
  if (!emailResult.ok) {
    // Stessa logica: la password e' gia' stata cambiata sul server. La
    // password provvisoria in chiaro NON viene mai restituita al chiamante
    // (il coach non deve vederla): l'unico modo per recuperare e' rigenerare.
    return json(
      { ok: false, code: 'email_failed', message: `${emailResult.message} La password e' comunque stata aggiornata: riprova per generarne una nuova e reinviarla.` },
      502,
    );
  }

  return json({ ok: true }, 200);
});
