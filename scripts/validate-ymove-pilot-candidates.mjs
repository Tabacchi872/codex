import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve('reports/ymove/output');
function parse(t){const rows=[];let row=[],cell='',q=false;for(let i=0;i<t.length;i++){const c=t[i],n=t[i+1];if(q){if(c==='"'&&n==='"'){cell+='"';i++}else if(c==='"')q=false;else cell+=c}else if(c==='"')q=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}else cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}const h=rows.shift();return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(h.map((x,i)=>[x,r[i]??''])))}
function esc(v){const s=String(v??'');return /[",\n\r]/.test(s)?`"${s.replaceAll('"','""')}"`:s}
function write(name,rows,cols){fs.writeFileSync(path.join(dir,name),`${cols.join(',')}\n${rows.map(r=>cols.map(c=>esc(r[c])).join(',')).join('\n')}\n`,'utf8')}
const recon=parse(fs.readFileSync(path.join(dir,'ymove-safe-staging-reconciliation.csv'),'utf8'));
const cat=new Map(parse(fs.readFileSync(path.join(dir,'ymove-catalog-simple.csv'),'utf8')).map(r=>[r.external_exercise_id,r]));
const links=parse(fs.readFileSync(path.join(dir,'ymove-link-existing-safe.csv'),'utf8'));
const linkKeys=new Map(links.map(r=>[r.external_exercise_id,r]));
const readyLinks=recon.filter(r=>r.database_status==='LINK_EXISTING_READY').map(r=>({...r,...(linkKeys.get(r.external_exercise_id)||{})}));
const readyNew=recon.filter(r=>r.database_status==='CREATE_NEW_READY');
const enriched=[...readyLinks,...readyNew].map(r=>{const c=cat.get(r.external_exercise_id)||{};return {...r,category:/stretch|l sit|hold|mobility|pose/i.test(r.ymove_title)?'mobility/static':/jump|hop|steps|burpee|body builder/i.test(r.ymove_title)?'conditioning/plyometric':'strength',primary_muscle:c.primary_muscles||'',equipment:c.equipment||'',position:c.body_position||'',variant:/knees|hanging|single|one leg|alternating|behind|low to high|wide|close/i.test(r.ymove_title)?'technical variant':'standard',source_confidence:'90',similar_records:'',match_score:r.score||'',contradictions:r.contradictions||'',reason:r.blocking_reason||r.reasons||'No FitCoach equivalent in the reconciled inventory.'}});
const cols=['external_exercise_id','ymove_title','final_italian_name','source_file_status','database_status','existing_exercise_id','existing_exercise_key','existing_link_status','category','primary_muscle','equipment','position','variant','source_confidence','similar_records','match_score','contradictions','reason'];
write('ymove-final-27-validation.csv',enriched,cols);
const pilotLink=readyLinks.find(r=>r.external_exercise_id==='1158c681-55e9-4db0-bb73-3dab32d99aa5')||readyLinks[0];
const pilotNew=readyNew.find(r=>r.external_exercise_id==='044f938a-5772-4a0e-b39a-8a85393830e7')||readyNew.find(r=>/Tucked L-sit hold/.test(r.ymove_title))||readyNew[0];
const pilotCols=['external_exercise_id','ymove_title','final_italian_name','existing_exercise_id','existing_exercise_key','match_score','database_status','pilot_reason'];
write('ymove-pilot-link-one.csv',[{...pilotLink,match_score:pilotLink.score||'',pilot_reason:'Corrispondenza diretta con curl bilanciere legacy; nessun incidente o variante ambigua.'}],pilotCols);
write('ymove-pilot-create-one.csv',[{...pilotNew,pilot_reason:'Esercizio statico semplice, non composto, non incidentale e senza equivalente FitCoach riconciliato.'}],pilotCols);
fs.writeFileSync(path.join(dir,'ymove-final-27-validation-summary.json'),JSON.stringify({link_ready:readyLinks.length,create_ready:readyNew.length,blocked:recon.filter(r=>r.database_status==='BLOCKED_INCIDENT_HIDDEN').length,pilot_link:pilotLink?.external_exercise_id,pilot_create:pilotNew?.external_exercise_id,import_status:'IMPORT_TEMPORARILY_DISABLED'},null,2),'utf8');
console.log(JSON.stringify({link_ready:readyLinks.length,create_ready:readyNew.length,pilot_link:pilotLink?.ymove_title,pilot_create:pilotNew?.ymove_title}));
