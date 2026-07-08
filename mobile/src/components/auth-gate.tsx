import { useEffect } from 'react';
import { Slot, usePathname, useRouter } from 'expo-router';

import AppTabs from './app-tabs';
import { ChangePasswordScreen } from './change-password-screen';
import ClientTabs from './client-tabs';
import { LoginScreen } from './login-screen';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import type { UserRole } from '@/types/auth';

const CLIENT_HOME = '/cliente-home';
const COACH_HOME = '/';
const SUPERADMIN_HOME = '/superadmin';

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
];

const COACH_ONLY_EXACT_ROUTES = ['/', '/clienti', '/appuntamenti', '/impostazioni', '/schede', '/esercizi'];
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
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const accounts = useClientStore((s) => s.accounts);

  const targetPath = getRoleRedirectTarget(currentRole, pathname);

  useEffect(() => {
    if (!authHydrated || !clientsHydrated || !isAuthenticated || !targetPath) return;
    router.replace(targetPath);
  }, [authHydrated, clientsHydrated, isAuthenticated, router, targetPath]);

  if (!authHydrated || !clientsHydrated) {
    return <LoadingGate />;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (currentRole === 'client') {
    const account = accounts.find((a) => a.clientId === currentClientId);
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

  if (targetPath) {
    return <LoadingGate />;
  }

  return <AppTabs />;
}

function getRoleRedirectTarget(role: UserRole | null, pathname: string) {
  if (role === 'client' && (isCoachOnlyPath(pathname) || isSuperadminOnlyPath(pathname))) {
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
