import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { Pill } from '@/components/pill';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { DEFAULT_COACH_ID } from '@/constants/app-info';
import { getExerciseById } from '@/data/exercise-library';
import { getWorkoutPlanTemplateById } from '@/data/workout-plan-templates';
import { useTheme } from '@/hooks/use-theme';
import { getCurrentSession } from '@/lib/auth-service';
import { clientFullName } from '@/lib/client-helpers';
import { supabaseConfig } from '@/lib/supabase';
import { instantiateSessionExercises } from '@/lib/workout-template-copy';
import { createWorkoutPlan } from '@/lib/workout-plan-service';
import { useClientStore } from '@/store/client-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { useTrainingStore } from '@/store/training-store';
import { SUBSCRIPTION_STATUS_LABEL } from '@/types/subscription';
import type { WorkoutPlan } from '@/types/training';

export default function ModelloDettaglioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const clients = useClientStore((s) => s.clients);
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const addWorkoutPlan = useTrainingStore((s) => s.addWorkoutPlan);
  const [mode, setMode] = useState<'view' | 'assign'>('view');
  const [clientId, setClientId] = useState('');
  const [subscriptionId, setSubscriptionId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const template = getWorkoutPlanTemplateById(id);

  if (!template) {
    return (
      <ScreenBackground>
        <ThemedView style={styles.notFound}>
          <ThemedText type="default">Modello non trovato.</ThemedText>
        </ThemedView>
      </ScreenBackground>
    );
  }

  const clientSubscriptions = subscriptions.filter((s) => s.clientId === clientId);

  // Crea N schede (una per sessione del modello) in sequenza, mai in
  // parallelo: ognuna passa dalla stessa RPC atomica save_workout_plan
  // (docs/SUPABASE_SCHEMA.sql) usata dal form di modifica scheda, cosi' non
  // esiste un percorso di scrittura "modelli" separato e meno sicuro.
  async function handleConfirmAssign() {
    if (!clientId) return;
    setError('');

    const today = new Date();
    const buildPlan = (sessionIndex: number): WorkoutPlan => {
      const session = template!.sessions[sessionIndex];
      const expiry = new Date(today);
      expiry.setDate(expiry.getDate() + template!.durationWeeks * 7);
      return {
        id: `plan-${Date.now()}-${sessionIndex}`,
        name: `${template!.title} — ${session.title}`,
        clientId,
        coachId: DEFAULT_COACH_ID,
        subscriptionId: subscriptionId || undefined,
        startDate: today.toISOString().slice(0, 10),
        expiryDate: expiry.toISOString().slice(0, 10),
        exercises: instantiateSessionExercises(session),
      };
    };

    if (!supabaseConfig.isConfigured) {
      template!.sessions.forEach((_, index) => addWorkoutPlan(buildPlan(index)));
      router.replace(`/clienti/${clientId}`);
      return;
    }

    setSaving(true);
    const session = await getCurrentSession();
    const realCoachId = session.ok ? (session.data?.user.id ?? null) : null;
    if (!realCoachId) {
      setSaving(false);
      setError('Nessuna sessione coach reale trovata. Prova a rifare il login.');
      return;
    }

    for (let index = 0; index < template!.sessions.length; index++) {
      const result = await createWorkoutPlan({ ...buildPlan(index), coachId: realCoachId });
      if (!result.ok) {
        setSaving(false);
        setError(`Creata ${index} su ${template!.sessions.length} schede, poi errore: ${result.message}`);
        return;
      }
      addWorkoutPlan(result.data);
    }
    setSaving(false);
    router.replace(`/clienti/${clientId}`);
  }

  return (
    <ScreenBackground>
      <Stack.Screen options={{ title: template.title }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.three, paddingBottom: Spacing.six },
        ]}>
        <Card style={styles.headerCard}>
          <ThemedText type="default" style={styles.templateTitle}>
            {template.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {template.description}
          </ThemedText>
          <View style={styles.pillsRow}>
            <Pill label={template.goal} tone="primary" />
            <Pill label={template.level} />
            <Pill label={`${template.daysPerWeek} gg/settimana`} />
            <Pill label={`${template.durationWeeks} settimane`} />
          </View>
          {template.coachNotes ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.coachNotes}>
              Nota: {template.coachNotes}
            </ThemedText>
          ) : null}
        </Card>

        {mode === 'view' ? (
          <>
            {template.sessions.map((session) => (
              <Card key={session.id} style={styles.sessionCard}>
                <ThemedText type="smallBold">{session.title}</ThemedText>
                {session.exercises.map((te, i) => {
                  const exercise = getExerciseById(te.exerciseId);
                  return (
                    <View key={`${session.id}-${i}`} style={styles.exerciseRow}>
                      <ThemedText type="small">{exercise?.name ?? te.exerciseId}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {te.sets}×{te.repsMin && te.repsMax ? `${te.repsMin}-${te.repsMax}` : te.reps} · rec {te.restSeconds}s
                      </ThemedText>
                    </View>
                  );
                })}
              </Card>
            ))}

            <Pressable onPress={() => setMode('assign')}>
              <View style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
                <ThemedText type="smallBold" themeColor="onPrimary">
                  Usa per cliente
                </ThemedText>
              </View>
            </Pressable>
          </>
        ) : (
          <Card style={styles.assignCard}>
            <ThemedText type="smallBold">Seleziona cliente</ThemedText>
            <View style={styles.chipsRow}>
              {clients.map((client) => {
                const active = client.id === clientId;
                return (
                  <Pressable
                    key={client.id}
                    onPress={() => {
                      setClientId(client.id);
                      setSubscriptionId('');
                    }}>
                    <View
                      style={[
                        styles.chip,
                        { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border },
                      ]}>
                      <ThemedText type="small" themeColor={active ? 'onPrimary' : 'text'}>
                        {clientFullName(client)}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {clientId ? (
              <>
                <ThemedText type="smallBold">Abbonamento (opzionale)</ThemedText>
                {clientSubscriptions.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Questo cliente non ha ancora un abbonamento. Puoi comunque procedere senza collegarlo.
                  </ThemedText>
                ) : (
                  <View style={styles.chipsRow}>
                    {clientSubscriptions.map((subscription) => {
                      const active = subscription.id === subscriptionId;
                      return (
                        <Pressable key={subscription.id} onPress={() => setSubscriptionId(active ? '' : subscription.id)}>
                          <View
                            style={[
                              styles.chip,
                              { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border },
                            ]}>
                            <ThemedText type="small" themeColor={active ? 'onPrimary' : 'text'}>
                              {subscription.packageName} ({SUBSCRIPTION_STATUS_LABEL[subscription.status]})
                            </ThemedText>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </>
            ) : null}

            <ThemedText type="small" themeColor="textSecondary">
              Verranno create {template.sessions.length} schede per il cliente (data odierna, scadenza a {template.durationWeeks}{' '}
              settimane): dopo la creazione potrai modificare esercizi, serie, ripetizioni, recuperi, cardio, data e ora di ciascuna
              da "Modifica scheda", senza toccare il modello originale.
            </ThemedText>

            {error ? (
              <ThemedText type="small" themeColor="statusExpired">
                {error}
              </ThemedText>
            ) : null}

            <View style={styles.assignActionsRow}>
              <Pressable onPress={() => setMode('view')} style={styles.cancelButtonWrap} disabled={saving}>
                <View style={[styles.secondaryButton, { borderColor: theme.border }]}>
                  <ThemedText type="smallBold">Annulla</ThemedText>
                </View>
              </Pressable>
              <Pressable onPress={handleConfirmAssign} disabled={!clientId || saving} style={styles.confirmButtonWrap}>
                <View style={[styles.primaryButton, { backgroundColor: clientId ? theme.primary : theme.border }]}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <ThemedText type="smallBold" themeColor="onPrimary">
                      Salva piano personalizzato per il cliente
                    </ThemedText>
                  )}
                </View>
              </Pressable>
            </View>
          </Card>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  headerCard: {
    gap: Spacing.two,
  },
  templateTitle: {
    fontWeight: '700',
    fontSize: 19,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  coachNotes: {
    fontStyle: 'italic',
  },
  sessionCard: {
    gap: 6,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  primaryButton: {
    borderRadius: Radius.md,
    padding: Spacing.three,
    alignItems: 'center',
  },
  secondaryButton: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    alignItems: 'center',
  },
  assignCard: {
    gap: Spacing.three,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  assignActionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  cancelButtonWrap: {
    flex: 1,
  },
  confirmButtonWrap: {
    flex: 2,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
