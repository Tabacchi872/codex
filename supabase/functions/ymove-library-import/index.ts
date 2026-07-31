import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 20;
const ALGORITHM_VERSION = 'ymove-library-import-2026-07-30-v5-strict-safe-create';
const PILOT_IMPORT_RUN_ID = 'b2a8cb33-061b-489e-bbe5-c2fce38d0ecc';
const PILOT_EXTERNAL_EXERCISE_ID = '1158c681-55e9-4db0-bb73-3dab32d99aa5';
const PILOT_TARGET_KEY = 'legacy:bicipiti-curl-bilanciere';
const SEMANTIC_RESEARCH_VERSION = 'ymove-semantic-research-2026-07-31-v1';
const SEMANTIC_STATUSES = [
  'LINK_EXISTING_VERIFIED',
  'CREATE_NEW_RESEARCHED',
  'REVIEW_POSSIBLE_MATCH',
  'EXCLUDE_EDITORIAL_DUPLICATE',
  'RESEARCH_REQUIRED',
  'CONFLICT',
] as const;

type JsonRecord = Record<string, unknown>;
type SupabaseClient = ReturnType<typeof createClient>;
type Classification = 'LINK_EXISTING' | 'CREATE_NEW' | 'REVIEW_POSSIBLE_DUPLICATE' | 'EXCLUDE_NOT_RELEVANT' | 'CONFLICT';
type SemanticStatus = typeof SEMANTIC_STATUSES[number];

type FitExercise = {
  key: string;
  uuid: string | null;
  legacyKey: string | null;
  name: string;
  nameEn: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
  pattern: string | null;
  active: boolean;
  hasManualVideo: boolean;
};

type YmoveItem = {
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
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status: number, extra: JsonRecord = {}) {
  return json({ ok: false, code, message, ...extra }, status);
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value.filter((item) => item !== undefined) : [];
}

function jsonObject(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

function isSemanticStatus(value: string | null): value is SemanticStatus {
  return Boolean(value && (SEMANTIC_STATUSES as readonly string[]).includes(value));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

const stopWords = new Set(['al', 'alla', 'allo', 'con', 'per', 'da', 'di', 'del', 'della', 'the', 'and', 'of', 'exercise', 'esercizio']);
const exactAliases = new Map<string, string[]>([
  ['lat machine', ['lat pulldown', 'wide grip lat pulldown']],
  ['pulley basso', ['seated cable row', 'cable row']],
  ['rematore bilanciere', ['barbell row', 'bent over barbell row']],
  ['panca piana bilanciere', ['barbell bench press', 'flat barbell bench press']],
  ['panca inclinata manubri', ['incline dumbbell bench press']],
  ['alzate laterali', ['lateral raise']],
  ['pressa 45', ['45 degree leg press', 'leg press']],
  ['leg extension', ['knee extension', 'leg extension']],
  ['leg curl', ['hamstring curl', 'leg curl']],
  ['stacco rumeno', ['romanian deadlift', 'rdl']],
  ['hip thrust', ['hip thrust', 'barbell hip thrust']],
  ['ponte glutei', ['glute bridge']],
  ['pushdown', ['triceps cable pushdown', 'triceps pushdown']],
  ['curl alternato', ['alternating dumbbell curl']],
  ['curl cavo', ['cable curl', 'cable biceps curl']],
  ['curl bilanciere', ['barbell curl']],
  ['crunch', ['abdominal crunch', 'crunch']],
  ['plank', ['front plank', 'plank']],
  ['burpees', ['burpee']],
]);

const humanNames = new Map<string, string>([
  ['bicipiti-curl-alternato', 'Curl alternato con manubri'],
  ['bicipiti-curl-bilanciere', 'Curl con bilanciere'],
  ['bicipiti-curl-cavo', 'Curl al cavo'],
  ['cardio-burpees', 'Burpees'],
  ['core-crunch', 'Crunch'],
  ['dorso-lat-machine-avanti', 'Lat machine avanti'],
  ['dorso-pulley-basso', 'Pulley basso'],
  ['dorso-rematore-bilanciere', 'Rematore con bilanciere'],
  ['gambe-leg-extension', 'Leg extension'],
  ['gambe-leg-curl', 'Leg curl'],
  ['gambe-pressa-45', 'Pressa 45 gradi'],
  ['gambe-stacco-rumeno', 'Stacco rumeno'],
  ['gambe-hip-thrust', 'Hip thrust'],
  ['petto-panca-piana-bilanciere', 'Panca piana con bilanciere'],
  ['petto-panca-inclinata-manubri', 'Panca inclinata con manubri'],
  ['spalle-alzate-laterali', 'Alzate laterali'],
  ['tricipiti-pushdown', 'Pushdown tricipiti'],
]);

const verifiedYmoveToFitcoach: Array<{
  ymove: string[];
  fitKeys: string[];
  reviewWhenTitleIncludes?: string[];
}> = [
  { ymove: ['banded squat'], fitKeys: ['uuid:37b24c41-3f75-4f08-9812-4c10464fc13a', 'legacy:gambe-squat'] },
  { ymove: ['barbell bench press', 'flat barbell bench press'], fitKeys: ['legacy:petto-panca-piana-bilanciere', 'legacy:petto-panca-piana'], reviewWhenTitleIncludes: ['decline', 'incline', 'smith', 'dumbbell', 'close grip', 'one arm'] },
  { ymove: ['incline dumbbell bench press', 'dumbbell bench press incline'], fitKeys: ['legacy:petto-panca-inclinata-manubri'], reviewWhenTitleIncludes: ['barbell', 'decline', 'flat', 'smith', 'one arm'] },
  { ymove: ['lat pulldown', 'wide grip lat pulldown'], fitKeys: ['legacy:dorso-lat-machine-avanti'], reviewWhenTitleIncludes: ['close grip', 'reverse grip', 'neutral grip', 'underhand', 'single arm', 'v grip'] },
  { ymove: ['seated cable row'], fitKeys: ['legacy:dorso-pulley-basso'], reviewWhenTitleIncludes: ['single arm', 'wide grip', 'underhand', 'close neutral', 'v bar'] },
  { ymove: ['barbell row', 'bent over barbell row', 'barbell rows'], fitKeys: ['legacy:dorso-rematore-bilanciere'] },
  { ymove: ['alternating dumbbell curl'], fitKeys: ['legacy:bicipiti-curl-alternato'] },
  { ymove: ['barbell curl'], fitKeys: ['legacy:bicipiti-curl-bilanciere'] },
  { ymove: ['cable curl', 'cable biceps curl'], fitKeys: ['legacy:bicipiti-curl-cavo'] },
  { ymove: ['lateral raise'], fitKeys: ['legacy:spalle-alzate-laterali'], reviewWhenTitleIncludes: ['cable', 'one arm', 'single arm'] },
  { ymove: ['45 degree leg press'], fitKeys: ['legacy:gambe-pressa-45'] },
  { ymove: ['leg extension', 'knee extension'], fitKeys: ['legacy:gambe-leg-extension'] },
  { ymove: ['hamstring curl', 'leg curl'], fitKeys: ['legacy:gambe-leg-curl'], reviewWhenTitleIncludes: ['seated', 'lying', 'standing'] },
  { ymove: ['romanian deadlift', 'barbell romanian deadlift'], fitKeys: ['legacy:gambe-stacco-rumeno'], reviewWhenTitleIncludes: ['dumbbell', 'smith machine', 'single leg'] },
  { ymove: ['hip thrust', 'barbell hip thrust'], fitKeys: ['legacy:gambe-hip-thrust'] },
  { ymove: ['cable triceps pushdown', 'triceps pushdown'], fitKeys: ['legacy:tricipiti-pushdown'] },
  { ymove: ['abdominal crunch', 'crunch'], fitKeys: ['legacy:core-crunch'] },
  { ymove: ['front plank', 'plank'], fitKeys: ['legacy:core-plank'] },
  { ymove: ['burpee'], fitKeys: ['legacy:cardio-burpees'] },
  { ymove: ['calf raise', 'standing calf raise'], fitKeys: ['legacy:polpacci-calf-raise'] },
];

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token && !stopWords.has(token))
    .map((token) => (token.endsWith('s') && token.length > 4 ? token.slice(0, -1) : token))
    .join(' ');
}

function aliasesFor(value: string): string[] {
  const base = normalize(value);
  const out = new Set<string>([base]);
  for (const [source, aliases] of exactAliases) {
    if (base.includes(normalize(source))) aliases.forEach((alias) => out.add(normalize(alias)));
    aliases.forEach((alias) => {
      if (base.includes(normalize(alias))) out.add(normalize(source));
    });
  }
  return [...out].filter(Boolean);
}

function hasDirectAliasMatch(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  return right.some((value) => leftSet.has(value));
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(' ').filter(Boolean));
}

function overlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

function humanNameFromKey(key: string): string {
  const known = humanNames.get(key);
  if (known) return known;
  const groups = new Set(['addome', 'bicipiti', 'cardio', 'core', 'dorso', 'gambe', 'glutei', 'petto', 'polpacci', 'spalle', 'tricipiti']);
  const parts = key.split('-').filter(Boolean);
  const useful = groups.has(parts[0] ?? '') ? parts.slice(1) : parts;
  return useful.map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(' ');
}

function translateYmoveTitle(title: string): { name: string; status: 'verified' | 'generated' | 'review_required' } {
  const normalized = normalize(title);
  const direct = new Map<string, string>([
    ['barbell bench press', 'Panca piana con bilanciere'],
    ['incline dumbbell bench press', 'Panca inclinata con manubri'],
    ['seated cable row', 'Rematore seduto al cavo'],
    ['romanian deadlift', 'Stacco rumeno'],
    ['one arm cable lateral raise', 'Alzata laterale al cavo a un braccio'],
    ['alternating dumbbell curl', 'Curl alternato con manubri'],
    ['burpee', 'Burpees'],
    ['abdominal crunch', 'Crunch addominale'],
    ['front plank', 'Plank frontale'],
    ['leg press', 'Pressa'],
  ]);
  const exact = direct.get(normalized);
  if (exact) return { name: exact, status: 'verified' };
  let generated = title
    .replace(/\bBarbell\b/gi, 'con bilanciere')
    .replace(/\bDumbbell\b/gi, 'con manubri')
    .replace(/\bCable\b/gi, 'al cavo')
    .replace(/\bMachine\b/gi, 'alla macchina')
    .replace(/\bIncline\b/gi, 'inclinato')
    .replace(/\bDecline\b/gi, 'declinato')
    .replace(/\bSeated\b/gi, 'seduto')
    .replace(/\bStanding\b/gi, 'in piedi')
    .replace(/\bOne Arm\b/gi, 'a un braccio')
    .replace(/\bBench Press\b/gi, 'Panca press')
    .replace(/\bRow\b/gi, 'Rematore')
    .replace(/\bCurl\b/gi, 'Curl')
    .replace(/\bRaise\b/gi, 'Alzata')
    .trim();
  if (!generated || generated === title) return { name: title, status: 'review_required' };
  generated = `${generated[0].toUpperCase()}${generated.slice(1)}`;
  return { name: generated, status: 'generated' };
}

function findFitExercise(fitExercises: FitExercise[], keys: string[]): FitExercise | null {
  for (const key of keys) {
    const byKey = fitExercises.find((fit) => fit.key === key);
    if (byKey) return byKey;
  }
  return null;
}

function verifiedMatch(ymove: YmoveItem, fitExercises: FitExercise[]) {
  const title = normalize(ymove.title);
  for (const rule of verifiedYmoveToFitcoach) {
    const exactAlias = rule.ymove.find((alias) => title === normalize(alias));
    const containedAlias = exactAlias ? null : rule.ymove.find((alias) => title.includes(normalize(alias)));
    const matchedAlias = exactAlias ?? containedAlias;
    if (!matchedAlias) continue;
    const fit = findFitExercise(fitExercises, rule.fitKeys);
    if (!fit) continue;
    const review = Boolean(containedAlias) || (rule.reviewWhenTitleIncludes ?? []).some((marker) => title.includes(normalize(marker)));
    const scored = scoreAgainst(ymove, fit);
    const contradictions = scored.contradictions;
    return {
      fit,
      matchedAlias,
      review,
      score: review ? Math.max(scored.score, 64) : Math.max(scored.score, 92),
      reasons: [`alias verificato: ${matchedAlias}`, ...scored.reasons.filter((reason) => !reason.startsWith('nome/alias'))],
      contradictions,
    };
  }
  return null;
}

function technicalVariantRequiresReview(ymove: YmoveItem, fit: FitExercise | null): boolean {
  if (!fit) return false;
  const title = normalize(ymove.title);
  const fitName = normalize(`${fit.name} ${fit.nameEn ?? ''} ${fit.legacyKey ?? ''}`);
  const markers = [
    'calf raise',
    'close grip',
    'wide grip',
    'medium stance',
    'close stance',
    'wide stance',
    'reverse grip',
    'neutral grip',
    'underhand',
    'single arm',
    'one arm',
    'single leg',
    'lying',
    'seated',
    'standing',
    'decline',
    'incline',
    'smith',
  ];
  if (markers.some((marker) => title.includes(normalize(marker)) && !fitName.includes(normalize(marker)))) return true;
  if (title.includes('upright row') && fit.pattern === 'horizontal_pull') return true;
  return false;
}

function contradiction(fit: FitExercise, ymove: YmoveItem): string[] {
  const text = normalize(`${fit.name} ${fit.nameEn ?? ''} ${ymove.title}`);
  const problems: string[] = [];
  const fitText = normalize(`${fit.name} ${fit.nameEn ?? ''}`);
  const yText = normalize(ymove.title);
  const pairs: Array<[string, string, string]> = [
    ['barbell', 'dumbbell', 'bilanciere contro manubri'],
    ['cable', 'machine', 'cavo contro macchina'],
    ['flat', 'incline', 'panca piana contro inclinata'],
    ['incline', 'decline', 'panca inclinata contro declinata'],
    ['romanian', 'sumo', 'stacco rumeno contro sumo'],
    ['romanian', 'conventional', 'stacco rumeno contro classico'],
    ['leg press', 'hack squat', 'pressa contro hack squat'],
  ];
  for (const [left, right, label] of pairs) {
    const leftFit = fitText.includes(left) || fitText.includes(normalize(left));
    const rightFit = fitText.includes(right) || fitText.includes(normalize(right));
    const leftY = yText.includes(left) || yText.includes(normalize(left));
    const rightY = yText.includes(right) || yText.includes(normalize(right));
    if ((leftFit && rightY) || (rightFit && leftY)) problems.push(label);
  }
  if (text.includes('upright row') && fit.pattern === 'horizontal_pull') problems.push('row verticale contro row orizzontale');
  return [...new Set(problems)];
}

function scoreAgainst(ymove: YmoveItem, fit: FitExercise) {
  const fitAliases = aliasesFor(`${fit.name} ${fit.nameEn ?? ''} ${fit.legacyKey ?? ''}`);
  const yAliases = aliasesFor(`${ymove.title} ${ymove.normalized_title}`);
  const directAliasMatch = hasDirectAliasMatch(fitAliases, yAliases);
  let nameScore = 0;
  for (const fitAlias of fitAliases) {
    for (const yAlias of yAliases) nameScore = Math.max(nameScore, Math.round(overlap(tokens(fitAlias), tokens(yAlias)) * 44));
  }
  const fitMuscles = new Set([...fit.primaryMuscles, ...fit.secondaryMuscles].map(normalize));
  const yMuscles = new Set([...ymove.primary_muscles, ...ymove.secondary_muscles].map(normalize));
  const muscleScore = overlap(fitMuscles, yMuscles) > 0 ? 18 : 0;
  const fitEquipment = normalize(fit.equipment ?? '');
  const yEquipment = new Set(ymove.equipment.map(normalize));
  const equipmentScore = fitEquipment && yEquipment.has(fitEquipment) ? 16 : 0;
  const patternScore = fit.pattern && ymove.movement_pattern && fit.pattern === ymove.movement_pattern ? 14 : 0;
  const contradictions = contradiction(fit, ymove);
  const score = Math.max(0, Math.min(100, nameScore + muscleScore + equipmentScore + patternScore - contradictions.length * 20));
  return {
    score,
    directAliasMatch,
    metadataTriplet: Boolean(muscleScore && equipmentScore && patternScore),
    reasons: [
      directAliasMatch ? 'alias/nome diretto' : nameScore ? `nome/alias ${nameScore}` : null,
      muscleScore ? 'muscolo coerente' : null,
      equipmentScore ? 'attrezzatura coerente' : null,
      patternScore ? `pattern coerente: ${fit.pattern}` : null,
    ].filter(Boolean) as string[],
    contradictions,
  };
}

async function requireSuperadmin(req: Request, supabaseUrl: string, anonKey: string, serviceRoleKey: string) {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { ok: false as const, result: errorResponse('NOT_AUTHENTICATED', 'Accesso richiesto.', 401) };
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return { ok: false as const, result: errorResponse('NOT_AUTHENTICATED', 'Sessione non valida.', 401) };
  const { data: profile } = await adminClient.from('profiles').select('id, role').eq('id', data.user.id).maybeSingle();
  if (profile?.role !== 'superadmin') return { ok: false as const, result: errorResponse('FORBIDDEN', 'Solo Superadmin.', 403) };
  return { ok: true as const, adminClient, userId: data.user.id };
}

async function readFitcoachInventory(adminClient: SupabaseClient): Promise<FitExercise[]> {
  const [exercisesRes, metadataRes, videosRes] = await Promise.all([
    adminClient.from('exercises').select('*'),
    adminClient.from('exercise_movement_metadata').select('*'),
    adminClient.from('exercise_videos').select('exercise_id'),
  ]);
  if (exercisesRes.error || metadataRes.error || videosRes.error) throw new Error('FITCOACH_INVENTORY_FAILED');

  const videoKeys = new Set((videosRes.data ?? []).map((row: JsonRecord) => pickString(row.exercise_id)).filter(Boolean) as string[]);
  const output = new Map<string, FitExercise>();
  for (const row of exercisesRes.data ?? []) {
    const r = row as JsonRecord;
    const id = pickString(r.id);
    if (!id || !isUuid(id)) continue;
    output.set(`uuid:${id}`, {
      key: `uuid:${id}`,
      uuid: id,
      legacyKey: pickString(r.slug),
      name: pickString(r.name) ?? 'Esercizio',
      nameEn: pickString(r.name_en),
      primaryMuscles: stringArray(r.primary_muscles).length ? stringArray(r.primary_muscles) : [pickString(r.primary_muscle_group) ?? pickString(r.muscle_group)].filter(Boolean) as string[],
      secondaryMuscles: stringArray(r.secondary_muscles).length ? stringArray(r.secondary_muscles) : stringArray(r.secondary_muscle_groups),
      equipment: pickString(r.equipment),
      pattern: pickString(r.exercise_type),
      active: r.active !== false,
      hasManualVideo: videoKeys.has(id) || Boolean(pickString(r.video_url)),
    });
  }
  for (const row of metadataRes.data ?? []) {
    const r = row as JsonRecord;
    const legacy = pickString(r.exercise_id);
    if (!legacy) continue;
    output.set(`legacy:${legacy}`, {
      key: `legacy:${legacy}`,
      uuid: null,
      legacyKey: legacy,
      name: humanNameFromKey(legacy),
      nameEn: null,
      primaryMuscles: [pickString(r.primary_muscle_group)].filter(Boolean) as string[],
      secondaryMuscles: stringArray(r.secondary_muscle_groups),
      equipment: pickString(r.equipment_tag),
      pattern: pickString(r.movement_pattern),
      active: r.is_active !== false,
      hasManualVideo: videoKeys.has(legacy),
    });
  }
  return [...output.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function ymoveDuplicateSignature(ymove: YmoveItem): string {
  return [
    normalize(ymove.title),
    ymove.primary_muscles.map(normalize).sort().join('|'),
    ymove.equipment.map(normalize).sort().join('|'),
    normalize(ymove.movement_pattern),
    normalize(ymove.body_position),
  ].join('::');
}

function classifyYmove(ymove: YmoveItem, fitExercises: FitExercise[], duplicateYmove: boolean) {
  const verified = verifiedMatch(ymove, fitExercises);
  const ranked = fitExercises.map((fit) => ({ fit, ...scoreAgainst(ymove, fit) })).sort((a, b) => b.score - a.score).slice(0, 6);
  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const scoreGap = best ? best.score - (second?.score ?? 0) : 0;
  const translation = translateYmoveTitle(ymove.title);
  const bestNeedsReview = technicalVariantRequiresReview(ymove, best?.fit ?? null);
  const hasDeterminedEquipment = ymove.equipment.length > 0 || normalize(ymove.title).includes('bodyweight') || ymove.equipment.includes('bodyweight');
  let classification: Classification = 'CREATE_NEW';
  let matchSource = 'inverse_score';
  if (!ymove.title || !ymove.external_exercise_id) classification = 'EXCLUDE_NOT_RELEVANT';
  else if (verified && verified.contradictions.length > 0) {
    classification = 'CONFLICT';
    matchSource = 'verified_alias_conflict';
  } else if (verified && (verified.review || technicalVariantRequiresReview(ymove, verified.fit))) {
    classification = 'REVIEW_POSSIBLE_DUPLICATE';
    matchSource = 'verified_alias_variant';
  } else if (verified) {
    classification = 'LINK_EXISTING';
    matchSource = 'verified_alias';
  } else if (best && best.contradictions.length > 0 && best.score >= 55) classification = 'CONFLICT';
  else if (
    best &&
    best.contradictions.length === 0 &&
    (
      (best.score >= 86 && scoreGap >= 8) ||
      (best.directAliasMatch && best.score >= 76 && scoreGap >= 8 && !bestNeedsReview) ||
      (best.directAliasMatch && best.metadataTriplet && best.score >= 70 && !bestNeedsReview)
    )
  ) {
    classification = 'LINK_EXISTING';
    matchSource = best.directAliasMatch ? 'direct_alias' : 'strong_inverse_score';
  } else if (best && (best.score >= 48 || best.directAliasMatch || best.metadataTriplet || bestNeedsReview)) classification = 'REVIEW_POSSIBLE_DUPLICATE';
  else if (translation.status === 'review_required' && best && best.score >= 38) classification = 'REVIEW_POSSIBLE_DUPLICATE';

  return {
    external_exercise_id: ymove.external_exercise_id,
    ymove_title: ymove.title,
    proposed_italian_name: translation.name,
    classification,
    existing_exercise_id: verified?.fit.uuid ?? best?.fit.uuid ?? null,
    existing_exercise_key: verified?.fit.key ?? best?.fit.key ?? null,
    score: verified?.score ?? best?.score ?? 0,
    score_gap: verified ? Math.max(scoreGap, 8) : best ? scoreGap : null,
    reasons: verified?.reasons ?? best?.reasons ?? [],
    contradictions: verified?.contradictions ?? best?.contradictions ?? [],
    alternatives: ranked.slice(1, 4).map((item) => ({
      exerciseKey: item.fit.key,
      name: item.fit.name,
      score: item.score,
      contradictions: item.contradictions,
    })),
    translation_status: translation.status,
    algorithm_version: ALGORITHM_VERSION,
    match_source: matchSource,
    direct_alias_match: Boolean(verified || best?.directAliasMatch),
    safe_create: Boolean(
      classification === 'CREATE_NEW' &&
      translation.status !== 'review_required' &&
      !best?.directAliasMatch &&
      !best?.metadataTriplet &&
      !technicalVariantRequiresReview(ymove, best?.fit ?? null) &&
      (best?.score ?? 0) < 38 &&
      ymove.title &&
      ymove.external_exercise_id &&
      ymove.primary_muscles.length > 0 &&
      hasDeterminedEquipment &&
      !duplicateYmove
    ),
    metadata_match: {
      bestFitKey: verified?.fit.key ?? best?.fit.key ?? null,
      bestFitName: verified?.fit.name ?? best?.fit.name ?? null,
      metadataTriplet: Boolean(best?.metadataTriplet),
      duplicateYmove,
      verifiedAlias: verified?.matchedAlias ?? null,
      verifiedVariant: Boolean(verified?.review),
      technicalVariantReview: Boolean(verified ? technicalVariantRequiresReview(ymove, verified.fit) : bestNeedsReview),
      scoreGap: verified ? Math.max(scoreGap, 8) : scoreGap,
      secondScore: second?.score ?? null,
    },
    proposed_payload: {
      name: translation.name,
      name_en: ymove.title,
      source: 'ymove',
      ymove_exercise_id: ymove.external_exercise_id,
      ymove_slug: pickString(ymove.sanitized_metadata?.slug),
      active: classification === 'CREATE_NEW',
      library_status: classification === 'CREATE_NEW' ? 'active' : classification === 'REVIEW_POSSIBLE_DUPLICATE' ? 'pending_review' : 'hidden',
      auto_program_eligible: false,
      primary_muscles: ymove.primary_muscles,
      secondary_muscles: ymove.secondary_muscles,
      equipment: ymove.equipment,
      difficulty: ymove.difficulty,
      movement_pattern: ymove.movement_pattern,
      body_position: ymove.body_position,
      provider: 'ymove',
    },
  };
}

async function updateRunCounts(adminClient: SupabaseClient, importRunId: string) {
  const { data } = await adminClient.from('ymove_library_import_candidates').select('classification').eq('import_run_id', importRunId);
  const rows = (data ?? []) as Array<{ classification: Classification }>;
  await adminClient.from('ymove_library_import_runs').update({
    processed_count: rows.length,
    link_existing_count: rows.filter((row) => row.classification === 'LINK_EXISTING').length,
    create_new_count: rows.filter((row) => row.classification === 'CREATE_NEW').length,
    review_count: rows.filter((row) => row.classification === 'REVIEW_POSSIBLE_DUPLICATE').length,
    excluded_count: rows.filter((row) => row.classification === 'EXCLUDE_NOT_RELEVANT').length,
    conflict_count: rows.filter((row) => row.classification === 'CONFLICT').length,
    updated_at: new Date().toISOString(),
  }).eq('id', importRunId);
}

async function getRun(adminClient: SupabaseClient, importRunId: string, userId: string) {
  const { data, error } = await adminClient.from('ymove_library_import_runs').select('*').eq('id', importRunId).eq('created_by', userId).maybeSingle();
  if (error) throw new Error('IMPORT_RUN_READ_FAILED');
  return data as JsonRecord | null;
}

async function actionStart(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const sourceAuditRunId = pickString(payload.sourceAuditRunId);
  if (!sourceAuditRunId) return errorResponse('INVALID_PAYLOAD', 'sourceAuditRunId mancante.', 400);
  const { data: source } = await adminClient.from('ymove_audit_runs').select('*').eq('id', sourceAuditRunId).eq('status', 'completed').maybeSingle();
  if (!source) return errorResponse('SOURCE_AUDIT_NOT_READY', 'Audit sorgente non completato.', 409);

  const { data: active } = await adminClient
    .from('ymove_library_import_runs')
    .select('*')
    .eq('created_by', userId)
    .eq('source_audit_run_id', sourceAuditRunId)
    .in('status', ['created', 'analyzing', 'review_ready'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) return json({ ok: true, importRunId: active.id, run: active, reused: true });

  const { count } = await adminClient.from('ymove_audit_catalog_items').select('external_exercise_id', { count: 'exact', head: true }).eq('audit_run_id', sourceAuditRunId);
  const { data, error } = await adminClient.from('ymove_library_import_runs').insert({
    source_audit_run_id: sourceAuditRunId,
    created_by: userId,
    status: 'created',
    total_catalog: count ?? 0,
  }).select('*').single();
  if (error) return errorResponse('IMPORT_START_FAILED', 'Impossibile creare import run.', 500);
  return json({ ok: true, importRunId: data.id, run: data, reused: false });
}

async function actionStartReclassification(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const sourceImportRunId = pickString(payload.sourceImportRunId);
  if (!sourceImportRunId) return errorResponse('INVALID_PAYLOAD', 'sourceImportRunId mancante.', 400);
  const source = await getRun(adminClient, sourceImportRunId, userId);
  if (!source || source.status !== 'review_ready') return errorResponse('SOURCE_IMPORT_NOT_READY', 'Import sorgente non completato.', 409);

  const { data: active } = await adminClient
    .from('ymove_library_import_runs')
    .select('*')
    .eq('created_by', userId)
    .eq('source_import_run_id', sourceImportRunId)
    .eq('run_mode', 'reclassification')
    .eq('algorithm_version', ALGORITHM_VERSION)
    .in('status', ['created', 'analyzing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) return json({ ok: true, importRunId: active.id, run: active, reused: true });

  const { data, error } = await adminClient.from('ymove_library_import_runs').insert({
    source_audit_run_id: source.source_audit_run_id,
    source_import_run_id: sourceImportRunId,
    created_by: userId,
    status: 'created',
    total_catalog: source.total_catalog,
    algorithm_version: ALGORITHM_VERSION,
    run_mode: 'reclassification',
  }).select('*').single();
  if (error) return errorResponse('RECLASSIFICATION_START_FAILED', 'Impossibile creare riclassificazione.', 500);
  return json({ ok: true, importRunId: data.id, run: data, reused: false });
}

async function actionAnalyzeBatch(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const importRunId = pickString(payload.importRunId);
  const cursor = Math.max(0, numberValue(payload.cursor) ?? 0);
  const batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, numberValue(payload.batchSize) ?? DEFAULT_BATCH_SIZE));
  if (!importRunId) return errorResponse('INVALID_PAYLOAD', 'importRunId mancante.', 400);
  const run = await getRun(adminClient, importRunId, userId);
  if (!run) return errorResponse('IMPORT_RUN_NOT_FOUND', 'Import run non trovato.', 404);
  if (run.status === 'cancelled' || run.status === 'completed') return errorResponse('IMPORT_NOT_EDITABLE', 'Import non modificabile.', 409);
  const sourceAuditRunId = pickString(run.source_audit_run_id);
  if (!sourceAuditRunId) return errorResponse('SOURCE_AUDIT_NOT_READY', 'Audit sorgente mancante.', 409);

  await adminClient.from('ymove_library_import_runs').update({ status: 'analyzing', updated_at: new Date().toISOString() }).eq('id', importRunId);
  const { data: doneRows } = await adminClient.from('ymove_library_import_candidates').select('external_exercise_id').eq('import_run_id', importRunId);
  const done = new Set((doneRows ?? []).map((row: JsonRecord) => pickString(row.external_exercise_id)).filter(Boolean) as string[]);
  const { data: catalogRows, error: catalogError } = await adminClient
    .from('ymove_audit_catalog_items')
    .select('external_exercise_id,title,normalized_title,primary_muscles,secondary_muscles,equipment,movement_pattern,body_position,difficulty,sanitized_metadata')
    .eq('audit_run_id', sourceAuditRunId)
    .order('external_exercise_id');
  if (catalogError) return errorResponse('CATALOG_READ_FAILED', 'Catalogo audit non leggibile.', 500);
  const catalog = ((catalogRows ?? []) as YmoveItem[]).filter((item) => !done.has(item.external_exercise_id));
  const duplicateSignatures = new Set<string>();
  const signatureCounts = new Map<string, number>();
  for (const item of (catalogRows ?? []) as YmoveItem[]) {
    const signature = ymoveDuplicateSignature(item);
    if (!signature.trim()) continue;
    const count = (signatureCounts.get(signature) ?? 0) + 1;
    signatureCounts.set(signature, count);
    if (count > 1) duplicateSignatures.add(signature);
  }
  const fitExercises = await readFitcoachInventory(adminClient);
  const batch = catalog.slice(cursor, cursor + batchSize);
  const rows = batch.map((item) => ({
    import_run_id: importRunId,
    ...classifyYmove(item, fitExercises, duplicateSignatures.has(ymoveDuplicateSignature(item))),
  }));
  if (rows.length > 0) {
    const { error } = await adminClient.from('ymove_library_import_candidates').upsert(rows, { onConflict: 'import_run_id,external_exercise_id' });
    if (error) return errorResponse('IMPORT_BATCH_SAVE_FAILED', 'Impossibile salvare batch import.', 500, {
      dbCode: error.code ?? null,
      dbMessage: error.message ?? null,
      dbDetails: error.details ?? null,
      dbHint: error.hint ?? null,
    });
  }
  await updateRunCounts(adminClient, importRunId);
  const processed = done.size + rows.length;
  const completed = processed >= (numberValue(run.total_catalog) ?? 0);
  if (completed) await adminClient.from('ymove_library_import_runs').update({ status: 'review_ready', updated_at: new Date().toISOString() }).eq('id', importRunId);
  return json({ ok: true, importRunId, processed: rows.length, nextCursor: cursor + rows.length, completed });
}

async function actionReclassifyBatch(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  return actionAnalyzeBatch(adminClient, userId, payload);
}

async function actionStatus(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const importRunId = pickString(payload.importRunId);
  let query = adminClient.from('ymove_library_import_runs').select('*').eq('created_by', userId).order('created_at', { ascending: false }).limit(1);
  if (importRunId) query = query.eq('id', importRunId);
  const { data, error } = await query.maybeSingle();
  if (error) return errorResponse('STATUS_FAILED', 'Impossibile leggere stato import.', 500);
  return json({ ok: true, run: data ?? null });
}

async function actionResults(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const importRunId = pickString(payload.importRunId);
  const classification = pickString(payload.classification);
  const page = Math.max(1, numberValue(payload.page) ?? 1);
  const pageSize = Math.max(1, Math.min(100, numberValue(payload.pageSize) ?? 50));
  if (!importRunId || !classification) return errorResponse('INVALID_PAYLOAD', 'importRunId o classification mancanti.', 400);
  const run = await getRun(adminClient, importRunId, userId);
  if (!run) return errorResponse('IMPORT_RUN_NOT_FOUND', 'Import run non trovato.', 404);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await adminClient
    .from('ymove_library_import_candidates')
    .select('*', { count: 'exact' })
    .eq('import_run_id', importRunId)
    .eq('classification', classification)
    .order('ymove_title')
    .range(from, to);
  if (error) return errorResponse('RESULTS_FAILED', 'Impossibile leggere risultati import.', 500);
  return json({ ok: true, importRunId, classification, results: data ?? [], total: count ?? 0 });
}

async function actionApproveCandidate(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const importRunId = pickString(payload.importRunId);
  const externalExerciseId = pickString(payload.externalExerciseId);
  const decision = pickString(payload.decision);
  const approvedExistingExerciseKey = pickString(payload.approvedExistingExerciseKey);
  const reviewNote = pickString(payload.reviewNote);
  if (!importRunId || !externalExerciseId || !decision) return errorResponse('INVALID_PAYLOAD', 'Dati approvazione mancanti.', 400);
  const run = await getRun(adminClient, importRunId, userId);
  if (!run) return errorResponse('IMPORT_RUN_NOT_FOUND', 'Import run non trovato.', 404);
  const allowed = new Set(['approved_new', 'approved_link', 'excluded', 'deferred', 'rejected']);
  if (!allowed.has(decision)) return errorResponse('INVALID_DECISION', 'Decisione non valida.', 400);

  const { data: candidate, error: candidateError } = await adminClient
    .from('ymove_library_import_candidates')
    .select('external_exercise_id,classification,safe_create,approved_italian_name,approved_italian_name_confirmed_by,approved_italian_name_confirmed_at,existing_exercise_key,approved_existing_exercise_key,contradictions')
    .eq('import_run_id', importRunId)
    .eq('external_exercise_id', externalExerciseId)
    .maybeSingle();
  if (candidateError) return errorResponse('CANDIDATE_READ_FAILED', 'Candidato non letto.', 500);
  if (!candidate) return errorResponse('CANDIDATE_NOT_FOUND', 'Candidato non trovato.', 404);

  const candidateRow = candidate as JsonRecord;
  const savedItalianName = pickString(candidateRow.approved_italian_name);
  const confirmedBy = pickString(candidateRow.approved_italian_name_confirmed_by);
  const confirmedAt = pickString(candidateRow.approved_italian_name_confirmed_at);
  const linkKey = approvedExistingExerciseKey ?? pickString(candidateRow.approved_existing_exercise_key) ?? pickString(candidateRow.existing_exercise_key);
  if (decision === 'approved_new') {
    if (candidateRow.classification !== 'CREATE_NEW' || candidateRow.safe_create !== true) {
      return errorResponse('CANDIDATE_NOT_SAFE_CREATE', 'Solo i nuovi esercizi sicuri possono essere approvati come nuovi.', 409);
    }
    if (!savedItalianName || !confirmedBy || !confirmedAt) {
      return errorResponse('APPROVED_NAME_REQUIRED', 'Salva un nome italiano confermato prima di approvare.', 409);
    }
  }
  if (decision === 'approved_link') {
    if (candidateRow.classification !== 'LINK_EXISTING') {
      return errorResponse('LINK_CANDIDATE_REQUIRED', 'Solo un collegamento esistente puo essere approvato come link.', 409);
    }
    if (!linkKey) return errorResponse('LINK_TARGET_REQUIRED', 'Seleziona un esercizio FitCoach da collegare.', 409);
    if (stringArray(candidateRow.contradictions).length > 0) {
      return errorResponse('LINK_HAS_CONTRADICTIONS', 'Il collegamento contiene contraddizioni e non puo essere approvato.', 409);
    }
  }

  const { data, error } = await adminClient.from('ymove_library_import_candidates').update({
    decision,
    approved_italian_name: savedItalianName,
    approved_existing_exercise_key: decision === 'approved_link' ? linkKey : null,
    review_note: reviewNote,
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
    .eq('import_run_id', importRunId)
    .eq('external_exercise_id', externalExerciseId)
    .select('external_exercise_id,decision,approved_italian_name,approved_existing_exercise_key,reviewed_at')
    .maybeSingle();
  if (error) return errorResponse('APPROVAL_FAILED', 'Decisione non salvata.', 500);
  if (!data) return errorResponse('CANDIDATE_NOT_FOUND', 'Candidato non trovato.', 404);
  return json({ ok: true, candidate: data });
}

async function actionUpdateCandidateName(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const importRunId = pickString(payload.importRunId);
  const externalExerciseId = pickString(payload.externalExerciseId);
  const approvedItalianName = pickString(payload.approvedItalianName);
  if (!importRunId || !externalExerciseId || !approvedItalianName) return errorResponse('INVALID_PAYLOAD', 'Nome italiano mancante.', 400);
  if (approvedItalianName.length < 3) return errorResponse('INVALID_NAME', 'Il nome italiano deve contenere almeno 3 caratteri.', 400);
  if (approvedItalianName.length > 160) return errorResponse('INVALID_NAME', 'Il nome italiano e troppo lungo.', 400);
  const run = await getRun(adminClient, importRunId, userId);
  if (!run) return errorResponse('IMPORT_RUN_NOT_FOUND', 'Import run non trovato.', 404);
  const { data: candidate, error: candidateError } = await adminClient
    .from('ymove_library_import_candidates')
    .select('classification,decision')
    .eq('import_run_id', importRunId)
    .eq('external_exercise_id', externalExerciseId)
    .maybeSingle();
  if (candidateError) return errorResponse('CANDIDATE_READ_FAILED', 'Candidato non letto.', 500);
  if (!candidate) return errorResponse('CANDIDATE_NOT_FOUND', 'Candidato non trovato.', 404);
  const currentDecision = pickString((candidate as JsonRecord).decision);
  const nextDecision = (candidate as JsonRecord).classification === 'CREATE_NEW' ? null : currentDecision;
  const { data, error } = await adminClient
    .from('ymove_library_import_candidates')
    .update({
      approved_italian_name: approvedItalianName,
      approved_italian_name_confirmed_by: userId,
      approved_italian_name_confirmed_at: new Date().toISOString(),
      decision: nextDecision,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('import_run_id', importRunId)
    .eq('external_exercise_id', externalExerciseId)
    .select('external_exercise_id,approved_italian_name,approved_italian_name_confirmed_at,reviewed_at,decision')
    .maybeSingle();
  if (error) return errorResponse('CANDIDATE_NAME_SAVE_FAILED', 'Nome italiano non salvato.', 500, {
    dbCode: error.code ?? null,
    dbMessage: error.message ?? null,
    dbDetails: error.details ?? null,
    dbHint: error.hint ?? null,
  });
  if (!data) return errorResponse('CANDIDATE_NOT_FOUND', 'Candidato non trovato.', 404);
  return json({
    ok: true,
    success: true,
    candidate: {
      externalExerciseId: data.external_exercise_id,
      approvedItalianName: data.approved_italian_name,
      approvedItalianNameConfirmedAt: data.approved_italian_name_confirmed_at,
      reviewedAt: data.reviewed_at,
      decision: data.decision,
    },
  });
}

async function actionFinalizeReview(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const importRunId = pickString(payload.importRunId);
  if (!importRunId) return errorResponse('INVALID_PAYLOAD', 'importRunId mancante.', 400);
  const run = await getRun(adminClient, importRunId, userId);
  if (!run) return errorResponse('IMPORT_RUN_NOT_FOUND', 'Import run non trovato.', 404);
  await updateRunCounts(adminClient, importRunId);
  const refreshed = await getRun(adminClient, importRunId, userId);
  if ((numberValue(refreshed?.processed_count) ?? 0) !== (numberValue(refreshed?.total_catalog) ?? -1)) {
    return errorResponse('IMPORT_INCOMPLETE', 'Non tutti gli esercizi YMove sono stati classificati.', 409);
  }
  await adminClient.from('ymove_library_import_runs').update({ status: 'review_ready', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', importRunId);
  return json({ ok: true, importRunId, status: 'review_ready' });
}

async function actionImportPreflight(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const importRunId = pickString(payload.importRunId);
  if (!importRunId) return errorResponse('INVALID_PAYLOAD', 'importRunId mancante.', 400);
  const run = await getRun(adminClient, importRunId, userId);
  if (!run) return errorResponse('IMPORT_RUN_NOT_FOUND', 'Import run non trovato.', 404);
  const preflight = await getImportPreflight(adminClient, importRunId);
  if (!preflight.ok) return errorResponse('IMPORT_PREVIEW_FAILED', 'Impossibile calcolare anteprima import.', 500, preflight.error ?? {});
  return json({ ok: true, importRunId, ...preflight.summary });
}

function validateSemanticItem(item: JsonRecord) {
  const externalExerciseId = pickString(item.externalExerciseId);
  const researchedItalianName = pickString(item.researchedItalianName);
  const researchStatus = pickString(item.researchStatus);
  const semanticReviewStatus = pickString(item.semanticReviewStatus) ?? researchStatus;
  const matchScore = numberValue(item.matchScore);
  const comparedExistingExerciseKey = pickString(item.comparedExistingExerciseKey);
  const primaryDuplicateExternalId = pickString(item.primaryDuplicateExternalId);
  const contradictionFlags = jsonArray(item.contradictionFlags);
  const blockingContradictions = contradictionFlags.length;
  if (!externalExerciseId) return { ok: false as const, code: 'MISSING_EXTERNAL_ID' };
  if (!researchedItalianName || researchedItalianName.length < 3) return { ok: false as const, code: 'INVALID_ITALIAN_NAME', externalExerciseId };
  if (!isSemanticStatus(researchStatus) || !isSemanticStatus(semanticReviewStatus)) return { ok: false as const, code: 'INVALID_SEMANTIC_STATUS', externalExerciseId };
  if (matchScore !== null && (matchScore < 0 || matchScore > 100)) return { ok: false as const, code: 'INVALID_MATCH_SCORE', externalExerciseId };
  if ((matchScore ?? 0) < 55 && comparedExistingExerciseKey) return { ok: false as const, code: 'LOW_SCORE_HAS_CANDIDATE', externalExerciseId };
  if (researchStatus === 'LINK_EXISTING_VERIFIED') {
    if ((matchScore ?? -1) < 92 || !comparedExistingExerciseKey || blockingContradictions > 0) return { ok: false as const, code: 'INVALID_LINK_VERIFIED', externalExerciseId };
  }
  if (researchStatus === 'REVIEW_POSSIBLE_MATCH') {
    if (!comparedExistingExerciseKey || (matchScore ?? -1) < 55 || (matchScore ?? 100) > 91 || blockingContradictions > 0) return { ok: false as const, code: 'INVALID_REVIEW_MATCH', externalExerciseId };
  }
  if (researchStatus === 'CREATE_NEW_RESEARCHED' && comparedExistingExerciseKey && (matchScore ?? 0) < 55) {
    return { ok: false as const, code: 'CREATE_NEW_LOW_SCORE_HAS_CANDIDATE', externalExerciseId };
  }
  if (researchStatus === 'EXCLUDE_EDITORIAL_DUPLICATE' && !primaryDuplicateExternalId) return { ok: false as const, code: 'MISSING_PRIMARY_DUPLICATE', externalExerciseId };
  return { ok: true as const, externalExerciseId, researchStatus, semanticReviewStatus, matchScore, comparedExistingExerciseKey, researchedItalianName };
}

async function actionSaveSemanticResearchBatch(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const importRunId = pickString(payload.importRunId);
  const algorithmVersion = pickString(payload.algorithmVersion) ?? SEMANTIC_RESEARCH_VERSION;
  const items = Array.isArray(payload.items) ? payload.items as JsonRecord[] : [];
  if (!importRunId || !algorithmVersion) return errorResponse('INVALID_PAYLOAD', 'importRunId o algorithmVersion mancanti.', 400);
  if (items.length < 1 || items.length > 20) return errorResponse('INVALID_BATCH_SIZE', 'Il batch deve contenere da 1 a 20 righe.', 400);
  const run = await getRun(adminClient, importRunId, userId);
  if (!run) return errorResponse('IMPORT_RUN_NOT_FOUND', 'Import run non trovato.', 404);

  const seen = new Set<string>();
  const validated = [];
  for (const raw of items) {
    const result = validateSemanticItem(raw);
    if (!result.ok) return errorResponse(result.code, 'Riga semantica non valida.', 400, { externalExerciseId: 'externalExerciseId' in result ? result.externalExerciseId ?? null : null });
    if (seen.has(result.externalExerciseId)) return errorResponse('DUPLICATE_EXTERNAL_ID', 'External ID duplicato nel batch.', 400, { externalExerciseId: result.externalExerciseId });
    seen.add(result.externalExerciseId);
    validated.push({ raw, ...result });
  }

  const externalIds = validated.map((item) => item.externalExerciseId);
  const { data: existingRows, error: existingError } = await adminClient
    .from('ymove_library_import_candidates')
    .select('external_exercise_id')
    .eq('import_run_id', importRunId)
    .in('external_exercise_id', externalIds);
  if (existingError) return errorResponse('CANDIDATES_READ_FAILED', 'Candidati non verificabili.', 500, {
    dbCode: existingError.code ?? null,
    dbMessage: existingError.message ?? null,
    dbDetails: existingError.details ?? null,
    dbHint: existingError.hint ?? null,
  });
  const existing = new Set((existingRows ?? []).map((row: JsonRecord) => pickString(row.external_exercise_id)).filter(Boolean) as string[]);
  const missing = externalIds.filter((id) => !existing.has(id));
  if (missing.length > 0) return errorResponse('CANDIDATE_NOT_IN_RUN', 'Uno o piu candidati non appartengono al run.', 409, { missingExternalIds: missing });

  const updatedRows: JsonRecord[] = [];
  for (const item of validated) {
    const raw = item.raw;
    const updates = {
      researched_italian_name: item.researchedItalianName,
      researched_italian_aliases: jsonArray(raw.researchedItalianAliases),
      english_aliases: jsonArray(raw.englishAliases),
      research_status: item.researchStatus,
      research_sources: jsonArray(raw.researchSources),
      technical_fingerprint: jsonObject(raw.technicalFingerprint),
      technical_variant: jsonObject(raw.technicalVariant),
      score: item.matchScore,
      match_reason: pickString(raw.matchReason),
      contradiction_flags: jsonArray(raw.contradictionFlags),
      compared_existing_exercise_key: item.comparedExistingExerciseKey,
      primary_duplicate_external_id: pickString(raw.primaryDuplicateExternalId),
      candidate_rejected_reason: pickString(raw.candidateRejectedReason),
      source_confidence: numberValue(raw.sourceConfidence),
      semantic_review_status: item.semanticReviewStatus,
      research_algorithm_version: algorithmVersion,
      researched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await adminClient
      .from('ymove_library_import_candidates')
      .update(updates)
      .eq('import_run_id', importRunId)
      .eq('external_exercise_id', item.externalExerciseId)
      .select('external_exercise_id,ymove_title,researched_italian_name,research_status,semantic_review_status,score,compared_existing_exercise_key,primary_duplicate_external_id,research_algorithm_version')
      .maybeSingle();
    if (error) return errorResponse('SEMANTIC_RESEARCH_SAVE_FAILED', 'Ricerca semantica non salvata.', 500, {
      externalExerciseId: item.externalExerciseId,
      dbCode: error.code ?? null,
      dbMessage: error.message ?? null,
      dbDetails: error.details ?? null,
      dbHint: error.hint ?? null,
    });
    if (!data) return errorResponse('CANDIDATE_NOT_FOUND', 'Candidato non trovato durante il salvataggio.', 404, { externalExerciseId: item.externalExerciseId });
    updatedRows.push(data as JsonRecord);
  }

  const counts = countSemanticStatuses(updatedRows);
  return json({ ok: true, importRunId, algorithmVersion, updated: updatedRows.length, counts, rows: updatedRows });
}

function countSemanticStatuses(rows: JsonRecord[]) {
  const counts: Record<string, number> = Object.fromEntries(SEMANTIC_STATUSES.map((status) => [status, 0]));
  rows.forEach((row) => {
    const status = pickString(row.semantic_review_status) ?? pickString(row.research_status);
    if (status && status in counts) counts[status] += 1;
  });
  return counts;
}

async function getSemanticSummary(adminClient: SupabaseClient, importRunId: string, algorithmVersion: string) {
  const { data } = await adminClient
    .from('ymove_library_import_candidates')
    .select('semantic_review_status,research_status,research_algorithm_version')
    .eq('import_run_id', importRunId);
  const rows = (data ?? []) as JsonRecord[];
  const researchedRows = rows.filter((row) => pickString(row.research_algorithm_version) === algorithmVersion);
  return {
    totalCandidates: rows.length,
    researched: researchedRows.length,
    remaining: Math.max(0, rows.length - researchedRows.length),
    linkVerified: researchedRows.filter((row) => (pickString(row.semantic_review_status) ?? pickString(row.research_status)) === 'LINK_EXISTING_VERIFIED').length,
    createNewResearched: researchedRows.filter((row) => (pickString(row.semantic_review_status) ?? pickString(row.research_status)) === 'CREATE_NEW_RESEARCHED').length,
    reviewPossibleMatch: researchedRows.filter((row) => (pickString(row.semantic_review_status) ?? pickString(row.research_status)) === 'REVIEW_POSSIBLE_MATCH').length,
    editorialDuplicate: researchedRows.filter((row) => (pickString(row.semantic_review_status) ?? pickString(row.research_status)) === 'EXCLUDE_EDITORIAL_DUPLICATE').length,
    researchRequired: researchedRows.filter((row) => (pickString(row.semantic_review_status) ?? pickString(row.research_status)) === 'RESEARCH_REQUIRED').length,
    conflict: researchedRows.filter((row) => (pickString(row.semantic_review_status) ?? pickString(row.research_status)) === 'CONFLICT').length,
  };
}

async function actionGetNextSemanticResearchBatch(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const importRunId = pickString(payload.importRunId);
  const algorithmVersion = pickString(payload.algorithmVersion) ?? SEMANTIC_RESEARCH_VERSION;
  const limit = Math.max(1, Math.min(20, numberValue(payload.limit) ?? 20));
  if (!importRunId) return errorResponse('INVALID_PAYLOAD', 'importRunId mancante.', 400);
  const run = await getRun(adminClient, importRunId, userId);
  if (!run) return errorResponse('IMPORT_RUN_NOT_FOUND', 'Import run non trovato.', 404);

  const { data: hiddenRows } = await adminClient
    .from('exercises')
    .select('ymove_exercise_id')
    .eq('source', 'ymove')
    .eq('library_status', 'hidden')
    .not('source_metadata->incident_quarantine', 'is', null);
  const hiddenExternalIds = new Set((hiddenRows ?? []).map((row: JsonRecord) => pickString(row.ymove_exercise_id)).filter(Boolean) as string[]);
  const { data, error } = await adminClient
    .from('ymove_library_import_candidates')
    .select('external_exercise_id,ymove_title,proposed_italian_name,classification,existing_exercise_key,score,score_gap,reasons,contradictions,alternatives,translation_status,safe_create,metadata_match,proposed_payload,research_algorithm_version,research_status,semantic_review_status')
    .eq('import_run_id', importRunId)
    .in('classification', ['CREATE_NEW', 'REVIEW_POSSIBLE_DUPLICATE'])
    .order('ymove_title')
    .order('external_exercise_id');
  if (error) return errorResponse('SEMANTIC_BATCH_READ_FAILED', 'Batch semantico non leggibile.', 500, {
    dbCode: error.code ?? null,
    dbMessage: error.message ?? null,
    dbDetails: error.details ?? null,
    dbHint: error.hint ?? null,
  });
  const candidates = ((data ?? []) as JsonRecord[])
    .filter((row) => pickString(row.research_algorithm_version) !== algorithmVersion)
    .filter((row) => !hiddenExternalIds.has(pickString(row.external_exercise_id) ?? ''))
    .slice(0, limit);
  const summary = await getSemanticSummary(adminClient, importRunId, algorithmVersion);
  return json({ ok: true, importRunId, algorithmVersion, summary, candidates });
}

async function getImportPreflight(adminClient: SupabaseClient, importRunId: string): Promise<
  | { ok: true; summary: JsonRecord & { totalPlanned: number; approvedNewCount: number; approvedLinkCount: number } }
  | { ok: false; error?: JsonRecord }
> {
  const { data, error } = await adminClient
    .from('ymove_library_import_candidates')
    .select('classification,safe_create,contradictions,external_exercise_id,decision,approved_italian_name,approved_italian_name_confirmed_by,approved_italian_name_confirmed_at,reviewed_by,reviewed_at,existing_exercise_id,existing_exercise_key,approved_existing_exercise_key,translation_status')
    .eq('import_run_id', importRunId);
  if (error) {
    return {
      ok: false,
      error: {
        dbCode: error.code ?? null,
        dbMessage: error.message ?? null,
        dbDetails: error.details ?? null,
        dbHint: error.hint ?? null,
      },
    };
  }
  const rows = (data ?? []) as JsonRecord[];
  const candidateExternalIds = rows.map((row) => pickString(row.external_exercise_id)).filter(Boolean) as string[];
  const { data: linkedRows } = candidateExternalIds.length
    ? await adminClient
      .from('exercise_external_links')
      .select('external_exercise_id')
      .eq('provider', 'ymove')
      .eq('match_status', 'manual_approved')
      .eq('is_primary', true)
      .in('external_exercise_id', candidateExternalIds)
    : { data: [] };
  const alreadyLinked = new Set((linkedRows ?? []).map((row: JsonRecord) => pickString(row.external_exercise_id)).filter(Boolean) as string[]);
  const approvedNewRows = rows.filter((row) =>
    row.classification === 'CREATE_NEW'
    && row.safe_create === true
    && row.decision === 'approved_new'
    && Boolean(pickString(row.approved_italian_name))
    && Boolean(pickString(row.approved_italian_name_confirmed_by))
    && Boolean(pickString(row.approved_italian_name_confirmed_at))
    && Boolean(pickString(row.reviewed_by))
    && Boolean(pickString(row.reviewed_at))
    && !alreadyLinked.has(pickString(row.external_exercise_id) ?? ''),
  );
  const approvedLinkRows = rows.filter((row) =>
    row.classification === 'LINK_EXISTING'
    && row.decision === 'approved_link'
    && Boolean(pickString(row.approved_existing_exercise_key))
    && Boolean(pickString(row.reviewed_by))
    && Boolean(pickString(row.reviewed_at))
    && stringArray(row.contradictions).length === 0
    && !alreadyLinked.has(pickString(row.external_exercise_id) ?? ''),
  );
  const missingApprovedName = rows.filter((row) =>
    row.classification === 'CREATE_NEW'
    && row.safe_create === true
    && row.decision === 'approved_new'
    && !pickString(row.approved_italian_name),
  ).length;
  const newExternalIds = approvedNewRows.map((row) => pickString(row.external_exercise_id)).filter(Boolean) as string[];
  const linkExternalIds = approvedLinkRows.map((row) => pickString(row.external_exercise_id)).filter(Boolean) as string[];
  const duplicateExternalIds = countDuplicates([...newExternalIds, ...linkExternalIds]);
  const linkTargets = approvedLinkRows.map((row) => pickString(row.approved_existing_exercise_key)).filter(Boolean) as string[];
  const duplicatePrimaryTargets = countDuplicates(linkTargets);
  const invalidCandidates = rows.filter((row) =>
    (row.decision === 'approved_new' && (row.classification !== 'CREATE_NEW' || row.safe_create !== true || !pickString(row.approved_italian_name) || !pickString(row.approved_italian_name_confirmed_by) || !pickString(row.approved_italian_name_confirmed_at) || !pickString(row.reviewed_by) || !pickString(row.reviewed_at)))
    || (row.decision === 'approved_link' && (row.classification !== 'LINK_EXISTING' || !pickString(row.approved_existing_exercise_key) || stringArray(row.contradictions).length > 0 || !pickString(row.reviewed_by) || !pickString(row.reviewed_at))),
  ).length;
  const totalPlanned = approvedNewRows.length + approvedLinkRows.length;
  const safeCreateTotal = rows.filter((row) => row.classification === 'CREATE_NEW' && row.safe_create === true).length;
  return {
    ok: true,
    summary: {
      safeCreateTotal,
      approvedNewCount: approvedNewRows.length,
      approvedLinkCount: approvedLinkRows.length,
      missingApprovedName,
      duplicateExternalIds,
      duplicatePrimaryTargets,
      invalidCandidates,
      batchCount: Math.ceil(totalPlanned / 10),
      totalPlanned,
      newSafeCreate: approvedNewRows.length,
      linkExisting: approvedLinkRows.length,
      totalWithVideo: totalPlanned,
      batchSize: 10,
    },
  };
}

function countDuplicates(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
}

async function actionApplyApprovedBatch(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const importRunId = pickString(payload.importRunId);
  const batchSize = Math.max(1, Math.min(10, numberValue(payload.batchSize) ?? 10));
  if (!importRunId) return errorResponse('INVALID_PAYLOAD', 'importRunId mancante.', 400);
  const run = await getRun(adminClient, importRunId, userId);
  if (!run) return errorResponse('IMPORT_RUN_NOT_FOUND', 'Import run non trovato.', 404);
  return errorResponse('IMPORT_TEMPORARILY_DISABLED', 'Importazione temporaneamente bloccata per verifica dati.', 423, {
    importRunId,
    batchSize,
  });
  const beforePreflight = await getImportPreflight(adminClient, importRunId);
  if (!beforePreflight.ok) return errorResponse('IMPORT_PREFLIGHT_FAILED', 'Preflight import non riuscito.', 500, beforePreflight.error ?? {});
  if (beforePreflight.summary.totalPlanned <= 0) {
    return errorResponse('NOTHING_TO_IMPORT', 'Nessun candidato approvato da importare.', 409, {
      remaining: 0,
      approvedNewCount: beforePreflight.summary.approvedNewCount,
      approvedLinkCount: beforePreflight.summary.approvedLinkCount,
    });
  }
  const { data, error } = await adminClient.rpc('apply_ymove_safe_create_batch', {
    p_import_run_id: importRunId,
    p_batch_size: batchSize,
    p_reviewed_by: userId,
  });
  if (error) {
    return errorResponse('APPLY_BATCH_FAILED', 'Batch import YMove non applicato.', 500, {
      dbCode: error.code ?? null,
      dbMessage: error.message ?? null,
      dbDetails: error.details ?? null,
      dbHint: error.hint ?? null,
    });
  }
  const payloadResult = (data ?? {}) as JsonRecord;
  const created = numberValue(payloadResult.createdNew) ?? 0;
  const linked = numberValue(payloadResult.linkedExisting) ?? 0;
  const alreadyPresent = numberValue(payloadResult.idempotent) ?? 0;
  const processed = numberValue(payloadResult.processed) ?? 0;
  const afterPreflight = await getImportPreflight(adminClient, importRunId);
  const remaining = afterPreflight.ok ? afterPreflight.summary.totalPlanned : Math.max(0, beforePreflight.summary.totalPlanned - created - linked - alreadyPresent);
  if (processed === 0 && created === 0 && linked === 0 && alreadyPresent === 0) {
    return errorResponse('APPLY_BATCH_NOOP', 'Nessun candidato e stato applicato.', 409, { remaining });
  }
  return json({
    ok: true,
    success: true,
    importRunId,
    created,
    linked,
    alreadyPresent,
    failed: 0,
    remaining,
    result: { ...payloadResult, remaining },
  });
}

async function readPilotCandidate(adminClient: SupabaseClient) {
  const selectColumns = [
    'import_run_id',
    'external_exercise_id',
    'classification',
    'semantic_review_status',
    'compared_existing_exercise_key',
    'score',
    'contradiction_flags',
    'decision',
    'approved_existing_exercise_key',
    'reviewed_by',
    'reviewed_at',
  ].join(',');
  const { data, error } = await adminClient
    .from('ymove_library_import_candidates')
    .select(selectColumns)
    .eq('import_run_id', PILOT_IMPORT_RUN_ID)
    .eq('external_exercise_id', PILOT_EXTERNAL_EXERCISE_ID)
    .limit(2);
  if (error) {
    console.error('YMOVE_PILOT_CANDIDATE_READ_ERROR', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      columns: selectColumns,
    });
    return { error };
  }
  const rows = (data ?? []) as JsonRecord[];
  if (rows.length > 1) return { duplicate: true };
  return { candidate: rows[0] ?? null };
}

function pilotContradictions(candidate: JsonRecord) {
  return Array.isArray(candidate.contradiction_flags) ? candidate.contradiction_flags : [];
}

function pilotSemanticStatus(candidate: JsonRecord) {
  return pickString(candidate.semantic_review_status) || pickString(candidate.proposed_staging_status);
}

// Normalizza una chiave esercizio legacy: rimuove il prefisso "legacy:" (usato
// solo lato client/costanti pilota) cosi' da ottenere sempre la stessa forma
// nuda memorizzata in exercise_movement_metadata.exercise_id e in
// exercise_external_links.exercise_key. Ritorna null su input vuoto/non stringa.
function normalizeLegacyExerciseKey(value: unknown): string | null {
  const raw = pickString(value);
  if (!raw) return null;
  const withoutPrefix = raw.startsWith('legacy:') ? raw.slice('legacy:'.length) : raw;
  return pickString(withoutPrefix);
}

type LegacyMetadataResolution = { ok: true } | { ok: false; errorCode: string; error?: { code?: string; message?: string } };

// Verifica che la chiave legacy esista in exercise_movement_metadata (la
// libreria esercizi locale, non public.exercises: nessun bridge UUID
// necessario per collegare un video YMove a un esercizio legacy).
async function verifyLegacyExerciseMetadata(adminClient: SupabaseClient, legacyKey: string): Promise<LegacyMetadataResolution> {
  const { data, error } = await adminClient
    .from('exercise_movement_metadata')
    .select('exercise_id')
    .eq('exercise_id', legacyKey)
    .limit(2);
  if (error) return { ok: false, errorCode: 'LEGACY_METADATA_READ_FAILED', error: { code: error.code, message: error.message } };
  const rows = data ?? [];
  if (rows.length === 0) return { ok: false, errorCode: 'LEGACY_METADATA_NOT_FOUND' };
  if (rows.length > 1) return { ok: false, errorCode: 'LEGACY_METADATA_AMBIGUOUS' };
  return { ok: true };
}

const LEGACY_METADATA_ERROR_MESSAGES: Record<string, string> = {
  LEGACY_METADATA_NOT_FOUND: 'La chiave legacy pilota non ha metadata registrati in exercise_movement_metadata.',
  LEGACY_METADATA_AMBIGUOUS: 'La chiave legacy pilota ha piu di una riga in exercise_movement_metadata.',
  LEGACY_METADATA_READ_FAILED: 'Errore nella lettura dei metadata legacy pilota.',
};

function legacyMetadataErrorResponse(resolution: { ok: false; errorCode: string; error?: { code?: string; message?: string } }) {
  const status = resolution.errorCode === 'LEGACY_METADATA_READ_FAILED' ? 500 : 409;
  return errorResponse(
    resolution.errorCode,
    LEGACY_METADATA_ERROR_MESSAGES[resolution.errorCode] ?? 'Metadata legacy pilota non risolti.',
    status,
    resolution.error ? { dbCode: resolution.error.code, dbMessage: resolution.error.message } : undefined,
  );
}

type LegacyLinkCheck = { exists: boolean; id?: string } | { error: { code?: string; message?: string } };

// Verifica se esiste gia' un link YMove primario approvato per questa chiave
// legacy (exercise_key, non exercise_id) — nessun link duplicato consentito.
async function verifyNoExistingLegacyLink(adminClient: SupabaseClient, legacyKey: string): Promise<LegacyLinkCheck> {
  const { data, error } = await adminClient
    .from('exercise_external_links')
    .select('id')
    .eq('provider', 'ymove')
    .eq('exercise_key', legacyKey)
    .eq('match_status', 'manual_approved')
    .eq('is_primary', true)
    .maybeSingle();
  if (error) return { error: { code: error.code, message: error.message } };
  return data ? { exists: true, id: pickString(data.id) ?? undefined } : { exists: false };
}

async function actionPilotLinkPreflight(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  const importRunId = pickString(payload.importRunId);
  const externalExerciseId = pickString(payload.externalExerciseId);
  // Il campo payload resta "targetExerciseKey" (compatibilita' con il
  // chiamante esistente in mobile/src/app/superadmin/ymove-library-import.tsx,
  // che invia/legge questo nome) ma il valore e' sempre una chiave legacy
  // testuale, mai piu' un UUID canonico.
  const targetLegacyKey = normalizeLegacyExerciseKey(payload.targetExerciseKey);
  const expectedLegacyKey = normalizeLegacyExerciseKey(PILOT_TARGET_KEY);
  if (importRunId !== PILOT_IMPORT_RUN_ID || externalExerciseId !== PILOT_EXTERNAL_EXERCISE_ID || !targetLegacyKey || targetLegacyKey !== expectedLegacyKey) {
    return errorResponse('PILOT_EXTERNAL_ID_NOT_ALLOWED', 'Il pilota accetta esclusivamente Barbell Curls.', 403);
  }
  const run = await getRun(adminClient, importRunId, userId);
  if (!run) return errorResponse('IMPORT_RUN_NOT_FOUND', 'Import run non trovato.', 404);
  const { candidate, error, duplicate } = await readPilotCandidate(adminClient);
  if (error) return errorResponse('PILOT_CANDIDATE_READ_FAILED', 'Candidato pilota non letto.', 500);
  if (duplicate) return errorResponse('PILOT_CANDIDATE_DUPLICATED', 'Esistono più righe per il candidato pilota.', 409);
  if (!candidate) return errorResponse('CANDIDATE_NOT_FOUND', 'Candidato pilota non trovato.', 404);

  const metadataResolution = await verifyLegacyExerciseMetadata(adminClient, targetLegacyKey);
  if (!metadataResolution.ok) return legacyMetadataErrorResponse(metadataResolution);

  const linkCheck = await verifyNoExistingLegacyLink(adminClient, targetLegacyKey);
  if ('error' in linkCheck) return errorResponse('PILOT_LINK_READ_FAILED', 'Errore nella verifica del collegamento esistente.', 500, { dbCode: linkCheck.error.code, dbMessage: linkCheck.error.message });

  const contradictions = pilotContradictions(candidate);
  const rawTarget = pickString(candidate.approved_existing_exercise_key) || pickString(candidate.compared_existing_exercise_key);
  const normalizedTarget = rawTarget ? normalizeLegacyExerciseKey(rawTarget) : null;
  const score = numberValue(candidate.score);
  const valid = (pilotSemanticStatus(candidate) === 'LINK_EXISTING_READY' || pilotSemanticStatus(candidate) === 'LINK_EXISTING_VERIFIED')
    && candidate.decision === 'approved_link'
    && normalizedTarget === targetLegacyKey
    && contradictions.length === 0
    && score !== null && score >= 92
    && !linkCheck.exists;

  if (!valid && linkCheck.exists) {
    return json({ ok: true, success: true, approvedLinks: 0, approvedNew: 0, totalPlanned: 0, targetExerciseKey: targetLegacyKey, duplicatePrimaryTarget: true, contradictions });
  }
  return json({ ok: true, success: valid, approvedLinks: valid ? 1 : 0, approvedNew: 0, totalPlanned: valid ? 1 : 0, targetExerciseKey: targetLegacyKey, duplicatePrimaryTarget: false, contradictions, code: valid ? undefined : 'PILOT_PREFLIGHT_FAILED' });
}

async function actionApprovePilotLink(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  if (pickString(payload.importRunId) !== PILOT_IMPORT_RUN_ID || pickString(payload.externalExerciseId) !== PILOT_EXTERNAL_EXERCISE_ID) {
    return errorResponse('PILOT_EXTERNAL_ID_NOT_ALLOWED', 'Il pilota accetta esclusivamente Barbell Curls.', 403);
  }
  const targetLegacyKey = normalizeLegacyExerciseKey(payload.targetExerciseKey);
  const expectedLegacyKey = normalizeLegacyExerciseKey(PILOT_TARGET_KEY);
  if (!targetLegacyKey || targetLegacyKey !== expectedLegacyKey) return errorResponse('PILOT_TARGET_MISMATCH', 'Il target del pilota non corrisponde al target verificato.', 409);
  const { candidate, error: candidateError, duplicate } = await readPilotCandidate(adminClient);
  if (candidateError) return errorResponse('PILOT_CANDIDATE_READ_FAILED', 'Candidato pilota non letto.', 500);
  if (duplicate) return errorResponse('PILOT_CANDIDATE_DUPLICATED', 'Esistono più righe per il candidato pilota.', 409);
  if (!candidate) return errorResponse('PILOT_CANDIDATE_NOT_FOUND', 'Candidato pilota non trovato.', 404);
  const semanticStatus = pilotSemanticStatus(candidate);
  if (semanticStatus !== 'LINK_EXISTING_READY' && semanticStatus !== 'LINK_EXISTING_VERIFIED') return errorResponse('PILOT_SEMANTIC_STATUS_INVALID', 'Lo stato semantico del pilota non è approvabile.', 409, { semanticStatus });
  const comparedKey = normalizeLegacyExerciseKey(candidate.compared_existing_exercise_key);
  if (comparedKey !== targetLegacyKey) return errorResponse('PILOT_TARGET_MISMATCH', 'Il target semantico del pilota non corrisponde al target verificato.', 409);
  const score = numberValue(candidate.score);
  if (score === null || score < 92) return errorResponse('PILOT_SCORE_TOO_LOW', 'Il punteggio del pilota è inferiore alla soglia richiesta.', 409, { score });
  const contradictions = pilotContradictions(candidate);
  if (contradictions.length > 0) return errorResponse('PILOT_CONTRADICTION_FOUND', 'Il pilota contiene contraddizioni tecniche.', 409, { contradictions });

  const metadataResolution = await verifyLegacyExerciseMetadata(adminClient, targetLegacyKey);
  if (!metadataResolution.ok) return legacyMetadataErrorResponse(metadataResolution);

  const linkCheck = await verifyNoExistingLegacyLink(adminClient, targetLegacyKey);
  if ('error' in linkCheck) return errorResponse('PILOT_LINK_READ_FAILED', 'Errore nella verifica del collegamento esistente.', 500, { dbCode: linkCheck.error.code, dbMessage: linkCheck.error.message });
  if (linkCheck.exists) return errorResponse('PILOT_ALREADY_LINKED', 'Il target pilota ha già un link YMove primario approvato.', 409);

  // approved_existing_exercise_key salvato SENZA prefisso "legacy:": deve
  // combaciare esattamente con exercise_movement_metadata.exercise_id e con la
  // exercise_key che la RPC scrivera' poi in exercise_external_links.
  const { data, error } = await adminClient.from('ymove_library_import_candidates').update({
    decision: 'approved_link',
    approved_existing_exercise_key: targetLegacyKey,
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('import_run_id', PILOT_IMPORT_RUN_ID).eq('external_exercise_id', PILOT_EXTERNAL_EXERCISE_ID)
    .select('external_exercise_id,decision,approved_existing_exercise_key,reviewed_at').maybeSingle();
  if (error) return errorResponse('PILOT_APPROVAL_FAILED', 'Approvazione pilota non salvata.', 500, { dbCode: error.code, dbMessage: error.message });
  if (!data) return errorResponse('PILOT_CANDIDATE_NOT_FOUND', 'Candidato pilota non trovato o non aggiornabile.', 404);
  return json({ ok: true, success: true, decision: 'approved_link', targetExerciseKey: targetLegacyKey, candidate: data });
}

async function actionApplyPilotLink(adminClient: SupabaseClient, userId: string, payload: JsonRecord) {
  if (pickString(payload.importRunId) !== PILOT_IMPORT_RUN_ID || pickString(payload.externalExerciseId) !== PILOT_EXTERNAL_EXERCISE_ID) {
    return errorResponse('PILOT_EXTERNAL_ID_NOT_ALLOWED', 'Il pilota accetta esclusivamente Barbell Curls.', 403);
  }
  // targetExerciseKey e' sempre forzato alla costante nota del pilota: il
  // payload che il chiamante invia per apply_pilot_link (vedi
  // mobile/src/app/superadmin/ymove-library-import.tsx) non lo include mai, e
  // la preflight interna lo richiede sempre per procedere (bug preesistente,
  // indipendente da questa modifica, corretto qui su richiesta esplicita).
  const preflight = await actionPilotLinkPreflight(adminClient, userId, { ...payload, targetExerciseKey: PILOT_TARGET_KEY });
  const preflightBody = await preflight.json();
  if (!preflightBody.success) return new Response(JSON.stringify(preflightBody), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const { data: candidates, error: candidateError } = await adminClient.from('ymove_library_import_candidates')
    .select('external_exercise_id,classification,decision,approved_italian_name,approved_italian_name_confirmed_by,approved_italian_name_confirmed_at,approved_existing_exercise_key,reviewed_by,reviewed_at,contradictions,safe_create')
    .eq('import_run_id', PILOT_IMPORT_RUN_ID);
  if (candidateError) return errorResponse('PILOT_PREFLIGHT_FAILED', 'Preflight pilota non riuscito.', 500);
  const eligible = (candidates ?? []).filter((row) => {
    const c = row as JsonRecord;
    const isNew = c.classification === 'CREATE_NEW' && c.safe_create === true && c.decision === 'approved_new' && Boolean(pickString(c.approved_italian_name)) && Boolean(pickString(c.approved_italian_name_confirmed_by)) && Boolean(pickString(c.approved_italian_name_confirmed_at)) && Boolean(pickString(c.reviewed_by)) && Boolean(pickString(c.reviewed_at));
    const isLink = c.classification === 'LINK_EXISTING' && c.decision === 'approved_link' && pickString(c.approved_existing_exercise_key) && Boolean(pickString(c.reviewed_by)) && Boolean(pickString(c.reviewed_at)) && stringArray(c.contradictions).length === 0;
    return isNew || isLink;
  });
  if (eligible.some((row) => pickString((row as JsonRecord).external_exercise_id) !== PILOT_EXTERNAL_EXERCISE_ID)) {
    return errorResponse('PILOT_NOT_ISOLATED', 'Il pilota non e isolato: esistono altri candidati approvati. Nessuna scrittura eseguita.', 409, { eligibleExternalExerciseIds: eligible.map((row) => pickString((row as JsonRecord).external_exercise_id)).filter(Boolean) });
  }
  const { data, error } = await adminClient.rpc('apply_ymove_safe_create_batch', { p_import_run_id: PILOT_IMPORT_RUN_ID, p_batch_size: 1, p_reviewed_by: userId });
  if (error) return errorResponse('PILOT_APPLY_FAILED', 'Collegamento pilota non applicato.', 500, { dbCode: error.code ?? null, dbMessage: error.message ?? null, dbDetails: error.details ?? null, dbHint: error.hint ?? null });
  const result = (data ?? {}) as JsonRecord;
  const ids = stringArray(result.external_ids);
  if (!ids.includes(PILOT_EXTERNAL_EXERCISE_ID)) return errorResponse('PILOT_APPLY_UNEXPECTED_ID', 'La RPC non ha elaborato esclusivamente il candidato pilota.', 500, { externalExerciseIds: ids });
  return json({ ok: true, success: true, created: 0, linked: numberValue(result.linked) ?? 0, alreadyPresent: numberValue(result.already_present) ?? 0, failed: 0, remaining: numberValue(result.remaining) ?? 0, externalExerciseIds: ids });
}

Deno.serve(async (req) => {
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
  try {
    switch (action) {
      case 'start':
        return await actionStart(auth.adminClient, auth.userId, payload);
      case 'start_reclassification':
        return await actionStartReclassification(auth.adminClient, auth.userId, payload);
      case 'analyze_batch':
        return await actionAnalyzeBatch(auth.adminClient, auth.userId, payload);
      case 'reclassify_batch':
        return await actionReclassifyBatch(auth.adminClient, auth.userId, payload);
      case 'status':
        return await actionStatus(auth.adminClient, auth.userId, payload);
      case 'results':
        return await actionResults(auth.adminClient, auth.userId, payload);
      case 'approve_candidate':
        return await actionApproveCandidate(auth.adminClient, auth.userId, payload);
      case 'update_candidate_name':
        return await actionUpdateCandidateName(auth.adminClient, auth.userId, payload);
      case 'finalize_review':
        return await actionFinalizeReview(auth.adminClient, auth.userId, payload);
      case 'save_semantic_research_batch':
        return await actionSaveSemanticResearchBatch(auth.adminClient, auth.userId, payload);
      case 'get_next_semantic_research_batch':
        return await actionGetNextSemanticResearchBatch(auth.adminClient, auth.userId, payload);
      case 'import_preflight':
      case 'apply_preview':
        return await actionImportPreflight(auth.adminClient, auth.userId, payload);
      case 'pilot_link_preflight':
        return await actionPilotLinkPreflight(auth.adminClient, auth.userId, payload);
      case 'approve_pilot_link':
        return await actionApprovePilotLink(auth.adminClient, auth.userId, payload);
      case 'apply_pilot_link':
        return await actionApplyPilotLink(auth.adminClient, auth.userId, payload);
      case 'apply_approved_batch':
        return await actionApplyApprovedBatch(auth.adminClient, auth.userId, payload);
      default:
        return errorResponse('INVALID_ACTION', 'Azione import non valida.', 400);
    }
  } catch (error) {
    console.error('YMOVE_LIBRARY_IMPORT_SAFE_ERROR', { action, message: error instanceof Error ? error.message : String(error) });
    return errorResponse('IMPORT_ERROR', 'Import YMove non completato.', 500);
  }
});
