import { resolveImageSource } from './image-registry';

import { getExercisePrimaryGroup } from '@/lib/exercise-catalog';
import type { Exercise, ExerciseMuscleGroupId } from '@/types/training';

export type ExerciseCatalogThumbnail =
  | {
      kind: 'image';
      source: number;
      catalogId: string;
      attemptedSource: string;
    }
  | {
      kind: 'placeholder';
      catalogId: string;
      label: string;
      backgroundColor: string;
      foregroundColor: string;
      attemptedSource: string;
    };

// Chiavi = ExerciseMuscleGroupId (i 20 gruppi reali, non gli 8 valori del
// vecchio catalogo storico): risolti tramite getExercisePrimaryGroup, che
// gia' normalizza sia gli esercizi locali (italiano) sia quelli YMove
// (inglese, tramite primaryGroupFromLegacy — vedi exercise-catalog.ts) —
// cosi' un esercizio YMove mostra il colore del suo VERO gruppo muscolare
// invece di ricadere sempre sullo stesso placeholder generico 'full_body'.
const MUSCLE_PLACEHOLDERS: Record<ExerciseMuscleGroupId, { label: string; backgroundColor: string; foregroundColor: string }> = {
  petto: { label: 'PT', backgroundColor: '#1D3D18', foregroundColor: '#80EA2D' },
  dorsali: { label: 'DS', backgroundColor: '#163A5D', foregroundColor: '#9DD7FF' },
  trapezi: { label: 'TZ', backgroundColor: '#0F3A44', foregroundColor: '#6FE0D6' },
  spalle: { label: 'SP', backgroundColor: '#30214A', foregroundColor: '#C8A9FF' },
  bicipiti: { label: 'BI', backgroundColor: '#1E3B37', foregroundColor: '#75E5CE' },
  tricipiti: { label: 'TR', backgroundColor: '#40251F', foregroundColor: '#FFAD92' },
  avambracci: { label: 'AV', backgroundColor: '#3A2A12', foregroundColor: '#E8B568' },
  quadricipiti: { label: 'QD', backgroundColor: '#33280B', foregroundColor: '#F0D35B' },
  femorali: { label: 'FM', backgroundColor: '#362408', foregroundColor: '#E3C24A' },
  glutei: { label: 'GL', backgroundColor: '#402616', foregroundColor: '#F2A65A' },
  adduttori: { label: 'ADD', backgroundColor: '#3A1F2E', foregroundColor: '#E88FC0' },
  abduttori: { label: 'ABD', backgroundColor: '#22314A', foregroundColor: '#8FB8FF' },
  polpacci: { label: 'PC', backgroundColor: '#1F3A2A', foregroundColor: '#6FE0A0' },
  addome: { label: 'ADM', backgroundColor: '#26301F', foregroundColor: '#B7EB7A' },
  obliqui: { label: 'OB', backgroundColor: '#2C2A12', foregroundColor: '#D9CB5C' },
  lombari: { label: 'LM', backgroundColor: '#241F3D', foregroundColor: '#A99CF0' },
  full_body: { label: 'FB', backgroundColor: '#2A2A2A', foregroundColor: '#C9C9C9' },
  cardio: { label: 'CD', backgroundColor: '#3D1E2C', foregroundColor: '#FFAAC9' },
  mobilita: { label: 'MB', backgroundColor: '#1B3830', foregroundColor: '#6FE6C4' },
  stretching: { label: 'ST', backgroundColor: '#33203A', foregroundColor: '#D89AF0' },
};

// Fonte centrale per le anteprime esercizi. Metro accetta solo require statici:
// se l'immagine non e' nel registro non ritorniamo una source truthy, ma un
// placeholder stabile. In futuro basta popolare IMAGE_REGISTRY e questo resolver
// iniziera' a usare gli asset reali senza cambiare i componenti.
export function resolveExerciseCatalogThumbnail(exercise: Exercise): ExerciseCatalogThumbnail {
  const catalogId = normalizeCatalogId(exercise);
  const imageCandidates = buildImageCandidates(exercise, catalogId);

  for (const imageFile of imageCandidates) {
    const source = resolveImageSource(imageFile);
    if (source) {
      return { kind: 'image', source, catalogId, attemptedSource: `catalog:${imageFile}` };
    }
  }

  const placeholder = MUSCLE_PLACEHOLDERS[getExercisePrimaryGroup(exercise)] ?? {
    label: initialsFromName(exercise.name),
    backgroundColor: '#1D3D18',
    foregroundColor: '#80EA2D',
  };

  return {
    kind: 'placeholder',
    catalogId,
    attemptedSource: `catalog:${imageCandidates[0] ?? catalogId}.jpg`,
    ...placeholder,
  };
}

export function normalizeCatalogId(exercise: Exercise) {
  if (exercise.source === 'ymove' && exercise.ymoveExerciseId) return `ymove-${normalizeKey(exercise.ymoveExerciseId)}`;
  return normalizeKey(exercise.id || exercise.name);
}

function buildImageCandidates(exercise: Exercise, catalogId: string) {
  const candidates = new Set<string>();
  candidates.add(`${catalogId}.jpg`);
  candidates.add(`${catalogId}.png`);
  if (exercise.videoFile) {
    candidates.add(exercise.videoFile.replace(/\.[^.]+$/i, '.jpg'));
    candidates.add(exercise.videoFile.replace(/\.[^.]+$/i, '.png'));
  }
  return [...candidates];
}

function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function initialsFromName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.charAt(0) ?? 'E').toUpperCase() + (parts[1]?.charAt(0) ?? '').toUpperCase();
}
