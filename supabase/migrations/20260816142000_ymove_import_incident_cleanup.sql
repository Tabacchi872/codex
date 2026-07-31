-- Optional incident cleanup for the 2026-07-30 15:31 UTC YMove import.
-- Do not apply before manual review. Uses explicit exercise UUID + YMove external ID pairs.

do $$
declare
  v_target_count integer;
  v_legitimate_count integer;
begin
  with incident_targets(exercise_id, external_exercise_id) as (
    values
      ('2fe578b7-8cf8-42d5-98f8-95362ad6f5b4'::uuid, '069c1e6b-05f4-4390-a1c7-9b740e0bec4a'),
      ('51b8b377-e214-4efc-a077-f7bfdfe7aef9'::uuid, '65e95132-e6bb-41e8-af7d-0eda931a1693'),
      ('2d25a834-c421-46be-90bf-4becb8fb4745'::uuid, '74c36be0-d1e4-4703-8c54-612c2da1dcc1'),
      ('73f994ed-9fe8-4335-bb5f-3c203a29f991'::uuid, 'b853fd08-4739-4239-a825-8c31826d54ba'),
      ('cc44af5d-ddc0-4fbb-b6fd-f57c7e13ad16'::uuid, '7d31d648-432b-4edd-97bc-afc2a3e9e59a'),
      ('81ad0e7b-a6b2-4aca-af4c-85e2bb8639b8'::uuid, '0e5f29cd-ff79-428a-bb1c-1753a9047f32'),
      ('7c4fb5c1-04f3-41c2-ab61-327dc02a0f16'::uuid, 'c0bd82fb-5ad6-4390-a060-dd46c1a6bea2'),
      ('e40bc685-715e-4c4f-bb70-b53f45fe8d59'::uuid, '2fb79823-a759-4ceb-8b16-a26ab3cfb440'),
      ('3d2ad049-5d1c-423f-88ec-afc205b7cfbb'::uuid, 'f71ef5e3-8944-40df-b9ea-00a7b0e6c5cc'),
      ('3f810135-05b4-44c1-8bc5-7c3c70c8d63e'::uuid, '4e4377e1-ab91-4015-84ac-27b3274b549f'),
      ('d6ff9fa6-5b44-44d9-8904-5769532acf59'::uuid, 'a363775e-2aa5-49cb-ac17-7aa137d5d47b')
  )
  select count(*)
  into v_target_count
  from incident_targets t
  join public.exercises e
    on e.id = t.exercise_id
   and e.ymove_exercise_id = t.external_exercise_id
   and e.source = 'ymove';

  if v_target_count <> 11 then
    raise exception 'YMOVE_INCIDENT_CLEANUP_TARGET_MISMATCH expected=11 found=%', v_target_count;
  end if;

  with legitimate(exercise_id, external_exercise_id) as (
    values
      ('2c600fe6-9d44-43dd-9389-239bcd455db0'::uuid, 'a64ffb04-76a7-431a-a9a5-6addeab61813'),
      ('da5c5923-ea30-4034-9e7d-cf3cef002f9c'::uuid, '31a0d4f4-2ad8-4f51-b47f-e7dc05e787f3')
  )
  select count(*)
  into v_legitimate_count
  from legitimate l
  join public.exercises e
    on e.id = l.exercise_id
   and e.ymove_exercise_id = l.external_exercise_id
   and e.source = 'ymove';

  if v_legitimate_count <> 2 then
    raise exception 'YMOVE_INCIDENT_CLEANUP_LEGITIMATE_MISMATCH expected=2 found=%', v_legitimate_count;
  end if;
end $$;

with incident_targets(exercise_id, external_exercise_id) as (
  values
    ('2fe578b7-8cf8-42d5-98f8-95362ad6f5b4'::uuid, '069c1e6b-05f4-4390-a1c7-9b740e0bec4a'),
    ('51b8b377-e214-4efc-a077-f7bfdfe7aef9'::uuid, '65e95132-e6bb-41e8-af7d-0eda931a1693'),
    ('2d25a834-c421-46be-90bf-4becb8fb4745'::uuid, '74c36be0-d1e4-4703-8c54-612c2da1dcc1'),
    ('73f994ed-9fe8-4335-bb5f-3c203a29f991'::uuid, 'b853fd08-4739-4239-a825-8c31826d54ba'),
    ('cc44af5d-ddc0-4fbb-b6fd-f57c7e13ad16'::uuid, '7d31d648-432b-4edd-97bc-afc2a3e9e59a'),
    ('81ad0e7b-a6b2-4aca-af4c-85e2bb8639b8'::uuid, '0e5f29cd-ff79-428a-bb1c-1753a9047f32'),
    ('7c4fb5c1-04f3-41c2-ab61-327dc02a0f16'::uuid, 'c0bd82fb-5ad6-4390-a060-dd46c1a6bea2'),
    ('e40bc685-715e-4c4f-bb70-b53f45fe8d59'::uuid, '2fb79823-a759-4ceb-8b16-a26ab3cfb440'),
    ('3d2ad049-5d1c-423f-88ec-afc205b7cfbb'::uuid, 'f71ef5e3-8944-40df-b9ea-00a7b0e6c5cc'),
    ('3f810135-05b4-44c1-8bc5-7c3c70c8d63e'::uuid, '4e4377e1-ab91-4015-84ac-27b3274b549f'),
    ('d6ff9fa6-5b44-44d9-8904-5769532acf59'::uuid, 'a363775e-2aa5-49cb-ac17-7aa137d5d47b')
)
update public.exercise_external_links l
set
  match_status = 'removed',
  is_primary = false,
  updated_at = now()
from incident_targets t
where l.exercise_id = t.exercise_id
  and l.external_exercise_id = t.external_exercise_id
  and l.provider = 'ymove'
  and l.match_status = 'manual_approved';

with incident_targets(exercise_id, external_exercise_id) as (
  values
    ('2fe578b7-8cf8-42d5-98f8-95362ad6f5b4'::uuid, '069c1e6b-05f4-4390-a1c7-9b740e0bec4a'),
    ('51b8b377-e214-4efc-a077-f7bfdfe7aef9'::uuid, '65e95132-e6bb-41e8-af7d-0eda931a1693'),
    ('2d25a834-c421-46be-90bf-4becb8fb4745'::uuid, '74c36be0-d1e4-4703-8c54-612c2da1dcc1'),
    ('73f994ed-9fe8-4335-bb5f-3c203a29f991'::uuid, 'b853fd08-4739-4239-a825-8c31826d54ba'),
    ('cc44af5d-ddc0-4fbb-b6fd-f57c7e13ad16'::uuid, '7d31d648-432b-4edd-97bc-afc2a3e9e59a'),
    ('81ad0e7b-a6b2-4aca-af4c-85e2bb8639b8'::uuid, '0e5f29cd-ff79-428a-bb1c-1753a9047f32'),
    ('7c4fb5c1-04f3-41c2-ab61-327dc02a0f16'::uuid, 'c0bd82fb-5ad6-4390-a060-dd46c1a6bea2'),
    ('e40bc685-715e-4c4f-bb70-b53f45fe8d59'::uuid, '2fb79823-a759-4ceb-8b16-a26ab3cfb440'),
    ('3d2ad049-5d1c-423f-88ec-afc205b7cfbb'::uuid, 'f71ef5e3-8944-40df-b9ea-00a7b0e6c5cc'),
    ('3f810135-05b4-44c1-8bc5-7c3c70c8d63e'::uuid, '4e4377e1-ab91-4015-84ac-27b3274b549f'),
    ('d6ff9fa6-5b44-44d9-8904-5769532acf59'::uuid, 'a363775e-2aa5-49cb-ac17-7aa137d5d47b')
)
update public.exercises e
set
  active = false,
  library_status = 'hidden',
  auto_program_eligible = false,
  source_metadata = jsonb_set(
    coalesce(e.source_metadata, '{}'::jsonb),
    '{incident_quarantine}',
    jsonb_build_object(
      'reason', 'ymove_import_incident_2026_07_30_1531_utc',
      'quarantined_at', now()
    ),
    true
  ),
  updated_at = now()
from incident_targets t
where e.id = t.exercise_id
  and e.ymove_exercise_id = t.external_exercise_id
  and e.source = 'ymove';
