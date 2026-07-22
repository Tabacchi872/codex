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
// cascade (docs/SUPABASE_SCHEMA.sql) e la quasi totalita' delle tabelle che
// referenziano profiles(id) sono a loro volta on delete cascade, quindi
// eliminare la riga auth.users elimina a cascata profiles e tutti i dati
// collegati (coach_profiles/client_profiles/coach_clients/workout_plans/
// appointments/client_metrics/ecc.). Due tabelle fanno eccezione con created_by
// uuid not null references public.profiles(id) on delete restrict
// (client_notes, exercise_progress_history, vedi supabase/migrations/
// 20260716120000_client_notes.sql e 20260718120000_exercise_progress_history.sql):
// le RLS insert policy di quelle tabelle impongono sempre created_by =
// coach_id oppure created_by = client_id della stessa riga, quindi quelle
// righe sarebbero comunque cancellate dalla cascade su coach_id/client_id —
// vengono pero' eliminate esplicitamente qui PRIMA di deleteUser per non
// dipendere dall'ordine di esecuzione dei trigger FK di Postgres su piu'
// vincoli della stessa tabella, che non e' garantito deterministico.
//
// Non elimina file nello Storage (avatar, video) collegati all'utente: resta
// un limite noto, documentato in IOS_SETUP.md/docs/TODO_NEXT.md.
// Non annulla abbonamenti RevenueCat/Apple/Google attivi: l'utente deve
// comunque cancellarli dalla gestione abbonamenti dello store (Apple/Google
// non permettono la disdetta programmatica da parte del server).

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

  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  if (callerProfileError || !callerProfile) {
    return json({ ok: false, code: 'not_authenticated', message: 'Profilo del chiamante non trovato.' }, 401);
  }
  if (callerProfile.role === 'superadmin') {
    return json(
      { ok: false, code: 'forbidden', message: 'L\'account superadmin non puo\' essere eliminato da questo flusso.' },
      403,
    );
  }

  // Vedi commento in testa al file: rimozione esplicita delle righe con
  // created_by = callerId nelle due tabelle con vincolo on delete restrict,
  // per non dipendere dall'ordine dei trigger FK di Postgres.
  const { error: notesCleanupError } = await supabaseAdmin.from('client_notes').delete().eq('created_by', callerId);
  if (notesCleanupError) {
    return json(
      { ok: false, code: 'cleanup_failed', message: `Impossibile ripulire le note collegate: ${notesCleanupError.message}` },
      500,
    );
  }
  const { error: progressCleanupError } = await supabaseAdmin
    .from('exercise_progress_history')
    .delete()
    .eq('created_by', callerId);
  if (progressCleanupError) {
    return json(
      {
        ok: false,
        code: 'cleanup_failed',
        message: `Impossibile ripulire lo storico esercizi collegato: ${progressCleanupError.message}`,
      },
      500,
    );
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(callerId);
  if (deleteError) {
    return json(
      { ok: false, code: 'delete_failed', message: `Impossibile eliminare l'account: ${deleteError.message}` },
      500,
    );
  }

  return json({ ok: true }, 200);
});
