import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarDays, Dumbbell, Layers3 } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseThumbnail } from '@/components/exercise-thumbnail';
import { AppBadge, AppButton, AppCard, BackHeader } from '@/components/ui';
import { BottomTabInset } from '@/constants/theme';
import { DEFAULT_COACH_ID } from '@/constants/app-info';
import { getWorkoutPlanTemplateById } from '@/data/workout-plan-templates';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { getCurrentSession } from '@/lib/auth-service';
import { clientFullName } from '@/lib/client-helpers';
import { supabaseConfig } from '@/lib/supabase';
import { instantiateSessionExercises } from '@/lib/workout-template-copy';
import { createWorkoutPlan } from '@/lib/workout-plan-service';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { WorkoutPlan } from '@/types/training';

export default function ModelloDettaglioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const stackActions = width < 390;
  const { colors } = useAppTheme();
  const { resolve: resolveExercise } = useExerciseResolver();
  const clients = useClientStore((s) => s.clients);
  const addWorkoutPlan = useTrainingStore((s) => s.addWorkoutPlan);
  const [mode, setMode] = useState<'view' | 'assign'>('view');
  const [clientId, setClientId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const template = getWorkoutPlanTemplateById(id);

  if (!template) {
    return (
      <View style={[styles.notFound, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.ink }}>Modello non trovato.</Text>
      </View>
    );
  }

  const selectedTemplate = template;
  const totalExercises = selectedTemplate.sessions.reduce((sum, session) => sum + session.exercises.length, 0);
  const firstTemplateExercise = selectedTemplate.sessions[0]?.exercises[0];
  const firstExercise = firstTemplateExercise ? resolveExercise(firstTemplateExercise.exerciseId) : null;

  async function handleConfirmAssign() {
    if (!clientId) return;
    setError('');

    const today = new Date();
    const buildPlan = (sessionIndex: number): WorkoutPlan => {
      const session = selectedTemplate.sessions[sessionIndex];
      const expiry = new Date(today);
      expiry.setDate(expiry.getDate() + selectedTemplate.durationWeeks * 7);
      return {
        id: `plan-${Date.now()}-${sessionIndex}`,
        name: `${selectedTemplate.title} — ${session.title}`,
        clientId,
        coachId: DEFAULT_COACH_ID,
        startDate: today.toISOString().slice(0, 10),
        expiryDate: expiry.toISOString().slice(0, 10),
        exercises: instantiateSessionExercises(session),
      };
    };

    if (!supabaseConfig.isConfigured) {
      selectedTemplate.sessions.forEach((_, index) => addWorkoutPlan(buildPlan(index)));
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

    for (let index = 0; index < selectedTemplate.sessions.length; index++) {
      const result = await createWorkoutPlan({ ...buildPlan(index), coachId: realCoachId });
      if (!result.ok) {
        setSaving(false);
        setError(`Create ${index} su ${selectedTemplate.sessions.length} schede, poi errore: ${result.message}`);
        return;
      }
      addWorkoutPlan(result.data);
    }
    setSaving(false);
    router.replace(`/clienti/${clientId}`);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? AppSpacing[5] : insets.top + AppSpacing[3],
            paddingBottom: insets.bottom + BottomTabInset + AppSpacing[5],
          },
        ]}>
        <BackHeader title="Dettaglio modello" fallbackHref="/schede/modelli" />

        <AppCard style={styles.hero}>
          <View style={styles.heroTop}>
            {firstExercise ? (
              <ExerciseThumbnail exercise={firstExercise} exerciseId={firstExercise.id} size={86} />
            ) : (
              <View style={[styles.heroPlaceholder, { backgroundColor: colors.mossSoft }]}>
                <Dumbbell size={34} color={colors.moss} />
              </View>
            )}
            <View style={styles.heroCopy}>
              <Text style={[styles.title, { color: colors.ink }]} numberOfLines={3} ellipsizeMode="tail">
                {selectedTemplate.title}
              </Text>
              <Text style={[styles.description, { color: colors.inkSoft }]} numberOfLines={3}>
                {selectedTemplate.description}
              </Text>
            </View>
          </View>
          <View style={styles.badges}>
            <AppBadge label={selectedTemplate.goal} tone="moss" />
            <AppBadge label={selectedTemplate.level} />
            <AppBadge label={`${selectedTemplate.daysPerWeek} gg/settimana`} />
          </View>
          <View style={styles.heroStats}>
            <HeroStat icon={<Layers3 size={18} color={colors.moss} />} label="Sessioni" value={String(selectedTemplate.sessions.length)} />
            <HeroStat icon={<Dumbbell size={18} color={colors.moss} />} label="Esercizi" value={String(totalExercises)} />
            <HeroStat icon={<CalendarDays size={18} color={colors.moss} />} label="Durata" value={`${selectedTemplate.durationWeeks} sett.`} />
          </View>
          {selectedTemplate.coachNotes ? <Text style={[styles.note, { color: colors.inkSoft }]}>Nota: {selectedTemplate.coachNotes}</Text> : null}
        </AppCard>

        {mode === 'view' ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>Sessioni incluse</Text>
              <Text style={[styles.sectionCount, { color: colors.inkSoft }]}>{selectedTemplate.sessions.length}</Text>
            </View>
            {selectedTemplate.sessions.map((session, sessionIndex) => (
              <AppCard key={session.id} style={styles.sessionCard}>
                <View style={styles.sessionHeader}>
                  <View style={[styles.sessionNumber, { backgroundColor: colors.mossSoft }]}>
                    <Text style={[styles.sessionNumberText, { color: colors.moss }]}>{sessionIndex + 1}</Text>
                  </View>
                  <Text style={[styles.sessionTitle, { color: colors.ink }]} numberOfLines={2}>
                    {session.title}
                  </Text>
                </View>
                {session.exercises.map((templateExercise, exerciseIndex) => {
                  const exercise = resolveExercise(templateExercise.exerciseId);
                  return (
                    <View key={`${session.id}-${exerciseIndex}`} style={[styles.exerciseRow, exerciseIndex > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }]}>
                      {exercise ? (
                        <ExerciseThumbnail exercise={exercise} exerciseId={exercise.id} size={52} />
                      ) : (
                        <View style={[styles.exercisePlaceholder, { backgroundColor: colors.surfaceSubtle }]}>
                          <Dumbbell size={20} color={colors.inkFaint} />
                        </View>
                      )}
                      <View style={styles.exerciseCopy}>
                        <Text style={[styles.exerciseName, { color: colors.ink }]} numberOfLines={2}>
                          {exercise?.name ?? templateExercise.exerciseId}
                        </Text>
                        <Text style={[styles.exerciseMeta, { color: colors.inkSoft }]} numberOfLines={2}>
                          {templateExercise.sets} serie · {templateExercise.repsMin && templateExercise.repsMax ? `${templateExercise.repsMin}-${templateExercise.repsMax} rip.` : `${templateExercise.reps} rip.`} · recupero {templateExercise.restSeconds}s
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </AppCard>
            ))}
            <AppButton label="Usa per cliente" onPress={() => setMode('assign')} size="lg" fullWidth />
          </>
        ) : (
          <AppCard style={styles.assignCard}>
            <Text style={[styles.sectionTitle, { color: colors.ink }]}>Assegna il modello</Text>
            <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Cliente</Text>
            <View style={styles.chipsRow}>
              {clients.map((client) => {
                const active = client.id === clientId;
                return (
                  <Pressable
                    key={client.id}
                    onPress={() => {
                      setClientId(client.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Seleziona ${clientFullName(client)}`}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.moss : colors.surfaceSubtle,
                        borderColor: active ? colors.moss : colors.border,
                      },
                    ]}>
                    <Text style={[styles.chipText, { color: active ? colors.onMoss : colors.ink }]}>{clientFullName(client)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.helper, { color: colors.inkSoft }]}>
              Verranno create {selectedTemplate.sessions.length} schede reali con data odierna e scadenza tra {selectedTemplate.durationWeeks} settimane. Ogni scheda potrà poi essere modificata separatamente.
            </Text>

            {error ? <Text style={[styles.error, { color: colors.rust }]}>{error}</Text> : null}

            {saving ? (
              <View style={styles.savingRow}>
                <ActivityIndicator color={colors.moss} />
                <Text style={{ color: colors.inkSoft }}>Creazione schede…</Text>
              </View>
            ) : null}

            <View style={[styles.actions, stackActions && styles.actionsStacked]}>
              <View style={styles.actionItem}>
                <AppButton label="Annulla" onPress={() => setMode('view')} variant="outline" fullWidth disabled={saving} />
              </View>
              <View style={styles.actionItemWide}>
                <AppButton label="Crea schede" onPress={handleConfirmAssign} fullWidth disabled={!clientId || saving} />
              </View>
            </View>
          </AppCard>
        )}
      </ScrollView>
    </View>
  );
}

function HeroStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.heroStat}>
      {icon}
      <Text style={[styles.heroStatValue, { color: colors.ink }]}>{value}</Text>
      <Text style={[styles.heroStatLabel, { color: colors.inkSoft }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: AppSpacing[3], paddingHorizontal: AppSpacing[5] },
  notFound: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  hero: { gap: AppSpacing[4], padding: AppSpacing[4] },
  heroTop: { alignItems: 'center', flexDirection: 'row', gap: AppSpacing[3], minWidth: 0 },
  heroPlaceholder: { alignItems: 'center', borderRadius: AppRadius.xl, height: 86, justifyContent: 'center', width: 86 },
  heroCopy: { flex: 1, gap: AppSpacing[1], minWidth: 0 },
  title: { fontSize: 25, fontWeight: '700', lineHeight: 31, minWidth: 0 },
  description: { fontSize: AppFontSize.sm, fontWeight: '500', lineHeight: 19 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing[1] },
  heroStats: { flexDirection: 'row', gap: AppSpacing[2] },
  heroStat: { alignItems: 'center', flex: 1, gap: 2, minWidth: 0 },
  heroStatValue: { fontSize: 19, fontWeight: '800' },
  heroStatLabel: { fontSize: 12, fontWeight: '600' },
  note: { fontSize: AppFontSize.sm, fontStyle: 'italic', lineHeight: 19 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 20, fontWeight: '700', lineHeight: 25 },
  sectionCount: { fontSize: 14, fontWeight: '700' },
  sessionCard: { gap: 0, padding: AppSpacing[4] },
  sessionHeader: { alignItems: 'center', flexDirection: 'row', gap: AppSpacing[2], marginBottom: AppSpacing[2] },
  sessionNumber: { alignItems: 'center', borderRadius: 999, height: 32, justifyContent: 'center', width: 32 },
  sessionNumberText: { fontSize: 14, fontWeight: '800' },
  sessionTitle: { flex: 1, fontSize: 17, fontWeight: '700', lineHeight: 22, minWidth: 0 },
  exerciseRow: { alignItems: 'center', flexDirection: 'row', gap: AppSpacing[3], minHeight: 70, paddingVertical: AppSpacing[2] },
  exercisePlaceholder: { alignItems: 'center', borderRadius: AppRadius.lg, height: 52, justifyContent: 'center', width: 52 },
  exerciseCopy: { flex: 1, gap: 3, minWidth: 0 },
  exerciseName: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  exerciseMeta: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
  assignCard: { gap: AppSpacing[3], padding: AppSpacing[4] },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing[2] },
  chip: { borderRadius: 999, borderWidth: 1, minHeight: 40, justifyContent: 'center', maxWidth: '100%', paddingHorizontal: AppSpacing[3], paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  helper: { fontSize: AppFontSize.sm, fontWeight: '500', lineHeight: 19 },
  error: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  savingRow: { alignItems: 'center', flexDirection: 'row', gap: AppSpacing[2] },
  actions: { alignItems: 'center', flexDirection: 'row', gap: AppSpacing[2] },
  actionsStacked: { alignItems: 'stretch', flexDirection: 'column' },
  actionItem: { flex: 1, minWidth: 0 },
  actionItemWide: { flex: 1.4, minWidth: 0 },
});
