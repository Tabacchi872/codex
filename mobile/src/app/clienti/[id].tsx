import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard, AppScreen, type AppBadgeTone } from '@/components/ui';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { DisabledAction } from '@/components/disabled-action';
import { sendTemporaryCredentials } from '@/lib/auth-service';
import { buildCredentialsMessage, generateTemporaryPassword, generateUsername } from '@/lib/credentials';
import { clientFullName } from '@/lib/client-helpers';
import { formatDayMonth } from '@/lib/format-date';
import { supabaseConfig } from '@/lib/supabase';
import { getClientPlans, getSessionDayLabel, getSessionWeekLabel } from '@/lib/workout-progress';
import { useAppointmentStore } from '@/store/appointment-store';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import { APPOINTMENT_TYPE_LABEL } from '@/types/appointment';
import { CLIENT_STATUS_LABEL, type Client, type ClientAccount, type ClientStatus } from '@/types/client';
import { SESSION_STATUS_LABEL, type WorkoutPlan } from '@/types/training';
import {
  COMPUTED_SUBSCRIPTION_STATUS_LABEL,
  computeSubscriptionStatus,
  getCurrentSubscription,
  type ComputedSubscriptionStatus,
} from '@/types/subscription';

const STATUS_OPTIONS: ClientStatus[] = ['attivo', 'in_pausa', 'scaduto'];

export default function ClienteDettaglioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
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
    return <CoachOnlyNotice />;
  }

  if (!cliente) {
    return (
      <AppScreen scroll={false}>
        <View style={styles.notFound}>
          <Text style={{ color: colors.ink }}>Cliente non trovato.</Text>
        </View>
      </AppScreen>
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
    <AppScreen contentStyle={styles.content}>
      <Stack.Screen options={{ title: clientFullName(cliente) }} />

      <View style={styles.statusChipsRow}>
        {STATUS_OPTIONS.map((option) => {
          const active = option === cliente.status;
          return (
            <Pressable
              key={option}
              onPress={() => setClientStatus(option)}
              hitSlop={6}
              style={[styles.statusChip, { borderColor: colors.moss, backgroundColor: active ? colors.moss : 'transparent' }]}>
              <Text style={[styles.statusChipLabel, { color: active ? colors.onMoss : colors.moss }]}>
                {CLIENT_STATUS_LABEL[option]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <AppCard>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Contatti</Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>{cliente.email}</Text>
        {cliente.phone ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{cliente.phone}</Text> : null}
        {cliente.birthDate ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nato/a il {cliente.birthDate}</Text> : null}
      </AppCard>

      <AppCard>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Obiettivo</Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>{cliente.goal || 'Non specificato'}</Text>
      </AppCard>

      <AppCard>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Abbonamento</Text>
        {displaySubscription ? (
          <>
            <Text style={[styles.planName, { color: colors.ink }]}>{displaySubscription.packageName}</Text>
            <Text style={[styles.counterText, { color: colors.ink }]}>
              {displaySubscription.completedWorkouts}/{displaySubscription.totalWorkoutsPurchased}
            </Text>
            <View style={styles.sectionHeaderRow}>
              <AppBadge label={COMPUTED_SUBSCRIPTION_STATUS_LABEL[displaySubscriptionStatus]} tone={subscriptionTone(displaySubscriptionStatus)} />
              <Text style={[styles.smallText, { color: colors.inkSoft }]}>
                Inizio {formatDayMonth(displaySubscription.startDate)}
                {displaySubscription.endDate ? ` · Fine ${formatDayMonth(displaySubscription.endDate)}` : ''}
              </Text>
            </View>
          </>
        ) : (
          <Text style={[styles.planName, { color: colors.ink }]}>Nessun abbonamento</Text>
        )}
        <AppButton
          label={displaySubscription ? 'Aggiorna abbonamento' : 'Crea abbonamento'}
          onPress={() =>
            displaySubscription
              ? router.push({ pathname: '/clienti/abbonamento-modifica', params: { subscriptionId: displaySubscription.id } })
              : router.push({ pathname: '/clienti/abbonamento-nuovo', params: { clientId: cliente.id } })
          }
          fullWidth
        />
        {displaySubscription ? (
          <Pressable
            onPress={() => router.push({ pathname: '/clienti/abbonamento-nuovo', params: { clientId: cliente.id } })}
            hitSlop={6}>
            <Text style={[styles.secondaryLink, { color: colors.moss }]}>+ Crea un nuovo abbonamento</Text>
          </Pressable>
        ) : null}
      </AppCard>

      <AppCard>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Schede assegnate ({sessions.length})</Text>
        {sessions.length === 0 ? (
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nessuna scheda assegnata.</Text>
        ) : (
          sessions.map((session) => (
            <SessionRow key={session.id} session={session} sessions={sessions} onPress={() => router.push(`/schede/${session.id}`)} />
          ))
        )}
        <AppButton label="+ Nuova scheda" onPress={() => router.push({ pathname: '/schede/new', params: { clientId: cliente.id } })} fullWidth />
      </AppCard>

      <AppCard>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Appuntamenti</Text>
        {clientAppointments.length > 0 ? (
          clientAppointments.map((a) => (
            <Text key={a.id} style={[styles.smallText, { color: colors.inkSoft }]}>
              {formatDayMonth(a.date)} · {a.startTime}–{a.endTime} — {APPOINTMENT_TYPE_LABEL[a.type]}
            </Text>
          ))
        ) : (
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nessun appuntamento in programma.</Text>
        )}
        <AppButton
          label="+ Nuovo appuntamento"
          onPress={() => router.push({ pathname: '/appuntamenti/new', params: { clientId: cliente.id } })}
          fullWidth
        />
      </AppCard>

      <AppCard style={styles.notesCard}>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Note interne</Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>{cliente.notes || 'Nessuna nota.'}</Text>
        <DisabledAction label="Modifica nota" note="Presto disponibile" />
      </AppCard>

      <CredentialsSection client={cliente} account={account} onGenerate={handleGenerateAccount} />
    </AppScreen>
  );
}

function subscriptionTone(status: ComputedSubscriptionStatus): AppBadgeTone {
  if (status === 'active') return 'moss';
  if (status === 'expiring') return 'amber';
  return 'rust';
}

function SessionRow({ session, sessions, onPress }: { session: WorkoutPlan; sessions: WorkoutPlan[]; onPress: () => void }) {
  const { colors } = useAppTheme();
  const status = session.sessionStatus ?? 'todo';
  return (
    <Pressable onPress={onPress} hitSlop={4} style={[styles.sessionRow, { borderColor: colors.border }]}>
      <View style={styles.sessionRowLeft}>
        <Text style={[styles.sessionName, { color: colors.ink }]}>{session.name}</Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>
          Giorno {getSessionDayLabel(session)} · Settimana {getSessionWeekLabel(sessions, session)} · {formatDayMonth(session.startDate)}
          {session.scheduledTime ? ` · ${session.scheduledTime}` : ''} · {session.exercises.length} esercizi
        </Text>
        {status !== 'todo' ? (
          <Text style={[styles.smallText, { color: status === 'completed' ? colors.moss : colors.inkSoft, fontWeight: '700' }]}>
            {SESSION_STATUS_LABEL[status]}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={20} color={colors.inkFaint} />
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
  const { colors } = useAppTheme();
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  // Invia via email: usa un vero account Supabase (auth.admin.updateUserById
  // dentro la Edge Function send-temporary-credentials), non l'account demo
  // locale sopra — un cliente aggiunto manualmente dal coach senza mai
  // essersi registrato su Supabase non ha una riga auth.users, quindi la
  // function risponde con un errore chiaro ("Nessun account Supabase reale
  // trovato...") invece di far finta di aver inviato qualcosa.
  async function handleSendEmail() {
    setEmailStatus(null);
    setSendingEmail(true);
    const result = await sendTemporaryCredentials(client.id, client.email, 'cliente');
    setSendingEmail(false);
    if (!result.ok) {
      setEmailStatus({ type: 'error', message: result.message });
      return;
    }
    setEmailStatus({ type: 'success', message: 'Credenziali inviate via email.' });
  }

  return (
    <AppCard style={styles.credentialsCard}>
      <Text style={[styles.cardTitle, { color: colors.ink }]}>Credenziali cliente</Text>

      {!account ? (
        <AppButton label="Genera credenziali di accesso" onPress={onGenerate} fullWidth />
      ) : (
        <>
          <View style={[styles.credentialsBox, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
            <CredentialRow label="Username" value={account.username} />
            <CredentialRow label="Email" value={account.email} />
            <CredentialRow label="Password temporanea" value={account.temporaryPassword} />
            <Text style={[styles.smallText, { color: colors.inkSoft }]}>
              {account.mustChangePassword
                ? 'Questa è una password temporanea. Il cliente dovrà cambiarla al primo accesso.'
                : 'Il cliente ha già cambiato la password.'}
            </Text>
          </View>

          <View style={styles.credentialsActions}>
            <AppButton label="Copia credenziali" onPress={handleCopy} variant="outline" fullWidth />
            <AppButton label="Condividi credenziali" onPress={handleShare} variant="outline" fullWidth />
          </View>

          {copyFeedback ? <Text style={[styles.smallText, { color: colors.moss, fontWeight: '600' }]}>{copyFeedback}</Text> : null}

          {supabaseConfig.isConfigured ? (
            <>
              <AppButton
                label={sendingEmail ? 'Invio...' : 'Invia via email'}
                onPress={handleSendEmail}
                variant="outline"
                loading={sendingEmail}
                fullWidth
              />
              {emailStatus ? (
                <Text
                  style={[
                    styles.smallText,
                    { color: emailStatus.type === 'success' ? colors.moss : colors.rust, fontWeight: '600' },
                  ]}>
                  {emailStatus.message}
                </Text>
              ) : null}
            </>
          ) : (
            <DisabledAction label="Invia via email" note="Richiede Supabase configurato" />
          )}
        </>
      )}
    </AppCard>
  );
}

function CredentialRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.credentialRow}>
      <Text style={[styles.smallText, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.smallText, { color: colors.ink, fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: AppSpacing[3],
  },
  statusChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  statusChip: {
    borderRadius: AppRadius.pill,
    borderWidth: 1.5,
    minHeight: 40,
    paddingHorizontal: AppSpacing[3],
    justifyContent: 'center',
  },
  statusChipLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  planName: {
    fontSize: AppFontSize.base,
    fontWeight: '600',
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: AppSpacing[1],
  },
  counterText: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
  },
  secondaryLink: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: AppSpacing[1],
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: AppRadius.md,
    padding: AppSpacing[3],
    marginBottom: AppSpacing[2],
    minWidth: 0,
  },
  sessionRowLeft: {
    gap: 2,
    flex: 1,
    minWidth: 0,
    marginRight: AppSpacing[2],
  },
  sessionName: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  notesCard: {
    gap: AppSpacing[2],
  },
  credentialsCard: {
    gap: AppSpacing[2],
  },
  credentialsBox: {
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: AppSpacing[3],
    gap: AppSpacing[1],
  },
  credentialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  credentialsActions: {
    gap: AppSpacing[2],
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
