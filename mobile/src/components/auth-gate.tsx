import AppTabs from './app-tabs';
import { ChangePasswordScreen } from './change-password-screen';
import ClientTabs from './client-tabs';
import { LoginScreen } from './login-screen';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';

// Unico punto che decide cosa mostrare in base allo stato di autenticazione
// DEMO LOCALE (vedi store/auth-store.ts): non autenticato -> login; cliente con
// password da cambiare -> cambio password obbligatorio; cliente -> tab cliente;
// coach -> tab coach (invariate). Nessuna delle tre condizioni usa un vero
// controllo lato server: sono tutte derivate da stato locale.
export function AuthGate() {
  const authHydrated = useAuthStore((s) => s.hasHydrated);
  const clientsHydrated = useClientStore((s) => s.hasHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentRole = useAuthStore((s) => s.currentRole);
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const accounts = useClientStore((s) => s.accounts);

  if (!authHydrated || !clientsHydrated) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ThemedText type="default" themeColor="textSecondary">
          Caricamento…
        </ThemedText>
      </ThemedView>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (currentRole === 'client') {
    const account = accounts.find((a) => a.clientId === currentClientId);
    if (account?.mustChangePassword) {
      return <ChangePasswordScreen account={account} />;
    }
    return <ClientTabs />;
  }

  return <AppTabs />;
}
