#!/usr/bin/env python3
"""Script storico di importazione bulk del catalogo YMove (360 esercizi).

GIA' ESEGUITO CON SUCCESSO (2026-07-31): i 360 esercizi sono gia' in
produzione, verificato con query dirette su Supabase (docs/WORKLOG.md,
2026-08-01) — non serve rieseguirlo per ottenere lo stato attuale.

Conservato solo per riferimento storico. Scrive `exercises`/
`exercise_external_links` via REST diretto con la chiave anon,
BYPASSANDO interamente la pipeline sicura costruita in
supabase/functions/ymove-library-import (RPC
apply_ymove_safe_create_batch: verifica duplicati/contraddizioni,
revisione umana, match_status='manual_approved' invece di
'auto_imported' come qui sotto). Se in futuro serve un nuovo import di
massa, usare quella pipeline, non questo script.

NON VA MAI RIESEGUITO: la guardia sotto (RUN_HISTORICAL_IMPORT_BULK_SCRIPT)
blocca l'esecuzione finche' non viene impostata esplicitamente, per
evitare che venga lanciato per errore (es. da un tool che esegue "tutti
gli script .py della cartella").

NOTA (2026-08-02): `match_status='auto_imported'` scritto qui sotto NON
soddisfa piu' il CHECK constraint di public.exercise_external_links
(exercise_external_links_status_check, introdotto dalla pipeline sicura
in 20260816135000_ymove_safe_create_import_apply.sql: valori ammessi
solo 'manual_approved'/'rejected'/'removed') — un'eventuale riesecuzione
fallirebbe comunque con un errore Postgres 23514 sull'insert dei link,
anche a guardia rimossa. Non corretto qui (fuori mandato di questo
intervento, lo script resta di sola consultazione storica): segnalato
per onesta', non e' un problema silenzioso.

Richiede YMOVE_API_KEY e SUPABASE_ANON_KEY come variabili d'ambiente —
mai hardcoded nel sorgente (stesso principio gia' applicato da tutti
gli altri script in questa cartella, vedi sync-ymove-exercise-catalog.mjs).
"""
import os
import uuid
from datetime import datetime

import requests

if os.environ.get("RUN_HISTORICAL_IMPORT_BULK_SCRIPT") != "yes-i-am-sure":
    raise SystemExit(
        "Questo script e' storico e GIA' ESEGUITO (i 360 esercizi sono gia' "
        "in produzione). Non va rieseguito. Se sei assolutamente certo di "
        "volerlo rilanciare comunque, imposta la variabile d'ambiente "
        "RUN_HISTORICAL_IMPORT_BULK_SCRIPT=yes-i-am-sure ed esegui di nuovo "
        "questo comando."
    )


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(
            f"Errore: variabile d'ambiente {name} mancante. "
            "Non inserire mai questa chiave direttamente nel sorgente."
        )
    return value


YMOVE_API_KEY = _require_env("YMOVE_API_KEY")
SUPABASE_URL = "https://rkcecnzvzoigipjliwdk.supabase.co"
SUPABASE_ANON_KEY = _require_env("SUPABASE_ANON_KEY")

all_exercises = []
for batch in range(18):  # 18 batch x 20 = 360
    print(f"Batch {batch + 1}/18...")
    ymove_url = "https://exercise-api.ymove.app/api/v2/exercises?limit=20&includeVideos=false"
    headers = {"X-API-Key": YMOVE_API_KEY}
    response = requests.get(ymove_url, headers=headers, timeout=30)
    exercises = response.json().get("data", [])
    all_exercises.extend(exercises)
    print(f"Totale finora: {len(all_exercises)}")

print(f"\nTotale: {len(all_exercises)} esercizi")
fitcoach_exercises = []
for ex in all_exercises:
    fitcoach_exercises.append({
        "id": str(uuid.uuid4()),
        "name": ex.get("title", ""),
        "slug": ex.get("slug", ""),
        "description": ex.get("description"),
        "muscle_group": ex.get("muscleGroup"),
        "secondary_muscle_groups": ex.get("secondaryMuscles"),
        "equipment": ex.get("equipment"),
        "exercise_type": ex.get("exerciseType"),
        "difficulty": ex.get("difficulty"),
        "active": True,
        "visibility": "global",
        "coach_id": None,
        "source": "ymove",
        "ymove_exercise_id": ex.get("id"),
        "created_at": datetime.utcnow().isoformat() + "Z",
        "updated_at": datetime.utcnow().isoformat() + "Z",
    })

print("Inserimento esercizi...")
supabase_headers = {"Authorization": f"Bearer {SUPABASE_ANON_KEY}", "Content-Type": "application/json"}
insert_url = f"{SUPABASE_URL}/rest/v1/exercises"
response = requests.post(insert_url, headers=supabase_headers, json=fitcoach_exercises, timeout=120)
print(f"Inseriti {len(fitcoach_exercises)}")

# exercise_external_links rappresenta la relazione stabile "esercizio
# FitCoach <-> id esterno YMove" (join key: external_exercise_id), non "questo
# esercizio ha un video" — la presenza di un video e' un fatto separato,
# richiesto sempre live al momento della riproduzione (mai qui). Con
# includeVideos=false (browse mode) YMove non restituisce mai videoUrl, quindi
# filtrare su ex.get("videoUrl") escluderebbe SEMPRE tutti gli esercizi: creare
# il link per ogni esercizio con un id esterno valido, indipendentemente dalla
# presenza di un video.
video_links = [
    {
        "exercise_key": ex.get("slug"),
        "provider": "ymove",
        "external_exercise_id": ex.get("id"),
        "match_status": "auto_imported",
        "is_primary": True,
        "reviewed_by": None,
        "reviewed_at": datetime.utcnow().isoformat() + "Z",
    }
    for ex in all_exercises
    if ex.get("id")
]
link_url = f"{SUPABASE_URL}/rest/v1/exercise_external_links"
response = requests.post(link_url, headers=supabase_headers, json=video_links, timeout=120)
print(f"Collegati {len(video_links)}")
print(f"\nCompletato: {len(fitcoach_exercises)} esercizi, {len(video_links)} collegamenti")
