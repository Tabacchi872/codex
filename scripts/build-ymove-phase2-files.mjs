import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('reports/ymove/output');
const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i], n = text[i + 1];
    if (quoted) {
      if (c === '"' && n === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const header = (rows.shift() ?? []).map((v) => v.replace(/^\uFEFF/, ''));
  return rows.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
function esc(v) { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }
function write(name, rows, cols) { fs.writeFileSync(path.join(dir, name), `${cols.join(',')}\n${rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n')}\n`, 'utf8'); }
function norm(v) { return String(v ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
function arr(v) { return String(v ?? '').split('|').map((x) => x.trim()).filter(Boolean); }
function csvJson(v) { return JSON.stringify(v ?? []).replaceAll('"', "'"); }

const master = parseCsv(read('ymove-exercise-names-validated.csv'));
const catalog = parseCsv(read('ymove-catalog-simple.csv'));
const duplicateGroups = parseCsv(read('ymove-exercise-names-duplicate-groups.csv'));
const duplicateIds = new Set(duplicateGroups.flatMap((r) => String(r.ids ?? '').split('|').filter(Boolean)));
const duplicatePrimary = new Map();
for (const group of duplicateGroups) {
  const ids = String(group.ids ?? '').split('|').filter(Boolean);
  if (ids.length) for (const id of ids) duplicatePrimary.set(id, ids[0]);
}
const catalogById = new Map(catalog.map((r) => [r.external_exercise_id, r]));

// Snapshot of the remote legacy metadata inventory read earlier from public.exercise_movement_metadata.
const legacyKeys = `bicipiti-curl-alternato bicipiti-curl-bilanciere bicipiti-curl-cavo bicipiti-curl-manubri bicipiti-curl-martello bicipiti-curl-panca-inclinata bicipiti-preacher-curl cardio-battle-rope cardio-burpees cardio-cyclette cardio-ellittica cardio-jumping-jack cardio-salto-corda cardio-stair-climber cardio-tapis-roulant cardio-vogatore core-cable-crunch core-crunch core-dead-bug core-hollow-hold core-leg-raise core-mountain-climber core-pallof-press core-plank core-reverse-crunch core-russian-twist core-side-plank dorso-lat-machine-avanti dorso-lat-machine-neutra dorso-pulley-basso dorso-pullover-cavo dorso-rematore-bilanciere dorso-rematore-corpo-libero dorso-rematore-macchina dorso-rematore-manubrio dorso-trazioni dorso-trazioni-assistite dorso-vertical-row femorali-good-morning femorali-hip-hinge femorali-leg-curl-sdraiato femorali-leg-curl-seduto femorali-nordic-curl gambe-affondi gambe-air-squat gambe-bulgarian-split-squat gambe-calf-raise gambe-front-squat gambe-hack-squat gambe-hip-thrust gambe-leg-curl gambe-leg-extension gambe-leg-press gambe-leg-press-45 gambe-squat gambe-stacco-rumeno gambe-stacco-rumeno-manubri gambe-step-up glutei-abduzioni glutei-affondi-posteriori glutei-glute-bridge glutei-kickback-cavo glutei-squat-sumo lombari-bird-dog lombari-hyperextension lombari-superman-controllato mobilita-anche mobilita-cat-cow mobilita-caviglie mobilita-rotazioni-toraciche mobilita-spalle petto-chest-press petto-croci-cavi petto-croci-manubri petto-dips-petto petto-panca-inclinata petto-panca-inclinata-manubri petto-panca-piana petto-panca-piana-manubri petto-push-up polpacci-calf-press-leg-press polpacci-calf-raise-monopodalico polpacci-calf-raise-seduto spalle-alzate-frontali spalle-alzate-laterali spalle-face-pull spalle-military-press spalle-reverse-fly spalle-shoulder-press spalle-shoulder-press-macchina spalle-tirate-mento stretching-femorali stretching-pettorali stretching-quadricipiti tricipiti-dip-ginocchia-piegate tricipiti-dip-tricipiti tricipiti-estensioni-sopra-testa tricipiti-french-press tricipiti-kickback tricipiti-panca-presa-stretta tricipiti-pushdown-cavo`.split(' ');
const legacy = legacyKeys.map((key) => {
  const bits = key.split('-');
  const human = bits.slice(1).join(' ').replace(/\b\w/g, (x) => x.toUpperCase());
  const n = norm(key);
  let equipment = n.includes('bilanciere') ? 'barbell' : n.includes('manubri') || n.includes('manubrio') ? 'dumbbell' : n.includes('cavo') ? 'cable' : n.includes('macchina') ? 'machine' : n.includes('bodyweight') ? 'bodyweight' : 'bodyweight';
  if (key.includes('leg-press') || key.includes('chest-press')) equipment = 'machine';
  const pattern = n.includes('curl') ? 'curl' : n.includes('press') || n.includes('panca') || n.includes('push') ? 'push' : n.includes('row') || n.includes('rematore') || n.includes('pulley') ? 'row' : n.includes('deadlift') || n.includes('stacco') || n.includes('hip') || n.includes('good-morning') ? 'hinge' : n.includes('squat') || n.includes('leg-press') ? 'squat' : n.includes('lunge') || n.includes('affond') ? 'lunge' : n.includes('plank') ? 'plank' : n.includes('crunch') ? 'crunch' : n.includes('extension') ? 'extension' : n.includes('calf') ? 'calf' : n.includes('stretch') || n.includes('mobilita') ? 'mobility' : '';
  return { key: `legacy:${key}`, name: human, equipment, pattern, normalized: n };
});
const fitByKey = new Map(legacy.map((x) => [x.key, x]));

function titleFeatures(title) {
  const n = norm(title);
  return {
    equipment: n.includes('barbell') ? 'barbell' : n.includes('dumbbell') ? 'dumbbell' : n.includes('cable') ? 'cable' : n.includes('machine') ? 'machine' : n.includes('kettlebell') ? 'kettlebell' : n.includes('band') ? 'band' : n.includes('bodyweight') || n.includes('no weight') ? 'bodyweight' : 'bodyweight',
    pattern: n.includes('curl') ? 'curl' : n.includes('row') || n.includes('pulldown') || n.includes('pull') ? 'row' : n.includes('press') || n.includes('push') || n.includes('bench') ? 'push' : n.includes('deadlift') || n.includes('good morning') || n.includes('hip thrust') ? 'hinge' : n.includes('squat') ? 'squat' : n.includes('lunge') ? 'lunge' : n.includes('plank') ? 'plank' : n.includes('crunch') || n.includes('sit up') ? 'crunch' : n.includes('calf') ? 'calf' : n.includes('stretch') || n.includes('pose') ? 'mobility' : n.includes('extension') ? 'extension' : '',
    variant: n,
  };
}
function candidate(row) {
  const f = titleFeatures(row.ymove_title);
  const title = norm(row.ymove_title);
  const direct = [
    ['alternating dumbbell curl', 'legacy:bicipiti-curl-alternato'],
    ['barbell curls', 'legacy:bicipiti-curl-bilanciere'],
    ['barbell rows', 'legacy:dorso-rematore-bilanciere'],
    ['barbell front raise', 'legacy:spalle-alzate-frontali'],
    ['barbell good morning', 'legacy:femorali-good-morning'],
    ['barbell back squat', 'legacy:gambe-squat'],
    ['barbell full squat', 'legacy:gambe-squat'],
    ['barbell deadlift', 'legacy:gambe-stacco-rumeno'],
    ['romanian deadlift', 'legacy:gambe-stacco-rumeno'],
    ['leg press', 'legacy:gambe-leg-press'],
    ['burpee', 'legacy:cardio-burpees'],
    ['abdominal crunch', 'legacy:core-crunch'],
    ['front plank', 'legacy:core-plank'],
    ['cable triceps pushdown', 'legacy:tricipiti-pushdown-cavo'],
    ['cable bicep curl', 'legacy:bicipiti-curl-cavo'],
    ['seated cable row', 'legacy:dorso-pulley-basso'],
    ['lat pulldown', 'legacy:dorso-lat-machine-avanti'],
    ['barbell hip thrust', 'legacy:gambe-hip-thrust'],
  ].find(([needle]) => title.includes(needle));
  if (direct) {
    const fit = fitByKey.get(direct[1]);
    const technicalReview = ['barbell deadlift', 'barbell full squat', 'barbell shoulder press', 'barbell calf', 'romanian deadlift'].some((x) => title.includes(x));
    return { key: fit.key, name: fit.name, score: technicalReview ? 78 : 96, gap: 18, reasons: ['alias tecnico verificato', 'movimento e variante compatibili'], contradictions: [], classification: technicalReview ? 'REVIEW_POSSIBLE_MATCH' : 'LINK_EXISTING_VERIFIED' };
  }
  const candidates = legacy.map((fit) => {
    let score = 0; const reasons = []; const contradictions = [];
    if (fit.pattern && f.pattern && fit.pattern === f.pattern) { score += 55; reasons.push('pattern compatibile'); }
    if (fit.equipment === f.equipment) { score += 25; reasons.push('attrezzatura compatibile'); }
    else if (f.equipment && fit.equipment && fit.equipment !== 'bodyweight') { contradictions.push(`${f.equipment}_vs_${fit.equipment}`); }
    if (norm(f.name).includes(f.pattern) || f.variant.includes(norm(f.pattern))) score += 10;
    if (f.variant.includes('one arm') && !fit.key.includes('manubrio')) contradictions.push('unilateralita_non_dimostrata');
    if (f.variant.includes('romanian') && !fit.key.includes('stacco-rumeno')) contradictions.push('romanian_vs_other_hinge');
    return { fit, score: contradictions.length ? Math.min(score, 71) : score, reasons, contradictions };
  }).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 55 || best.contradictions.length) return { key: '', name: '', score: best?.score ?? 0, gap: best ? best.score - (candidates[1]?.score ?? 0) : 0, reasons: best?.reasons ?? [], contradictions: best?.contradictions ?? [], classification: 'CREATE_NEW_VERIFIED' };
  const classification = best.score >= 92 ? 'LINK_EXISTING_VERIFIED' : 'REVIEW_POSSIBLE_MATCH';
  return { key: best.fit.key, name: best.fit.name, score: best.score, gap: best.score - (candidates[1]?.score ?? 0), reasons: best.reasons, contradictions: best.contradictions, classification };
}

const safeRows = master.filter((r) => {
  const n = norm(r.final_italian_name);
  const malformed = /in piedi manubrio|manubrio estensione|esplosivo squat|monopodalico laterale su rialzo rimbalzo|full squat con bilanciere/.test(n);
  return r.validation_status === 'VALIDATED' && r.final_italian_name.trim() && Number(r.quality_score) >= 80 && !duplicateIds.has(r.external_exercise_id) && !malformed;
});
const safeCols = ['external_exercise_id','ymove_title','final_italian_name','italian_aliases','quality_score','selected_source','duplicate_primary_external_id','validation_status','research_note'];
write('ymove-exercise-names-safe.csv', safeRows.map((r) => ({ ...r, italian_aliases: '', duplicate_primary_external_id: '', research_note: 'Validazione locale; esclusi gruppi con collisione nominale.' })), safeCols);

const links = [], creates = [], reviews = [];
for (const row of safeRows) {
  const m = candidate(row);
  const out = { external_exercise_id: row.external_exercise_id, ymove_title: row.ymove_title, final_italian_name: row.final_italian_name, compared_existing_exercise_key: m.key, compared_existing_exercise_name: m.name, score: m.score, score_gap: m.gap, contradictions: m.contradictions.join('|'), reasons: m.reasons.join('|'), classification: m.classification, technical_source: 'public.exercise_movement_metadata + public.exercises read-only snapshot' };
  if (m.classification === 'LINK_EXISTING_VERIFIED') links.push(out);
  else if (m.classification === 'REVIEW_POSSIBLE_MATCH') reviews.push(out);
  else creates.push(out);
}
const matchCols = ['external_exercise_id','ymove_title','final_italian_name','compared_existing_exercise_key','compared_existing_exercise_name','score','score_gap','contradictions','reasons','classification','technical_source'];
write('ymove-link-existing-safe.csv', links, matchCols);
write('ymove-create-new-safe.csv', creates, matchCols);
write('ymove-review-priority.csv', master.filter((r) => r.validation_status !== 'VALIDATED' || !r.final_italian_name.trim()).sort((a, b) => {
  const rank = (r) => /equipment|machine|barbell|dumbbell|cable|kettlebell/i.test(r.ymove_title) ? 1 : /drill|complex|bear|jump|crawl/i.test(r.ymove_title) ? 4 : /stretch|pose|mobility|yoga/i.test(r.ymove_title) ? 5 : /bodyweight|plank|push|squat|curl|row|press/i.test(r.ymove_title) ? 2 : 6;
  return rank(a) - rank(b) || a.ymove_title.localeCompare(b.ymove_title);
}), ['external_exercise_id','ymove_title','final_italian_name','validation_status','quality_score','rejection_reasons','missing_technical_details']);

const duplicateOut = duplicateGroups.map((g) => {
  const ids = String(g.ids).split('|').filter(Boolean);
  const rows = ids.map((id) => catalogById.get(id)).filter(Boolean);
  const titles = rows.map((r) => r.title);
  const sameTitle = new Set(titles.map(norm)).size === 1;
  const type = sameTitle ? 'EDITORIAL_DUPLICATE' : 'TRANSLATION_COLLISION';
  return { normalized_name: g.normalized_name, external_ids: ids.join('|'), titles: titles.join(' | '), classification: type, primary_external_id: ids[0] ?? '', rationale: sameTitle ? 'Titoli tecnici equivalenti o sola variazione editoriale da verificare.' : 'Nome italiano colliso; titoli YMove differenti, non deduplicare automaticamente.' };
});
write('ymove-editorial-duplicates-final.csv', duplicateOut.filter((r) => r.classification === 'EDITORIAL_DUPLICATE'), ['normalized_name','external_ids','titles','classification','primary_external_id','rationale']);
write('ymove-technical-variants.csv', duplicateOut.filter((r) => r.classification !== 'EDITORIAL_DUPLICATE'), ['normalized_name','external_ids','titles','classification','primary_external_id','rationale']);

const first100 = parseCsv(read('ymove-review-priority.csv')).slice(0, 100).map((r) => ({ ...r, research_action: 'RESEARCH_REQUIRED: nessuna nuova ricerca web automatica eseguita; verificare fonti italiane prima di VALIDATED.' }));
write('ymove-review-priority-first100.csv', first100, [...Object.keys(first100[0] ?? {}),]);

const missing = ['24030adc-de07-4547-a916-24acee3d5a3e','5058baec-15c8-4278-afa5-9621bb4e15b5','9fb9d7f3-6833-4f8d-97ce-f487f8fd5eca'].map((id) => master.find((r) => r.external_exercise_id === id)).filter(Boolean);
const summary = { masterRows: master.length, catalogRows: catalog.length, safeNames: safeRows.length, links: links.length, creates: creates.length, reviews: reviews.length, duplicateGroups: duplicateGroups.length, missingRecovered: missing.map((r) => ({ id: r.external_exercise_id, title: r.ymove_title, status: r.validation_status, name: r.final_italian_name })), fitcoachCanonicalUuidRowsRead: 22, fitcoachLegacyMetadataRowsRead: 101, note: 'No Supabase writes and no YMove API calls.' };
fs.writeFileSync(path.join(dir, 'ymove-phase2-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(summary));
