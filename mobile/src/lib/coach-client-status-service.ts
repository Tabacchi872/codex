import { supabase, supabaseConfig } from './supabase';

type CoachClientStatusResult = { ok: true } | { ok: false; message: string };

const GENERIC_STATUS_ERROR = 'Non e stato possibile aggiornare lo stato del cliente. Riprova.';
const NOT_CONFIGURED_ERROR = 'Servizio non disponibile. Riprova.';

export async function suspendClient(clientId: string, reason = 'In attesa di rinnovo'): Promise<CoachClientStatusResult> {
  return callStatusRpc('suspend_assigned_client', { p_client_id: clientId, p_reason: reason });
}

export async function reactivateClient(clientId: string): Promise<CoachClientStatusResult> {
  return callStatusRpc('reactivate_assigned_client', { p_client_id: clientId });
}

export async function removeClient(clientId: string): Promise<CoachClientStatusResult> {
  return callStatusRpc('remove_assigned_client', { p_client_id: clientId });
}

async function callStatusRpc(functionName: string, params: Record<string, string>): Promise<CoachClientStatusResult> {
  if (!supabaseConfig.isConfigured || !supabase) {
    return { ok: false, message: NOT_CONFIGURED_ERROR };
  }

  const { error } = await supabase.rpc(functionName, params);
  if (error) {
    if (__DEV__) {
      console.error('COACH_CLIENT_STATUS_RPC_FAILED', {
        operation: functionName,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
    }
    return { ok: false, message: mapStatusError(error.message) };
  }

  return { ok: true };
}

function mapStatusError(message: string) {
  const normalized = message.toUpperCase();
  if (normalized.includes('NOT_AUTHENTICATED')) {
    return 'Sessione non valida. Accedi nuovamente.';
  }
  if (normalized.includes('NOT_A_COACH') || normalized.includes('FORBIDDEN')) {
    return 'Questa operazione e riservata ai coach.';
  }
  if (normalized.includes('CLIENT_NOT_ASSIGNED') || normalized.includes('NOT_FOUND')) {
    return 'Questo cliente non e assegnato al tuo profilo.';
  }
  if (normalized.includes('INVALID_STATUS_TRANSITION') || normalized.includes('INVALID_TRANSITION')) {
    return 'Lo stato del cliente non consente questa operazione.';
  }
  if (normalized.includes('COACH_PACKAGE_INACTIVE')) {
    return 'Il pacchetto coach non e attivo.';
  }
  if (normalized.includes('NETWORK')) {
    return 'Connessione non disponibile. Riprova.';
  }
  return GENERIC_STATUS_ERROR;
}
