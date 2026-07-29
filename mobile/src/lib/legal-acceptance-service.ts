import { APP_VERSION, LEGAL_CONFIG } from '@/constants/app-info';

import { supabase, supabaseConfig } from './supabase';

type ServiceResult<T> = { ok: true; data: T } | { ok: false; message: string };

export type LegalAcceptanceStatus = {
  accepted: boolean;
};

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

export async function recordCurrentLegalAcceptance(): Promise<ServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: null };

  const { error } = await supabase.rpc('record_current_legal_acceptance', {
    p_terms_version: CURRENT_TERMS_VERSION,
    p_privacy_version: CURRENT_PRIVACY_VERSION,
    p_locale: getDeviceLocale(),
    p_app_version: APP_VERSION,
  });

  if (error) {
    if (__DEV__) console.warn('LEGAL_ACCEPTANCE_RECORD_ERROR', error.message);
    return { ok: false, message: 'Non e stato possibile registrare le accettazioni legali. Riprova.' };
  }

  return { ok: true, data: null };
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

function getDeviceLocale() {
  if (typeof Intl !== 'undefined') {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'it-IT';
  }
  return 'it-IT';
}
