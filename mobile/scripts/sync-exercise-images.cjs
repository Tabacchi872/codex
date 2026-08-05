// Collega le foto/illustrazioni reali degli esercizi (101 locali di
// src/data/exercise-library.ts + 360 YMove gia' importati in
// public.exercises) al registro che ExerciseThumbnail legge
// (src/data/image-registry.ts), senza mai richiedere un file inesistente
// (Metro fallirebbe la build) e senza toccare voci non sue (es. future entry
// 'custom-*' aggiunte da altri strumenti).
//
// Come si usa:
//   1. Metti i file in mobile/assets/images/exercises/:
//      - esercizi locali: nome = id esercizio (es. petto-panca-piana.jpg,
//        stesso id di exercise-library.ts);
//      - esercizi YMove: nome = filename_previsto di
//        scripts/ymove-image-manifest.csv (es.
//        ymove-2fb79823-a759-4ceb-8b16-a26ab3cfb440.jpg — stessa chiave
//        'ymove-<ymove_exercise_id>' generata da normalizeCatalogId in
//        data/exercise-image-catalog.ts, MAI l'id FitCoach dell'esercizio).
//   2. node mobile/scripts/sync-exercise-images.cjs
//   3. Il comando riscrive image-registry.ts con SOLO i file che esistono
//      davvero su disco per questi 461 esercizi, aggiunge --check per
//      verificare senza scrivere (usato anche in CI/pre-commit se servisse).
//
// Nessuna chiamata YMove: gli esercizi locali vengono letti eseguendo il vero
// exercise-library.ts (TypeScript reale, non una copia/regex, stesso pattern
// di verify-superadmin-payment-fixtures.cjs); gli esercizi YMove vengono letti
// da scripts/ymove-image-manifest.csv, un export gia' fatto UNA VOLTA da
// Supabase (public.exercises, source='ymove') — questo script legge solo quel
// CSV, mai l'API YMove ne' il database a ogni esecuzione. Se il catalogo
// YMove importato cambia, rigenera prima il CSV (stessa query), poi rilancia
// questo script.
//
// Terza fase (facoltativa, scripts/ymove-image-mapping.csv se presente): per
// gli esercizi YMove SENZA foto dedicata, riusa l'immagine FitCoach locale
// indicata SOLO per le righe confidence='exact' (mai 'close'/'no_match') —
// nessun file duplicato, solo una voce di registro in piu' che punta allo
// stesso file locale sotto la chiave 'ymove-<ymove_exercise_id>.png'.

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const MOBILE_ROOT = path.join(__dirname, '..');
const SRC_ROOT = path.join(MOBILE_ROOT, 'src');
const IMAGES_DIR = path.join(MOBILE_ROOT, 'assets', 'images', 'exercises');
const REGISTRY_FILE = path.join(SRC_ROOT, 'data', 'image-registry.ts');
const YMOVE_MANIFEST_FILE = path.join(__dirname, 'ymove-image-manifest.csv');
const YMOVE_MAPPING_FILE = path.join(__dirname, 'ymove-image-mapping.csv');
const REGISTRY_REQUIRE_PREFIX = '../../assets/images/exercises/';

const checkOnly = process.argv.includes('--check');

// ---- Esegue un file .ts reale (non una copia) in una VM isolata, risolvendo
// import relativi ('./x') e con alias ('@/x') verso gli stessi file veri del
// progetto, con cache per modulo. Stesso principio di
// verify-superadmin-payment-fixtures.cjs, esteso a piu' file per seguire la
// catena di import reale di exercise-library.ts (video-registry.ts,
// lib/exercise-catalog.ts — quest'ultimo importa solo TYPE, nessun require
// a runtime dopo la transpilazione).
const moduleCache = new Map();

function resolveModuleId(fromFile, id) {
  if (id.startsWith('@/')) return path.join(SRC_ROOT, id.slice(2)) + '.ts';
  if (id.startsWith('.')) return path.resolve(path.dirname(fromFile), id) + '.ts';
  return null; // modulo npm reale: lasciato al require() di Node.
}

function loadTsModule(absPath) {
  if (moduleCache.has(absPath)) return moduleCache.get(absPath);

  const source = fs.readFileSync(absPath, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;

  const sandbox = { exports: {}, module: { exports: {} }, console, Date, Intl };
  sandbox.exports = sandbox.module.exports;
  sandbox.require = (id) => {
    const resolved = resolveModuleId(absPath, id);
    if (!resolved) return require(id);
    return loadTsModule(resolved);
  };

  moduleCache.set(absPath, sandbox.module.exports); // rompe cicli infiniti (non attesi qui)
  vm.runInNewContext(js, sandbox, { filename: absPath });
  moduleCache.set(absPath, sandbox.module.exports);
  return sandbox.module.exports;
}

// ---- Stessa identica costruzione dei candidati di
// data/exercise-image-catalog.ts (buildImageCandidates) per un esercizio
// LOCALE: id + estensione, e (se presente) il nome del file video con
// estensione immagine. Duplicata qui deliberatamente (script Node standalone,
// non importa moduli .tsx) — se cambia la' va aggiornata anche qui, stesso
// principio di normalizeCatalogId/buildImageCandidates.
function localImageCandidates(exercise) {
  const candidates = new Set();
  candidates.add(`${exercise.id}.jpg`);
  candidates.add(`${exercise.id}.png`);
  if (exercise.videoFile) {
    candidates.add(exercise.videoFile.replace(/\.[^.]+$/i, '.jpg'));
    candidates.add(exercise.videoFile.replace(/\.[^.]+$/i, '.png'));
  }
  return [...candidates];
}

// ---- Stessa chiave di normalizeCatalogId per un esercizio YMove
// ('ymove-<ymove_exercise_id>', MAI l'id FitCoach) + entrambe le estensioni.
function ymoveImageCandidates(ymoveExerciseId) {
  const catalogId = `ymove-${ymoveExerciseId}`;
  return [`${catalogId}.jpg`, `${catalogId}.png`];
}

// ---- Parser CSV minimale ma corretto (RFC4126: campi tra virgolette con
// virgole/virgolette doppie interne) — evita un naive split(',') che
// romperebbe su un'attrezzatura tipo "Bilanciere, panca piana".
function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (inQuotes) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift() ?? [];
  return rows.map((cols) => Object.fromEntries(header.map((key, idx) => [key, cols[idx] ?? ''])));
}

function loadYmoveManifest() {
  if (!fs.existsSync(YMOVE_MANIFEST_FILE)) {
    console.error(`Manifest YMove non trovato: ${path.relative(MOBILE_ROOT, YMOVE_MANIFEST_FILE)}`);
    console.error('Rigeneralo prima con un export read-only di public.exercises (source=\'ymove\').');
    process.exit(1);
  }
  return parseCsv(fs.readFileSync(YMOVE_MANIFEST_FILE, 'utf8'));
}

// ---- Mapping YMove -> immagine FitCoach locale riusata (scripts/ymove-image-
// mapping.csv, generato da un'analisi separata di movimento/attrezzatura).
// Facoltativo: se assente, questa terza fase e' semplicemente saltata (le
// prime due fasi — locali e YMove con foto dedicata — restano invariate).
// Applica SOLO le righe confidence='exact', mai 'close'/'no_match' — e mai
// se esiste gia' una foto YMove dedicata reale (quella ha sempre priorita').
function loadYmoveExactMappings() {
  if (!fs.existsSync(YMOVE_MAPPING_FILE)) return [];
  return parseCsv(fs.readFileSync(YMOVE_MAPPING_FILE, 'utf8')).filter((row) => row.confidence === 'exact');
}

// ---- Legge le voci ATTUALI di image-registry.ts (chiave -> path del
// require) senza eseguirlo: alle voci NON di questo script (es. future
// entry 'custom-*') non deve succedere nulla, vanno preservate cosi' come
// sono anche se questo run non le tocca.
function readCurrentRegistryEntries() {
  const source = fs.readFileSync(REGISTRY_FILE, 'utf8');
  const entries = new Map();
  const lineRe = /'([^']+)':\s*require\('([^']+)'\)/g;
  let match;
  while ((match = lineRe.exec(source))) {
    entries.set(match[1], match[2]);
  }
  return entries;
}

function writeRegistry(entries) {
  const sortedKeys = [...entries.keys()].sort((a, b) => a.localeCompare(b));
  const body =
    sortedKeys.length === 0
      ? ''
      : '\n' + sortedKeys.map((key) => `  '${key}': require('${entries.get(key)}'),`).join('\n') + '\n';

  const content = `// Registro esplicito delle thumbnail locali degli esercizi. Metro richiede
// require() statici, quindi non si puo' risolvere un path per stringa a
// runtime: ogni immagine reale aggiunta in mobile/assets/images/exercises/ va
// registrata qui. ExerciseThumbnail mostra un placeholder grafico coerente
// col gruppo muscolare finche' un esercizio non ha una voce qui.
//
// Le voci per gli esercizi locali (src/data/exercise-library.ts, chiave =
// id esercizio) e per gli esercizi YMove (public.exercises, chiave =
// 'ymove-<ymove_exercise_id>', vedi scripts/ymove-image-manifest.csv) sono
// generate automaticamente da scripts/sync-exercise-images.cjs — non
// aggiungerle/rimuoverle a mano, rilancia lo script dopo aver aggiunto o
// tolto un file in assets/images/exercises/. Voci di altra origine (es.
// esercizi custom, se e quando implementati) restano gestite altrove e non
// vengono toccate da questo script.
export const IMAGE_REGISTRY: Record<string, number> = {${body}};

export function resolveImageSource(imageFile: string): number | null {
  return IMAGE_REGISTRY[imageFile] ?? null;
}
`;
  fs.writeFileSync(REGISTRY_FILE, content, 'utf8');
}

// ---- Applica una sorgente (elenco di {label, candidates}) al registro in
// costruzione: aggiorna/rimuove SOLO le chiavi che questa sorgente potrebbe
// generare, mai quelle di un'altra sorgente o di provenienza esterna allo
// script. Ritorna { covered, missing } (etichette leggibili per il report).
function applySource(nextEntries, filesOnDisk, items) {
  const covered = [];
  const missing = [];
  for (const { label, candidates } of items) {
    const foundFile = candidates.find((file) => filesOnDisk.has(file));
    for (const candidate of candidates) {
      if (candidate !== foundFile) nextEntries.delete(candidate);
    }
    if (foundFile) {
      nextEntries.set(foundFile, `${REGISTRY_REQUIRE_PREFIX}${foundFile}`);
      covered.push(label);
    } else {
      missing.push(label);
    }
  }
  return { covered, missing };
}

// ---- Applica le righe confidence='exact' del mapping YMove: la CHIAVE nel
// registro e' sempre 'ymove-<ymove_exercise_id>.png' (coerente con
// normalizeCatalogId), ma il require() punta al file LOCALE gia' esistente
// (filename_immagine_locale) — nessun file duplicato su disco, la stessa
// immagine e' semplicemente registrata sotto una chiave in piu'. Una foto
// YMove dedicata reale (fase precedente, ymove-<id>.jpg/.png su disco) ha
// SEMPRE priorita' e non viene mai sovrascritta da questa fase.
function applyExactMappings(nextEntries, filesOnDisk, exactRows) {
  const applied = [];
  const skippedDedicated = [];
  const skippedMissingLocal = [];
  for (const row of exactRows) {
    const dedicatedJpg = `ymove-${row.ymove_exercise_id}.jpg`;
    const dedicatedPng = `ymove-${row.ymove_exercise_id}.png`;
    if (nextEntries.has(dedicatedJpg) || nextEntries.has(dedicatedPng)) {
      skippedDedicated.push(row.nome);
      continue;
    }
    if (!filesOnDisk.has(row.filename_immagine_locale)) {
      skippedMissingLocal.push(row.nome);
      nextEntries.delete(dedicatedPng);
      continue;
    }
    nextEntries.set(dedicatedPng, `${REGISTRY_REQUIRE_PREFIX}${row.filename_immagine_locale}`);
    applied.push(row.nome);
  }
  return { applied, skippedDedicated, skippedMissingLocal };
}

function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`Cartella non trovata: ${IMAGES_DIR}`);
    process.exit(1);
  }

  const { EXERCISE_LIBRARY } = loadTsModule(path.join(SRC_ROOT, 'data', 'exercise-library.ts'));
  const ymoveRows = loadYmoveManifest();
  const filesOnDisk = new Set(fs.readdirSync(IMAGES_DIR).filter((f) => f !== 'README.md'));

  const currentEntries = readCurrentRegistryEntries();
  const nextEntries = new Map(currentEntries);

  const localItems = EXERCISE_LIBRARY.map((exercise) => ({ label: exercise.id, candidates: localImageCandidates(exercise) }));
  const ymoveItems = ymoveRows.map((row) => ({
    label: `${row.exercise_id} (${row.nome})`,
    candidates: ymoveImageCandidates(row.ymove_exercise_id),
  }));

  const local = applySource(nextEntries, filesOnDisk, localItems);
  applySource(nextEntries, filesOnDisk, ymoveItems); // fase 2: foto YMove dedicate reali (oggi nessuna)

  const exactMappings = loadYmoveExactMappings();
  const exactResult = applyExactMappings(nextEntries, filesOnDisk, exactMappings);

  // Copertura YMove finale ricalcolata DOPO le tre fasi (dedicata reale O
  // mapping esatto riusato): applySource da solo non vede la fase 3.
  const ymoveCovered = ymoveRows.filter(
    (row) => nextEntries.has(`ymove-${row.ymove_exercise_id}.jpg`) || nextEntries.has(`ymove-${row.ymove_exercise_id}.png`),
  );
  const ymoveMissingCount = ymoveRows.length - ymoveCovered.length;

  const changed = JSON.stringify([...currentEntries.entries()].sort()) !== JSON.stringify([...nextEntries.entries()].sort());

  const totalCount = EXERCISE_LIBRARY.length + ymoveRows.length;
  const totalCovered = local.covered.length + ymoveCovered.length;
  const totalMissing = local.missing.length + ymoveMissingCount;

  console.log(`Esercizi locali: ${EXERCISE_LIBRARY.length} (con immagine: ${local.covered.length}, mancanti: ${local.missing.length})`);
  console.log(`Esercizi YMove:  ${ymoveRows.length} (con immagine: ${ymoveCovered.length}, mancanti: ${ymoveMissingCount})`);
  console.log(`  di cui da mapping esatto riusato: ${exactResult.applied.length}`);
  console.log(`Totale:          ${totalCount} (con immagine: ${totalCovered}, mancanti: ${totalMissing})`);

  if (checkOnly) {
    if (changed) {
      console.error('\nimage-registry.ts NON e\' allineato ai file presenti su disco (--check).');
      process.exit(1);
    }
    console.log('\nimage-registry.ts gia\' allineato.');
    return;
  }

  if (changed) {
    writeRegistry(nextEntries);
    console.log(`\nAggiornato ${path.relative(MOBILE_ROOT, REGISTRY_FILE)}.`);
  } else {
    console.log('\nNessuna modifica necessaria: registro gia\' allineato.');
  }
}

main();
