import { generateCoachCode } from './coach-code';
import { supabase, supabaseConfig } from './supabase';

import type { AppBillingStatus } from '@/types/superadmin';

// Scrittura reale superadmin -> Supabase per un coach registrato (2026-07-12,
// prima non collegata: vedi docs/DECISIONS.md, voce BUG-011). Nessuna nuova
// policy RLS necessaria: coach_profiles_superadmin_all/profiles_superadmin_all/
// registration_codes_superadmin_all/user_subscriptions_superadmin_all
// (docs/SUPABASE_SCHEMA.sql) gia' concedono pieno accesso a un utente con
// profiles.role='superadmin' autenticato — qui si aggiunge solo il codice
// app che le usa davvero, non nuove regole di sicurezza.
//
// Deliberatamente FUORI scope (nessuna funzione qui la tocca):
// - email del coach: cambiarla richiede l'Auth admin API (service role), mai
//   disponibile lato mobile — coerente con come funziona gia' il resto
//   dell'app (cambio password/credenziali provvisorie passano da una Edge
//   Function, mai da una scrittura diretta client-side).
// - "Piano"/"Limite clienti (override)"/"Clienti usati"/periodo app legacy:
//   restano concetti locali/demo (plans/coach_billing, mai collegati a un
//   coach Supabase reale, vedi docs/DECISIONS.md) — il vero abbonamento del
//   coach e' assignCoachPackage/cancelCoachSubscription sotto.

export type CoachAdminServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 'not_configured' | 'db_error'; message: string };

const NOT_CONFIGURED_MESSAGE = 'Supabase non e\' configurato su questo ambiente: impossibile modificare il coach.';

function notConfigured<T>(): CoachAdminServiceResult<T> {
  return { ok: false, code: 'not_configured', message: NOT_CONFIGURED_MESSAGE };
}

export type CoachProfileUpdateInput = {
  fullName: string;
  businessName: string;
  phone: string;
};

export async function updateCoachProfile(coachId: string, input: CoachProfileUpdateInput): Promise<CoachAdminServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ full_name: input.fullName.trim() || null, phone: input.phone.trim() || null })
    .eq('id', coachId);
  if (profileError) {
    return { ok: false, code: 'db_error', message: `Errore aggiornamento profilo: ${profileError.message}` };
  }

  const { error: coachProfileError } = await supabase
    .from('coach_profiles')
    .update({ business_name: input.businessName.trim() || null })
    .eq('user_id', coachId);
  if (coachProfileError) {
    return { ok: false, code: 'db_error', message: `Errore aggiornamento profilo attivita': ${coachProfileError.message}` };
  }

  return { ok: true, data: null };
}

export async function setCoachBillingStatus(coachId: string, status: AppBillingStatus): Promise<CoachAdminServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { error } = await supabase.from('coach_profiles').update({ billing_status: status }).eq('user_id', coachId);
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore aggiornamento stato pagamento: ${error.message}` };
  }
  return { ok: true, data: null };
}

// Disattiva ogni codice attualmente attivo del coach e ne crea uno nuovo,
// stesso comportamento del regenerateCoachCode locale demo (superadmin-store)
// ma scritto davvero su registration_codes.
export async function regenerateCoachRegistrationCode(coachId: string): Promise<CoachAdminServiceResult<string>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data: existingCodes, error: readError } = await supabase
    .from('registration_codes')
    .select('id,code,status')
    .eq('coach_id', coachId);
  if (readError) {
    return { ok: false, code: 'db_error', message: `Errore lettura codici esistenti: ${readError.message}` };
  }

  const activeIds = (existingCodes ?? []).filter((row) => row.status === 'active').map((row) => row.id);
  if (activeIds.length > 0) {
    const { error: disableError } = await supabase.from('registration_codes').update({ status: 'disabled' }).in('id', activeIds);
    if (disableError) {
      return { ok: false, code: 'db_error', message: `Errore disattivazione codice precedente: ${disableError.message}` };
    }
  }

  const existingCodeStrings = (existingCodes ?? []).map((row) => row.code);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateCoachCode(existingCodeStrings);
    const { error: insertError } = await supabase
      .from('registration_codes')
      .insert({ coach_id: coachId, code: candidate, status: 'active' });
    if (!insertError) return { ok: true, data: candidate };
    if (!insertError.message.toLowerCase().includes('duplicate')) {
      return { ok: false, code: 'db_error', message: `Errore creazione nuovo codice: ${insertError.message}` };
    }
  }
  return { ok: false, code: 'db_error', message: 'Impossibile generare un nuovo codice univoco. Riprova.' };
}

export async function setCoachRegistrationCodeActive(coachId: string, active: boolean): Promise<CoachAdminServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data: codes, error: readError } = await supabase
    .from('registration_codes')
    .select('id,created_at')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (readError) {
    return { ok: false, code: 'db_error', message: `Errore lettura codice: ${readError.message}` };
  }
  const target = (codes ?? [])[0];
  if (!target) {
    return { ok: false, code: 'db_error', message: 'Nessun codice trovato per questo coach.' };
  }

  const { error } = await supabase
    .from('registration_codes')
    .update({ status: active ? 'active' : 'disabled' })
    .eq('id', target.id);
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore aggiornamento codice: ${error.message}` };
  }
  return { ok: true, data: null };
}

// Crea una nuova riga user_subscriptions 'active' per il coach col pacchetto
// scelto (starts_at=ora, expires_at calcolata da duration_value/duration_unit
// del pacchetto). Il trigger user_subscriptions_single_active (docs/
// SUPABASE_SCHEMA.sql) marca automaticamente 'canceled' l'eventuale
// abbonamento attivo precedente: nessun accumulo di slot, il pacchetto
// assegnato ora e' sempre quello che conta. payment_provider='superadmin_manual'
// per distinguere sempre queste righe da un futuro pagamento reale automatico.
export async function assignCoachPackage(coachId: string, packageId: string): Promise<CoachAdminServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data: pkg, error: pkgError } = await supabase
    .from('subscription_packages')
    .select('duration_value,duration_unit,target_role')
    .eq('id', packageId)
    .maybeSingle();
  if (pkgError) {
    return { ok: false, code: 'db_error', message: `Errore lettura pacchetto: ${pkgError.message}` };
  }
  if (!pkg || pkg.target_role !== 'coach') {
    return { ok: false, code: 'db_error', message: 'Pacchetto non valido per un coach.' };
  }

  const startsAt = new Date();
  const expiresAt = new Date(startsAt);
  if (pkg.duration_unit === 'days') {
    expiresAt.setDate(expiresAt.getDate() + pkg.duration_value);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + pkg.duration_value);
  }

  const { error } = await supabase.from('user_subscriptions').insert({
    user_id: coachId,
    package_id: packageId,
    status: 'active',
    starts_at: startsAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    payment_provider: 'superadmin_manual',
  });
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore assegnazione pacchetto: ${error.message}` };
  }
  return { ok: true, data: null };
}

export async function cancelCoachSubscription(subscriptionId: string): Promise<CoachAdminServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { error } = await supabase.from('user_subscriptions').update({ status: 'canceled' }).eq('id', subscriptionId);
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore annullamento abbonamento: ${error.message}` };
  }
  return { ok: true, data: null };
}
