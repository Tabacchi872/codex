import type { YmoveExerciseSummary } from './ymove-service';

// Algoritmo di matching automatico esercizio locale/custom -> esercizio
// YMove (2026-07-13). Pesi RICHIESTI esplicitamente dall'utente:
// nome 60%, gruppo muscolare 20%, attrezzatura 15%, tipologia 5% (somma 100%).
// La difficolta' NON entra nel punteggio (l'utente l'ha citata come segnale
// di ricerca, non come componente del punteggio: la lista pesata data non la
// include) — viene usata solo come filtro di ricerca in
// ymove-auto-link-service.ts, dove il valore locale (giu' in inglese,
// 'beginner'/'intermediate'/'advanced') e' gia' compatibile col vocabolario
// YMove senza bisogno di traduzione.
export const NAME_WEIGHT = 0.6;
export const MUSCLE_WEIGHT = 0.2;
export const EQUIPMENT_WEIGHT = 0.15;
export const TYPE_WEIGHT = 0.05;

// Soglie di collegamento automatico (richieste esplicitamente): il punteggio
// minimo del primo candidato deve essere >= 0.85 E la differenza col secondo
// candidato deve essere >= 0.10 (se esiste un solo candidato, il secondo
// punteggio e' trattato come 0 — la condizione di distacco e' quindi sempre
// soddisfatta quando il minimo e' gia' rispettato).
export const MIN_SCORE_THRESHOLD = 0.85;
export const MIN_SCORE_GAP = 0.1;

// Dizionario di sinonimi italiano -> inglese (richiesto esplicitamente,
// elenco base fornito dall'utente + estensioni ragionevoli per la stessa
// famiglia di esercizi). Va usato SOLO per scegliere il termine di ricerca
// migliore: non sostituisce mai il controllo del punteggio sotto — un
// sinonimo sbagliato o impreciso viene comunque scartato se il punteggio
// risultante e' sotto soglia.
export const EXERCISE_NAME_SYNONYMS: Record<string, string> = {
  'lat machine avanti': 'lat pulldown',
  'lat machine dietro': 'lat pulldown behind neck',
  'panca piana': 'bench press',
  'panca inclinata': 'incline bench press',
  'pulley basso': 'seated cable row',
  'alzate laterali': 'lateral raise',
  'alzate frontali': 'front raise',
  'leg press': 'leg press',
  'squat': 'barbell squat',
  'squat con bilanciere': 'barbell squat',
  'curl manubri': 'dumbbell curl',
  'curl bilanciere': 'barbell curl',
  'curl a martello': 'hammer curl',
  'curl al cavo': 'cable curl',
  'push down': 'triceps pushdown',
  'pushdown al cavo': 'triceps pushdown',
  'chest press': 'chest press',
  'croci con manubri': 'dumbbell fly',
  'push up': 'push up',
  'dips petto': 'chest dip',
  'dip tricipiti': 'triceps dip',
  'rematore con manubrio': 'dumbbell row',
  'trazioni assistite': 'assisted pull up',
  'vertical row': 'vertical row',
  'pullover al cavo': 'cable pullover',
  'affondi': 'lunge',
  'leg extension': 'leg extension',
  'leg curl': 'leg curl',
  'calf raise': 'calf raise',
  'hip thrust': 'hip thrust',
  'stacco rumeno': 'romanian deadlift',
  'shoulder press': 'shoulder press',
  'reverse fly': 'reverse fly',
  'tirate al mento': 'upright row',
  'french press': 'skull crusher',
  'estensioni sopra la testa': 'overhead triceps extension',
  crunch: 'crunch',
  plank: 'plank',
  'leg raise': 'leg raise',
  'russian twist': 'russian twist',
  'mountain climber': 'mountain climber',
  'tapis roulant': 'treadmill',
  cyclette: 'stationary bike',
  ellittica: 'elliptical trainer',
  'battle rope': 'battle rope',
  burpees: 'burpee',
  'jumping jack': 'jumping jack',
};

// Dizionario di parole chiave IT -> EN per l'attrezzatura (usato SOLO per lo
// scoring, mai per filtrare la ricerca: il vocabolario esatto di YMove non e'
// noto a priori, un filtro rigido rischierebbe zero risultati validi).
const EQUIPMENT_KEYWORDS_EN: Record<string, string[]> = {
  bilanciere: ['barbell'],
  manubri: ['dumbbell'],
  manubrio: ['dumbbell'],
  cavo: ['cable'],
  panca: ['bench'],
  macchina: ['machine'],
  'corpo libero': ['bodyweight', 'body weight', 'no equipment'],
  sbarra: ['bar', 'pull-up', 'pull up'],
  parallele: ['dip', 'parallel bar'],
  disco: ['plate'],
  kettlebell: ['kettlebell'],
  elastico: ['band', 'resistance band'],
  cyclette: ['bike', 'cycle'],
  ellittica: ['elliptical'],
  'tapis roulant': ['treadmill'],
  'battle rope': ['battle rope', 'rope'],
};

// Dizionario gruppo muscolare (enum italiano fisso, MuscleGroup) -> parole
// chiave inglesi plausibili nel campo YMove muscleGroup/category (vocabolario
// libero lato YMove, quindi un match "contains" e' l'unica strategia robusta
// senza conoscere l'elenco esatto usato dall'API).
const MUSCLE_KEYWORDS_EN: Record<string, string[]> = {
  Petto: ['chest', 'pec'],
  Dorso: ['back', 'lat'],
  Gambe: ['leg', 'quad', 'hamstring', 'glute', 'calf'],
  Spalle: ['shoulder', 'delt'],
  Bicipiti: ['bicep'],
  Tricipiti: ['tricep'],
  'Addominali/Core': ['ab', 'core', 'oblique'],
  'Cardio/Funzionale': ['cardio', 'full body', 'functional', 'conditioning'],
};

// Normalizza per il confronto: minuscolo, rimuove accenti, tiene solo
// lettere/numeri/spazi, comprime gli spazi multipli. Applicata SEMPRE prima
// di qualunque confronto — mai un confronto case/accent-sensitive.
// Range Unicode dei segni diacritici combinanti (U+0300-U+036F), costruito
// con String.fromCharCode invece di un literal in-sorgente per evitare
// ambiguita' di codifica con caratteri combinanti "nudi" (senza lettera
// base) in file di testo/terminali diversi.
const COMBINING_DIACRITICS_PATTERN = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g',
);

export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS_PATTERN, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Cerca il sinonimo IT->EN piu' specifico (chiave piu' lunga) tra quelle
// contenute nel nome normalizzato dell'esercizio locale. Ritorna null se
// nessuna chiave del dizionario corrisponde: il chiamante ricadra sulla
// traduzione automatica.
export function findSynonymSearchTerm(localName: string): string | null {
  const normalized = normalizeForMatch(localName);
  let best: { key: string; value: string } | null = null;
  for (const [key, value] of Object.entries(EXERCISE_NAME_SYNONYMS)) {
    if (normalized === key || normalized.includes(key)) {
      if (!best || key.length > best.key.length) best = { key, value };
    }
  }
  return best ? best.value : null;
}

// Distanza di Levenshtein classica (programmazione dinamica, O(n*m)): i nomi
// degli esercizi sono frasi brevi (poche parole), quindi il costo e'
// trascurabile anche eseguito per ogni candidato di ogni esercizio.
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[] = new Array(rows * cols);
  for (let i = 0; i < rows; i++) matrix[i * cols] = i;
  for (let j = 0; j < cols; j++) matrix[j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i * cols + j] = Math.min(
        matrix[(i - 1) * cols + j] + 1,
        matrix[i * cols + j - 1] + 1,
        matrix[(i - 1) * cols + j - 1] + cost,
      );
    }
  }
  return matrix[rows * cols - 1];
}

// Similarita' nome in [0,1]: 1 - (distanza normalizzata sulla lunghezza
// massima), con un piccolo bonus se una stringa contiene interamente l'altra
// (es. "bench press" dentro "barbell bench press" — variante comune tra
// cataloghi diversi che la sola distanza di edit penalizzerebbe troppo).
//
// IMPORTANTE: englishName deve gia' essere in inglese (sinonimo dal
// dizionario o traduzione Azure), MAI il nome italiano originale — una
// distanza di edit tra parole di lingue diverse ("panca piana" vs "bench
// press") e' quasi sempre bassa per puro caso ortografico, non misura
// affatto la somiglianza semantica. Verificato con un test manuale: la
// stessa coppia tradotta ("bench press" vs "Bench Press") ottiene 1.0,
// quella non tradotta ("panca piana" vs "Bench Press") solo ~0.36 pur
// essendo la traduzione esatta — la chiamata con il nome sbagliato
// romperebbe silenziosamente ogni soglia. Il chiamante
// (ymove-auto-link-service.ts) e' responsabile di passare sempre il nome
// gia' tradotto.
export function nameSimilarity(englishName: string, candidateTitle: string): number {
  const a = normalizeForMatch(englishName);
  const b = normalizeForMatch(candidateTitle);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  const ratio = maxLen === 0 ? 0 : 1 - distance / maxLen;
  const containsBonus = a.includes(b) || b.includes(a) ? 0.1 : 0;
  return Math.max(0, Math.min(1, ratio + containsBonus));
}

function muscleScore(localMuscleGroup: string, candidateMuscle: string | null): number {
  const keywords = MUSCLE_KEYWORDS_EN[localMuscleGroup];
  if (!keywords || !candidateMuscle) return 0;
  const c = candidateMuscle.toLowerCase();
  return keywords.some((k) => c.includes(k)) ? 1 : 0;
}

function equipmentScore(localEquipment: string, candidateEquipment: string | null): number {
  if (!candidateEquipment) return 0;
  const c = candidateEquipment.toLowerCase();
  const localLower = localEquipment.toLowerCase();
  for (const [itWord, enWords] of Object.entries(EQUIPMENT_KEYWORDS_EN)) {
    if (localLower.includes(itWord) && enWords.some((w) => c.includes(w))) return 1;
  }
  return 0;
}

// Segnale debole (peso 5%, il piu' basso): i dati locali non hanno un campo
// "tipologia" dedicato (solo muscleGroup/equipment/difficulty), quindi si usa
// un'euristica onesta invece di inventare un campo — un esercizio del gruppo
// 'Cardio/Funzionale' dovrebbe risultare cardio/funzionale anche su YMove, un
// esercizio di qualunque altro gruppo NON dovrebbe essere marcato solo cardio.
function typeScore(localMuscleGroup: string, candidateTypes: string[]): number {
  const isCardioLocal = localMuscleGroup === 'Cardio/Funzionale';
  const candidateHasCardio = candidateTypes.some((t) => /cardio|conditioning|functional/i.test(t));
  if (isCardioLocal) return candidateHasCardio ? 1 : 0;
  return candidateHasCardio ? 0 : 1;
}

export type MatchInput = {
  // Nome GIA' in inglese (sinonimo dal dizionario o tradotto da Azure
  // Translator) — mai il nome italiano originale, vedi commento su
  // nameSimilarity sopra.
  englishName: string;
  muscleGroup: string;
  equipment: string;
};

export type ScoredCandidate = { candidate: YmoveExerciseSummary; score: number };

// Calcola il punteggio pesato di un candidato YMove rispetto a un esercizio
// locale/custom. Il candidato deve gia' essere stato filtrato per
// hasVideo===true PRIMA di chiamare questa funzione (vedi
// ymove-auto-link-service.ts) — qui ci si concentra solo sul punteggio.
export function scoreCandidate(local: MatchInput, candidate: YmoveExerciseSummary): number {
  const name = nameSimilarity(local.englishName, candidate.title) * NAME_WEIGHT;
  const muscle = muscleScore(local.muscleGroup, candidate.muscleGroup) * MUSCLE_WEIGHT;
  const equipment = equipmentScore(local.equipment, candidate.equipment) * EQUIPMENT_WEIGHT;
  const type = typeScore(local.muscleGroup, candidate.exerciseType) * TYPE_WEIGHT;
  return name + muscle + equipment + type;
}

export type BestMatchResult =
  | { kind: 'match'; candidate: YmoveExerciseSummary; score: number }
  | { kind: 'ambiguous'; topScore: number; secondScore: number }
  | { kind: 'not_found' };

// Applica le due soglie richieste esplicitamente: punteggio minimo >= 0.85 E
// distacco dal secondo candidato >= 0.10. Se nessun candidato supera la
// soglia minima, o il distacco e' insufficiente, NON sceglie mai a caso: il
// chiamante deve trattare il risultato come "non associato"/"ambiguo".
export function pickBestMatch(local: MatchInput, candidates: YmoveExerciseSummary[]): BestMatchResult {
  const scored: ScoredCandidate[] = candidates
    .filter((c) => c.hasVideo)
    .map((candidate) => ({ candidate, score: scoreCandidate(local, candidate) }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { kind: 'not_found' };

  const top = scored[0];
  const second = scored[1];
  const secondScore = second ? second.score : 0;

  if (top.score < MIN_SCORE_THRESHOLD) return { kind: 'not_found' };
  if (top.score - secondScore < MIN_SCORE_GAP) return { kind: 'ambiguous', topScore: top.score, secondScore };

  return { kind: 'match', candidate: top.candidate, score: top.score };
}
