import { getExercisePrimaryGroup, normalizeText } from './exercise-catalog';

import type { AnatomicalMuscleId, Exercise, ExerciseMuscleGroupId } from '@/types/training';

export const MUSCLE_LABELS: Record<AnatomicalMuscleId, string> = {
  chest: 'Pettorali',
  upper_chest: 'Pettorale alto',
  lats: 'Gran dorsale',
  upper_back: 'Dorso alto',
  traps: 'Trapezi',
  front_deltoids: 'Deltoidi anteriori',
  side_deltoids: 'Deltoidi laterali',
  rear_deltoids: 'Deltoidi posteriori',
  biceps: 'Bicipiti',
  triceps: 'Tricipiti',
  forearms: 'Avambracci',
  abs: 'Addome',
  obliques: 'Obliqui',
  lower_back: 'Lombari',
  glutes: 'Glutei',
  quadriceps: 'Quadricipiti',
  hamstrings: 'Femorali',
  adductors: 'Adduttori',
  abductors: 'Abduttori',
  calves: 'Polpacci',
  hip_flexors: 'Flessori anca',
  full_body: 'Full body',
};

export const MUSCLE_OPTIONS: AnatomicalMuscleId[] = [
  'chest',
  'upper_chest',
  'lats',
  'upper_back',
  'traps',
  'front_deltoids',
  'side_deltoids',
  'rear_deltoids',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'lower_back',
  'glutes',
  'quadriceps',
  'hamstrings',
  'adductors',
  'abductors',
  'calves',
  'hip_flexors',
  'full_body',
];

export type ResolvedExerciseMuscles = {
  primary: AnatomicalMuscleId[];
  secondary: AnatomicalMuscleId[];
};

const GROUP_TO_MUSCLES: Record<ExerciseMuscleGroupId, ResolvedExerciseMuscles> = {
  petto: { primary: ['chest'], secondary: ['front_deltoids', 'triceps'] },
  dorsali: { primary: ['lats'], secondary: ['upper_back', 'biceps'] },
  trapezi: { primary: ['traps'], secondary: ['upper_back'] },
  spalle: { primary: ['side_deltoids'], secondary: ['front_deltoids', 'rear_deltoids', 'traps'] },
  bicipiti: { primary: ['biceps'], secondary: ['forearms'] },
  tricipiti: { primary: ['triceps'], secondary: [] },
  avambracci: { primary: ['forearms'], secondary: ['biceps'] },
  quadricipiti: { primary: ['quadriceps'], secondary: ['glutes', 'hamstrings', 'calves'] },
  femorali: { primary: ['hamstrings'], secondary: ['glutes', 'lower_back'] },
  glutei: { primary: ['glutes'], secondary: ['hamstrings', 'quadriceps'] },
  adduttori: { primary: ['adductors'], secondary: ['quadriceps'] },
  abduttori: { primary: ['abductors'], secondary: ['glutes'] },
  polpacci: { primary: ['calves'], secondary: [] },
  addome: { primary: ['abs'], secondary: ['obliques'] },
  obliqui: { primary: ['obliques'], secondary: ['abs'] },
  lombari: { primary: ['lower_back'], secondary: ['glutes', 'hamstrings'] },
  full_body: { primary: ['full_body'], secondary: [] },
  cardio: { primary: ['full_body'], secondary: [] },
  mobilita: { primary: [], secondary: [] },
  stretching: { primary: [], secondary: [] },
};

const NAME_RULES: { terms: string[]; primary: AnatomicalMuscleId[]; secondary?: AnatomicalMuscleId[] }[] = [
  { terms: ['panca inclinata', 'incline bench'], primary: ['upper_chest'], secondary: ['chest', 'front_deltoids', 'triceps'] },
  { terms: ['panca piana', 'bench press', 'chest press', 'piegamenti', 'push up'], primary: ['chest'], secondary: ['front_deltoids', 'triceps'] },
  { terms: ['croci'], primary: ['chest'], secondary: ['front_deltoids'] },
  { terms: ['lat machine', 'trazioni', 'pull up', 'pulley', 'rematore', 'pullover'], primary: ['lats', 'upper_back'], secondary: ['biceps', 'rear_deltoids'] },
  { terms: ['military press', 'shoulder press'], primary: ['front_deltoids', 'side_deltoids'], secondary: ['triceps', 'traps'] },
  { terms: ['alzate laterali'], primary: ['side_deltoids'], secondary: ['traps'] },
  { terms: ['alzate frontali'], primary: ['front_deltoids'], secondary: [] },
  { terms: ['reverse fly', 'face pull'], primary: ['rear_deltoids'], secondary: ['upper_back', 'traps'] },
  { terms: ['curl'], primary: ['biceps'], secondary: ['forearms'] },
  { terms: ['pushdown', 'french press', 'estensioni sopra', 'kickback'], primary: ['triceps'], secondary: [] },
  { terms: ['squat', 'front squat', 'hack squat', 'leg press', 'affondi', 'bulgarian', 'step up'], primary: ['quadriceps', 'glutes'], secondary: ['hamstrings', 'abs', 'lower_back', 'calves'] },
  { terms: ['leg extension'], primary: ['quadriceps'], secondary: [] },
  { terms: ['leg curl', 'stacco rumeno', 'good morning', 'nordic', 'hip hinge'], primary: ['hamstrings'], secondary: ['glutes', 'lower_back'] },
  { terms: ['hip thrust', 'glute bridge', 'kickback al cavo'], primary: ['glutes'], secondary: ['hamstrings', 'lower_back'] },
  { terms: ['abduzioni'], primary: ['abductors', 'glutes'], secondary: [] },
  { terms: ['sumo'], primary: ['glutes', 'adductors'], secondary: ['quadriceps'] },
  { terms: ['calf'], primary: ['calves'], secondary: [] },
  { terms: ['plank', 'dead bug', 'hollow', 'crunch', 'leg raise', 'mountain climber'], primary: ['abs'], secondary: ['obliques', 'hip_flexors'] },
  { terms: ['side plank', 'russian twist', 'pallof'], primary: ['obliques'], secondary: ['abs'] },
  { terms: ['hyperextension', 'bird dog', 'superman'], primary: ['lower_back'], secondary: ['glutes', 'hamstrings'] },
  { terms: ['tapis', 'cyclette', 'ellittica', 'vogatore', 'stair', 'corda', 'battle rope', 'burpees', 'jumping jack'], primary: ['full_body'], secondary: [] },
];

export function resolveExerciseMuscles(exercise: Exercise): ResolvedExerciseMuscles {
  const explicitPrimary = sanitizeMuscles(exercise.primaryMuscles);
  const explicitSecondary = sanitizeMuscles(exercise.secondaryMuscles).filter((muscle) => !explicitPrimary.includes(muscle));
  if (explicitPrimary.length > 0) {
    return { primary: explicitPrimary, secondary: explicitSecondary };
  }

  const name = normalizeText([exercise.name, exercise.nameEn, ...(exercise.aliases ?? [])].filter(Boolean).join(' '));
  const rule = NAME_RULES.find((item) => item.terms.some((term) => name.includes(normalizeText(term))));
  if (rule) {
    return uniqueMuscles({ primary: rule.primary, secondary: rule.secondary ?? [] });
  }

  const primaryGroup = getExercisePrimaryGroup(exercise);
  const base = GROUP_TO_MUSCLES[primaryGroup] ?? { primary: [], secondary: [] };
  const secondaryFromGroups = (exercise.secondaryMuscleGroups ?? []).flatMap((group) => GROUP_TO_MUSCLES[group]?.primary ?? []);
  return uniqueMuscles({ primary: base.primary, secondary: [...base.secondary, ...secondaryFromGroups] });
}

export function getMuscleAccessibilityLabel(muscles: ResolvedExerciseMuscles) {
  if (muscles.primary.length === 0 && muscles.secondary.length === 0) {
    return 'Muscoli coinvolti non ancora classificati.';
  }
  const primary = muscles.primary.map((muscle) => MUSCLE_LABELS[muscle]).join(', ');
  const secondary = muscles.secondary.map((muscle) => MUSCLE_LABELS[muscle]).join(', ');
  return [
    primary ? `Muscoli principali: ${primary}.` : '',
    secondary ? `Muscoli secondari: ${secondary}.` : '',
  ].filter(Boolean).join(' ');
}

export function toggleMuscle(list: AnatomicalMuscleId[], muscle: AnatomicalMuscleId) {
  return list.includes(muscle) ? list.filter((item) => item !== muscle) : [...list, muscle];
}

export function defaultPrimaryMusclesForGroup(group: ExerciseMuscleGroupId): AnatomicalMuscleId[] {
  return GROUP_TO_MUSCLES[group]?.primary ?? [];
}

function sanitizeMuscles(value: unknown): AnatomicalMuscleId[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AnatomicalMuscleId => typeof item === 'string' && MUSCLE_OPTIONS.includes(item as AnatomicalMuscleId));
}

function uniqueMuscles(value: ResolvedExerciseMuscles): ResolvedExerciseMuscles {
  const primary = Array.from(new Set(value.primary));
  const secondary = Array.from(new Set(value.secondary)).filter((muscle) => !primary.includes(muscle));
  return { primary, secondary };
}
