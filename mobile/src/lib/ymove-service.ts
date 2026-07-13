import { supabase, supabaseConfig } from './supabase';

// Client della Edge Function ymove-exercises (supabase/functions/ymove-exercises/
// index.ts) — unico punto che parla con l'API YMove. La chiave YMove non
// esiste mai in questo file/nell'app mobile: vive solo come secret Supabase
// lato server. supabase.functions.invoke allega automaticamente
// l'Authorization: Bearer della sessione corrente.

export type YmoveServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

// Struttura ufficiale YMove v2 (vedi supabase/functions/ymove-exercises/
// index.ts per la normalizzazione lato server — qui i tipi combaciano 1:1
// col JSON che la Edge Function restituisce gia' pronto).
export type YmoveExerciseSummary = {
  id: string;
  title: string;
  slug: string | null;
  muscleGroup: string | null;
  equipment: string | null;
  category: string | null;
  difficulty: string | null;
  exerciseType: string[];
  hasVideo: boolean;
};

export type YmoveExerciseDetail = YmoveExerciseSummary & {
  description: string | null;
  instructions: string | null;
  importantPoints: string[] | null;
  secondaryMuscles: string[] | null;
  videoUrl: string | null;
  videoHlsUrl: string | null;
  thumbnailUrl: string | null;
  videoDurationSecs: number | null;
};

export type YmoveSearchFilters = {
  name?: string;
  muscle?: string;
  equipment?: string;
  type?: string;
  difficulty?: string;
};

const NOT_CONFIGURED_MESSAGE = 'Supabase non e\' configurato su questo ambiente: impossibile cercare nel catalogo YMove.';

function notConfigured<T>(): YmoveServiceResult<T> {
  return { ok: false, code: 'not_configured', message: NOT_CONFIGURED_MESSAGE };
}

type EdgeFunctionResponse<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function invokeYmove<T>(payload: Record<string, unknown>): Promise<YmoveServiceResult<T>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse<T>>('ymove-exercises', {
    body: payload,
  });

  if (error) {
    // supabase-js non espone sempre il body JSON dell'errore in modo uniforme
    // tra web/native: proviamo a leggerlo dal context della FunctionsHttpError,
    // altrimenti ricadiamo sul messaggio generico dell'errore di rete.
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = (await context.json()) as { message?: string; code?: string };
        return { ok: false, code: body.code ?? 'ymove_error', message: body.message ?? error.message };
      } catch {
        // corpo non leggibile, ricadi sul messaggio generico sotto
      }
    }
    return { ok: false, code: 'ymove_error', message: error.message };
  }
  if (!data) {
    return { ok: false, code: 'ymove_error', message: 'Risposta vuota dal servizio YMove.' };
  }
  if (!data.ok) {
    return { ok: false, code: data.code, message: data.message };
  }
  return { ok: true, data: data.data };
}

// Normalizzazione difensiva ANCHE qui, non solo nella Edge Function: YMove
// non garantisce che campi come exerciseType/equipment/difficulty restino
// sempre nella forma attesa (potrebbero essere null/stringa/array a seconda
// dell'esercizio o di una versione futura dell'API) — non ci si fida
// solo del parser server-side, cosi' un'eventuale funzione non ancora
// ridistribuita o un caso limite non ancora gestito lato server non fa
// crashare l'app: exerciseType e' SEMPRE string[] (mai null/undefined),
// equipment/difficulty/instructions/description sono SEMPRE string|null.
function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}

function normalizeFlexibleString(value: unknown, separator = ', '): string | null {
  if (typeof value === 'string') return value.trim() ? value : null;
  if (Array.isArray(value)) {
    const joined = value
      .filter((item): item is string => typeof item === 'string')
      .join(separator)
      .trim();
    return joined ? joined : null;
  }
  return null;
}

function normalizePlainString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Valido se ALMENO id e title esistono (stesso criterio della Edge
// Function): un risultato senza uno dei due viene scartato invece di
// propagare dati inutilizzabili alla UI.
function normalizeSummary(raw: unknown): YmoveExerciseSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = normalizePlainString(o.id);
  const title = normalizePlainString(o.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    slug: normalizePlainString(o.slug),
    muscleGroup: normalizeFlexibleString(o.muscleGroup),
    equipment: normalizeFlexibleString(o.equipment),
    category: normalizePlainString(o.category),
    difficulty: normalizeFlexibleString(o.difficulty),
    exerciseType: normalizeStringArray(o.exerciseType),
    hasVideo: o.hasVideo === true,
  };
}

function normalizeDetail(raw: unknown): YmoveExerciseDetail | null {
  const summary = normalizeSummary(raw);
  if (!summary || !raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const importantPoints = normalizeStringArray(o.importantPoints);
  const secondaryMuscles = normalizeStringArray(o.secondaryMuscles);
  return {
    ...summary,
    description: normalizeFlexibleString(o.description),
    instructions: normalizeFlexibleString(o.instructions, '\n'),
    importantPoints: importantPoints.length > 0 ? importantPoints : null,
    secondaryMuscles: secondaryMuscles.length > 0 ? secondaryMuscles : null,
    videoUrl: normalizePlainString(o.videoUrl),
    videoHlsUrl: normalizePlainString(o.videoHlsUrl),
    thumbnailUrl: normalizePlainString(o.thumbnailUrl),
    videoDurationSecs: normalizeNumber(o.videoDurationSecs),
  };
}

export async function searchYmoveExercises(filters: YmoveSearchFilters): Promise<YmoveServiceResult<YmoveExerciseSummary[]>> {
  const result = await invokeYmove<unknown>({ action: 'search', filters });
  if (!result.ok) return result;
  const rawList = Array.isArray(result.data) ? result.data : [];
  const items = rawList.map(normalizeSummary).filter((item): item is YmoveExerciseSummary => item !== null);
  return { ok: true, data: items };
}

// Usata sia per l'anteprima PRIMA di importare (coach) sia per il video live
// di un esercizio gia' assegnato (coach o cliente). Va richiamata ogni volta
// che il video viene aperto o se il player segnala un errore: gli URL YMove
// sono firmati e scadono, non vengono mai messi in cache oltre la sessione
// corrente del player.
export async function getYmoveExerciseDetail(ymoveExerciseId: string): Promise<YmoveServiceResult<YmoveExerciseDetail>> {
  const result = await invokeYmove<unknown>({ action: 'detail', id: ymoveExerciseId });
  if (!result.ok) return result;
  const detail = normalizeDetail(result.data);
  if (!detail) {
    return { ok: false, code: 'invalid_response', message: "Impossibile leggere i dati dell'esercizio da YMove." };
  }
  return { ok: true, data: detail };
}

export type YmoveTranslatableTexts = { title: string; description: string; instructions: string };

// Traduce title/description/instructions in italiano (Azure Translator, solo
// se AZURE_TRANSLATOR_KEY/REGION sono configurate lato Edge Function) —
// chiamata UNA SOLA VOLTA
// da fitcoach-exercises-service.ts al momento dell'import, mai ad ogni
// apertura dell'esercizio. Se il servizio non e' configurato o la traduzione
// fallisce, ok e' false con un code dedicato ('translation_not_configured' /
// 'translation_failed'): il chiamante deve ricadere sui testi originali,
// MAI inventare una traduzione.
export async function translateYmoveTexts(texts: YmoveTranslatableTexts): Promise<YmoveServiceResult<YmoveTranslatableTexts>> {
  return invokeYmove<YmoveTranslatableTexts>({ action: 'translate', texts });
}

// Traduzione generica array-based (2026-07-13, per l'associazione automatica
// dei video YMove, ymove-auto-link-service.ts): traduce un array di stringhe
// in QUALUNQUE direzione (from opzionale, Azure rileva la lingua se omesso),
// preservando ordine e lunghezza dell'array — usata per tradurre IT->EN i
// nomi degli esercizi locali/custom prima di cercarli nel catalogo YMove.
// Stesso principio di onesta' di translateYmoveTexts: se il servizio non e'
// configurato o la chiamata fallisce, ok e' false, il chiamante NON deve mai
// inventare una traduzione (ricade sul nome originale, accettando che la
// ricerca su YMove possa non trovare nulla di utile).
export async function translateTexts(
  texts: string[],
  from: string | null,
  to: string,
): Promise<YmoveServiceResult<string[]>> {
  const result = await invokeYmove<{ texts?: unknown }>({ action: 'translate', texts, from: from ?? undefined, to });
  if (!result.ok) return result;
  const translated = Array.isArray(result.data.texts)
    ? result.data.texts.filter((t): t is string => typeof t === 'string')
    : [];
  if (translated.length !== texts.length) {
    return { ok: false, code: 'invalid_response', message: 'Risposta di traduzione inattesa.' };
  }
  return { ok: true, data: translated };
}
