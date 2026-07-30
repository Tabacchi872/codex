import { APP_VERSION, LEGAL_CONFIG } from '@/constants/app-info';

import { supabase, supabaseConfig } from './supabase';

type ServiceResult<T> = { ok: true; data: T } | { ok: false; message: string };

export type LegalAcceptanceStatus = {
  accepted: boolean;
};

export type LegalAcceptanceRecordResult = {
  accepted: boolean;
  termsVersion: string;
  privacyVersion: string;
};

export type LegalSessionCheckResult =
  | { ok: true; refreshed: boolean; userId: string }
  | { ok: false; refreshed: boolean; message: string };

export const CURRENT_TERMS_VERSION = LEGAL_CONFIG.termsVersion;
export const CURRENT_PRIVACY_VERSION = LEGAL_CONFIG.privacyVersion;

export function getLegalAcceptanceMetadata() {
  return {
    terms_accepted: true,
    privacy_acknowledged: true,
    terms_version: CURRENT_TERMS_VERSION,
    privacy_version: CURRENT_PRIVACY_VERSION,
    locale: getDeviceLocale(),
    app_version: APP_VERSION,
  };
}

export async function getCurrentLegalAcceptanceStatus(): Promise<ServiceResult<LegalAcceptanceStatus>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: { accepted: true } };

  const session = await ensureLegalSupabaseSession();
  if (!session.ok) {
    return { ok: false, message: session.message };
  }

  const { data, error } = await supabase
    .from('user_legal_acceptances')
    .select('id')
    .eq('terms_version', CURRENT_TERMS_VERSION)
    .eq('privacy_version', CURRENT_PRIVACY_VERSION)
    .maybeSingle();

  if (error) {
    if (__DEV__) console.warn('LEGAL_ACCEPTANCE_STATUS_ERROR', error.message);
    return { ok: false, message: 'Non e stato possibile verificare le accettazioni legali.' };
  }

  return { ok: true, data: { accepted: Boolean(data?.id) } };
}

export async function recordCurrentLegalAcceptance(): Promise<ServiceResult<LegalAcceptanceRecordResult>> {
  if (!supabaseConfig.isConfigured || !supabase) {
    return { ok: true, data: { accepted: true, termsVersion: CURRENT_TERMS_VERSION, privacyVersion: CURRENT_PRIVACY_VERSION } };
  }

  const session = await ensureLegalSupabaseSession();
  if (!session.ok) {
    if (__DEV__) console.warn('LEGAL_ACCEPTANCE_RECORD_SESSION_UNAVAILABLE', { refreshed: session.refreshed });
    return { ok: false, message: session.message };
  }

  const params = {
    p_terms_version: CURRENT_TERMS_VERSION,
    p_privacy_version: CURRENT_PRIVACY_VERSION,
    p_locale: getDeviceLocale(),
    p_app_version: APP_VERSION,
  };

  if (__DEV__) {
    console.info('LEGAL_ACCEPTANCE_RECORD_START', {
      rpc: 'record_current_legal_acceptance',
      params,
      hasSessionUser: true,
      sessionRefreshed: session.refreshed,
    });
  }

  let { data, error } = await supabase.rpc('record_current_legal_acceptance', params);

  if (error && isAuthExpiredRpcError(error)) {
    if (__DEV__) console.warn('LEGAL_ACCEPTANCE_RECORD_AUTH_RETRY', sanitizeSupabaseError(error));
    const refreshed = await ensureLegalSupabaseSession({ forceRefresh: true });
    if (!refreshed.ok) {
      return { ok: false, message: refreshed.message };
    }
    const retry = await supabase.rpc('record_current_legal_acceptance', params);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (__DEV__) console.warn('LEGAL_ACCEPTANCE_RECORD_ERROR', sanitizeSupabaseError(error));
    return { ok: false, message: describeLegalAcceptanceError(error) };
  }

  const status = await getCurrentLegalAcceptanceStatus();
  if (!status.ok) return { ok: false, message: status.message };
  if (!status.data.accepted) {
    if (__DEV__) console.warn('LEGAL_ACCEPTANCE_RECORD_NOT_CONFIRMED', { rpcData: data });
    return { ok: false, message: 'Accettazione non confermata dal server. Riprova.' };
  }

  const rpcResult = normalizeLegalAcceptanceRpcResult(data);
  if (__DEV__) console.info('LEGAL_ACCEPTANCE_RECORD_SUCCESS', rpcResult);

  return {
    ok: true,
    data: {
      accepted: true,
      termsVersion: rpcResult?.termsVersion ?? CURRENT_TERMS_VERSION,
      privacyVersion: rpcResult?.privacyVersion ?? CURRENT_PRIVACY_VERSION,
    },
  };
}

export async function recordHealthDataConsent(): Promise<ServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: null };

  const { error } = await supabase.rpc('record_health_data_consent');
  if (error) {
    if (__DEV__) console.warn('HEALTH_CONSENT_RECORD_ERROR', error.message);
    if (
      error.message.includes('record_health_data_consent') ||
      error.message.includes('Could not find the function') ||
      error.message.includes('schema cache')
    ) {
      return { ok: false, message: "Il servizio non e' ancora disponibile. Riprova dopo l'aggiornamento." };
    }
    return { ok: false, message: 'Non e stato possibile registrare il consenso salute. Riprova.' };
  }

  return { ok: true, data: null };
}

export async function withdrawHealthDataConsent(): Promise<ServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: null };

  const { error } = await supabase.rpc('withdraw_health_data_consent');
  if (error) {
    if (__DEV__) console.warn('HEALTH_CONSENT_WITHDRAW_ERROR', error.message);
    return { ok: false, message: 'Non e stato possibile ritirare il consenso salute. Riprova.' };
  }

  return { ok: true, data: null };
}

export async function ensureLegalSupabaseSession(options: { forceRefresh?: boolean } = {}): Promise<LegalSessionCheckResult> {
  if (!supabaseConfig.isConfigured || !supabase) {
    return { ok: false, refreshed: false, message: 'Sessione scaduta: effettua di nuovo il login.' };
  }

  if (!options.forceRefresh) {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      if (__DEV__) console.warn('LEGAL_SESSION_GET_ERROR', sanitizeSupabaseError(error));
    } else if (data.session?.user.id) {
      return { ok: true, refreshed: false, userId: data.session.user.id };
    }
  }

  const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    if (__DEV__) console.warn('LEGAL_SESSION_REFRESH_ERROR', sanitizeSupabaseError(refreshError));
    return { ok: false, refreshed: true, message: 'Sessione scaduta: effettua di nuovo il login.' };
  }
  if (!refreshedData.session?.user.id) {
    if (__DEV__) console.warn('LEGAL_SESSION_REFRESH_EMPTY');
    return { ok: false, refreshed: true, message: 'Sessione scaduta: effettua di nuovo il login.' };
  }

  return { ok: true, refreshed: true, userId: refreshedData.session.user.id };
}

function getDeviceLocale() {
  if (typeof Intl !== 'undefined') {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'it-IT';
  }
  return 'it-IT';
}

function normalizeLegalAcceptanceRpcResult(data: unknown): LegalAcceptanceRecordResult | null {
  if (typeof data === 'string') {
    return {
      accepted: true,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    };
  }
  const first = Array.isArray(data) ? data[0] : data;
  if (!first || typeof first !== 'object') return null;
  const row = first as Record<string, unknown>;
  return {
    accepted: row.accepted === true,
    termsVersion: typeof row.terms_version === 'string' ? row.terms_version : CURRENT_TERMS_VERSION,
    privacyVersion: typeof row.privacy_version === 'string' ? row.privacy_version : CURRENT_PRIVACY_VERSION,
  };
}

function describeLegalAcceptanceError(error: { message?: string; code?: string; details?: string | null; hint?: string | null }) {
  const message = error.message ?? '';
  const code = error.code ?? '';
  const details = error.details ?? '';
  const hint = error.hint ?? '';
  const haystack = `${code} ${message} ${details} ${hint}`;

  if (haystack.includes('NOT_AUTHENTICATED') || code === '42501') {
    return 'Sessione scaduta: effettua di nuovo il login.';
  }
  if (haystack.includes('LEGAL_ACCEPTANCE_VERSION_INVALID')) {
    return "La versione dei documenti legali non e' aggiornata. Aggiorna l'app e riprova.";
  }
  if (
    haystack.includes('record_current_legal_acceptance') ||
    haystack.includes('Could not find the function') ||
    haystack.includes('schema cache') ||
    code === 'PGRST202'
  ) {
    return "Il servizio non e' ancora disponibile. Riprova dopo l'aggiornamento.";
  }
  return 'Non e stato possibile registrare le accettazioni legali. Riprova.';
}

function isAuthExpiredRpcError(error: { message?: string; code?: string; details?: string | null; hint?: string | null; status?: number }) {
  const message = error.message ?? '';
  const code = error.code ?? '';
  const details = error.details ?? '';
  const hint = error.hint ?? '';
  const haystack = `${code} ${message} ${details} ${hint}`.toLowerCase();
  return (
    error.status === 401 ||
    code === 'PGRST301' ||
    haystack.includes('jwt') ||
    haystack.includes('not_authenticated') ||
    haystack.includes('invalid claim') ||
    haystack.includes('token')
  );
}

function sanitizeSupabaseError(error: { message?: string; code?: string; details?: string | null; hint?: string | null }) {
  return {
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}
