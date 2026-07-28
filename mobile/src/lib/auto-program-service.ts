import { supabase, supabaseConfig } from './supabase';

import type { ActiveProgramCycle, ProgramCycleStatus } from '@/types/client-fitness-profile';

type ServiceResult<T> = { ok: true; data: T } | { ok: false; message: string };

const GENERIC_ERROR = "Non è stato possibile completare l'operazione. Riprova.";

function describeAssignError(message: string): string {
  if (message.includes('INVALID_STATE')) return 'Completa prima il questionario fitness.';
  if (message.includes('CLIENT_PRO_REQUIRED')) return 'Serve un piano Client Pro attivo per ricevere un programma automatico.';
  if (message.includes('FORBIDDEN')) return 'Il programma automatico non è disponibile per il tuo account.';
  if (message.includes('NO_TEMPLATE_AVAILABLE')) {
    return 'Nessun programma disponibile al momento per le tue preferenze: verrà valutato al più presto dal nostro team.';
  }
  if (message.includes('NOT_AUTHENTICATED')) return 'Sessione scaduta: effettua di nuovo il login.';
  return GENERIC_ERROR;
}

// Nessun parametro: la RPC assign_initial_auto_program usa sempre auth.uid(),
// mai un client_id passato dal chiamante. E' gia' idempotente lato server
// (ritorna il ciclo esistente se gia' presente): sicura da richiamare piu'
// volte (es. un doppio tap, o un retry dopo un errore di rete).
export async function assignInitialAutoProgram(): Promise<ServiceResult<string>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: false, message: GENERIC_ERROR };

  const { data, error } = await supabase.rpc('assign_initial_auto_program');
  if (error) {
    if (__DEV__) console.warn('AUTO_PROGRAM_ASSIGN_ERROR', error.message);
    return { ok: false, message: describeAssignError(error.message) };
  }

  return { ok: true, data: data as string };
}

type ProgramCycleRow = {
  id: string;
  status: ProgramCycleStatus;
  cycle_number: number;
  source: string;
  decision_reason: string | null;
  template_id: string | null;
  started_at: string;
  review_due_at: string | null;
  workout_templates: { name: string } | { name: string }[] | null;
};

// Gli 8 stati non terminali reali (stesso elenco di public._cycle_open_statuses()
// lato server, sotto-blocco 2.3): 'draft' incluso per completezza anche se
// transitorio. Bug corretto nel sotto-blocco 2.6: prima interrogava ancora
// `status in ('active','pending_review')`, vocabolario pre-2.1 mai
// aggiornato — un cliente il cui ciclo non fosse rimasto esattamente
// 'active' (checkin_due, review_pending, pending_subscription,
// paused_subscription, pending_safety_review, pending_template) non vedeva
// alcuna card, come se non avesse alcun programma.
const OPEN_CYCLE_STATUSES: ProgramCycleStatus[] = [
  'draft',
  'active',
  'checkin_due',
  'review_pending',
  'pending_subscription',
  'paused_subscription',
  'pending_safety_review',
  'pending_template',
];

// Nessun filtro esplicito client_id: la RLS (client_program_cycles_owner_read)
// decide da sola, stesso pattern di listWorkoutPlansForCurrentUser
// (workout-plan-service.ts).
export async function getMyActiveProgramCycle(): Promise<ServiceResult<ActiveProgramCycle | null>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: null };

  const { data, error } = await supabase
    .from('client_program_cycles')
    .select('id,status,cycle_number,source,decision_reason,template_id,started_at,review_due_at,workout_templates(name)')
    .in('status', OPEN_CYCLE_STATUSES)
    .order('cycle_number', { ascending: false })
    .limit(1)
    .maybeSingle<ProgramCycleRow>();

  if (error) {
    if (__DEV__) console.warn('AUTO_PROGRAM_CYCLE_READ_ERROR', error.message);
    return { ok: false, message: GENERIC_ERROR };
  }

  if (!data) return { ok: true, data: null };

  const templateRelation = data.workout_templates;
  const templateName = Array.isArray(templateRelation) ? templateRelation[0]?.name ?? null : templateRelation?.name ?? null;

  return {
    ok: true,
    data: {
      id: data.id,
      status: data.status,
      cycleNumber: data.cycle_number,
      source: data.source,
      decisionReason: data.decision_reason,
      templateId: data.template_id,
      templateName,
      startedAt: data.started_at,
      reviewDueAt: data.review_due_at,
    },
  };
}

function describeReviewError(message: string): string {
  if (message.includes('CYCLE_NOT_DUE')) return 'Il ciclo non è ancora giunto al momento della revisione.';
  if (message.includes('CHECKIN_REQUIRED')) return 'Completa prima il check-in mensile.';
  if (message.includes('NO_ACTIVE_CYCLE')) return 'Nessun ciclo automatico attivo da rivedere.';
  if (message.includes('FORBIDDEN')) return 'Questa operazione non è disponibile per il tuo account.';
  if (message.includes('NOT_AUTHENTICATED')) return 'Sessione scaduta: effettua di nuovo il login.';
  return GENERIC_ERROR;
}

export type CycleReviewOutcome = {
  decision: string;
  cycleId: string;
  nextCycleId: string | null;
  decisionReason: string | null;
  blocked: boolean;
  resultCode: string;
};

// Nessun parametro obbligatorio: senza p_cycle_id la RPC risolve da sola il
// ciclo aperto corrente del chiamante (auth.uid()). Idempotente lato server
// (STEP 4 di run_cycle_review): sicura da richiamare piu' volte, incluso un
// retry dopo un timeout di rete — stesso risultato, mai una doppia
// elaborazione.
export async function runCycleReview(cycleId?: string): Promise<ServiceResult<CycleReviewOutcome>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: false, message: GENERIC_ERROR };

  const { data, error } = await supabase.rpc('run_cycle_review', cycleId ? { p_cycle_id: cycleId } : {});
  if (error) {
    if (__DEV__) console.warn('AUTO_PROGRAM_RUN_REVIEW_ERROR', error.message);
    return { ok: false, message: describeReviewError(error.message) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, message: GENERIC_ERROR };

  return {
    ok: true,
    data: {
      decision: row.decision,
      cycleId: row.cycle_id,
      nextCycleId: row.next_cycle_id ?? null,
      decisionReason: row.decision_reason ?? null,
      blocked: !!row.blocked,
      resultCode: row.result_code,
    },
  };
}

export type ExerciseTransitionSummary = {
  kept: number;
  replaced: number;
  progressed: number;
  regressed: number;
  removed: number;
  added: number;
};

// Sola lettura, per la schermata di risultato del check-in ("confronto
// vecchio/nuovo programma", sezione 21 del design): conta le transizioni
// per esercizio realmente scritte da run_cycle_review per il ciclo
// precedente indicato, mai un riepilogo inventato lato client.
export async function getCycleExerciseTransitionsSummary(
  previousCycleId: string,
): Promise<ServiceResult<ExerciseTransitionSummary>> {
  if (!supabaseConfig.isConfigured || !supabase) {
    return { ok: true, data: { kept: 0, replaced: 0, progressed: 0, regressed: 0, removed: 0, added: 0 } };
  }

  const { data, error } = await supabase
    .from('client_cycle_exercise_transitions')
    .select('action')
    .eq('previous_cycle_id', previousCycleId);

  if (error) {
    if (__DEV__) console.warn('AUTO_PROGRAM_TRANSITIONS_READ_ERROR', error.message);
    return { ok: false, message: GENERIC_ERROR };
  }

  const summary: ExerciseTransitionSummary = { kept: 0, replaced: 0, progressed: 0, regressed: 0, removed: 0, added: 0 };
  for (const row of data ?? []) {
    const action = row.action as keyof ExerciseTransitionSummary;
    if (action in summary) summary[action] += 1;
  }
  return { ok: true, data: summary };
}
