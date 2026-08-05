import { supabase, supabaseConfig } from './supabase';

type ServiceResult<T> = { ok: true; data: T } | { ok: false; message: string };

// Stessa condizione di public._has_active_health_data_consent() lato DB:
// riga con health_data_consent_at valorizzato e mai revocato, sulla versione
// corrente. Usata da questionario-fitness.tsx per non rimostrare la checkbox
// consenso a un cliente che l'ha gia' prestato (es. rientro in modifica da
// pending_template).
export async function hasActiveHealthDataConsent(): Promise<ServiceResult<boolean>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: false };

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user.id) {
    if (__DEV__) console.warn('HEALTH_CONSENT_STATUS_SESSION_ERROR', sessionError?.message ?? 'missing session');
    return { ok: false, message: 'Sessione scaduta: effettua di nuovo il login.' };
  }

  const { data, error } = await supabase
    .from('user_legal_acceptances')
    .select('health_data_consent_at,health_data_consent_withdrawn_at')
    .eq('user_id', sessionData.session.user.id)
    .eq('terms_version', '1.0')
    .eq('privacy_version', '1.0')
    .maybeSingle();

  if (error) {
    if (__DEV__) console.warn('HEALTH_CONSENT_STATUS_ERROR', error.message);
    return { ok: false, message: 'Non e stato possibile verificare il consenso salute.' };
  }

  return { ok: true, data: !!data?.health_data_consent_at && !data.health_data_consent_withdrawn_at };
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
