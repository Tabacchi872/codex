import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-react-native';

import { ExerciseThumbnail } from './exercise-thumbnail';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';
import { AppBadge, AppButton } from './ui';

import {
  DIFFICULTY_LABEL,
  EXERCISE_GROUP_LABEL,
  EXERCISE_GROUP_ORDER,
  equipmentOptionsFor,
  exerciseMatchesGroup,
  exerciseSourceLabel,
  getExercisePrimaryGroup,
  getExerciseSearchText,
  normalizeText,
} from '@/lib/exercise-catalog';
import { createCustomExerciseForCoach } from '@/lib/fitcoach-exercises-service';
import { defaultPrimaryMusclesForGroup, MUSCLE_LABELS, MUSCLE_OPTIONS, toggleMuscle } from '@/lib/muscle-map';
import { useTheme } from '@/hooks/use-theme';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { AnatomicalMuscleId, Difficulty, Exercise, ExerciseMuscleGroupId, ExerciseType, WorkoutExercise } from '@/types/training';

type ExerciseCatalogPickerProps = {
  exercises: Exercise[];
  existingExercises: WorkoutExercise[];
  onAdd: (exercise: Exercise, workoutExercise: WorkoutExercise) => void;
  onExerciseCreated: (exercise: Exercise) => void;
  onOpenDetails: (exerciseId: string) => void;
  onClose: () => void;
};

const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];
const EXERCISE_TYPES: ExerciseType[] = ['forza', 'cardio', 'mobilita', 'stretching'];

type CustomExerciseDraft = {
  name: string;
  group: ExerciseMuscleGroupId;
  secondary: ExerciseMuscleGroupId[];
  primaryMuscles: AnatomicalMuscleId[];
  secondaryMuscles: AnatomicalMuscleId[];
  equipment: string;
  difficulty: Difficulty;
  exerciseType: ExerciseType;
  instructions: string;
  commonMistakes: string;
};

export function ExerciseCatalogPicker({
  exercises,
  existingExercises,
  onAdd,
  onExerciseCreated,
  onOpenDetails,
  onClose,
}: ExerciseCatalogPickerProps) {
  const theme = useTheme();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const stackSelectors = width < 600;
  const groupCounts = useMemo(
    () =>
      EXERCISE_GROUP_ORDER.reduce<Record<ExerciseMuscleGroupId, number>>((acc, group) => {
        acc[group] = exercises.filter((exercise) => exerciseMatchesGroup(exercise, group)).length;
        return acc;
      }, {} as Record<ExerciseMuscleGroupId, number>),
    [exercises],
  );
  const firstGroup = EXERCISE_GROUP_ORDER.find((group) => groupCounts[group] > 0) ?? 'petto';

  const [selectedGroup, setSelectedGroup] = useState<ExerciseMuscleGroupId>(firstGroup);
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [query, setQuery] = useState('');
  const [equipmentFilter, setEquipmentFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | Difficulty>('all');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [openMenu, setOpenMenu] = useState<'exercise' | 'group' | 'equipment' | 'difficulty' | null>('group');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [duration, setDuration] = useState('');
  const [rest, setRest] = useState('60');
  const [weight, setWeight] = useState('');
  const [tempo, setTempo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMenu, setCustomMenu] = useState<'group' | 'difficulty' | 'type' | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  const [customDraft, setCustomDraft] = useState<CustomExerciseDraft>({
    name: '',
    group: selectedGroup,
    secondary: [] as ExerciseMuscleGroupId[],
    primaryMuscles: defaultPrimaryMusclesForGroup(selectedGroup),
    secondaryMuscles: [],
    equipment: '',
    difficulty: 'beginner' as Difficulty,
    exerciseType: 'forza' as ExerciseType,
    instructions: '',
    commonMistakes: '',
  });

  const groupExercises = useMemo(
    () => exercises.filter((exercise) => exerciseMatchesGroup(exercise, selectedGroup)).sort((a, b) => a.name.localeCompare(b.name, 'it')),
    [exercises, selectedGroup],
  );
  const equipmentOptions = useMemo(() => equipmentOptionsFor(groupExercises), [groupExercises]);
  const filteredExercises = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    return groupExercises.filter((exercise) => {
      if (equipmentFilter !== 'all' && exercise.equipment !== equipmentFilter) return false;
      if (difficultyFilter !== 'all' && exercise.difficulty !== difficultyFilter) return false;
      if (!normalizedQuery) return true;
      return normalizeText(getExerciseSearchText(exercise)).includes(normalizedQuery);
    });
  }, [difficultyFilter, equipmentFilter, groupExercises, query]);
  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId) ?? null;
  const selectableGroups = useMemo(
    () => EXERCISE_GROUP_ORDER.filter((group) => (groupCounts[group] ?? 0) > 0),
    [groupCounts],
  );

  function selectGroup(group: ExerciseMuscleGroupId) {
    if (group === selectedGroup) return;
    setSelectedGroup(group);
    setSelectedExerciseId('');
    setQuery('');
    setEquipmentFilter('all');
    setDifficultyFilter('all');
    setOpenMenu(null);
    setDuration('');
    setNotes('');
    setCustomDraft((current) => ({
      ...current,
      group,
      primaryMuscles: current.primaryMuscles.length > 0 ? current.primaryMuscles : defaultPrimaryMusclesForGroup(group),
    }));
  }

  function resetParameters() {
    setSets('3');
    setReps('10');
    setDuration('');
    setRest('60');
    setWeight('');
    setTempo('');
    setNotes('');
  }

  function buildWorkoutExercise(): WorkoutExercise | null {
    if (!selectedExercise) return null;
    const parsedSets = parsePositiveInt(sets, 3);
    const parsedReps = parsePositiveInt(reps, 10);
    const parsedRest = parsePositiveInt(rest, 60);
    const parsedWeight = weight.trim() ? Number(weight.replace(',', '.')) : null;
    const parsedDuration = duration.trim() ? parsePositiveInt(duration, 0) : 0;
    const order = existingExercises.length;
    return {
      id: `we-${Date.now()}-${order}`,
      exerciseId: selectedExercise.id,
      sets: parsedSets,
      reps: parsedDuration > 0 ? 1 : parsedReps,
      repsMin: parsedDuration > 0 ? parsedDuration : undefined,
      repsMax: parsedDuration > 0 ? parsedDuration : undefined,
      targetWeight: parsedWeight !== null && Number.isFinite(parsedWeight) ? parsedWeight : null,
      restSeconds: parsedRest,
      tempo: tempo.trim() || undefined,
      notes: [notes.trim(), parsedDuration > 0 ? `Durata: ${parsedDuration}s` : ''].filter(Boolean).join('\n'),
      order,
    };
  }

  function addSelectedExercise(forceDuplicate = false) {
    if (saving || !selectedExercise) return;
    if (!forceDuplicate && existingExercises.some((item) => item.exerciseId === selectedExercise.id)) {
      const confirmAdd = () => addSelectedExercise(true);
      if (Platform.OS === 'web') {
        if (globalThis.confirm('Questo esercizio e gia presente nella scheda. Aggiungerlo comunque?')) confirmAdd();
        return;
      }
      Alert.alert('Esercizio gia presente', 'Vuoi aggiungerlo una seconda volta alla stessa scheda?', [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Aggiungi', onPress: confirmAdd },
      ]);
      return;
    }
    const workoutExercise = buildWorkoutExercise();
    if (!workoutExercise) return;
    setSaving(true);
    onAdd(selectedExercise, workoutExercise);
    setSaving(false);
    resetParameters();
  }

  async function createCustomExercise() {
    if (saving) return;
    if (!customDraft.name.trim()) {
      setCustomError('Inserisci il nome dell esercizio.');
      return;
    }
    if (customDraft.primaryMuscles.length === 0) {
      setCustomError('Seleziona almeno un muscolo principale.');
      return;
    }
    setSaving(true);
    setCustomError(null);
    const result = await createCustomExerciseForCoach({
      name: customDraft.name,
      primaryMuscleGroup: customDraft.group,
      secondaryMuscleGroups: customDraft.secondary,
      primaryMuscles: customDraft.primaryMuscles,
      secondaryMuscles: customDraft.secondaryMuscles,
      equipment: customDraft.equipment,
      difficulty: customDraft.difficulty,
      exerciseType: customDraft.exerciseType,
      instructions: customDraft.instructions,
      commonMistakes: customDraft.commonMistakes,
    });
    setSaving(false);
    if (!result.ok) {
      setCustomError(result.message);
      return;
    }
    onExerciseCreated(result.data);
    setCustomOpen(false);
    selectGroup(result.data.primaryMuscleGroup ?? customDraft.group);
    setSelectedExerciseId(result.data.id);
    setCustomDraft({
      name: '',
      group: result.data.primaryMuscleGroup ?? customDraft.group,
      secondary: [],
      primaryMuscles: defaultPrimaryMusclesForGroup(result.data.primaryMuscleGroup ?? customDraft.group),
      secondaryMuscles: [],
      equipment: '',
      difficulty: 'beginner',
      exerciseType: 'forza',
      instructions: '',
      commonMistakes: '',
    });
  }

  return (
    <View style={[styles.container, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <ThemedText type="smallBold" style={styles.title}>Catalogo esercizi</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Scegli gruppo, esercizio e parametri per la scheda.
          </ThemedText>
        </View>
        <Pressable onPress={onClose} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary">Chiudi</ThemedText>
        </Pressable>
      </View>

      <View style={[styles.selectorsRow, stackSelectors && styles.selectorsColumn]}>
        <View style={styles.selectorBlock}>
          <ThemedText type="small" themeColor="textSecondary">Esercizio</ThemedText>
          <SelectorButton label={selectedExercise ? selectedExercise.name : 'Seleziona esercizio'} open={openMenu === 'exercise'} onPress={() => setOpenMenu(openMenu === 'exercise' ? null : 'exercise')} />
          {openMenu === 'exercise' ? (
            <DropdownList>
              {filteredExercises.map((exercise) => (
                <MenuOption
                  key={exercise.id}
                  label={exercise.name}
                  meta={`${exercise.equipment || 'Attrezzatura non specificata'} · ${DIFFICULTY_LABEL[normalizeDifficulty(exercise.difficulty)]}`}
                  active={selectedExerciseId === exercise.id}
                  onPress={() => {
                    setSelectedExerciseId(exercise.id);
                    setOpenMenu(null);
                  }}
                />
              ))}
            </DropdownList>
          ) : null}
        </View>
      </View>

      <View style={styles.exerciseListBlock}>
          <View style={[styles.searchBox, { borderColor: theme.border }]}>
            <Search size={16} color={theme.textSecondary} />
            <ThemedTextInput value={query} onChangeText={setQuery} placeholder="Cerca esercizio" style={styles.searchInput} />
          </View>

          <View style={[styles.filtersPanel, { borderColor: theme.border, backgroundColor: theme.background }]}>
            <Pressable onPress={() => setFiltersOpen((current) => !current)} style={styles.filtersHeader}>
              <ThemedText type="smallBold">Filtri</ThemedText>
              <View style={styles.activeFilterWrap}>
                <ActiveFilterPill label={EXERCISE_GROUP_LABEL[selectedGroup]} onClear={() => setOpenMenu('group')} />
              </View>
              <ChevronDown size={17} color={theme.textSecondary} style={{ transform: [{ rotate: filtersOpen ? '180deg' : '0deg' }] }} />
            </Pressable>

            {filtersOpen ? (
              <View style={styles.filtersBody}>
                <View style={styles.selectorBlock}>
                  <ThemedText type="small" themeColor="textSecondary">Gruppo muscolare</ThemedText>
                  <SelectorButton label={EXERCISE_GROUP_LABEL[selectedGroup]} open={openMenu === 'group'} onPress={() => setOpenMenu(openMenu === 'group' ? null : 'group')} />
                  {openMenu === 'group' ? (
                    <DropdownList>
                      {selectableGroups.map((group) => (
                        <MenuOption
                          key={group}
                          label={EXERCISE_GROUP_LABEL[group]}
                          meta={`${groupCounts[group] ?? 0} esercizi`}
                          active={selectedGroup === group}
                          onPress={() => {
                            selectGroup(group);
                            setOpenMenu(null);
                          }}
                        />
                      ))}
                    </DropdownList>
                  ) : null}
                </View>

                <View style={styles.selectorBlock}>
                  <ThemedText type="small" themeColor="textSecondary">Attrezzatura</ThemedText>
                  <SelectorButton
                    label={equipmentFilter === 'all' ? 'Tutte attrezzature' : equipmentFilter}
                    open={openMenu === 'equipment'}
                    onPress={() => setOpenMenu(openMenu === 'equipment' ? null : 'equipment')}
                  />
                  {openMenu === 'equipment' ? (
                    <DropdownList>
                      <MenuOption label="Tutte attrezzature" active={equipmentFilter === 'all'} onPress={() => { setEquipmentFilter('all'); setOpenMenu(null); }} />
                      {equipmentOptions.map((equipment) => (
                        <MenuOption key={equipment} label={equipment} active={equipmentFilter === equipment} onPress={() => { setEquipmentFilter(equipment); setOpenMenu(null); }} />
                      ))}
                    </DropdownList>
                  ) : null}
                </View>

                <View style={styles.selectorBlock}>
                  <ThemedText type="small" themeColor="textSecondary">Difficolta</ThemedText>
                  <SelectorButton
                    label={difficultyFilter === 'all' ? 'Tutte difficolta' : DIFFICULTY_LABEL[difficultyFilter]}
                    open={openMenu === 'difficulty'}
                    onPress={() => setOpenMenu(openMenu === 'difficulty' ? null : 'difficulty')}
                  />
                  {openMenu === 'difficulty' ? (
                    <DropdownList>
                      <MenuOption label="Tutte difficolta" active={difficultyFilter === 'all'} onPress={() => { setDifficultyFilter('all'); setOpenMenu(null); }} />
                      {DIFFICULTIES.map((difficulty) => (
                        <MenuOption key={difficulty} label={DIFFICULTY_LABEL[difficulty]} active={difficultyFilter === difficulty} onPress={() => { setDifficultyFilter(difficulty); setOpenMenu(null); }} />
                      ))}
                    </DropdownList>
                  ) : null}
                </View>

                <View style={[styles.actionRow, width < 390 && styles.actionColumn]}>
                  <AppButton
                    label="Annulla"
                    variant="outline"
                    fullWidth
                    onPress={() => {
                      setEquipmentFilter('all');
                      setDifficultyFilter('all');
                      setOpenMenu(null);
                    }}
                  />
                  <AppButton
                    label="Applica filtri"
                    fullWidth
                    onPress={() => {
                      setFiltersOpen(false);
                      setOpenMenu(null);
                    }}
                  />
                </View>
              </View>
            ) : null}
          </View>

          {groupExercises.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">Nessun esercizio disponibile per questo gruppo.</ThemedText>
          ) : filteredExercises.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">Nessun esercizio corrisponde alla ricerca o ai filtri.</ThemedText>
          ) : (
            filteredExercises.map((exercise) => (
              <Pressable
                key={exercise.id}
                onPress={() => setSelectedExerciseId(exercise.id)}
                style={[
                  styles.exerciseRow,
                  {
                    borderColor: selectedExerciseId === exercise.id ? theme.primary : theme.border,
                    backgroundColor: selectedExerciseId === exercise.id ? theme.backgroundSelected : theme.background,
                  },
                ]}>
                <ExerciseThumbnail exercise={exercise} exerciseId={exercise.id} size={54} />
                <View style={styles.exerciseRowCopy}>
                  <ThemedText type="smallBold" numberOfLines={2}>{exercise.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {exercise.equipment || 'Attrezzatura non specificata'} · {DIFFICULTY_LABEL[normalizeDifficulty(exercise.difficulty)]}
                  </ThemedText>
                </View>
                <AppBadge label={exerciseSourceLabel(exercise)} tone={exercise.source === 'custom' ? 'amber' : 'moss'} />
              </Pressable>
            ))
          )}
      </View>

      {selectedExercise ? (
        <View style={[styles.previewCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
          <View style={styles.previewHeader}>
            <ExerciseThumbnail exercise={selectedExercise} exerciseId={selectedExercise.id} size={72} />
            <View style={styles.previewCopy}>
              <ThemedText type="smallBold" style={styles.previewTitle} numberOfLines={2}>{selectedExercise.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {EXERCISE_GROUP_LABEL[getExercisePrimaryGroup(selectedExercise)]}
                {selectedExercise.secondaryMuscleGroups?.length ? ` · ${selectedExercise.secondaryMuscleGroups.map((group) => EXERCISE_GROUP_LABEL[group]).join(', ')}` : ''}
              </ThemedText>
              <View style={styles.badgeRow}>
                <AppBadge label={DIFFICULTY_LABEL[normalizeDifficulty(selectedExercise.difficulty)]} tone="neutral" />
                <AppBadge label={selectedExercise.equipment || 'Nessuna attrezzatura'} tone="neutral" />
              </View>
            </View>
          </View>
          <Text style={[styles.instructions, { color: colors.inkSoft }]} numberOfLines={3}>
            {selectedExercise.description || selectedExercise.technicalNotes || 'Istruzioni non disponibili.'}
          </Text>

          <View style={[styles.paramRow, width < 390 && styles.paramColumn]}>
            <ParamField label="Serie" value={sets} onChangeText={setSets} keyboardType="number-pad" />
            <ParamField label="Ripetizioni" value={reps} onChangeText={setReps} keyboardType="number-pad" />
          </View>
          <View style={[styles.paramRow, width < 390 && styles.paramColumn]}>
            <ParamField label="Durata sec." value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="opz." />
            <ParamField label="Recupero sec." value={rest} onChangeText={setRest} keyboardType="number-pad" />
          </View>
          <View style={[styles.paramRow, width < 390 && styles.paramColumn]}>
            <ParamField label="Carico kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="opz." />
            <ParamField label="Tempo" value={tempo} onChangeText={setTempo} placeholder="2-0-2" />
          </View>
          <ParamField label="Note" value={notes} onChangeText={setNotes} multiline placeholder="Note per questa scheda" />

          <View style={[styles.actionRow, width < 390 && styles.actionColumn]}>
            <AppButton label="Visualizza dettagli" onPress={() => onOpenDetails(selectedExercise.id)} variant="outline" fullWidth icon={<ChevronRight size={16} color={colors.ink} />} />
            <AppButton label="Aggiungi alla scheda" onPress={() => addSelectedExercise()} loading={saving} fullWidth />
          </View>
        </View>
      ) : null}

      <Pressable onPress={() => setCustomOpen((current) => !current)} style={[styles.customToggle, { borderColor: theme.border }]}>
        <Plus size={17} color={theme.primary} />
        <ThemedText type="smallBold" style={{ color: theme.primary }}>Crea esercizio personalizzato</ThemedText>
      </Pressable>

      {customOpen ? (
        <View style={[styles.customForm, { borderColor: theme.border }]}>
          <ThemedText type="smallBold">Nuovo esercizio privato</ThemedText>
          <ParamField label="Nome" value={customDraft.name} onChangeText={(name) => setCustomDraft((current) => ({ ...current, name }))} />
          <ParamField label="Attrezzatura" value={customDraft.equipment} onChangeText={(equipment) => setCustomDraft((current) => ({ ...current, equipment }))} />
          <ParamField label="Istruzioni" value={customDraft.instructions} onChangeText={(instructions) => setCustomDraft((current) => ({ ...current, instructions }))} multiline />
          <ParamField label="Errori comuni" value={customDraft.commonMistakes} onChangeText={(commonMistakes) => setCustomDraft((current) => ({ ...current, commonMistakes }))} multiline />
          <View style={styles.selectorBlock}>
            <ThemedText type="small" themeColor="textSecondary">Gruppo muscolare</ThemedText>
            <SelectorButton label={EXERCISE_GROUP_LABEL[customDraft.group]} open={customMenu === 'group'} onPress={() => setCustomMenu(customMenu === 'group' ? null : 'group')} />
            {customMenu === 'group' ? (
              <DropdownList>
                {EXERCISE_GROUP_ORDER.map((group) => (
                  <MenuOption
                    key={group}
                    label={EXERCISE_GROUP_LABEL[group]}
                    active={customDraft.group === group}
                    onPress={() => {
                      setCustomDraft((current) => ({
                        ...current,
                        group,
                        primaryMuscles: current.primaryMuscles.length > 0 ? current.primaryMuscles : defaultPrimaryMusclesForGroup(group),
                      }));
                      setCustomMenu(null);
                    }}
                  />
                ))}
              </DropdownList>
            ) : null}
          </View>
          <MuscleMultiSelect
            title="Muscoli principali"
            selected={customDraft.primaryMuscles}
            disabled={[]}
            onToggle={(muscle) => {
              setCustomDraft((current) => {
                const primaryMuscles = toggleMuscle(current.primaryMuscles, muscle);
                return {
                  ...current,
                  primaryMuscles,
                  secondaryMuscles: current.secondaryMuscles.filter((item) => !primaryMuscles.includes(item)),
                };
              });
              setCustomError(null);
            }}
          />
          <MuscleMultiSelect
            title="Muscoli secondari"
            selected={customDraft.secondaryMuscles}
            disabled={customDraft.primaryMuscles}
            onToggle={(muscle) => {
              if (customDraft.primaryMuscles.includes(muscle)) return;
              setCustomDraft((current) => ({ ...current, secondaryMuscles: toggleMuscle(current.secondaryMuscles, muscle) }));
            }}
          />
          <View style={styles.selectorBlock}>
            <ThemedText type="small" themeColor="textSecondary">Difficolta</ThemedText>
            <SelectorButton label={DIFFICULTY_LABEL[customDraft.difficulty]} open={customMenu === 'difficulty'} onPress={() => setCustomMenu(customMenu === 'difficulty' ? null : 'difficulty')} />
            {customMenu === 'difficulty' ? (
              <DropdownList>
                {DIFFICULTIES.map((difficulty) => (
                  <MenuOption key={difficulty} label={DIFFICULTY_LABEL[difficulty]} active={customDraft.difficulty === difficulty} onPress={() => { setCustomDraft((current) => ({ ...current, difficulty })); setCustomMenu(null); }} />
                ))}
              </DropdownList>
            ) : null}
          </View>
          <View style={styles.selectorBlock}>
            <ThemedText type="small" themeColor="textSecondary">Tipologia</ThemedText>
            <SelectorButton label={customDraft.exerciseType} open={customMenu === 'type'} onPress={() => setCustomMenu(customMenu === 'type' ? null : 'type')} />
            {customMenu === 'type' ? (
              <DropdownList>
                {EXERCISE_TYPES.map((exerciseType) => (
                  <MenuOption key={exerciseType} label={exerciseType} active={customDraft.exerciseType === exerciseType} onPress={() => { setCustomDraft((current) => ({ ...current, exerciseType })); setCustomMenu(null); }} />
                ))}
              </DropdownList>
            ) : null}
          </View>
          {customError ? <ThemedText type="small" themeColor="statusExpired">{customError}</ThemedText> : null}
          <AppButton label="Salva esercizio personalizzato" onPress={createCustomExercise} loading={saving} fullWidth />
        </View>
      ) : null}
    </View>
  );
}

function SelectorButton({ label, open, onPress }: { label: string; open: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.selectorButton, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <ThemedText type="smallBold" numberOfLines={1} style={styles.selectorLabel}>{label}</ThemedText>
      <ChevronDown size={17} color={theme.textSecondary} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
    </Pressable>
  );
}

function MenuOption({ label, meta, active, onPress }: { label: string; meta?: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.menuOption,
        { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? '#173B16' : '#05090C' },
      ]}>
      <View style={styles.menuOptionText}>
        <ThemedText type="smallBold" style={{ color: active ? theme.primary : theme.text }} numberOfLines={2}>
          {label}
        </ThemedText>
        {meta ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {meta}
          </ThemedText>
        ) : null}
      </View>
      {active ? <View style={[styles.activeDot, { backgroundColor: theme.primary }]} /> : null}
    </Pressable>
  );
}

function DropdownList({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.dropdownList, { borderColor: theme.border, backgroundColor: '#05090C' }]}>
      {children}
    </View>
  );
}

function ActiveFilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onClear} hitSlop={4} style={[styles.activePill, { borderColor: theme.primary, backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="small" style={{ color: theme.primary }} numberOfLines={1}>
        {label} x
      </ThemedText>
    </Pressable>
  );
}

function MuscleMultiSelect({
  title,
  selected,
  disabled,
  onToggle,
}: {
  title: string;
  selected: AnatomicalMuscleId[];
  disabled: AnatomicalMuscleId[];
  onToggle: (muscle: AnatomicalMuscleId) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.muscleSelectBlock}>
      <ThemedText type="small" themeColor="textSecondary">{title}</ThemedText>
      <View style={styles.muscleGrid}>
        {MUSCLE_OPTIONS.filter((muscle) => muscle !== 'full_body').map((muscle) => {
          const active = selected.includes(muscle);
          const isDisabled = disabled.includes(muscle);
          return (
            <Pressable
              key={muscle}
              onPress={() => !isDisabled && onToggle(muscle)}
              disabled={isDisabled}
              style={[
                styles.muscleChip,
                {
                  borderColor: active ? theme.primary : theme.border,
                  backgroundColor: active ? theme.backgroundSelected : theme.background,
                  opacity: isDisabled ? 0.42 : 1,
                },
              ]}>
              <ThemedText type="small" style={{ color: active ? theme.primary : theme.text }} numberOfLines={1}>
                {MUSCLE_LABELS[muscle]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ParamField({ label, ...props }: { label: string } & ComponentProps<typeof ThemedTextInput>) {
  return (
    <View style={styles.paramField}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <ThemedTextInput {...props} />
    </View>
  );
}

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDifficulty(value: Exercise['difficulty']): Difficulty {
  if (value === 'intermediate') return 'intermediate';
  if (value === 'advanced') return 'advanced';
  return 'beginner';
}

const styles = StyleSheet.create({
  container: {
    borderRadius: AppRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: AppSpacing[3],
    padding: AppSpacing[3],
    width: '100%',
    minWidth: 0,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    lineHeight: 23,
  },
  selectorsRow: {
    flexDirection: 'row',
    gap: AppSpacing[2],
    minWidth: 0,
  },
  selectorsColumn: {
    flexDirection: 'column',
  },
  selectorBlock: {
    gap: 5,
    minWidth: 0,
    width: '100%',
  },
  selectorButton: {
    alignItems: 'center',
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    minHeight: 46,
    paddingHorizontal: AppSpacing[3],
  },
  selectorLabel: {
    flex: 1,
    minWidth: 0,
  },
  exerciseListBlock: {
    gap: AppSpacing[2],
  },
  filtersPanel: {
    borderRadius: AppRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: AppSpacing[2],
    minWidth: 0,
    overflow: 'hidden',
    padding: AppSpacing[2],
    width: '100%',
  },
  filtersHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    minWidth: 0,
  },
  activeFilterWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[1],
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  activePill: {
    borderRadius: AppRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing[3],
  },
  filtersBody: {
    gap: AppSpacing[3],
    minWidth: 0,
    width: '100%',
  },
  verticalMenu: {
    gap: AppSpacing[2],
    minWidth: 0,
    width: '100%',
  },
  dropdownList: {
    borderRadius: AppRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 0,
    maxWidth: '100%',
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    zIndex: 5,
  },
  menuOption: {
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    minHeight: 52,
    minWidth: 0,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: AppSpacing[2],
    width: '100%',
  },
  menuOptionText: {
    flex: 1,
    minWidth: 0,
  },
  activeDot: {
    borderRadius: AppRadius.pill,
    height: 8,
    width: 8,
  },
  searchBox: {
    alignItems: 'center',
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    paddingHorizontal: AppSpacing[3],
  },
  searchInput: {
    borderWidth: 0,
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 0,
  },
  exerciseRow: {
    alignItems: 'center',
    borderRadius: AppRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    minWidth: 0,
    padding: AppSpacing[2],
  },
  exerciseRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  previewCard: {
    borderRadius: AppRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: AppSpacing[3],
    padding: AppSpacing[3],
  },
  previewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[3],
  },
  previewCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  previewTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[1],
  },
  instructions: {
    fontSize: AppFontSize.sm,
    lineHeight: 18,
  },
  paramRow: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  paramColumn: {
    flexDirection: 'column',
  },
  paramField: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  actionRow: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  actionColumn: {
    flexDirection: 'column',
  },
  customToggle: {
    alignItems: 'center',
    borderRadius: AppRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    minHeight: 44,
    paddingHorizontal: AppSpacing[3],
  },
  customForm: {
    borderRadius: AppRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: AppSpacing[3],
    padding: AppSpacing[3],
  },
  muscleSelectBlock: {
    gap: AppSpacing[2],
  },
  muscleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  muscleChip: {
    borderRadius: AppRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
});
