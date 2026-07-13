import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type DimensionValue, type LayoutChangeEvent } from 'react-native';

import { AppCard, AppHeader, AppScreen, AppSectionTitle, AppStatCard } from '@/components/ui';
import { YmoveAutoLinkBanner } from '@/components/ymove-autolink-banner';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { formatDayMonth } from '@/lib/format-date';
import { useAppointmentStore } from '@/store/appointment-store';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import { computeSubscriptionStatus, getCurrentSubscription } from '@/types/subscription';

// Larghezza colonna calcolata dalla larghezza REALE del contenitore misurata
// con onLayout (non percentuali fisse combinate con minWidth/flexGrow, la
// combinazione che causava la sovrapposizione dei pulsanti su Android; e
// nemmeno useWindowDimensions, che su web misurava l'intera finestra del
// browser invece della cornice iPhone di WebPhoneFrame — 360/390/430px — e
// faceva traboccare i pulsanti dalla cornice). Sotto MIN_COLUMN_WIDTH per
// colonna si passa a una sola colonna, mai a un valore che farebbe
// traboccare la riga. Prima della prima misurazione (containerWidth 0) si
// usa '100%' (una colonna, mai overflow): la misura arriva al primo frame.
const GRID_GAP = AppSpacing[2];
const MIN_COLUMN_WIDTH = 130;

function computeColumnWidth(containerWidth: number): DimensionValue {
  if (containerWidth <= 0) return '100%';
  const twoColumnWidth = Math.floor((containerWidth - GRID_GAP) / 2);
  return twoColumnWidth >= MIN_COLUMN_WIDTH ? twoColumnWidth : containerWidth;
}

// AppStatCard applica internamente flex:1 al proprio wrapper (per il caso
// d'uso normale, riempire lo spazio disponibile): senza azzerare qui
// flexGrow/flexShrink, il flex:1 interno vincerebbe sulla width fissa
// calcolata sopra (flexBasis:0% di "flex:1" ha priorita' sulla width in
// Yoga), riproducendo la stessa sovrapposizione che si vuole eliminare.
function gridItemStyle(width: DimensionValue) {
  return { width, flexGrow: 0, flexShrink: 0, flexBasis: width };
}

export default function DashboardScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [gridContainerWidth, setGridContainerWidth] = useState(0);
  const gridItemWidth = computeColumnWidth(gridContainerWidth);

  function handleGridLayout(event: LayoutChangeEvent) {
    const measured = Math.round(event.nativeEvent.layout.width);
    if (measured !== gridContainerWidth) setGridContainerWidth(measured);
  }
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
          style={gridItemStyle(gridItemWidth)}
        />
        <AppStatCard
          size="lg"
          label="In scadenza"
          value={String(inScadenza)}
          accentColor={colors.amber}
          onPress={() => router.push('/clienti')}
          style={gridItemStyle(gridItemWidth)}
        />
        <AppStatCard
          size="lg"
          label="Scaduti"
          value={String(scaduti)}
          accentColor={colors.rust}
          onPress={() => router.push('/clienti')}
          style={gridItemStyle(gridItemWidth)}
        />
        <View style={gridItemStyle(gridItemWidth)}>
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
        <Pressable onPress={() => router.push('/clienti/new')} hitSlop={4} style={gridItemStyle(gridItemWidth)}>
          <View style={[styles.quickAction, { backgroundColor: colors.coral }]}>
            <Text style={[styles.quickActionLabel, { color: colors.onCoral }]}>Nuovo cliente</Text>
          </View>
        </Pressable>
        <QuickAction label="Nuovo appuntamento" width={gridItemWidth} onPress={() => router.push('/appuntamenti/new')} />
        <QuickAction label="Assegna scheda" width={gridItemWidth} onPress={() => router.push('/schede/new')} />
        <QuickAction label="Supporto" width={gridItemWidth} onPress={() => router.push('/supporto')} />
        <QuickAction label="Impostazioni" width={gridItemWidth} onPress={() => router.push('/impostazioni')} />
      </View>
    </AppScreen>
  );
}

function QuickAction({ label, width, onPress }: { label: string; width: DimensionValue; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <Pressable onPress={onPress} hitSlop={4} style={gridItemStyle(width)}>
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
