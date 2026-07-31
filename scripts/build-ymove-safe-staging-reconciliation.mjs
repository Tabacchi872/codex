import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve('reports/ymove/output');
function csv(text){const lines=text.trim().split(/\r?\n/);const h=lines.shift().split(',');return lines.map(l=>{const v=l.split(',');return Object.fromEntries(h.map((x,i)=>[x,v[i]??'']))})}
function esc(v){const s=String(v??'');return /[",\n\r]/.test(s)?`"${s.replaceAll('"','""')}"`:s}
function write(name, rows, cols){fs.writeFileSync(path.join(dir,name),`${cols.join(',')}\n${rows.map(r=>cols.map(c=>esc(r[c])).join(',')).join('\n')}\n`,'utf8')}
const safe=csv(fs.readFileSync(path.join(dir,'ymove-exercise-names-safe.csv'),'utf8'));
const linkIds=new Set(csv(fs.readFileSync(path.join(dir,'ymove-link-existing-safe.csv'),'utf8')).map(r=>r.external_exercise_id));
const createIds=new Set(csv(fs.readFileSync(path.join(dir,'ymove-create-new-safe.csv'),'utf8')).map(r=>r.external_exercise_id));
const catalog=new Map(csv(fs.readFileSync(path.join(dir,'ymove-catalog-simple.csv'),'utf8')).map(r=>[r.external_exercise_id,r]));
const existing={
  'a64ffb04-76a7-431a-a9a5-6addeab61813':{id:'2c600fe6-9d44-43dd-9389-239bcd455db0',name:'Ab Rollout con bilanciere',active:true,library:'pending_review',link:'manual_approved',primary:true,quarantine:false},
  '31a0d4f4-2ad8-4f51-b47f-e7dc05e787f3':{id:'da5c5923-ea30-4034-9e7d-cf3cef002f9c',name:'Ab rollout in ginocchio con bilanciere',active:true,library:'pending_review',link:'manual_approved',primary:true,quarantine:false},
  '069c1e6b-05f4-4390-a1c7-9b740e0bec4a':{id:'2fe578b7-8cf8-42d5-98f8-95362ad6f5b4',name:'Alzate frontali con bilanciere',active:false,library:'hidden',link:'removed',primary:false,quarantine:true},
  '65e95132-e6bb-41e8-af7d-0eda931a1693':{id:'51b8b377-e214-4efc-a077-f7bfdfe7aef9',name:'Back Squat con bilanciere',active:false,library:'hidden',link:'removed',primary:false,quarantine:true},
  '4e4377e1-ab91-4015-84ac-27b3274b549f':{id:'3f810135-05b4-44c1-8bc5-7c3c70c8d63e',name:'Shoulder Press con bilanciere',active:false,library:'hidden',link:'removed',primary:false,quarantine:true},
  'c0bd82fb-5ad6-4390-a060-dd46c1a6bea2':{id:'7c4fb5c1-04f3-41c2-ab61-327dc02a0f16',name:'Overhead Press con bilanciere',active:false,library:'hidden',link:'removed',primary:false,quarantine:true},
  'f71ef5e3-8944-40df-b9ea-00a7b0e6c5cc':{id:'3d2ad049-5d1c-423f-88ec-afc205b7cfbb',name:'Push Press con bilanciere',active:false,library:'hidden',link:'removed',primary:false,quarantine:true},
  '4c55ca15-3665-4db7-b11d-7d4273263f66':{id:'bf898d7d-622d-4cae-b469-0e8a40de8204',name:'1 Leg Broad Jump',active:true,library:'active',link:null,primary:null,quarantine:false},
  '9a68f965-4e58-4b5b-87d5-c44929dd1f39':{id:'37b24c41-3f75-4f08-9812-4c10464fc13a',name:'Banded squat',active:true,library:'active',link:null,primary:null,quarantine:false},
};
const linkKeys={
  '1158c681-55e9-4db0-bb73-3dab32d99aa5':'legacy:bicipiti-curl-bilanciere',
  '24030adc-de07-4547-a916-24acee3d5a3e':'legacy:cardio-burpees',
  '5990deac-a91d-4531-8c2f-a708fc95fd1f':'legacy:gambe-hip-thrust',
};
const linkScore={'1158c681-55e9-4db0-bb73-3dab32d99aa5':'96','24030adc-de07-4547-a916-24acee3d5a3e':'96','5990deac-a91d-4531-8c2f-a708fc95fd1f':'96'};
const rows=[];
for(const r of safe){
  const id=r.external_exercise_id, e=existing[id];
  let dbStatus='REVIEW_REQUIRED', proposed='REVIEW_REQUIRED', reason='';
  if(e?.active===true && e.link==='manual_approved' && e.primary===true) {dbStatus='ALREADY_IMPORTED_VALID'; proposed=dbStatus;}
  else if(e?.quarantine || e?.library==='hidden' || e?.link==='removed') {dbStatus='BLOCKED_INCIDENT_HIDDEN'; proposed=dbStatus; reason='Esercizio dell’incidente già nascosto e link rimosso; non riattivare.';}
  else if(e) {dbStatus='REVIEW_REQUIRED'; proposed=dbStatus; reason='External ID già presente ma senza link YMove manual_approved primario valido.';}
  else if(linkIds.has(id) && linkKeys[id]) {dbStatus='LINK_EXISTING_READY'; proposed=dbStatus;}
  else if(createIds.has(id)) {dbStatus='CREATE_NEW_READY'; proposed=dbStatus;}
  else {dbStatus='REVIEW_REQUIRED'; proposed=dbStatus; reason='Candidato semanticamente non definitivo.';}
  rows.push({external_exercise_id:id,ymove_title:r.ymove_title,final_italian_name:r.final_italian_name,source_file_status:linkIds.has(id)?'LINK_EXISTING_VERIFIED':createIds.has(id)?'CREATE_NEW_VERIFIED':'REVIEW_POSSIBLE_MATCH',database_status:dbStatus,existing_exercise_id:e?.id??'',existing_exercise_key:e?.id?`uuid:${e.id}`:(linkKeys[id]??''),existing_link_status:e?.link??'',incident_quarantine:e?.quarantine?'ymove_import_incident_2026_07_30_1531_utc':'',duplicate_primary_external_id:'',proposed_staging_status:proposed,blocking_reason:reason});
}
const cols=['external_exercise_id','ymove_title','final_italian_name','source_file_status','database_status','existing_exercise_id','existing_exercise_key','existing_link_status','incident_quarantine','duplicate_primary_external_id','proposed_staging_status','blocking_reason'];
write('ymove-safe-staging-reconciliation.csv',rows,cols);
const counts={names_safe:rows.length,already_imported_valid:rows.filter(r=>r.database_status==='ALREADY_IMPORTED_VALID').length,link_existing_ready:rows.filter(r=>r.database_status==='LINK_EXISTING_READY').length,create_new_ready:rows.filter(r=>r.database_status==='CREATE_NEW_READY').length,blocked_incident_hidden:rows.filter(r=>r.database_status==='BLOCKED_INCIDENT_HIDDEN').length,editorial_duplicates:rows.filter(r=>r.database_status==='EDITORIAL_DUPLICATE').length,review_required:rows.filter(r=>r.database_status==='REVIEW_REQUIRED').length,invalid_rows:rows.filter(r=>!r.final_italian_name).length};
fs.writeFileSync(path.join(dir,'ymove-safe-staging-summary.json'),JSON.stringify(counts,null,2),'utf8');
// Generate one SQL transaction for the semantic-only staging update. It is intentionally not executed by this script.
const values=rows.map(r=>{const semantic=r.database_status==='ALREADY_IMPORTED_VALID'||r.database_status==='LINK_EXISTING_READY'?'LINK_EXISTING_VERIFIED':r.database_status==='CREATE_NEW_READY'?'CREATE_NEW_RESEARCHED':r.database_status==='REVIEW_REQUIRED'?'REVIEW_POSSIBLE_MATCH':'RESEARCH_REQUIRED';const key=r.database_status==='LINK_EXISTING_READY'?linkKeys[r.external_exercise_id]:'';const score=r.database_status==='LINK_EXISTING_READY'?(linkScore[r.external_exercise_id]??'null'):'null';const reason=r.blocking_reason||`Master italiano verificato; stato riconciliato: ${r.proposed_staging_status}.`;const q=(v)=>`'${String(v??'').replaceAll("'","''")}'`;return `(${q(r.external_exercise_id)},${q(r.final_italian_name)},${q(semantic)},${q(key)},${score},${q(reason)})`}).join(',\n');
const sql=`begin;\nwith v(external_exercise_id,italian_name,semantic_status,existing_key,match_score,reason) as (values\n${values}\n)\nupdate public.ymove_library_import_candidates c\nset researched_italian_name=v.italian_name, research_status='verified', source_confidence=90, research_sources='[{"source":"validated_local_master","title":"ymove-exercise-names-validated.csv"}]'::jsonb, research_algorithm_version='ymove-italian-master-2026-07-31-v1', researched_at=now(), semantic_review_status=v.semantic_status, compared_existing_exercise_key=nullif(v.existing_key,''), match_score=v.match_score, match_reason=v.reason, contradiction_flags='[]'::jsonb, updated_at=now()\nfrom v\nwhere c.import_run_id='b2a8cb33-061b-489e-bbe5-c2fce38d0ecc' and c.external_exercise_id=v.external_exercise_id;\ncommit;`;
const safeSql=sql.replace("research_status='verified'",'research_status=v.semantic_status').replace('match_score=v.match_score','score=v.match_score');
fs.writeFileSync(path.join(dir,'ymove-safe-staging-update.sql'),safeSql,'utf8');
console.log(JSON.stringify(counts));
