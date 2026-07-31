#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const YMOVE_BASE_URL = 'https://exercise-api.ymove.app/api/v2';
const OPENAPI_URL = `${YMOVE_BASE_URL}/openapi.json`;
const PAGE_SIZE = 50;
const REPORT_DIR = path.resolve('reports');
const ALGORITHM_VERSION = 'ymove-strict-match-2026-07-30';
const AUTO_MATCH_THRESHOLD = 92;
const REVIEW_THRESHOLD = 72;
const MIN_AUTO_GAP = 8;

const SECRET_NAMES = ['YMOVE_API_KEY', 'YMOVE_EXERCISE_API_KEY'];
const PUBLIC_SECRET_NAMES = ['EXPO_PUBLIC_YMOVE_API_KEY'];

const STOP_WORDS = new Set([
  'al',
  'alla',
  'allo',
  'ai',
  'a',
  'con',
  'per',
  'da',
  'di',
  'del',
  'della',
  'the',
  'and',
  'of',
  'exercise',
  'esercizio',
]);

const PHRASE_SYNONYMS = new Map([
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
  ['shoulder press', 'shoulder press'],
  ['pressa', 'leg press'],
  ['pressa 45', '45 degree leg press'],
  ['leg curl', 'hamstring curl'],
  ['leg extension', 'knee extension'],
  ['stacco rumeno', 'romanian deadlift'],
  ['rdl', 'romanian deadlift'],
  ['hip thrust', 'barbell hip thrust'],
  ['ponte glutei', 'glute bridge'],
  ['calf raise', 'calf raise'],
  ['curl manubri', 'dumbbell biceps curl'],
  ['pushdown', 'triceps cable pushdown'],
  ['french press', 'lying triceps extension'],
  ['plank', 'front plank'],
  ['crunch', 'abdominal crunch'],
]);

const MUSCLE_MAP = new Map([
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
  ['addominali/core', 'core'],
  ['obliqui', 'core'],
  ['lombari', 'back'],
  ['cardio', 'cardio'],
]);

const EQUIPMENT_PATTERNS = [
  ['barbell', ['bilanciere', 'barbell', 'ez']],
  ['dumbbell', ['manubrio', 'manubri', 'dumbbell']],
  ['cable', ['cavo', 'cavi', 'pulley', 'cable']],
  ['machine', ['macchina', 'machine', 'lat machine', 'pressa', 'leg press', 'chest press', 'hack squat']],
  ['bodyweight', ['corpo libero', 'bodyweight', 'sbarra', 'push up', 'plank']],
  ['kettlebell', ['kettlebell']],
  ['band', ['elastico', 'band']],
  ['bench', ['panca', 'bench']],
];

const DISCRIMINATORS = {
  angle: [
    ['incline', ['inclinata', 'incline']],
    ['decline', ['declinata', 'decline']],
    ['flat', ['piana', 'flat']],
    ['45', ['45', '45 degree']],
  ],
  position: [
    ['seated', ['seduto', 'seated']],
    ['lying', ['sdraiato', 'lying', 'prono', 'supino']],
    ['standing', ['in piedi', 'standing']],
    ['kneeling', ['in ginocchio', 'kneeling']],
  ],
  laterality: [
    ['single', ['singolo', 'monopodalico', 'unilaterale', 'single', 'one arm', 'alternato']],
    ['bilateral', ['bilaterale', 'both']],
  ],
  grip: [
    ['wide', ['larga', 'wide']],
    ['close', ['stretta', 'close']],
    ['neutral', ['neutra', 'neutral']],
    ['supinated', ['supina', 'supinated']],
    ['pronated', ['prona', 'pronated']],
  ],
};

function normalizeText(value) {
  const base = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/°/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const phrase = PHRASE_SYNONYMS.get(base);
  const text = phrase ?? base;
  return text
    .split(' ')
    .filter((token) => token && !STOP_WORDS.has(token))
    .map((token) => (token.endsWith('s') && token.length > 4 ? token.slice(0, -1) : token))
    .join(' ');
}

function tokenSet(...values) {
  const tokens = new Set();
  for (const value of values) {
    normalizeText(value)
      .split(' ')
      .filter(Boolean)
      .forEach((token) => tokens.add(token));
  }
  return tokens;
}

function intersects(a, b) {
  for (const item of a) if (b.has(item)) return true;
  return false;
}

function detectEquipment(...values) {
  const text = normalizeText(values.filter(Boolean).join(' '));
  const found = new Set();
  for (const [tag, patterns] of EQUIPMENT_PATTERNS) {
    if (patterns.some((pattern) => text.includes(normalizeText(pattern)))) found.add(tag);
  }
  return found;
}

function detectDiscriminator(kind, ...values) {
  const text = normalizeText(values.filter(Boolean).join(' '));
  const found = new Set();
  for (const [tag, patterns] of DISCRIMINATORS[kind]) {
    if (patterns.some((pattern) => text.includes(normalizeText(pattern)))) found.add(tag);
  }
  return found;
}

function detectPattern(...values) {
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

function canonicalMuscle(value) {
  return MUSCLE_MAP.get(normalizeText(value)) ?? normalizeText(value);
}

function safeJson(value) {
  return JSON.stringify(value ?? null).replace(/[\r\n]+/g, ' ');
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function writeCsv(file, rows, columns) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((column) => csvEscape(row[column])).join(','));
  await fs.writeFile(path.join(REPORT_DIR, file), `${lines.join('\n')}\n`, 'utf8');
}

async function fetchJson(url, apiKey, { retries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, { headers: { 'X-API-Key': apiKey }, signal: controller.signal });
      clearTimeout(timeout);
      if (response.status === 429 && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(`YMOVE_HTTP_${response.status}`);
        err.status = response.status;
        err.body = body;
        throw err;
      }
      return body;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt >= retries || error.status === 401 || error.status === 403 || error.status === 404) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

function getConfiguredSecretName() {
  for (const name of PUBLIC_SECRET_NAMES) {
    if (process.env[name]) return { blocker: 'SECURITY_BLOCKER', name };
  }
  for (const name of SECRET_NAMES) {
    if (process.env[name]) return { name, value: process.env[name] };
  }
  return { blocker: 'MISSING_SECRET', name: 'YMOVE_API_KEY' };
}

function extractTopLevelCalls(source, functionName) {
  const calls = [];
  let index = 0;
  const needle = `${functionName}(`;
  while ((index = source.indexOf(needle, index)) !== -1) {
    let pos = index + needle.length;
    let depth = 1;
    let quote = null;
    let escaped = false;
    const start = pos;
    for (; pos < source.length; pos += 1) {
      const ch = source[pos];
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '\'' || ch === '"' || ch === '`') quote = ch;
      else if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
      if (depth === 0) break;
    }
    calls.push(source.slice(start, pos));
    index = pos + 1;
  }
  return calls;
}

function splitTopLevelArgs(text) {
  const args = [];
  let current = '';
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (const ch of text) {
    if (quote) {
      current += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function unquote(value) {
  const trimmed = String(value ?? '').trim();
  const match = trimmed.match(/^['"`]([\s\S]*)['"`]$/);
  if (!match) return trimmed;
  return match[1].replace(/\\'/g, '\'').replace(/\\"/g, '"');
}

function parseObjectString(text) {
  const out = {};
  if (!text || !text.trim().startsWith('{')) return out;
  for (const field of ['name', 'nameEn', 'primaryMuscleGroup', 'exerciseType']) {
    const match = text.match(new RegExp(`${field}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`));
    if (match) out[field] = match[1];
  }
  const aliasMatch = text.match(/aliases\s*:\s*\[([^\]]*)\]/);
  if (aliasMatch) out.aliases = [...aliasMatch[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
  const secondaryMatch = text.match(/secondaryMuscleGroups\s*:\s*\[([^\]]*)\]/);
  if (secondaryMatch) out.secondaryMuscleGroups = [...secondaryMatch[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
  const primaryMusclesMatch = text.match(/primaryMuscles\s*:\s*\[([^\]]*)\]/);
  if (primaryMusclesMatch) out.primaryMuscles = [...primaryMusclesMatch[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
  const secondaryMusclesMatch = text.match(/secondaryMuscles\s*:\s*\[([^\]]*)\]/);
  if (secondaryMusclesMatch) out.secondaryMuscles = [...secondaryMusclesMatch[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
  return out;
}

async function loadFitCoachExercises() {
  const source = await fs.readFile(path.resolve('mobile/src/data/exercise-library.ts'), 'utf8');
  const items = [];
  for (const call of extractTopLevelCalls(source, 'seed')) {
    const args = splitTopLevelArgs(call);
    if (args.length < 8) continue;
    if (args[0].includes('id:')) continue;
    const options = parseObjectString(args[8] ?? '{}');
    items.push({
      id: unquote(args[0]),
      name: options.name ?? unquote(args[1]),
      nameEn: options.nameEn ?? null,
      muscleGroup: unquote(args[2]),
      primaryMuscleGroup: options.primaryMuscleGroup ?? null,
      secondaryMuscleGroups: options.secondaryMuscleGroups ?? [],
      primaryMuscles: options.primaryMuscles ?? [],
      secondaryMuscles: options.secondaryMuscles ?? [],
      difficulty: unquote(args[5]),
      equipment: unquote(args[6]),
      exerciseType: options.exerciseType ?? null,
      aliases: options.aliases ?? [],
      source: 'exercise-library',
    });
  }
  for (const call of extractTopLevelCalls(source, 'catalogSeed')) {
    const args = splitTopLevelArgs(call);
    if (args.length < 7) continue;
    const options = parseObjectString(args[7] ?? '{}');
    items.push({
      id: unquote(args[0]),
      name: options.name ?? unquote(args[1]),
      nameEn: options.nameEn ?? null,
      muscleGroup: unquote(args[2]),
      primaryMuscleGroup: options.primaryMuscleGroup ?? unquote(args[2]),
      secondaryMuscleGroups: options.secondaryMuscleGroups ?? [],
      primaryMuscles: options.primaryMuscles ?? [],
      secondaryMuscles: options.secondaryMuscles ?? [],
      difficulty: unquote(args[5]),
      equipment: unquote(args[6]),
      exerciseType: options.exerciseType ?? null,
      aliases: options.aliases ?? [],
      source: 'exercise-library',
    });
  }
  const byId = new Map();
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function sanitizeYmoveExercise(raw) {
  return {
    id: raw.id,
    title: raw.title ?? raw.name ?? null,
    normalizedTitle: normalizeText(raw.title ?? raw.name ?? ''),
    slug: raw.slug ?? null,
    description: raw.description ?? null,
    instructions: Array.isArray(raw.instructions) ? raw.instructions : null,
    importantPoints: Array.isArray(raw.importantPoints) ? raw.importantPoints : null,
    primaryMuscles: raw.muscleGroup ? [raw.muscleGroup] : [],
    secondaryMuscles: Array.isArray(raw.secondaryMuscles) ? raw.secondaryMuscles : [],
    muscleGroups: [raw.muscleGroup, ...(Array.isArray(raw.secondaryMuscles) ? raw.secondaryMuscles : [])].filter(Boolean),
    equipment: raw.equipment ?? null,
    exerciseTypes: Array.isArray(raw.exerciseType) ? raw.exerciseType : [],
    difficulty: raw.difficulty ?? null,
    category: raw.category ?? null,
    hasVideo: raw.hasVideo === true,
    hasVideoWhite: raw.hasVideoWhite === true,
    hasVideoGym: raw.hasVideoGym === true,
    sourcePayload: {
      id: raw.id,
      title: raw.title ?? raw.name ?? null,
      slug: raw.slug ?? null,
      muscleGroup: raw.muscleGroup ?? null,
      secondaryMuscles: Array.isArray(raw.secondaryMuscles) ? raw.secondaryMuscles : null,
      equipment: raw.equipment ?? null,
      category: raw.category ?? null,
      difficulty: raw.difficulty ?? null,
      exerciseType: Array.isArray(raw.exerciseType) ? raw.exerciseType : null,
      hasVideo: raw.hasVideo === true,
      hasVideoWhite: raw.hasVideoWhite === true,
      hasVideoGym: raw.hasVideoGym === true,
    },
  };
}

async function fetchOpenApi() {
  const response = await fetch(OPENAPI_URL);
  if (!response.ok) throw new Error(`OPENAPI_HTTP_${response.status}`);
  return response.json();
}

async function fetchUsage(apiKey) {
  const body = await fetchJson(`${YMOVE_BASE_URL}/usage`, apiKey);
  return body.data ?? body;
}

async function fetchCatalog(apiKey) {
  const pages = [];
  const exercises = [];
  let total = null;
  let totalPages = null;
  for (let page = 1; ; page += 1) {
    const url = `${YMOVE_BASE_URL}/exercises?page=${page}&pageSize=${PAGE_SIZE}&includeVideos=false`;
    const body = await fetchJson(url, apiKey);
    const items = Array.isArray(body.data) ? body.data : Array.isArray(body.exercises) ? body.exercises : [];
    const pagination = body.pagination ?? body.meta?.pagination ?? {};
    total = Number.isInteger(pagination.total) ? pagination.total : total;
    totalPages = Number.isInteger(pagination.totalPages) ? pagination.totalPages : totalPages;
    const warning = body._warning ?? body.warning ?? null;
    const notice = body._notice ?? body.notice ?? null;
    pages.push({ page, count: items.length, total, totalPages, warning, notice });
    exercises.push(...items.map(sanitizeYmoveExercise));
    if (totalPages && page >= totalPages) break;
    if (!totalPages && items.length < PAGE_SIZE) break;
    if (page > 1000) throw new Error('PAGINATION_GUARD_TRIGGERED');
  }
  const unique = new Map();
  for (const exercise of exercises) unique.set(exercise.id, exercise);
  return { exercises: [...unique.values()], pages, total };
}

function featureBundle(item, isYmove = false) {
  const names = isYmove ? [item.title, item.slug] : [item.name, item.nameEn, ...(item.aliases ?? [])];
  const muscles = isYmove
    ? [item.primaryMuscles?.[0], ...(item.secondaryMuscles ?? []), ...(item.muscleGroups ?? [])]
    : [item.primaryMuscleGroup, item.muscleGroup, ...(item.secondaryMuscleGroups ?? []), ...(item.primaryMuscles ?? []), ...(item.secondaryMuscles ?? [])];
  return {
    text: normalizeText(names.filter(Boolean).join(' ')),
    tokens: tokenSet(...names),
    muscleTokens: tokenSet(...muscles.map(canonicalMuscle)),
    equipment: detectEquipment(...names, item.equipment),
    pattern: detectPattern(...names, item.equipment, item.exerciseType, item.category),
    angle: detectDiscriminator('angle', ...names, item.equipment),
    position: detectDiscriminator('position', ...names, item.equipment, item.description),
    laterality: detectDiscriminator('laterality', ...names, item.equipment),
    grip: detectDiscriminator('grip', ...names, item.equipment),
    difficulty: normalizeText(item.difficulty),
  };
}

function contradiction(label, fitValues, ymoveValues) {
  if (fitValues.size === 0 || ymoveValues.size === 0) return null;
  return intersects(fitValues, ymoveValues) ? null : label;
}

function scoreCandidate(fit, ymove) {
  const f = featureBundle(fit, false);
  const y = featureBundle(ymove, true);
  const positives = [];
  const contradictions = [];
  let score = 0;

  if (f.text && y.text && f.text === y.text) {
    score += 38;
    positives.push('nome normalizzato esatto');
  } else if (intersects(f.tokens, y.tokens)) {
    const shared = [...f.tokens].filter((token) => y.tokens.has(token)).length;
    score += Math.min(26, shared * 6);
    positives.push(`token nome condivisi: ${shared}`);
  }

  const muscleShared = intersects(f.muscleTokens, y.muscleTokens);
  if (muscleShared) {
    score += 18;
    positives.push('muscolo/gruppo coerente');
  } else if (f.muscleTokens.size && y.muscleTokens.size) {
    contradictions.push('muscolo primario/gruppo diverso');
    score -= 20;
  }

  if (intersects(f.equipment, y.equipment)) {
    score += 16;
    positives.push('attrezzatura coerente');
  } else if (f.equipment.size && y.equipment.size) {
    contradictions.push('attrezzatura diversa');
    score -= 28;
  }

  if (f.pattern && y.pattern && f.pattern === y.pattern) {
    score += 14;
    positives.push(`pattern coerente: ${f.pattern}`);
  } else if (f.pattern && y.pattern) {
    contradictions.push('pattern motorio incompatibile');
    score -= 24;
  }

  for (const [label, left, right, points] of [
    ['angolo diverso', f.angle, y.angle, 8],
    ['posizione diversa', f.position, y.position, 6],
    ['unilateralita diversa', f.laterality, y.laterality, 6],
    ['presa diversa', f.grip, y.grip, 5],
  ]) {
    const problem = contradiction(label, left, right);
    if (problem) {
      contradictions.push(problem);
      score -= points * 2;
    } else if (left.size && right.size) {
      score += points;
      positives.push(label.replace('diverso', 'coerente'));
    }
  }

  if (f.difficulty && y.difficulty && f.difficulty === y.difficulty) {
    score += 4;
    positives.push('livello coerente');
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    positives,
    contradictions: [...new Set(contradictions)],
    features: { fit: f, ymove: y },
  };
}

function classifyMatches(fitExercises, ymoveExercises) {
  const duplicatesByName = new Map();
  for (const exercise of fitExercises) {
    const key = normalizeText(exercise.name);
    duplicatesByName.set(key, [...(duplicatesByName.get(key) ?? []), exercise.id]);
  }

  const rows = [];
  const linksByYmove = new Map();
  for (const fit of fitExercises) {
    const candidates = ymoveExercises
      .map((ymove) => ({ ymove, ...scoreCandidate(fit, ymove) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const best = candidates[0] ?? null;
    const second = candidates[1] ?? null;
    const duplicateName = (duplicatesByName.get(normalizeText(fit.name)) ?? []).length > 1;
    let status = 'UNMATCHED';
    let method = 'strict_scoring';
    let confidence = 0;
    if (best) {
      const gap = best.score - (second?.score ?? 0);
      if (duplicateName) {
        status = 'DUPLICATE_OR_CONFLICT';
        method = 'fitcoach_duplicate_name';
      } else if (best.score >= AUTO_MATCH_THRESHOLD && gap >= MIN_AUTO_GAP && best.contradictions.length === 0) {
        status = 'AUTO_MATCH';
      } else if (best.score >= REVIEW_THRESHOLD) {
        status = 'REVIEW_REQUIRED';
      }
      confidence = best.score;
    }
    const row = {
      fitcoach_id: fit.id,
      fitcoach_name: fit.name,
      fitcoach_normalized_name: normalizeText(fit.name),
      ymove_id_candidate: best?.ymove.id ?? '',
      ymove_title: best?.ymove.title ?? '',
      score: best?.score ?? 0,
      status,
      method,
      confidence,
      positive_reasons: best?.positives.join(' | ') ?? '',
      contradictions: best?.contradictions.join(' | ') ?? '',
      second_candidate: second ? `${second.ymove.title} (${second.score})` : '',
      top_candidates: safeJson(candidates.map((candidate) => ({
        id: candidate.ymove.id,
        title: candidate.ymove.title,
        score: candidate.score,
        contradictions: candidate.contradictions,
      }))),
      algorithm_version: ALGORITHM_VERSION,
    };
    rows.push(row);
    if (status === 'AUTO_MATCH' && row.ymove_id_candidate) {
      linksByYmove.set(row.ymove_id_candidate, [...(linksByYmove.get(row.ymove_id_candidate) ?? []), row.fitcoach_id]);
    }
  }

  for (const row of rows) {
    const linked = linksByYmove.get(row.ymove_id_candidate) ?? [];
    if (row.status === 'AUTO_MATCH' && linked.length > 1) {
      row.status = 'DUPLICATE_OR_CONFLICT';
      row.contradictions = [row.contradictions, `stesso YMove candidato per ${linked.length} esercizi FitCoach`].filter(Boolean).join(' | ');
    }
  }
  return rows;
}

function coverage(rows, fitExercises, field) {
  const out = {};
  for (const exercise of fitExercises) {
    const key = exercise[field] || 'non_specificato';
    const row = rows.find((item) => item.fitcoach_id === exercise.id);
    out[key] ??= { total: 0, AUTO_MATCH: 0, REVIEW_REQUIRED: 0, UNMATCHED: 0, DUPLICATE_OR_CONFLICT: 0 };
    out[key].total += 1;
    out[key][row?.status ?? 'UNMATCHED'] += 1;
  }
  return out;
}

async function main() {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const secret = getConfiguredSecretName();
  const fitExercises = await loadFitCoachExercises();
  const openapi = await fetchOpenApi();

  if (secret.blocker) {
    const summary = {
      status: secret.blocker,
      message:
        secret.blocker === 'SECURITY_BLOCKER'
          ? `Variabile pubblica vietata rilevata: ${secret.name}. Spostare la chiave in un secret server-side YMOVE_API_KEY.`
          : 'YMOVE_API_KEY non disponibile nell ambiente locale. La chiave remota Supabase non e leggibile dalla CLI: eseguire questo script in un ambiente server con il secret impostato.',
      apiKeyValuePrinted: false,
      openapi: {
        title: openapi.info?.title,
        version: openapi.info?.version,
        server: openapi.servers?.[0]?.url,
        pagination: openapi.components?.schemas?.Pagination ?? null,
      },
      fitcoachExercises: fitExercises.length,
      generatedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(REPORT_DIR, 'ymove-catalog-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
    await writeCsv('ymove-exercise-matches.csv', [], [
      'fitcoach_id',
      'fitcoach_name',
      'fitcoach_normalized_name',
      'ymove_id_candidate',
      'ymove_title',
      'score',
      'status',
      'method',
      'positive_reasons',
      'contradictions',
    ]);
    await writeCsv('ymove-review-required.csv', [], ['fitcoach_id', 'fitcoach_name', 'ymove_title', 'score', 'positive_reasons', 'contradictions']);
    await writeCsv('ymove-unmatched.csv', [], ['fitcoach_id', 'fitcoach_name', 'fitcoach_normalized_name', 'note']);
    await writeCsv('ymove-conflicts.csv', [], ['fitcoach_id', 'fitcoach_name', 'ymove_title', 'score', 'contradictions']);
    console.log(JSON.stringify({ ok: false, code: secret.blocker, fitcoachExercises: fitExercises.length, apiKeyValuePrinted: false }, null, 2));
    process.exitCode = secret.blocker === 'SECURITY_BLOCKER' ? 2 : 1;
    return;
  }

  const usageBefore = await fetchUsage(secret.value);
  const catalog = await fetchCatalog(secret.value);
  const rows = classifyMatches(fitExercises, catalog.exercises);
  const usageAfter = await fetchUsage(secret.value);

  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  const summary = {
    status: 'DRY_RUN_COMPLETE',
    apiKeyVariable: secret.name,
    apiKeyValuePrinted: false,
    openapi: {
      title: openapi.info?.title,
      version: openapi.info?.version,
      server: openapi.servers?.[0]?.url,
      pagination: openapi.components?.schemas?.Pagination,
      exerciseFields: Object.keys(openapi.components?.schemas?.Exercise?.properties ?? {}),
    },
    usageBefore,
    usageAfter,
    fitcoachExerciseCount: fitExercises.length,
    ymoveExerciseCount: catalog.exercises.length,
    ymoveDeclaredTotal: catalog.total,
    pages: catalog.pages,
    pagesVisited: catalog.pages.length,
    notAnalyzedFitcoachExercises: fitExercises.length - rows.length,
    counts,
    scoreDistribution: rows.reduce((acc, row) => {
      const bucket = `${Math.floor(Number(row.score) / 10) * 10}-${Math.floor(Number(row.score) / 10) * 10 + 9}`;
      acc[bucket] = (acc[bucket] ?? 0) + 1;
      return acc;
    }, {}),
    coverageByMuscleGroup: coverage(rows, fitExercises, 'primaryMuscleGroup'),
    coverageByEquipment: coverage(rows, fitExercises, 'equipment'),
    algorithm: {
      version: ALGORITHM_VERSION,
      autoMatchThreshold: AUTO_MATCH_THRESHOLD,
      reviewThreshold: REVIEW_THRESHOLD,
      minAutoGap: MIN_AUTO_GAP,
    },
    generatedAt: new Date().toISOString(),
  };

  await fs.writeFile(path.join(REPORT_DIR, 'ymove-catalog-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  const columns = [
    'fitcoach_id',
    'fitcoach_name',
    'fitcoach_normalized_name',
    'ymove_id_candidate',
    'ymove_title',
    'score',
    'status',
    'method',
    'confidence',
    'positive_reasons',
    'contradictions',
    'second_candidate',
    'top_candidates',
    'algorithm_version',
  ];
  await writeCsv('ymove-exercise-matches.csv', rows, columns);
  await writeCsv('ymove-review-required.csv', rows.filter((row) => row.status === 'REVIEW_REQUIRED'), columns);
  await writeCsv('ymove-unmatched.csv', rows.filter((row) => row.status === 'UNMATCHED'), columns);
  await writeCsv('ymove-conflicts.csv', rows.filter((row) => row.status === 'DUPLICATE_OR_CONFLICT'), columns);
  console.log(JSON.stringify({ ok: true, counts, fitcoachExercises: fitExercises.length, ymoveExercises: catalog.exercises.length }, null, 2));
}

main().catch(async (error) => {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(path.join(REPORT_DIR, 'ymove-catalog-summary.json'), JSON.stringify({
    status: 'ERROR',
    message: error instanceof Error ? error.message : String(error),
    apiKeyValuePrinted: false,
    generatedAt: new Date().toISOString(),
  }, null, 2), 'utf8');
  console.error(JSON.stringify({ ok: false, code: 'SYNC_FAILED', message: error instanceof Error ? error.message : String(error), apiKeyValuePrinted: false }, null, 2));
  process.exitCode = 1;
});
