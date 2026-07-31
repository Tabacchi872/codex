# Legacy Bridge Test Project

Status: `TEST_PROJECT_NOT_CONFIGURED`

Production project `rkcecnzvzoigipjliwdk` was not modified. No second Supabase project ref or isolated credentials were configured. Docker and Podman are unavailable, so migrations, idempotence, rollback, RLS, and video precedence were not executed against a database.

## Local preparation

- Architecture migration: `20260816145000_add_legacy_bridge_architecture.sql`
- Pilot migration: `20260816145100_canonicalize_barbell_curl_legacy.sql`
- Rollback: `rollback-canonical-barbell-curl.sql`
- `record_kind` values: `exercise`, `legacy_bridge`
- Bridge source: `legacy`
- Bridge visibility: `active=true`, `library_status=hidden`, `auto_program_eligible=false`
- Selectable view: `public.selectable_exercises`, `security_invoker=true`

## Remote read-only baseline

- Legacy metadata row: 1
- Template references: 9
- Workout-day references: 3
- Alternative source references: 2
- Alternative target references: 2
- Legacy video references: 1
- Total non-zero legacy references: 18
- Canonical bridge UUID: 0
- Pilot identity keys: 0
- Pilot YMove links: 0

## Blocking condition

The isolated test project is not configured. Do not apply either migration to production until the test project is supplied and the full test matrix passes.
