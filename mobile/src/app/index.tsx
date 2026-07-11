import { Redirect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard, AppHeader, AppScreen, AppSectionTitle, AppStatCard } from '@/components/ui';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDayMonth } from '@/lib/format-date';
import { useAppointmentStore } from '@/store/appointment-store';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import { computeSubscriptionStatus, getCurrentSubscription } from '@/types/subscription';

export default function DashboardScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
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
      <AppScreen scroll={false}>
        <View style={styles.loading}>
          <Text style={{ color: colors.inkSoft }}>Caricamento...</Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <AppHeader title="Dashboard" />
      <Text style={[styles.subtitle, { color: colors.inkSoft }]}>Panoramica clienti, abbonamenti e prossimi impegni.</Text>

      <View style={styles.statsGrid}>
        <AppStatCard
          size="lg"
          label="Attivi"
          value={String(attivi)}
          accentColor={colors.moss}
          onPress={() => router.push('/clienti')}
          style={styles.statCardWrap}
        />
        <AppStatCard
          size="lg"
          label="In scadenza"
          value={String(inScadenza)}
          accentColor={colors.amber}
          onPress={() => router.push('/clienti')}
          style={styles.statCardWrap}
        />
        <AppStatCard
          size="lg"
          label="Scaduti"
          value={String(scaduti)}
          accentColor={colors.rust}
          onPress={() => router.push('/clienti')}
          style={styles.statCardWrap}
        />
        <View style={styles.statCardWrap}>
          <AppCard onPress={() => router.push('/appuntamenti')} style={styles.appointmentCard}>
            <Text style={[styles.statLabel, { color: colors.inkSoft }]}>Prossimo appuntamento</Text>
            <Text style={[styles.appointmentTitle, { color: colors.ink }]} numberOfLines={2}>
              {prossimoAppuntamentoClient ? clientFullName(prossimoAppuntamentoClient) : 'Nessun appuntamento'}
            </Text>
            <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
              {prossimoAppuntamento ? `${formatDayMonth(prossimoAppuntamento.date)} · ${prossimoAppuntamento.startTime}` : 'Agenda libera'}
            </Text>
          </AppCard>
        </View>
      </View>

      <AppSectionTitle>AZIONI RAPIDE</AppSectionTitle>
      <View style={styles.quickActions}>
        <Pressable onPress={() => router.push('/clienti/new')} hitSlop={4} style={styles.quickActionWrap}>
          <View style={[styles.quickAction, { backgroundColor: colors.coral }]}>
            <Text style={[styles.quickActionLabel, { color: colors.onCoral }]}>Nuovo cliente</Text>
          </View>
        </Pressable>
        <QuickAction label="Nuovo appuntamento" onPress={() => router.push('/appuntamenti/new')} />
        <QuickAction label="Assegna scheda" onPress={() => router.push('/schede/new')} />
        <QuickAction label="Supporto" onPress={() => router.push('/supporto')} />
        <QuickAction label="Impostazioni" onPress={() => router.push('/impostazioni')} />
      </View>
    </AppScreen>
  );
}

function QuickAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable onPress={onPress} hitSlop={4} style={styles.quickActionWrap}>
      <View style={[styles.quickAction, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={[styles.quickActionLabel, { color: colors.ink }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    marginTop: -AppSpacing[2],
    maxWidth: 420,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  statCardWrap: {
    width: '48.5%',
    minWidth: 136,
    flexGrow: 1,
  },
  appointmentCard: {
    minHeight: 104,
    justifyContent: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  appointmentTitle: {
    fontWeight: '700',
    minHeight: 40,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  quickActionWrap: {
    width: '48.5%',
    minWidth: 136,
    flexGrow: 1,
  },
  quickAction: {
    minHeight: 52,
    borderRadius: AppRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing[2],
  },
  quickActionLabel: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
