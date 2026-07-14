import { Redirect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { AppCard, AppHeader, AppScreen, AppSectionTitle, AppStatCard } from '@/components/ui';
import { YmoveAutoLinkBanner } from '@/components/ymove-autolink-banner';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDayMonth } from '@/lib/format-date';
import { useTwoColumnGrid } from '@/hooks/use-two-column-grid';
import { useAppointmentStore } from '@/store/appointment-store';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import { computeSubscriptionStatus, getCurrentSubscription } from '@/types/subscription';

// Griglia a due colonne misurata via onLayout: logica condivisa in
// hooks/use-two-column-grid.ts (fix BUG-020, vedi commento la').
const GRID_GAP = AppSpacing[2];

export default function DashboardScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { onLayout: handleGridLayout, itemStyle: gridItemStyle } = useTwoColumnGrid(GRID_GAP);
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

      <YmoveAutoLinkBanner />

      <View style={styles.statsGrid} onLayout={handleGridLayout}>
        <AppStatCard
          size="lg"
          label="Attivi"
          value={String(attivi)}
          accentColor={colors.moss}
          onPress={() => router.push('/clienti')}
          style={gridItemStyle}
        />
        <AppStatCard
          size="lg"
          label="In scadenza"
          value={String(inScadenza)}
          accentColor={colors.amber}
          onPress={() => router.push('/clienti')}
          style={gridItemStyle}
        />
        <AppStatCard
          size="lg"
          label="Scaduti"
          value={String(scaduti)}
          accentColor={colors.rust}
          onPress={() => router.push('/clienti')}
          style={gridItemStyle}
        />
        <View style={gridItemStyle}>
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
        <Pressable onPress={() => router.push('/clienti/new')} hitSlop={4} style={gridItemStyle}>
          <View style={[styles.quickAction, { backgroundColor: colors.coral }]}>
            <Text style={[styles.quickActionLabel, { color: colors.onCoral }]}>Nuovo cliente</Text>
          </View>
        </Pressable>
        <QuickAction label="Nuovo appuntamento" style={gridItemStyle} onPress={() => router.push('/appuntamenti/new')} />
        <QuickAction label="Assegna scheda" style={gridItemStyle} onPress={() => router.push('/schede/new')} />
        <QuickAction label="Supporto" style={gridItemStyle} onPress={() => router.push('/supporto')} />
        <QuickAction label="Impostazioni" style={gridItemStyle} onPress={() => router.push('/impostazioni')} />
      </View>
    </AppScreen>
  );
}

function QuickAction({ label, style, onPress }: { label: string; style: ViewStyle; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable onPress={onPress} hitSlop={4} style={style}>
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
