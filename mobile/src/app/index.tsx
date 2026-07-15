import { Redirect, useRouter, type Href } from 'expo-router';
import { CalendarDays, Plus, UserPlus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { AppCard, AppPressableCard, AppScreen, AppSectionTitle, AppStatCard, FitCoachLogo, UserAvatar } from '@/components/ui';
import { YmoveAutoLinkBanner } from '@/components/ymove-autolink-banner';
import { useCoachClients } from '@/hooks/use-coach-clients';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { logCoachNavPress } from '@/lib/coach-navigation';
import { formatDayMonth } from '@/lib/format-date';
import { getWorkoutCounter } from '@/lib/workout-progress';
import { useTwoColumnGrid } from '@/hooks/use-two-column-grid';
import { useAppointmentStore } from '@/store/appointment-store';
import { useAuthStore } from '@/store/auth-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { useTrainingStore } from '@/store/training-store';
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
  const { clients, loading: clientsLoading } = useCoachClients();
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const subscriptionsHydrated = useSubscriptionStore((s) => s.hasHydrated);
  const appointments = useAppointmentStore((s) => s.appointments);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);

  const statuses = clients.map((c) => computeSubscriptionStatus(getCurrentSubscription(subscriptions, c.id)));
  const attivi = statuses.filter((s) => s === 'active').length;
  const inScadenza = statuses.filter((s) => s === 'expiring').length;
  const scaduti = statuses.filter((s) => s === 'expired').length;
  const nowKey = new Date().toISOString().slice(0, 10);
  const prossimoAppuntamento = appointments
    .filter((a) => a.status === 'scheduled' && a.date >= nowKey)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))[0];
  const prossimoAppuntamentoClient = getClientById(clients, prossimoAppuntamento?.clientId);
  const todayAppointments = appointments
    .filter((a) => a.status === 'scheduled' && a.date === nowKey)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 3);
  const recentClients = [...clients]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  function navigate(source: string, target: string) {
    logCoachNavPress(source, target);
    router.push(target as Href);
  }

  if (currentRole === 'cliente') {
    return <Redirect href="/cliente-home" />;
  }

  if (clientsLoading || !subscriptionsHydrated) {
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
      <View style={styles.topBar}>
        <FitCoachLogo size="md" />
      </View>
      <View style={[styles.heroHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.heroCopy}>
          <Text style={[styles.eyebrow, { color: colors.moss }]}>DASHBOARD COACH</Text>
          <Text style={[styles.heroTitle, { color: colors.ink }]}>Panoramica</Text>
          <Text style={[styles.subtitle, { color: colors.inkSoft }]}>Clienti, abbonamenti e prossimi impegni.</Text>
        </View>
        <View style={[styles.heroGraphic, { backgroundColor: colors.mossSoft, borderColor: colors.border }]}>
          <View style={[styles.heroOrb, { backgroundColor: colors.moss }]} />
          <UserPlus size={36} color={colors.moss} />
        </View>
      </View>

      <YmoveAutoLinkBanner />

      <View style={styles.statsGrid} onLayout={handleGridLayout}>
        <AppStatCard
          size="lg"
          label="Attivi"
          value={String(attivi)}
          accentColor={colors.moss}
          onPress={() => navigate('dashboard-stat-attivi', '/clienti')}
          style={gridItemStyle}
        />
        <AppStatCard
          size="lg"
          label="In scadenza"
          value={String(inScadenza)}
          accentColor={colors.amber}
          onPress={() => navigate('dashboard-stat-in-scadenza', '/clienti')}
          style={gridItemStyle}
        />
        <AppStatCard
          size="lg"
          label="Scaduti"
          value={String(scaduti)}
          accentColor={colors.rust}
          onPress={() => navigate('dashboard-stat-scaduti', '/clienti')}
          style={gridItemStyle}
        />
        <View style={gridItemStyle}>
          <AppPressableCard
            onPress={() => navigate('dashboard-prossimo-appuntamento', '/appuntamenti')}
            accessibilityLabel="Apri appuntamenti"
            style={styles.appointmentCard}>
            <Text style={[styles.statLabel, { color: colors.inkSoft }]}>Prossimo appuntamento</Text>
            <Text style={[styles.appointmentTitle, { color: colors.ink }]} numberOfLines={2}>
              {prossimoAppuntamentoClient ? clientFullName(prossimoAppuntamentoClient) : 'Nessun appuntamento'}
            </Text>
            <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
              {prossimoAppuntamento ? `${formatDayMonth(prossimoAppuntamento.date)} · ${prossimoAppuntamento.startTime}` : 'Agenda libera'}
            </Text>
          </AppPressableCard>
        </View>
      </View>

      <Pressable onPress={() => navigate('dashboard-nuovo-cliente', '/clienti/new')} hitSlop={4}>
        <View style={[styles.primaryAction, { backgroundColor: colors.moss }]}>
          <Plus size={20} color={colors.onMoss} />
          <Text style={[styles.primaryActionLabel, { color: colors.onMoss }]}>Nuovo cliente</Text>
        </View>
      </Pressable>

      <View style={styles.dashboardColumns}>
        <View style={styles.column}>
          <AppSectionTitle>CLIENTI RECENTI</AppSectionTitle>
          <AppCard style={styles.clientListCard}>
            {recentClients.length === 0 ? (
              <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Nessun cliente collegato.</Text>
            ) : (
              recentClients.map((client, index) => {
                const counter = getWorkoutCounter(subscriptions, workoutPlans, client, client.id);
                const progress = counter.total > 0 ? Math.min(counter.completed / counter.total, 1) : 0;
                return (
                  <View key={client.id}>
                    {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                    <Pressable onPress={() => navigate('dashboard-cliente-recente', `/clienti/${client.id}`)} style={styles.clientRow}>
                      <UserAvatar
                        firstName={client.firstName}
                        lastName={client.lastName}
                        imageUrl={client.avatarUrl}
                        preset={client.avatarPreset}
                        size={48}
                      />
                      <View style={styles.clientText}>
                        <Text style={[styles.clientName, { color: colors.ink }]} numberOfLines={1}>
                          {clientFullName(client)}
                        </Text>
                        <Text style={[styles.clientGoal, { color: colors.inkSoft }]} numberOfLines={1}>
                          {counter.completed}/{counter.total} allenamenti
                        </Text>
                        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSubtle }]}>
                          <View style={[styles.progressFill, { backgroundColor: colors.moss, width: `${progress * 100}%` }]} />
                        </View>
                      </View>
                    </Pressable>
                  </View>
                );
              })
            )}
          </AppCard>
        </View>

        <View style={styles.column}>
          <AppSectionTitle>AGENDA DI OGGI</AppSectionTitle>
          <AppCard style={styles.agendaCard}>
            {todayAppointments.length === 0 ? (
              <View style={styles.emptyAgenda}>
                <CalendarDays size={26} color={colors.inkFaint} />
                <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm, fontWeight: '600' }}>Nessun appuntamento oggi.</Text>
              </View>
            ) : (
              todayAppointments.map((appointment, index) => {
                const appointmentClient = getClientById(clients, appointment.clientId);
                return (
                  <View key={appointment.id}>
                    {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                    <Pressable onPress={() => navigate('dashboard-agenda-oggi', '/appuntamenti')} style={styles.agendaRow}>
                      <Text style={[styles.agendaTime, { color: colors.moss }]}>{appointment.startTime}</Text>
                      <View style={styles.clientText}>
                        <Text style={[styles.clientName, { color: colors.ink }]} numberOfLines={1}>
                          {appointmentClient ? clientFullName(appointmentClient) : 'Cliente'}
                        </Text>
                        <Text style={[styles.clientGoal, { color: colors.inkSoft }]} numberOfLines={1}>
                          {appointment.endTime}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                );
              })
            )}
          </AppCard>
        </View>
      </View>

      <AppSectionTitle>AZIONI RAPIDE</AppSectionTitle>
      <View style={styles.quickActions}>
        <QuickAction label="Nuovo appuntamento" style={gridItemStyle} onPress={() => navigate('dashboard-nuovo-appuntamento', '/appuntamenti/new')} />
        <QuickAction label="Assegna scheda" style={gridItemStyle} onPress={() => navigate('dashboard-assegna-scheda', '/schede/new')} />
        <QuickAction label="Supporto" style={gridItemStyle} onPress={() => navigate('dashboard-supporto', '/supporto')} />
        <QuickAction label="Impostazioni" style={gridItemStyle} onPress={() => navigate('dashboard-impostazioni', '/impostazioni')} />
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
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroHeader: {
    borderRadius: AppRadius.xxl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: AppSpacing[1],
    justifyContent: 'space-between',
    overflow: 'hidden',
    padding: AppSpacing[5],
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: AppFontSize.xs,
    fontWeight: '800',
    letterSpacing: 0,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
  },
  subtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    marginTop: AppSpacing[1],
    maxWidth: 420,
  },
  heroGraphic: {
    alignItems: 'center',
    borderRadius: AppRadius.xxl,
    borderWidth: 1,
    height: 96,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 96,
  },
  heroOrb: {
    borderRadius: 999,
    height: 76,
    opacity: 0.16,
    position: 'absolute',
    right: -18,
    top: -18,
    width: 76,
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
  primaryAction: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: AppSpacing[4],
  },
  primaryActionLabel: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
  },
  dashboardColumns: {
    gap: AppSpacing[3],
  },
  column: {
    gap: AppSpacing[2],
  },
  clientListCard: {
    gap: 0,
    paddingVertical: AppSpacing[1],
  },
  clientRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[3],
    minHeight: 58,
    paddingVertical: AppSpacing[2],
  },
  clientText: {
    flex: 1,
    minWidth: 0,
  },
  clientName: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
  },
  clientGoal: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    marginTop: 2,
  },
  progressTrack: {
    borderRadius: AppRadius.pill,
    height: 6,
    marginTop: AppSpacing[2],
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: AppRadius.pill,
    height: '100%',
  },
  agendaCard: {
    gap: 0,
    paddingVertical: AppSpacing[1],
  },
  agendaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[3],
    minHeight: 58,
    paddingVertical: AppSpacing[2],
  },
  agendaTime: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
    width: 52,
  },
  emptyAgenda: {
    alignItems: 'center',
    gap: AppSpacing[2],
    justifyContent: 'center',
    minHeight: 88,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 56,
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
