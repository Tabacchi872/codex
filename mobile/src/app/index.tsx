import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDayMonth } from '@/lib/format-date';
import { useAppointmentStore } from '@/store/appointment-store';
import { useClientStore } from '@/store/client-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { computeSubscriptionStatus, getCurrentSubscription } from '@/types/subscription';

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clients = useClientStore((s) => s.clients);
  const clientsHydrated = useClientStore((s) => s.hasHydrated);
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const subscriptionsHydrated = useSubscriptionStore((s) => s.hasHydrated);
  const appointments = useAppointmentStore((s) => s.appointments);

  const statuses = clients.map((client) => computeSubscriptionStatus(getCurrentSubscription(subscriptions, client.id)));
  const attivi = statuses.filter((s) => s === 'active').length;
  const inScadenza = statuses.filter((s) => s === 'expiring').length;
  const scaduti = statuses.filter((s) => s === 'expired').length;
  const nowKey = new Date().toISOString().slice(0, 10);
  const prossimoAppuntamento = appointments
    .filter((a) => a.status === 'scheduled' && a.date >= nowKey)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))[0];
  const prossimoAppuntamentoClient = getClientById(clients, prossimoAppuntamento?.clientId);

  if (!clientsHydrated || !subscriptionsHydrated) {
    return (
      <ScreenBackground>
        <View style={styles.loading}>
          <ThemedText type="default" themeColor="textSecondary">
            Caricamento…
          </ThemedText>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <ScrollView
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        },
      ]}>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.title}>
          Dashboard
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Riepilogo clienti e prossimi impegni
        </ThemedText>
      </View>

      <View style={styles.statsGrid}>
        <StatCell label="Attivi" value={attivi} color="statusActive" onPress={() => router.push('/clienti')} />
        <StatCell label="In scadenza" value={inScadenza} color="statusWarning" onPress={() => router.push('/clienti')} />
        <StatCell label="Scaduti" value={scaduti} color="statusExpired" onPress={() => router.push('/clienti')} />
      </View>

      <ThemedText type="smallBold" style={styles.sectionLabel}>
        Prossimo appuntamento
      </ThemedText>
      {prossimoAppuntamento ? (
        <Pressable onPress={() => router.push('/appuntamenti')}>
          <Card style={styles.appointmentRow}>
            <View style={styles.appointmentText}>
              <ThemedText type="default">
                {prossimoAppuntamentoClient ? clientFullName(prossimoAppuntamentoClient) : 'Cliente non trovato'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatDayMonth(prossimoAppuntamento.date)} · {prossimoAppuntamento.startTime}
              </ThemedText>
            </View>
            <ThemedText type="linkPrimary" style={styles.appointmentLink}>
              Vedi
            </ThemedText>
          </Card>
        </Pressable>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Nessun appuntamento in programma.
        </ThemedText>
      )}
    </ScrollView>
    </ScreenBackground>
  );
}

function StatCell({
  label,
  value,
  onPress,
  color,
}: {
  label: string;
  value: number;
  onPress: () => void;
  color: 'statusActive' | 'statusWarning' | 'statusExpired';
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.statCell, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="title" style={styles.statValue} themeColor={color}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel} numberOfLines={2}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
    width: '100%',
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statCell: {
    flexBasis: 0,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    minHeight: 88,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.two,
    gap: 4,
  },
  statValue: {
    fontSize: 25,
    lineHeight: 30,
  },
  statLabel: {
    textAlign: 'center',
    lineHeight: 18,
  },
  sectionLabel: {
    marginTop: Spacing.two,
  },
  appointmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  appointmentText: {
    flex: 1,
    minWidth: 0,
  },
  appointmentLink: {
    flexShrink: 0,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
