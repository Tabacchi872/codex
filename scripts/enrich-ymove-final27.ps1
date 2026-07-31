$dir='reports/ymove/output'
$finalCorrectionIds=@('3620635f-3fcb-4552-8959-dc6ec09d9ea2','4001ef61-57a1-4f18-8c0b-8167e15c6832','42dc0603-91e8-4a1e-8bf0-ef9478718106','7a94a32f-40d9-42eb-b03d-afe76c71ea36','83b448e2-7782-42ff-bcf6-1ce7a7e9a5a4','b771f714-b1dc-49f8-8df5-9f8ae35bbbae','c67b0b0a-c636-4cff-9628-8ecd1e5482ca','ee79ed25-3455-4730-acd9-5173de6085c9')
$rows=Import-Csv "$dir/ymove-safe-staging-reconciliation.csv" | Where-Object {($_.database_status -in @('LINK_EXISTING_READY','CREATE_NEW_READY')) -or ($finalCorrectionIds -contains $_.external_exercise_id)}
$catalog=Import-Csv "$dir/ymove-catalog-simple.csv"
$links=Import-Csv "$dir/ymove-link-existing-safe.csv"
$linkMap=@{}; foreach($x in $links){$linkMap[$x.external_exercise_id]=$x}
$out=@()
foreach($r in $rows){
  $c=$catalog|Where-Object external_exercise_id -eq $r.external_exercise_id|Select-Object -First 1
  $l=$linkMap[$r.external_exercise_id]
  $title=$r.ymove_title.ToLowerInvariant()
  $category=if($title -match 'stretch|l-sit|hold|mobility|pose'){ 'mobility/static' } elseif($title -match 'jump|hop|steps|burpee|body builder'){ 'conditioning/plyometric' } else {'strength'}
  $variant=if($title -match 'knees|hanging|single|one leg|alternating|behind|low to high|wide|close'){ 'technical variant' } else {'standard'}
  $out += [pscustomobject]@{external_exercise_id=$r.external_exercise_id;ymove_title=$r.ymove_title;final_italian_name=$r.final_italian_name;source_file_status=$r.source_file_status;database_status=$r.database_status;existing_exercise_id=$r.existing_exercise_id;existing_exercise_key=$r.existing_exercise_key;existing_link_status=$r.existing_link_status;category=$category;primary_muscle=$c.primary_muscles;equipment=$c.equipment;position=$c.body_position;variant=$variant;source_confidence=90;similar_records='';match_score=if($l){$l.score}else{''};contradictions='';reason=if($r.database_status -eq 'LINK_EXISTING_READY'){'Tecnica e alias compatibili; nessuna contraddizione bloccante.'}else{'Nessun equivalente FitCoach riconciliato; candidato da importare solo dopo approvazione.'}}
}
$out|Export-Csv "$dir/ymove-final-27-validation.csv" -NoTypeInformation -Encoding utf8
$pilotLink=$out|Where-Object {$_.external_exercise_id -eq '1158c681-55e9-4db0-bb73-3dab32d99aa5'}|Select-Object -First 1
$pilotNew=$out|Where-Object {$_.external_exercise_id -eq 'aa3d8f09-8870-4ec1-aada-7760020dfeaa'}|Select-Object -First 1
[pscustomobject]@{external_exercise_id=$pilotLink.external_exercise_id;ymove_title=$pilotLink.ymove_title;final_italian_name=$pilotLink.final_italian_name;existing_exercise_id=$pilotLink.existing_exercise_id;existing_exercise_key=$pilotLink.existing_exercise_key;match_score=$pilotLink.match_score;database_status=$pilotLink.database_status;pilot_reason='Corrispondenza diretta con curl bilanciere legacy; nessun incidente o variante ambigua.'}|Export-Csv "$dir/ymove-pilot-link-one.csv" -NoTypeInformation -Encoding utf8
[pscustomobject]@{external_exercise_id=$pilotNew.external_exercise_id;ymove_title=$pilotNew.ymove_title;final_italian_name=$pilotNew.final_italian_name;existing_exercise_id=$pilotNew.existing_exercise_id;existing_exercise_key=$pilotNew.existing_exercise_key;match_score=$pilotNew.match_score;database_status=$pilotNew.database_status;pilot_reason='Movimento semplice, attrezzatura cavo e direzione low-to-high chiare; nessun equivalente FitCoach validato.'}|Export-Csv "$dir/ymove-pilot-create-one.csv" -NoTypeInformation -Encoding utf8
$summary=[pscustomobject]@{total_27=$out.Count;link_ready=@($out|Where-Object database_status -eq 'LINK_EXISTING_READY').Count;create_ready=@($out|Where-Object database_status -eq 'CREATE_NEW_READY').Count;review_required=@($out|Where-Object database_status -eq 'REVIEW_REQUIRED').Count;blocked_incident_hidden=@((Import-Csv "$dir/ymove-safe-staging-reconciliation.csv"|Where-Object database_status -eq 'BLOCKED_INCIDENT_HIDDEN')).Count;pilot_link=$pilotLink.external_exercise_id;pilot_create=$pilotNew.external_exercise_id;import_status='IMPORT_TEMPORARILY_DISABLED'}
$summary|ConvertTo-Json|Set-Content "$dir/ymove-final-27-validation-summary.json" -Encoding utf8
