import { ChevronDown, ChevronRight, Plus, Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppButton, AppCard, AppErrorState, AppTextField } from '@/components/ui';
import { useExerciseProgressHistory } from '@/hooks/use-exercise-progress-history';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { createExerciseProgressEntries, deleteExerciseProgressEntry } from '@/lib/exercise-progress-service';
import { formatDayMonth } from '@/lib/format-date';
import { useAuthStore } from '@/store/auth-store';
import { useTrainingStore } from '@/store/training-store';
import { isWorkoutExerciseCompleted, isWorkoutExerciseLockedByLibraryId, isWorkoutSessionCompleted } from '@/lib/workout-progress';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { ExerciseProgressHistory, WorkoutPlan } from '@/types/training';

type ClientLoadHistoryProps = {
  clientId: string | null | undefined;
  // Se presente, mostra SOLO questo esercizio (mai un accordion multi-
  // esercizio): usato dalla card "Storico carichi" della schermata esercizio,
  // aperta su /storico-carichi. Chiave: clientId + exerciseId, mai
  // workoutPlanId (lo storico deve includere anche schede passate/future con
  // lo stesso esercizio).
  exerciseId?: string;
  readOnly?: boolean;
  emptyMessage?: string;
};

type ExerciseLoadGroup = {
  exerciseId: string;
  exerciseName: string;
  sessions: Array<{ date: string; sets: ExerciseProgressHistory[] }>;
  lastEntry: ExerciseProgressHistory;
  bestWeight: number;
};

type SetDraft = { id: string; weight: string; reps: string };
type Option = { id: string; label: string };
type ExerciseOption = Option & {
  exerciseId: string;
  workoutExerciseId: string;
  workoutPlanId: string;
};

export function ClientLoadHistory({
  clientId,
  exerciseId,
  readOnly = true,
  emptyMessage = 'Nessun carico registrato. I carichi salvati durante gli allenamenti appariranno qui.',
}: ClientLoadHistoryProps) {
  const singleExerciseMode = Boolean(exerciseId);
  const { colors } = useAppTheme();
  const { resolve } = useExerciseResolver();
  const currentRole = useAuthStore((s) => s.currentRole);
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const currentCoachId = useAuthStore((s) => s.currentCoachId);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const { entries, loading, error, reload } = useExerciseProgressHistory(clientId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!savedMessage) return;
    const timer = setTimeout(() => setSavedMessage(null), 2600);
    return () => clearTimeout(timer);
  }, [savedMessage]);

  const groups = useMemo<ExerciseLoadGroup[]>(() => {
    if (!clientId) return [];
    const byExercise = new Map<string, ExerciseProgressHistory[]>();
    for (const entry of entries) {
      if (entry.clientId !== clientId) continue;
      if (exerciseId && entry.exerciseId !== exerciseId) continue;
      const exerciseEntries = byExercise.get(entry.exerciseId) ?? [];
      exerciseEntries.push(entry);
      byExercise.set(entry.exerciseId, exerciseEntries);
    }

    return Array.from(byExercise.entries())
      .map(([exerciseId, exerciseEntries]) => {
        const sortedEntries = [...exerciseEntries].sort(compareEntriesDesc);
        const byDate = new Map<string, ExerciseProgressHistory[]>();
        for (const entry of sortedEntries) {
          const sessionEntries = byDate.get(entry.date) ?? [];
          sessionEntries.push(entry);
          byDate.set(entry.date, sessionEntries);
        }
        const sessions = Array.from(byDate.entries())
          .map(([date, sets]) => ({ date, sets: [...sets].sort(compareSetsAsc) }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const exercise = resolve(exerciseId);
        return {
          exerciseId,
          exerciseName: exercise?.name ?? exerciseId,
          sessions,
          lastEntry: sortedEntries[0],
          bestWeight: Math.max(...sortedEntries.map((entry) => entry.weightUsed)),
        };
      })
      .filter((group): group is ExerciseLoadGroup => Boolean(group.lastEntry))
      .sort((a, b) => compareEntriesDesc(a.lastEntry, b.lastEntry));
  }, [clientId, exerciseId, entries, resolve]);

  async function confirmDelete(entry: ExerciseProgressHistory) {
    const run = async () => {
      setDeletingId(entry.id);
      const result = await deleteExerciseProgressEntry(entry.id);
      setDeletingId(null);
      if (result.ok) {
        await reload();
      }
    };

    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm('Eliminare questa serie?')) await run();
      return;
    }

    Alert.alert('Elimina serie', 'Eliminare questa serie?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: run },
    ]);
  }

  function requestCloseForm() {
    confirmDiscardDraft(formDirty, () => {
      setFormOpen(false);
      setFormDirty(false);
    });
  }

  async function handleFormSaved() {
    await reload();
    setFormOpen(false);
    setFormDirty(false);
    setSavedMessage('Carichi salvati');
  }

  if (!clientId) {
    return (
      <AppCard style={styles.emptyCard}>
        <Text style={[styles.emptyText, { color: colors.inkSoft }]}>Cliente non disponibile.</Text>
      </AppCard>
    );
  }

  if (loading && entries.length === 0) {
    return (
      <AppCard style={styles.emptyCard}>
        <Text style={[styles.emptyText, { color: colors.inkSoft }]}>Caricamento storico carichi...</Text>
      </AppCard>
    );
  }

  if (error && entries.length === 0) {
    return (
      <AppCard>
        <AppErrorState message={error} onRetry={reload} />
      </AppCard>
    );
  }

  return (
    <View style={styles.list}>
      {!singleExerciseMode ? (
        <View style={styles.historyHeader}>
          <View style={styles.historyTitleWrap}>
            <Text style={[styles.historyTitle, { color: colors.ink }]}>{formOpen ? 'Nuova registrazione' : 'Storico carichi'}</Text>
            {!formOpen ? (
              <Text style={[styles.historySubtitle, { color: colors.inkSoft }]}>Carichi registrati per esercizio e data.</Text>
            ) : null}
          </View>
          {!readOnly ? (
            <AppButton
              label={formOpen ? 'Chiudi inserimento' : 'Aggiungi carichi'}
              onPress={formOpen ? requestCloseForm : () => setFormOpen(true)}
              variant={formOpen ? 'outline' : 'primary'}
              size="md"
              icon={formOpen ? <X size={16} color={colors.ink} /> : <Plus size={16} color={colors.onMoss} />}
            />
          ) : null}
        </View>
      ) : null}

      {savedMessage ? (
        <AppCard style={styles.successCard}>
          <Text style={[styles.successText, { color: colors.moss }]}>{savedMessage}</Text>
        </AppCard>
      ) : null}

      {formOpen && !readOnly ? (
        <CoachLoadEntryForm clientId={clientId} onSaved={handleFormSaved} onCancel={requestCloseForm} onDirtyChange={setFormDirty} />
      ) : null}

      {!formOpen ? (
        <View style={styles.toolbar}>
          <AppButton label="Aggiorna" onPress={reload} variant="outline" size="sm" loading={loading} />
        </View>
      ) : null}

      {error ? (
        <AppCard style={styles.warningCard}>
          <Text style={[styles.warningText, { color: colors.rust }]}>{error}</Text>
          <AppButton label="Riprova" onPress={reload} variant="outline" size="sm" />
        </AppCard>
      ) : null}

      {groups.length === 0 ? (
        <AppCard style={styles.emptyCard}>
          <Text style={[styles.emptyText, { color: colors.inkSoft }]}>{emptyMessage}</Text>
        </AppCard>
      ) : (
        groups.map((group) => {
          const isOpen = singleExerciseMode ? true : Boolean(expanded[group.exerciseId]);
          const headerCopy = (
            <View style={styles.cardTitleWrap}>
              <Text style={[styles.exerciseName, { color: colors.ink }]} numberOfLines={2}>
                {group.exerciseName}
              </Text>
              <Text style={[styles.subText, { color: colors.inkSoft }]}>
                Ultima registrazione: {formatDayMonth(group.lastEntry.date)} - {group.sessions.length}{' '}
                {group.sessions.length === 1 ? 'sessione' : 'sessioni'}
              </Text>
            </View>
          );
          return (
            <AppCard key={group.exerciseId} style={styles.card}>
              {singleExerciseMode ? (
                <View style={styles.cardHeader}>{headerCopy}</View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  onPress={() => setExpanded((current) => ({ ...current, [group.exerciseId]: !isOpen }))}
                  style={({ pressed }) => [styles.cardHeader, pressed && { opacity: 0.82 }]}>
                  {headerCopy}
                  {isOpen ? <ChevronDown size={20} color={colors.inkSoft} /> : <ChevronRight size={20} color={colors.inkSoft} />}
                </Pressable>
              )}

              <View style={styles.statsGrid}>
                <LoadStat label="Ultimo carico" value={formatKg(group.lastEntry.weightUsed)} />
                <LoadStat label="Miglior carico" value={formatKg(group.bestWeight)} highlighted />
              </View>

              {isOpen ? (
                <View style={styles.sessions}>
                  {group.sessions.map((session) => {
                    const relatedPlan = workoutPlans.find((plan) => plan.id === session.sets[0]?.workoutPlanId);
                    const sessionHasPersonalBest = session.sets.some((set) => set.weightUsed === group.bestWeight);
                    return (
                      <View key={session.date} style={[styles.session, { borderColor: colors.border }]}>
                        <View style={styles.sessionHeaderRow}>
                          <View style={styles.sessionHeaderText}>
                            <Text style={[styles.sessionDate, { color: colors.ink }]}>{formatDayMonth(session.date)}</Text>
                            {relatedPlan ? (
                              <Text style={[styles.sessionPlan, { color: colors.inkSoft }]} numberOfLines={1}>
                                {formatPlanOptionLabel(relatedPlan)}
                              </Text>
                            ) : null}
                          </View>
                          {sessionHasPersonalBest ? (
                            <View style={[styles.prBadge, { backgroundColor: colors.mossSoft }]}>
                              <Text style={[styles.prBadgeText, { color: colors.moss }]}>Record personale</Text>
                            </View>
                          ) : null}
                        </View>
                        {session.sets.map((set, index) => {
                          // Ricalcolato PER SERIE (non riusa il relatedPlan del
                          // titolo sessione, quello e' sets[0] a scopo di sola
                          // etichetta): due serie della stessa data possono in
                          // teoria appartenere a workout_plan_id diversi
                          // (backfill storico + sessione reale), e
                          // canManageEntry deve valutare l'immutabilita' sulla
                          // scheda REALE di quella singola serie, mai su quella
                          // di un'altra serie dello stesso gruppo data.
                          const setPlan = workoutPlans.find((plan) => plan.id === set.workoutPlanId);
                          const canDelete = canManageEntry(set, setPlan, currentRole, currentClientId, currentCoachId);
                          return (
                            <View key={set.id} style={styles.setRow}>
                              <View style={styles.setTopRow}>
                                <Text style={[styles.setLabel, { color: colors.inkSoft }]}>Serie {set.setNumber ?? index + 1}</Text>
                                <Text style={[styles.authorLabel, { color: colors.moss }]}>{formatAuthorLabel(set, currentRole)}</Text>
                              </View>
                              <Text style={[styles.setValue, { color: colors.ink }]}>
                                {formatKg(set.weightUsed)} - {set.repsCompleted} rip.
                                {set.restUsed ? ` - Recupero ${set.restUsed}s` : ''}
                              </Text>
                              {set.notes.trim() ? (
                                <Text style={[styles.notes, { color: colors.inkSoft }]} numberOfLines={3}>
                                  {set.notes}
                                </Text>
                              ) : null}
                              {canDelete ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="Elimina serie"
                                  disabled={deletingId === set.id}
                                  onPress={() => confirmDelete(set)}
                                  style={styles.deleteButton}>
                                  <Trash2 size={14} color={colors.rust} />
                                  <Text style={[styles.deleteLabel, { color: colors.rust }]}>
                                    {deletingId === set.id ? 'Eliminazione...' : 'Elimina'}
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </AppCard>
          );
        })
      )}
    </View>
  );
}

function CoachLoadEntryForm({
  clientId,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  clientId: string;
  onSaved: () => Promise<void>;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { colors } = useAppTheme();
  const { resolve } = useExerciseResolver();
  const { width } = useWindowDimensions();
  const compactFields = width < 420;
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const plans = useMemo(() => workoutPlans.filter((plan) => plan.clientId === clientId), [clientId, workoutPlans]);
  const planOptions = useMemo(() => uniqueOptionsById(plans.map((plan) => ({ id: plan.id, label: formatPlanOptionLabel(plan) }))), [plans]);
  const [planId, setPlanId] = useState('');
  const selectedPlan = plans.find((plan) => plan.id === planId) ?? plans[0] ?? null;
  const exerciseOptions = useMemo<ExerciseOption[]>(() => {
    if (!selectedPlan) return [];
    const occurrencesByExerciseId = new Map<string, number>();
    for (const item of selectedPlan.exercises) {
      occurrencesByExerciseId.set(item.exerciseId, (occurrencesByExerciseId.get(item.exerciseId) ?? 0) + 1);
    }

    return selectedPlan.exercises.map((item) => {
      const baseLabel = resolve(item.exerciseId)?.name ?? item.exerciseId;
      const isRepeatedExercise = (occurrencesByExerciseId.get(item.exerciseId) ?? 0) > 1;
      return {
        id: buildWorkoutExerciseOptionId(selectedPlan.id, item.id),
        label: isRepeatedExercise ? `${baseLabel} - posizione ${item.order + 1}` : baseLabel,
        exerciseId: item.exerciseId,
        workoutExerciseId: item.id,
        workoutPlanId: selectedPlan.id,
      };
    });
  }, [resolve, selectedPlan]);
  const [exerciseOptionId, setExerciseOptionId] = useState('');
  const selectedExerciseOption = exerciseOptions.find((option) => option.id === exerciseOptionId) ?? exerciseOptions[0] ?? null;
  const selectedExercise =
    selectedPlan?.exercises.find((item) => item.id === selectedExerciseOption?.workoutExerciseId) ?? selectedPlan?.exercises[0] ?? null;
  const selectedExerciseLocked = selectedPlan ? isWorkoutExerciseCompleted(selectedPlan, selectedExerciseOption?.workoutExerciseId ?? null) : false;
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<SetDraft[]>([createSetDraft(1)]);
  const [nextDraftId, setNextDraftId] = useState(2);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDirty = useMemo(() => rows.some((row) => row.weight.trim() || row.reps.trim()) || notes.trim().length > 0, [notes, rows]);

  useEffect(() => {
    if (selectedPlan && planId !== selectedPlan.id) setPlanId(selectedPlan.id);
    if (selectedExerciseOption && exerciseOptionId !== selectedExerciseOption.id) setExerciseOptionId(selectedExerciseOption.id);
  }, [exerciseOptionId, planId, selectedExerciseOption, selectedPlan]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  async function handleSave() {
    if (!selectedPlan || !selectedExercise || !selectedExerciseOption || saving) return;
    if (selectedExerciseLocked) {
      setError(isWorkoutSessionCompleted(selectedPlan) ? 'Workout completato: questa sessione non è più modificabile.' : 'Esercizio completato: non è più modificabile.');
      return;
    }
    const validRows = rows
      .map((row, index) => ({
        index,
        weight: Number(row.weight.replace(',', '.')),
        reps: Number(row.reps),
      }))
      .filter((row) => Number.isFinite(row.weight) && Number.isFinite(row.reps) && row.weight > 0 && row.reps > 0);

    if (validRows.length === 0) {
      setError('Inserisci almeno una serie valida.');
      return;
    }

    setSaving(true);
    setError(null);
    const performedAt = `${sessionDate}T12:00:00.000Z`;
    const result = await createExerciseProgressEntries(
      validRows.map((row) => ({
        clientId,
        workoutPlanId: selectedExerciseOption.workoutPlanId,
        exerciseId: selectedExerciseOption.exerciseId,
        workoutExerciseId: selectedExerciseOption.workoutExerciseId,
        setNumber: row.index + 1,
        weightKg: row.weight,
        repsCompleted: row.reps,
        restSeconds: selectedExercise.restSeconds,
        notes,
        sessionDate,
        performedAt,
      })),
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await onSaved();
  }

  if (plans.length === 0) {
    return (
      <AppCard style={styles.warningCard}>
        <Text style={[styles.warningText, { color: colors.inkSoft }]}>Assegna una scheda al cliente per registrare carichi da coach.</Text>
      </AppCard>
    );
  }

  return (
    <AppCard style={styles.formCard}>
      <View style={styles.formHeader}>
        <Text style={[styles.formTitle, { color: colors.ink }]}>Nuova registrazione</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi inserimento carichi"
          onPress={onCancel}
          hitSlop={8}
          style={[styles.formCloseButton, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
          <X size={18} color={colors.ink} />
        </Pressable>
      </View>
      <SelectField
        label="Scheda"
        options={planOptions}
        value={selectedPlan?.id ?? ''}
        onChange={(value) => {
          setPlanId(value);
          const nextPlan = plans.find((plan) => plan.id === value);
          const nextExercise = nextPlan?.exercises[0] ?? null;
          setExerciseOptionId(nextPlan && nextExercise ? buildWorkoutExerciseOptionId(nextPlan.id, nextExercise.id) : '');
        }}
      />
      <SelectField
        label="Esercizio"
        options={exerciseOptions}
        value={selectedExerciseOption?.id ?? ''}
        onChange={setExerciseOptionId}
      />
      <AppTextField label="Data" value={sessionDate} onChangeText={setSessionDate} placeholder="YYYY-MM-DD" />
      {selectedExerciseLocked ? (
        <AppCard style={styles.lockedCard}>
          <Text style={[styles.warningText, { color: colors.ink }]}>
            {isWorkoutSessionCompleted(selectedPlan) ? 'Workout completato' : 'Esercizio completato'}
          </Text>
          <Text style={[styles.warningText, { color: colors.inkSoft }]}>Le serie di questa sessione non possono essere modificate.</Text>
        </AppCard>
      ) : (
        <>
          {rows.map((row, index) => (
            <View key={row.id} style={[styles.seriesCard, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
              <View style={styles.seriesHeader}>
                <Text style={[styles.seriesTitle, { color: colors.ink }]}>Serie {index + 1}</Text>
                {rows.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Elimina serie ${index + 1}`}
                    onPress={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                    hitSlop={8}
                    style={styles.removeSeriesButton}>
                    <Trash2 size={15} color={colors.rust} />
                    <Text style={[styles.deleteLabel, { color: colors.rust }]}>Elimina</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={[styles.formRow, compactFields && styles.formRowStacked]}>
                <View style={styles.fieldCell}>
                  <AppTextField
                    label="Kg"
                    value={row.weight}
                    onChangeText={(value) => setRows((current) => current.map((item) => (item.id === row.id ? { ...item, weight: value } : item)))}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.fieldCell}>
                  <AppTextField
                    label="Ripetizioni"
                    value={row.reps}
                    onChangeText={(value) => setRows((current) => current.map((item) => (item.id === row.id ? { ...item, reps: value } : item)))}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aggiungi serie"
            onPress={() => {
              setRows((current) => [...current, createSetDraft(nextDraftId)]);
              setNextDraftId((current) => current + 1);
            }}
            style={styles.addSetButton}>
            <Plus size={16} color={colors.moss} />
            <Text style={[styles.addSetLabel, { color: colors.moss }]}>Aggiungi serie</Text>
          </Pressable>
          <AppTextField label="Note" value={notes} onChangeText={setNotes} multiline />
          {error ? <Text style={[styles.warningText, { color: colors.rust }]}>{error}</Text> : null}
          <View style={styles.formActions}>
            <AppButton label="Salva carichi" onPress={handleSave} loading={saving} disabled={saving} fullWidth />
            <AppButton label="Annulla" onPress={onCancel} variant="outline" disabled={saving} fullWidth />
          </View>
        </>
      )}
    </AppCard>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.id === value) ?? null;
  useEffect(() => {
    if (!__DEV__) return;
    const duplicateIds = findDuplicateOptionIds(options);
    if (duplicateIds.length > 0) {
      console.warn('[ClientLoadHistory] SelectField received duplicate option ids', { label, duplicateIds });
    }
  }, [label, options]);

  return (
    <View style={styles.optionGroup}>
      <Text style={[styles.optionLabel, { color: colors.inkSoft }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Seleziona ${label.toLowerCase()}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={[styles.selectTrigger, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.selectValue, { color: selectedOption ? colors.ink : colors.inkSoft }]} numberOfLines={2}>
          {selectedOption?.label ?? 'Seleziona'}
        </Text>
        <ChevronDown size={18} color={colors.inkSoft} />
      </Pressable>
      {open ? (
        <View style={[styles.selectMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {options.map((option) => {
            const active = option.id === value;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                style={[styles.selectOption, { backgroundColor: active ? colors.mossSoft : 'transparent', borderColor: colors.border }]}>
                <Text style={[styles.selectOptionText, { color: active ? colors.moss : colors.ink }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function uniqueOptionsById(options: Option[]) {
  return Array.from(new Map(options.map((option) => [option.id, option])).values());
}

function findDuplicateOptionIds(options: Option[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const option of options) {
    if (seen.has(option.id)) duplicates.add(option.id);
    seen.add(option.id);
  }
  return Array.from(duplicates);
}

function buildWorkoutExerciseOptionId(workoutPlanId: string, workoutExerciseId: string) {
  return `${workoutPlanId}:${workoutExerciseId}`;
}

function createSetDraft(sequence: number): SetDraft {
  return { id: `set-draft-${sequence}`, weight: '', reps: '' };
}

function formatPlanOptionLabel(plan: WorkoutPlan) {
  return plan.dayLabel ? `${plan.name} - ${plan.dayLabel}` : plan.name;
}

function confirmDiscardDraft(isDirty: boolean, onConfirm: () => void) {
  if (!isDirty) {
    onConfirm();
    return;
  }

  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    if (window.confirm('Chiudere senza salvare i carichi inseriti?')) onConfirm();
    return;
  }

  Alert.alert('Chiudi inserimento', 'Chiudere senza salvare i carichi inseriti?', [
    { text: 'Continua a modificare', style: 'cancel' },
    { text: 'Chiudi', style: 'destructive', onPress: onConfirm },
  ]);
}

function LoadStat({ label, value, highlighted = false }: { label: string; value: string; highlighted?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.stat, { backgroundColor: highlighted ? colors.mossSoft : colors.surfaceSubtle, borderColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.statValue, { color: highlighted ? colors.moss : colors.ink }]}>{value}</Text>
    </View>
  );
}

function canManageEntry(
  entry: ExerciseProgressHistory,
  plan: WorkoutPlan | null | undefined,
  role: string | null,
  currentClientId: string | null,
  currentCoachId: string | null,
) {
  if (!plan || isWorkoutSessionCompleted(plan) || isWorkoutExerciseLockedByLibraryId(plan, entry.exerciseId)) return false;
  if (role === 'cliente') return entry.createdByRole === 'client' && entry.createdBy === currentClientId;
  if (role === 'coach') return entry.createdByRole === 'coach' && entry.createdBy === currentCoachId;
  return false;
}

function formatAuthorLabel(entry: ExerciseProgressHistory, role: string | null) {
  if (role === 'cliente') return entry.createdByRole === 'coach' ? 'Inserito dal coach' : 'Inserito da te';
  if (role === 'coach') return entry.createdByRole === 'client' ? 'Inserito dal cliente' : 'Inserito da te';
  return entry.createdByRole === 'coach' ? 'Inserito dal coach' : 'Inserito dal cliente';
}

function compareEntriesDesc(a: ExerciseProgressHistory, b: ExerciseProgressHistory) {
  return readEntryTime(b) - readEntryTime(a);
}

function compareSetsAsc(a: ExerciseProgressHistory, b: ExerciseProgressHistory) {
  const bySetNumber = (a.setNumber ?? Number.MAX_SAFE_INTEGER) - (b.setNumber ?? Number.MAX_SAFE_INTEGER);
  if (bySetNumber !== 0) return bySetNumber;
  return readEntryTime(a) - readEntryTime(b);
}

function readEntryTime(entry: ExerciseProgressHistory) {
  const created = new Date(entry.createdAt).getTime();
  if (Number.isFinite(created)) return created;
  const date = new Date(entry.date).getTime();
  return Number.isFinite(date) ? date : 0;
}

function formatKg(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1).replace('.', ',')} kg`;
}

const styles = StyleSheet.create({
  list: {
    gap: AppSpacing[3],
  },
  historyHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[3],
    justifyContent: 'space-between',
  },
  historyTitleWrap: {
    flex: 1,
    gap: 4,
    minWidth: 180,
  },
  historyTitle: {
    fontSize: AppFontSize.xl,
    fontWeight: '800',
    lineHeight: 28,
  },
  historySubtitle: {
    fontSize: AppFontSize.sm,
    lineHeight: 18,
  },
  toolbar: {
    alignItems: 'flex-start',
  },
  emptyCard: {
    paddingVertical: AppSpacing[5],
    gap: AppSpacing[3],
  },
  emptyText: {
    fontSize: AppFontSize.base,
    lineHeight: 22,
  },
  warningCard: {
    gap: AppSpacing[2],
  },
  lockedCard: {
    gap: AppSpacing[2],
  },
  successCard: {
    paddingVertical: AppSpacing[3],
  },
  successText: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
  warningText: {
    fontSize: AppFontSize.sm,
    lineHeight: 18,
    fontWeight: '700',
  },
  card: {
    gap: AppSpacing[3],
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  cardTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  exerciseName: {
    fontSize: AppFontSize.lg,
    fontWeight: '800',
    lineHeight: 24,
  },
  subText: {
    fontSize: AppFontSize.sm,
    lineHeight: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  stat: {
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minWidth: 0,
    padding: AppSpacing[3],
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  statValue: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
    marginTop: 2,
  },
  sessions: {
    gap: AppSpacing[3],
  },
  session: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: AppSpacing[2],
    paddingTop: AppSpacing[3],
  },
  sessionHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  sessionHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sessionDate: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
  sessionPlan: {
    fontSize: 12,
    lineHeight: 16,
  },
  prBadge: {
    borderRadius: AppRadius.pill,
    paddingHorizontal: AppSpacing[2],
    paddingVertical: 4,
  },
  prBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  setRow: {
    gap: 4,
  },
  setTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: AppSpacing[2],
  },
  setLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  authorLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  setValue: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  notes: {
    fontSize: 12,
    lineHeight: 17,
  },
  deleteButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  deleteLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  formCard: {
    gap: AppSpacing[3],
  },
  formHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[3],
    justifyContent: 'space-between',
  },
  formTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
  },
  formCloseButton: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  optionGroup: {
    gap: AppSpacing[2],
  },
  optionLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  optionPill: {
    borderRadius: AppRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
    paddingHorizontal: AppSpacing[3],
    paddingVertical: 8,
  },
  optionText: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
  selectTrigger: {
    alignItems: 'center',
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: 10,
    width: '100%',
  },
  selectValue: {
    flex: 1,
    fontSize: AppFontSize.sm,
    fontWeight: '800',
    lineHeight: 19,
    minWidth: 0,
  },
  selectMenu: {
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    width: '100%',
  },
  selectOption: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing[3],
    paddingVertical: 10,
  },
  selectOptionText: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
    lineHeight: 19,
  },
  seriesCard: {
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: AppSpacing[2],
    padding: AppSpacing[3],
  },
  seriesHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  seriesTitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
  removeSeriesButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  formRow: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  formRowStacked: {
    flexDirection: 'column',
  },
  fieldCell: {
    flex: 1,
    minWidth: 0,
  },
  addSetButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
    paddingVertical: 4,
  },
  addSetLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
  formActions: {
    gap: AppSpacing[2],
  },
});
