import { useEffect, useRef, useState } from 'react';
import { Slot, usePathname, useRouter, type Href } from 'expo-router';
import { Pressable } from 'react-native';

import AppTabs from './app-tabs';
import { ChangePasswordScreen } from './change-password-screen';
import ClientTabs from './client-tabs';
import { ForgotPasswordScreen } from './forgot-password-screen';
import { LoginScreen } from './login-screen';
import { ClientRegistrationScreen, CoachRegistrationScreen } from './registration-screens';
import { ResetPasswordScreen } from './reset-password-screen';
import { SupabaseChangePasswordScreen } from './supabase-change-password-screen';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { useAppointmentsRealtime } from '@/hooks/use-appointments-realtime';
import { useMessagesRealtime } from '@/hooks/use-messages-realtime';
import { useWorkoutPlansSync } from '@/hooks/use-workout-plans-sync';
import { getCurrentSession, signOut } from '@/lib/auth-service';
import { getClientFitnessProfileStatus } from '@/lib/client-fitness-profile-service';
import { getAssignedCoachStatusLabel, getMyAssignedCoach, type AssignedCoachSummary } from '@/lib/client-coach-service';
import { ensureClientOnboardingDraft } from '@/lib/client-onboarding-service';
import { getMySelfGuidedPlanAccess } from '@/lib/client-plan-access-service';
import { attachNotificationResponseListener, registerPushTokenForCurrentUser } from '@/lib/push-notification-service';
import { identifyRevenueCatUser, logoutRevenueCat } from '@/lib/revenuecat-service';
import { supabaseConfig } from '@/lib/supabase';
import { autoLinkYmoveVideosForCoach } from '@/lib/ymove-auto-link-service';
import { useAuthStore } from '@/store/auth-store';
import { useClientOnboardingStore } from '@/store/client-onboarding-store';
import { useClientStore } from '@/store/client-store';
import { useYmoveAutoLinkStore } from '@/store/ymove-autolink-store';
import type { UserRole } from '@/types/auth';

const CLIENT_HOME = '/cliente-home';
const COACH_HOME = '/';
const SUPERADMIN_HOME = '/superadmin' as Href;
const CLIENT_ONBOARDING = '/onboarding-cliente';
const CLIENT_CONNECT_COACH = '/collega-coach';
const CLIENT_SELF_GUIDED_PLANS = '/abbonamento-cliente';
// Questionario fitness obbligatorio per i clienti self_guided (senza coach),
// prerequisito del sistema "programmi automatici": si aggancia allo stesso
// meccanismo di redirect bloccante di CLIENT_ONBOARDING/CLIENT_SELF_GUIDED_
// PLANS, dopo entrambi (mai per il percorso coach_guided).
const CLIENT_FITNESS_QUESTIONNAIRE = '/questionario-fitness';
const SELF_GUIDED_COACH_ONLY_ROUTES = ['/chat', '/bacheca', '/prenotazioni', '/questionario'];

const CLIENT_ONLY_ROUTES = [
  '/cliente-home',
  '/workout',
  '/nutrizione',
  '/altro',
  '/cliente-profilo',
  '/progressi',
  '/metriche',
  // NON /storico-carichi: route condivisa (vedi storico-carichi.tsx) — un
  // coach la apre dalla card "Storico carichi" della schermata esercizio per
  // il cliente selezionato, la schermata stessa valida clientId per ruolo.
  CLIENT_CONNECT_COACH,
  CLIENT_SELF_GUIDED_PLANS,
  '/bacheca',
  '/prenotazioni',
  '/questionario',
  '/pacchetti-cliente',
  CLIENT_ONBOARDING,
  CLIENT_FITNESS_QUESTIONNAIRE,
  '/check-in-periodico',
  '/notifiche',
];

const COACH_ONLY_EXACT_ROUTES = [
  '/',
  '/clienti',
  '/appuntamenti',
  '/impostazioni',
  '/schede',
  '/esercizi',
  '/supporto',
  '/abbonamento-coach',
  '/area-coach',
  '/account-coach',
  '/assistenza',
];
const COACH_ONLY_PREFIXES = [
  '/clienti/',
  '/appuntamenti/',
  '/schede/new',
  '/schede/modelli',
  '/schede/modello',
  '/schede/professionali',
  '/schede/cartella',
];
const SUPERADMIN_ONLY_PREFIXES = ['/superadmin'];

// Unico punto che decide cosa mostrare in base allo stato di autenticazione
// demo locale: non autenticato -> login; cliente con password da cambiare ->
// cambio password obbligatorio; cliente -> tab cliente; coach -> tab coach;
// superadmin -> stack gestionale separato.
// In piu normalizza la route corrente per evitare che uno Slot renderizzi una
// schermata dell'altro ruolo dopo login o deep link.
export function AuthGate() {
  const pathname = usePathname();
  const router = useRouter();
  const authHydrated = useAuthStore((s) => s.hasHydrated);
  const clientsHydrated = useClientStore((s) => s.hasHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentRole = useAuthStore((s) => s.currentRole);
  const currentUserEmail = useAuthStore((s) => s.currentUserEmail);
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const mustChangePasswordSupabase = useAuthStore((s) => s.mustChangePasswordSupabase);
  const logout = useAuthStore((s) => s.logout);
  const accounts = useClientStore((s) => s.accounts);
  const setAutoLinkRunning = useYmoveAutoLinkStore((s) => s.setRunning);
  const setAutoLinkDone = useYmoveAutoLinkStore((s) => s.setDone);
  const { refresh: refreshWorkoutPlans } = useWorkoutPlansSync();
  // Fasi 5-6: montare gli hook QUI (radice autenticata) tiene attivi i canali
  // Realtime di appuntamenti e messaggi per tutta la sessione — il badge
  // "non letti" della tab Messaggi del coach si aggiorna anche senza aprire
  // la chat, e il cliente riceve un nuovo appuntamento senza riavviare.
  // I singleton nei rispettivi hook garantiscono UN solo canale per tabella
  // anche quando chat.tsx/appuntamenti monta lo stesso hook.
  const { refresh: refreshAppointments } = useAppointmentsRealtime();
  const { refresh: refreshMessages } = useMessagesRealtime();
  const revenueCatUserIdRef = useRef<string | null>(null);
  const [clientOnboarding, setClientOnboarding] = useState({
    loading: false,
    required: false,
    checked: false,
    mode: null as 'coach_guided' | 'self_guided' | null,
    error: null as string | null,
  });
  const [onboardingRetryKey, setOnboardingRetryKey] = useState(0);
  const [clientCoachAccess, setClientCoachAccess] = useState({
    loading: false,
    checked: false,
    coach: null as AssignedCoachSummary | null,
    error: null as string | null,
  });
  const [coachAccessRetryKey, setCoachAccessRetryKey] = useState(0);
  const [clientPlanAccess, setClientPlanAccess] = useState({ loading: false, checked: false, active: false, error: null as string | null });
  const [clientPlanRetryKey, setClientPlanRetryKey] = useState(0);
  const [clientFitnessQuestionnaire, setClientFitnessQuestionnaire] = useState({
    loading: false,
    checked: false,
    required: false,
    error: null as string | null,
  });
  const [fitnessQuestionnaireRetryKey, setFitnessQuestionnaireRetryKey] = useState(0);
  const onboardingStatusRevision = useClientOnboardingStore((s) => s.statusRevision);

  const roleTargetPath = getRoleRedirectTarget(currentRole, pathname);
  const clientTargetPath = getClientRedirectTarget({
    role: currentRole,
    pathname,
    supabaseConfigured: supabaseConfig.isConfigured,
    onboarding: clientOnboarding,
    coachAccess: clientCoachAccess,
    planAccess: clientPlanAccess,
    fitnessQuestionnaire: clientFitnessQuestionnaire,
  });
  const targetPath = clientOnboarding.error ? null : clientTargetPath ?? roleTargetPath;

  useEffect(() => {
    if (!isAuthenticated || currentRole !== 'cliente' || mustChangePasswordSupabase) {
      setClientOnboarding({ loading: false, required: false, checked: false, mode: null, error: null });
      return;
    }
    if (!supabaseConfig.isConfigured) {
      setClientOnboarding({ loading: false, required: false, checked: true, mode: null, error: null });
      return;
    }
    let active = true;
    setClientOnboarding({ loading: true, required: false, checked: false, mode: null, error: null });
    (async () => {
      const sessionResult = await getCurrentSession();
      if (!active) return;
      const session = sessionResult.ok ? sessionResult.data : null;
      if (!session?.user.id) {
        if (__DEV__) {
          console.error('CLIENT_ONBOARDING_SESSION_MISSING', sessionResult.ok ? 'missing session user' : sessionResult.message);
        }
        setClientOnboarding({ loading: false, required: false, checked: true, mode: null, error: 'Non è stato possibile verificare il profilo.' });
        return;
      }
      const result = await ensureClientOnboardingDraft(session.user.id, session.user.user_metadata ?? {});
      if (!active) return;
      if (!result.ok) {
        if (__DEV__) console.error('CLIENT_ONBOARDING_GATE_ERROR', result.message);
        setClientOnboarding({ loading: false, required: false, checked: true, mode: null, error: 'Non è stato possibile verificare il profilo.' });
        return;
      }
      setClientOnboarding({
        loading: false,
        required: result.data.exists && !result.data.completed,
        checked: true,
        mode: result.data.mode,
        error: null,
      });
    })();
    return () => {
      active = false;
    };
  }, [currentRole, currentClientId, isAuthenticated, mustChangePasswordSupabase, onboardingRetryKey, onboardingStatusRevision]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      currentRole !== 'cliente' ||
      mustChangePasswordSupabase ||
      !supabaseConfig.isConfigured ||
      clientOnboarding.mode === 'self_guided'
    ) {
      setClientCoachAccess({ loading: false, checked: false, coach: null, error: null });
      return;
    }
    if (clientOnboarding.loading || !clientOnboarding.checked || clientOnboarding.required || clientOnboarding.error) {
      setClientCoachAccess({ loading: false, checked: false, coach: null, error: null });
      return;
    }

    let active = true;
    setClientCoachAccess((current) => ({ ...current, loading: true, checked: false, error: null }));
    (async () => {
      const result = await getMyAssignedCoach();
      if (!active) return;
      if (!result.ok) {
        if (__DEV__) console.error('CLIENT_ASSIGNED_COACH_GATE_ERROR', result.message);
        setClientCoachAccess({ loading: false, checked: true, coach: null, error: 'Non e stato possibile verificare il profilo.' });
        return;
      }
      setClientCoachAccess({ loading: false, checked: true, coach: result.data, error: null });
    })();

    return () => {
      active = false;
    };
  }, [
    currentRole,
    currentClientId,
    isAuthenticated,
    mustChangePasswordSupabase,
    clientOnboarding.loading,
    clientOnboarding.checked,
    clientOnboarding.required,
    clientOnboarding.mode,
    clientOnboarding.error,
    coachAccessRetryKey,
    onboardingStatusRevision,
  ]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      currentRole !== 'cliente' ||
      mustChangePasswordSupabase ||
      !supabaseConfig.isConfigured ||
      clientOnboarding.mode !== 'self_guided'
    ) {
      setClientPlanAccess({ loading: false, checked: false, active: false, error: null });
      return;
    }
    if (clientOnboarding.loading || !clientOnboarding.checked || clientOnboarding.required || clientOnboarding.error) {
      setClientPlanAccess({ loading: false, checked: false, active: false, error: null });
      return;
    }

    let active = true;
    setClientPlanAccess((current) => ({ ...current, loading: true, checked: false, error: null }));
    (async () => {
      const result = await getMySelfGuidedPlanAccess();
      if (!active) return;
      if (!result.ok) {
        if (__DEV__) console.error('CLIENT_SELF_GUIDED_PLAN_GATE_ERROR', result.message);
        setClientPlanAccess({ loading: false, checked: true, active: false, error: 'Non e stato possibile verificare il piano cliente.' });
        return;
      }
      setClientPlanAccess({ loading: false, checked: true, active: result.data.active, error: null });
    })();

    return () => {
      active = false;
    };
  }, [
    currentRole,
    isAuthenticated,
    mustChangePasswordSupabase,
    clientOnboarding.loading,
    clientOnboarding.checked,
    clientOnboarding.required,
    clientOnboarding.mode,
    clientOnboarding.error,
    clientPlanRetryKey,
    onboardingStatusRevision,
  ]);

  // Questionario fitness obbligatorio (sistema "programmi automatici"): solo
  // per self_guided, e solo DOPO onboarding+paywall Client Pro esistenti gia'
  // superati (stesso ordine gia' in uso, nessuna modifica al paywall).
  useEffect(() => {
    if (
      !isAuthenticated ||
      currentRole !== 'cliente' ||
      mustChangePasswordSupabase ||
      !supabaseConfig.isConfigured ||
      clientOnboarding.mode !== 'self_guided'
    ) {
      setClientFitnessQuestionnaire({ loading: false, checked: false, required: false, error: null });
      return;
    }
    if (clientOnboarding.loading || !clientOnboarding.checked || clientOnboarding.required || clientOnboarding.error) {
      setClientFitnessQuestionnaire({ loading: false, checked: false, required: false, error: null });
      return;
    }
    if (clientPlanAccess.loading || !clientPlanAccess.checked || clientPlanAccess.error || !clientPlanAccess.active) {
      setClientFitnessQuestionnaire({ loading: false, checked: false, required: false, error: null });
      return;
    }

    let active = true;
    setClientFitnessQuestionnaire((current) => ({ ...current, loading: true, checked: false, error: null }));
    (async () => {
      const result = await getClientFitnessProfileStatus();
      if (!active) return;
      if (!result.ok) {
        if (__DEV__) console.error('CLIENT_FITNESS_QUESTIONNAIRE_GATE_ERROR', result.message);
        setClientFitnessQuestionnaire({ loading: false, checked: true, required: false, error: 'Non e stato possibile verificare il questionario.' });
        return;
      }
      setClientFitnessQuestionnaire({ loading: false, checked: true, required: !result.data.completed, error: null });
    })();

    return () => {
      active = false;
    };
  }, [
    currentRole,
    currentClientId,
    isAuthenticated,
    mustChangePasswordSupabase,
    clientOnboarding.loading,
    clientOnboarding.checked,
    clientOnboarding.required,
    clientOnboarding.mode,
    clientOnboarding.error,
    clientPlanAccess.loading,
    clientPlanAccess.checked,
    clientPlanAccess.error,
    clientPlanAccess.active,
    fitnessQuestionnaireRetryKey,
  ]);

  // Prima sincronizzazione schede/allenamenti con Supabase (2026-07-14):
  // avviata quando il ruolo diventa coach/cliente, cosi' la dashboard e le
  // altre schermate che leggono workoutPlans (cliente-home.tsx,
  // cliente-profilo.tsx, ecc.) vedono dati gia' aggiornati al primo render,
  // senza dover per forza visitare prima la lista schede/allenamenti (che fa
  // comunque il proprio refresh-on-focus, vedi schede/index.tsx/workout.tsx).
  // useWorkoutPlansSync gestisce da sola dedup/cooldown della migrazione e
  // il canale Realtime — qui ci si limita ad avviare refresh().
  useEffect(() => {
    if (currentRole !== 'coach' && currentRole !== 'cliente') return;
    refreshWorkoutPlans();
    refreshAppointments();
    refreshMessages();
  }, [currentRole, refreshWorkoutPlans, refreshAppointments, refreshMessages]);

  // Fase 7 — push: registra il token del device (permesso + canale Android +
  // upsert in push_tokens) e aggancia il listener del tap sulle notifiche
  // (apre chat/agenda corretti). Una volta per sessione autenticata; il
  // listener viene staccato al cleanup (logout/cambio ruolo), mai duplicato.
  useEffect(() => {
    if (currentRole !== 'coach' && currentRole !== 'cliente') return;
    if (!supabaseConfig.isConfigured) return;
    registerPushTokenForCurrentUser();
    const detach = attachNotificationResponseListener();
    return detach;
  }, [currentRole]);

  // RevenueCat usa lo stesso UUID Supabase Auth per coach e clienti. Su
  // logout/cambio account si chiude l'identita' RevenueCat per evitare
  // contaminazioni tra acquisti di store diversi sullo stesso device.
  useEffect(() => {
    if ((currentRole !== 'coach' && currentRole !== 'cliente') || !isAuthenticated || !supabaseConfig.isConfigured) {
      if (revenueCatUserIdRef.current) {
        revenueCatUserIdRef.current = null;
        logoutRevenueCat();
      }
      return;
    }
    let active = true;
    (async () => {
      const { getCurrentSession } = await import('@/lib/auth-service');
      const sessionResult = await getCurrentSession();
      if (!active) return;
      const userId = sessionResult.ok ? sessionResult.data?.user.id ?? null : null;
      if (!userId) {
        if (revenueCatUserIdRef.current) {
          revenueCatUserIdRef.current = null;
          await logoutRevenueCat();
        }
        return;
      }
      if (revenueCatUserIdRef.current && revenueCatUserIdRef.current !== userId) {
        await logoutRevenueCat();
      }
      revenueCatUserIdRef.current = userId;
      const identifyResult = await identifyRevenueCatUser(userId);
      if (!identifyResult.ok && __DEV__) {
        console.warn('REVENUECAT_IDENTIFY_ERROR', identifyResult.code, identifyResult.message);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentRole, isAuthenticated]);

  // Associazione automatica video YMove (2026-07-13): avviata UNA sola volta
  // per sessione app quando il ruolo diventa 'coach' (non ad ogni render/
  // cambio di rotta — la dipendenza e' solo currentRole, che non cambia
  // durante la normale navigazione). Il servizio stesso decide se c'e'
  // davvero qualcosa da fare (dedup in sessione + cooldown di 7 giorni tra
  // un riavvio e l'altro, vedi ymove-auto-link-service.ts): qui ci si limita
  // ad avviarlo e ad aggiornare lo stato UI (store dedicato, mostrato dal
  // banner non bloccante nella dashboard coach).
  useEffect(() => {
    if (currentRole !== 'coach' || !supabaseConfig.isConfigured) return;
    autoLinkYmoveVideosForCoach((progress) => setAutoLinkRunning(progress.processed, progress.total)).then((result) => {
      if (result.ok && result.data.total > 0) setAutoLinkDone(result.data);
    });
  }, [currentRole, setAutoLinkRunning, setAutoLinkDone]);

  useEffect(() => {
    if (!authHydrated || !clientsHydrated || !isAuthenticated || !targetPath) return;
    router.replace(targetPath);
  }, [authHydrated, clientsHydrated, isAuthenticated, router, targetPath]);

  if (!authHydrated || !clientsHydrated) {
    return <LoadingGate />;
  }

  // Il link email di reset password deve funzionare SEMPRE, indipendentemente
  // da un'eventuale sessione locale gia' autenticata in questo browser (es.
  // si e' rimasti loggati come coach/cliente e si segue comunque il link
  // "password dimenticata" per lo stesso account, oppure si sta testando il
  // flusso in una scheda gia' loggata): non deve mai passare dal gate di
  // autenticazione normale sotto, altrimenti porterebbe alla dashboard/login
  // invece che al form di reset. ResetPasswordScreen gestisce da sola
  // l'attesa della sessione di recovery Supabase e il caso "link non valido".
  if (pathname === '/reimposta-password') {
    return <ResetPasswordScreen />;
  }

  if (!isAuthenticated) {
    if (pathname === '/registrazione-coach') {
      return <CoachRegistrationScreen />;
    }
    if (pathname === '/registrazione-cliente') {
      return <ClientRegistrationScreen />;
    }
    if (pathname === '/password-dimenticata') {
      return <ForgotPasswordScreen />;
    }
    return <LoginScreen />;
  }

  if (currentRole === 'cliente') {
    // Il flag Supabase (utente reale, password provvisoria via Edge Function
    // send-temporary-credentials) ha priorita' sul flag locale demo: riguarda
    // un vero account Supabase Auth, non il mirror locale ClientAccount.
    if (mustChangePasswordSupabase) {
      return <SupabaseChangePasswordScreen />;
    }
    const normalizedEmail = currentUserEmail?.toLowerCase() ?? null;
    const account = normalizedEmail
      ? accounts.find((a) => a.email.toLowerCase() === normalizedEmail || a.username.toLowerCase() === normalizedEmail)
      : accounts.find((a) => a.clientId === currentClientId);
    if (account?.mustChangePassword) {
      return <ChangePasswordScreen account={account} />;
    }
    if (supabaseConfig.isConfigured && (clientOnboarding.loading || !clientOnboarding.checked)) {
      return <LoadingGate />;
    }
    if (clientOnboarding.error) {
      return <OnboardingCheckError onRetry={() => setOnboardingRetryKey((value) => value + 1)} />;
    }
    if (
      supabaseConfig.isConfigured &&
      !clientOnboarding.required &&
      clientOnboarding.mode === 'self_guided' &&
      (clientPlanAccess.loading || !clientPlanAccess.checked)
    ) {
      return <LoadingGate />;
    }
    if (clientOnboarding.mode === 'self_guided' && clientPlanAccess.error) {
      return <OnboardingCheckError onRetry={() => setClientPlanRetryKey((value) => value + 1)} />;
    }
    if (
      supabaseConfig.isConfigured &&
      clientOnboarding.mode === 'self_guided' &&
      clientPlanAccess.checked &&
      clientPlanAccess.active &&
      (clientFitnessQuestionnaire.loading || !clientFitnessQuestionnaire.checked)
    ) {
      return <LoadingGate />;
    }
    if (clientOnboarding.mode === 'self_guided' && clientPlanAccess.active && clientFitnessQuestionnaire.error) {
      return <OnboardingCheckError onRetry={() => setFitnessQuestionnaireRetryKey((value) => value + 1)} />;
    }
    if (
      supabaseConfig.isConfigured &&
      !clientOnboarding.required &&
      clientOnboarding.mode !== 'self_guided' &&
      (clientCoachAccess.loading || !clientCoachAccess.checked)
    ) {
      return <LoadingGate />;
    }
    if (clientOnboarding.mode !== 'self_guided' && clientCoachAccess.error) {
      return <OnboardingCheckError onRetry={() => setCoachAccessRetryKey((value) => value + 1)} />;
    }
    if (clientOnboarding.mode !== 'self_guided' && clientCoachAccess.coach?.connectionStatus === 'suspended') {
      return <ClientSuspendedGate coach={clientCoachAccess.coach} onLogout={async () => { await signOut(); logout(); }} />;
    }
    if (targetPath) {
      return <LoadingGate />;
    }
    if (
      pathname === CLIENT_ONBOARDING ||
      pathname === CLIENT_CONNECT_COACH ||
      pathname === CLIENT_SELF_GUIDED_PLANS ||
      pathname === CLIENT_FITNESS_QUESTIONNAIRE
    ) {
      return <Slot />;
    }
    return <ClientTabs mode={clientOnboarding.mode} />;
  }

  if (currentRole === 'superadmin') {
    if (targetPath) {
      return <LoadingGate />;
    }
    return <Slot />;
  }

  // currentRole === 'coach' da qui in poi: nessun account demo locale con
  // mustChangePassword esiste per i coach (solo per i clienti, vedi sopra),
  // quindi qui serve controllare solo il flag Supabase.
  if (mustChangePasswordSupabase) {
    return <SupabaseChangePasswordScreen />;
  }

  if (targetPath) {
    return <LoadingGate />;
  }

  return <AppTabs />;
}

function getClientRedirectTarget({
  role,
  pathname,
  supabaseConfigured,
  onboarding,
  coachAccess,
  planAccess,
  fitnessQuestionnaire,
}: {
  role: UserRole | null;
  pathname: string;
  supabaseConfigured: boolean;
  onboarding: { loading: boolean; required: boolean; checked: boolean; mode: 'coach_guided' | 'self_guided' | null; error: string | null };
  coachAccess: { loading: boolean; checked: boolean; coach: AssignedCoachSummary | null; error: string | null };
  planAccess: { loading: boolean; checked: boolean; active: boolean; error: string | null };
  fitnessQuestionnaire: { loading: boolean; checked: boolean; required: boolean; error: string | null };
}): Href | null {
  if (role !== 'cliente' || !supabaseConfigured || onboarding.error || onboarding.loading || !onboarding.checked) return null;
  if (onboarding.required) return pathname === CLIENT_ONBOARDING ? null : CLIENT_ONBOARDING;

  if (onboarding.mode === 'self_guided') {
    if (planAccess.loading || !planAccess.checked || planAccess.error) return null;
    if (!planAccess.active) {
      // Nessun piano Client Pro attivo: bloccato su /abbonamento-cliente,
      // MA la gestione account (impostazioni, tema, logout, eliminazione
      // account) resta sempre raggiungibile — non e' una funzione premium.
      // Raggiunta da un link diretto sulla paywall (il tab "Altro" resta
      // bloccato: espone anche voci premium come Metriche/Progressi/Pacchetti).
      const allowedWithoutPlan = pathname === CLIENT_SELF_GUIDED_PLANS || pathname === '/cliente-profilo';
      return allowedWithoutPlan ? null : CLIENT_SELF_GUIDED_PLANS;
    }
    // Questionario fitness obbligatorio (sistema "programmi automatici"):
    // verificato solo DOPO onboarding+paywall, mai per coach_guided.
    if (fitnessQuestionnaire.loading || !fitnessQuestionnaire.checked || fitnessQuestionnaire.error) return null;
    if (fitnessQuestionnaire.required) {
      return pathname === CLIENT_FITNESS_QUESTIONNAIRE ? null : CLIENT_FITNESS_QUESTIONNAIRE;
    }
    return pathname === CLIENT_SELF_GUIDED_PLANS ||
      pathname === CLIENT_CONNECT_COACH ||
      pathname === CLIENT_ONBOARDING ||
      pathname === CLIENT_FITNESS_QUESTIONNAIRE ||
      SELF_GUIDED_COACH_ONLY_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
      ? CLIENT_HOME
      : null;
  }

  // mode null is retained only as a compatibility path for pre-onboarding
  // accounts. Supabase remains authoritative through the assigned-coach RPC.
  if (coachAccess.loading || !coachAccess.checked || coachAccess.error) return null;
  if (!coachAccess.coach) return pathname === CLIENT_CONNECT_COACH ? null : CLIENT_CONNECT_COACH;
  if (coachAccess.coach.connectionStatus === 'active') {
    return pathname === CLIENT_CONNECT_COACH ||
      pathname === CLIENT_SELF_GUIDED_PLANS ||
      pathname === '/pacchetti-cliente' ||
      pathname === CLIENT_ONBOARDING
      ? CLIENT_HOME
      : null;
  }
  return null;
}

function getRoleRedirectTarget(role: UserRole | null, pathname: string) {
  if (role === 'cliente' && (isCoachOnlyPath(pathname) || isSuperadminOnlyPath(pathname))) {
    return CLIENT_HOME;
  }
  if (role === 'coach' && (isClientOnlyPath(pathname) || isSuperadminOnlyPath(pathname))) {
    return COACH_HOME;
  }
  if (role === 'superadmin' && !isSuperadminOnlyPath(pathname)) {
    return SUPERADMIN_HOME;
  }
  return null;
}

function isClientOnlyPath(pathname: string) {
  return CLIENT_ONLY_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isCoachOnlyPath(pathname: string) {
  return COACH_ONLY_EXACT_ROUTES.includes(pathname) || COACH_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isSuperadminOnlyPath(pathname: string) {
  return SUPERADMIN_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function LoadingGate() {
  return (
    <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ThemedText type="default" themeColor="textSecondary">
        Caricamento...
      </ThemedText>
    </ThemedView>
  );
}

function OnboardingCheckError({ onRetry }: { onRetry: () => void }) {
  return (
    <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <ThemedText type="default" themeColor="textSecondary">
        Non è stato possibile verificare il profilo.
      </ThemedText>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Riprova"
        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 18 }}>
        <ThemedText type="default" themeColor="primary">
          Riprova
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function ClientSuspendedGate({ coach, onLogout }: { coach: AssignedCoachSummary; onLogout: () => void }) {
  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
      <ThemedText type="title">Accesso sospeso</ThemedText>
      <ThemedText type="default" themeColor="textSecondary">
        Il tuo coach ha sospeso temporaneamente l'accesso in attesa del rinnovo.
      </ThemedText>
      <ThemedText type="default">
        Il tuo coach: {coach.fullName || 'Coach'}
      </ThemedText>
      {coach.businessName ? (
        <ThemedText type="default" themeColor="textSecondary">
          {coach.businessName}
        </ThemedText>
      ) : null}
      <ThemedText type="default" themeColor="primary">
        {getAssignedCoachStatusLabel(coach.connectionStatus)}
      </ThemedText>
      <Pressable
        onPress={onLogout}
        accessibilityRole="button"
        accessibilityLabel="Esci"
        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, alignSelf: 'flex-start' }}>
        <ThemedText type="default" themeColor="primary">
          Esci
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}
