// Edge Function: ymove-exercises
//
// Unico punto dell'app che parla con l'API esterna YMove (catalogo esercizi
// con video). La chiave YMove non deve MAI arrivare al client mobile (niente
// EXPO_PUBLIC_*): vive solo qui come secret Supabase (YMOVE_API_KEY) e viene
// allegata come header X-API-Key a ogni chiamata verso YMove v2
// (https://exercise-api.ymove.app/api/v2).
//
// FitCoach Nutrizione Fase 1 (2026-08-04): 8 nuove azioni sola-lettura verso
// gli endpoint /foods, /recipes, /mealplans di YMove v2 (schema verificato
// byte-per-byte contro l'OpenAPI reale, mai assunto):
// 'foods_search' | 'food_detail' | 'food_barcode' | 'recipes_search' |
// 'recipe_detail' | 'recipes_diets' | 'recipes_meal_types' | 'mealplan_generate'.
// Stesso principio delle azioni esistenti: whitelist stretta dei parametri,
// mai un proxy generico, mai la API key loggata. Riservate a role='cliente'
// (e superadmin) — la UI Nutrizione e' lato cliente, nessun accesso coach in
// questa fase. Nessuna azione di scrittura (log foto/audio/testo pasto,
// posture/workouts/programs) e' implementata: esplicitamente fuori scope.
//
// Tre azioni ESERCIZI preesistenti (POST { action: 'search' | 'detail' | 'translate', ... }):
// - 'search': lista filtrata, SEMPRE con includeVideos=false (la ricerca non
//   deve consumare il limite mensile dei video) — solo coach/superadmin.
// - 'detail': un singolo esercizio con video/thumbnail/istruzioni — sempre
//   permesso a coach/superadmin (serve anche per l'anteprima PRIMA di
//   importare); un cliente e' autorizzato SOLO se quell'id YMove appartiene
//   davvero a un esercizio presente in uno dei suoi workout_day_exercises
//   reali (2026-08-02, sostituisce il precedente requisito fisso di un
//   coach_clients attivo — vedi clientOwnsYmoveExercise sotto per i dettagli:
//   stessa relazione client_id/coach_id gia' fidata dalla RLS
//   workout_day_exercises_client_read/workout_days_client_read, valida sia
//   per piani self_guided — coach_id null, motore automatico, nessun coach
//   necessario — sia per piani coach_guided — richiede un coach_clients
//   attivo per QUEL coach). Prima un cliente self_guided (senza alcun coach)
//   riceveva SEMPRE 'forbidden' — "Nessun coach collegato a questo
//   account." — anche per un esercizio realmente nel proprio programma
//   generato dal motore automatico (bug segnalato dall'utente: video visibile
//   al coach, "Video non disponibile" al cliente self_guided). Per un piano
//   self_guided viene richiesto anche Client Pro attivo ORA (stessa
//   entitlement di assign_initial_auto_program()/run_cycle_review()): la
//   verifica ownership da sola non copre il caso di un abbonamento scaduto,
//   perche' i dati del programma restano leggibili anche dopo la scadenza.
// - 'translate' (2026-07-13, provider Azure Translator; esteso 2026-07-13
//   continuazione per l'associazione automatica dei video YMove): due formati
//   riconosciuti in body.texts, sempre solo coach/superadmin —
//   (1) LEGACY, oggetto { title, description, instructions }: traduce EN->IT,
//   chiamata da fitcoach-exercises-service.ts al momento dell'import di un
//   esercizio YMove (una sola volta, mai ad ogni apertura), risposta
//   { title, description, instructions };
//   (2) NUOVO, array di stringhe { texts: string[], from?: string, to:
//   string }: traduzione generica in qualunque direzione (oggi usata da
//   ymove-auto-link-service.ts per tradurre IT->EN i nomi degli esercizi
//   locali prima di cercarli su YMove), risposta { texts: string[] } nello
//   stesso ordine/lunghezza dell'array in ingresso.
//   In entrambi i casi, se AZURE_TRANSLATOR_KEY/REGION non sono configurate o
//   la chiamata fallisce, risponde con ok:false e un code dedicato (mai
//   un'eccezione): il chiamante mobile ricade sempre sui testi originali,
//   MAI una traduzione finta.
//
// L'import vero e proprio (scrittura in public.exercises) NON passa da qui:
// il coach lo fa direttamente dal client mobile via RLS
// (exercises_coach_insert, docs/SUPABASE_SCHEMA.sql), riusando i metadati
// gia' ottenuti da questa funzione. Questa funzione non salva mai nulla nel
// database: e' un puro proxy di lettura verso YMove/Azure Translator.
//
// Variabili d'ambiente richieste (supabase secrets set ...):
// - YMOVE_API_KEY: chiave API YMove v2 (richiesta per 'search'/'detail').
// - AZURE_TRANSLATOR_KEY: opzionale, solo per 'translate' (chiave della
//   risorsa Azure Translator). Se assente, 'translate' risponde ok:false
//   code:'translation_not_configured' invece di un errore — il chiamante
//   mobile sa gia' gestire questo caso senza inventare nulla.
// - AZURE_TRANSLATOR_REGION: richiesta insieme a AZURE_TRANSLATOR_KEY (la
//   risorsa Azure Translator e' regionale, es. "italynorth") — senza,
//   Azure risponde 401 anche con la chiave corretta.
// - AZURE_TRANSLATOR_ENDPOINT: opzionale, default
//   "https://api.cognitive.microsofttranslator.com" (l'endpoint globale
//   documentato da Microsoft; va cambiato solo se la risorsa usa un
//   endpoint personalizzato).
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono iniettate automaticamente dal
// runtime delle Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const YMOVE_BASE_URL = 'https://exercise-api.ymove.app/api/v2';

// Attiva SOLO su richiesta esplicita (supabase secrets set YMOVE_DEBUG=true):
// se true, il messaggio di errore reale (mai token/API key/header
// Authorization) viene incluso nel body JSON di risposta, per poter
// diagnosticare un 500 senza dover aprire i log. Di default false: in
// produzione un chiamante non deve mai vedere dettagli interni dell'errore.
const DEBUG_MODE = Deno.env.get('YMOVE_DEBUG') === 'true';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ResultBody = { ok: true; data: unknown } | { ok: false; code: string; message: string };

function json(body: ResultBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Logga in modo sicuro (solo message/stack, MAI token/API key/header
// Authorization) e risponde con un codice/messaggio generico — a meno che
// YMOVE_DEBUG non sia attivo, nel qual caso il messaggio reale dell'errore
// viene incluso nel body per facilitare il debug. Nome distinto da
// ymoveErrorResponse/dalla variabile locale "errorResponse" usata sotto per
// gli errori dell'API YMove, per evitare confusione tra i due casi.
function internalErrorResponse(code: string, safeMessage: string, status: number, err: unknown): Response {
  console.error('YMOVE_FUNCTION_ERROR', {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  const message = DEBUG_MODE ? (err instanceof Error ? err.message : String(err)) : safeMessage;
  return json({ ok: false, code, message }, status);
}

// Struttura ufficiale YMove v2 (confermata, non piu' un'assunzione):
// - GET /exercises -> { data: Exercise[], pagination: {...}, _warning?: {...} }
// - GET /exercises/:id -> { data: Exercise, _warning?: {...} }
// L'esercizio vive SEMPRE dentro "data", mai nella root ne' in "exercise"/
// "result" — extractSearchList/extractDetailPayload sotto leggono solo li'.
type YmoveExerciseSummary = {
  id: string;
  title: string;
  slug: string | null;
  muscleGroup: string | null;
  equipment: string | null;
  category: string | null;
  difficulty: string | null;
  // Campo ufficiale array (non una singola stringa).
  exerciseType: string[];
  hasVideo: boolean;
};

type YmoveExerciseDetail = YmoveExerciseSummary & {
  description: string | null;
  instructions: string | null;
  importantPoints: string[] | null;
  secondaryMuscles: string[] | null;
  videoUrl: string | null;
  videoHlsUrl: string | null;
  thumbnailUrl: string | null;
  videoDurationSecs: number | null;
};

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function pickStringArray(obj: Record<string, unknown>, key: string): string[] {
  const value = obj[key];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}

// YMove non garantisce che alcuni campi restino sempre una singola stringa:
// equipment/difficulty/instructions possono arrivare come stringa, array di
// stringhe, o mancare del tutto — questa funzione normalizza SEMPRE a una
// singola stringa (o null), unendo un eventuale array col separatore dato.
function pickFlexibleString(obj: Record<string, unknown>, key: string, separator = ', '): string | null {
  const value = obj[key];
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

function pickNumber(obj: Record<string, unknown>, key: string): number | null {
  const value = obj[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Valido se ALMENO id e title esistono (richiesto esplicitamente): tutto il
// resto e' opzionale. Un esercizio senza video/thumbnail/videos resta
// comunque valido — nessun errore generato per campi mancanti, il fallback
// "nessun video disponibile" e' gestito lato UI (ymove-exercise-picker.tsx,
// ymove-video-player.tsx), mai qui.
function normalizeSummary(raw: unknown): YmoveExerciseSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = pickString(o, 'id');
  // Alcuni esercizi YMove arrivano con "name" invece di "title" (variante di
  // schema non documentata, osservata in produzione): fallback esplicito,
  // altrimenti un esercizio altrimenti valido sparirebbe dalla ricerca solo
  // per il nome del campo usato da YMove per quel record.
  const title = pickString(o, 'title') ?? pickString(o, 'name');
  if (!id || !title) return null;
  return {
    id,
    title,
    slug: pickString(o, 'slug'),
    muscleGroup: pickString(o, 'muscleGroup'),
    equipment: pickFlexibleString(o, 'equipment'),
    category: pickString(o, 'category'),
    difficulty: pickFlexibleString(o, 'difficulty'),
    exerciseType: pickStringArray(o, 'exerciseType'),
    hasVideo: o.hasVideo === true,
  };
}

function normalizeDetail(raw: unknown): YmoveExerciseDetail | null {
  const summary = normalizeSummary(raw);
  if (!summary || !raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const importantPoints = pickStringArray(o, 'importantPoints');
  const secondaryMuscles = pickStringArray(o, 'secondaryMuscles');
  return {
    ...summary,
    description: pickFlexibleString(o, 'description'),
    // Separatore \n (non ", "): se instructions arriva come array di passi,
    // ha piu' senso mostrarli su righe separate che unirli in una frase sola.
    instructions: pickFlexibleString(o, 'instructions', '\n'),
    importantPoints: importantPoints.length > 0 ? importantPoints : null,
    secondaryMuscles: secondaryMuscles.length > 0 ? secondaryMuscles : null,
    videoUrl: pickString(o, 'videoUrl'),
    videoHlsUrl: pickString(o, 'videoHlsUrl'),
    thumbnailUrl: pickString(o, 'thumbnailUrl'),
    videoDurationSecs: pickNumber(o, 'videoDurationSecs'),
  };
}

// GET /exercises -> { data: Exercise[], pagination, _warning? }: la lista e'
// SEMPRE in "data", mai nella root ne' in "items"/"exercises"/"results".
function extractSearchList(raw: unknown): unknown[] {
  if (raw && typeof raw === 'object') {
    const data = (raw as Record<string, unknown>).data;
    if (Array.isArray(data)) return data;
  }
  return [];
}

// GET /exercises/:id -> { data: Exercise, _warning? }: l'esercizio e' SEMPRE
// in "data", mai nella root ne' in "exercise"/"result".
function extractDetailPayload(raw: unknown): unknown {
  if (raw && typeof raw === 'object') {
    return (raw as Record<string, unknown>).data ?? null;
  }
  return null;
}

// Messaggio d'errore ricevuto DAVVERO da YMove (mai inventato): provato su
// alcuni nomi di campo ragionevoli per un corpo di errore, altrimenti null
// (il chiamante ricade su un messaggio generico col solo status HTTP).
function extractYmoveErrorMessage(body: unknown): string | null {
  if (typeof body === 'string' && body.trim()) return body;
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.trim()) return o.message;
    if (typeof o.error === 'string' && o.error.trim()) return o.error;
    if (o._warning && typeof o._warning === 'object') {
      const warning = (o._warning as Record<string, unknown>).message;
      if (typeof warning === 'string' && warning.trim()) return warning;
    }
  }
  return null;
}

// Log sicuro: MAI l'header X-API-Key/Authorization ne' il corpo completo
// della risposta (potrebbe contenere dati dell'esercizio non necessari nei
// log) — solo lo status HTTP e le chiavi top-level, utile per scoprire un
// cambio di forma della risposta YMove senza esporre altro.
function safeTopLevelKeys(body: unknown): string[] {
  if (Array.isArray(body)) return [`array(${body.length})`];
  if (body && typeof body === 'object') return Object.keys(body as Record<string, unknown>);
  return [];
}

// Endpoint globale documentato da Microsoft per Azure Translator (Text
// Translation API v3.0) — usato solo se AZURE_TRANSLATOR_ENDPOINT non e'
// impostato come secret. La risorsa e' regionale: senza
// Ocp-Apim-Subscription-Region Azure risponde 401 anche con la chiave giusta.
const AZURE_TRANSLATOR_DEFAULT_ENDPOINT = 'https://api.cognitive.microsofttranslator.com';

type TranslatableTexts = { title: string; description: string; instructions: string };

// Nucleo generico (2026-07-13, estratto per riuso): traduce un array di
// stringhe con Azure Translator (Text Translation API v3.0), preservando
// l'ordine e la lunghezza dell'array in ingresso (le stringhe vuote restano
// vuote in uscita, senza essere inviate ad Azure). `from` e' opzionale (Azure
// rileva automaticamente la lingua sorgente se omesso — usato dal percorso
// legacy sotto, sempre EN->IT). Ritorna null (mai un'eccezione) se la
// chiamata fallisce per qualunque motivo: ENTRAMBI i chiamanti (azione
// 'translate' sotto, sia percorso legacy sia nuovo) traducono un null in
// ok:false, mai una traduzione finta.
async function translateAzureTextArray(
  apiKey: string,
  region: string,
  endpoint: string,
  texts: string[],
  from: string | null,
  to: string,
): Promise<string[] | null> {
  const nonEmptyIndices: number[] = [];
  const nonEmptyValues: string[] = [];
  texts.forEach((value, index) => {
    if (value.trim().length > 0) {
      nonEmptyIndices.push(index);
      nonEmptyValues.push(value);
    }
  });
  if (nonEmptyValues.length === 0) {
    return texts.map(() => '');
  }

  try {
    const params = new URLSearchParams({ 'api-version': '3.0', to });
    if (from) params.set('from', from);
    const url = `${endpoint.replace(/\/$/, '')}/translate?${params.toString()}`;
    // Azure vuole un array ordinato di { Text }: la risposta torna nello
    // stesso ordine, un elemento per ogni testo inviato (solo i non vuoti).
    const requestBody = nonEmptyValues.map((value) => ({ Text: value }));

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Ocp-Apim-Subscription-Region': region,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    if (!res.ok) {
      console.error('AZURE_TRANSLATOR_API_ERROR', { status: res.status });
      return null;
    }
    const responseBody = (await res.json()) as Array<{ translations?: Array<{ text?: string }> }>;
    if (!Array.isArray(responseBody) || responseBody.length !== nonEmptyValues.length) {
      console.error('AZURE_TRANSLATOR_UNEXPECTED_SHAPE', {
        expected: nonEmptyValues.length,
        received: Array.isArray(responseBody) ? responseBody.length : 0,
      });
      return null;
    }

    const result = texts.map(() => '');
    nonEmptyIndices.forEach((originalIndex, i) => {
      result[originalIndex] = responseBody[i]?.translations?.[0]?.text ?? '';
    });
    return result;
  } catch (err) {
    console.error('AZURE_TRANSLATOR_CALL_FAILED', { message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// Percorso legacy (2026-07-13, invariato nel comportamento esterno): traduce
// title/description/instructions in italiano, sempre EN->IT, mai una
// direzione diversa — usato da mobile/src/lib/ymove-service.ts,
// translateYmoveTexts, chiamata SOLO da fitcoach-exercises-service.ts
// all'import di un esercizio YMove.
async function translateWithAzure(
  apiKey: string,
  region: string,
  endpoint: string,
  texts: TranslatableTexts,
): Promise<TranslatableTexts | null> {
  const keys: Array<'title' | 'description' | 'instructions'> = ['title', 'description', 'instructions'];
  const values = keys.map((key) => texts[key]);
  const translated = await translateAzureTextArray(apiKey, region, endpoint, values, null, 'it');
  if (!translated) return null;

  const result: TranslatableTexts = { title: '', description: '', instructions: '' };
  keys.forEach((key, index) => {
    result[key] = translated[index] ?? '';
  });
  return result;
}

// Timeout esplicito (10s): senza, una YMove lenta/irraggiungibile terrebbe la
// Edge Function appesa fino al timeout della piattaforma, con un errore
// generico invece di un codice leggibile dal client mobile.
const YMOVE_FETCH_TIMEOUT_MS = 10_000;

async function callYmove(path: string, apiKey: string): Promise<{ status: number; body: unknown } | { timeout: true }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), YMOVE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${YMOVE_BASE_URL}${path}`, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    console.log('YMOVE_API_CALL', { path, status: res.status, keys: safeTopLevelKeys(body) });
    return { status: res.status, body };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('YMOVE_API_TIMEOUT', { path, timeoutMs: YMOVE_FETCH_TIMEOUT_MS });
      return { timeout: true };
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isTimeoutResult(result: { status: number; body: unknown } | { timeout: true }): result is { timeout: true } {
  return 'timeout' in result;
}

// --- FitCoach Nutrizione Fase 1: whitelist enum verificate byte-per-byte
// contro l'OpenAPI reale di https://exercise-api.ymove.app/api/v2/openapi.json
// (2026-08-04) — mai assunte dal prompt originale senza conferma. Nota
// importante: 'balanced' e' un valore valido SOLO per mealplan/diet, MAI per
// recipes/search?diet= (schema diverso, verificato: l'enum di /recipes/search
// non include 'balanced').
const MEALPLAN_DIET_VALUES = ['balanced', 'high_protein', 'low_carb', 'keto', 'vegan', 'vegetarian', 'mediterranean', 'paleo'];
const RECIPE_DIET_VALUES = ['high_protein', 'low_carb', 'keto', 'vegan', 'vegetarian', 'mediterranean', 'paleo'];
const RECIPE_CUISINE_VALUES = ['american', 'mediterranean', 'asian', 'mexican', 'italian', 'indian', 'japanese'];
const MEAL_TYPE_VALUES = ['breakfast', 'lunch', 'dinner', 'snack'];
const MACRO_SPLIT_VALUES = ['balanced', 'high_protein', 'low_carb', 'high_fat'];
const FOOD_SOURCE_VALUES = ['usda', 'openfoodfacts'];
const FOOD_PER_VALUES = ['100g', '100ml'];

type ParamError = { field: string; message: string };

// Whitelist stretta: ogni valore che finisce nella query string verso YMove
// passa da qui. Nessun parametro non elencato viene mai inoltrato (niente
// proxy generico). Ritorna null + errori se qualcosa non e' valido, mai
// inoltra un valore fuori whitelist sperando che YMove lo ignori.
function readEnumParam(filters: Record<string, unknown>, key: string, allowed: string[], errors: ParamError[]): string | undefined {
  const value = filters[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    errors.push({ field: key, message: `Valore non valido per '${key}': atteso uno tra ${allowed.join(', ')}.` });
    return undefined;
  }
  return value;
}

function readStringParam(filters: Record<string, unknown>, key: string, opts: { required?: boolean; maxLen?: number; exactLen?: number } = {}, errors: ParamError[]): string | undefined {
  const value = filters[key];
  if (value === undefined || value === null || value === '') {
    if (opts.required) errors.push({ field: key, message: `Parametro '${key}' obbligatorio.` });
    return undefined;
  }
  if (typeof value !== 'string') {
    errors.push({ field: key, message: `Parametro '${key}' deve essere una stringa.` });
    return undefined;
  }
  const trimmed = value.trim();
  if (opts.exactLen !== undefined && trimmed.length !== opts.exactLen) {
    errors.push({ field: key, message: `Parametro '${key}' deve avere lunghezza esatta ${opts.exactLen}.` });
    return undefined;
  }
  if (opts.maxLen !== undefined && trimmed.length > opts.maxLen) {
    errors.push({ field: key, message: `Parametro '${key}' troppo lungo (max ${opts.maxLen}).` });
    return undefined;
  }
  return trimmed;
}

function readIntParam(filters: Record<string, unknown>, key: string, opts: { required?: boolean; min?: number; max?: number } = {}, errors: ParamError[]): number | undefined {
  const value = filters[key];
  if (value === undefined || value === null || value === '') {
    if (opts.required) errors.push({ field: key, message: `Parametro '${key}' obbligatorio.` });
    return undefined;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    errors.push({ field: key, message: `Parametro '${key}' deve essere un intero.` });
    return undefined;
  }
  if (opts.min !== undefined && num < opts.min) {
    errors.push({ field: key, message: `Parametro '${key}' deve essere >= ${opts.min}.` });
    return undefined;
  }
  if (opts.max !== undefined && num > opts.max) {
    errors.push({ field: key, message: `Parametro '${key}' deve essere <= ${opts.max}.` });
    return undefined;
  }
  return num;
}

function readNumberParam(filters: Record<string, unknown>, key: string, errors: ParamError[]): number | undefined {
  const value = filters[key];
  if (value === undefined || value === null || value === '') return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    errors.push({ field: key, message: `Parametro '${key}' deve essere numerico.` });
    return undefined;
  }
  return num;
}

function readBooleanParam(filters: Record<string, unknown>, key: string, errors: ParamError[]): boolean | undefined {
  const value = filters[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') {
    errors.push({ field: key, message: `Parametro '${key}' deve essere booleano.` });
    return undefined;
  }
  return value;
}

function validationErrorResponse(errors: ParamError[]): Response {
  return json({ ok: false, code: 'invalid_params', message: errors.map((e) => e.message).join(' ') }, 400);
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) usp.set(key, String(value));
  }
  return usp.toString();
}

// Riduce a un solo punto la gestione errore/timeout per le 8 azioni
// nutrition sotto (stessa logica gia' in ymoveErrorResponse/isTimeoutResult,
// solo raggruppata per non ripetere 3 righe identiche 8 volte).
function callYmoveOrError(
  result: { status: number; body: unknown } | { timeout: true },
): { ok: true; body: unknown } | { ok: false; response: Response } {
  const errorResponse = ymoveErrorResponse(result);
  if (errorResponse) return { ok: false, response: errorResponse };
  if (isTimeoutResult(result)) {
    return { ok: false, response: json({ ok: false, code: 'timeout', message: 'YMove non ha risposto in tempo. Riprova.' }, 504) };
  }
  return { ok: true, body: result.body };
}

// Ogni risposta YMove nutrition e' avvolta in { data: ... } (liste anche con
// "pagination"), verificato byte-per-byte contro l'OpenAPI reale — mai
// assunto. Passa questi campi al client cosi' come sono (nessuna
// rinormalizzazione qui: gli endpoint nutrition sono nuovi, la forma dei dati
// e' gia' quella ufficiale, a differenza degli esercizi dove YMove ha
// varianti di schema non documentate osservate in produzione).
function extractDataAndPagination(body: unknown): { data: unknown; pagination: unknown } {
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    return { data: o.data ?? null, pagination: o.pagination ?? null };
  }
  return { data: null, pagination: null };
}

const SEARCH_FILTER_PARAMS: Record<string, string> = {
  name: 'search',
  muscle: 'muscle',
  equipment: 'equipment',
  type: 'type',
  difficulty: 'difficulty',
  page: 'page',
  limit: 'limit',
};

function buildSearchQuery(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  // Sempre false qui: la navigazione/ricerca nel catalogo non deve mai
  // consumare il limite mensile dei video (richiesto esplicitamente).
  params.set('includeVideos', 'false');
  for (const [filterKey, queryKey] of Object.entries(SEARCH_FILTER_PARAMS)) {
    const value = filters[filterKey];
    if (typeof value === 'string' && value.trim()) params.set(queryKey, value.trim());
    else if (typeof value === 'number' && Number.isFinite(value)) params.set(queryKey, String(value));
  }
  return params.toString();
}

// Se YMove risponde con uno status non-2xx, si restituisce SEMPRE lo status
// e il messaggio realmente ricevuti (mai un messaggio inventato che nasconda
// cosa ha detto davvero YMove) — con un fallback solo se YMove non ha
// restituito alcun messaggio leggibile.
// Gestisce anche il caso 'timeout' (aggiunto per Nutrizione Fase 1, vedi
// callYmove sotto): usata sia dalle azioni esercizi preesistenti sia dalle
// nuove azioni nutrition, un solo punto per la gestione 400/401/404/429/timeout.
function ymoveErrorResponse(result: { status: number; body: unknown } | { timeout: true }): Response | null {
  if (isTimeoutResult(result)) {
    return json({ ok: false, code: 'timeout', message: 'YMove non ha risposto in tempo. Riprova.' }, 504);
  }
  if (result.status >= 200 && result.status < 300) return null;

  const receivedMessage = extractYmoveErrorMessage(result.body);
  console.error('YMOVE_API_ERROR', { status: result.status, keys: safeTopLevelKeys(result.body) });

  if (result.status === 429) {
    return json(
      { ok: false, code: 'rate_limited', message: receivedMessage ?? "Limite YMove raggiunto. Riprova tra qualche minuto." },
      429,
    );
  }
  if (result.status === 404) {
    return json({ ok: false, code: 'not_found', message: receivedMessage ?? 'Risorsa non trovata su YMove.' }, 404);
  }
  if (result.status === 401) {
    return json({ ok: false, code: 'ymove_unauthorized', message: receivedMessage ?? 'Autenticazione verso YMove non riuscita.' }, 401);
  }
  if (result.status === 400) {
    return json({ ok: false, code: 'ymove_bad_request', message: receivedMessage ?? 'Parametri non validi per YMove.' }, 400);
  }
  return json(
    { ok: false, code: 'ymove_error', message: receivedMessage ?? `YMove ha risposto con un errore (${result.status}).` },
    result.status,
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rimuove il prefisso "legacy:" (solo lato costanti/UI superadmin), stessa
// normalizzazione di normalizeLegacyKey in mobile/src/lib/exercise-video-
// service.ts e normalizeLegacyExerciseKey in ymove-library-import/index.ts.
function normalizeLegacyKey(value: string): string {
  return value.startsWith('legacy:') ? value.slice('legacy:'.length) : value;
}

// Cliente puo' vedere il DETAIL/video YMove di ymoveId SOLO se quell'esercizio
// e' realmente presente in un workout_day_exercises di un piano che gli
// appartiene DAVVERO (2026-08-02, sostituisce il vecchio controllo basato solo
// su coach_clients — vedi commento sopra il chiamante). "Appartiene davvero" e'
// la STESSA relazione gia' fidata dalla RLS workout_day_exercises_client_read/
// workout_days_client_read (auto_program_schema_core.sql): workout_plans.
// client_id = auth.uid() (mai un id passato dal frontend, sempre callerId
// risolto dal JWT), e workout_plans.coach_id e' NULL (piano self_guided, motore
// automatico — nessun coach necessario) OPPURE esiste un coach_clients con
// status active/invited per QUEL coach specifico (piano coach_guided). Un
// esercizio nel workout puo' essere referenziato in forma UUID
// (workout_day_exercises.exercise_id = public.exercises.id::text, esercizio
// YMove importato/condiviso globalmente) oppure chiave locale testuale
// (esercizio storico/custom del coach, con un video YMove collegato via
// exercise_external_links — link globale approvato — o via exercise_videos —
// collegamento del PROPRIO coach, mai di un coach diverso).
//
// self_guided (coach_id null): oltre all'ownership, richiede anche Client Pro
// attivo ORA — stessa entitlement gia' verificata da assign_initial_auto_
// program()/run_cycle_review() per l'intero sistema "programmi automatici"
// (public._has_active_client_pro_entitlement, replicata qui in query dirette
// sulle stesse tabelle invece che via RPC, per non dipendere da un GRANT
// EXECUTE non garantito al service_role): l'accesso normale alla scheda e' gia'
// bloccato lato app se l'abbonamento scade (auth-gate.tsx), ma questa Edge
// Function e' raggiungibile anche a gate app bypassato — senza questo
// controllo un cliente self_guided con abbonamento scaduto potrebbe comunque
// continuare a consumare il limite mensile YMove chiamando 'detail'
// direttamente. Nessun controllo simile per coach_guided: la sua scheda non e'
// mai stata gated su Client Pro, comportamento invariato.
async function clientOwnsYmoveExercise(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  callerId: string,
  ymoveId: string,
): Promise<boolean> {
  const { data: coachLinkRow } = await supabaseAdmin
    .from('coach_clients')
    .select('coach_id')
    .eq('client_id', callerId)
    .in('status', ['active', 'invited'])
    .maybeSingle();
  const myActiveCoachId: string | null = coachLinkRow?.coach_id ?? null;

  const { data: myPlans } = await supabaseAdmin.from('workout_plans').select('id, coach_id').eq('client_id', callerId);
  const eligiblePlans = ((myPlans ?? []) as { id: string; coach_id: string | null }[]).filter(
    (p) => p.coach_id === null || p.coach_id === myActiveCoachId,
  );
  if (eligiblePlans.length === 0) return false;

  const { data: days } = await supabaseAdmin
    .from('workout_days')
    .select('id')
    .in(
      'workout_plan_id',
      eligiblePlans.map((p) => p.id),
    );
  const dayIds = ((days ?? []) as { id: string }[]).map((d) => d.id);
  if (dayIds.length === 0) return false;

  const { data: exerciseRows } = await supabaseAdmin.from('workout_day_exercises').select('exercise_id').in('workout_day_id', dayIds);
  const ownedExerciseIds = Array.from(
    new Set(((exerciseRows ?? []) as { exercise_id: string }[]).map((r) => r.exercise_id).filter(Boolean)),
  );
  if (ownedExerciseIds.length === 0) return false;

  const ownedUuidIds = ownedExerciseIds.filter((id) => UUID_RE.test(id));
  const ownedLegacyKeys = Array.from(new Set(ownedExerciseIds.map(normalizeLegacyKey)));

  const [{ data: importedMatch }, { data: legacyLinkMatch }] = await Promise.all([
    ownedUuidIds.length > 0
      ? supabaseAdmin
          .from('exercises')
          .select('id')
          .eq('ymove_exercise_id', ymoveId)
          .eq('source', 'ymove')
          .eq('active', true)
          .in('id', ownedUuidIds)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin
      .from('exercise_external_links')
      .select('exercise_key')
      .eq('provider', 'ymove')
      .eq('match_status', 'manual_approved')
      .eq('is_primary', true)
      .eq('external_exercise_id', ymoveId)
      .in('exercise_key', ownedLegacyKeys)
      .maybeSingle(),
  ]);
  if (importedMatch || legacyLinkMatch) {
    return await hasEntitlementIfSelfGuided(supabaseAdmin, callerId, eligiblePlans);
  }

  if (myActiveCoachId) {
    const { data: coachVideoMatch } = await supabaseAdmin
      .from('exercise_videos')
      .select('exercise_id')
      .eq('coach_id', myActiveCoachId)
      .eq('ymove_exercise_id', ymoveId)
      .in('exercise_id', ownedLegacyKeys)
      .maybeSingle();
    if (coachVideoMatch) return true; // sempre coach_guided (myActiveCoachId valorizzato): nessun gate entitlement.
  }

  return false;
}

// Se il match e' avvenuto su un piano self_guided (coach_id null), richiede
// anche Client Pro attivo ORA — vedi commento sopra clientOwnsYmoveExercise.
// Se il match e' avvenuto solo su piani coach_guided, nessun gate aggiuntivo.
async function hasEntitlementIfSelfGuided(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  callerId: string,
  eligiblePlans: { id: string; coach_id: string | null }[],
): Promise<boolean> {
  const hasSelfGuidedPlan = eligiblePlans.some((p) => p.coach_id === null);
  if (!hasSelfGuidedPlan) return true;

  // Due query separate (mai un join embedded via !inner, per non dipendere da
  // una sintassi meno comune non verificabile senza un deploy reale): stessa
  // lettura fatta da public._has_active_client_pro_entitlement, replicata qui
  // sulle stesse tabelle invece che via RPC (vedi commento sopra).
  const { data: activeSubs } = await supabaseAdmin
    .from('user_subscriptions')
    .select('package_id, expires_at')
    .eq('user_id', callerId)
    .eq('status', 'active')
    .eq('payment_provider', 'revenuecat');
  const subs = (activeSubs ?? []) as { package_id: string; expires_at: string | null }[];
  const notExpired = subs.filter((row) => !row.expires_at || new Date(row.expires_at) > new Date());
  if (notExpired.length === 0) return false;

  const { data: packages } = await supabaseAdmin
    .from('subscription_packages')
    .select('id')
    .in(
      'id',
      notExpired.map((row) => row.package_id),
    )
    .eq('target_role', 'client')
    .eq('revenuecat_entitlement_id', 'client_pro');

  return ((packages ?? []) as { id: string }[]).length > 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, code: 'method_not_allowed', message: 'Metodo non consentito.' }, 405);
  }

  // Tutto il resto della richiesta e' avvolto in try/catch: senza, un
  // qualunque errore non previsto (es. un campo inatteso nella risposta
  // YMove, un timeout di rete) farebbe fallire Deno.serve con un 500 generico
  // senza corpo JSON leggibile dal client mobile — da qui il 500 "silenzioso"
  // segnalato dall'utente anche con YMOVE_API_KEY gia' configurata.
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ymoveApiKey = Deno.env.get('YMOVE_API_KEY')?.trim();

    // Log sicuro: MAI la chiave stessa, solo se e' presente e la sua
    // lunghezza (utile per scoprire es. spazi/newline accidentali nel
    // secret, senza mai stampare il valore).
    console.log('YMOVE_ENV_CHECK', { configured: Boolean(ymoveApiKey), length: ymoveApiKey?.length ?? 0 });

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, code: 'server_misconfigured', message: 'Configurazione server mancante.' }, 500);
    }
    // YMOVE_API_KEY e' richiesta solo per 'search'/'detail' (verificato li'
    // sotto): l'azione 'translate' non la usa affatto (usa AZURE_TRANSLATOR_KEY/REGION).
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return json({ ok: false, code: 'not_authenticated', message: 'Autenticazione mancante.' }, 401);
    }
    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(jwt);
    if (callerError || !callerData.user) {
      return json({ ok: false, code: 'not_authenticated', message: 'Sessione non valida.' }, 401);
    }
    const callerId = callerData.user.id;

    const { data: callerProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', callerId).maybeSingle();
    if (!callerProfile) {
      return json({ ok: false, code: 'not_authenticated', message: 'Profilo del chiamante non trovato.' }, 401);
    }
    const role = callerProfile.role as 'superadmin' | 'coach' | 'cliente';

    let body: { action?: unknown; filters?: unknown; id?: unknown; texts?: unknown; from?: unknown; to?: unknown; upc?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, code: 'invalid_body', message: 'Corpo della richiesta non valido.' }, 400);
    }

    if (body.action === 'search') {
    if (role !== 'coach' && role !== 'superadmin') {
      return json({ ok: false, code: 'forbidden', message: 'Ricerca nel catalogo YMove riservata a coach e superadmin.' }, 403);
    }
    if (!ymoveApiKey) {
      return json({ ok: false, code: 'ymove_not_configured', message: 'YMOVE_API_KEY non configurata sulla Edge Function.' }, 500);
    }
    const filters = typeof body.filters === 'object' && body.filters !== null ? (body.filters as Record<string, unknown>) : {};
    const result = await callYmove(`/exercises?${buildSearchQuery(filters)}`, ymoveApiKey);
    const errorResponse = ymoveErrorResponse(result);
    if (errorResponse) return errorResponse;
    if (isTimeoutResult(result)) {
      return json({ ok: false, code: 'timeout', message: 'YMove non ha risposto in tempo. Riprova.' }, 504);
    }
    const items = extractSearchList(result.body)
      .map(normalizeSummary)
      .filter((item): item is YmoveExerciseSummary => item !== null);
    return json({ ok: true, data: items }, 200);
  }

  if (body.action === 'detail') {
    if (!ymoveApiKey) {
      return json({ ok: false, code: 'ymove_not_configured', message: 'YMOVE_API_KEY non configurata sulla Edge Function.' }, 500);
    }
    const ymoveId = typeof body.id === 'string' ? body.id.trim() : '';
    if (!ymoveId) {
      return json({ ok: false, code: 'invalid_id', message: 'Id esercizio mancante.' }, 400);
    }

    if (role === 'cliente') {
      const authorized = await clientOwnsYmoveExercise(supabaseAdmin, callerId, ymoveId);
      if (!authorized) {
        return json({ ok: false, code: 'forbidden', message: 'Questo video non e\' disponibile per il tuo account.' }, 403);
      }
    } else if (role !== 'coach' && role !== 'superadmin') {
      return json({ ok: false, code: 'forbidden', message: 'Ruolo non autorizzato.' }, 403);
    }

    const result = await callYmove(`/exercises/${encodeURIComponent(ymoveId)}?includeVideos=true`, ymoveApiKey);
    const errorResponse = ymoveErrorResponse(result);
    if (errorResponse) return errorResponse;
    if (isTimeoutResult(result)) {
      return json({ ok: false, code: 'timeout', message: 'YMove non ha risposto in tempo. Riprova.' }, 504);
    }
    const detail = normalizeDetail(extractDetailPayload(result.body));
    if (!detail) {
      console.error('YMOVE_DETAIL_UNEXPECTED_SHAPE', { keys: safeTopLevelKeys(result.body) });
      return json(
        { ok: false, code: 'invalid_response', message: "Impossibile leggere i dati dell'esercizio da YMove." },
        502,
      );
    }
    return json({ ok: true, data: detail }, 200);
  }

  if (body.action === 'translate') {
    if (role !== 'coach' && role !== 'superadmin') {
      return json({ ok: false, code: 'forbidden', message: 'Traduzione riservata a coach e superadmin.' }, 403);
    }

    const azureKey = Deno.env.get('AZURE_TRANSLATOR_KEY')?.trim();
    const azureRegion = Deno.env.get('AZURE_TRANSLATOR_REGION')?.trim();
    const azureEndpoint = Deno.env.get('AZURE_TRANSLATOR_ENDPOINT')?.trim() || AZURE_TRANSLATOR_DEFAULT_ENDPOINT;
    console.log('AZURE_TRANSLATOR_ENV_CHECK', { configured: Boolean(azureKey), regionConfigured: Boolean(azureRegion) });
    if (!azureKey || !azureRegion) {
      // Non un errore: il chiamante ricade sui testi originali senza
      // inventare alcuna traduzione, esattamente come richiesto. La risorsa
      // Azure Translator e' regionale: senza region la chiamata fallirebbe
      // comunque con 401, quindi la trattiamo come "non configurato" tanto
      // quanto la chiave mancante.
      return json(
        { ok: false, code: 'translation_not_configured', message: 'Nessun servizio di traduzione configurato.' },
        200,
      );
    }

    // Formato NUOVO (2026-07-13, richiesto per l'auto-link YMove): { texts:
    // string[], from?: string, to: string } — traduzione generica in
    // qualunque direzione (usata oggi per IT->EN, cercare il nome inglese di
    // un esercizio locale su YMove). Riconosciuto quando body.texts e' un
    // array: la forma legacy sotto usa sempre un oggetto {title,description,
    // instructions}, mai un array, quindi le due forme non si confondono mai.
    if (Array.isArray(body.texts)) {
      const inputTexts = body.texts.map((t) => (typeof t === 'string' ? t : ''));
      const to = typeof body.to === 'string' && body.to.trim() ? body.to.trim() : '';
      if (!to) {
        return json({ ok: false, code: 'invalid_body', message: "Lingua di destinazione ('to') mancante." }, 400);
      }
      const from = typeof body.from === 'string' && body.from.trim() ? body.from.trim() : null;

      const translatedArray = await translateAzureTextArray(azureKey, azureRegion, azureEndpoint, inputTexts, from, to);
      if (!translatedArray) {
        return json(
          { ok: false, code: 'translation_failed', message: 'Traduzione non riuscita: verranno usati i testi originali.' },
          200,
        );
      }
      return json({ ok: true, data: { texts: translatedArray } }, 200);
    }

    // Formato LEGACY (invariato): { texts: {title,description,instructions} },
    // sempre EN->IT — usato da mobile/src/lib/ymove-service.ts,
    // translateYmoveTexts, all'import di un esercizio YMove.
    const texts = typeof body.texts === 'object' && body.texts !== null ? (body.texts as Record<string, unknown>) : {};
    const title = typeof texts.title === 'string' ? texts.title : '';
    const description = typeof texts.description === 'string' ? texts.description : '';
    const instructions = typeof texts.instructions === 'string' ? texts.instructions : '';

    const translated = await translateWithAzure(azureKey, azureRegion, azureEndpoint, { title, description, instructions });
    if (!translated) {
      return json(
        { ok: false, code: 'translation_failed', message: 'Traduzione non riuscita: verranno usati i testi originali.' },
        200,
      );
    }
    return json({ ok: true, data: translated }, 200);
  }

  // --- FitCoach Nutrizione Fase 1: 8 azioni sola-lettura, riservate a
  // role='cliente' o 'superadmin' (nessun accesso coach in questa fase).
  const NUTRITION_ALLOWED = role === 'cliente' || role === 'superadmin';

  if (body.action === 'foods_search') {
    if (!NUTRITION_ALLOWED) {
      return json({ ok: false, code: 'forbidden', message: 'Ricerca alimenti riservata al cliente.' }, 403);
    }
    if (!ymoveApiKey) {
      return json({ ok: false, code: 'ymove_not_configured', message: 'YMOVE_API_KEY non configurata sulla Edge Function.' }, 500);
    }
    const filters = typeof body.filters === 'object' && body.filters !== null ? (body.filters as Record<string, unknown>) : {};
    const errors: ParamError[] = [];
    const query = readStringParam(filters, 'query', { required: true, maxLen: 200 }, errors);
    const source = readEnumParam(filters, 'source', FOOD_SOURCE_VALUES, errors);
    const usdaOnly = readBooleanParam(filters, 'usdaOnly', errors);
    const country = readStringParam(filters, 'country', { exactLen: 2 }, errors);
    const per = readEnumParam(filters, 'per', FOOD_PER_VALUES, errors);
    const page = readIntParam(filters, 'page', { min: 1 }, errors);
    const pageSize = readIntParam(filters, 'pageSize', { min: 1, max: 50 }, errors);
    if (errors.length > 0) return validationErrorResponse(errors);

    const result = await callYmove(`/foods?${buildQuery({ query, source, usdaOnly, country, per, page, pageSize })}`, ymoveApiKey);
    const callResult = callYmoveOrError(result);
    if (!callResult.ok) return callResult.response;
    const { data, pagination } = extractDataAndPagination(callResult.body);
    return json({ ok: true, data: { items: data, pagination } }, 200);
  }

  if (body.action === 'food_detail') {
    if (!NUTRITION_ALLOWED) {
      return json({ ok: false, code: 'forbidden', message: 'Dettaglio alimento riservato al cliente.' }, 403);
    }
    if (!ymoveApiKey) {
      return json({ ok: false, code: 'ymove_not_configured', message: 'YMOVE_API_KEY non configurata sulla Edge Function.' }, 500);
    }
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) return json({ ok: false, code: 'invalid_params', message: "Parametro 'id' mancante." }, 400);

    const result = await callYmove(`/foods/${encodeURIComponent(id)}`, ymoveApiKey);
    const callResult = callYmoveOrError(result);
    if (!callResult.ok) return callResult.response;
    const { data } = extractDataAndPagination(callResult.body);
    return json({ ok: true, data }, 200);
  }

  if (body.action === 'food_barcode') {
    if (!NUTRITION_ALLOWED) {
      return json({ ok: false, code: 'forbidden', message: 'Ricerca per barcode riservata al cliente.' }, 403);
    }
    if (!ymoveApiKey) {
      return json({ ok: false, code: 'ymove_not_configured', message: 'YMOVE_API_KEY non configurata sulla Edge Function.' }, 500);
    }
    const upc = typeof body.upc === 'string' ? body.upc.trim() : '';
    if (!upc) return json({ ok: false, code: 'invalid_params', message: "Parametro 'upc' mancante." }, 400);
    const filters = typeof body.filters === 'object' && body.filters !== null ? (body.filters as Record<string, unknown>) : {};
    const errors: ParamError[] = [];
    const country = readStringParam(filters, 'country', { exactLen: 2 }, errors);
    if (errors.length > 0) return validationErrorResponse(errors);

    const result = await callYmove(`/foods/barcode/${encodeURIComponent(upc)}?${buildQuery({ country })}`, ymoveApiKey);
    const callResult = callYmoveOrError(result);
    if (!callResult.ok) return callResult.response;
    const { data } = extractDataAndPagination(callResult.body);
    return json({ ok: true, data }, 200);
  }

  if (body.action === 'recipes_search') {
    if (!NUTRITION_ALLOWED) {
      return json({ ok: false, code: 'forbidden', message: 'Ricerca ricette riservata al cliente.' }, 403);
    }
    if (!ymoveApiKey) {
      return json({ ok: false, code: 'ymove_not_configured', message: 'YMOVE_API_KEY non configurata sulla Edge Function.' }, 500);
    }
    const filters = typeof body.filters === 'object' && body.filters !== null ? (body.filters as Record<string, unknown>) : {};
    const errors: ParamError[] = [];
    const query = readStringParam(filters, 'query', { maxLen: 200 }, errors);
    // Nota verificata contro l'OpenAPI reale: 'balanced' NON e' un valore
    // valido per /recipes/search?diet= (a differenza di /mealplans/generate).
    const diet = readEnumParam(filters, 'diet', RECIPE_DIET_VALUES, errors);
    const cuisine = readEnumParam(filters, 'cuisine', RECIPE_CUISINE_VALUES, errors);
    const mealType = readEnumParam(filters, 'mealType', MEAL_TYPE_VALUES, errors);
    const maxCalories = readNumberParam(filters, 'maxCalories', errors);
    const minProtein = readNumberParam(filters, 'minProtein', errors);
    const page = readIntParam(filters, 'page', { min: 1 }, errors);
    const pageSize = readIntParam(filters, 'pageSize', { min: 1, max: 50 }, errors);
    if (errors.length > 0) return validationErrorResponse(errors);

    const result = await callYmove(
      `/recipes/search?${buildQuery({ query, diet, cuisine, mealType, maxCalories, minProtein, page, pageSize })}`,
      ymoveApiKey,
    );
    const callResult = callYmoveOrError(result);
    if (!callResult.ok) return callResult.response;
    const { data, pagination } = extractDataAndPagination(callResult.body);
    return json({ ok: true, data: { items: data, pagination } }, 200);
  }

  if (body.action === 'recipe_detail') {
    if (!NUTRITION_ALLOWED) {
      return json({ ok: false, code: 'forbidden', message: 'Dettaglio ricetta riservato al cliente.' }, 403);
    }
    if (!ymoveApiKey) {
      return json({ ok: false, code: 'ymove_not_configured', message: 'YMOVE_API_KEY non configurata sulla Edge Function.' }, 500);
    }
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) return json({ ok: false, code: 'invalid_params', message: "Parametro 'id' mancante." }, 400);

    const result = await callYmove(`/recipes/${encodeURIComponent(id)}`, ymoveApiKey);
    const callResult = callYmoveOrError(result);
    if (!callResult.ok) return callResult.response;
    const { data } = extractDataAndPagination(callResult.body);
    return json({ ok: true, data }, 200);
  }

  if (body.action === 'recipes_diets') {
    if (!NUTRITION_ALLOWED) {
      return json({ ok: false, code: 'forbidden', message: 'Riservato al cliente.' }, 403);
    }
    if (!ymoveApiKey) {
      return json({ ok: false, code: 'ymove_not_configured', message: 'YMOVE_API_KEY non configurata sulla Edge Function.' }, 500);
    }
    const result = await callYmove('/recipes/diets', ymoveApiKey);
    const callResult = callYmoveOrError(result);
    if (!callResult.ok) return callResult.response;
    const { data } = extractDataAndPagination(callResult.body);
    return json({ ok: true, data }, 200);
  }

  if (body.action === 'recipes_meal_types') {
    if (!NUTRITION_ALLOWED) {
      return json({ ok: false, code: 'forbidden', message: 'Riservato al cliente.' }, 403);
    }
    if (!ymoveApiKey) {
      return json({ ok: false, code: 'ymove_not_configured', message: 'YMOVE_API_KEY non configurata sulla Edge Function.' }, 500);
    }
    const result = await callYmove('/recipes/meal-types', ymoveApiKey);
    const callResult = callYmoveOrError(result);
    if (!callResult.ok) return callResult.response;
    const { data } = extractDataAndPagination(callResult.body);
    return json({ ok: true, data }, 200);
  }

  if (body.action === 'mealplan_generate') {
    if (!NUTRITION_ALLOWED) {
      return json({ ok: false, code: 'forbidden', message: 'Generazione piano riservata al cliente.' }, 403);
    }
    if (!ymoveApiKey) {
      return json({ ok: false, code: 'ymove_not_configured', message: 'YMOVE_API_KEY non configurata sulla Edge Function.' }, 500);
    }
    const filters = typeof body.filters === 'object' && body.filters !== null ? (body.filters as Record<string, unknown>) : {};
    const errors: ParamError[] = [];
    const calories = readIntParam(filters, 'calories', { required: true, min: 1 }, errors);
    const diet = readEnumParam(filters, 'diet', MEALPLAN_DIET_VALUES, errors);
    const meals = readIntParam(filters, 'meals', { min: 3, max: 6 }, errors);
    const days = readIntParam(filters, 'days', { min: 1, max: 7 }, errors);
    const macroSplit = readEnumParam(filters, 'macroSplit', MACRO_SPLIT_VALUES, errors);
    if (errors.length > 0) return validationErrorResponse(errors);

    const result = await callYmove(`/mealplans/generate?${buildQuery({ calories, diet, meals, days, macroSplit })}`, ymoveApiKey);
    const callResult = callYmoveOrError(result);
    if (!callResult.ok) return callResult.response;
    const { data } = extractDataAndPagination(callResult.body);
    return json({ ok: true, data }, 200);
  }

  return json({ ok: false, code: 'invalid_action', message: 'Azione non riconosciuta.' }, 400);
  } catch (err) {
    return internalErrorResponse(
      'internal_error',
      'Errore interno della funzione. Riprova piu\' tardi.',
      500,
      err,
    );
  }
});
