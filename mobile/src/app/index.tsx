import { Redirect, useRouter } from 'expo-router';
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
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { computeSubscriptionStatus, getCurrentSubscription } from '@/types/subscription';

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const currentRole = useAuthStore((s) => s.currentRole);
  const clients = useClientStore((s) => s.clients);
  const clientsHydrated = useClientStore((s) => s.hasHydrated);
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const subscriptionsHydrated = useSubscriptionStore((s) => s.hasHydrated);
  const appointments = useAppointmentStore((s) => s.appointments);

  const statuses = clients.map((c) => computeSubscriptionStatus(getCurrentSubscription(subscriptions, c.id)));
  const attivi = statuses.filter((s) => s === 'active').length;
  const inScadenza = statuses.filter((s) => s === 'expiring').length;
  const scaduti = statuses.filter((s) => s === 'expired').length;
  const nowKey = new Date().toISOString().slice(0, 10);
  const prossimoAppuntamento = appointments
    .filter((a) => a.status === 'scheduled' && a.date >= nowKey)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))[0];
  const prossimoAppuntamentoClient = getClientById(clients, prossimoAppuntamento?.clientId);

  if (currentRole === 'cliente') {
    return <Redirect href="/cliente-home" />;
  }

  if (!clientsHydrated || !subscriptionsHydrated) {
    return (
      <ScreenBackground>
        <View style={styles.loading}>
          <ThemedText type="default" themeColor="textSecondary">
            Caricamento...
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
          <ThemedText type="small" themeColor="textSecondary" style={styles.headerSubtitle}>
            Panoramica clienti, abbonamenti e prossimi impegni.
          </ThemedText>
        </View>

        <View style={styles.statsGrid}>
          <StatCard label="Attivi" value={attivi} onPress={() => router.push('/clienti')} />
          <StatCard
            label="In scadenza"
            value={inScadenza}
            color="statusWarning"
            onPress={() => router.push('/clienti')}
          />
          <StatCard label="Scaduti" value={scaduti} color="statusExpired" onPress={() => router.push('/clienti')} />
          <Pressable onPress={() => router.push('/appuntamenti')} style={styles.statCardWrap}>
            <Card style={styles.statCard}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel}>
                Prossimo appuntamento
              </ThemedText>
              <ThemedText type="default" style={styles.appointmentKpiTitle} numberOfLines={2}>
                {prossimoAppuntamentoClient ? clientFullName(prossimoAppuntamentoClient) : 'Nessun appuntamento'}
              </ThemedText>
              {prossimoAppuntamento ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDayMonth(prossimoAppuntamento.date)} · {prossimoAppuntamento.startTime}
                </ThemedText>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  Agenda libera
                </ThemedText>
              )}
            </Card>
          </Pressable>
        </View>

        <ThemedText type="smallBold" style={styles.sectionLabel}>
          Azioni rapide
        </ThemedText>
        <View style={styles.quickActions}>
          <Pressable onPress={() => router.push('/clienti/new')} style={styles.quickActionWrap}>
            <View style={[styles.quickAction, styles.quickActionPrimary, { backgroundColor: theme.primary }]}>
              <ThemedText type="smallBold" themeColor="onPrimary">
                Nuovo cliente
              </ThemedText>
            </View>
          </Pressable>
          <QuickAction label="Nuovo appuntamento" onPress={() => router.push('/appuntamenti/new')} />
          <QuickAction label="Assegna scheda" onPress={() => router.push('/schede/new')} />
          <QuickAction label="Supporto" onPress={() => router.push('/supporto')} />
          <QuickAction label="Impostazioni" onPress={() => router.push('/impostazioni')} />
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

function StatCard({
  label,
  value,
  onPress,
  color,
}: {
  label: string;
  value: number;
  onPress: () => void;
  color?: 'statusWarning' | 'statusExpired';
}) {
  return (
    <Pressable onPress={onPress} style={styles.statCardWrap}>
      <Card style={styles.statCard}>
        <ThemedText type="small" themeColor={color ?? 'textSecondary'} style={styles.statLabel}>
          {label}
        </ThemedText>
        <ThemedText type="title" style={styles.statValue} themeColor={color}>
          {value}
        </ThemedText>
      </Card>
    </Pressable>
  );
}

function QuickAction({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress} style={styles.quickActionWrap}>
      <View style={[styles.quickAction, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">{label}</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  headerSubtitle: {
    maxWidth: 420,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statCardWrap: {
    width: '48.5%',
    minWidth: 136,
    flexGrow: 1,
  },
  statCard: {
    minHeight: 104,
    justifyContent: 'center',
    gap: Spacing.one,
  },
  statLabel: {
    fontWeight: '700',
  },
  statValue: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
  },
  appointmentKpiTitle: {
    fontWeight: '700',
    minHeight: 48,
  },
  sectionLabel: {
    marginTop: Spacing.one,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  quickActionWrap: {
    width: '48.5%',
    minWidth: 136,
    flexGrow: 1,
  },
  quickAction: {
    minHeight: 52,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  quickActionPrimary: {
    borderWidth: 0,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
