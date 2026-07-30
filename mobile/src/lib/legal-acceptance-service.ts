import { supabase, supabaseConfig } from './supabase';

type ServiceResult<T> = { ok: true; data: T } | { ok: false; message: string };

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
