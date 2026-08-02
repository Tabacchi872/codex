import type { Difficulty, Exercise, ExerciseMuscleGroupId, ExerciseType, MuscleGroup } from '@/types/training';

export const EXERCISE_GROUP_ORDER: ExerciseMuscleGroupId[] = [
  'petto',
  'dorsali',
  'trapezi',
  'spalle',
  'bicipiti',
  'tricipiti',
  'avambracci',
  'quadricipiti',
  'femorali',
  'glutei',
  'adduttori',
  'abduttori',
  'polpacci',
  'addome',
  'obliqui',
  'lombari',
  'full_body',
  'cardio',
  'mobilita',
  'stretching',
];

export const EXERCISE_GROUP_LABEL: Record<ExerciseMuscleGroupId, string> = {
  petto: 'Petto',
  dorsali: 'Dorsali',
  trapezi: 'Trapezi',
  spalle: 'Spalle',
  bicipiti: 'Bicipiti',
  tricipiti: 'Tricipiti',
  avambracci: 'Avambracci',
  quadricipiti: 'Quadricipiti',
  femorali: 'Femorali',
  glutei: 'Glutei',
  adduttori: 'Adduttori',
  abduttori: 'Abduttori',
  polpacci: 'Polpacci',
  addome: 'Addome',
  obliqui: 'Obliqui',
  lombari: 'Lombari',
  full_body: 'Full body',
  cardio: 'Cardio',
  mobilita: 'Mobilita',
  stretching: 'Stretching',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: 'Base',
  intermediate: 'Intermedio',
  advanced: 'Avanzato',
};

export const EXERCISE_TYPE_LABEL: Record<ExerciseType, string> = {
  forza: 'Forza',
  cardio: 'Cardio',
  mobilita: 'Mobilita',
  stretching: 'Stretching',
};

export function getExercisePrimaryGroup(exercise: Exercise): ExerciseMuscleGroupId {
  return exercise.primaryMuscleGroup ?? primaryGroupFromLegacy(exercise.muscleGroup);
}

// Valori inglesi REALI di public.exercises.muscle_group per i 360 esercizi
// YMove importati (verificato in produzione, 2026-08-02: primary_muscle_group
// e' NULL per tutti e 360, quindi questa e' l'UNICA fonte usata da
// getExercisePrimaryGroup per loro). Prima di questa mappa, nessuno di questi
// token inglesi veniva riconosciuto dai controlli in italiano sotto: TUTTI i
// 360 esercizi YMove ricadevano silenziosamente nel default 'full_body',
// rendendo inutile sia il filtro per gruppo muscolare sia il colore del
// placeholder in ExerciseThumbnail (tutti identici). Match esatto sul token
// normalizzato (spazi/underscore equivalenti, vedi normalizeText).
const ENGLISH_MUSCLE_GROUP_MAP: Record<string, ExerciseMuscleGroupId> = {
  chest: 'petto',
  'upper chest': 'petto',
  'lower chest': 'petto',
  back: 'dorsali',
  lats: 'dorsali',
  'lower back': 'lombari',
  'erector spinae': 'lombari',
  shoulders: 'spalle',
  'front deltoids': 'spalle',
  'lateral deltoids': 'spalle',
  'rear deltoids': 'spalle',
  biceps: 'bicipiti',
  triceps: 'tricipiti',
  forearms: 'avambracci',
  'forearm flexors': 'avambracci',
  brachioradialis: 'avambracci',
  quads: 'quadricipiti',
  quadriceps: 'quadricipiti',
  legs: 'quadricipiti',
  hamstrings: 'femorali',
  glutes: 'glutei',
  'glute med': 'glutei',
  adductors: 'adduttori',
  abductors: 'abduttori',
  calves: 'polpacci',
  abs: 'addome',
  'lower abs': 'addome',
  'rectus abdominis': 'addome',
  core: 'addome',
  'hip flexors': 'addome',
  obliques: 'obliqui',
  'full body': 'full_body',
  'cardiovascular system': 'cardio',
};

export function primaryGroupFromLegacy(group: MuscleGroup | (string & {})): ExerciseMuscleGroupId {
  const normalized = normalizeText(group);
  const byId = EXERCISE_GROUP_ORDER.find((item) => item === normalized);
  if (byId) return byId;
  const byEnglish = ENGLISH_MUSCLE_GROUP_MAP[normalized];
  if (byEnglish) return byEnglish;
  if (normalized === 'dorso') return 'dorsali';
  if (normalized.includes('petto')) return 'petto';
  if (normalized.includes('dorso') || normalized.includes('dors')) return 'dorsali';
  if (normalized.includes('spalle')) return 'spalle';
  if (normalized.includes('bicipiti')) return 'bicipiti';
  if (normalized.includes('tricipiti')) return 'tricipiti';
  if (normalized.includes('addominali') || normalized.includes('core') || normalized.includes('addome')) return 'addome';
  if (normalized.includes('cardio')) return 'cardio';
  if (normalized.includes('gambe')) return 'quadricipiti';
  return 'full_body';
}

export function legacyGroupForPrimaryGroup(group: ExerciseMuscleGroupId): MuscleGroup {
  if (group === 'petto') return 'Petto';
  if (group === 'dorsali' || group === 'trapezi' || group === 'lombari') return 'Dorso';
  if (group === 'spalle') return 'Spalle';
  if (group === 'bicipiti' || group === 'avambracci') return 'Bicipiti';
  if (group === 'tricipiti') return 'Tricipiti';
  if (group === 'addome' || group === 'obliqui') return 'Addominali/Core';
  if (group === 'cardio' || group === 'full_body' || group === 'mobilita' || group === 'stretching') return 'Cardio/Funzionale';
  return 'Gambe';
}

export function getExerciseSearchText(exercise: Exercise) {
  return [exercise.name, exercise.nameEn, exercise.equipment, exercise.description, ...(exercise.aliases ?? [])].filter(Boolean).join(' ');
}

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function exerciseMatchesGroup(exercise: Exercise, group: ExerciseMuscleGroupId) {
  return getExercisePrimaryGroup(exercise) === group;
}

export function equipmentOptionsFor(exercises: Exercise[]) {
  return Array.from(new Set(exercises.map((exercise) => exercise.equipment.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'it'));
}

export function exerciseSourceLabel(exercise: Exercise) {
  return exercise.source === 'custom' ? 'Personalizzato' : 'FitCoach';
}

export function countExercisesByGroup(exercises: Exercise[]) {
  return EXERCISE_GROUP_ORDER.reduce<Record<ExerciseMuscleGroupId, number>>((acc, group) => {
    acc[group] = exercises.filter((exercise) => exerciseMatchesGroup(exercise, group)).length;
    return acc;
  }, {} as Record<ExerciseMuscleGroupId, number>);
}

export function findLikelyDuplicateExercises(exercises: Exercise[]) {
  const byKey = new Map<string, string[]>();
  for (const exercise of exercises) {
    const names = [exercise.name, ...(exercise.aliases ?? [])].map(normalizeText).filter(Boolean);
    const canonical = names[0];
    if (!canonical) continue;
    const existing = byKey.get(canonical) ?? [];
    existing.push(exercise.id);
    byKey.set(canonical, existing);
  }
  return Array.from(byKey.entries()).filter(([, ids]) => ids.length > 1);
}
