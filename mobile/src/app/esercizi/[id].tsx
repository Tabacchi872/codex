import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ExerciseAttachments } from '@/components/exercise-attachments';
import { ExerciseHistory } from '@/components/exercise-history';
import { ExerciseSetLogger } from '@/components/exercise-set-logger';
import { ExerciseVideoPlayer } from '@/components/exercise-video-player';
import { Pill } from '@/components/pill';
import { PlaceholderBanner } from '@/components/placeholder-banner';
import { RestTimer } from '@/components/rest-timer';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { getExerciseById } from '@/data/exercise-library';
import { useTheme } from '@/hooks/use-theme';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzato',
};

type InfoTab = 'esecuzione' | 'descrizione';

export default function EsercizioDettaglioScreen() {
  const { id, planId } = useLocalSearchParams<{ id: string; planId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const clients = useClientStore((s) => s.clients);
  const currentRole = useAuthStore((s) => s.currentRole);
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [infoTab, setInfoTab] = useState<InfoTab>('esecuzione');
  const [restToken, setRestToken] = useState<number>();

  const exercise = getExerciseById(id);

  if (!exercise) {
    return (
      <ScreenBackground>
        <ThemedView style={styles.notFound}>
          <ThemedText type="default">Esercizio non trovato.</ThemedText>
        </ThemedView>
      </ScreenBackground>
    );
  }

  // Un cliente vede solo la propria assegnazione, mai quella di altri clienti.
  const allAssignments = workoutPlans.flatMap((plan) =>
    plan.exercises.filter((we) => we.exerciseId === exercise.id).map((we) => ({ plan, workoutExercise: we }))
  );
  const assignments =
    currentRole === 'cliente' ? allAssignments.filter((a) => a.plan.clientId === currentClientId) : allAssignments;

  const selected = assignments[selectedIndex] ?? assignments[0] ?? null;
  const selectedClient = selected ? getClientById(clients, selected.plan.clientId) : null;

  // Navigazione sequenziale tra gli esercizi della STESSA scheda: attiva solo
  // quando si arriva qui da schede/[id].tsx (client, planId nell'URL), mai per
  // il coach e mai se l'esercizio viene aperto da un altro punto dell'app
  // (dove "avanti/indietro nella scheda" non avrebbe senso).
  const sessionPlan = currentRole === 'cliente' && planId ? workoutPlans.find((p) => p.id === planId) : null;
  const sessionOrder = sessionPlan ? [...sessionPlan.exercises].sort((a, b) => a.order - b.order) : [];
  const sessionPosition = sessionOrder.findIndex((we) => we.exerciseId === exercise.id);
  const nextInSession = sessionPosition >= 0 ? sessionOrder[sessionPosition + 1] : undefined;
  const prevInSession = sessionPosition >= 0 ? sessionOrder[sessionPosition - 1] : undefined;

  return (
    <ScreenBackground>
    <ScrollView
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.two,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.five,
        },
      ]}>
      <Stack.Screen options={{ title: exercise.name }} />

      <View style={styles.badgeRow}>
        <Pill label={exercise.muscleGroup} />
        <Pill label={exercise.equipment} />
        <Pill label={DIFFICULTY_LABEL[exercise.difficulty]} />
      </View>

      <ExerciseVideoPlayer videoFile={exercise.videoFile} />

      <View style={styles.infoTabsRow}>
        <InfoTabButton label="Esecuzione" active={infoTab === 'esecuzione'} onPress={() => setInfoTab('esecuzione')} />
        <InfoTabButton label="Descrizione" active={infoTab === 'descrizione'} onPress={() => setInfoTab('descrizione')} />
      </View>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {infoTab === 'esecuzione' ? exercise.technicalNotes : exercise.description}
        </ThemedText>
      </Card>

      {assignments.length === 0 ? (
        <PlaceholderBanner text="Esercizio non ancora assegnato in nessuna scheda cliente: timer e storico si attivano quando fa parte di una scheda." />
      ) : (
        <>
          {assignments.length > 1 && (
            <View style={styles.chipsRow}>
              {assignments.map((a, index) => {
                const client = getClientById(clients, a.plan.clientId);
                const active = index === selectedIndex;
                return (
                  <Pressable key={a.workoutExercise.id} onPress={() => setSelectedIndex(index)}>
                    <View
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? theme.primary : theme.backgroundElement,
                          borderColor: active ? theme.primary : theme.border,
                        },
                      ]}>
                      <ThemedText type="small" themeColor={active ? 'onPrimary' : 'text'}>
                        {client ? clientFullName(client) : 'Cliente'}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {selected && (
            <>
              <Card>
                <ThemedText type="smallBold">
                  Assegnato a {selectedClient ? clientFullName(selectedClient) : 'cliente'}
                </ThemedText>
                <View style={styles.summaryRow}>
                  <SummaryStat icon="▦" label="Serie" value={String(selected.workoutExercise.sets)} />
                  <SummaryStat
                    icon="↻"
                    label="Ripetizioni"
                    value={
                      selected.workoutExercise.repsMin && selected.workoutExercise.repsMax
                        ? `${selected.workoutExercise.repsMin}–${selected.workoutExercise.repsMax}`
                        : String(selected.workoutExercise.reps)
                    }
                  />
                  <SummaryStat icon="⏱" label="Recupero" value={`${selected.workoutExercise.restSeconds}s`} />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {selected.workoutExercise.targetWeight !== null
                    ? `Peso target: ${selected.workoutExercise.targetWeight} kg`
                    : 'A corpo libero'}
                </ThemedText>
                {selected.workoutExercise.notes ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Nota: {selected.workoutExercise.notes}
                  </ThemedText>
                ) : null}
              </Card>

              <RestTimer restSeconds={selected.workoutExercise.restSeconds} autoStartToken={restToken} />

              {selectedClient && (
                <ExerciseHistory clientId={selectedClient.id} exerciseId={exercise.id} workoutPlanId={selected.plan.id} />
              )}

              {currentRole === 'cliente' && selectedClient && (
                <>
                  <ExerciseSetLogger
                    clientId={selectedClient.id}
                    exerciseId={exercise.id}
                    workoutPlanId={selected.plan.id}
                    plannedSets={selected.workoutExercise.sets}
                    restSeconds={selected.workoutExercise.restSeconds}
                    onRequestRest={() => setRestToken(Date.now())}
                  />
                  <ExerciseAttachments clientId={selectedClient.id} workoutExerciseId={selected.workoutExercise.id} />
                </>
              )}
            </>
          )}
        </>
      )}

      {sessionPlan && sessionPosition >= 0 && (
        <View style={[styles.sessionNav, { borderTopColor: theme.border }]}>
          <Pressable onPress={() => prevInSession && router.setParams({ id: prevInSession.exerciseId })} disabled={!prevInSession}>
            <ThemedText type="title" style={[styles.navArrow, !prevInSession && styles.navArrowDisabled]}>
              ‹
            </ThemedText>
          </Pressable>

          <Pressable onPress={() => router.push(`/schede/${sessionPlan.id}`)} style={styles.sessionNavCenter}>
            <View style={[styles.sessionNavButton, { backgroundColor: theme.primary }]}>
              <ThemedText type="smallBold" themeColor="onPrimary">
                {sessionPlan.startedAt ? 'Continua' : 'Inizia allenamento'}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {sessionPosition + 1}/{sessionOrder.length}
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => nextInSession && router.setParams({ id: nextInSession.exerciseId })}
            disabled={!nextInSession}>
            <ThemedText type="title" style={[styles.navArrow, { color: theme.primary }, !nextInSession && styles.navArrowDisabled]}>
              ›
            </ThemedText>
          </Pressable>
        </View>
      )}
    </ScrollView>
    </ScreenBackground>
  );
}

function InfoTabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.infoTabButton}>
      <View style={[styles.infoTabPill, { backgroundColor: active ? theme.primary : theme.backgroundElement, borderColor: active ? theme.primary : theme.border }]}>
        <ThemedText type="smallBold" themeColor={active ? 'onPrimary' : 'textSecondary'}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function SummaryStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.summaryStat}>
      <ThemedText style={[styles.summaryIcon, { color: theme.primary }]}>{icon}</ThemedText>
      <ThemedText type="smallBold" style={styles.summaryValue}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  infoTabsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: -Spacing.two,
  },
  infoTabButton: {
    flex: 1,
  },
  infoTabPill: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.two,
  },
  summaryStat: {
    alignItems: 'center',
    gap: 2,
  },
  summaryIcon: {
    fontSize: 18,
  },
  summaryValue: {
    fontSize: 18,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  sessionNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    marginTop: Spacing.two,
  },
  navArrow: {
    fontSize: 32,
    lineHeight: 36,
    paddingHorizontal: Spacing.two,
  },
  navArrowDisabled: {
    opacity: 0.25,
  },
  sessionNavCenter: {
    alignItems: 'center',
    gap: 4,
  },
  sessionNavButton: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
