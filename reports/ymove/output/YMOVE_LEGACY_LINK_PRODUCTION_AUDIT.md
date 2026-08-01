# Audit produzione YMove legacy link

Data audit: 2026-07-31
Repository: `C:\Users\987246\OneDrive\Desktop\codex\lavoro`
Project ref atteso: `rkcecnzvzoigipjliwdk`

## Esito

**PRODUCTION_RISK_DETECTED**

I conteggi e lo stato reale di produzione non sono stati dichiarati verificati: nel repository principale non è disponibile una CLI Supabase locale, non esiste una configurazione `.supabase` collegata e non sono presenti credenziali/API key utilizzabili per query read-only. Il tentativo `npx.cmd --offline supabase --version` ha restituito `ENOTCACHED`.

Non sono state eseguite query remote, RPC, migration, deploy, build o scritture.

## Repository

- Branch: `main`
- HEAD: `b25ab7327fb30c33d6da882c1b33f52924056578`
- `3549f9f`: supporto chiavi legacy e fallback video
- `32426dd`: spostamento migration bridge in `supabase/pending_migrations`
- `b25ab73`: commit di implementazione dichiarata, non prova di stato remoto
- Working tree: pulito al momento dell’audit
- Migration bridge attive: non presenti in `supabase/migrations`
- Migration bridge locali: `supabase/pending_migrations/`

## Schema: evidenza locale, non schema remoto

La migration locale `20260816135000_ymove_safe_create_import_apply.sql` definisce `public.exercise_external_links` con:

- `exercise_id uuid` nullable, FK verso `public.exercises(id)`;
- `exercise_key text` nullable;
- `provider text not null`, check `ymove`;
- `external_exercise_id text not null`;
- `match_status`, check `manual_approved`, `rejected`, `removed`;
- `is_primary boolean not null default true`;
- check: almeno `exercise_id` oppure `exercise_key` valorizzato;
- unique partial index su provider/external ID per link primario approvato;
- unique partial index su provider/exercise_id per link primario approvato;
- unique partial index su provider/exercise_key per link primario approvato;
- RLS con SELECT per Superadmin e link YMove approvati per authenticated.

Questo supporterebbe sintatticamente il payload legacy richiesto, ma non è una verifica dello schema remoto né della validità della riga pilota in produzione.

## Implementazione locale verificata

- `normalizeLegacyExerciseKey()` in `supabase/functions/ymove-library-import/index.ts:1218` rimuove `legacy:`.
- `verifyLegacyExerciseMetadata()` in `:1230` verifica una corrispondenza esatta in `exercise_movement_metadata`.
- `verifyNoExistingLegacyLink()` in `:1263` cerca link YMove primari approvati per `exercise_key`.
- `pilot_link_preflight` in `:1276` richiede run, external ID, target, stato semantico, decisione, score e assenza contraddizioni.
- `approve_pilot_link` in `:1318` aggiorna staging con `decision=approved_link` e chiave legacy senza prefisso.
- `apply_pilot_link` in `:1361` chiama la RPC lockdown e limita l’external ID al pilota.
- Il routing espone anche `apply_approved_batch`; il blocco effettivo dipende dal corpo di `actionApplyApprovedBatch` e non è stato verificato in produzione.
- La funzione media usa `YMOVE_API_KEY` solo server-side e riceve `exercise_key` o `exercise_id`; questo è verificato solo staticamente.

## Finding video

`mobile/src/lib/exercise-video-service.ts:getExerciseVideo()` cerca prima `exercise_videos` per `exercise_id` e, se trova `ymove_exercise_id`, restituisce YMove prima di considerare `video_url`. Solo in assenza di una riga valorizzata interroga `exercise_external_links`.

Quindi la precedenza effettiva non dimostra “video manuale prima di YMove”. Il playback reale e l’assenza di URL firmati persistiti non sono stati testati.

## Dati produzione richiesti ma non verificati

Le seguenti quantità restano **NON VERIFICABILI** senza accesso SQL read-only autenticato:

- numero esatto di link YMove legacy primari;
- elenco link e duplicati;
- stato della riga Barbell Curls;
- score reale `96` contro `92.5`;
- conteggio candidati legacy e approvazioni;
- stato dei 11 record incidentali;
- stato migration remoto;
- log Edge Function e metriche ultime 24 ore.

I file/report locali precedenti indicano elementi `PENDING` e non sono prova dello stato attuale di produzione.

## Decisione

`PRODUCTION_RISK_DETECTED`: implementazione locale presente, ma audit remoto incompleto e precedenza video non coerente con il requisito dichiarato. Servono una sessione CLI Supabase autenticata sul progetto `rkcecnzvzoigipjliwdk` oppure credenziali read-only fornite direttamente nell’ambiente, senza stamparle o salvarle.
