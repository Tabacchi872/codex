import { FunctionsHttpError, type Session } from '@supabase/supabase-js';

import { generateCoachCode, normalizeCoachCode } from './coach-code';
import { getWebRedirectUrl } from './redirect-url';
import { getSupabaseClientStatus, supabase } from './supabase';

import type { Client } from '@/types/client';
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
  | 'email_not_confirmed'
  | 'invalid_coach_code'
  | 'coach_not_accepting_clients'
  | 'subscription_required'
  | 'client_limit_reached'
  | 'no_client_profile'
  | 'no_coach_link'
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
  // null quando "Confirm email" e' attivo e non esiste ancora una sessione:
  // coach_profiles/billing_profiles/registration_codes non possono essere
  // scritti (RLS richiede auth.uid(), che senza sessione e' null) — vengono
  // completati da ensureCoachOnboarding al primo login reale, dopo la conferma.
  coachCode: string | null;
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
  // Impostato dalla Edge Function send-temporary-credentials dopo un invio
  // credenziali provvisorie. Se true, login-screen.tsx deve bloccare
  // l'accesso normale e AuthGate deve mostrare SupabaseChangePasswordScreen
  // prima di lasciar entrare l'utente.
  mustChangePassword: boolean;
};

export type ClientProfileData = {
  client: Client;
  coachBusinessName: string | null;
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
  if (!isReady() || !supabase) {
    if (__DEV__) console.warn('SIGNUP_COACH_NOT_CONFIGURED', getSupabaseClientStatus());
    return notConfigured();
  }

  // Tutta la funzione e' avvolta in try/catch: supabase.auth.signUp() e le
  // .insert() sotto normalmente ritornano { error } senza lanciare, ma un
  // fallimento di rete/polyfill (es. su Expo web/nativo) puo' far esplodere
  // una fetch prima ancora di arrivare a un error object gestito — senza
  // questo try/catch, l'eccezione risalirebbe non gestita fino al chiamante
  // (registration-screens.tsx), lasciando il bottone bloccato su "Creazione
  // account..." senza alcun errore visibile. Qui viene sempre convertita in
  // un AuthServiceResult leggibile.
  try {
    const email = input.email.trim().toLowerCase();
    const businessName = input.businessName?.trim() || null;
    const billing = input.billingProfile;
    // role/full_name/phone in user_metadata: letti dal trigger public.handle_new_user
    // (docs/SUPABASE_SCHEMA.sql) che crea la riga profiles al posto nostro, con
    // privilegi security definer che bypassano la RLS su quella tabella.
    // business_name/billing_profile restano anch'essi in user_metadata: se
    // "Confirm email" e' attivo, gli insert sotto non possono avvenire subito
    // (nessuna sessione => RLS blocca), quindi questi dati devono sopravvivere
    // fino al primo login reale, dove ensureCoachOnboarding li rilegge da li'.
    // emailRedirectTo: window.location.origin su web (nessuna porta vecchia
    // hardcodata), undefined su nativo (Supabase usa la Site URL configurata).
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        data: {
          role: 'coach',
          full_name: input.fullName.trim(),
          phone: input.phone?.trim() || null,
          business_name: businessName,
          billing_profile: billing,
        },
        emailRedirectTo: getWebRedirectUrl('/'),
      },
    });
    if (signUpError) {
      if (__DEV__) console.error('SIGNUP_COACH_ERROR', signUpError);
      return { ok: false, code: mapAuthErrorCode(signUpError.message), message: signUpError.message };
    }
    const userId = signUpData.user?.id;
    if (!userId) {
      if (__DEV__) console.error('SIGNUP_COACH_ERROR', 'signUp ok ma nessun user id nella risposta', signUpData);
      return { ok: false, code: 'auth_error', message: 'Registrazione non riuscita: utente non creato.' };
    }

    if (!signUpData.session) {
      return { ok: true, data: { userId, coachCode: null, session: null } };
    }

    const onboarding = await completeCoachOnboarding(userId, businessName, billing);
    if (!onboarding.ok) {
      if (__DEV__) console.error('SIGNUP_COACH_ERROR', onboarding);
      return onboarding;
    }

    return { ok: true, data: { userId, coachCode: onboarding.data.coachCode, session: signUpData.session } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (__DEV__) console.error('SIGNUP_COACH_ERROR', err);
    return { ok: false, code: 'auth_error', message: `Errore imprevisto durante la registrazione: ${message}` };
  }
}

// Crea (se mancano) coach_profiles/billing_profiles/registration_codes per un
// coach gia' autenticato. Usata sia da signUpCoach quando la sessione esiste
// subito (Confirm email disattivato), sia da ensureCoachOnboarding al primo
// login reale (Confirm email attivo: questi insert non erano potuti avvenire
// in fase di registrazione, vedi sopra). Idempotente: non duplica righe se
// eseguita piu' volte.
async function completeCoachOnboarding(
  userId: string,
  businessName: string | null,
  billing: CoachBillingProfile,
): Promise<AuthServiceResult<{ coachCode: string }>> {
  if (!supabase) return notConfigured();

  const { data: existingCoachProfile, error: coachProfileReadError } = await supabase
    .from('coach_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (coachProfileReadError) {
    return { ok: false, code: 'db_error', message: `Errore verifica profilo attivita': ${coachProfileReadError.message}` };
  }
  if (!existingCoachProfile) {
    const { error: coachProfileError } = await supabase.from('coach_profiles').insert({
      user_id: userId,
      business_name: businessName,
      billing_status: 'trial',
    });
    if (coachProfileError) {
      return { ok: false, code: 'db_error', message: `Errore creazione profilo attivita': ${coachProfileError.message}` };
    }
  }

  const { data: existingBilling, error: billingReadError } = await supabase
    .from('billing_profiles')
    .select('id')
    .eq('coach_id', userId)
    .maybeSingle();
  if (billingReadError) {
    return { ok: false, code: 'db_error', message: `Errore verifica dati fatturazione: ${billingReadError.message}` };
  }
  if (!existingBilling) {
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
  }

  const { data: existingCode, error: existingCodeError } = await supabase
    .from('registration_codes')
    .select('code')
    .eq('coach_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (existingCodeError) {
    return { ok: false, code: 'db_error', message: `Errore verifica codice coach: ${existingCodeError.message}` };
  }
  if (existingCode) {
    return { ok: true, data: { coachCode: existingCode.code } };
  }

  const coachCode = await insertUniqueCoachCode(userId);
  if (!coachCode) {
    return { ok: false, code: 'db_error', message: 'Impossibile generare un codice coach univoco. Riprova.' };
  }

  return { ok: true, data: { coachCode } };
}

// Fallback chiamato dopo login (login-screen.tsx) se il coach si era
// registrato con "Confirm email" attivo: al momento della registrazione non
// esisteva ancora una sessione, quindi coach_profiles/billing_profiles/
// registration_codes potrebbero non essere mai stati creati. business_name/
// billing_profile vengono riletti da user_metadata (salvati li' da
// signUpCoach), non persi.
export async function ensureCoachOnboarding(
  userId: string,
  metadata: Record<string, unknown>,
): Promise<AuthServiceResult<{ coachCode: string }>> {
  if (!isReady() || !supabase) return notConfigured();

  const billing = metadata.billing_profile as CoachBillingProfile | undefined;
  if (!billing) {
    return {
      ok: false,
      code: 'db_error',
      message: 'Dati di fatturazione non trovati per completare la registrazione del coach.',
    };
  }
  const businessName = (metadata.business_name as string | null | undefined) ?? null;

  return completeCoachOnboarding(userId, businessName, billing);
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

  // Pre-check PRIMA di signUp: la RPC can_coach_accept_client (docs/
  // SUPABASE_SCHEMA.sql, sezione "Limite clienti coach") legge l'abbonamento
  // coach attivo (subscription_packages/user_subscriptions) e il conteggio
  // reale di coach_clients, rifiutando qui se manca un abbonamento attivo o
  // se il limite max_clients e' gia' raggiunto — cosi' non si crea un account
  // Supabase Auth destinato a restare non collegato al coach. Il controllo
  // atomico e definitivo (contro race condition) resta comunque lato server
  // in _link_client_to_coach, chiamato dopo signUp (vedi completeClientOnboarding
  // sotto): questo e' solo un rifiuto anticipato per una UX onesta.
  const capacityCheck = await supabase
    .rpc('can_coach_accept_client', { p_coach_id: codeRow.coach_id })
    .maybeSingle<{ allowed: boolean; reason: string | null }>();
  if (capacityCheck.error) {
    return { ok: false, code: 'db_error', message: `Errore verifica disponibilita' coach: ${capacityCheck.error.message}` };
  }
  if (capacityCheck.data && !capacityCheck.data.allowed) {
    if (capacityCheck.data.reason === 'subscription_required') {
      return {
        ok: false,
        code: 'subscription_required',
        message: 'Abbonamento necessario: il coach deve avere un pacchetto attivo prima di poter accettare nuovi clienti.',
      };
    }
    return {
      ok: false,
      code: 'client_limit_reached',
      message: 'Il coach ha raggiunto il limite massimo di clienti previsto dal proprio pacchetto.',
    };
  }

  const email = input.email.trim().toLowerCase();
  // coach_id/coach_code in user_metadata: se "Confirm email" e' attivo, gli
  // insert sotto non possono avvenire subito (nessuna sessione => RLS blocca
  // client_profiles/coach_clients), quindi questi dati devono sopravvivere
  // fino al primo login reale, dove ensureClientOnboarding li rilegge da li'
  // invece di richiedere di nuovo il codice coach (che a quel punto e' perso).
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { role: 'cliente', full_name: input.fullName.trim(), coach_id: codeRow.coach_id, coach_code: normalizedCode },
    },
  });
  if (signUpError) {
    return { ok: false, code: mapAuthErrorCode(signUpError.message), message: signUpError.message };
  }
  const userId = signUpData.user?.id;
  if (!userId) {
    return { ok: false, code: 'auth_error', message: 'Registrazione non riuscita: utente non creato.' };
  }

  if (!signUpData.session) {
    return { ok: true, data: { userId, coachId: codeRow.coach_id, session: null } };
  }

  const onboarding = await completeClientOnboarding(normalizedCode);
  if (!onboarding.ok) return onboarding;

  return { ok: true, data: { userId, coachId: codeRow.coach_id, session: signUpData.session } };
}

// Collega il cliente gia' autenticato al proprio coach tramite la RPC atomica
// register_client_with_code (docs/SUPABASE_SCHEMA.sql, sezione "Limite
// clienti coach"): verifica codice + abbonamento coach attivo + limite
// max_clients TUTTO lato server, con lock per-coach contro race condition —
// non piu' insert separati lato app (che non potevano garantire atomicita').
// Idempotente: se il trigger handle_new_user() ha gia' collegato il cliente
// (caso normale quando la sessione esiste subito), la RPC e' un no-op.
// Usata sia da signUpClientWithCoachCode quando la sessione esiste subito,
// sia da ensureClientOnboarding al primo login reale (Confirm email attivo).
async function completeClientOnboarding(linkedByCode: string): Promise<AuthServiceResult<null>> {
  if (!supabase) return notConfigured();
  if (!linkedByCode) {
    return { ok: false, code: 'no_coach_link', message: 'Codice coach mancante: impossibile completare il collegamento.' };
  }

  const { error } = await supabase.rpc('register_client_with_code', { p_code: linkedByCode });
  if (error) {
    return { ok: false, code: mapRegisterClientError(error.message), message: humanizeRegisterClientError(error.message) };
  }

  return { ok: true, data: null };
}

function mapRegisterClientError(message: string): AuthServiceErrorCode {
  const normalized = message.toUpperCase();
  if (normalized.includes('SUBSCRIPTION_REQUIRED')) return 'subscription_required';
  if (normalized.includes('CLIENT_LIMIT_REACHED')) return 'client_limit_reached';
  if (normalized.includes('INVALID_CODE')) return 'invalid_coach_code';
  return 'db_error';
}

function humanizeRegisterClientError(message: string): string {
  if (message.includes('SUBSCRIPTION_REQUIRED')) {
    return 'Abbonamento necessario: il coach deve avere un pacchetto attivo prima di poter accettare nuovi clienti.';
  }
  if (message.includes('CLIENT_LIMIT_REACHED')) {
    return 'Il coach ha raggiunto il limite massimo di clienti previsto dal proprio pacchetto.';
  }
  if (message.includes('INVALID_CODE')) {
    return 'Codice coach non valido, scaduto o esaurito.';
  }
  return `Errore collegamento al coach: ${message}`;
}

// Fallback chiamato dopo login (login-screen.tsx) se il cliente si era
// registrato con "Confirm email" attivo: coach_id/coach_code vengono riletti
// da user_metadata (salvati li' da signUpClientWithCoachCode), non richiesti
// di nuovo all'utente (che a questo punto non li ha piu' sottomano).
export async function ensureClientOnboarding(metadata: Record<string, unknown>): Promise<AuthServiceResult<null>> {
  if (!isReady() || !supabase) return notConfigured();

  const linkedByCode = (metadata.coach_code as string | undefined) ?? '';
  if (!linkedByCode) {
    return { ok: false, code: 'no_coach_link', message: 'Nessun codice coach trovato per completare la registrazione.' };
  }

  return completeClientOnboarding(linkedByCode);
}

// Ricostruisce il "profilo cliente" (Client locale + collegamento coach) da
// Supabase, invece di affidarsi al mirror locale (che puo' non esistere se il
// login avviene su un device/browser diverso da quello usato in registrazione
// — AsyncStorage web e AsyncStorage Expo Go NON condividono storage). Chiamata
// da login-screen.tsx dopo signInWithEmail per role 'cliente' e usata per
// popolare/aggiornare client-store prima di considerare l'accesso riuscito.
export async function loadClientProfile(userId: string, fallbackEmail: string): Promise<AuthServiceResult<ClientProfileData>> {
  if (!isReady() || !supabase) return notConfigured();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name,email,created_at')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) {
    return { ok: false, code: 'db_error', message: `Errore caricamento profilo: ${profileError.message}` };
  }

  const { data: clientProfile, error: clientProfileError } = await supabase
    .from('client_profiles')
    .select('goal,notes')
    .eq('user_id', userId)
    .maybeSingle();
  if (clientProfileError) {
    return { ok: false, code: 'db_error', message: `Errore caricamento dati cliente: ${clientProfileError.message}` };
  }
  if (!clientProfile) {
    return {
      ok: false,
      code: 'no_client_profile',
      message: 'Profilo cliente non completato. Contatta il coach o l\'assistenza.',
    };
  }

  const { data: coachClient, error: coachClientError } = await supabase
    .from('coach_clients')
    .select('coach_id,status,linked_by_code')
    .eq('client_id', userId)
    .maybeSingle();
  if (coachClientError) {
    return { ok: false, code: 'db_error', message: `Errore caricamento collegamento coach: ${coachClientError.message}` };
  }
  if (!coachClient) {
    return { ok: false, code: 'no_coach_link', message: 'Cliente non collegato a nessun coach.' };
  }

  // Lettura del coach collegato: solo coach_profiles (letto pubblicamente, vedi
  // coach_profiles_public_read in docs/SUPABASE_SCHEMA.sql), non profiles del
  // coach — un cliente non ha policy per leggere il profiles altrui, quindi
  // resta un dato opzionale/best-effort, non un dato mancante bloccante.
  const { data: coachProfile } = await supabase
    .from('coach_profiles')
    .select('business_name')
    .eq('user_id', coachClient.coach_id)
    .maybeSingle();

  const { firstName, lastName } = splitFullName(profile?.full_name ?? '');
  const client: Client = {
    id: userId,
    firstName,
    lastName,
    email: profile?.email ?? fallbackEmail,
    goal: clientProfile.goal ?? '',
    notes: clientProfile.notes ?? '',
    status: coachClient.status === 'active' ? 'attivo' : 'in_pausa',
    createdAt: profile?.created_at ?? new Date().toISOString(),
    coachId: coachClient.coach_id,
    linkedByCode: coachClient.linked_by_code ?? null,
  };

  return { ok: true, data: { client, coachBusinessName: coachProfile?.business_name ?? null } };
}

function splitFullName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? '' };
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

  const userId = data.session.user.id;
  let profile: { role: 'superadmin' | 'coach' | 'cliente'; full_name: string | null; must_change_password?: boolean } | null = null;
  let profileError: { message: string } | null = null;

  const fullSelect = await supabase.from('profiles').select('role, full_name, must_change_password').eq('id', userId).maybeSingle();
  if (fullSelect.error && isMissingMustChangePasswordColumn(fullSelect.error.message)) {
    // La colonna must_change_password (docs/SUPABASE_SCHEMA.sql) non esiste
    // ancora sul progetto reale — SQL non eseguito, o PostgREST non ha
    // ricaricato lo schema dopo averla aggiunta. Il login non deve restare
    // bloccato per TUTTI gli utenti finche' non viene sistemato: si riprova
    // senza quella colonna, trattando must_change_password come false (nessun
    // blocco cambio password forzato) finche' la colonna non e' disponibile.
    const basicSelect = await supabase.from('profiles').select('role, full_name').eq('id', userId).maybeSingle();
    profile = basicSelect.data ? { ...basicSelect.data, must_change_password: false } : null;
    profileError = basicSelect.error;
  } else {
    profile = fullSelect.data;
    profileError = fullSelect.error;
  }

  if (profileError) {
    return { ok: false, code: 'db_error', message: `Accesso riuscito ma errore lettura profilo: ${profileError.message}` };
  }
  if (profile) {
    return {
      ok: true,
      data: {
        session: data.session,
        role: profile.role,
        fullName: profile.full_name,
        mustChangePassword: profile.must_change_password ?? false,
      },
    };
  }

  // Riga profiles mancante: il trigger public.handle_new_user (docs/
  // SUPABASE_SCHEMA.sql) non l'ha creata (non installato/aggiornato sul
  // progetto, o eseguito prima che il trigger esistesse). Invece di bloccare
  // il login con "profilo non trovato", la creiamo qui dal client autenticato
  // usando gli stessi dati passati a signUp (role/full_name in user_metadata).
  // Richiede la policy profiles_self_insert (docs/SUPABASE_SCHEMA.sql).
  const created = await ensureProfileRow(userId, data.session.user.email ?? email, data.session.user.user_metadata ?? {});
  if (!created.ok) return created;

  // Riga appena creata qui: must_change_password e' sempre false di default
  // (colonna con default false), non serve rileggerla.
  return {
    ok: true,
    data: { session: data.session, role: created.data.role, fullName: created.data.fullName, mustChangePassword: false },
  };
}

type EnsuredProfile = { role: 'superadmin' | 'coach' | 'cliente'; fullName: string | null };

function readRoleFromMetadata(metadata: Record<string, unknown>): 'superadmin' | 'coach' | 'cliente' {
  const role = metadata.role;
  if (role === 'coach' || role === 'superadmin') return role;
  return 'cliente';
}

async function ensureProfileRow(
  userId: string,
  email: string,
  metadata: Record<string, unknown>,
): Promise<AuthServiceResult<EnsuredProfile>> {
  if (!supabase) return notConfigured();

  const role = readRoleFromMetadata(metadata);
  const fullName = (metadata.full_name as string | undefined) ?? null;
  const { error } = await supabase.from('profiles').insert({ id: userId, role, full_name: fullName, email });
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore creazione profilo: ${error.message}` };
  }
  return { ok: true, data: { role, fullName } };
}

// Fallback esplicito equivalente a quello dentro signInWithEmail, riutilizzabile
// per un utente gia' autenticato (es. dopo il reset password, o per una
// verifica difensiva indipendente dal login): legge l'utente Supabase corrente
// e crea la riga profiles se manca ancora.
export async function ensureProfileForCurrentUser(): Promise<
  AuthServiceResult<{ id: string; role: 'superadmin' | 'coach' | 'cliente'; fullName: string | null; email: string }>
> {
  if (!isReady() || !supabase) return notConfigured();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, code: 'auth_error', message: userError?.message ?? 'Nessun utente autenticato.' };
  }
  const user = userData.user;

  const { data: existing, error: existingError } = await supabase
    .from('profiles')
    .select('role, full_name, email')
    .eq('id', user.id)
    .maybeSingle();
  if (existingError) {
    return { ok: false, code: 'db_error', message: `Errore verifica profilo: ${existingError.message}` };
  }
  if (existing) {
    return { ok: true, data: { id: user.id, role: existing.role, fullName: existing.full_name, email: existing.email } };
  }

  const created = await ensureProfileRow(user.id, user.email ?? '', user.user_metadata ?? {});
  if (!created.ok) return created;

  return { ok: true, data: { id: user.id, role: created.data.role, fullName: created.data.fullName, email: user.email ?? '' } };
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

// Non rivela mai se l'email esiste o meno (comportamento di default di
// Supabase): il messaggio mostrato in UI resta lo stesso a prescindere,
// vedi forgot-password-screen.tsx.
export async function requestPasswordReset(email: string, redirectTo?: string): Promise<AuthServiceResult<null>> {
  if (!isReady() || !supabase) return notConfigured();

  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    redirectTo ? { redirectTo } : undefined,
  );
  if (error) {
    return { ok: false, code: 'auth_error', message: error.message };
  }
  return { ok: true, data: null };
}

// Richiede una sessione di recovery gia' attiva (stabilita da Supabase quando
// l'utente apre il link ricevuto via resetPasswordForEmail, vedi
// reset-password-screen.tsx + supabase.ts detectSessionInUrl).
export async function updatePassword(newPassword: string): Promise<AuthServiceResult<null>> {
  if (!isReady() || !supabase) return notConfigured();

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { ok: false, code: 'auth_error', message: error.message };
  }
  return { ok: true, data: null };
}

// Genera e invia credenziali provvisorie (password random + email) per un
// utente Supabase gia' esistente, chiamando la Edge Function
// send-temporary-credentials (supabase/functions/send-temporary-credentials).
// La password NON viene mai generata qui ne' restituita da questa funzione:
// il client mobile non la vede mai, coerente con la regola di sicurezza della
// feature (vedi docs/SUPABASE_TEMP_CREDENTIALS.md). supabase.functions.invoke
// allega automaticamente l'Authorization: Bearer della sessione corrente
// (fetchWithAuth in @supabase/supabase-js), quindi la Edge Function sa sempre
// chi sta chiamando senza bisogno di passare token espliciti qui.
export async function sendTemporaryCredentials(
  userId: string,
  email: string,
  role: 'coach' | 'cliente',
): Promise<AuthServiceResult<null>> {
  if (!isReady() || !supabase) return notConfigured();

  const { data, error } = await supabase.functions.invoke<{ ok: boolean }>('send-temporary-credentials', {
    body: { userId, email, role },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { code?: string; message?: string };
        return {
          ok: false,
          code: 'db_error',
          message: body.message ?? 'Invio credenziali non riuscito.',
        };
      } catch {
        return { ok: false, code: 'db_error', message: 'Invio credenziali non riuscito: risposta del server non leggibile.' };
      }
    }
    return { ok: false, code: 'db_error', message: `Invio credenziali non riuscito: ${error.message}` };
  }
  if (!data?.ok) {
    return { ok: false, code: 'db_error', message: 'Invio credenziali non riuscito.' };
  }

  return { ok: true, data: null };
}

// Completa il cambio password obbligatorio per un utente Supabase reale
// (must_change_password=true): imposta la nuova password scelta dall'utente
// (updatePassword, gia' esistente) e poi azzera il flag su profiles. Se il
// secondo passo fallisce, la password e' comunque cambiata (l'utente puo'
// continuare ad usarla): il flag rimasto a true fara' solo ripresentare
// questa schermata al prossimo giro, senza bloccare l'accesso in modo
// permanente ne' richiedere di nuovo la password provvisoria.
export async function completePasswordChange(newPassword: string): Promise<AuthServiceResult<null>> {
  if (!isReady() || !supabase) return notConfigured();

  const updateResult = await updatePassword(newPassword);
  if (!updateResult.ok) return updateResult;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, code: 'auth_error', message: 'Password aggiornata ma utente non trovato per completare il cambio.' };
  }

  const { error: flagError } = await supabase
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', userData.user.id);
  if (flagError) {
    return { ok: false, code: 'db_error', message: `Password aggiornata ma stato account non aggiornato: ${flagError.message}` };
  }

  return { ok: true, data: null };
}

// Legge il codice coach REALE da public.registration_codes (mai dal mirror
// locale useSuperadminStore.coaches, che puo' restare disallineato: il
// codice viene generato/aggiornato in vari punti — trigger DB al signUp,
// completeCoachOnboarding al primo login — e se anche uno solo di questi
// passaggi lato mirror locale non va a buon fine o non viene eseguito, il
// codice mostrato in app puo' non corrispondere piu' a quello davvero
// registrato su Supabase, l'unico che un cliente puo' usare per registrarsi.
// Vedi BUG-013 in docs/BUGS.md. coachId deve essere l'id reale della sessione
// Supabase (getCurrentSession().data.user.id), MAI useAuthStore().currentCoachId
// (id del mirror locale demo, non coincide con auth.uid() — stesso errore gia'
// documentato per l'upload video, docs/DECISIONS.md).
export async function getCoachActiveRegistrationCode(
  coachId: string,
): Promise<AuthServiceResult<{ code: string; active: boolean } | null>> {
  if (!isReady() || !supabase) return notConfigured();

  const { data, error } = await supabase
    .from('registration_codes')
    .select('code,status,created_at')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore lettura codice coach: ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { ok: true, data: null };
  }
  const preferred = data.find((row) => row.status === 'active') ?? data[0];
  return { ok: true, data: { code: preferred.code, active: preferred.status === 'active' } };
}

function isMissingMustChangePasswordColumn(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('must_change_password') && normalized.includes('does not exist');
}

function isBlockedBillingStatus(status: string) {
  return status === 'blocked' || status === 'past_due' || status === 'canceled';
}

function mapAuthErrorCode(message: string): AuthServiceErrorCode {
  const normalized = message.toLowerCase();
  if (normalized.includes('already registered')) return 'email_taken';
  if (normalized.includes('email not confirmed') || normalized.includes('not confirmed')) return 'email_not_confirmed';
  return 'auth_error';
}
