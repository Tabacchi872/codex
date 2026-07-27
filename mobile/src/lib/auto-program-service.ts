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

// Nessun filtro esplicito client_id: la RLS (client_program_cycles_owner_read)
// decide da sola, stesso pattern di listWorkoutPlansForCurrentUser
// (workout-plan-service.ts).
export async function getMyActiveProgramCycle(): Promise<ServiceResult<ActiveProgramCycle | null>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: null };

  const { data, error } = await supabase
    .from('client_program_cycles')
    .select('id,status,cycle_number,source,decision_reason,template_id,started_at,review_due_at,workout_templates(name)')
    .in('status', ['active', 'pending_review'])
    .order('created_at', { ascending: false })
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
