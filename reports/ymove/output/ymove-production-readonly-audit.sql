-- YMOVE PRODUCTION READ-ONLY AUDIT
-- Project: rkcecnzvzoigipjliwdk
-- Every executable statement in this file is a SELECT.

-- A. exercise_external_links columns
SELECT table_schema, table_name, ordinal_position, column_name,
       data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('exercise_external_links', 'ymove_library_import_candidates',
                     'exercise_movement_metadata', 'exercise_videos',
                     'exercises', 'exercise_identity_keys')
ORDER BY table_name, ordinal_position;

-- A. Constraints
SELECT n.nspname AS schema_name, c.relname AS table_name,
       con.conname AS constraint_name, con.contype,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('exercise_external_links', 'ymove_library_import_candidates',
                    'exercise_movement_metadata', 'exercise_videos',
                    'exercises', 'exercise_identity_keys')
ORDER BY c.relname, con.conname;

-- A. Indexes
SELECT schemaname, tablename, indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('exercise_external_links', 'ymove_library_import_candidates',
                    'exercise_movement_metadata', 'exercise_videos',
                    'exercises', 'exercise_identity_keys')
ORDER BY tablename, indexname;

-- A. RLS and policies
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS row_security_enabled,
       c.relforcerowsecurity AS row_security_forced
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('exercise_external_links', 'ymove_library_import_candidates',
                    'exercise_movement_metadata', 'exercise_videos',
                    'exercises', 'exercise_identity_keys')
ORDER BY c.relname;

SELECT schemaname, tablename, policyname, permissive, roles,
       cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('exercise_external_links', 'ymove_library_import_candidates',
                    'exercise_movement_metadata', 'exercise_videos',
                    'exercises', 'exercise_identity_keys')
ORDER BY tablename, policyname;

-- B. Exact count of approved primary legacy-key links
SELECT count(*) AS legacy_ymove_primary_manual_approved
FROM public.exercise_external_links
WHERE provider = 'ymove'
  AND exercise_key IS NOT NULL
  AND match_status = 'manual_approved'
  AND is_primary = true;

-- C. Complete legacy-key link list
SELECT id, exercise_key, external_exercise_id, created_at,
       match_status, is_primary, reviewed_by
FROM public.exercise_external_links
WHERE provider = 'ymove'
  AND exercise_key IS NOT NULL
  AND match_status = 'manual_approved'
  AND is_primary = true
ORDER BY created_at, id;

-- D1. Duplicate external IDs among primary approved links
SELECT provider, external_exercise_id, count(*) AS link_count,
       array_agg(id ORDER BY id) AS link_ids
FROM public.exercise_external_links
WHERE is_primary = true
  AND match_status = 'manual_approved'
GROUP BY provider, external_exercise_id
HAVING count(*) > 1
ORDER BY provider, external_exercise_id;

-- D2. Duplicate primary legacy keys
SELECT provider, exercise_key, count(*) AS link_count,
       array_agg(id ORDER BY id) AS link_ids
FROM public.exercise_external_links
WHERE exercise_key IS NOT NULL
  AND is_primary = true
  AND match_status = 'manual_approved'
GROUP BY provider, exercise_key
HAVING count(*) > 1
ORDER BY provider, exercise_key;

-- E. Barbell Curls staging and real link
SELECT c.import_run_id, c.external_exercise_id, c.classification,
       c.semantic_review_status, c.score,
       c.contradiction_flags, c.contradictions, c.decision,
       c.approved_existing_exercise_key, c.reviewed_at,
       l.id AS link_id, l.exercise_key, l.exercise_id,
       l.match_status, l.is_primary
FROM public.ymove_library_import_candidates c
LEFT JOIN public.exercise_external_links l
  ON l.provider = 'ymove'
 AND l.external_exercise_id = c.external_exercise_id
WHERE c.external_exercise_id = '1158c681-55e9-4db0-bb73-3dab32d99aa5'
ORDER BY c.created_at DESC;

-- F. Candidate counts, using exact stored fields where available
WITH candidates AS (
  SELECT c.*, e.library_status AS existing_library_status,
         lower(coalesce(c.semantic_review_status, '')) IN
           ('link_existing_ready', 'link_existing_verified') AS semantic_link,
         coalesce(c.approved_existing_exercise_key,
                  c.compared_existing_exercise_key,
                  c.existing_exercise_key) IS NOT NULL AS has_legacy_target,
         coalesce(c.contradiction_flags, c.contradictions, '[]'::jsonb) <> '[]'::jsonb AS has_contradictions
  FROM public.ymove_library_import_candidates c
  LEFT JOIN public.exercises e ON e.id = c.existing_exercise_id
)
SELECT
  count(*) FILTER (WHERE has_legacy_target) AS total_legacy_candidates,
  count(*) FILTER (WHERE classification = 'LINK_EXISTING') AS link_existing,
  count(*) FILTER (WHERE semantic_link) AS semantically_verified,
  count(*) FILTER (WHERE decision = 'approved_link') AS approved_links,
  count(*) FILTER (WHERE has_legacy_target AND decision IS NULL) AS not_approved,
  count(*) FILTER (WHERE score >= 92) AS score_at_least_92,
  count(*) FILTER (WHERE score < 92) AS score_below_92,
  count(*) FILTER (WHERE has_contradictions) AS with_contradictions,
  count(*) FILTER (WHERE lower(coalesce(c.existing_library_status, '')) IN ('hidden', 'quarantined')) AS hidden_or_quarantined,
  count(*) FILTER (WHERE decision IN ('excluded', 'rejected')) AS excluded,
  count(*) FILTER (WHERE lower(coalesce(c.semantic_review_status, '')) = 'exclude_editorial_duplicate') AS editorial_duplicates
FROM candidates c;

-- F. Actually created approved links, separate from candidates
SELECT count(*) AS real_approved_primary_links
FROM public.exercise_external_links
WHERE provider = 'ymove' AND match_status = 'manual_approved' AND is_primary = true;

-- G. Incident exercises and their links
WITH incident_exercises AS (
  SELECT e.id, e.name, e.name_en, e.ymove_exercise_id,
         e.active, e.auto_program_eligible, e.library_status,
         e.source_metadata
  FROM public.exercises e
  WHERE (e.source_metadata ? 'incident_quarantine')
     OR (e.active = false AND e.auto_program_eligible = false AND e.library_status = 'hidden')
)
SELECT ie.*, l.id AS link_id, l.exercise_key, l.external_exercise_id,
       l.match_status, l.is_primary
FROM incident_exercises ie
LEFT JOIN public.exercise_external_links l
  ON l.exercise_id = ie.id
  OR l.external_exercise_id = ie.ymove_exercise_id
ORDER BY ie.ymove_exercise_id, l.id;

-- G. Incident references in known application tables
WITH incident_ids AS (
  SELECT e.id
  FROM public.exercises e
  WHERE e.source_metadata ? 'incident_quarantine'
     OR (e.active = false AND e.auto_program_eligible = false AND e.library_status = 'hidden')
)
SELECT 'workout_template_exercises' AS table_name, count(*) AS references_count
FROM public.workout_template_exercises w WHERE w.exercise_id IN (SELECT id FROM incident_ids)
UNION ALL
SELECT 'workout_day_exercises', count(*) FROM public.workout_day_exercises w WHERE w.exercise_id IN (SELECT id FROM incident_ids)
UNION ALL
SELECT 'exercise_progress_history', count(*) FROM public.exercise_progress_history w WHERE w.exercise_id IN (SELECT id FROM incident_ids)
UNION ALL
SELECT 'client_cycle_exercise_transitions', count(*) FROM public.client_cycle_exercise_transitions w WHERE w.exercise_id IN (SELECT id FROM incident_ids)
UNION ALL
SELECT 'client_excluded_exercises', count(*) FROM public.client_excluded_exercises w WHERE w.exercise_id IN (SELECT id FROM incident_ids)
UNION ALL
SELECT 'exercise_videos', count(*) FROM public.exercise_videos w WHERE w.exercise_id IN (SELECT id::text FROM incident_ids);

-- H. Migration history: Supabase CLI history table
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260816145000', '20260816145100')
ORDER BY version;

-- H. Presence check for the history table, if the preceding query is unavailable
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'supabase_migrations'
  AND table_name = 'schema_migrations';


