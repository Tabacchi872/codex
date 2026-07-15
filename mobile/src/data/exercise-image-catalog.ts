import { resolveImageSource } from './image-registry';

import type { Exercise } from '@/types/training';

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

const MUSCLE_PLACEHOLDERS: Record<string, { label: string; backgroundColor: string; foregroundColor: string }> = {
  petto: { label: 'PT', backgroundColor: '#1D3D18', foregroundColor: '#80EA2D' },
  dorso: { label: 'DS', backgroundColor: '#163A5D', foregroundColor: '#9DD7FF' },
  gambe: { label: 'GB', backgroundColor: '#33280B', foregroundColor: '#F0D35B' },
  spalle: { label: 'SP', backgroundColor: '#30214A', foregroundColor: '#C8A9FF' },
  bicipiti: { label: 'BI', backgroundColor: '#1E3B37', foregroundColor: '#75E5CE' },
  tricipiti: { label: 'TR', backgroundColor: '#40251F', foregroundColor: '#FFAD92' },
  'addominali-core': { label: 'CR', backgroundColor: '#26301F', foregroundColor: '#B7EB7A' },
  'cardio-funzionale': { label: 'CF', backgroundColor: '#3D1E2C', foregroundColor: '#FFAAC9' },
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

  const placeholder = MUSCLE_PLACEHOLDERS[normalizeKey(exercise.muscleGroup)] ?? {
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
