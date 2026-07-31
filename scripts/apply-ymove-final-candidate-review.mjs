import fs from 'node:fs';
const file='reports/ymove/output/ymove-safe-staging-reconciliation.csv';
function parse(t){const a=t.trim().split(/\r?\n/),h=a.shift().split(',');return a.map(l=>{const v=l.split(',');return Object.fromEntries(h.map((x,i)=>[x,v[i]??'']))})}
function esc(v){const s=String(v??'');return /[",\n\r]/.test(s)?`"${s.replaceAll('"','""')}"`:s}
const rows=parse(fs.readFileSync(file,'utf8'));
const corrections=new Map([
 ['3620635f-3fcb-4552-8959-dc6ec09d9ea2','Nome A-skip/A steps non sufficientemente italiano o verificato.'],
 ['4001ef61-57a1-4f18-8c0b-8167e15c6832','Nome generato errato e perde la sequenza jumping jack.'],
 ['42dc0603-91e8-4a1e-8bf0-ef9478718106','Nome generato innaturale; richiede revisione terminologica.'],
 ['7a94a32f-40d9-42eb-b03d-afe76c71ea36','Titolo ambiguo: side reach non identificato con sufficiente precisione.'],
 ['83b448e2-7782-42ff-bcf6-1ce7a7e9a5a4','Nome Rimbalzo troppo generico per Hip Circle hops.'],
 ['b771f714-b1dc-49f8-8df5-9f8ae35bbbae','Esiste equivalente FitCoach lombari-bird-dog; non è CREATE_NEW.'],
 ['c67b0b0a-c636-4cff-9628-8ecd1e5482ca','Nome monopodalico Ponte innaturale; revisione nome necessaria.'],
 ['ee79ed25-3455-4730-acd9-5173de6085c9','Ab Bridge Complex ambiguo; sequenza non identificata con certezza.'],
]);
for(const r of rows) if(corrections.has(r.external_exercise_id)){r.database_status='REVIEW_REQUIRED';r.proposed_staging_status='REVIEW_REQUIRED';r.blocking_reason=corrections.get(r.external_exercise_id)}
const h=Object.keys(rows[0]);fs.writeFileSync(file,`${h.join(',')}\n${rows.map(r=>h.map(c=>esc(r[c])).join(',')).join('\n')}\n`,'utf8');
const values=[...corrections.entries()].map(([id,reason])=>`('${id}','${reason.replaceAll("'","''")}')`).join(',\n');
const sql=`begin;\nwith v(external_exercise_id,reason) as (values\n${values}\n)\nupdate public.ymove_library_import_candidates c set research_status=case when c.external_exercise_id='b771f714-b1dc-49f8-8df5-9f8ae35bbbae' then 'REVIEW_POSSIBLE_MATCH' else 'RESEARCH_REQUIRED' end, semantic_review_status=case when c.external_exercise_id='b771f714-b1dc-49f8-8df5-9f8ae35bbbae' then 'REVIEW_POSSIBLE_MATCH' else 'RESEARCH_REQUIRED' end, compared_existing_exercise_key=case when c.external_exercise_id='b771f714-b1dc-49f8-8df5-9f8ae35bbbae' then 'legacy:lombari-bird-dog' else null end, score=case when c.external_exercise_id='b771f714-b1dc-49f8-8df5-9f8ae35bbbae' then 96 else null end, match_reason=v.reason, candidate_rejected_reason=v.reason, updated_at=now() from v where c.import_run_id='b2a8cb33-061b-489e-bbe5-c2fce38d0ecc' and c.external_exercise_id=v.external_exercise_id;\ncommit;`;
fs.writeFileSync('reports/ymove/output/ymove-safe-staging-final-corrections.sql',sql,'utf8');
console.log(JSON.stringify({corrected:corrections.size,remaining_ready:rows.filter(r=>r.database_status==='CREATE_NEW_READY').length,review:rows.filter(r=>r.database_status==='REVIEW_REQUIRED').length}));
