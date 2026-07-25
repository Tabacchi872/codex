// Edge Function: delete-account
//
// Elimina definitivamente l'account Supabase Auth dell'utente chiamante (mai
// di un altro utente: nessun userId nel body, il target e' sempre e solo
// auth.uid() del token allegato dalla richiesta). Richiesta da Apple App
// Review Guideline 5.1.1(v): un'app che permette la creazione di un account
// deve permettere anche di eliminarlo completamente dall'app stessa, non solo
// disattivarlo o disconnetterlo. Chiamata da mobile/src/lib/auth-service.ts
// (deleteOwnAccount) tramite supabase.functions.invoke, che allega
// automaticamente l'Authorization: Bearer <access_token> dell'utente loggato.
//
// Cascata dati: public.profiles.id references auth.users(id) on delete
// cascade (verificato anche live sul progetto, non solo su docs/
// SUPABASE_SCHEMA.sql che risultava disallineata: vedi audit 2026-07-25) e la
// quasi totalita' delle tabelle che referenziano profiles(id) sono a loro
// volta on delete cascade, quindi eliminare la riga auth.users elimina a
// cascata profiles e tutti i dati collegati (coach_profiles/client_profiles/
// coach_clients/workout_plans/appointments/client_metrics/ecc.). Due tabelle
// fanno eccezione con created_by uuid not null references public.profiles(id)
// on delete restrict (client_notes, exercise_progress_history, vedi
// supabase/migrations/20260716120000_client_notes.sql e
// 20260718120000_exercise_progress_history.sql): le RLS insert policy di
// quelle tabelle impongono sempre created_by = coach_id oppure created_by =
// client_id della stessa riga, quindi quelle righe sarebbero comunque
// cancellate dalla cascade su coach_id/client_id — vengono pero' eliminate
// esplicitamente qui PRIMA di deleteUser per non dipendere dall'ordine di
// esecuzione dei trigger FK di Postgres su piu' vincoli della stessa tabella,
// che non e' garantito deterministico.
//
// Non elimina file nello Storage (avatar, video) collegati all'utente: resta
// un limite noto, documentato in IOS_SETUP.md/docs/TODO_NEXT.md.
// Non annulla abbonamenti RevenueCat/Apple/Google attivi: l'utente deve
// comunque cancellarli dalla gestione abbonamenti dello store (Apple/Google
// non permettono la disdetta programmatica da parte del server). Un
// pacchetto assegnato manualmente dal superadmin (payment_provider =
// 'superadmin_manual') non ha nulla da annullare lato store: la riga
// user_subscriptions viene comunque eliminata a cascata con il resto.
//
// Formato risposta (stabile, consumato da mobile/src/lib/auth-service.ts):
//   successo -> { success: true }
//   errore   -> { success: false, error: "<messaggio leggibile>",
//                 code: "<CODICE_STABILE>", details?: "<tecnico, non sensibile>" }
// Il campo "details" non contiene mai stack trace, chiavi o segreti: solo
// status/nome/codice dell'errore upstream, utile nei log senza esporre dati.

import { createClient, type AuthError } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ErrorBody = { success: false; error: string; code: string; details?: string };
type SuccessBody = { success: true };

function ok(): Response {
  const body: SuccessBody = { success: true };
  return new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function fail(status: number, code: string, error: string, details?: string): Response {
  const body: ErrorBody = { success: false, error, code, details };
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// auth-js (mobile/node_modules/@supabase/auth-js/dist/main/lib/fetch.js,
// _getErrorMessage) usa come ultima risorsa JSON.stringify(err) quando il
// corpo di errore di GoTrue non ha nessuno dei campi msg/message/
// error_description/error: se quel corpo era un oggetto vuoto, .message
// diventa letteralmente la stringa "{}" — la causa esatta del bug segnalato
// ("Impossibile eliminare l'account: {}"). Questa funzione impedisce che un
// messaggio del genere (o altrettanto inutile) arrivi mai all'utente.
function isUselessMessage(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const normalized = trimmed.toLowerCase();
  return trimmed === '{}' || trimmed === '[object Object]' || normalized === 'undefined' || normalized === 'null';
}

function describeAuthError(err: AuthError): string {
  const status = err.status ?? 'n/a';
  const name = err.name || 'AuthError';
  const code = (err as { code?: string }).code;
  return `status ${status} (${name}${code ? `/${code}` : ''})`;
}

// Un solo retry per errori dall'aria transitoria (nessuno status, o 5xx):
// una cascata di delete su molte tabelle puo' occasionalmente incappare in
// un timeout/errore infrastrutturale momentaneo lato GoTrue. Non ritenta su
// errori 4xx (non sono transitori, ritentare non cambierebbe l'esito). Se
// l'utente risulta gia' assente (404), il flusso e' idempotente: si
// considera successo, non un errore.
async function deleteAuthUserWithRetry(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<AuthError | null> {
  let lastError: AuthError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (!error) return null;
    if (error.status === 404) return null;
    lastError = error;
    const retryable = !error.status || error.status >= 500;
    if (!retryable || attempt === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return lastError;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return fail(405, 'INVALID_METHOD', 'Metodo non consentito.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('delete-account: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY mancanti nell\'ambiente della funzione.');
    return fail(500, 'SERVER_MISCONFIGURED', 'Servizio momentaneamente non disponibile.');
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    return fail(401, 'SESSION_MISSING', 'Sessione assente. Accedi di nuovo.');
  }

  const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(jwt);
  if (callerError || !callerData.user) {
    return fail(401, 'SESSION_INVALID', 'La sessione è scaduta. Accedi nuovamente.');
  }
  const callerId = callerData.user.id;

  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  if (callerProfileError || !callerProfile) {
    console.error('delete-account: profilo chiamante non trovato', { userId: callerId, dbError: callerProfileError?.message });
    return fail(401, 'PROFILE_NOT_FOUND', 'La sessione è scaduta. Accedi nuovamente.');
  }
  if (callerProfile.role === 'superadmin') {
    return fail(403, 'FORBIDDEN_SUPERADMIN', "L'account superadmin non può essere eliminato da questo flusso.");
  }

  // Vedi commento in testa al file: rimozione esplicita delle righe con
  // created_by = callerId nelle due tabelle con vincolo on delete restrict,
  // per non dipendere dall'ordine dei trigger FK di Postgres.
  const { error: notesCleanupError } = await supabaseAdmin.from('client_notes').delete().eq('created_by', callerId);
  if (notesCleanupError) {
    console.error('delete-account: pulizia client_notes fallita', { userId: callerId, dbError: notesCleanupError.message });
    return fail(409, 'CLEANUP_CONFLICT', 'Non è stato possibile eliminare alcuni dati collegati all\'account.', notesCleanupError.message);
  }
  const { error: progressCleanupError } = await supabaseAdmin
    .from('exercise_progress_history')
    .delete()
    .eq('created_by', callerId);
  if (progressCleanupError) {
    console.error('delete-account: pulizia exercise_progress_history fallita', {
      userId: callerId,
      dbError: progressCleanupError.message,
    });
    return fail(409, 'CLEANUP_CONFLICT', 'Non è stato possibile eliminare alcuni dati collegati all\'account.', progressCleanupError.message);
  }

  const deleteError = await deleteAuthUserWithRetry(supabaseAdmin, callerId);
  if (deleteError) {
    const details = describeAuthError(deleteError);
    console.error('delete-account: auth.admin.deleteUser fallito', {
      userId: callerId,
      status: deleteError.status,
      name: deleteError.name,
      rawMessage: isUselessMessage(deleteError.message) ? '(vuoto o non informativo)' : deleteError.message,
    });
    const status = deleteError.status ?? 500;
    if (status === 401 || status === 403) {
      return fail(403, 'ACCOUNT_DELETE_FORBIDDEN', 'Operazione non autorizzata.', details);
    }
    if (status === 409) {
      return fail(409, 'ACCOUNT_DELETE_CONFLICT', 'Non è stato possibile completare l\'eliminazione per un conflitto sui dati.', details);
    }
    if (status >= 500 || !deleteError.status) {
      return fail(500, 'ACCOUNT_DELETE_FAILED', 'Servizio momentaneamente non disponibile. Riprova tra qualche minuto.', details);
    }
    return fail(500, 'ACCOUNT_DELETE_FAILED', 'Eliminazione non riuscita. Codice: ACCOUNT_DELETE_FAILED.', details);
  }

  return ok();
});
