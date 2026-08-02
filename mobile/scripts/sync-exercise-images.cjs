// Collega le foto/illustrazioni reali degli esercizi LOCALI (i 58 di
// src/data/exercise-library.ts) al registro che ExerciseThumbnail legge
// (src/data/image-registry.ts), senza mai richiedere un file inesistente
// (Metro fallirebbe la build) e senza toccare voci non sue (es. future
// entry 'ymove-*'/'custom-*' aggiunte da altri strumenti).
//
// Come si usa:
//   1. Metti i file in mobile/assets/images/exercises/, nome = id esercizio
//      (es. petto-panca-piana.jpg — stesso id di exercise-library.ts).
//   2. node mobile/scripts/sync-exercise-images.cjs
//   3. Il comando riscrive image-registry.ts con SOLO i file che esistono
//      davvero su disco per questi 58 id, aggiunge --check per verificare
//      senza scrivere (usato anche in CI/pre-commit se servisse in futuro).
//
// Nessuna chiamata di rete, nessuna dipendenza da YMove: legge solo file
// locali. Esegue src/data/exercise-library.ts (TypeScript reale, non una
// copia/regex) tramite lo stesso pattern gia' in uso in
// verify-superadmin-payment-fixtures.cjs (transpileModule + vm), cosi' la
// lista dei 58 id e' sempre quella VERA, mai una copia che puo' disallinearsi.

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const MOBILE_ROOT = path.join(__dirname, '..');
const SRC_ROOT = path.join(MOBILE_ROOT, 'src');
const IMAGES_DIR = path.join(MOBILE_ROOT, 'assets', 'images', 'exercises');
const REGISTRY_FILE = path.join(SRC_ROOT, 'data', 'image-registry.ts');
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
// data/exercise-image-catalog.ts (buildImageCandidates): id + estensione, e
// (se presente) il nome del file video con estensione immagine. Duplicata
// qui deliberatamente (script Node standalone, non importa moduli .tsx) — se
// cambia la' va aggiornata anche qui, stesso principio di
// normalizeCatalogId/buildImageCandidates.
function imageCandidatesFor(exercise) {
  const candidates = new Set();
  candidates.add(`${exercise.id}.jpg`);
  candidates.add(`${exercise.id}.png`);
  if (exercise.videoFile) {
    candidates.add(exercise.videoFile.replace(/\.[^.]+$/i, '.jpg'));
    candidates.add(exercise.videoFile.replace(/\.[^.]+$/i, '.png'));
  }
  return [...candidates];
}

// ---- Legge le voci ATTUALI di image-registry.ts (chiave -> path del
// require) senza eseguirlo: alle voci NON di questo script (es. future
// 'ymove-*'/'custom-*') non deve succedere nulla, vanno preservate cosi'
// come sono anche se questo run non le tocca.
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
// Le voci per gli esercizi locali (src/data/exercise-library.ts) sono
// generate automaticamente da scripts/sync-exercise-images.cjs — non
// aggiungerle/rimuoverle a mano, rilancia lo script dopo aver aggiunto o
// tolto un file in assets/images/exercises/. Voci di altra origine (es.
// esercizi YMove/custom, se e quando implementate) restano gestite altrove e
// non vengono toccate da questo script.
export const IMAGE_REGISTRY: Record<string, number> = {${body}};

export function resolveImageSource(imageFile: string): number | null {
  return IMAGE_REGISTRY[imageFile] ?? null;
}
`;
  fs.writeFileSync(REGISTRY_FILE, content, 'utf8');
}

function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`Cartella non trovata: ${IMAGES_DIR}`);
    process.exit(1);
  }

  const { EXERCISE_LIBRARY } = loadTsModule(path.join(SRC_ROOT, 'data', 'exercise-library.ts'));
  const filesOnDisk = new Set(fs.readdirSync(IMAGES_DIR).filter((f) => f !== 'README.md'));

  const currentEntries = readCurrentRegistryEntries();
  const nextEntries = new Map(currentEntries);

  const covered = [];
  const missing = [];

  for (const exercise of EXERCISE_LIBRARY) {
    const candidates = imageCandidatesFor(exercise);
    const foundFile = candidates.find((file) => filesOnDisk.has(file));

    // Ogni possibile nome file di QUESTO esercizio va rimosso dal registro se
    // non esiste piu' su disco (es. immagine cancellata dopo un run
    // precedente) — tocca solo le chiavi che questo esercizio potrebbe aver
    // generato, mai chiavi di altri esercizi/altra origine.
    for (const candidate of candidates) {
      if (candidate !== foundFile) nextEntries.delete(candidate);
    }

    if (foundFile) {
      nextEntries.set(foundFile, `${REGISTRY_REQUIRE_PREFIX}${foundFile}`);
      covered.push(exercise.id);
    } else {
      missing.push(exercise.id);
    }
  }

  const changed = JSON.stringify([...currentEntries.entries()].sort()) !== JSON.stringify([...nextEntries.entries()].sort());

  console.log(`Esercizi locali totali: ${EXERCISE_LIBRARY.length}`);
  console.log(`Con immagine reale collegata: ${covered.length}`);
  console.log(`Ancora su placeholder: ${missing.length}`);
  if (missing.length > 0) {
    console.log('\nId mancanti (aggiungi il file in assets/images/exercises/ e rilancia):');
    for (const id of missing) console.log(`  - ${id}.jpg (o .png)`);
  }

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
