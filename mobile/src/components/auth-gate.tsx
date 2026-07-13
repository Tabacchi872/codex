import { useEffect } from 'react';
import { Slot, usePathname, useRouter, type Href } from 'expo-router';

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

import { supabaseConfig } from '@/lib/supabase';
import { autoLinkYmoveVideosForCoach } from '@/lib/ymove-auto-link-service';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useYmoveAutoLinkStore } from '@/store/ymove-autolink-store';
import type { UserRole } from '@/types/auth';

const CLIENT_HOME = '/cliente-home';
const COACH_HOME = '/';
const SUPERADMIN_HOME = '/superadmin' as Href;

const CLIENT_ONLY_ROUTES = [
  '/cliente-home',
  '/workout',
  '/nutrizione',
  '/altro',
  '/cliente-profilo',
  '/progressi',
  '/bacheca',
  '/prenotazioni',
  '/questionario',
  '/pacchetti-cliente',
];

const COACH_ONLY_EXACT_ROUTES = ['/', '/clienti', '/appuntamenti', '/impostazioni', '/schede', '/esercizi', '/supporto', '/abbonamento-coach'];
const COACH_ONLY_PREFIXES = ['/clienti/', '/appuntamenti/', '/schede/new', '/schede/modelli'];
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
  const accounts = useClientStore((s) => s.accounts);
  const setAutoLinkRunning = useYmoveAutoLinkStore((s) => s.setRunning);
  const setAutoLinkDone = useYmoveAutoLinkStore((s) => s.setDone);

  const targetPath = getRoleRedirectTarget(currentRole, pathname);

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
    if (targetPath) {
      return <LoadingGate />;
    }
    return <ClientTabs />;
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
