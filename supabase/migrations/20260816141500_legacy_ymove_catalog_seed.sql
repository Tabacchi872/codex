-- Replay seed for YMove catalog rows required by the following cleanup migration.
-- Reso idempotente (2026-08-03, gate pre-packaging BUG-067): verificato read-only
-- che tutti e 13 questi ymove_exercise_id esistono già in produzione, importati
-- REALMENTE dal vero catalogo YMove (con id interno diverso e nome reale, es.
-- '069c1e6b-05f4-4390-a1c7-9b740e0bec4a' è già "Barbell Front Raise" in
-- produzione, non "YMove 069c1e6b" come inserirebbe questo seed placeholder).
-- L'insert incondizionato originale avrebbe violato exercises_ymove_exercise_id_unique
-- in qualunque ambiente con il vero import già presente. Guardia: inserisce SOLO
-- se nessuno dei 13 è già presente (ambiente locale senza import reale, come
-- prima); non fa nulla se sono già tutti presenti (produzione); solleva un
-- errore esplicito su uno stato intermedio inatteso, senza scegliere in silenzio.
do $$
declare
  v_existing_count integer;
begin
  select count(*) into v_existing_count
  from public.exercises
  where ymove_exercise_id in (
    '069c1e6b-05f4-4390-a1c7-9b740e0bec4a',
    '65e95132-e6bb-41e8-af7d-0eda931a1693',
    '74c36be0-d1e4-4703-8c54-612c2da1dcc1',
    'b853fd08-4739-4239-a825-8c31826d54ba',
    '7d31d648-432b-4edd-97bc-afc2a3e9e59a',
    '0e5f29cd-ff79-428a-bb1c-1753a9047f32',
    'c0bd82fb-5ad6-4390-a060-dd46c1a6bea2',
    '2fb79823-a759-4ceb-8b16-a26ab3cfb440',
    'f71ef5e3-8944-40df-b9ea-00a7b0e6c5cc',
    '4e4377e1-ab91-4015-84ac-27b3274b549f',
    'a363775e-2aa5-49cb-ac17-7aa137d5d47b',
    'a64ffb04-76a7-431a-a9a5-6addeab61813',
    '31a0d4f4-2ad8-4f51-b47f-e7dc05e787f3'
  );

  if v_existing_count = 0 then
    insert into public.exercises (id, coach_id, name, source, ymove_exercise_id)
    values
      ('2fe578b7-8cf8-42d5-98f8-95362ad6f5b4', null, 'YMove 069c1e6b', 'ymove', '069c1e6b-05f4-4390-a1c7-9b740e0bec4a'),
      ('51b8b377-e214-4efc-a077-f7bfdfe7aef9', null, 'YMove 65e95132', 'ymove', '65e95132-e6bb-41e8-af7d-0eda931a1693'),
      ('2d25a834-c421-46be-90bf-4becb8fb4745', null, 'YMove 74c36be0', 'ymove', '74c36be0-d1e4-4703-8c54-612c2da1dcc1'),
      ('73f994ed-9fe8-4335-bb5f-3c203a29f991', null, 'YMove b853fd08', 'ymove', 'b853fd08-4739-4239-a825-8c31826d54ba'),
      ('cc44af5d-ddc0-4fbb-b6fd-f57c7e13ad16', null, 'YMove 7d31d648', 'ymove', '7d31d648-432b-4edd-97bc-afc2a3e9e59a'),
      ('81ad0e7b-a6b2-4aca-af4c-85e2bb8639b8', null, 'YMove 0e5f29cd', 'ymove', '0e5f29cd-ff79-428a-bb1c-1753a9047f32'),
      ('7c4fb5c1-04f3-41c2-ab61-327dc02a0f16', null, 'YMove c0bd82fb', 'ymove', 'c0bd82fb-5ad6-4390-a060-dd46c1a6bea2'),
      ('e40bc685-715e-4c4f-bb70-b53f45fe8d59', null, 'YMove 2fb79823', 'ymove', '2fb79823-a759-4ceb-8b16-a26ab3cfb440'),
      ('3d2ad049-5d1c-423f-88ec-afc205b7cfbb', null, 'YMove f71ef5e3', 'ymove', 'f71ef5e3-8944-40df-b9ea-00a7b0e6c5cc'),
      ('3f810135-05b4-44c1-8bc5-7c3c70c8d63e', null, 'YMove 4e4377e1', 'ymove', '4e4377e1-ab91-4015-84ac-27b3274b549f'),
      ('d6ff9fa6-5b44-44d9-8904-5769532acf59', null, 'YMove a363775e', 'ymove', 'a363775e-2aa5-49cb-ac17-7aa137d5d47b'),
      ('2c600fe6-9d44-43dd-9389-239bcd455db0', null, 'YMove a64ffb04', 'ymove', 'a64ffb04-76a7-431a-a9a5-6addeab61813'),
      ('da5c5923-ea30-4034-9e7d-cf3cef002f9c', null, 'YMove 31a0d4f4', 'ymove', '31a0d4f4-2ad8-4f51-b47f-e7dc05e787f3');
  elsif v_existing_count <> 13 then
    raise exception 'LEGACY_YMOVE_SEED_PARTIAL_STATE: % dei 13 ymove_exercise_id attesi risultano già presenti (attesi 0 o 13).', v_existing_count;
  end if;
  -- else: tutti e 13 già presenti (vero import YMove già avvenuto) -> no-op.
end;
$$;
