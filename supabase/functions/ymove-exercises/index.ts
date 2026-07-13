// Edge Function: ymove-exercises
//
// Unico punto dell'app che parla con l'API esterna YMove (catalogo esercizi
// con video). La chiave YMove non deve MAI arrivare al client mobile (niente
// EXPO_PUBLIC_*): vive solo qui come secret Supabase (YMOVE_API_KEY) e viene
// allegata come header X-API-Key a ogni chiamata verso YMove v2
// (https://exercise-api.ymove.app/api/v2).
//
// Due azioni (POST { action: 'search' | 'detail', ... }):
// - 'search': lista filtrata, SEMPRE con includeVideos=false (la ricerca non
//   deve consumare il limite mensile dei video) — solo coach/superadmin.
// - 'detail': un singolo esercizio con video/thumbnail/istruzioni — sempre
//   permesso a coach/superadmin (serve anche per l'anteprima PRIMA di
//   importare); un cliente puo' chiamarlo SOLO se quell'esercizio YMove e'
//   gia' stato importato in FitCoach (public.exercises, source='ymove') e il
//   cliente ha un coach reale collegato (coach_clients). Vedi
//   docs/YMOVE_INTEGRATION.md per il limite architetturale onesto: non esiste
//   oggi un modo di verificare qui "e' davvero nella scheda di QUESTO
//   cliente", perche' le schede vivono solo lato app (AsyncStorage), mai su
//   Supabase — questo e' il controllo piu' forte possibile con i dati reali
//   disponibili lato server oggi.
//
// L'import vero e proprio (scrittura in public.exercises) NON passa da qui:
// il coach lo fa direttamente dal client mobile via RLS
// (exercises_coach_insert, docs/SUPABASE_SCHEMA.sql), riusando i metadati
// gia' ottenuti da questa funzione. Questa funzione non salva mai nulla nel
// database: e' un puro proxy di lettura verso YMove.
//
// Variabili d'ambiente richieste (supabase secrets set ...):
// - YMOVE_API_KEY: chiave API YMove v2.
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
  const title = pickString(o, 'title');
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

async function callYmove(path: string, apiKey: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${YMOVE_BASE_URL}${path}`, {
    method: 'GET',
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
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
function ymoveErrorResponse(result: { status: number; body: unknown }): Response | null {
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
    return json({ ok: false, code: 'not_found', message: receivedMessage ?? 'Esercizio non trovato su YMove.' }, 404);
  }
  return json(
    { ok: false, code: 'ymove_error', message: receivedMessage ?? `YMove ha risposto con un errore (${result.status}).` },
    result.status,
  );
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
    if (!ymoveApiKey) {
      return json({ ok: false, code: 'ymove_not_configured', message: 'YMOVE_API_KEY non configurata sulla Edge Function.' }, 500);
    }
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

    let body: { action?: unknown; filters?: unknown; id?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, code: 'invalid_body', message: 'Corpo della richiesta non valido.' }, 400);
    }

    if (body.action === 'search') {
    if (role !== 'coach' && role !== 'superadmin') {
      return json({ ok: false, code: 'forbidden', message: 'Ricerca nel catalogo YMove riservata a coach e superadmin.' }, 403);
    }
    const filters = typeof body.filters === 'object' && body.filters !== null ? (body.filters as Record<string, unknown>) : {};
    const result = await callYmove(`/exercises?${buildSearchQuery(filters)}`, ymoveApiKey);
    const errorResponse = ymoveErrorResponse(result);
    if (errorResponse) return errorResponse;
    const items = extractSearchList(result.body)
      .map(normalizeSummary)
      .filter((item): item is YmoveExerciseSummary => item !== null);
    return json({ ok: true, data: items }, 200);
  }

  if (body.action === 'detail') {
    const ymoveId = typeof body.id === 'string' ? body.id.trim() : '';
    if (!ymoveId) {
      return json({ ok: false, code: 'invalid_id', message: 'Id esercizio mancante.' }, 400);
    }

    if (role === 'cliente') {
      const { data: link } = await supabaseAdmin
        .from('coach_clients')
        .select('id')
        .eq('client_id', callerId)
        .in('status', ['active', 'invited'])
        .maybeSingle();
      if (!link) {
        return json({ ok: false, code: 'forbidden', message: 'Nessun coach collegato a questo account.' }, 403);
      }
      const { data: importedExercise } = await supabaseAdmin
        .from('exercises')
        .select('id')
        .eq('ymove_exercise_id', ymoveId)
        .eq('source', 'ymove')
        .maybeSingle();
      if (!importedExercise) {
        return json({ ok: false, code: 'forbidden', message: 'Questo video non e\' disponibile per il tuo account.' }, 403);
      }
    } else if (role !== 'coach' && role !== 'superadmin') {
      return json({ ok: false, code: 'forbidden', message: 'Ruolo non autorizzato.' }, 403);
    }

    const result = await callYmove(`/exercises/${encodeURIComponent(ymoveId)}?includeVideos=true`, ymoveApiKey);
    const errorResponse = ymoveErrorResponse(result);
    if (errorResponse) return errorResponse;
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
