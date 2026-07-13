import AsyncStorage from '@react-native-async-storage/async-storage';

import { EXERCISE_LIBRARY } from '@/data/exercise-library';
import type { Exercise } from '@/types/training';

import {
  findExerciseVideoLinkByYmoveId,
  getCurrentCoachIdForUpload,
  getExerciseVideo,
  linkExerciseVideoToYmove,
  listExerciseVideosForCoach,
} from './exercise-video-service';
import { invalidateExerciseVideoInfo } from './exercise-video-info-cache';
import { listCustomExercisesForCoach } from './fitcoach-exercises-service';
import { supabaseConfig } from './supabase';
import { findSynonymSearchTerm, pickBestMatch } from './ymove-name-matching';
import { searchYmoveExercises, translateTexts } from './ymove-service';

// Associazione automatica dei video YMove agli esercizi del coach
// (2026-07-13), a sostituzione della ricerca/scelta manuale in ogni singolo
// esercizio: il coach non deve piu' aprire il catalogo YMove per ognuno dei
// 44 esercizi storici (data/exercise-library.ts) o dei propri esercizi
// 'custom' (public.exercises) — l'app cerca e collega da sola quando il
// punteggio di compatibilita' e' sufficientemente alto, altrimenti lascia
// l'esercizio "non associato" (mai un collegamento scelto a caso). Gli
// esercizi 'ymove' (gia' importati DA YMove, exercise.ymoveExerciseId sempre
// noto) sono esplicitamente esclusi: non hanno bisogno di alcuna ricerca.
//
// "Associa video YMove" (mobile/src/app/esercizi/[id].tsx, invariato) resta
// disponibile come fallback manuale per gli esercizi rimasti "non associati"
// o "ambigui" — il funzionamento principale e' pero' questo servizio.

export type AutoLinkSummary = {
  total: number;
  linked: number;
  alreadyLinked: number;
  notFound: number;
  ambiguous: number;
  duplicate: number;
  errors: number;
};

export type AutoLinkServiceResult = { ok: true; data: AutoLinkSummary } | { ok: false; code: string; message: string };

export type AutoLinkProgress = { processed: number; total: number };
export type AutoLinkProgressCallback = (progress: AutoLinkProgress) => void;

function emptySummary(overrides: Partial<AutoLinkSummary> = {}): AutoLinkSummary {
  return { total: 0, linked: 0, alreadyLinked: 0, notFound: 0, ambiguous: 0, duplicate: 0, errors: 0, ...overrides };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pausa tra un esercizio e il successivo (mai richieste tutte in parallelo):
// protegge sia il limite di richieste della Edge Function/YMove sia la
// fluidita' dell'interfaccia, dato che ogni iterazione e' comunque asincrona
// e cede il controllo tra un esercizio e l'altro.
const SEARCH_DELAY_MS = 150;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function lastRunStorageKey(coachId: string): string {
  return `fitcoach-ymove-autolink-last-run:${coachId}`;
}

// Vero se non e' mai stata eseguita una scansione completa per questo coach,
// o se sono passati almeno 7 giorni dall'ultima (richiesto esplicitamente:
// "riprova gli esercizi non associati dopo 7 giorni") — gli esercizi gia'
// collegati non vengono comunque mai ritoccati, la tabella exercise_videos e'
// sempre la fonte di verita' (vedi runFullScan sotto).
async function shouldRunFullScan(coachId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(lastRunStorageKey(coachId));
    if (!raw) return true;
    const last = new Date(raw).getTime();
    if (Number.isNaN(last)) return true;
    return Date.now() - last >= SEVEN_DAYS_MS;
  } catch {
    return true;
  }
}

async function markFullScanDone(coachId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(lastRunStorageKey(coachId), new Date().toISOString());
  } catch {
    // Best-effort: se il salvataggio fallisce, la prossima scansione parte
    // semplicemente prima del previsto — nessun dato perso, nessun errore
    // da mostrare al coach per un dettaglio puramente interno.
  }
}

// Sceglie il termine di ricerca inglese per un esercizio: prima il
// dizionario di sinonimi (piu' preciso, nessuna chiamata di traduzione),
// altrimenti raccoglie l'esercizio per la traduzione automatica in batch
// (UNA chiamata sola per tutti gli esercizi senza sinonimo, non una per
// esercizio). Se Azure Translator non e' configurato o la traduzione
// fallisce, ricade onestamente sul nome originale (molti nomi italiani del
// fitness sono gia' parole inglesi, es. "Squat", "Plank", "Leg press": una
// ricerca ha comunque senso, non e' un fallback inventato).
async function buildSearchTerms(exercises: Exercise[]): Promise<Map<string, string>> {
  const terms = new Map<string, string>();
  const needsTranslation: Exercise[] = [];

  for (const exercise of exercises) {
    const synonym = findSynonymSearchTerm(exercise.name);
    if (synonym) {
      terms.set(exercise.id, synonym);
    } else {
      needsTranslation.push(exercise);
    }
  }

  if (needsTranslation.length > 0) {
    const result = await translateTexts(
      needsTranslation.map((e) => e.name),
      'it',
      'en',
    );
    needsTranslation.forEach((exercise, index) => {
      const translated = result.ok ? result.data[index] : null;
      terms.set(exercise.id, translated && translated.trim() ? translated : exercise.name);
    });
  }

  return terms;
}

type AttemptOutcome = 'linked' | 'not_found' | 'ambiguous' | 'duplicate' | 'error';

// Elabora UN esercizio: cerca su YMove, applica lo scoring/le soglie
// (lib/ymove-name-matching.ts), controlla i duplicati, salva il
// collegamento. Non lancia mai un'eccezione non gestita: qualunque errore
// imprevisto viene loggato in modo sicuro e tradotto in outcome 'error',
// cosi' il chiamante (runFullScan) puo' sempre continuare con gli esercizi
// successivi.
async function attemptLink(exercise: Exercise, searchTerm: string, coachId: string): Promise<AttemptOutcome> {
  try {
    const searchResult = await searchYmoveExercises({
      name: searchTerm,
      // La difficolta' locale e' gia' in inglese ('beginner'/'intermediate'/
      // 'advanced'), compatibile col vocabolario YMove senza traduzione:
      // usata come filtro di ricerca, MAI come componente del punteggio
      // (vedi ymove-name-matching.ts).
      difficulty: typeof exercise.difficulty === 'string' ? exercise.difficulty : undefined,
    });
    if (!searchResult.ok) {
      console.log('YMOVE_AUTOLINK_SKIPPED', { exerciseId: exercise.id, reason: 'search_failed', code: searchResult.code });
      return 'error';
    }

    console.log('YMOVE_AUTOLINK_CANDIDATES', { exerciseId: exercise.id, count: searchResult.data.length });

    const best = pickBestMatch(
      { englishName: searchTerm, muscleGroup: exercise.muscleGroup, equipment: exercise.equipment },
      searchResult.data,
    );

    if (best.kind === 'not_found') {
      console.log('YMOVE_AUTOLINK_SKIPPED', { exerciseId: exercise.id, reason: 'not_found' });
      return 'not_found';
    }
    if (best.kind === 'ambiguous') {
      console.log('YMOVE_AUTOLINK_SKIPPED', {
        exerciseId: exercise.id,
        reason: 'ambiguous',
        topScore: Number(best.topScore.toFixed(3)),
        secondScore: Number(best.secondScore.toFixed(3)),
      });
      return 'ambiguous';
    }

    // Anti-duplicati (vincolo unique(coach_id, ymove_exercise_id)): se questo
    // video e' gia' collegato a un ALTRO esercizio dello stesso coach, non si
    // sovrascrive silenziosamente — si marca come duplicato e si continua.
    const duplicateCheck = await findExerciseVideoLinkByYmoveId(coachId, best.candidate.id);
    if (duplicateCheck.ok && duplicateCheck.data && duplicateCheck.data.exerciseId !== exercise.id) {
      console.log('YMOVE_AUTOLINK_SKIPPED', { exerciseId: exercise.id, reason: 'duplicate' });
      return 'duplicate';
    }

    const linkResult = await linkExerciseVideoToYmove(coachId, exercise.id, best.candidate.id, best.candidate.slug);
    if (!linkResult.ok) {
      // Rete di sicurezza per una race condition (due esecuzioni quasi
      // simultanee): il vincolo DB puo' comunque rifiutare l'insert anche
      // dopo il controllo sopra.
      if (linkResult.code === 'ymove_already_linked') {
        console.log('YMOVE_AUTOLINK_SKIPPED', { exerciseId: exercise.id, reason: 'duplicate' });
        return 'duplicate';
      }
      console.log('YMOVE_AUTOLINK_DB_RESULT', { exerciseId: exercise.id, ok: false });
      return 'error';
    }

    invalidateExerciseVideoInfo(exercise.id);
    console.log('YMOVE_AUTOLINK_MATCH', { exerciseId: exercise.id, score: Number(best.score.toFixed(3)) });
    console.log('YMOVE_AUTOLINK_DB_RESULT', { exerciseId: exercise.id, ok: true });
    return 'linked';
  } catch (err) {
    console.error('YMOVE_AUTOLINK_SKIPPED', {
      exerciseId: exercise.id,
      reason: 'exception',
      message: err instanceof Error ? err.message : String(err),
    });
    return 'error';
  }
}

function applyOutcome(summary: AutoLinkSummary, outcome: AttemptOutcome): void {
  if (outcome === 'linked') summary.linked++;
  else if (outcome === 'not_found') summary.notFound++;
  else if (outcome === 'ambiguous') summary.ambiguous++;
  else if (outcome === 'duplicate') summary.duplicate++;
  else summary.errors++;
}

async function runFullScan(onProgress?: AutoLinkProgressCallback): Promise<AutoLinkServiceResult> {
  if (!supabaseConfig.isConfigured) {
    return { ok: false, code: 'not_configured', message: "Supabase non e' configurato su questo ambiente." };
  }
  const coachId = await getCurrentCoachIdForUpload();
  if (!coachId) {
    return { ok: false, code: 'not_authenticated', message: 'Nessuna sessione coach reale trovata.' };
  }

  const shouldRun = await shouldRunFullScan(coachId);
  if (!shouldRun) {
    console.log('YMOVE_AUTOLINK_START', { skipped: true, reason: 'cooldown' });
    return { ok: true, data: emptySummary() };
  }

  console.log('YMOVE_AUTOLINK_START', {});

  const [customResult, existingLinksResult] = await Promise.all([
    listCustomExercisesForCoach(coachId),
    listExerciseVideosForCoach(coachId),
  ]);
  const customExercises = customResult.ok ? customResult.data : [];
  const existingLinks = existingLinksResult.ok ? existingLinksResult.data : {};

  // Pool completo: i 44 storici + i custom del coach. Gli esercizi gia'
  // presenti in una scheda sono sempre uno di questi due insiemi (una scheda
  // referenzia solo id locali o id Supabase custom/ymove), quindi coprirli
  // entrambi copre automaticamente anche "ogni esercizio gia' in una scheda"
  // — nessuna query separata sulle schede necessaria.
  const pool: Exercise[] = [...EXERCISE_LIBRARY, ...customExercises];
  // Esclude 'ymove' (gia' collegati via ymoveExerciseId, richiesto
  // esplicitamente) e chi ha gia' una riga in exercise_videos (video
  // caricato O collegamento YMove esistente, in entrambi i casi non va
  // rielaborato).
  const candidates = pool.filter((exercise) => exercise.source !== 'ymove' && !existingLinks[exercise.id]);

  const total = candidates.length;
  const summary = emptySummary({ total, alreadyLinked: pool.length - total });

  if (total === 0) {
    await markFullScanDone(coachId);
    console.log('YMOVE_AUTOLINK_COMPLETE', summary);
    return { ok: true, data: summary };
  }

  const searchTerms = await buildSearchTerms(candidates);

  let processed = 0;
  for (const exercise of candidates) {
    const searchTerm = searchTerms.get(exercise.id) ?? exercise.name;
    const outcome = await attemptLink(exercise, searchTerm, coachId);
    applyOutcome(summary, outcome);
    processed++;
    onProgress?.({ processed, total });
    if (processed < total) await sleep(SEARCH_DELAY_MS);
  }

  await markFullScanDone(coachId);
  console.log('YMOVE_AUTOLINK_COMPLETE', summary);
  return { ok: true, data: summary };
}

type SessionState =
  | { status: 'idle' }
  | { status: 'running'; promise: Promise<AutoLinkServiceResult> }
  | { status: 'done'; result: AutoLinkServiceResult };

let sessionState: SessionState = { status: 'idle' };

// Punto d'ingresso principale: scansione completa di tutti gli esercizi
// storici/custom del coach autenticato. Sicura da richiamare piu' volte
// (entro la stessa sessione app, una seconda chiamata mentre la prima e' in
// corso ritorna la STESSA promise, invece di duplicare il lavoro; dopo il
// completamento, ritorna il risultato gia' calcolato senza rifare alcuna
// richiesta di rete) — vedi shouldRunFullScan sopra per il cooldown di 7
// giorni che governa le esecuzioni reali tra un riavvio dell'app e l'altro.
export function autoLinkYmoveVideosForCoach(onProgress?: AutoLinkProgressCallback): Promise<AutoLinkServiceResult> {
  if (sessionState.status === 'running') return sessionState.promise;
  if (sessionState.status === 'done') return Promise.resolve(sessionState.result);

  const promise = runFullScan(onProgress)
    .then((result) => {
      sessionState = { status: 'done', result };
      return result;
    })
    .catch((err) => {
      sessionState = { status: 'idle' };
      const message = err instanceof Error ? err.message : String(err);
      const result: AutoLinkServiceResult = { ok: false, code: 'unexpected_error', message };
      return result;
    });

  sessionState = { status: 'running', promise };
  return promise;
}

const singleExerciseInFlight = new Map<string, Promise<AutoLinkServiceResult>>();

// Variante mirata per UN singolo esercizio appena creato (2026-07-13): pronta
// per essere richiamata dalla futura schermata di creazione di un esercizio
// 'custom' (non ancora costruita in questo intervento — vedi
// fitcoach-exercises-service.ts, listCustomExercisesForCoach). Bypassa
// volutamente il cooldown di 7 giorni della scansione completa (un esercizio
// appena creato non e' mai stato tentato) ma resta sicura da richiamare piu'
// volte per lo STESSO esercizio (dedup in-flight).
export function autoLinkYmoveVideoForExercise(exercise: Exercise): Promise<AutoLinkServiceResult> {
  const existing = singleExerciseInFlight.get(exercise.id);
  if (existing) return existing;

  const promise = runSingleExerciseLink(exercise).finally(() => {
    singleExerciseInFlight.delete(exercise.id);
  });
  singleExerciseInFlight.set(exercise.id, promise);
  return promise;
}

async function runSingleExerciseLink(exercise: Exercise): Promise<AutoLinkServiceResult> {
  if (!supabaseConfig.isConfigured) {
    return { ok: false, code: 'not_configured', message: "Supabase non e' configurato su questo ambiente." };
  }
  if (exercise.source === 'ymove') {
    return { ok: true, data: emptySummary({ alreadyLinked: 1 }) };
  }
  const coachId = await getCurrentCoachIdForUpload();
  if (!coachId) {
    return { ok: false, code: 'not_authenticated', message: 'Nessuna sessione coach reale trovata.' };
  }

  const existingResult = await getExerciseVideo(exercise.id);
  if (existingResult.ok && existingResult.data) {
    return { ok: true, data: emptySummary({ alreadyLinked: 1 }) };
  }

  console.log('YMOVE_AUTOLINK_START', { single: true, exerciseId: exercise.id });
  const searchTerms = await buildSearchTerms([exercise]);
  const searchTerm = searchTerms.get(exercise.id) ?? exercise.name;
  const outcome = await attemptLink(exercise, searchTerm, coachId);
  const summary = emptySummary({ total: 1 });
  applyOutcome(summary, outcome);
  console.log('YMOVE_AUTOLINK_COMPLETE', summary);
  return { ok: true, data: summary };
}
