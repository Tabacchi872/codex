import type { Session } from '@supabase/supabase-js';

import { generateCoachCode, normalizeCoachCode } from './coach-code';
import { getSupabaseClientStatus, supabase } from './supabase';

import type { CoachBillingProfile } from '@/types/superadmin';

// Livello reale di autenticazione/registrazione sopra Supabase Auth + Postgres
// (schema in docs/SUPABASE_SCHEMA.sql). Nessuna funzione qui lancia mai
// un'eccezione non gestita: se Supabase non e' configurato (env mancanti),
// ogni funzione ritorna { ok: false, code: 'not_configured', message }, cosi'
// la UI (login-screen.tsx, registration-screens.tsx) puo' ricadere sul flusso
// demo locale (AsyncStorage) invece di rompersi. Vedi docs/EMAIL_SETUP.md per
// le email che Supabase Auth invia automaticamente su questi flussi.

export type AuthServiceErrorCode =
  | 'not_configured'
  | 'auth_error'
  | 'email_taken'
  | 'invalid_coach_code'
  | 'coach_not_accepting_clients'
  | 'db_error';

export type AuthServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: AuthServiceErrorCode; message: string };

export type CoachSignUpInput = {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  businessName?: string;
  billingProfile: CoachBillingProfile;
};

export type CoachSignUpData = {
  userId: string;
  coachCode: string;
  session: Session | null;
};

export type ClientSignUpInput = {
  coachCode: string;
  fullName: string;
  email: string;
  password: string;
};

export type ClientSignUpData = {
  userId: string;
  coachId: string;
  session: Session | null;
};

export type SignInData = {
  session: Session;
  role: 'superadmin' | 'coach' | 'cliente';
  fullName: string | null;
};

const NOT_CONFIGURED_MESSAGE =
  'Supabase non e\' configurato su questo ambiente (mancano EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY). Usa il login/registrazione locale oppure configura le variabili in mobile/.env.';

function notConfigured<T>(): AuthServiceResult<T> {
  return { ok: false, code: 'not_configured', message: NOT_CONFIGURED_MESSAGE };
}

function isReady() {
  return getSupabaseClientStatus().ready && supabase !== null;
}

export async function signUpCoach(input: CoachSignUpInput): Promise<AuthServiceResult<CoachSignUpData>> {
  if (!isReady() || !supabase) return notConfigured();

  const email = input.email.trim().toLowerCase();
  // role/full_name/phone in user_metadata: letti dal trigger public.handle_new_user
  // (docs/SUPABASE_SCHEMA.sql) che crea la riga profiles al posto nostro, con
  // privilegi security definer che bypassano la RLS su quella tabella.
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { role: 'coach', full_name: input.fullName.trim(), phone: input.phone?.trim() || null },
    },
  });
  if (signUpError) {
    return { ok: false, code: mapAuthErrorCode(signUpError.message), message: signUpError.message };
  }
  const userId = signUpData.user?.id;
  if (!userId) {
    return { ok: false, code: 'auth_error', message: 'Registrazione non riuscita: utente non creato.' };
  }

  const { error: coachProfileError } = await supabase.from('coach_profiles').insert({
    user_id: userId,
    business_name: input.businessName?.trim() || null,
    billing_status: 'trial',
  });
  if (coachProfileError) {
    return { ok: false, code: 'db_error', message: `Errore creazione profilo attivita': ${coachProfileError.message}` };
  }

  const billing = input.billingProfile;
  const { error: billingError } = await supabase.from('billing_profiles').insert({
    coach_id: userId,
    subject_type: billing.subjectType,
    legal_name: billing.legalName,
    vat_number: billing.vatNumber || null,
    fiscal_code: billing.fiscalCode || null,
    address: billing.address || null,
    postal_code: billing.postalCode || null,
    city: billing.city || null,
    province: billing.province || null,
    country: billing.country,
    pec: billing.pec || null,
    sdi_code: billing.sdiCode || null,
    billing_email: billing.billingEmail,
  });
  if (billingError) {
    return { ok: false, code: 'db_error', message: `Errore creazione dati fatturazione: ${billingError.message}` };
  }

  const coachCode = await insertUniqueCoachCode(userId);
  if (!coachCode) {
    return { ok: false, code: 'db_error', message: 'Impossibile generare un codice coach univoco. Riprova.' };
  }

  return { ok: true, data: { userId, coachCode, session: signUpData.session } };
}

async function insertUniqueCoachCode(coachId: string, attempts = 5): Promise<string | null> {
  if (!supabase) return null;

  for (let i = 0; i < attempts; i += 1) {
    const candidate = generateCoachCode();
    const { error } = await supabase.from('registration_codes').insert({
      coach_id: coachId,
      code: candidate,
      status: 'active',
    });
    if (!error) return candidate;
    // Codice unique-constraint gia' esistente: riprova con un nuovo codice.
    if (!error.message.toLowerCase().includes('duplicate')) return null;
  }
  return null;
}

export async function signUpClientWithCoachCode(
  input: ClientSignUpInput,
): Promise<AuthServiceResult<ClientSignUpData>> {
  if (!isReady() || !supabase) return notConfigured();

  // Normalizzazione esplicita (trim + uppercase, coerente con normalizeCoachCode).
  const normalizedCode = normalizeCoachCode(input.coachCode);

  // IMPORTANTE: la lista colonne di .select() non deve contenere spazi dopo le
  // virgole ("id, coach_id" invece di "id,coach_id"). Con spazi, la query string
  // costruita da postgrest-js puo' risultare non correttamente codificata sul
  // networking nativo React Native/Expo (funziona su fetch browser, non altrove),
  // causando "Invalid path specified in request URL". Stesso motivo per cui il
  // filtro status='active' e' ora nella query stessa invece di un controllo dopo.
  const { data: codeRow, error: codeError } = await supabase
    .from('registration_codes')
    .select('id,coach_id,code,status,max_uses,used_count,expires_at')
    .eq('code', normalizedCode)
    .eq('status', 'active')
    .maybeSingle();

  if (codeError) {
    return { ok: false, code: 'db_error', message: `Errore verifica codice coach: ${codeError.message}` };
  }
  if (!codeRow) {
    return { ok: false, code: 'invalid_coach_code', message: 'Codice coach non valido.' };
  }
  if (codeRow.expires_at && new Date(codeRow.expires_at).getTime() < Date.now()) {
    return { ok: false, code: 'invalid_coach_code', message: 'Questo codice coach e\' scaduto.' };
  }
  if (codeRow.max_uses !== null && codeRow.used_count >= codeRow.max_uses) {
    return {
      ok: false,
      code: 'coach_not_accepting_clients',
      message: 'Il coach ha raggiunto il limite di registrazioni per questo codice.',
    };
  }

  // coach_profiles non ha una colonna client_limit/coach_id: la chiave e' user_id
  // (references profiles(id)) e il limite clienti reale resta su
  // registration_codes.max_uses/used_count (vedi docs/DECISIONS.md, Fase 1).
  const { data: coachProfile, error: coachProfileError } = await supabase
    .from('coach_profiles')
    .select('billing_status')
    .eq('user_id', codeRow.coach_id)
    .maybeSingle();
  if (coachProfileError) {
    return { ok: false, code: 'db_error', message: `Errore verifica coach: ${coachProfileError.message}` };
  }
  if (!coachProfile || isBlockedBillingStatus(coachProfile.billing_status)) {
    return {
      ok: false,
      code: 'coach_not_accepting_clients',
      message: 'Questo coach non puo\' accettare nuove registrazioni al momento.',
    };
  }

  const email = input.email.trim().toLowerCase();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { role: 'cliente', full_name: input.fullName.trim() },
    },
  });
  if (signUpError) {
    return { ok: false, code: mapAuthErrorCode(signUpError.message), message: signUpError.message };
  }
  const userId = signUpData.user?.id;
  if (!userId) {
    return { ok: false, code: 'auth_error', message: 'Registrazione non riuscita: utente non creato.' };
  }

  const { error: clientProfileError } = await supabase.from('client_profiles').insert({
    user_id: userId,
  });
  if (clientProfileError) {
    return { ok: false, code: 'db_error', message: `Errore creazione dati cliente: ${clientProfileError.message}` };
  }

  const { error: coachClientError } = await supabase.from('coach_clients').insert({
    coach_id: codeRow.coach_id,
    client_id: userId,
    status: 'active',
    linked_by_code: normalizedCode,
  });
  if (coachClientError) {
    return { ok: false, code: 'db_error', message: `Errore collegamento al coach: ${coachClientError.message}` };
  }

  // Update diretto invece della RPC increment_registration_code_usage: piu'
  // semplice da far funzionare su un progetto Supabase reale senza dipendere
  // da una funzione SQL aggiuntiva gia' eseguita/con permessi corretti. Richiede
  // la policy registration_codes_increment_usage (docs/SUPABASE_SCHEMA.sql).
  const { error: usedCountError } = await supabase
    .from('registration_codes')
    .update({ used_count: codeRow.used_count + 1 })
    .eq('id', codeRow.id);
  if (usedCountError) {
    return { ok: false, code: 'db_error', message: `Errore aggiornamento codice coach: ${usedCountError.message}` };
  }

  return { ok: true, data: { userId, coachId: codeRow.coach_id, session: signUpData.session } };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthServiceResult<SignInData>> {
  if (!isReady() || !supabase) return notConfigured();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) {
    return { ok: false, code: mapAuthErrorCode(error.message), message: error.message };
  }
  if (!data.session) {
    return { ok: false, code: 'auth_error', message: 'Accesso non riuscito: sessione non creata.' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', data.session.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return { ok: false, code: 'db_error', message: 'Accesso riuscito ma profilo non trovato.' };
  }

  return { ok: true, data: { session: data.session, role: profile.role, fullName: profile.full_name } };
}

export async function signOut(): Promise<AuthServiceResult<null>> {
  if (!isReady() || !supabase) return { ok: true, data: null };

  const { error } = await supabase.auth.signOut();
  if (error) {
    return { ok: false, code: 'auth_error', message: error.message };
  }
  return { ok: true, data: null };
}

export async function getCurrentSession(): Promise<AuthServiceResult<Session | null>> {
  if (!isReady() || !supabase) return { ok: true, data: null };

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return { ok: false, code: 'auth_error', message: error.message };
  }
  return { ok: true, data: data.session };
}

function isBlockedBillingStatus(status: string) {
  return status === 'blocked' || status === 'past_due' || status === 'canceled';
}

function mapAuthErrorCode(message: string): AuthServiceErrorCode {
  return message.toLowerCase().includes('already registered') ? 'email_taken' : 'auth_error';
}
