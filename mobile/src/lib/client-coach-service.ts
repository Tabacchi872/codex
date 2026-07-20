import { supabase, supabaseConfig } from './supabase';
import { normalizeCoachCode } from './coach-code';

export type AssignedCoachConnectionStatus = 'active' | 'suspended';

export type AssignedCoachSummary = {
  coachId: string;
  fullName: string | null;
  businessName: string | null;
  connectionStatus: AssignedCoachConnectionStatus;
};

type AssignedCoachRow = {
  coach_id: string;
  full_name: string | null;
  business_name: string | null;
  connection_status: string | null;
};

type ClientCoachServiceResult<T> = { ok: true; data: T } | { ok: false; message: string };

const GENERIC_LOAD_ERROR = 'Non e stato possibile caricare i dati del coach.';
const GENERIC_JOIN_ERROR = 'Non e stato possibile collegare il coach. Riprova.';

export type JoinCoachErrorCode =
  | 'INVALID_INVITE_CODE'
  | 'INACTIVE_INVITE_CODE'
  | 'COACH_CAPACITY_REACHED'
  | 'COACH_PACKAGE_INACTIVE'
  | 'CLIENT_ALREADY_ASSIGNED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export type JoinCoachResult = {
  coach: AssignedCoachSummary;
};

type JoinCoachRow = {
  success: boolean | null;
  coach_id: string | null;
  coach_name: string | null;
  business_name: string | null;
  connection_status: string | null;
  error_code: string | null;
};

export async function getMyAssignedCoach(): Promise<ClientCoachServiceResult<AssignedCoachSummary | null>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: null };

  const { data, error } = await supabase.rpc('get_my_assigned_coach');

  if (error) {
    if (__DEV__) {
      console.warn('GET_MY_ASSIGNED_COACH_FAILED', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
    }
    return { ok: false, message: GENERIC_LOAD_ERROR };
  }

  const rows = Array.isArray(data) ? (data as AssignedCoachRow[]) : [];
  const row = rows[0];
  if (!row || !row.coach_id) return { ok: true, data: null };
  if (row.connection_status !== 'active' && row.connection_status !== 'suspended') {
    return { ok: true, data: null };
  }

  return {
    ok: true,
    data: {
      coachId: row.coach_id,
      fullName: row.full_name?.trim() || null,
      businessName: row.business_name?.trim() || null,
      connectionStatus: row.connection_status,
    },
  };
}

export function getAssignedCoachStatusLabel(status: AssignedCoachConnectionStatus) {
  return status === 'suspended' ? 'Sospeso temporaneamente' : 'Attivo';
}

export async function joinCoachByInviteCode(code: string): Promise<ClientCoachServiceResult<JoinCoachResult>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: false, message: GENERIC_JOIN_ERROR };

  const normalizedCode = normalizeCoachCode(code);
  if (!normalizedCode) return { ok: false, message: mapJoinCoachError('INVALID_INVITE_CODE') };

  const { data, error } = await supabase.rpc('join_coach_by_invite_code', { p_code: normalizedCode });

  if (error) {
    if (__DEV__) {
      console.warn('JOIN_COACH_BY_INVITE_CODE_FAILED', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
    }
    return { ok: false, message: mapJoinCoachError('NETWORK_ERROR') };
  }

  const rows = Array.isArray(data) ? (data as JoinCoachRow[]) : [];
  const row = rows[0];
  if (!row?.success) {
    return { ok: false, message: mapJoinCoachError(row?.error_code) };
  }

  if (!row.coach_id || row.connection_status !== 'active') {
    if (__DEV__) console.warn('JOIN_COACH_BY_INVITE_CODE_INVALID_RESPONSE', row);
    return { ok: false, message: GENERIC_JOIN_ERROR };
  }

  return {
    ok: true,
    data: {
      coach: {
        coachId: row.coach_id,
        fullName: row.coach_name?.trim() || null,
        businessName: row.business_name?.trim() || null,
        connectionStatus: 'active',
      },
    },
  };
}

function mapJoinCoachError(code: string | null | undefined) {
  const normalized = (code ?? 'UNKNOWN').toUpperCase() as JoinCoachErrorCode;
  switch (normalized) {
    case 'INVALID_INVITE_CODE':
      return 'Il codice inserito non e valido.';
    case 'INACTIVE_INVITE_CODE':
      return 'Questo codice invito non e piu attivo.';
    case 'COACH_CAPACITY_REACHED':
      return 'Il coach ha raggiunto il numero massimo di clienti.';
    case 'COACH_PACKAGE_INACTIVE':
      return 'Il coach al momento non puo accettare nuovi clienti.';
    case 'CLIENT_ALREADY_ASSIGNED':
      return 'Il tuo account e gia collegato a un coach.';
    case 'NETWORK_ERROR':
      return 'Connessione non disponibile. Riprova.';
    default:
      return GENERIC_JOIN_ERROR;
  }
}
