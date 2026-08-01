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

Richiede YMOVE_API_KEY e SUPABASE_ANON_KEY come variabili d'ambiente —
mai hardcoded nel sorgente (stesso principio gia' applicato da tutti
gli altri script in questa cartella, vedi sync-ymove-exercise-catalog.mjs).
"""
import os
import uuid
from datetime import datetime

import requests


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
    ymove_url = "https://exercise-api.ymove.app/api/v2/exercises?limit=20&includeVideos=true"
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
    if ex.get("videoUrl")
]
link_url = f"{SUPABASE_URL}/rest/v1/exercise_external_links"
response = requests.post(link_url, headers=supabase_headers, json=video_links, timeout=120)
print(f"Collegati {len(video_links)}")
print(f"\nCompletato: {len(fitcoach_exercises)} esercizi, {len(video_links)} video")
