import fs from 'node:fs';
import path from 'node:path';

const inputPath = path.resolve('reports/ymove/input/ymove-exercise-names-corrected.csv');
const catalogPath = path.resolve('reports/ymove/output/ymove-catalog-simple.csv');
const outputDir = path.resolve('reports/ymove/output');
const validatedPath = path.join(outputDir, 'ymove-exercise-names-validated.csv');
const reviewPath = path.join(outputDir, 'ymove-exercise-names-review.csv');
const summaryPath = path.join(outputDir, 'ymove-exercise-names-validation-summary.json');

const allowedEnglishTerms = [
  'plank', 'hip thrust', 'push press', 'military press', 'overhead press', 'face pull',
  'leg press', 'hack squat', 'bear crawl', 'bear plank', 'bird dog', 'step-up',
  'step up', 'thruster', 'wrist curl', 'skull crusher', 'bench dip', 'bench dips',
  'mountain climber', 'mountain climbers', 'push-up', 'push up', 'burpee', 'burpees',
  'jumping jack', 'jumping jacks', 'v-up', 'l-sit', 'toes to bar', 'arnold press',
  'body builder', 'a-skip',
];

const genericNames = new Set([
  'push-up', 'push up', 'squat', 'curl', 'cavo', 'plancia', 'salto', 'affondo',
  'ponte', 'allungamento', 'rematore', 'panca', 'press', 'dip', 'stretch',
]);

const badExact = [
  'manubrio manubrio', 'bilanciere bilanciere', 'cavo cavo', 'kettlebell kettlebell',
  'machine machine', 'in piedi manubrio manubrio', 'manubrio inclinato manubrio',
];

const equipmentTokens = [
  ['barbell', 'bilanciere'],
  ['dumbbell', 'manubr'],
  ['cable', 'cavo'],
  ['kettlebell', 'kettlebell'],
  ['machine', 'macchina'],
  ['smith', 'smith'],
  ['bench', 'panca'],
  ['band', 'elastic'],
  ['resistance band', 'elastic'],
  ['rope', 'corda'],
  ['bodyweight', 'corpo libero'],
  ['ball', 'fitball'],
];

const movementTokens = [
  ['curl', ['curl']],
  ['row', ['rematore', 'tirata']],
  ['press', ['press', 'spinta', 'lento', 'panca']],
  ['fly', ['croci', 'fly']],
  ['deadlift', ['stacco']],
  ['squat', ['squat']],
  ['lunge', ['affond']],
  ['plank', ['plank']],
  ['bridge', ['ponte', 'bridge']],
  ['dip', ['dip', 'piegamenti']],
  ['extension', ['estension']],
  ['raise', ['alzate', 'sollevament']],
  ['pulldown', ['pulldown', 'lat machine', 'tirate']],
  ['push up', ['push-up', 'push up', 'piegamenti']],
  ['sit-up', ['sit-up', 'sit up']],
  ['crunch', ['crunch']],
  ['jump', ['salto', 'balzo']],
  ['stretch', ['stretch', 'allungamento']],
  ['rollout', ['rollout']],
  ['wall sit', ['seduta', 'wall sit']],
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  const header = (rows.shift() ?? []).map((h) => h.replace(/^\uFEFF/, '').trim());
  return rows.filter((r) => r.some((v) => v !== '')).map((values) => Object.fromEntries(header.map((h, i) => [h, values[i] ?? ''])));
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, rows, columns) {
  const content = [
    columns.join(','),
    ...rows.map((row) => columns.map((c) => csvEscape(row[c])).join(',')),
  ].join('\n');
  fs.writeFileSync(filePath, `${content}\n`, 'utf8');
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function titleWords(value) {
  return normalize(value).split(' ').filter(Boolean);
}

function detectFeatures(title, catalog = {}) {
  const n = normalize(title);
  const words = titleWords(title);
  const feature = {
    equipment: [],
    movement: [],
    position: [],
    grip: [],
    angle: [],
    unilateral: [],
    direction: [],
    variant: [],
    category: [],
  };
  for (const [en] of equipmentTokens) {
    if (n.includes(en)) feature.equipment.push(en);
  }
  for (const [movement] of movementTokens) {
    if (n.includes(movement)) feature.movement.push(movement);
  }
  if (n.includes('bent over')) feature.position.push('bent over');
  if (n.includes('on knees') || n.includes('kneeling')) feature.position.push('kneeling');
  if (n.includes('standing')) feature.position.push('standing');
  if (n.includes('seated') || n.includes('sit ')) feature.position.push('seated');
  if (n.includes('lying') || n.includes('supine')) feature.position.push('lying');
  if (n.includes('incline')) feature.angle.push('incline');
  if (n.includes('decline')) feature.angle.push('decline');
  if (n.includes('flat')) feature.angle.push('flat');
  if (n.includes('low to high')) feature.direction.push('low to high');
  if (n.includes('high to low')) feature.direction.push('high to low');
  if (n.includes('behind the neck') || n.includes('behind the head')) feature.position.push('behind neck/head');
  if (n.includes('underhand')) feature.grip.push('underhand');
  if (n.includes('overhand')) feature.grip.push('overhand');
  if (n.includes('neutral')) feature.grip.push('neutral');
  if (n.includes('wide grip')) feature.grip.push('wide');
  if (n.includes('close grip')) feature.grip.push('close');
  if (n.includes('one arm') || n.includes('one-arm') || n.includes('single arm')) feature.unilateral.push('one arm');
  if (n.includes('one leg') || n.includes('1 leg') || n.includes('single leg')) feature.unilateral.push('one leg');
  if (n.includes('alternating')) feature.variant.push('alternating');
  if (n.includes('arnold')) feature.variant.push('arnold');
  if (n.includes('romanian')) feature.variant.push('romanian');
  if (n.includes('sumo')) feature.variant.push('sumo');
  if (n.includes('bear')) feature.variant.push('bear');
  if (n.includes('yoga') || n.includes('pose')) feature.category.push('mobility/yoga');
  if (n.includes('drill')) feature.category.push('drill');
  for (const eq of splitPipe(catalog.equipment)) {
    if (eq && !feature.equipment.includes(eq)) feature.equipment.push(eq);
  }
  return feature;
}

function splitPipe(value) {
  return String(value ?? '').split('|').map((v) => normalize(v)).filter(Boolean);
}

function containsAllowedEnglishOnly(name) {
  const n = normalize(name);
  return allowedEnglishTerms.some((term) => {
    const t = normalize(term);
    return new RegExp(`(^| )${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(n);
  });
}

function isSameAsEnglish(name, title) {
  return normalize(name) === normalize(title);
}

function hasDuplicateWords(name) {
  const words = titleWords(name);
  for (let i = 1; i < words.length; i += 1) {
    if (words[i] === words[i - 1] && words[i].length > 2) return true;
  }
  return false;
}

function repeatedEquipmentOnly(name) {
  const n = normalize(name);
  if (badExact.includes(n)) return true;
  const words = titleWords(name);
  if (words.length <= 3) {
    const equip = ['bilanciere', 'manubrio', 'manubri', 'cavo', 'kettlebell', 'machine', 'macchina'];
    const e = words.filter((w) => equip.includes(w));
    return e.length >= 2 && e.length === words.length;
  }
  return false;
}

function hasMovement(name) {
  const n = normalize(name);
  return movementTokens.some(([, its]) => its.some((it) => n.includes(normalize(it)))) || containsAllowedEnglishOnly(name);
}

function featurePreserved(name, feature) {
  const n = normalize(name);
  const missing = [];
  const checks = [
    ['barbell', ['bilanciere']],
    ['dumbbell', ['manubri', 'manubrio']],
    ['cable', ['cavo', 'cavi']],
    ['kettlebell', ['kettlebell']],
    ['machine', ['macchina', 'machine']],
    ['bench', ['panca', 'bench']],
    ['band', ['elastico', 'banda', 'band']],
    ['rope', ['corda']],
  ];
  for (const [en, it] of checks) {
    if (feature.equipment.includes(en) && !it.some((v) => n.includes(v))) missing.push(en);
  }
  const detailChecks = [
    ['bent over', ['busto flesso', 'bent over']],
    ['kneeling', ['ginocchio', 'ginocchia', 'kneeling']],
    ['incline', ['inclinata', 'inclinato', 'incline']],
    ['decline', ['declinata', 'declinato', 'decline']],
    ['flat', ['piana', 'orizzontale', 'flat']],
    ['low to high', ['basso verso l alto', 'dal basso verso l alto', 'low to high']],
    ['high to low', ['alto verso il basso', 'dall alto verso il basso', 'high to low']],
    ['underhand', ['supina', 'underhand']],
    ['overhand', ['prona', 'overhand']],
    ['wide', ['larga', 'wide']],
    ['close', ['stretta', 'close']],
    ['one arm', ['un braccio', 'monolaterale', 'one arm']],
    ['one leg', ['monopodal', 'una gamba', 'one leg']],
    ['romanian', ['rumeno', 'romanian']],
    ['sumo', ['sumo']],
    ['arnold', ['arnold']],
  ];
  for (const [en, it] of detailChecks) {
    const present = Object.values(feature).some((arr) => Array.isArray(arr) && arr.includes(en));
    if (present && !it.some((v) => n.includes(normalize(v)))) missing.push(en);
  }
  return missing;
}

function validateItalianExerciseName(name, title, catalog) {
  const rejection = [];
  const missing = [];
  const clean = String(name ?? '').trim();
  if (!clean) {
    return { valid: false, quality_score: 0, rejection_reasons: ['empty_name'], missing_technical_details: [], language_status: 'missing' };
  }
  const n = normalize(clean);
  const titleNorm = normalize(title);
  const feature = detectFeatures(title, catalog);
  if (badExact.includes(n) || repeatedEquipmentOnly(clean)) rejection.push('repeated_or_equipment_only');
  if (hasDuplicateWords(clean)) rejection.push('consecutive_duplicate_words');
  if (!hasMovement(clean)) rejection.push('missing_main_movement');
  if (genericNames.has(n) && Object.values(feature).some((arr) => Array.isArray(arr) && arr.length > 0)) rejection.push('too_generic_for_detailed_title');
  if (isSameAsEnglish(clean, title) && !containsAllowedEnglishOnly(clean)) rejection.push('copied_english_title');
  if (/^(con|alla|al|ai|con il|con la)\b/i.test(clean)) rejection.push('word_by_word_prefix');
  const featureMissing = featurePreserved(clean, feature);
  missing.push(...featureMissing);
  if (featureMissing.length > 0) rejection.push('lost_technical_details');
  if (n === titleNorm && containsAllowedEnglishOnly(clean) && featureMissing.length === 0) {
    // Allowed but not excellent: common borrowed term.
  }
  let score = 92;
  score -= rejection.length * 24;
  score -= missing.length * 8;
  if (String(clean).length < 5) score -= 20;
  if (String(clean).length > 90) score -= 8;
  if (containsAllowedEnglishOnly(clean)) score += 4;
  if (clean !== name) score -= 2;
  score = Math.max(0, Math.min(100, score));
  let language_status = 'italian';
  if (isSameAsEnglish(clean, title)) language_status = containsAllowedEnglishOnly(clean) ? 'accepted_loan_term' : 'english_copy';
  else if (/[a-z]/i.test(clean) && containsAllowedEnglishOnly(clean)) language_status = 'mixed_accepted_terms';
  return { valid: rejection.length === 0 && score >= 70, quality_score: score, rejection_reasons: rejection, missing_technical_details: [...new Set(missing)], language_status };
}

function correctedNameFromTitle(title) {
  const n = normalize(title);
  const t = title.trim();
  const rules = [
    [/^barbell curls?$/, 'Curl con bilanciere'],
    [/^barbell rows?$/, 'Rematore con bilanciere'],
    [/^cable bicep curl bar$/, 'Curl bicipiti al cavo con barra'],
    [/^cable fly low to high$/, 'Croci ai cavi dal basso verso l’alto'],
    [/^dumbbell arnold press$/, 'Arnold press con manubri'],
    [/^bent over barbell row underhand grip$/, 'Rematore con bilanciere a busto flesso con presa supina'],
    [/^bent over barbell row overhand grip$/, 'Rematore con bilanciere a busto flesso con presa prona'],
    [/^chest press machine flat$/, 'Chest press orizzontale alla macchina'],
    [/^deadlift with kettlebell$/, 'Stacco da terra con kettlebell'],
    [/^archer push up$/, 'Push-up arciere'],
    [/^barbell ab rollout on knees$/, 'Ab rollout in ginocchio con bilanciere'],
    [/^barbell ab rollout$/, 'Ab rollout con bilanciere'],
    [/^archer push up$/, 'Push-up arciere'],
    [/^wall sits?$/, 'Seduta al muro'],
    [/^step ups?$/, 'Step-up'],
    [/^step ups bodyweight$/, 'Step-up a corpo libero'],
    [/^step up no equipment$/, 'Step-up a corpo libero'],
    [/^reverse step up$/, 'Step-up inverso'],
    [/^push up wide$/, 'Push-up presa larga'],
    [/^plyo push up$/, 'Push-up pliometrico'],
    [/^barbell bench press$/, 'Panca piana con bilanciere'],
    [/^barbell romanian deadlift$/, 'Stacco rumeno con bilanciere'],
    [/^barbell hip thrust$/, 'Hip thrust con bilanciere'],
    [/^barbell wrist curl$/, 'Curl dei polsi con bilanciere'],
    [/^barbell walking lunges$/, 'Affondi camminati con bilanciere'],
    [/^barbell thruster straight bar thruster$/, 'Thruster con bilanciere'],
    [/^barbell shoulder press barbell overhead press barbell military press$/, 'Lento avanti con bilanciere'],
    [/^bench dips?$/, 'Dip su panca'],
    [/^lat pulldown$/, 'Lat machine avanti'],
    [/^wide grip lat pulldown$/, 'Lat machine presa larga'],
    [/^underhand lat pulldown$/, 'Lat machine presa supina'],
    [/^leg press$/, 'Leg press'],
    [/^leg extension$/, 'Leg extension'],
    [/^hamstring curl$/, 'Leg curl'],
    [/^romanian deadlift$/, 'Stacco rumeno'],
    [/^burpee(s)?$/, 'Burpees'],
    [/^front plank$/, 'Plank frontale'],
    [/^plank$/, 'Plank'],
  ];
  for (const [regex, value] of rules) {
    if (regex.test(n)) return value;
  }
  if (n.includes('dumbbell') && n.includes('arnold') && n.includes('press')) return 'Arnold press con manubri';
  if (n.includes('dumbbell') && n.includes('bench press') && n.includes('incline')) return 'Panca inclinata con manubri';
  if (n.includes('dumbbell') && n.includes('bench press')) return 'Panca con manubri';
  if (n.includes('barbell') && n.includes('bench press') && n.includes('incline')) return 'Panca inclinata con bilanciere';
  if (n.includes('barbell') && n.includes('bench press') && n.includes('decline')) return 'Panca declinata con bilanciere';
  if (n.includes('cable') && n.includes('curl')) return n.includes('bar') ? 'Curl al cavo con barra' : 'Curl al cavo';
  if (n.includes('dumbbell') && n.includes('curl')) return 'Curl con manubri';
  if (n.includes('barbell') && n.includes('curl')) return 'Curl con bilanciere';
  if (n.includes('cable') && n.includes('fly')) {
    if (n.includes('low to high')) return 'Croci ai cavi dal basso verso l’alto';
    if (n.includes('high to low')) return 'Croci ai cavi dall’alto verso il basso';
    return 'Croci ai cavi';
  }
  if (n.includes('dumbbell') && n.includes('row')) return n.includes('one arm') ? 'Rematore con manubrio a un braccio' : 'Rematore con manubri';
  if (n.includes('barbell') && n.includes('row')) return 'Rematore con bilanciere';
  if (n.includes('cable') && n.includes('row')) return 'Rematore al cavo';
  if (n.includes('machine') && n.includes('chest press')) return n.includes('flat') ? 'Chest press orizzontale alla macchina' : 'Chest press alla macchina';
  if (n.includes('kettlebell') && n.includes('deadlift')) return 'Stacco da terra con kettlebell';
  if (n.includes('bear plank') && n.includes('shoulder tap')) return 'Bear plank con shoulder tap';
  if (n.includes('bear crawl')) return 'Bear crawl';
  if (n.includes('bird dog')) return 'Bird dog';
  if (n.includes('mountain climber')) return 'Mountain climber';
  if (n.includes('push up') || n.includes('pushup')) {
    if (n.includes('archer')) return 'Push-up arciere';
    if (n.includes('wall')) return 'Push-up al muro';
    return '';
  }
  if (n.includes('squat')) {
    if (n.includes('barbell') && n.includes('sumo')) return 'Sumo squat con bilanciere';
    if (n.includes('bodyweight')) return 'Squat a corpo libero';
    if (n.includes('band')) return 'Squat con elastico';
    return '';
  }
  if (n.includes('lunge')) {
    if (n.includes('walking') && n.includes('barbell')) return 'Affondi camminati con bilanciere';
    if (n.includes('walking')) return 'Affondi camminati';
    if (n.includes('backward') || n.includes('reverse')) return 'Affondi indietro';
    if (n.includes('barbell')) return 'Affondi con bilanciere';
    return '';
  }
  return '';
}

function selectName(row, catalog) {
  const title = row.ymove_title || catalog.title || '';
  const candidates = [
    ['approved_italian_name', row.approved_italian_name],
    ['researched_italian_name', row.researched_italian_name],
    ['intelligent_italian_name', row.intelligent_italian_name],
    ['final_italian_name', row.final_italian_name],
    ['generated_rule', correctedNameFromTitle(title)],
  ].filter(([, value]) => String(value ?? '').trim());
  const evaluated = candidates.map(([source, value]) => ({ source, value: String(value).trim(), validation: validateItalianExerciseName(value, title, catalog) }));
  evaluated.sort((a, b) => {
    const scoreDiff = b.validation.quality_score - a.validation.quality_score;
    if (scoreDiff !== 0) return scoreDiff;
    const aEnglishCopy = isSameAsEnglish(a.value, title) ? 1 : 0;
    const bEnglishCopy = isSameAsEnglish(b.value, title) ? 1 : 0;
    if (aEnglishCopy !== bEnglishCopy) return aEnglishCopy - bEnglishCopy;
    const rank = { approved_italian_name: 0, researched_italian_name: 1, generated_rule: 2, intelligent_italian_name: 3, final_italian_name: 4, none: 9 };
    return (rank[a.source] ?? 8) - (rank[b.source] ?? 8);
  });
  const bestValid = evaluated.find((item) => item.validation.valid);
  if (bestValid) return bestValid;
  return evaluated[0] ?? { source: 'none', value: '', validation: validateItalianExerciseName('', title, catalog) };
}

function semanticStatus(row) {
  return row.semantic_review_status || row.research_status || '';
}

const inputRows = parseCsv(fs.readFileSync(inputPath, 'utf8'));
const catalogRows = parseCsv(fs.readFileSync(catalogPath, 'utf8'));
const inputById = new Map(inputRows.map((row) => [row.external_exercise_id, row]));
const catalogById = new Map(catalogRows.map((row) => [row.external_exercise_id, row]));
const missingCatalogRows = catalogRows.filter((row) => !inputById.has(row.external_exercise_id));

const allRows = catalogRows.map((catalog) => {
  const row = inputById.get(catalog.external_exercise_id) ?? {
    external_exercise_id: catalog.external_exercise_id,
    ymove_title: catalog.title,
    final_italian_name: '',
    approved_italian_name: '',
    researched_italian_name: '',
    intelligent_italian_name: correctedNameFromTitle(catalog.title),
    translation_status: 'review_required',
    source_confidence: '',
  };
  const selected = selectName(row, catalog);
  const status = semanticStatus(row);
  let validationStatus = selected.validation.valid ? 'VALIDATED' : 'TECHNICAL_REVIEW';
  if (!selected.validation.valid && (selected.validation.rejection_reasons.includes('empty_name') || selected.validation.rejection_reasons.includes('copied_english_title'))) validationStatus = 'RESEARCH_REQUIRED';
  if (status === 'EXCLUDE_EDITORIAL_DUPLICATE') validationStatus = 'DUPLICATE_EDITORIAL';
  if (status === 'CONFLICT') validationStatus = 'CONFLICT';
  const finalName = validationStatus === 'VALIDATED' || validationStatus === 'DUPLICATE_EDITORIAL' ? selected.value : '';
  return {
    external_exercise_id: catalog.external_exercise_id,
    ymove_title: row.ymove_title || catalog.title,
    final_italian_name: finalName,
    selected_source: finalName ? selected.source : '',
    quality_score: selected.validation.quality_score,
    validation_status: validationStatus,
    rejection_reasons: selected.validation.rejection_reasons.join('|'),
    missing_technical_details: selected.validation.missing_technical_details.join('|'),
    approved_italian_name: row.approved_italian_name ?? '',
    researched_italian_name: row.researched_italian_name ?? '',
    intelligent_italian_name: row.intelligent_italian_name ?? '',
    translation_status: row.translation_status ?? 'review_required',
    source_confidence: row.source_confidence ?? '',
    _selected_attempt: selected.value,
    _language_status: selected.validation.language_status,
  };
});

const reviewRows = allRows
  .filter((row) => row.validation_status !== 'VALIDATED' && row.validation_status !== 'DUPLICATE_EDITORIAL')
  .map((row) => ({
    external_exercise_id: row.external_exercise_id,
    ymove_title: row.ymove_title,
    nome_proposto: row._selected_attempt,
    problema: row.rejection_reasons || row.validation_status,
    dati_mancanti: row.missing_technical_details,
    azione_richiesta: row.validation_status === 'RESEARCH_REQUIRED' ? 'Ricerca nome italiano e fingerprint tecnico' : 'Revisione tecnica della variante',
  }));

const duplicateNames = new Map();
for (const row of allRows) {
  if (!row.final_italian_name) continue;
  const key = normalize(row.final_italian_name);
  if (!duplicateNames.has(key)) duplicateNames.set(key, []);
  duplicateNames.get(key).push(row.external_exercise_id);
}
const duplicateFinalNames = [...duplicateNames.entries()].filter(([, ids]) => ids.length > 1);

const outCols = [
  'external_exercise_id',
  'ymove_title',
  'final_italian_name',
  'selected_source',
  'quality_score',
  'validation_status',
  'rejection_reasons',
  'missing_technical_details',
  'approved_italian_name',
  'researched_italian_name',
  'intelligent_italian_name',
  'translation_status',
  'source_confidence',
];
writeCsv(validatedPath, allRows, outCols);
writeCsv(reviewPath, reviewRows, ['external_exercise_id', 'ymove_title', 'nome_proposto', 'problema', 'dati_mancanti', 'azione_richiesta']);

const requiredTitles = [
  'Barbell Curls',
  'Barbell Rows',
  'Cable Bicep Curl bar',
  'Cable Fly Low to High',
  'Dumbbell Arnold Press',
  'Bent Over Barbell Row Underhand Grip',
  'Chest Press Machine flat',
  'Deadlift with Kettlebell',
  'Archer push up',
  'Barbell Ab Rollout - On Knees',
];
const requiredChecks = requiredTitles.map((title) => {
  const row = allRows.find((r) => normalize(r.ymove_title) === normalize(title));
  return row ? {
    ymove_title: row.ymove_title,
    old_name: inputById.get(row.external_exercise_id)?.final_italian_name ?? '',
    new_name: row.final_italian_name,
    selected_source: row.selected_source,
    quality_score: row.quality_score,
    validation_status: row.validation_status,
    rejection_reasons: row.rejection_reasons,
    missing_technical_details: row.missing_technical_details,
  } : { ymove_title: title, missing: true };
});

const first70 = allRows.slice(0, 70).map((row) => ({
  external_exercise_id: row.external_exercise_id,
  ymove_title: row.ymove_title,
  old_name: inputById.get(row.external_exercise_id)?.final_italian_name ?? '',
  new_name: row.final_italian_name,
  quality_score: row.quality_score,
  validation_status: row.validation_status,
  rejection_reasons: row.rejection_reasons,
  missing_technical_details: row.missing_technical_details,
}));

const summary = {
  input_rows: inputRows.length,
  catalog_rows: catalogRows.length,
  output_rows: allRows.length,
  unique_output_ids: new Set(allRows.map((r) => r.external_exercise_id)).size,
  missing_from_input: missingCatalogRows.map((row) => ({
    external_exercise_id: row.external_exercise_id,
    title: row.title,
    equipment: row.equipment,
    primary_muscles: row.primary_muscles,
    movement_pattern: row.movement_pattern,
    body_position: row.body_position,
    reason: 'Presente nel catalogo staging YMove, assente dal CSV di ingresso',
  })),
  before: {
    approved_names: inputRows.filter((r) => String(r.approved_italian_name ?? '').trim()).length,
    researched_names: inputRows.filter((r) => String(r.researched_italian_name ?? '').trim()).length,
    final_equals_english: inputRows.filter((r) => normalize(r.final_italian_name) === normalize(r.ymove_title)).length,
  },
  after: {
    validated: allRows.filter((r) => r.validation_status === 'VALIDATED').length,
    duplicate_editorial: allRows.filter((r) => r.validation_status === 'DUPLICATE_EDITORIAL').length,
    research_required: allRows.filter((r) => r.validation_status === 'RESEARCH_REQUIRED').length,
    technical_review: allRows.filter((r) => r.validation_status === 'TECHNICAL_REVIEW').length,
    conflict: allRows.filter((r) => r.validation_status === 'CONFLICT').length,
    empty_final_names: allRows.filter((r) => !r.final_italian_name).length,
    final_equals_english: allRows.filter((r) => r.final_italian_name && normalize(r.final_italian_name) === normalize(r.ymove_title)).length,
    duplicate_final_name_groups: duplicateFinalNames.length,
  },
  duplicate_final_names: duplicateFinalNames.slice(0, 80).map(([name, ids]) => ({ normalized_name: name, count: ids.length, ids })),
  required_checks: requiredChecks,
  first70,
};
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

console.log(JSON.stringify({
  validatedPath,
  reviewPath,
  summaryPath,
  input_rows: summary.input_rows,
  output_rows: summary.output_rows,
  unique_output_ids: summary.unique_output_ids,
  review_rows: reviewRows.length,
  missing_from_input: summary.missing_from_input,
  after: summary.after,
  required_checks: summary.required_checks,
}, null, 2));
