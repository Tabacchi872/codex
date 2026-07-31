import fs from 'node:fs';
function parse(text) { const lines = text.trim().split(/\r?\n/); const h=lines.shift().split(','); return lines.map(l=>{const v=l.split(','); return Object.fromEntries(h.map((x,i)=>[x,v[i]??'']));}); }
const safe=parse(fs.readFileSync('reports/ymove/output/ymove-exercise-names-safe.csv','utf8'));
const ids=safe.map(r=>`('${r.external_exercise_id.replaceAll("'", "''")}')`).join(',');
const sql=`with ids(external_exercise_id) as (values ${ids})
select ids.external_exercise_id,
       e.id as existing_exercise_id,e.name as existing_exercise_name,e.slug as existing_exercise_key,
       e.active,e.library_status,e.source_metadata,
       l.external_exercise_id as linked_external_id,l.match_status,l.is_primary,
       c.classification,c.decision,c.approved_italian_name,c.approved_existing_exercise_key
from ids
left join public.exercises e on e.ymove_exercise_id=ids.external_exercise_id
left join public.exercise_external_links l on l.external_exercise_id=ids.external_exercise_id and l.provider='ymove'
left join public.ymove_library_import_candidates c on c.import_run_id='b2a8cb33-061b-489e-bbe5-c2fce38d0ecc' and c.external_exercise_id=ids.external_exercise_id
order by ids.external_exercise_id;`;
fs.writeFileSync('reports/ymove/output/ymove-safe-reconciliation.sql',sql,'utf8');
