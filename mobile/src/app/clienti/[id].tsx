import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { DisabledAction } from '@/components/disabled-action';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildCredentialsMessage, generateTemporaryPassword, generateUsername } from '@/lib/credentials';
import { clientFullName } from '@/lib/client-helpers';
import { formatDayMonth } from '@/lib/format-date';
import { getClientPlans, getSessionDayLabel, getSessionWeekLabel } from '@/lib/workout-progress';
import { useAppointmentStore } from '@/store/appointment-store';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { useTrainingStore } from '@/store/training-store';
import { APPOINTMENT_TYPE_LABEL } from '@/types/appointment';
import { CLIENT_STATUS_LABEL, type Client, type ClientAccount, type ClientStatus } from '@/types/client';
import { SESSION_STATUS_LABEL, type WorkoutPlan } from '@/types/training';
import {
  COMPUTED_SUBSCRIPTION_STATUS_LABEL,
  computeSubscriptionStatus,
  getCurrentSubscription,
} from '@/types/subscription';

const STATUS_OPTIONS: ClientStatus[] = ['attivo', 'in_pausa', 'scaduto'];

export default function ClienteDettaglioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const clients = useClientStore((s) => s.clients);
  const accounts = useClientStore((s) => s.accounts);
  const updateClient = useClientStore((s) => s.updateClient);
  const addAccount = useClientStore((s) => s.addAccount);
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const appointments = useAppointmentStore((s) => s.appointments);
  const cliente = clients.find((c) => c.id === id);

  if (!isCoach) {
    return (
      <ScreenBackground>
        <CoachOnlyNotice />
      </ScreenBackground>
    );
  }

  if (!cliente) {
    return (
      <ScreenBackground>
        <View style={styles.notFound}>
          <ThemedText type="default">Cliente non trovato.</ThemedText>
        </View>
      </ScreenBackground>
    );
  }

  const sessions = getClientPlans(workoutPlans, cliente.id);
  const displaySubscription = getCurrentSubscription(subscriptions, cliente.id);
  const displaySubscriptionStatus = computeSubscriptionStatus(displaySubscription);
  // Sempre lo stesso abbonamento scelto dalla logica condivisa: corrente se valido,
  // altrimenti il più recente, così lista e dettaglio non divergono.
  const clientAppointments = appointments
    .filter((a) => a.clientId === cliente.id && a.status !== 'cancelled')
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const account = accounts.find((a) => a.clientId === cliente.id);

  function setClientStatus(status: ClientStatus) {
    updateClient({ ...cliente!, status });
  }

  function handleGenerateAccount() {
    const newAccount: ClientAccount = {
      id: `acc-${Date.now()}`,
      clientId: cliente!.id,
      username: generateUsername(cliente!),
      email: cliente!.email,
      temporaryPassword: generateTemporaryPassword(),
      role: 'cliente',
      mustChangePassword: true,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    addAccount(newAccount);
  }

  return (
    <ScreenBackground>
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.two, paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
      ]}>
      <Stack.Screen options={{ title: clientFullName(cliente) }} />

      <View style={styles.statusChipsRow}>
        {STATUS_OPTIONS.map((option) => {
          const active = option === cliente.status;
          return (
            <Pressable key={option} onPress={() => setClientStatus(option)} hitSlop={6}>
              <View
                style={[
                  styles.statusChip,
                  { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.softRed : theme.backgroundElement },
                ]}>
                <ThemedText type="small" themeColor={active ? 'primary' : 'textSecondary'}>
                  {CLIENT_STATUS_LABEL[option]}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Card>
        <ThemedText type="smallBold">Contatti</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {cliente.email}
        </ThemedText>
        {cliente.phone && (
          <ThemedText type="small" themeColor="textSecondary">
            {cliente.phone}
          </ThemedText>
        )}
        {cliente.birthDate && (
          <ThemedText type="small" themeColor="textSecondary">
            Nato/a il {cliente.birthDate}
          </ThemedText>
        )}
      </Card>

      <Card>
        <ThemedText type="smallBold">Obiettivo</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {cliente.goal || 'Non specificato'}
        </ThemedText>
      </Card>

      <Card>
        <ThemedText type="smallBold">Abbonamento</ThemedText>
        {displaySubscription ? (
          <>
            <ThemedText type="default" style={styles.planName}>
              {displaySubscription.packageName}
            </ThemedText>
            <ThemedText type="title" style={styles.counterText}>
              {displaySubscription.completedWorkouts}/{displaySubscription.totalWorkoutsPurchased}
            </ThemedText>
            <View style={styles.sectionHeaderRow}>
              <ThemedText
                type="smallBold"
                themeColor={
                  displaySubscriptionStatus === 'active'
                    ? 'statusActive'
                    : displaySubscriptionStatus === 'expiring'
                      ? 'statusWarning'
                      : 'statusExpired'
                }>
                {COMPUTED_SUBSCRIPTION_STATUS_LABEL[displaySubscriptionStatus]}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Inizio {formatDayMonth(displaySubscription.startDate)}
                {displaySubscription.endDate ? ` · Fine ${formatDayMonth(displaySubscription.endDate)}` : ''}
              </ThemedText>
            </View>
          </>
        ) : (
          <ThemedText type="default" style={styles.planName}>
            Nessun abbonamento
          </ThemedText>
        )}
        <Pressable
          hitSlop={6}
          onPress={() =>
            displaySubscription
              ? router.push({
                  pathname: '/clienti/abbonamento-modifica',
                  params: { subscriptionId: displaySubscription.id },
                })
              : router.push({ pathname: '/clienti/abbonamento-nuovo', params: { clientId: cliente.id } })
          }>
          <View style={[styles.planButton, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" themeColor="onPrimary">
              {displaySubscription ? 'Aggiorna abbonamento' : 'Crea abbonamento'}
            </ThemedText>
          </View>
        </Pressable>
        {displaySubscription && (
          <Pressable onPress={() => router.push({ pathname: '/clienti/abbonamento-nuovo', params: { clientId: cliente.id } })} hitSlop={6}>
            <ThemedText type="small" themeColor="primary" style={styles.secondaryLink}>
              + Crea un nuovo abbonamento
            </ThemedText>
          </Pressable>
        )}
      </Card>

      <Card>
        <ThemedText type="smallBold">Schede assegnate ({sessions.length})</ThemedText>
        {sessions.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Nessuna scheda assegnata.
          </ThemedText>
        ) : (
          sessions.map((session) => <SessionRow key={session.id} session={session} sessions={sessions} onPress={() => router.push(`/schede/${session.id}`)} />)
        )}
        <Pressable onPress={() => router.push({ pathname: '/schede/new', params: { clientId: cliente.id } })} hitSlop={6}>
          <View style={[styles.planButton, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" themeColor="onPrimary">
              + Nuova scheda
            </ThemedText>
          </View>
        </Pressable>
      </Card>

      <Card>
        <ThemedText type="smallBold">Appuntamenti</ThemedText>
        {clientAppointments.length > 0 ? (
          clientAppointments.map((a) => (
            <ThemedText key={a.id} type="small" themeColor="textSecondary">
              {formatDayMonth(a.date)} · {a.startTime}–{a.endTime} — {APPOINTMENT_TYPE_LABEL[a.type]}
            </ThemedText>
          ))
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Nessun appuntamento in programma.
          </ThemedText>
        )}
        <Pressable onPress={() => router.push({ pathname: '/appuntamenti/new', params: { clientId: cliente.id } })} hitSlop={6}>
          <View style={[styles.planButton, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" themeColor="onPrimary">
              + Nuovo appuntamento
            </ThemedText>
          </View>
        </Pressable>
      </Card>

      <Card style={styles.notesCard}>
        <ThemedText type="smallBold">Note interne</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {cliente.notes || 'Nessuna nota.'}
        </ThemedText>
        <DisabledAction label="Modifica nota" note="Presto disponibile" />
      </Card>

      <CredentialsSection client={cliente} account={account} onGenerate={handleGenerateAccount} />
    </ScrollView>
    </ScreenBackground>
  );
}

function SessionRow({ session, sessions, onPress }: { session: WorkoutPlan; sessions: WorkoutPlan[]; onPress: () => void }) {
  const theme = useTheme();
  const status = session.sessionStatus ?? 'todo';
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      <View style={[styles.sessionRow, { borderColor: theme.border }]}>
        <View style={styles.sessionRowLeft}>
          <ThemedText type="default" style={styles.sessionName}>
            {session.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Giorno {getSessionDayLabel(session)} · Settimana {getSessionWeekLabel(sessions, session)} ·{' '}
            {formatDayMonth(session.startDate)}
            {session.scheduledTime ? ` · ${session.scheduledTime}` : ''} · {session.exercises.length} esercizi
          </ThemedText>
          {status !== 'todo' && (
            <ThemedText type="small" themeColor={status === 'completed' ? 'statusActive' : 'textSecondary'}>
              {SESSION_STATUS_LABEL[status]}
            </ThemedText>
          )}
        </View>
        <ThemedText style={[styles.arrow, { color: theme.primary }]}>→</ThemedText>
      </View>
    </Pressable>
  );
}

function CredentialsSection({
  client,
  account,
  onGenerate,
}: {
  client: Client;
  account: ClientAccount | undefined;
  onGenerate: () => void;
}) {
  const theme = useTheme();
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  async function handleCopy() {
    if (!account) return;
    await Clipboard.setStringAsync(buildCredentialsMessage(client, account));
    setCopyFeedback('Copiato negli appunti.');
    setTimeout(() => setCopyFeedback(null), 2000);
  }

  async function handleShare() {
    if (!account) return;
    const message = buildCredentialsMessage(client, account);
    if (Platform.OS === 'web') {
      // Share.share di React Native non è affidabile su web: copiamo direttamente.
      await Clipboard.setStringAsync(message);
      setCopyFeedback('Condivisione non disponibile su web: testo copiato negli appunti.');
      setTimeout(() => setCopyFeedback(null), 3000);
      return;
    }
    try {
      await Share.share({ message });
    } catch {
      await Clipboard.setStringAsync(message);
      setCopyFeedback('Condivisione non riuscita: testo copiato negli appunti.');
      setTimeout(() => setCopyFeedback(null), 3000);
    }
  }

  return (
    <Card style={styles.credentialsCard}>
      <ThemedText type="smallBold">Credenziali cliente</ThemedText>

      {!account ? (
        <Pressable onPress={onGenerate} hitSlop={6}>
          <View style={[styles.generateButton, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" themeColor="onPrimary">
              Genera credenziali di accesso
            </ThemedText>
          </View>
        </Pressable>
      ) : (
        <>
          <View style={[styles.credentialsBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <CredentialRow label="Username" value={account.username} />
            <CredentialRow label="Email" value={account.email} />
            <CredentialRow label="Password temporanea" value={account.temporaryPassword} />
            <ThemedText type="small" themeColor="textSecondary">
              {account.mustChangePassword
                ? 'Questa è una password temporanea. Il cliente dovrà cambiarla al primo accesso.'
                : 'Il cliente ha già cambiato la password.'}
            </ThemedText>
          </View>

          <View style={styles.credentialsActions}>
            <Pressable onPress={handleCopy} hitSlop={4} style={styles.credentialActionWrap}>
              <View style={[styles.actionButton, { borderColor: theme.primary }]}>
                <ThemedText type="smallBold" style={[styles.actionButtonText, { color: theme.primary }]}>
                  Copia credenziali
                </ThemedText>
              </View>
            </Pressable>
            <Pressable onPress={handleShare} hitSlop={4} style={styles.credentialActionWrap}>
              <View style={[styles.actionButton, { borderColor: theme.primary }]}>
                <ThemedText type="smallBold" style={[styles.actionButtonText, { color: theme.primary }]}>
                  Condividi credenziali
                </ThemedText>
              </View>
            </Pressable>
          </View>

          {copyFeedback && (
            <ThemedText type="small" themeColor="statusActive">
              {copyFeedback}
            </ThemedText>
          )}

          <DisabledAction label="Invia via email" note="Disponibile prossimamente" />
        </>
      )}
    </Card>
  );
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.credentialRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  statusChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statusChip: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  planName: {
    marginTop: 2,
  },
  planMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planButton: {
    borderRadius: Radius.sm,
    minHeight: 44,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  counterText: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '700',
  },
  secondaryLink: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    minWidth: 0,
  },
  sessionRowLeft: {
    gap: 2,
    flex: 1,
    minWidth: 0,
    marginRight: Spacing.two,
  },
  sessionName: {
    fontWeight: '700',
  },
  arrow: {
    fontSize: 20,
    fontWeight: '700',
  },
  notesCard: {
    gap: Spacing.two,
  },
  credentialsCard: {
    gap: Spacing.two,
  },
  generateButton: {
    borderRadius: Radius.md,
    minHeight: 48,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  credentialsBox: {
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  credentialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  credentialsActions: {
    gap: Spacing.two,
  },
  credentialActionWrap: {
    width: '100%',
  },
  actionButton: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    textAlign: 'center',
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
