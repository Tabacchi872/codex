import { useRouter } from 'expo-router';
import {
  CalendarDays,
  Headphones,
  LogOut,
  Settings,
  Ticket,
  UserCog,
  Users,
} from 'lucide-react-native';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { AppCard, AppHeader, AppListRow, AppScreen } from '@/components/ui';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { useCoachClients } from '@/hooks/use-coach-clients';
import { useMySubscription } from '@/hooks/use-my-subscription';
import { signOut } from '@/lib/auth-service';
import { logCoachNavPress } from '@/lib/coach-navigation';
import { useAppointmentsRealtime } from '@/hooks/use-appointments-realtime';
import { useAppointmentStore } from '@/store/appointment-store';
import { useAuthStore } from '@/store/auth-store';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

async function confirmLogout() {
  if (Platform.OS === 'web') return globalThis.confirm('Vuoi uscire dal tuo account?');
  return new Promise<boolean>((resolve) => {
    Alert.alert('Esci', 'Vuoi uscire dal tuo account?', [
      { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Esci', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function formatShortDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return value;
  }
}

// Hub "Area coach": punto di accesso unico a Clienti/Appuntamenti/
// Abbonamento/Account/Impostazioni/Assistenza/Esci. Recupera SOLO
// riepiloghi leggeri riusando gli stessi hook gia' usati dalle schermate di
// dettaglio (nessuna nuova query duplicata) — le schermate aperte da qui
// caricano poi i dati completi.
export default function AreaCoachScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');
  const logout = useAuthStore((s) => s.logout);

  const { clients, loading: clientsLoading, error: clientsError } = useCoachClients();
  const { loading: appointmentsLoading, error: appointmentsError } = useAppointmentsRealtime();
  const appointments = useAppointmentStore((s) => s.appointments);
  const { current: subscription, loading: subscriptionLoading, error: subscriptionError } = useMySubscription();

  if (!isCoach) {
    return <CoachOnlyNotice />;
  }

  const activeClients = clients.filter((c) => c.connectionStatus === 'active').length;
  const suspendedClients = clients.filter((c) => c.connectionStatus === 'suspended').length;
  const clientsSummary = clientsError
    ? 'Errore nel caricamento'
    : clientsLoading
      ? 'Caricamento...'
      : `${activeClients} attivi · ${suspendedClients} sospesi`;

  const upcomingAppointments = appointments.filter((a) => a.status === 'scheduled').length;
  const appointmentsSummary = appointmentsError
    ? 'Errore nel caricamento'
    : appointmentsLoading && appointments.length === 0
      ? 'Caricamento...'
      : `${upcomingAppointments} prossimi`;

  const subscriptionSummary = subscriptionError
    ? 'Errore nel caricamento'
    : subscriptionLoading
      ? 'Caricamento...'
      : !subscription
        ? 'Nessun pacchetto attivo'
        : subscription.paymentProvider === 'superadmin_manual'
          ? `${subscription.package?.name ?? 'Pacchetto'} · assegnato dall'amministratore`
          : subscription.expiresAt
            ? `${subscription.package?.name ?? 'Pacchetto'} · attivo fino al ${formatShortDate(subscription.expiresAt)}`
            : `${subscription.package?.name ?? 'Pacchetto'} · attivo`;

  async function handleLogout() {
    const confirmed = await confirmLogout();
    if (!confirmed) return;
    logCoachNavPress('area-coach-esci', '/');
    await signOut();
    logout();
  }

  const sections = [
    {
      key: 'clienti',
      icon: Users,
      title: 'Clienti',
      subtitle: clientsSummary,
      onPress: () => navigate('clienti', '/clienti'),
    },
    {
      key: 'appuntamenti',
      icon: CalendarDays,
      title: 'Appuntamenti',
      subtitle: appointmentsSummary,
      onPress: () => navigate('appuntamenti', '/appuntamenti'),
    },
    {
      key: 'abbonamento',
      icon: Ticket,
      title: 'Abbonamento',
      subtitle: subscriptionSummary,
      onPress: () => navigate('abbonamento', '/abbonamento-coach'),
    },
    {
      key: 'account-coach',
      icon: UserCog,
      title: 'Account coach',
      subtitle: 'Dati personali, email, password, codice coach',
      onPress: () => navigate('account-coach', '/account-coach'),
    },
    {
      key: 'impostazioni',
      icon: Settings,
      title: 'Impostazioni app',
      subtitle: 'Tema e suoni',
      onPress: () => navigate('impostazioni', '/impostazioni'),
    },
    {
      key: 'assistenza',
      icon: Headphones,
      title: 'Assistenza e informazioni',
      subtitle: 'Supporto, privacy, termini, versione',
      onPress: () => navigate('assistenza', '/assistenza'),
    },
  ] as const;

  function navigate(source: string, target: '/clienti' | '/appuntamenti' | '/abbonamento-coach' | '/account-coach' | '/impostazioni' | '/assistenza') {
    logCoachNavPress(`area-coach-${source}`, target);
    router.push(target);
  }

  return (
    <AppScreen>
      <AppHeader title="Area coach" />
      <Text style={[styles.subtitle, { color: colors.inkSoft }]}>Gestisci clienti, appuntamenti, abbonamento e account.</Text>

      <AppCard style={styles.listCard}>
        {sections.map((item, index) => {
          const Icon = item.icon;
          return (
            <View key={item.key}>
              {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
              <AppListRow
                icon={<Icon size={19} color={colors.moss} />}
                iconBackground={colors.mossSoft}
                title={item.title}
                subtitle={item.subtitle}
                onPress={item.onPress}
              />
            </View>
          );
        })}
      </AppCard>

      <AppCard style={styles.logoutCard}>
        <AppListRow
          icon={<LogOut size={19} color={colors.rust} />}
          iconBackground={colors.rustSoft}
          title="Esci"
          onPress={handleLogout}
        />
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    marginTop: -AppSpacing[2],
    marginBottom: AppSpacing[1],
  },
  listCard: {
    paddingVertical: 4,
  },
  logoutCard: {
    paddingVertical: 4,
    marginTop: AppSpacing[3],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -12,
  },
});
