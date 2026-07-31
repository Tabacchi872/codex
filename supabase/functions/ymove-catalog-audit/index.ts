import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const YMOVE_BASE_URL = 'https://exercise-api.ymove.app/api/v2';
const PAGE_SIZE = 50;
const MAX_BATCH_SIZE = 10;
const DEFAULT_BATCH_SIZE = 5;
const MAX_RETRIES = 2;
const REQUEST_BUDGET_MS = 22_000;
const ALGORITHM_VERSION = 'ymove-batch-audit-2026-07-30-v2-alias-prefilter';
const AUTO_THRESHOLD = 88;
const REVIEW_THRESHOLD = 62;
const MIN_AUTO_GAP = 8;

type JsonRecord = Record<string, unknown>;
type AuditStatus = 'AUTO_MATCH' | 'REVIEW_REQUIRED' | 'UNMATCHED' | 'CONFLICT';
type RunStatus = 'created' | 'syncing_catalog' | 'catalog_ready' | 'matching' | 'finalizing' | 'completed' | 'failed' | 'cancelled';
type SupabaseClient = ReturnType<typeof createClient>;

type FitExercise = {
  id: string;
  uuid: string | null;
  slug: string | null;
  name: string;
  nameEn: string | null;
  muscleGroup: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
  category: string | null;
  difficulty: string | null;
  movementPattern: string | null;
  bodyPosition: string | null;
  laterality: string | null;
  metadataPresent: boolean;
  active: boolean | null;
  source: 'exercises' | 'metadata';
};

type CatalogItem = {
  external_exercise_id: string;
  title: string;
  normalized_title: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string[];
  movement_pattern: string | null;
  body_position: string | null;
  difficulty: string | null;
  sanitized_metadata: JsonRecord;
  page_number: number;
};

type Candidate = CatalogItem & {
  score: number;
  reasons: string[];
  contradictions: string[];
  breakdown: JsonRecord;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function logPhase(event: string, fields: JsonRecord = {}) {
  console.info(event, fields);
}

function errorResponse(code: string, message: string, status: number, extra: JsonRecord = {}) {
  return json({ ok: false, code, message, ...extra }, status);
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function jsonArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number' && !Number.isFinite(item)) return null;
    if (item === undefined) return null;
    if (item instanceof Error) return item.message;
    if (item instanceof Set) return [...item];
    if (item instanceof Map) return Object.fromEntries(item);
    if (typeof item === 'function') return null;
    return item;
  })) as unknown[];
}

function safeNameFromId(id: string): string {
  return id
    .replace(/^[0-9a-f-]{36}$/i, 'Esercizio custom')
    .split('-')
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part)
    .join(' ');
}

const knownHumanNames = new Map<string, string>([
  ['bicipiti-curl-alternato', 'Curl alternato con manubri'],
  ['bicipiti-curl-bilanciere', 'Curl con bilanciere'],
  ['bicipiti-curl-cavo', 'Curl al cavo'],
  ['cardio-burpees', 'Burpees'],
  ['core-crunch', 'Crunch'],
  ['core-plank', 'Plank'],
  ['dorso-lat-machine-avanti', 'Lat machine avanti'],
  ['dorso-lat-machine-neutra', 'Lat machine presa neutra'],
  ['dorso-pulley-basso', 'Pulley basso'],
  ['dorso-rematore-bilanciere', 'Rematore con bilanciere'],
  ['dorso-rematore-manubrio', 'Rematore con manubrio'],
  ['gambe-hip-thrust', 'Hip thrust'],
  ['gambe-leg-curl', 'Leg curl'],
  ['gambe-leg-extension', 'Leg extension'],
  ['gambe-pressa-45', 'Pressa 45 gradi'],
  ['gambe-squat', 'Squat'],
  ['gambe-stacco-rumeno', 'Stacco rumeno'],
  ['petto-panca-inclinata-manubri', 'Panca inclinata manubri'],
  ['petto-panca-piana-bilanciere', 'Panca piana bilanciere'],
  ['petto-panca-piana-manubri', 'Panca piana manubri'],
  ['polpacci-calf-raise', 'Calf raise'],
  ['spalle-alzate-laterali', 'Alzate laterali'],
  ['spalle-alzate-laterali-cavo', 'Alzate laterali al cavo'],
  ['tricipiti-pushdown', 'Pushdown tricipiti'],
]);

function humanNameFromId(id: string): string {
  const known = knownHumanNames.get(id);
  if (known) return known;
  const groupPrefixes = new Set(['addome', 'bicipiti', 'cardio', 'core', 'dorso', 'gambe', 'glutei', 'petto', 'polpacci', 'spalle', 'tricipiti']);
  const parts = id.split('-').filter(Boolean);
  const useful = groupPrefixes.has(parts[0] ?? '') ? parts.slice(1) : parts;
  const normalized = useful.join('-')
    .replace(/\b45\b/g, '45 gradi')
    .replace(/\bcavo\b/g, 'al cavo')
    .replace(/\bbilanciere\b/g, 'con bilanciere')
    .replace(/\bmanubri\b/g, 'con manubri')
    .replace(/\bmanubrio\b/g, 'con manubrio');
  return safeNameFromId(normalized || id);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

const stopWords = new Set(['al', 'alla', 'allo', 'con', 'per', 'da', 'di', 'del', 'della', 'the', 'and', 'of', 'exercise', 'esercizio']);
const synonyms = new Map([
  ['lat machine', 'lat pulldown'],
  ['lat machine avanti', 'wide grip lat pulldown'],
  ['pulley basso', 'seated cable row'],
  ['rematore al cavo', 'cable row'],
  ['panca piana bilanciere', 'barbell bench press'],
  ['panca piana manubri', 'dumbbell bench press'],
  ['panca inclinata bilanciere', 'incline barbell bench press'],
  ['panca inclinata manubri', 'incline dumbbell bench press'],
  ['chest press', 'machine chest press'],
  ['alzate laterali', 'lateral raise'],
  ['lento avanti', 'overhead press'],
  ['pressa 45', '45 degree leg press'],
  ['pressa', 'leg press'],
  ['leg curl', 'hamstring curl'],
  ['leg extension', 'knee extension'],
  ['stacco rumeno', 'romanian deadlift'],
  ['rdl', 'romanian deadlift'],
  ['hip thrust', 'barbell hip thrust'],
  ['ponte glutei', 'glute bridge'],
  ['curl manubri', 'dumbbell biceps curl'],
  ['pushdown', 'triceps cable pushdown'],
  ['french press', 'lying triceps extension'],
  ['plank', 'front plank'],
  ['crunch', 'abdominal crunch'],
  ['burpees', 'burpee'],
  ['burpee', 'burpee'],
  ['rematore bilanciere', 'barbell row'],
  ['rematore manubrio', 'dumbbell row'],
  ['curl alternato', 'alternating dumbbell curl'],
  ['curl bilanciere', 'barbell curl'],
  ['curl cavo', 'cable curl'],
  ['calf raise', 'calf raise'],
  ['panca piana', 'flat bench press'],
  ['panca inclinata', 'incline bench press'],
]);
const muscleMap = new Map([
  ['petto', 'chest'],
  ['dorso', 'back'],
  ['dorsali', 'back'],
  ['spalle', 'shoulders'],
  ['bicipiti', 'biceps'],
  ['tricipiti', 'triceps'],
  ['quadricipiti', 'quads'],
  ['gambe', 'quads'],
  ['femorali', 'hamstrings'],
  ['glutei', 'glutes'],
  ['polpacci', 'calves'],
  ['addome', 'core'],
  ['obliqui', 'core'],
  ['lombari', 'back'],
]);

function normalizeBase(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/°/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value: unknown): string {
  const base = normalizeBase(value);
  const expanded = synonyms.get(base) ?? base;
  return expanded
    .split(' ')
    .filter((token) => token && !stopWords.has(token))
    .map((token) => (token.endsWith('s') && token.length > 4 ? token.slice(0, -1) : token))
    .join(' ');
}

function aliasTexts(...values: unknown[]): string[] {
  const base = normalizeBase(values.filter(Boolean).join(' '));
  const out = new Set<string>([normalizeText(base)]);
  for (const [it, en] of synonyms) {
    if (base.includes(normalizeBase(it))) out.add(normalizeText(en));
    if (base.includes(normalizeBase(en))) out.add(normalizeText(it));
  }
  const phraseAliases: Array<[string[], string[]]> = [
    [['lat machine avanti', 'lat machine'], ['lat pulldown', 'wide grip lat pulldown']],
    [['pulley basso'], ['seated cable row', 'cable row']],
    [['rematore bilanciere'], ['barbell row', 'bent over barbell row']],
    [['rematore manubrio'], ['dumbbell row', 'one arm dumbbell row']],
    [['curl alternato'], ['alternating dumbbell curl', 'seated dumbbell curl alternating']],
    [['curl bilanciere'], ['barbell curl', 'ez bar curl']],
    [['curl cavo'], ['cable curl', 'cable biceps curl']],
    [['burpees', 'burpee'], ['burpee']],
    [['crunch'], ['abdominal crunch', 'crunch']],
    [['panca piana bilanciere'], ['barbell bench press', 'flat barbell bench press']],
    [['panca piana manubri'], ['dumbbell bench press', 'flat dumbbell bench press']],
    [['panca inclinata manubri'], ['incline dumbbell bench press']],
    [['pressa 45'], ['45 degree leg press', 'leg press']],
    [['leg extension'], ['leg extension', 'knee extension']],
    [['leg curl'], ['leg curl', 'hamstring curl']],
    [['stacco rumeno'], ['romanian deadlift', 'rdl']],
    [['alzate laterali cavo'], ['cable lateral raise']],
    [['alzate laterali'], ['lateral raise', 'dumbbell lateral raise']],
    [['pushdown'], ['triceps pushdown', 'cable triceps pushdown']],
    [['hip thrust'], ['hip thrust', 'barbell hip thrust']],
    [['calf raise'], ['calf raise', 'standing calf raise']],
    [['plank'], ['front plank', 'plank']],
    [['squat'], ['squat']],
  ];
  for (const [keys, aliases] of phraseAliases) {
    if (keys.some((key) => base.includes(normalizeBase(key)))) {
      aliases.forEach((value) => out.add(normalizeText(value)));
    }
  }
  return [...out].filter(Boolean);
}

function tokenSet(...values: unknown[]): Set<string> {
  const out = new Set<string>();
  for (const value of values) normalizeText(value).split(' ').filter(Boolean).forEach((token) => out.add(token));
  return out;
}

function tokensFromTexts(values: string[]): Set<string> {
  const out = new Set<string>();
  values.forEach((value) => value.split(' ').filter(Boolean).forEach((token) => out.add(token)));
  return out;
}

function tokenOverlapScore(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

function intersects<T>(left: Set<T>, right: Set<T>): boolean {
  for (const item of left) if (right.has(item)) return true;
  return false;
}

function detectSet(patterns: Array<[string, string[]]>, ...values: unknown[]): Set<string> {
  const text = normalizeText(values.filter(Boolean).join(' '));
  const out = new Set<string>();
  for (const [tag, keys] of patterns) if (keys.some((key) => text.includes(normalizeText(key)))) out.add(tag);
  return out;
}

function detectEquipment(...values: unknown[]): Set<string> {
  return detectSet([
    ['barbell', ['bilanciere', 'barbell', 'ez']],
    ['dumbbell', ['manubrio', 'manubri', 'dumbbell']],
    ['cable', ['cavo', 'cavi', 'pulley', 'cable']],
    ['machine', ['macchina', 'machine', 'lat machine', 'pressa', 'leg press', 'chest press', 'hack squat']],
    ['bodyweight', ['corpo libero', 'bodyweight', 'sbarra', 'push up', 'plank']],
    ['band', ['elastico', 'band']],
    ['bench', ['panca', 'bench']],
  ], ...values);
}

function detectPattern(...values: unknown[]): string | null {
  const text = normalizeText(values.filter(Boolean).join(' '));
  if (/(bench press|chest press|push up|dip|press)/.test(text) && !/leg press/.test(text)) return 'horizontal_push';
  if (/(pulley|row|rematore|seated cable row|machine row|inverted row)/.test(text)) return 'horizontal_pull';
  if (/(lat pulldown|lat machine|pull up|trazioni)/.test(text)) return 'vertical_pull';
  if (/(overhead press|shoulder press|military press)/.test(text)) return 'vertical_push';
  if (/(squat|leg press|hack squat|affondi|lunge|step up|leg extension)/.test(text)) return 'knee_dominant';
  if (/(deadlift|stacco|hip thrust|glute bridge|good morning|leg curl|hamstring curl)/.test(text)) return 'hip_hinge';
  if (/(curl)/.test(text)) return 'elbow_flexion';
  if (/(pushdown|triceps|french press|extension)/.test(text)) return 'elbow_extension';
  if (/(plank|crunch|twist|pallof|hollow|dead bug)/.test(text)) return 'core';
  return null;
}

function discriminator(kind: 'angle' | 'position' | 'laterality' | 'grip', ...values: unknown[]): Set<string> {
  const dictionaries = {
    angle: [['incline', ['inclinata', 'incline']], ['decline', ['declinata', 'decline']], ['flat', ['piana', 'flat']], ['45', ['45', '45 degree']]],
    position: [['seated', ['seduto', 'seated']], ['lying', ['sdraiato', 'lying', 'prono', 'supino']], ['standing', ['in piedi', 'standing']]],
    laterality: [['single', ['singolo', 'monopodalico', 'unilaterale', 'single', 'one arm', 'alternato']], ['bilateral', ['bilaterale', 'both']]],
    grip: [['wide', ['larga', 'wide']], ['close', ['stretta', 'close']], ['neutral', ['neutra', 'neutral']], ['supinated', ['supina', 'supinated']], ['pronated', ['prona', 'pronated']]],
  } satisfies Record<string, Array<[string, string[]]>>;
  return detectSet(dictionaries[kind], ...values);
}

function exerciseFeatures(item: FitExercise | CatalogItem, isCatalog: boolean) {
  const names = isCatalog
    ? [(item as CatalogItem).title, (item as CatalogItem).normalized_title]
    : [(item as FitExercise).name, (item as FitExercise).nameEn, (item as FitExercise).slug, (item as FitExercise).id];
  const muscles = isCatalog
    ? [(item as CatalogItem).primary_muscles[0], ...(item as CatalogItem).secondary_muscles]
    : [(item as FitExercise).muscleGroup, ...(item as FitExercise).primaryMuscles, ...(item as FitExercise).secondaryMuscles];
  const aliases = aliasTexts(...names);
  return {
    text: normalizeText(names.filter(Boolean).join(' ')),
    aliases,
    tokens: tokensFromTexts(aliases),
    muscles: tokenSet(...muscles.map((value) => muscleMap.get(normalizeText(value)) ?? value)),
    equipment: isCatalog ? new Set((item as CatalogItem).equipment) : detectEquipment(...names, (item as FitExercise).equipment),
    pattern: isCatalog ? (item as CatalogItem).movement_pattern : ((item as FitExercise).movementPattern ?? detectPattern(...names, (item as FitExercise).equipment, (item as FitExercise).category)),
    angle: discriminator('angle', ...names, isCatalog ? (item as CatalogItem).sanitized_metadata?.equipment : (item as FitExercise).equipment),
    position: discriminator('position', ...names, isCatalog ? (item as CatalogItem).body_position : (item as FitExercise).bodyPosition),
    laterality: discriminator('laterality', ...names, isCatalog ? (item as CatalogItem).sanitized_metadata?.laterality : (item as FitExercise).laterality),
    grip: discriminator('grip', ...names),
  };
}

function bestAliasNameScore(fitAliases: string[], yAliases: string[]): { score: number; reason: string | null } {
  let best = 0;
  let reason: string | null = null;
  for (const fit of fitAliases) {
    const fitTokens = tokenSet(fit);
    for (const y of yAliases) {
      if (fit && y && fit === y) return { score: 44, reason: `alias/nome equivalente: ${fit}` };
      const overlap = tokenOverlapScore(fitTokens, tokenSet(y));
      const score = Math.round(overlap * 36);
      if (score > best) {
        best = score;
        reason = score >= 12 ? `similarita nome/alias: ${score}` : null;
      }
    }
  }
  return { score: best, reason };
}

function mismatch(label: string, left: Set<string>, right: Set<string>): string | null {
  if (left.size === 0 || right.size === 0) return null;
  return intersects(left, right) ? null : label;
}

function scoreCandidate(fit: FitExercise, candidate: CatalogItem): Candidate {
  const f = exerciseFeatures(fit, false);
  const y = exerciseFeatures(candidate, true);
  const reasons: string[] = [];
  const contradictions: string[] = [];
  const breakdown: JsonRecord = {};
  let score = 0;

  const nameScore = bestAliasNameScore(f.aliases, y.aliases);
  score += nameScore.score;
  breakdown.name = nameScore.score;
  if (nameScore.reason) reasons.push(nameScore.reason);
  const shared = [...f.tokens].filter((token) => y.tokens.has(token)).length;
  if (shared > 0 && nameScore.score < 18) {
    const sharedScore = Math.min(18, shared * 5);
    score += sharedScore;
    breakdown.sharedTokens = sharedScore;
    reasons.push(`token nome condivisi: ${shared}`);
  }
  if (intersects(f.muscles, y.muscles)) {
    score += 18;
    breakdown.muscle = 18;
    reasons.push('muscolo coerente');
  } else if (f.muscles.size && y.muscles.size) {
    contradictions.push('muscolo principale differente');
    score -= 18;
    breakdown.muscle = -18;
  }
  if (intersects(f.equipment, y.equipment)) {
    score += 16;
    breakdown.equipment = 16;
    reasons.push('attrezzatura coerente');
  } else if (f.equipment.size && y.equipment.size) {
    contradictions.push('attrezzatura incompatibile');
    score -= 24;
    breakdown.equipment = -24;
  }
  if (f.pattern && y.pattern && f.pattern === y.pattern) {
    score += 14;
    breakdown.pattern = 14;
    reasons.push(`pattern coerente: ${f.pattern}`);
  } else if (f.pattern && y.pattern) {
    contradictions.push('pattern incompatibile');
    score -= 18;
    breakdown.pattern = -18;
  }
  for (const [label, left, right] of [
    ['angolo incompatibile', f.angle, y.angle],
    ['posizione incompatibile', f.position, y.position],
    ['unilateralita incompatibile', f.laterality, y.laterality],
    ['presa incompatibile', f.grip, y.grip],
  ] as const) {
    const problem = mismatch(label, left, right);
    if (problem) {
      contradictions.push(problem);
      score -= 14;
      breakdown[label] = -14;
    } else if (left.size && right.size) {
      score += 5;
      breakdown[label.replace('incompatibile', 'coerente')] = 5;
      reasons.push(label.replace('incompatibile', 'coerente'));
    }
  }

  return {
    ...candidate,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    contradictions: [...new Set(contradictions)],
    breakdown,
  };
}

function prefilterCandidates(fit: FitExercise, catalog: CatalogItem[]): CatalogItem[] {
  const f = exerciseFeatures(fit, false);
  const ranked = catalog.map((item) => {
    const y = exerciseFeatures(item, true);
    const nameHit = tokenOverlapScore(f.tokens, y.tokens);
    const muscleHit = intersects(f.muscles, y.muscles);
    const patternHit = Boolean(f.pattern && y.pattern && f.pattern === y.pattern);
    const equipmentHit = intersects(f.equipment, y.equipment);
    const aliasScore = bestAliasNameScore(f.aliases, y.aliases).score;
    const quickScore = aliasScore + (nameHit * 30) + (muscleHit ? 14 : 0) + (patternHit ? 12 : 0) + (equipmentHit ? 10 : 0);
    return { item, quickScore };
  }).sort((a, b) => b.quickScore - a.quickScore);
  const useful = ranked.filter((entry) => entry.quickScore > 0).slice(0, 180).map((entry) => entry.item);
  return useful.length > 0 ? useful : ranked.slice(0, 30).map((entry) => entry.item);
}

function classify(fit: FitExercise, candidates: Candidate[], duplicateName: boolean) {
  const ranked = candidates.sort((a, b) => b.score - a.score).slice(0, 6);
  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const score = best?.score ?? 0;
  const secondScore = second?.score ?? 0;
  const scoreGap = score - secondScore;
  let status: AuditStatus = 'UNMATCHED';
  if (duplicateName) status = 'CONFLICT';
  else if (best && score >= AUTO_THRESHOLD && scoreGap >= MIN_AUTO_GAP && best.contradictions.length === 0) status = 'AUTO_MATCH';
  else if (best && score >= REVIEW_THRESHOLD) status = 'REVIEW_REQUIRED';
  return {
    fitcoach_exercise_key: fit.id,
    fitcoach_exercise_id: fit.uuid,
    fitcoach_name: fit.name,
    status,
    candidate_external_id: best?.external_exercise_id ?? null,
    candidate_title: best?.title ?? null,
    score: finiteOrNull(score),
    second_score: best && second ? finiteOrNull(secondScore) : null,
    score_gap: best && second ? finiteOrNull(scoreGap) : null,
    reasons: jsonArray(best?.reasons ?? []),
    contradictions: jsonArray(best?.contradictions ?? []),
    alternatives: jsonArray(ranked.slice(1, 4).map((item) => ({
      ymoveId: item.external_exercise_id,
      title: item.title,
      score: item.score,
    }))),
    candidate_count: candidates.length,
    rejection_reason: status === 'UNMATCHED'
      ? best ? `score massimo ${score} sotto soglia REVIEW_REQUIRED ${REVIEW_THRESHOLD}` : 'nessun candidato generato'
      : null,
    score_breakdown: best?.breakdown ?? {},
    algorithm_version: ALGORITHM_VERSION,
  };
}

function sanitizeYmoveItem(item: JsonRecord, pageNumber: number): CatalogItem | null {
  const id = pickString(item.id);
  const title = pickString(item.title) ?? pickString(item.name);
  if (!id || !title) return null;
  const primaryMuscles = [pickString(item.muscleGroup), pickString(item.primaryMuscle)].filter(Boolean) as string[];
  const secondaryMuscles = stringArray(item.secondaryMuscles);
  const equipmentRaw = [pickString(item.equipment), ...stringArray(item.equipmentTags)].filter(Boolean);
  const exerciseTypes = stringArray(item.exerciseType);
  return {
    external_exercise_id: id,
    title,
    normalized_title: normalizeText(title),
    primary_muscles: primaryMuscles,
    secondary_muscles: secondaryMuscles,
    equipment: [...detectEquipment(title, ...equipmentRaw)],
    movement_pattern: detectPattern(title, item.category, ...exerciseTypes),
    body_position: pickString(item.bodyPosition),
    difficulty: pickString(item.difficulty),
    sanitized_metadata: {
      slug: pickString(item.slug),
      category: pickString(item.category),
      difficulty: pickString(item.difficulty),
      exerciseTypes,
      equipment: equipmentRaw,
    },
    page_number: pageNumber,
  };
}

async function fetchYmoveJson(url: string, apiKey: string, phase: string, page: number | null): Promise<JsonRecord> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const remote = await fetch(url, { headers: { 'X-API-Key': apiKey }, signal: controller.signal });
      clearTimeout(timeout);
      const body = await remote.json().catch(() => ({}));
      if (remote.status === 429 && attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        continue;
      }
      if (!remote.ok) {
        return { _error: true, code: 'YMOVE_REMOTE_ERROR', phase, page, remoteStatus: remote.status, retries: attempt };
      }
      return body as JsonRecord;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < MAX_RETRIES) await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  return {
    _error: true,
    code: 'YMOVE_TIMEOUT',
    phase,
    page,
    remoteStatus: 'timeout',
    retries: MAX_RETRIES,
    message: lastError instanceof Error ? lastError.message : 'timeout',
  };
}

async function requireSuperadmin(req: Request, supabaseUrl: string, anonKey: string, serviceRoleKey: string) {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { ok: false as const, result: errorResponse('NOT_AUTHENTICATED', 'Accesso richiesto.', 401) };
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return { ok: false as const, result: errorResponse('NOT_AUTHENTICATED', 'Sessione non valida.', 401) };
  const { data: profile, error: profileError } = await adminClient.from('profiles').select('id, role').eq('id', data.user.id).maybeSingle();
  if (profileError || profile?.role !== 'superadmin') return { ok: false as const, result: errorResponse('FORBIDDEN', 'Solo Superadmin puo eseguire audit YMove.', 403) };
  return { ok: true as const, adminClient, userId: data.user.id };
}

async function readFitcoachExercises(adminClient: SupabaseClient): Promise<FitExercise[]> {
  const [metadataRes, exercisesRes] = await Promise.all([
    adminClient.from('exercise_movement_metadata').select('*'),
    adminClient.from('exercises').select('*'),
  ]);
  if (metadataRes.error || exercisesRes.error) throw new Error('FITCOACH_DB_READ_FAILED');

  const metadataById = new Map<string, JsonRecord>();
  for (const row of metadataRes.data ?? []) {
    const r = row as JsonRecord;
    const id = pickString(r.exercise_id);
    if (id) metadataById.set(id, r);
  }
  const byId = new Map<string, FitExercise>();
  for (const row of exercisesRes.data ?? []) {
    const r = row as JsonRecord;
    const uuid = pickString(r.id);
    if (!uuid || !isUuid(uuid)) continue;
    const slug = pickString(r.slug);
    const metadata = slug ? metadataById.get(slug) : metadataById.get(uuid);
    byId.set(uuid, {
      id: uuid,
      uuid,
      slug: pickString(r.slug) ?? uuid,
      name: pickString(r.name) ?? safeNameFromId(uuid),
      nameEn: pickString(r.name_en),
      muscleGroup: pickString(r.primary_muscle_group) ?? pickString(r.muscle_group) ?? pickString(metadata?.primary_muscle_group) ?? null,
      primaryMuscles: stringArray(r.primary_muscles).length
        ? stringArray(r.primary_muscles)
        : [pickString(metadata?.primary_muscle_group)].filter(Boolean) as string[],
      secondaryMuscles: stringArray(r.secondary_muscles).length ? stringArray(r.secondary_muscles) : stringArray(metadata?.secondary_muscle_groups),
      equipment: pickString(r.equipment) ?? pickString(metadata?.equipment_tag) ?? null,
      category: pickString(r.exercise_type) ?? pickString(metadata?.movement_class) ?? null,
      difficulty: pickString(r.difficulty) ?? pickString(metadata?.min_level) ?? null,
      movementPattern: pickString(metadata?.movement_pattern),
      bodyPosition: null,
      laterality: metadata?.is_unilateral === true ? 'unilateral' : metadata?.is_unilateral === false ? 'bilateral' : null,
      metadataPresent: Boolean(metadata),
      active: typeof r.active === 'boolean' ? r.active : metadata?.is_active === false ? false : true,
      source: 'exercises',
    });
  }
  for (const [metadataId, metadata] of metadataById) {
    const linkedBySlug = [...byId.values()].some((exercise) => exercise.slug === metadataId);
    if (linkedBySlug) continue;
    byId.set(metadataId, {
      id: metadataId,
      uuid: null,
      slug: metadataId,
      name: humanNameFromId(metadataId),
      nameEn: null,
      muscleGroup: pickString(metadata.primary_muscle_group),
      primaryMuscles: [pickString(metadata.primary_muscle_group)].filter(Boolean) as string[],
      secondaryMuscles: stringArray(metadata.secondary_muscle_groups),
      equipment: pickString(metadata.equipment_tag),
      category: pickString(metadata.movement_class),
      difficulty: pickString(metadata.min_level),
      movementPattern: pickString(metadata.movement_pattern),
      bodyPosition: null,
      laterality: metadata.is_unilateral === true ? 'unilateral' : metadata.is_unilateral === false ? 'bilateral' : null,
      metadataPresent: true,
      active: metadata.is_active === false ? false : true,
      source: 'metadata',
    });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function getRun(adminClient: SupabaseClient, auditRunId: string, userId: string) {
  const { data, error } = await adminClient.from('ymove_audit_runs').select('*').eq('id', auditRunId).eq('created_by', userId).maybeSingle();
  if (error) throw new Error('AUDIT_RUN_READ_FAILED');
  return data as JsonRecord | null;
}

async function updateRunCounts(adminClient: SupabaseClient, auditRunId: string) {
  const [catalogCount, pages, results, summary] = await Promise.all([
    adminClient.from('ymove_audit_catalog_items').select('external_exercise_id', { count: 'exact', head: true }).eq('audit_run_id', auditRunId),
    adminClient.from('ymove_audit_catalog_items').select('page_number').eq('audit_run_id', auditRunId),
    adminClient.from('ymove_audit_results').select('fitcoach_exercise_key', { count: 'exact', head: true }).eq('audit_run_id', auditRunId),
    adminClient.from('ymove_audit_results').select('status').eq('audit_run_id', auditRunId),
  ]);
  const pageCount = new Set((pages.data ?? []).map((row: JsonRecord) => numberValue(row.page_number))).size;
  const rows = (summary.data ?? []) as Array<{ status: AuditStatus }>;
  await adminClient.from('ymove_audit_runs').update({
    total_ymove_fetched: catalogCount.count ?? 0,
    pages_completed: pageCount,
    exercises_processed: results.count ?? 0,
    auto_match_count: rows.filter((row) => row.status === 'AUTO_MATCH').length,
    review_required_count: rows.filter((row) => row.status === 'REVIEW_REQUIRED').length,
    unmatched_count: rows.filter((row) => row.status === 'UNMATCHED').length,
    conflict_count: rows.filter((row) => row.status === 'CONFLICT').length,
    updated_at: new Date().toISOString(),
  }).eq('id', auditRunId);
}

async function actionStart(adminClient: SupabaseClient, userId: string) {
  logPhase('YMOVE_AUDIT_START', { action: 'start' });
  const { data: active } = await adminClient
    .from('ymove_audit_runs')
    .select('*')
    .eq('created_by', userId)
    .in('status', ['created', 'syncing_catalog', 'catalog_ready', 'matching', 'finalizing'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) return json({ ok: true, auditRunId: active.id, status: active.status, totalFitcoach: active.total_fitcoach, startedAt: active.started_at, reused: true });

  const { data: recent } = await adminClient
    .from('ymove_audit_runs')
    .select('id, status, started_at')
    .eq('created_by', userId)
    .neq('status', 'failed')
    .gte('started_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) {
    return errorResponse('AUDIT_RATE_LIMITED', 'Esiste gia un audit recente. Attendi 15 minuti o riprendi quello esistente.', 409, { auditRunId: recent.id });
  }

  const fitExercises = await readFitcoachExercises(adminClient);
  const { data, error } = await adminClient.from('ymove_audit_runs').insert({
    created_by: userId,
    status: 'created',
    total_fitcoach: fitExercises.length,
  }).select('*').single();
  if (error) return errorResponse('AUDIT_START_FAILED', 'Impossibile creare audit YMove.', 500);
  return json({ ok: true, auditRunId: data.id, status: data.status, totalFitcoach: data.total_fitcoach, startedAt: data.started_at, reused: false });
}

async function actionStartRematch(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const sourceAuditRunId = pickString(payload.sourceAuditRunId);
  if (!sourceAuditRunId) return errorResponse('INVALID_PAYLOAD', 'sourceAuditRunId mancante.', 400);
  const source = await getRun(adminClient, sourceAuditRunId, userId);
  if (!source || source.status !== 'completed') return errorResponse('SOURCE_AUDIT_NOT_READY', 'Audit sorgente non completato.', 409);

  const { data: active } = await adminClient
    .from('ymove_audit_runs')
    .select('*')
    .eq('created_by', userId)
    .eq('source_audit_run_id', sourceAuditRunId)
    .eq('run_mode', 'rematch')
    .in('status', ['catalog_ready', 'matching', 'finalizing'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) return json({ ok: true, auditRunId: active.id, status: active.status, totalFitcoach: active.total_fitcoach, startedAt: active.started_at, reused: true });

  const fitExercises = await readFitcoachExercises(adminClient);
  const { data, error } = await adminClient.from('ymove_audit_runs').insert({
    created_by: userId,
    status: 'catalog_ready',
    total_fitcoach: fitExercises.length,
    total_ymove_declared: source.total_ymove_declared,
    total_ymove_fetched: source.total_ymove_fetched,
    total_pages: source.total_pages,
    pages_completed: source.pages_completed,
    source_audit_run_id: sourceAuditRunId,
    algorithm_version: ALGORITHM_VERSION,
    run_mode: 'rematch',
    usage_before: source.usage_before,
    usage_after: source.usage_after,
  }).select('*').single();
  if (error) return errorResponse('REMATCH_START_FAILED', 'Impossibile creare rematch YMove.', 500);
  return json({ ok: true, auditRunId: data.id, status: data.status, totalFitcoach: data.total_fitcoach, startedAt: data.started_at, reused: false });
}

function catalogRunId(run: JsonRecord, auditRunId: string): string {
  return pickString(run.source_audit_run_id) ?? auditRunId;
}

async function actionSyncPage(adminClient: SupabaseClient, userId: string, apiKey: string, payload: JsonRecord) {
  const auditRunId = pickString(payload.auditRunId);
  const page = numberValue(payload.page);
  if (!auditRunId || !page || page < 1) return errorResponse('INVALID_PAYLOAD', 'auditRunId o page non validi.', 400);
  const run = await getRun(adminClient, auditRunId, userId);
  if (!run) return errorResponse('AUDIT_NOT_FOUND', 'Audit non trovato.', 404);
  if (run.status === 'cancelled') return errorResponse('AUDIT_CANCELLED', 'Audit annullato.', 409);

  const { count: existingCount } = await adminClient
    .from('ymove_audit_catalog_items')
    .select('external_exercise_id', { count: 'exact', head: true })
    .eq('audit_run_id', auditRunId)
    .eq('page_number', page);
  if ((existingCount ?? 0) > 0) {
    await updateRunCounts(adminClient, auditRunId);
    return json({ ok: true, auditRunId, status: run.status, page, skipped: true, nextPage: page + 1 });
  }

  await adminClient.from('ymove_audit_runs').update({ status: 'syncing_catalog', updated_at: new Date().toISOString() }).eq('id', auditRunId);
  if (!run.usage_before) {
    const usageBefore = await fetchYmoveJson(`${YMOVE_BASE_URL}/usage`, apiKey, 'usage_before', null);
    if (usageBefore._error) return errorResponse('YMOVE_USAGE_FAILED', 'Impossibile leggere uso YMove.', 502, { error: usageBefore });
    logPhase('YMOVE_USAGE_BEFORE_DONE', { auditRunId });
    await adminClient.from('ymove_audit_runs').update({ usage_before: usageBefore, updated_at: new Date().toISOString() }).eq('id', auditRunId);
  }

  logPhase('YMOVE_PAGE_START', { auditRunId, page, pageSize: PAGE_SIZE });
  const body = await fetchYmoveJson(`${YMOVE_BASE_URL}/exercises?page=${page}&pageSize=${PAGE_SIZE}&includeVideos=false`, apiKey, 'sync_page', page);
  if (body._error) {
    await adminClient.from('ymove_audit_runs').update({
      status: 'failed',
      error_code: String(body.code ?? 'YMOVE_PAGE_FAILED'),
      error_message: 'Errore lettura pagina YMove.',
      failed_page: page,
      updated_at: new Date().toISOString(),
    }).eq('id', auditRunId);
    return errorResponse('YMOVE_PAGE_FAILED', 'Errore lettura pagina YMove.', 502, { page, error: body });
  }
  const data = Array.isArray(body.data) ? body.data as JsonRecord[] : null;
  const pagination = (body.pagination ?? {}) as JsonRecord;
  const totalDeclared = numberValue(pagination.total);
  const totalPages = numberValue(pagination.totalPages);
  if (!data || !totalDeclared || !totalPages) return errorResponse('YMOVE_MALFORMED_RESPONSE', 'Risposta catalogo YMove non valida.', 502, { page });
  const ids = data.map((item) => pickString(item.id)).filter(Boolean);
  if (new Set(ids).size !== ids.length) return errorResponse('YMOVE_DUPLICATE_IDS_IN_PAGE', 'La pagina YMove contiene ID duplicati.', 502, { page });

  const rows = data.map((item) => sanitizeYmoveItem(item, page)).filter((item): item is CatalogItem => item !== null).map((item) => ({ audit_run_id: auditRunId, ...item }));
  const { error } = await adminClient.from('ymove_audit_catalog_items').insert(rows);
  if (error) return errorResponse('CATALOG_PAGE_SAVE_FAILED', 'Impossibile salvare la pagina audit.', 500, { page });
  await adminClient.from('ymove_audit_runs').update({
    total_ymove_declared: totalDeclared,
    total_pages: totalPages,
    updated_at: new Date().toISOString(),
  }).eq('id', auditRunId);
  await updateRunCounts(adminClient, auditRunId);
  logPhase('YMOVE_PAGE_DONE', { auditRunId, page, count: rows.length, totalPages });
  return json({ ok: true, auditRunId, status: 'syncing_catalog', page, count: rows.length, totalPages, nextPage: page < totalPages ? page + 1 : null });
}

async function actionFinalizeCatalog(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const auditRunId = pickString(payload.auditRunId);
  if (!auditRunId) return errorResponse('INVALID_PAYLOAD', 'auditRunId mancante.', 400);
  const run = await getRun(adminClient, auditRunId, userId);
  if (!run) return errorResponse('AUDIT_NOT_FOUND', 'Audit non trovato.', 404);
  const totalPages = numberValue(run.total_pages);
  const totalDeclared = numberValue(run.total_ymove_declared);
  if (!totalPages || !totalDeclared) return errorResponse('CATALOG_NOT_READY', 'Catalogo non ancora inizializzato.', 409);

  const { data: pages } = await adminClient.from('ymove_audit_catalog_items').select('page_number').eq('audit_run_id', auditRunId);
  const presentPages = new Set((pages ?? []).map((row: JsonRecord) => numberValue(row.page_number)).filter(Boolean));
  const missingPages: number[] = [];
  for (let page = 1; page <= totalPages; page += 1) if (!presentPages.has(page)) missingPages.push(page);
  const { count } = await adminClient.from('ymove_audit_catalog_items').select('external_exercise_id', { count: 'exact', head: true }).eq('audit_run_id', auditRunId);
  if (missingPages.length > 0 || count !== totalDeclared) {
    return errorResponse('CATALOG_INCOMPLETE', 'Catalogo YMove incompleto.', 409, { missingPages, totalFetched: count ?? 0, totalDeclared });
  }
  await adminClient.from('ymove_audit_runs').update({ status: 'catalog_ready', updated_at: new Date().toISOString() }).eq('id', auditRunId);
  logPhase('YMOVE_CATALOG_DONE', { auditRunId, totalDeclared, totalPages });
  return json({ ok: true, auditRunId, status: 'catalog_ready', totalFetched: count ?? 0, totalDeclared, totalPages });
}

async function actionMatchBatch(adminClient: SupabaseClient, userId: string, payload: JsonRecord, startedAt: number) {
  const auditRunId = pickString(payload.auditRunId);
  const cursor = Math.max(0, numberValue(payload.cursor) ?? 0);
  const batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, numberValue(payload.batchSize) ?? DEFAULT_BATCH_SIZE));
  if (!auditRunId) return errorResponse('INVALID_PAYLOAD', 'auditRunId mancante.', 400);
  const run = await getRun(adminClient, auditRunId, userId);
  if (!run) return errorResponse('AUDIT_NOT_FOUND', 'Audit non trovato.', 404);
  if (run.status !== 'catalog_ready' && run.status !== 'matching') return errorResponse('CATALOG_NOT_READY', 'Catalogo non pronto per il matching.', 409);

  await adminClient.from('ymove_audit_runs').update({ status: 'matching', updated_at: new Date().toISOString() }).eq('id', auditRunId);
  const fitExercises = await readFitcoachExercises(adminClient);
  await adminClient.from('ymove_audit_runs').update({ total_fitcoach: fitExercises.length, updated_at: new Date().toISOString() }).eq('id', auditRunId);
  const { data: doneRows } = await adminClient.from('ymove_audit_results').select('fitcoach_exercise_key').eq('audit_run_id', auditRunId);
  const done = new Set((doneRows ?? []).map((row: JsonRecord) => pickString(row.fitcoach_exercise_key)).filter(Boolean) as string[]);
  const pending = fitExercises.filter((exercise) => !done.has(exercise.id));
  const batch = pending.slice(cursor, cursor + batchSize);

  const sourceCatalogRunId = catalogRunId(run, auditRunId);
  const { data: catalogData, error: catalogError } = await adminClient
    .from('ymove_audit_catalog_items')
    .select('external_exercise_id,title,normalized_title,primary_muscles,secondary_muscles,equipment,movement_pattern,body_position,difficulty,sanitized_metadata,page_number')
    .eq('audit_run_id', sourceCatalogRunId);
  if (catalogError) return errorResponse('CATALOG_READ_FAILED', 'Impossibile leggere catalogo audit.', 500);
  const catalog = (catalogData ?? []) as CatalogItem[];

  const nameCounts = new Map<string, number>();
  for (const exercise of fitExercises) nameCounts.set(normalizeText(exercise.name), (nameCounts.get(normalizeText(exercise.name)) ?? 0) + 1);
  const output = [];
  logPhase('YMOVE_MATCH_BATCH_START', { auditRunId, cursor, batchSize, pending: pending.length });
  for (const fit of batch) {
    if (Date.now() - startedAt > REQUEST_BUDGET_MS) break;
    const shortlisted = prefilterCandidates(fit, catalog).map((candidate) => scoreCandidate(fit, candidate)).sort((a, b) => b.score - a.score).slice(0, 30);
    output.push({
      audit_run_id: auditRunId,
      ...classify(fit, shortlisted, (nameCounts.get(normalizeText(fit.name)) ?? 0) > 1),
    });
  }
  if (output.length > 0) {
    const { error } = await adminClient.from('ymove_audit_results').upsert(output, { onConflict: 'audit_run_id,fitcoach_exercise_key' });
    if (error) {
      console.error('YMOVE_MATCH_BATCH_DB_ERROR', {
        auditRunId,
        cursor,
        batchSize,
        rowCount: output.length,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return errorResponse('MATCH_BATCH_SAVE_FAILED', 'Impossibile salvare batch matching.', 500, {
        dbCode: error.code ?? null,
        dbMessage: error.message ?? null,
        dbDetails: error.details ?? null,
        dbHint: error.hint ?? null,
        cursor,
        auditRunId,
      });
    }
  }
  await updateRunCounts(adminClient, auditRunId);
  const nextCursor = cursor + output.length;
  const completed = done.size + output.length >= fitExercises.length;
  logPhase('YMOVE_MATCH_BATCH_DONE', { auditRunId, processed: output.length, nextCursor, completed });
  return json({ ok: true, auditRunId, status: 'matching', processed: output.length, nextCursor, completed, totalFitcoach: fitExercises.length });
}

async function actionFinalize(adminClient: SupabaseClient, userId: string, apiKey: string, payload: JsonRecord) {
  const auditRunId = pickString(payload.auditRunId);
  if (!auditRunId) return errorResponse('INVALID_PAYLOAD', 'auditRunId mancante.', 400);
  const run = await getRun(adminClient, auditRunId, userId);
  if (!run) return errorResponse('AUDIT_NOT_FOUND', 'Audit non trovato.', 404);
  if (run.status === 'completed') return json({ ok: true, auditRunId, status: 'completed', reused: true });
  await updateRunCounts(adminClient, auditRunId);
  const refreshed = await getRun(adminClient, auditRunId, userId);
  if ((numberValue(refreshed?.exercises_processed) ?? 0) !== (numberValue(refreshed?.total_fitcoach) ?? -1)) {
    return errorResponse('MATCH_INCOMPLETE', 'Matching non completo.', 409);
  }
  let usageAfter = refreshed?.usage_after ?? null;
  if (!usageAfter && refreshed?.run_mode !== 'rematch') {
    const usage = await fetchYmoveJson(`${YMOVE_BASE_URL}/usage`, apiKey, 'usage_after', null);
    if (usage._error) return errorResponse('YMOVE_USAGE_FAILED', 'Impossibile leggere uso YMove finale.', 502, { error: usage });
    usageAfter = usage;
  }
  await adminClient.from('ymove_audit_runs').update({
    status: 'completed',
    usage_after: usageAfter,
    algorithm_version: ALGORITHM_VERSION,
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', auditRunId);
  logPhase('YMOVE_AUDIT_COMPLETE', { auditRunId });
  return json({ ok: true, auditRunId, status: 'completed' });
}

async function actionStatus(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const auditRunId = pickString(payload.auditRunId);
  let query = adminClient.from('ymove_audit_runs').select('*').eq('created_by', userId).order('started_at', { ascending: false }).limit(1);
  if (auditRunId) query = query.eq('id', auditRunId);
  const { data, error } = await query.maybeSingle();
  if (error) return errorResponse('STATUS_FAILED', 'Impossibile leggere stato audit.', 500);
  return json({ ok: true, run: data ?? null });
}

async function actionResults(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const auditRunId = pickString(payload.auditRunId);
  const status = pickString(payload.status);
  const page = Math.max(1, numberValue(payload.page) ?? 1);
  const pageSize = Math.max(1, Math.min(100, numberValue(payload.pageSize) ?? 50));
  if (!auditRunId || !status) return errorResponse('INVALID_PAYLOAD', 'auditRunId o status mancanti.', 400);
  const run = await getRun(adminClient, auditRunId, userId);
  if (!run) return errorResponse('AUDIT_NOT_FOUND', 'Audit non trovato.', 404);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await adminClient
    .from('ymove_audit_results')
    .select('*', { count: 'exact' })
    .eq('audit_run_id', auditRunId)
    .eq('status', status)
    .order('fitcoach_name')
    .range(from, to);
  if (error) return errorResponse('RESULTS_FAILED', 'Impossibile leggere risultati audit.', 500);
  return json({ ok: true, auditRunId, status, page, pageSize, total: count ?? 0, results: data ?? [] });
}

async function actionCancel(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const auditRunId = pickString(payload.auditRunId);
  if (!auditRunId) return errorResponse('INVALID_PAYLOAD', 'auditRunId mancante.', 400);
  const run = await getRun(adminClient, auditRunId, userId);
  if (!run) return errorResponse('AUDIT_NOT_FOUND', 'Audit non trovato.', 404);
  await adminClient.from('ymove_audit_runs').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', auditRunId);
  return json({ ok: true, auditRunId, status: 'cancelled' });
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 'Metodo non supportato.', 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return errorResponse('SERVER_NOT_CONFIGURED', 'Configurazione server mancante.', 500);

  const auth = await requireSuperadmin(req, supabaseUrl, anonKey, serviceRoleKey);
  if (!auth.ok) return auth.result;

  let payload: JsonRecord;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('INVALID_PAYLOAD', 'Payload non valido.', 400);
  }

  const action = pickString(payload.action);
  const needsYmove = action === 'sync_page';
  const apiKey = Deno.env.get('YMOVE_API_KEY');
  if (needsYmove && !apiKey) return errorResponse('YMOVE_SECRET_NOT_CONFIGURED', 'Secret YMove non configurato lato server.', 503);

  try {
    switch (action) {
      case 'start':
        return await actionStart(auth.adminClient, auth.userId);
      case 'start_rematch':
        return await actionStartRematch(auth.adminClient, auth.userId, payload);
      case 'sync_page':
        return await actionSyncPage(auth.adminClient, auth.userId, apiKey ?? '', payload);
      case 'finalize_catalog':
        return await actionFinalizeCatalog(auth.adminClient, auth.userId, payload);
      case 'match_batch':
        return await actionMatchBatch(auth.adminClient, auth.userId, payload, startedAt);
      case 'finalize':
        return await actionFinalize(auth.adminClient, auth.userId, apiKey ?? '', payload);
      case 'status':
        return await actionStatus(auth.adminClient, auth.userId, payload);
      case 'results':
        return await actionResults(auth.adminClient, auth.userId, payload);
      case 'cancel':
        return await actionCancel(auth.adminClient, auth.userId, payload);
      default:
        return errorResponse('INVALID_ACTION', 'Azione audit non valida.', 400);
    }
  } catch (error) {
    console.error('YMOVE_AUDIT_SAFE_ERROR', { action, message: error instanceof Error ? error.message : String(error) });
    return errorResponse('AUDIT_ERROR', 'Audit YMove non completato.', 500, { action });
  }
});
