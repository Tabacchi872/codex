-- Dynamic auto-program engine.
-- Generated from local audited reports only:
-- - reports/auto-program/ymove-dynamic-pool-proposed-metadata.csv
-- - reports/auto-program/bodyweight-beginner-gap-summary.json
-- No YMove API calls. Apply only through normal migration flow.

begin;

with audited_ymove(exercise_uuid) as (
  values
    ('005ba868-d8b1-499f-9a88-b2cf722e6bdf'::uuid),
    ('022ea5f2-88f3-4d42-b99d-c1026d6bc343'::uuid),
    ('0501fca5-dd00-4948-8874-40cc851daaee'::uuid),
    ('051a5802-da89-415d-a912-93162c89a4bf'::uuid),
    ('059690e8-f60d-4099-b3ae-93d18358a59a'::uuid),
    ('068d316f-52b0-4438-a7c9-ee21ceca2c2f'::uuid),
    ('097903be-beaa-4283-9493-19eb90b59762'::uuid),
    ('0b4d6477-e8d8-4ae1-aff6-d935a77b3fe1'::uuid),
    ('0df165d9-3c63-4506-a2f1-6f64544fda5d'::uuid),
    ('0e43c62b-bcf6-4115-8fa4-3049a4d8f24a'::uuid),
    ('0e5f29cd-ff79-428a-bb1c-1753a9047f32'::uuid),
    ('109f6115-f03d-48da-802a-2e2aa385678d'::uuid),
    ('10a31695-e218-4819-b7d3-b67b1b5ac79d'::uuid),
    ('10be21b8-de6f-4c33-9101-eadca351e663'::uuid),
    ('10d2c91e-60e8-416d-8c91-def45954009c'::uuid),
    ('1b4146bc-1c96-4f05-88cf-72a72783122d'::uuid),
    ('1b670f12-2b3b-4046-8fb8-379450db6f52'::uuid),
    ('1e381fba-eedc-410c-ba1f-1c9c255f4d0f'::uuid),
    ('1e99855d-fbf5-433e-9273-6f4e318a6ffe'::uuid),
    ('1ffaf9e8-fe94-44e8-a20b-012ea58eba46'::uuid),
    ('207924a2-ae75-4371-be43-49c3cc62b4e1'::uuid),
    ('214c3916-f02f-456f-9750-70fd0679295a'::uuid),
    ('22bf3fc2-d7a0-41d0-9a1a-5e0d149d2b7a'::uuid),
    ('24030adc-de07-4547-a916-24acee3d5a3e'::uuid),
    ('2fb79823-a759-4ceb-8b16-a26ab3cfb440'::uuid),
    ('31a0d4f4-2ad8-4f51-b47f-e7dc05e787f3'::uuid),
    ('31f0a2a6-2d44-4c33-bf3a-2d0687b748a4'::uuid),
    ('33869887-32ab-4c66-b033-3bef9e5de372'::uuid),
    ('35b16467-8817-4c28-b84c-a1f47b1734cd'::uuid),
    ('383d7e55-3ec7-4908-8298-96bc42aeebe9'::uuid),
    ('3add251e-6e58-4f80-902c-ab32e0b61966'::uuid),
    ('3b3e0a86-56b7-4d15-92ff-11dfaf108147'::uuid),
    ('3b45e42a-963f-4b79-ae1d-b1b5e8eb9add'::uuid),
    ('3d8fe08e-93ba-49ac-b5f9-92dbac0d39b2'::uuid),
    ('4061bcd4-25a4-48ce-abbe-765986eb91e5'::uuid),
    ('426861d9-64ac-40f6-bf3e-f7ebc05ba6af'::uuid),
    ('42ee935a-8052-4d1b-bde6-d64bb2389e57'::uuid),
    ('43c81170-5fc1-46dd-92b0-6a308c22cec1'::uuid),
    ('4402c7a1-0845-4da2-882d-4e06fc275b8b'::uuid),
    ('4581a423-5d2d-4cf1-89a0-fea026ef116d'::uuid),
    ('4668a912-ef55-4b3e-8d9c-53359d6aba29'::uuid),
    ('46f8865d-24c2-4c81-a886-aa458c5653c5'::uuid),
    ('47ab9d26-7959-46bb-9744-1e48695f5e70'::uuid),
    ('48b2c98e-b82f-49aa-b847-b871a69e1b95'::uuid),
    ('4c55ca15-3665-4db7-b11d-7d4273263f66'::uuid),
    ('4c5c90fd-01a3-45f6-a952-712743be9c81'::uuid),
    ('4c799907-a832-42b2-b9b3-bfb75a68c840'::uuid),
    ('4d433881-e521-45e3-a36e-8672953714c0'::uuid),
    ('4f5e0bcb-7424-4d6b-b837-5c3eda01c15c'::uuid),
    ('4f756a6f-51a5-4afe-8cf8-975f3748c4f9'::uuid),
    ('513d039d-e6d0-459e-9ae7-4847a586871b'::uuid),
    ('53339dca-7ed1-4edf-b88c-1f4b618b4d57'::uuid),
    ('54d04b7e-3a7d-4d04-a0b2-adaab8f8f466'::uuid),
    ('55bd4c71-78c6-49bd-aaaa-8c03b7528342'::uuid),
    ('56c25b1f-91f4-4fd1-99b9-89e4da81ecdc'::uuid),
    ('57c55853-176e-4bad-aced-1032c63f4652'::uuid),
    ('5ce18079-7df5-48e0-828e-63005b8eb3d1'::uuid),
    ('5ce9ef64-7527-4321-997b-1d1bc071f91a'::uuid),
    ('5f84b3d2-daff-4fc1-bb8c-c9524689af7d'::uuid),
    ('5f8e2c01-66eb-4f23-b3ad-c87c631e257f'::uuid),
    ('60ec7728-577b-4dea-a5e9-4b8ac16b6038'::uuid),
    ('61ef551f-2db3-4ab9-978d-9e5712b873de'::uuid),
    ('623b2443-bc73-4c61-986c-412545c33aed'::uuid),
    ('646f354b-3790-4796-bfd9-cd9df04bcc16'::uuid),
    ('658fa4e6-8b1d-48f4-b97d-7c576783ad73'::uuid),
    ('65e95132-e6bb-41e8-af7d-0eda931a1693'::uuid),
    ('675fab33-9f21-4386-8a43-a319d0684841'::uuid),
    ('67b6f81b-3bca-4b91-8cd8-4c4dd6194d6e'::uuid),
    ('69b5e89d-e2d4-4e9a-8ab7-4c28cff1f3e1'::uuid),
    ('6cecf804-dcf6-484b-8e1d-57e0d152bbb7'::uuid),
    ('6e4be416-7097-4301-bfb9-f62bc69f1fa7'::uuid),
    ('706ac77a-70f7-4532-a3c5-f1ce1bd2f079'::uuid),
    ('709f2fe5-f590-401b-aa94-d5f6dc67165b'::uuid),
    ('716ba91e-0ab4-4f1f-bbd9-dd06e25e0da6'::uuid),
    ('71bf8e65-38ff-4145-b42c-341c8d574b59'::uuid),
    ('74a22260-8090-40b6-a13a-4d366c0d5fd6'::uuid),
    ('74c36be0-d1e4-4703-8c54-612c2da1dcc1'::uuid),
    ('75f26166-ba61-48cf-ba27-0709fbdbb34b'::uuid),
    ('76741ca2-8960-4323-a495-c595291e3c56'::uuid),
    ('768c2a0e-5824-42f9-8175-b296f0433c02'::uuid),
    ('7aaad2c1-c499-40dd-84e5-a66b910e6f8b'::uuid),
    ('7ab0bece-90eb-45f1-9b22-3fd86c376aa1'::uuid),
    ('7d31d648-432b-4edd-97bc-afc2a3e9e59a'::uuid),
    ('80b6b175-77a8-48ac-9a09-495d114d88ef'::uuid),
    ('854b33d7-6d88-4a67-a5d5-4e7e2983b140'::uuid),
    ('85a71ed6-caf0-4b0c-aa70-0419d8f81157'::uuid),
    ('8796655f-6390-4ae1-a143-1fe6cde817cb'::uuid),
    ('89b62000-867f-4f98-b24c-ad9b5708d015'::uuid),
    ('8bbcc469-9283-4776-a12c-882060dd396c'::uuid),
    ('8dcf57f2-24d8-4f4d-802c-2eacbe9d578f'::uuid),
    ('8e75c181-9db4-4e20-8fa7-be744f820f95'::uuid),
    ('8f2f2d63-4e39-408b-b450-f88c27d8ae1a'::uuid),
    ('90924318-0ca7-46ec-9e87-36b80e02196f'::uuid),
    ('926f4125-2676-45a8-96ee-2b6ace422494'::uuid),
    ('928d2978-b0a4-4619-858d-106a5c99e507'::uuid),
    ('95640151-0b58-4872-94de-a14680227a66'::uuid),
    ('9690f31a-ed99-446e-88db-2934b832f497'::uuid),
    ('9696321a-6d49-4d1b-a42d-08fb34bb8323'::uuid),
    ('9a68f965-4e58-4b5b-87d5-c44929dd1f39'::uuid),
    ('9d5a2722-801b-4741-8d9b-11e9a3a4ae2d'::uuid),
    ('9ddd0baa-fa4b-4f5a-8dd4-3a68dc557563'::uuid),
    ('9eb19f30-37d0-4aca-9e2d-c90a65f7b07b'::uuid),
    ('a61479a9-fc68-4b4b-9e4d-2f65cd41defa'::uuid),
    ('a64ffb04-76a7-431a-a9a5-6addeab61813'::uuid),
    ('aa3d8f09-8870-4ec1-aada-7760020dfeaa'::uuid),
    ('ab1681a6-93a1-4e51-ac8c-c76f02ef3737'::uuid),
    ('ab522399-6b5e-4a37-aa7a-47d2ec862631'::uuid),
    ('ac7982bb-1a81-4870-ae78-ce37bb485601'::uuid),
    ('accf9858-fd32-4f43-aa4d-0bd0f53d7498'::uuid),
    ('ad241fc8-3d05-4ce7-a950-45380497cdc0'::uuid),
    ('ad7e4bc7-a8d8-4aa7-978f-e130aeb49e8b'::uuid),
    ('ad8e32a3-091a-4b10-a316-8984807ce817'::uuid),
    ('af494781-9fba-41df-b403-79d04db6deae'::uuid),
    ('af545111-e56a-4731-ba48-2d4ce750bc8e'::uuid),
    ('b160ea44-725a-415f-919a-4edad64d3ce3'::uuid),
    ('b2073383-2f4c-419e-95f3-0e1cd4f02c34'::uuid),
    ('b35c3787-5974-4cca-b3d5-c28f7efa1472'::uuid),
    ('b3d44ba8-5fdd-4a7e-ace2-1b12d5901b0b'::uuid),
    ('b3fdc5d4-1225-4f12-8b42-86fc0617aeb6'::uuid),
    ('b9e7733d-fbba-413a-98d9-71803ae1edb4'::uuid),
    ('bb30b96e-da77-44d7-aabe-d02a7bdcaa23'::uuid),
    ('bda6ae04-2619-43a7-8261-490d85444eb2'::uuid),
    ('be7a8c2a-db1b-405f-a61f-96f26c628c6c'::uuid),
    ('bfce2271-bf6b-4a45-9038-5c9fa1935990'::uuid),
    ('c0bd82fb-5ad6-4390-a060-dd46c1a6bea2'::uuid),
    ('c4d91f02-e796-4992-a08d-531b1d4bb16b'::uuid),
    ('c60450d9-862c-4dd3-87b1-82f80349964d'::uuid),
    ('c7c76fa8-908a-4ee0-977c-35f12057676d'::uuid),
    ('c8f3362d-fb00-481e-b428-e0b17f4ae681'::uuid),
    ('ca5187cf-f9c2-4ad3-b932-4dccc2e47f7e'::uuid),
    ('ca7a2f9d-3af1-40cd-a33f-431f437a2902'::uuid),
    ('cb06c2a3-ef02-4e60-b9ab-7d692fa97bc4'::uuid),
    ('ccd60696-7e2f-4611-b3b9-e5f11ddf4e78'::uuid),
    ('cd6edab4-3f1e-477f-8a88-54f9c683c9de'::uuid),
    ('cfa3229b-10a2-42cd-bdf0-4fa80ce51fd3'::uuid),
    ('d06c3d04-aeb4-4b94-9a43-24e95201239c'::uuid),
    ('d18679b0-3ce0-409b-9955-584976544f45'::uuid),
    ('d237c00f-e6f3-44f0-953b-5db4c970f873'::uuid),
    ('d536723e-7e3f-460d-a6c5-e9993bfbec4c'::uuid),
    ('d552a696-bf87-4bf7-9597-fa425d617874'::uuid),
    ('d5dff683-d9a5-42ca-b325-47f7275f7def'::uuid),
    ('d81d953b-b29d-438a-aeee-610523bca09d'::uuid),
    ('d8a67e85-0c9f-483d-b7fe-be049247ab1c'::uuid),
    ('d9df1e94-1051-407d-9c34-87720d1557a9'::uuid),
    ('db1a9d2c-5386-41aa-a84f-dad06ac7ea7c'::uuid),
    ('db4a932d-2e11-4809-843e-cb3c1df4535b'::uuid),
    ('dbf6a8e4-19dc-4d01-8014-f195a1eb817c'::uuid),
    ('dd57e914-d0ef-4d6f-8724-d72f220b7422'::uuid),
    ('e0a7528b-5d24-4ddf-9d4c-d61958dc504c'::uuid),
    ('e30e5898-057a-48f9-b667-010ed488c3ea'::uuid),
    ('e396f5be-9c22-44ff-b825-d754d807f5fd'::uuid),
    ('e6bd8a96-cc6e-4805-bb2d-6755c9350dd9'::uuid),
    ('e75d29c0-7af3-4e83-a351-6fff23443379'::uuid),
    ('e8a79472-7809-42d4-89cc-c3c351d86982'::uuid),
    ('e8aacdde-8fce-438b-878b-3af1a611f2be'::uuid),
    ('e91bd54f-f605-491d-90e6-16515787389c'::uuid),
    ('ea7d466a-ecd9-4fcb-9a52-53716b513417'::uuid),
    ('ecf8bc6c-e7c9-4dcb-949a-e04f6e0c93bb'::uuid),
    ('ed1451e4-ceef-4aa9-a883-24b733b83edd'::uuid),
    ('ee4ec1d3-6f4c-42bf-b338-ac175213a4e7'::uuid),
    ('f1c43226-fa20-4c2e-af66-0cd680f937df'::uuid),
    ('f3d25890-dcd5-42b3-8246-a5f596029cc0'::uuid),
    ('f67b5c4a-a959-4b13-933e-633d4faeab95'::uuid),
    ('f71ef5e3-8944-40df-b9ea-00a7b0e6c5cc'::uuid),
    ('f7458e9c-56f8-4604-ba58-636ead67ffe2'::uuid),
    ('f96ea3ee-fb2f-4a0f-bc3b-7e63959450c5'::uuid),
    ('fa3347f7-0e8f-446b-a7f0-fbb0f6b22206'::uuid),
    ('fa45710a-ee56-4648-811c-5eeaaeaff098'::uuid),
    ('fb48eccb-7f51-4de3-97f0-dc5ef75a6cee'::uuid),
    ('fef72790-359f-4f3f-9fcd-a80fb2c63b5f'::uuid),
    ('fefcff8a-f513-48bd-9e6d-0c38de0e4a6b'::uuid),
    ('ff6872ae-e894-4e72-b5f8-59a55b576a6f'::uuid),
    ('ffded4df-0bf5-4522-8c94-cf15492a8271'::uuid)
), source_rows as (
  select
    e.id::text as exercise_id,
    lower(coalesce(e.name, '')) as title,
    lower(coalesce(e.equipment, '')) as equipment_text,
    lower(coalesce(e.difficulty, '')) as difficulty_text,
    e.muscle_group,
    e.primary_muscle_group
  from public.exercises e
  -- BUG-067 fix: audited_ymove.exercise_uuid contiene l'ID ESTERNO YMove
  -- (exercises.ymove_exercise_id), non l'id interno FitCoach (exercises.id).
  -- Il join precedente (a.exercise_uuid = e.id) non trovava mai corrispondenze
  -- reali (0/360 in produzione) — corretto sulla colonna giusta.
  join audited_ymove a on a.exercise_uuid::text = e.ymove_exercise_id
  where e.source = 'ymove'
), normalized as (
  select
    exercise_id,
    case
      when exercise_id in ('e30e5898-057a-48f9-b667-010ed488c3ea','4f5e0bcb-7424-4d6b-b837-5c3eda01c15c') then 'mobility'
      when title ~ 'pulldown|pull[ -]?up|chin[ -]?up|row|rematore|upright row' then case when title ~ 'pulldown|pull[ -]?up|chin[ -]?up' then 'vertical_pull' else 'horizontal_pull' end
      when title ~ 'push[ -]?up|press|dip|pushdown|tricep|fly' then case when title ~ 'overhead|shoulder|arnold|push press' then 'vertical_push' else 'horizontal_push' end
      when title ~ 'lunge|affondo' then 'lunge'
      when title ~ 'squat|leg press|step[ -]?up' then 'squat'
      when title ~ 'deadlift|romanian|good morning|hip thrust|glute bridge|back extension|hyperextension|hinge' then 'hinge'
      when title ~ 'plank|crunch|sit[ -]?up|rollout|hollow|leg raise|boat' then 'core_anti_extension'
      when title ~ 'burpee|jump|jacks|mountain climber|crawl|body builder|sprinter|high knees|cardio' then 'cardio'
      when title ~ 'stretch|opener|mobility|pose|cat cow|cat pose|cow pose|cobra|snow angel|w to lifts' then 'mobility'
      else 'mobility'
    end as movement_pattern,
    case
      when coalesce(primary_muscle_group, muscle_group, '') ilike '%chest%' or title ~ 'chest|bench|fly|push[ -]?up|press' then 'petto'
      when coalesce(primary_muscle_group, muscle_group, '') ilike '%back%' or title ~ 'back|lat|row|pulldown|pull[ -]?up|chin[ -]?up|cobra|snow angel|w to lifts' then 'dorsali'
      when coalesce(primary_muscle_group, muscle_group, '') ilike '%shoulder%' or title ~ 'shoulder|deltoid' then 'spalle'
      when coalesce(primary_muscle_group, muscle_group, '') ilike '%tricep%' or title ~ 'tricep|pushdown|dip' then 'tricipiti'
      when coalesce(primary_muscle_group, muscle_group, '') ilike '%bicep%' or title ~ 'bicep|curl' then 'bicipiti'
      when coalesce(primary_muscle_group, muscle_group, '') ilike '%quad%' or title ~ 'squat|lunge|leg press|step[ -]?up' then 'quadricipiti'
      when coalesce(primary_muscle_group, muscle_group, '') ilike '%hamstring%' or title ~ 'deadlift|romanian|hinge' then 'femorali'
      when coalesce(primary_muscle_group, muscle_group, '') ilike '%glute%' or title ~ 'glute|bridge' then 'glutei'
      when title ~ 'calf' then 'polpacci'
      when title ~ 'core|ab|crunch|plank|sit[ -]?up|rollout|boat' then 'addome'
      when title ~ 'stretch|mobility|pose' then 'mobilita'
      else 'full_body'
    end as primary_muscle_group,
    case
      when exercise_id in ('e30e5898-057a-48f9-b667-010ed488c3ea','4f5e0bcb-7424-4d6b-b837-5c3eda01c15c') then 'bodyweight_only'
      when equipment_text ~ 'machine|smith|barbell|cable|plate|ez' then 'full_gym'
      when equipment_text ~ 'dumbbell|kettlebell|band|bench|ball|medicine' then 'home_basic'
      else 'bodyweight_only'
    end as equipment_tag,
    case
      when difficulty_text ~ 'advanced' then 'advanced'
      when difficulty_text ~ 'intermediate' then 'intermediate'
      else 'beginner'
    end as min_level,
    case
      when exercise_id in ('e30e5898-057a-48f9-b667-010ed488c3ea','4f5e0bcb-7424-4d6b-b837-5c3eda01c15c') then 'secondary'
      when title ~ 'stretch|mobility|pose|crunch|plank|sit[ -]?up|rollout' then 'accessory'
      else 'primary'
    end as role,
    case
      when title ~ 'stretch|mobility|pose|crunch|plank|sit[ -]?up|rollout|fly|curl|raise' then 'isolation'
      else 'compound'
    end as movement_class,
    case
      when exercise_id in ('e30e5898-057a-48f9-b667-010ed488c3ea','4f5e0bcb-7424-4d6b-b837-5c3eda01c15c') then 'upper_pull_beginner_ground_regression'
      else null
    end as substitution_group
  from source_rows
)
insert into public.exercise_movement_metadata (
  exercise_id, movement_pattern, primary_muscle_group, equipment_tag,
  compatible_locations, min_level, role, movement_class, substitution_group,
  eligible_for_substitution, is_active, metadata_version
)
select
  exercise_id, movement_pattern, primary_muscle_group, equipment_tag,
  case when equipment_tag = 'full_gym' then array['gym'] else array['gym','home'] end,
  min_level, role, movement_class, substitution_group,
  true, true, 7
from normalized
on conflict (exercise_id) do update set
  movement_pattern = excluded.movement_pattern,
  primary_muscle_group = excluded.primary_muscle_group,
  equipment_tag = excluded.equipment_tag,
  compatible_locations = excluded.compatible_locations,
  min_level = excluded.min_level,
  role = excluded.role,
  movement_class = excluded.movement_class,
  substitution_group = excluded.substitution_group,
  eligible_for_substitution = excluded.eligible_for_substitution,
  is_active = true,
  metadata_version = greatest(public.exercise_movement_metadata.metadata_version, excluded.metadata_version),
  updated_at = now();

do $$
declare
  v_count integer;
begin
  -- BUG-067 sanity check: quante righe exercise_movement_metadata risultano
  -- collegate a un esercizio ymove REALE dopo il fix del join. Il numero atteso
  -- dipende dai dati YMove effettivamente presenti nell'ambiente in cui questa
  -- migration viene eseguita (produzione ha il catalogo completo, un ambiente di
  -- sviluppo locale tipicamente no) -- qui si registra solo il conteggio per
  -- verifica manuale, senza assumere un valore fisso.
  select count(*) into v_count
  from public.exercise_movement_metadata emm
  join public.exercises e on e.id::text = emm.exercise_id
  where e.source = 'ymove';
  raise notice 'BUG_067_METADATA_COUNT: % righe exercise_movement_metadata collegate a un esercizio ymove reale in questo ambiente.', v_count;
end
$$;

with audited_ymove(exercise_uuid) as (
  values
    ('005ba868-d8b1-499f-9a88-b2cf722e6bdf'::uuid),
    ('022ea5f2-88f3-4d42-b99d-c1026d6bc343'::uuid),
    ('0501fca5-dd00-4948-8874-40cc851daaee'::uuid),
    ('051a5802-da89-415d-a912-93162c89a4bf'::uuid),
    ('059690e8-f60d-4099-b3ae-93d18358a59a'::uuid),
    ('068d316f-52b0-4438-a7c9-ee21ceca2c2f'::uuid),
    ('097903be-beaa-4283-9493-19eb90b59762'::uuid),
    ('0b4d6477-e8d8-4ae1-aff6-d935a77b3fe1'::uuid),
    ('0df165d9-3c63-4506-a2f1-6f64544fda5d'::uuid),
    ('0e43c62b-bcf6-4115-8fa4-3049a4d8f24a'::uuid),
    ('0e5f29cd-ff79-428a-bb1c-1753a9047f32'::uuid),
    ('109f6115-f03d-48da-802a-2e2aa385678d'::uuid),
    ('10a31695-e218-4819-b7d3-b67b1b5ac79d'::uuid),
    ('10be21b8-de6f-4c33-9101-eadca351e663'::uuid),
    ('10d2c91e-60e8-416d-8c91-def45954009c'::uuid),
    ('1b4146bc-1c96-4f05-88cf-72a72783122d'::uuid),
    ('1b670f12-2b3b-4046-8fb8-379450db6f52'::uuid),
    ('1e381fba-eedc-410c-ba1f-1c9c255f4d0f'::uuid),
    ('1e99855d-fbf5-433e-9273-6f4e318a6ffe'::uuid),
    ('1ffaf9e8-fe94-44e8-a20b-012ea58eba46'::uuid),
    ('207924a2-ae75-4371-be43-49c3cc62b4e1'::uuid),
    ('214c3916-f02f-456f-9750-70fd0679295a'::uuid),
    ('22bf3fc2-d7a0-41d0-9a1a-5e0d149d2b7a'::uuid),
    ('24030adc-de07-4547-a916-24acee3d5a3e'::uuid),
    ('2fb79823-a759-4ceb-8b16-a26ab3cfb440'::uuid),
    ('31a0d4f4-2ad8-4f51-b47f-e7dc05e787f3'::uuid),
    ('31f0a2a6-2d44-4c33-bf3a-2d0687b748a4'::uuid),
    ('33869887-32ab-4c66-b033-3bef9e5de372'::uuid),
    ('35b16467-8817-4c28-b84c-a1f47b1734cd'::uuid),
    ('383d7e55-3ec7-4908-8298-96bc42aeebe9'::uuid),
    ('3add251e-6e58-4f80-902c-ab32e0b61966'::uuid),
    ('3b3e0a86-56b7-4d15-92ff-11dfaf108147'::uuid),
    ('3b45e42a-963f-4b79-ae1d-b1b5e8eb9add'::uuid),
    ('3d8fe08e-93ba-49ac-b5f9-92dbac0d39b2'::uuid),
    ('4061bcd4-25a4-48ce-abbe-765986eb91e5'::uuid),
    ('426861d9-64ac-40f6-bf3e-f7ebc05ba6af'::uuid),
    ('42ee935a-8052-4d1b-bde6-d64bb2389e57'::uuid),
    ('43c81170-5fc1-46dd-92b0-6a308c22cec1'::uuid),
    ('4402c7a1-0845-4da2-882d-4e06fc275b8b'::uuid),
    ('4581a423-5d2d-4cf1-89a0-fea026ef116d'::uuid),
    ('4668a912-ef55-4b3e-8d9c-53359d6aba29'::uuid),
    ('46f8865d-24c2-4c81-a886-aa458c5653c5'::uuid),
    ('47ab9d26-7959-46bb-9744-1e48695f5e70'::uuid),
    ('48b2c98e-b82f-49aa-b847-b871a69e1b95'::uuid),
    ('4c55ca15-3665-4db7-b11d-7d4273263f66'::uuid),
    ('4c5c90fd-01a3-45f6-a952-712743be9c81'::uuid),
    ('4c799907-a832-42b2-b9b3-bfb75a68c840'::uuid),
    ('4d433881-e521-45e3-a36e-8672953714c0'::uuid),
    ('4f5e0bcb-7424-4d6b-b837-5c3eda01c15c'::uuid),
    ('4f756a6f-51a5-4afe-8cf8-975f3748c4f9'::uuid),
    ('513d039d-e6d0-459e-9ae7-4847a586871b'::uuid),
    ('53339dca-7ed1-4edf-b88c-1f4b618b4d57'::uuid),
    ('54d04b7e-3a7d-4d04-a0b2-adaab8f8f466'::uuid),
    ('55bd4c71-78c6-49bd-aaaa-8c03b7528342'::uuid),
    ('56c25b1f-91f4-4fd1-99b9-89e4da81ecdc'::uuid),
    ('57c55853-176e-4bad-aced-1032c63f4652'::uuid),
    ('5ce18079-7df5-48e0-828e-63005b8eb3d1'::uuid),
    ('5ce9ef64-7527-4321-997b-1d1bc071f91a'::uuid),
    ('5f84b3d2-daff-4fc1-bb8c-c9524689af7d'::uuid),
    ('5f8e2c01-66eb-4f23-b3ad-c87c631e257f'::uuid),
    ('60ec7728-577b-4dea-a5e9-4b8ac16b6038'::uuid),
    ('61ef551f-2db3-4ab9-978d-9e5712b873de'::uuid),
    ('623b2443-bc73-4c61-986c-412545c33aed'::uuid),
    ('646f354b-3790-4796-bfd9-cd9df04bcc16'::uuid),
    ('658fa4e6-8b1d-48f4-b97d-7c576783ad73'::uuid),
    ('65e95132-e6bb-41e8-af7d-0eda931a1693'::uuid),
    ('675fab33-9f21-4386-8a43-a319d0684841'::uuid),
    ('67b6f81b-3bca-4b91-8cd8-4c4dd6194d6e'::uuid),
    ('69b5e89d-e2d4-4e9a-8ab7-4c28cff1f3e1'::uuid),
    ('6cecf804-dcf6-484b-8e1d-57e0d152bbb7'::uuid),
    ('6e4be416-7097-4301-bfb9-f62bc69f1fa7'::uuid),
    ('706ac77a-70f7-4532-a3c5-f1ce1bd2f079'::uuid),
    ('709f2fe5-f590-401b-aa94-d5f6dc67165b'::uuid),
    ('716ba91e-0ab4-4f1f-bbd9-dd06e25e0da6'::uuid),
    ('71bf8e65-38ff-4145-b42c-341c8d574b59'::uuid),
    ('74a22260-8090-40b6-a13a-4d366c0d5fd6'::uuid),
    ('74c36be0-d1e4-4703-8c54-612c2da1dcc1'::uuid),
    ('75f26166-ba61-48cf-ba27-0709fbdbb34b'::uuid),
    ('76741ca2-8960-4323-a495-c595291e3c56'::uuid),
    ('768c2a0e-5824-42f9-8175-b296f0433c02'::uuid),
    ('7aaad2c1-c499-40dd-84e5-a66b910e6f8b'::uuid),
    ('7ab0bece-90eb-45f1-9b22-3fd86c376aa1'::uuid),
    ('7d31d648-432b-4edd-97bc-afc2a3e9e59a'::uuid),
    ('80b6b175-77a8-48ac-9a09-495d114d88ef'::uuid),
    ('854b33d7-6d88-4a67-a5d5-4e7e2983b140'::uuid),
    ('85a71ed6-caf0-4b0c-aa70-0419d8f81157'::uuid),
    ('8796655f-6390-4ae1-a143-1fe6cde817cb'::uuid),
    ('89b62000-867f-4f98-b24c-ad9b5708d015'::uuid),
    ('8bbcc469-9283-4776-a12c-882060dd396c'::uuid),
    ('8dcf57f2-24d8-4f4d-802c-2eacbe9d578f'::uuid),
    ('8e75c181-9db4-4e20-8fa7-be744f820f95'::uuid),
    ('8f2f2d63-4e39-408b-b450-f88c27d8ae1a'::uuid),
    ('90924318-0ca7-46ec-9e87-36b80e02196f'::uuid),
    ('926f4125-2676-45a8-96ee-2b6ace422494'::uuid),
    ('928d2978-b0a4-4619-858d-106a5c99e507'::uuid),
    ('95640151-0b58-4872-94de-a14680227a66'::uuid),
    ('9690f31a-ed99-446e-88db-2934b832f497'::uuid),
    ('9696321a-6d49-4d1b-a42d-08fb34bb8323'::uuid),
    ('9a68f965-4e58-4b5b-87d5-c44929dd1f39'::uuid),
    ('9d5a2722-801b-4741-8d9b-11e9a3a4ae2d'::uuid),
    ('9ddd0baa-fa4b-4f5a-8dd4-3a68dc557563'::uuid),
    ('9eb19f30-37d0-4aca-9e2d-c90a65f7b07b'::uuid),
    ('a61479a9-fc68-4b4b-9e4d-2f65cd41defa'::uuid),
    ('a64ffb04-76a7-431a-a9a5-6addeab61813'::uuid),
    ('aa3d8f09-8870-4ec1-aada-7760020dfeaa'::uuid),
    ('ab1681a6-93a1-4e51-ac8c-c76f02ef3737'::uuid),
    ('ab522399-6b5e-4a37-aa7a-47d2ec862631'::uuid),
    ('ac7982bb-1a81-4870-ae78-ce37bb485601'::uuid),
    ('accf9858-fd32-4f43-aa4d-0bd0f53d7498'::uuid),
    ('ad241fc8-3d05-4ce7-a950-45380497cdc0'::uuid),
    ('ad7e4bc7-a8d8-4aa7-978f-e130aeb49e8b'::uuid),
    ('ad8e32a3-091a-4b10-a316-8984807ce817'::uuid),
    ('af494781-9fba-41df-b403-79d04db6deae'::uuid),
    ('af545111-e56a-4731-ba48-2d4ce750bc8e'::uuid),
    ('b160ea44-725a-415f-919a-4edad64d3ce3'::uuid),
    ('b2073383-2f4c-419e-95f3-0e1cd4f02c34'::uuid),
    ('b35c3787-5974-4cca-b3d5-c28f7efa1472'::uuid),
    ('b3d44ba8-5fdd-4a7e-ace2-1b12d5901b0b'::uuid),
    ('b3fdc5d4-1225-4f12-8b42-86fc0617aeb6'::uuid),
    ('b9e7733d-fbba-413a-98d9-71803ae1edb4'::uuid),
    ('bb30b96e-da77-44d7-aabe-d02a7bdcaa23'::uuid),
    ('bda6ae04-2619-43a7-8261-490d85444eb2'::uuid),
    ('be7a8c2a-db1b-405f-a61f-96f26c628c6c'::uuid),
    ('bfce2271-bf6b-4a45-9038-5c9fa1935990'::uuid),
    ('c0bd82fb-5ad6-4390-a060-dd46c1a6bea2'::uuid),
    ('c4d91f02-e796-4992-a08d-531b1d4bb16b'::uuid),
    ('c60450d9-862c-4dd3-87b1-82f80349964d'::uuid),
    ('c7c76fa8-908a-4ee0-977c-35f12057676d'::uuid),
    ('c8f3362d-fb00-481e-b428-e0b17f4ae681'::uuid),
    ('ca5187cf-f9c2-4ad3-b932-4dccc2e47f7e'::uuid),
    ('ca7a2f9d-3af1-40cd-a33f-431f437a2902'::uuid),
    ('cb06c2a3-ef02-4e60-b9ab-7d692fa97bc4'::uuid),
    ('ccd60696-7e2f-4611-b3b9-e5f11ddf4e78'::uuid),
    ('cd6edab4-3f1e-477f-8a88-54f9c683c9de'::uuid),
    ('cfa3229b-10a2-42cd-bdf0-4fa80ce51fd3'::uuid),
    ('d06c3d04-aeb4-4b94-9a43-24e95201239c'::uuid),
    ('d18679b0-3ce0-409b-9955-584976544f45'::uuid),
    ('d237c00f-e6f3-44f0-953b-5db4c970f873'::uuid),
    ('d536723e-7e3f-460d-a6c5-e9993bfbec4c'::uuid),
    ('d552a696-bf87-4bf7-9597-fa425d617874'::uuid),
    ('d5dff683-d9a5-42ca-b325-47f7275f7def'::uuid),
    ('d81d953b-b29d-438a-aeee-610523bca09d'::uuid),
    ('d8a67e85-0c9f-483d-b7fe-be049247ab1c'::uuid),
    ('d9df1e94-1051-407d-9c34-87720d1557a9'::uuid),
    ('db1a9d2c-5386-41aa-a84f-dad06ac7ea7c'::uuid),
    ('db4a932d-2e11-4809-843e-cb3c1df4535b'::uuid),
    ('dbf6a8e4-19dc-4d01-8014-f195a1eb817c'::uuid),
    ('dd57e914-d0ef-4d6f-8724-d72f220b7422'::uuid),
    ('e0a7528b-5d24-4ddf-9d4c-d61958dc504c'::uuid),
    ('e30e5898-057a-48f9-b667-010ed488c3ea'::uuid),
    ('e396f5be-9c22-44ff-b825-d754d807f5fd'::uuid),
    ('e6bd8a96-cc6e-4805-bb2d-6755c9350dd9'::uuid),
    ('e75d29c0-7af3-4e83-a351-6fff23443379'::uuid),
    ('e8a79472-7809-42d4-89cc-c3c351d86982'::uuid),
    ('e8aacdde-8fce-438b-878b-3af1a611f2be'::uuid),
    ('e91bd54f-f605-491d-90e6-16515787389c'::uuid),
    ('ea7d466a-ecd9-4fcb-9a52-53716b513417'::uuid),
    ('ecf8bc6c-e7c9-4dcb-949a-e04f6e0c93bb'::uuid),
    ('ed1451e4-ceef-4aa9-a883-24b733b83edd'::uuid),
    ('ee4ec1d3-6f4c-42bf-b338-ac175213a4e7'::uuid),
    ('f1c43226-fa20-4c2e-af66-0cd680f937df'::uuid),
    ('f3d25890-dcd5-42b3-8246-a5f596029cc0'::uuid),
    ('f67b5c4a-a959-4b13-933e-633d4faeab95'::uuid),
    ('f71ef5e3-8944-40df-b9ea-00a7b0e6c5cc'::uuid),
    ('f7458e9c-56f8-4604-ba58-636ead67ffe2'::uuid),
    ('f96ea3ee-fb2f-4a0f-bc3b-7e63959450c5'::uuid),
    ('fa3347f7-0e8f-446b-a7f0-fbb0f6b22206'::uuid),
    ('fa45710a-ee56-4648-811c-5eeaaeaff098'::uuid),
    ('fb48eccb-7f51-4de3-97f0-dc5ef75a6cee'::uuid),
    ('fef72790-359f-4f3f-9fcd-a80fb2c63b5f'::uuid),
    ('fefcff8a-f513-48bd-9e6d-0c38de0e4a6b'::uuid),
    ('ff6872ae-e894-4e72-b5f8-59a55b576a6f'::uuid),
    ('ffded4df-0bf5-4522-8c94-cf15492a8271'::uuid)
), plyometric_safety_exclusions(exercise_id) as (
  -- Esclusione di sicurezza (2026-08-03, non un giudizio sulla qualita' dell'esercizio):
  -- pattern plyometrico/esplosivo classificato solo 'intermediate', senza un campo
  -- category/impatto separato nello schema per distinguerli in modo affidabile dal
  -- resto. Restano riservati alla scelta manuale del coach nell'archivio: NON vengono
  -- resi auto_program_eligible per l'auto-assegnazione senza supervisione umana.
  values
    ('e4184416-a2b8-4d64-9c04-8e3e03b6b7fc'::uuid), -- Bear crawl into explosive jumps
    ('9fd55fea-beab-4d25-9669-59289fe1dd2d'::uuid), -- Bench Jump
    ('577d4216-30bd-404b-a2d0-7ab89fdec02b'::uuid), -- Box Jump
    ('a6465401-67db-4e07-ba1d-ef0141b0c17c'::uuid), -- Box jumps
    ('92a23d34-138a-4e77-9776-f93ecccf9d61'::uuid), -- Broad jumps
    ('ccf3a409-b228-4c54-9d72-f1ca10e34ad1'::uuid), -- Burpee (No jump)
    ('9655ca3c-f7bc-488a-a45d-1fba3dd83950'::uuid), -- Butterfly Jumps
    ('3fd04913-0531-41f2-af26-a0e85562ad00'::uuid), -- Criss-cross jumping jacks
    ('553329c1-5dc2-4b1e-8e13-ad6dd4c4a09a'::uuid), -- Explosive jump squats
    ('21f94444-592d-46e6-bd5a-7f539a2a2659'::uuid), -- Explosive push ups
    ('f4d15d9c-e12d-4ab9-9dfb-6bc8a6227bbb'::uuid), -- Explosive side to side push up
    ('1e2dde07-df7b-4929-ab8e-ee24824b5b0c'::uuid), -- Explosive sprinter lunge (left)
    ('5bdb1083-e270-4fc1-bd22-754eded8b182'::uuid)  -- Explosive sprinter lunge (right)
)
update public.exercises e
set auto_program_eligible = true,
    active = true,
    updated_at = now()
from audited_ymove a
-- BUG-067 fix: stesso join corretto sull'id esterno YMove (vedi sopra).
where e.ymove_exercise_id = a.exercise_uuid::text
  and e.source = 'ymove'
  and e.id not in (select exercise_id from plyometric_safety_exclusions);

do $$
declare
  v_eligible_count integer;
  v_excluded_still_eligible integer;
begin
  -- Conteggio informativo (dipendente dai dati YMove presenti in questo ambiente,
  -- vedi nota sul check precedente) -- non un'assunzione di valore fisso.
  select count(*) into v_eligible_count
  from public.exercises where source = 'ymove' and auto_program_eligible = true;
  raise notice 'BUG_067_ELIGIBLE_COUNT: % esercizi ymove con auto_program_eligible=true in questo ambiente.', v_eligible_count;

  -- Questo invece e' un invariante di sicurezza valido in QUALUNQUE ambiente,
  -- indipendentemente dal catalogo YMove presente: i 13 esercizi a pattern
  -- plyometrico/esplosivo esclusi esplicitamente non devono MAI risultare
  -- auto_program_eligible=true dopo questa migration.
  select count(*) into v_excluded_still_eligible
  from public.exercises
  where source = 'ymove' and auto_program_eligible = true
    and id in (
      'e4184416-a2b8-4d64-9c04-8e3e03b6b7fc','9fd55fea-beab-4d25-9669-59289fe1dd2d','577d4216-30bd-404b-a2d0-7ab89fdec02b',
      'a6465401-67db-4e07-ba1d-ef0141b0c17c','92a23d34-138a-4e77-9776-f93ecccf9d61','ccf3a409-b228-4c54-9d72-f1ca10e34ad1',
      '9655ca3c-f7bc-488a-a45d-1fba3dd83950','3fd04913-0531-41f2-af26-a0e85562ad00','553329c1-5dc2-4b1e-8e13-ad6dd4c4a09a',
      '21f94444-592d-46e6-bd5a-7f539a2a2659','f4d15d9c-e12d-4ab9-9dfb-6bc8a6227bbb','1e2dde07-df7b-4929-ab8e-ee24824b5b0c',
      '5bdb1083-e270-4fc1-bd22-754eded8b182'
    );
  if v_excluded_still_eligible <> 0 then
    raise exception 'BUG_067_SAFETY_EXCLUSION_FAILED: % dei 13 esercizi plyometrici esclusi risultano comunque auto_program_eligible=true.', v_excluded_still_eligible;
  end if;
end
$$;

create or replace function public._select_dynamic_auto_exercise_candidates(
  p_goal text,
  p_level text,
  p_location text,
  p_equipment_level text,
  p_client_id uuid default null
)
returns table(
  exercise_id text,
  movement_pattern text,
  family text,
  equipment_tag text,
  min_level text,
  role text,
  movement_class text,
  sort_key text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    emm.exercise_id,
    emm.movement_pattern,
    case
      when emm.substitution_group = 'upper_pull_beginner_ground_regression'
        and coalesce(p_level, 'Principiante') in ('Principiante','beginner')
        and coalesce(p_equipment_level, 'bodyweight_only') = 'bodyweight_only'
      then 'pull_regression'
      when emm.movement_pattern in ('squat','lunge','hinge','isolation_legs') then 'lower'
      when emm.movement_pattern in ('horizontal_push','vertical_push') then 'push'
      when emm.movement_pattern in ('horizontal_pull','vertical_pull') then 'pull'
      when emm.movement_pattern in ('core_anti_extension','core_anti_rotation') then 'core'
      when emm.movement_pattern = 'cardio' then 'conditioning'
      when emm.movement_pattern = 'mobility' then 'recovery'
      else 'accessory'
    end as family,
    emm.equipment_tag,
    emm.min_level,
    emm.role,
    emm.movement_class,
    emm.exercise_id as sort_key
  from public.exercise_movement_metadata emm
  left join public.exercises e on e.id::text = emm.exercise_id
  where emm.is_active
    and (e.id is null or (e.active and coalesce(e.auto_program_eligible, false)))
    and (case p_location when 'Palestra' then 'gym' when 'Casa' then 'home' else lower(coalesce(p_location, '')) end) = any(emm.compatible_locations)
    and public._exercise_level_ordinal(emm.min_level) <= public._exercise_level_ordinal(case p_level when 'Principiante' then 'beginner' when 'Intermedio' then 'intermediate' when 'Avanzato' then 'advanced' else coalesce(p_level, 'beginner') end)
    and (case emm.equipment_tag when 'bodyweight_only' then 1 when 'home_basic' then 2 when 'full_gym' then 3 else 9 end)
      <= (case coalesce(p_equipment_level, case when p_location = 'Palestra' then 'full_gym' else 'bodyweight_only' end) when 'bodyweight_only' then 1 when 'home_basic' then 2 when 'full_gym' then 3 else 0 end)
    and (p_client_id is null or emm.exercise_id not in (select exercise_id from public.client_excluded_exercises where client_id = p_client_id and active))
  order by
    case role when 'primary' then 0 when 'secondary' then 1 else 2 end,
    case when e.source = 'ymove' then 0 else 1 end,
    emm.exercise_id;
$function$;

revoke all on function public._select_dynamic_auto_exercise_candidates(text,text,text,text,uuid) from public, anon, authenticated;

create or replace function public._dynamic_auto_program_available(
  p_goal text,
  p_level text,
  p_location text,
  p_days integer,
  p_duration integer,
  p_equipment_level text,
  p_client_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_pool_lower integer;
  v_pool_push integer;
  v_pool_pull integer;
  v_pool_pull_regression integer;
  v_pool_core integer;
  v_pool_conditioning integer;
  v_pool_recovery integer;
  v_allow_pull_regression boolean;
  v_req_lower integer;
  v_req_push integer;
  v_req_conditioning integer;
  v_needs_conditioning_day boolean;
begin
  if p_goal is null or p_level is null or p_location is null or p_days is null or p_days < 1 or p_days > 7 then
    return false;
  end if;

  select
    count(*) filter (where family = 'lower'),
    count(*) filter (where family = 'push'),
    count(*) filter (where family = 'pull'),
    count(*) filter (where family = 'pull_regression'),
    count(*) filter (where family = 'core'),
    count(*) filter (where family = 'conditioning'),
    count(*) filter (where family = 'recovery')
  into v_pool_lower, v_pool_push, v_pool_pull, v_pool_pull_regression, v_pool_core, v_pool_conditioning, v_pool_recovery
  from public._select_dynamic_auto_exercise_candidates(p_goal, p_level, p_location, p_equipment_level, p_client_id);

  v_allow_pull_regression := p_level in ('Principiante','beginner') and coalesce(p_equipment_level, 'bodyweight_only') = 'bodyweight_only';

  -- Cardinalita' richiesta per famiglia, allineata esattamente ai v_slots di
  -- _assemble_dynamic_auto_program (BUG-066): un piano a 4 giorni usa Lower A/B
  -- (2 slot 'lower' nello stesso giorno) e Upper A/B (2 slot 'push' nello stesso
  -- giorno) — "esiste almeno un esercizio" non basta, servono 2 esercizi DISTINTI
  -- per quella famiglia in quei giorni.
  v_req_lower := case when p_days = 4 then 2 else 1 end;
  v_req_push := case when p_days = 4 then 2 else 1 end;

  if v_pool_lower < v_req_lower or v_pool_push < v_req_push or v_pool_core < 1 then
    return false;
  end if;
  if v_pool_pull < 1 and not (v_allow_pull_regression and v_pool_pull_regression >= 1) then
    return false;
  end if;

  -- Giorno conditioning/recovery: presente per p_days=5 (giorno 5) o p_days>=6
  -- (giorni oltre il 5). Lo slot 'recovery' ricade sulla famiglia 'conditioning'
  -- quando il pool recovery e' vuoto, consumando un SECONDO esercizio
  -- conditioning distinto nello stesso giorno dello slot 'conditioning' diretto.
  v_needs_conditioning_day := (p_days = 5) or (p_days >= 6);
  if v_needs_conditioning_day then
    v_req_conditioning := case when v_pool_recovery >= 1 then 1 else 2 end;
    if v_pool_conditioning < v_req_conditioning then
      return false;
    end if;
  end if;

  return true;
end;
$function$;

revoke all on function public._dynamic_auto_program_available(text,text,text,integer,integer,text,uuid) from public, anon, authenticated;

create or replace function public._dynamic_auto_program_pick(
  p_goal text,
  p_level text,
  p_location text,
  p_equipment_level text,
  p_client_id uuid,
  p_family text,
  p_used text[] default '{}'::text[]
)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select c.exercise_id
  from public._select_dynamic_auto_exercise_candidates(p_goal, p_level, p_location, p_equipment_level, p_client_id) c
  where (
      c.family = p_family
      or (p_family = 'pull' and c.family = 'pull_regression' and coalesce(p_level, 'Principiante') in ('Principiante','beginner') and coalesce(p_equipment_level, 'bodyweight_only') = 'bodyweight_only')
    )
    and c.exercise_id <> all(coalesce(p_used, '{}'::text[]))
  order by
    case when c.family = p_family then 0 else 1 end,
    case c.role when 'primary' then 0 when 'secondary' then 1 else 2 end,
    c.sort_key
  limit 1;
$function$;

revoke all on function public._dynamic_auto_program_pick(text,text,text,text,uuid,text,text[]) from public, anon, authenticated;

create or replace function public._assemble_dynamic_auto_program(
  p_cycle_id uuid,
  p_client_id uuid,
  p_goal text,
  p_level text,
  p_location text,
  p_days integer,
  p_duration integer,
  p_equipment_level text,
  p_name_prefix text default 'Programma automatico dinamico'
)
returns uuid[]
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan_ids uuid[] := '{}';
  v_day integer;
  v_plan_id uuid;
  v_day_id uuid;
  v_used text[];
  v_slots text[];
  v_slot text;
  v_exercise_id text;
  v_order integer;
  v_sets integer;
  v_reps integer;
  v_rest integer;
  v_day_label text;
begin
  if not public._dynamic_auto_program_available(p_goal, p_level, p_location, p_days, p_duration, p_equipment_level, p_client_id) then
    raise exception 'DYNAMIC_AUTO_PROGRAM_UNAVAILABLE';
  end if;

  v_sets := case p_level when 'Principiante' then 2 when 'Intermedio' then 3 else 3 end;
  v_reps := case p_goal when 'Forza' then 6 when 'Dimagrimento' then 12 when 'Performance' then 10 else 10 end;
  v_rest := case p_goal when 'Forza' then 120 when 'Dimagrimento' then 60 else 75 end;

  for v_day in 1..p_days loop
    v_used := '{}';
    v_day_label := case
      when p_days <= 3 then 'Full Body ' || chr(64 + v_day)
      when p_days = 4 and v_day in (1,3) then 'Lower ' || case when v_day = 1 then 'A' else 'B' end
      when p_days = 4 then 'Upper ' || case when v_day = 2 then 'A' else 'B' end
      when p_days = 5 and v_day = 5 then 'Conditioning'
      when p_days >= 6 and v_day > 5 then 'Recovery ' || (v_day - 5)::text
      else 'Workout ' || v_day::text
    end;

    v_slots := case
      when p_days = 4 and v_day in (1,3) then array['lower','core','lower']
      when p_days = 4 then array['push','pull','core','push']
      when p_days = 5 and v_day = 5 then array['conditioning','core','recovery']
      when p_days >= 6 and v_day > 5 then array['recovery','core','conditioning']
      else array['lower','push','pull','core']
    end;

    insert into public.workout_plans(coach_id, client_id, template_id, name, status, start_date, expiry_date, session_status, day_label, origin)
    values (null, p_client_id, null, p_name_prefix || ' - ' || v_day_label, 'active', current_date, current_date + interval '90 days', 'todo', v_day_label, 'auto_system')
    returning id into v_plan_id;

    insert into public.client_program_cycle_plans(cycle_id, workout_plan_id)
    values (p_cycle_id, v_plan_id)
    on conflict do nothing;

    insert into public.workout_days(workout_plan_id, day_order)
    values (v_plan_id, 1)
    returning id into v_day_id;

    v_order := 1;
    foreach v_slot in array v_slots loop
      v_exercise_id := public._dynamic_auto_program_pick(p_goal, p_level, p_location, p_equipment_level, p_client_id, v_slot, v_used);
      if v_exercise_id is null and v_slot = 'recovery' then
        v_exercise_id := public._dynamic_auto_program_pick(p_goal, p_level, p_location, p_equipment_level, p_client_id, 'conditioning', v_used);
      end if;
      if v_exercise_id is null then
        raise exception 'DYNAMIC_AUTO_PROGRAM_SLOT_UNAVAILABLE: %', v_slot;
      end if;
      insert into public.workout_day_exercises(
        workout_day_id, exercise_id, exercise_order, sets, reps, reps_min, reps_max,
        rest_seconds, notes, technique_type, duration_seconds, rpe_rir
      ) values (
        v_day_id, v_exercise_id, v_order,
        case when v_slot in ('recovery','conditioning') and p_days >= 6 then greatest(1, v_sets - 1) else v_sets end,
        case when v_slot = 'conditioning' then 1 else v_reps end,
        case when v_slot = 'conditioning' then null else greatest(1, v_reps - 2) end,
        case when v_slot = 'conditioning' then null else v_reps + 2 end,
        case when v_slot = 'conditioning' then 0 else v_rest end,
        case when v_slot = 'pull' and exists (select 1 from public.exercise_movement_metadata where exercise_id = v_exercise_id and substitution_group = 'upper_pull_beginner_ground_regression')
          then 'Regressione scapolare/posteriore approvata per Principiante + bodyweight_only: non classificata come trazione reale.'
          else 'Selezione dinamica automatica: goal, livello, luogo, attrezzatura ed esclusioni rispettati.' end,
        'normal',
        case when v_slot = 'conditioning' then least(greatest(coalesce(p_duration,45) * 60 / 5, 300), 900) else null end,
        case when p_level = 'Principiante' then 'RIR 3' else 'RIR 2' end
      );
      v_used := array_append(v_used, v_exercise_id);
      v_order := v_order + 1;
    end loop;

    v_plan_ids := array_append(v_plan_ids, v_plan_id);
  end loop;

  return v_plan_ids;
end;
$function$;

revoke all on function public._assemble_dynamic_auto_program(uuid,uuid,text,text,text,integer,integer,text,text) from public, anon, authenticated;

alter function public.assign_initial_auto_program() rename to _assign_initial_auto_program_template_engine_before_dynamic;

create or replace function public.assign_initial_auto_program()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cycle_id uuid;
  v_cycle public.client_program_cycles%rowtype;
  v_profile public.client_fitness_profile%rowtype;
  v_onboarding_mode text;
  v_goals text[];
  v_experience text;
  v_training_days integer;
  v_goal text;
  v_level text;
  v_location text;
  v_days integer;
  v_duration integer;
  v_plan_ids uuid[];
  v_reason text;
  v_snapshot jsonb;
begin
  v_cycle_id := public._assign_initial_auto_program_template_engine_before_dynamic();

  select * into v_cycle from public.client_program_cycles where id = v_cycle_id for update;
  if not found or v_cycle.status <> 'pending_template' then
    return v_cycle_id;
  end if;

  select * into v_profile from public.client_fitness_profile where client_id = v_cycle.client_id;
  select client_mode, goals, experience_level, training_days_per_week
  into v_onboarding_mode, v_goals, v_experience, v_training_days
  from public.client_onboarding
  where client_id = v_cycle.client_id;

  if not found or v_onboarding_mode <> 'self_guided' or not coalesce(v_profile.completed, false) or coalesce(v_profile.requires_professional_supervision, false) then
    return v_cycle_id;
  end if;

  v_level := case v_experience
    when 'beginner' then 'Principiante'
    when 'novice' then 'Principiante'
    when 'intermediate' then 'Intermedio'
    when 'advanced' then 'Avanzato'
    when 'competitive' then 'Avanzato'
    else 'Intermedio'
  end;
  v_goal := case v_goals[1]
    when 'Perdere peso' then 'Dimagrimento'
    when 'Costruire muscoli' then 'Massa muscolare'
    when 'Diventare piu'' forte' then 'Forza'
    when 'Diventare più forte' then 'Forza'
    when 'Migliorare i fondamentali' then 'Principianti'
    when 'Migliorare il condizionamento' then 'Performance'
    when 'Preparazione sportiva' then 'Performance'
    else 'Principianti'
  end;
  v_location := case v_profile.location when 'gym' then 'Palestra' when 'home' then 'Casa' else 'Palestra' end;
  v_days := coalesce(v_training_days, 3);
  v_duration := coalesce(v_profile.session_duration_minutes, 45);

  if not public._dynamic_auto_program_available(v_goal, v_level, v_location, v_days, v_duration, v_profile.equipment_level, v_cycle.client_id) then
    return v_cycle_id;
  end if;

  v_reason := 'Programma dinamico assegnato automaticamente: stesso obiettivo, livello compatibile, luogo/attrezzatura reali ed esclusioni rispettate.';
  v_snapshot := jsonb_build_object(
    'fitness_profile', to_jsonb(v_profile),
    'onboarding_goals', to_jsonb(v_goals),
    'onboarding_experience_level', v_experience,
    'onboarding_training_days_per_week', v_training_days,
    'dynamic_engine_version', 7
  );

  -- Rete di sicurezza (BUG-066): _dynamic_auto_program_available e' stata allineata
  -- alla cardinalita' reale richiesta da _assemble_dynamic_auto_program, quindi
  -- questo blocco non dovrebbe piu' sollevare normalmente. Resta comunque avvolto
  -- per non propagare mai un'eccezione non gestita per un caso non previsto: in
  -- quel caso il ciclo torna a pending_template invece di rompere la chiamata RPC.
  begin
    update public.client_program_cycles
    set status = 'active',
        decision_reason = v_reason,
        template_id = null,
        fitness_profile_snapshot = v_snapshot,
        review_due_at = coalesce(review_due_at, current_date + 28),
        algorithm_version = 7,
        created_by = coalesce(created_by, v_cycle.client_id)
    where id = v_cycle_id
      and status = 'pending_template';

    v_plan_ids := public._assemble_dynamic_auto_program(v_cycle_id, v_cycle.client_id, v_goal, v_level, v_location, v_days, v_duration, v_profile.equipment_level, 'Programma automatico dinamico');
    perform public._generate_cycle_sessions(v_cycle_id, v_plan_ids);

    delete from public.app_notifications
    where dedup_key = 'review_blocked_no_template:' || v_cycle_id::text;

    insert into public.app_notifications(recipient_id, recipient_role, type, title, body, data, dedup_key)
    values (
      v_cycle.client_id,
      'cliente',
      'auto_program_assigned',
      'Il tuo programma è pronto',
      v_reason,
      jsonb_build_object('cycle_id', v_cycle_id, 'engine', 'dynamic'),
      'auto_program_assigned:' || v_cycle_id::text
    )
    on conflict do nothing;
  exception when others then
    if sqlerrm like 'DYNAMIC_AUTO_PROGRAM_SLOT_UNAVAILABLE%' or sqlerrm like 'DYNAMIC_AUTO_PROGRAM_UNAVAILABLE%' then
      update public.client_program_cycles
      set status = 'pending_template',
          decision_reason = 'DYNAMIC_ENGINE_ASSEMBLY_FAILED_SAFETY_NET: ' || sqlerrm
      where id = v_cycle_id;
    else
      raise;
    end if;
  end;

  return v_cycle_id;
end;
$function$;

revoke all on function public.assign_initial_auto_program() from public, anon;
grant execute on function public.assign_initial_auto_program() to authenticated;

alter function public.run_cycle_review(uuid) rename to _run_cycle_review_template_engine_before_dynamic;

create or replace function public.run_cycle_review(p_cycle_id uuid default null::uuid)
returns table(decision text, cycle_id uuid, next_cycle_id uuid, decision_reason text, blocked boolean, result_code text, metrics jsonb)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result record;
  v_cycle public.client_program_cycles%rowtype;
  v_template public.workout_templates%rowtype;
  v_checkin public.client_monthly_checkins%rowtype;
  v_client_id uuid;
  v_goal text;
  v_level text;
  v_location text;
  v_days integer;
  v_duration integer;
  v_equipment text;
  v_new_cycle_id uuid;
  v_plan_ids uuid[];
  v_review_id uuid;
  v_reason text;
begin
  select * into v_result from public._run_cycle_review_template_engine_before_dynamic(p_cycle_id);

  if v_result.decision is distinct from 'pending_template' then
    return query select v_result.decision, v_result.cycle_id, v_result.next_cycle_id, v_result.decision_reason, v_result.blocked, v_result.result_code, v_result.metrics;
    return;
  end if;

  select * into v_cycle from public.client_program_cycles where id = v_result.cycle_id for update;
  if not found or v_cycle.status <> 'pending_template' then
    return query select v_result.decision, v_result.cycle_id, v_result.next_cycle_id, v_result.decision_reason, v_result.blocked, v_result.result_code, v_result.metrics;
    return;
  end if;

  v_client_id := v_cycle.client_id;
  select * into v_template from public.workout_templates where id = v_cycle.template_id;
  select * into v_checkin from public.client_monthly_checkins where client_monthly_checkins.cycle_id = v_cycle.id order by updated_at desc limit 1;
  if not found then
    return query select v_result.decision, v_result.cycle_id, v_result.next_cycle_id, v_result.decision_reason, v_result.blocked, v_result.result_code, v_result.metrics;
    return;
  end if;

  v_goal := coalesce(
    case v_checkin.goal_changed_to
      when 'Perdere peso' then 'Dimagrimento'
      when 'Costruire muscoli' then 'Massa muscolare'
      when 'Diventare più forte' then 'Forza'
      when 'Diventare piu'' forte' then 'Forza'
      when 'Migliorare i fondamentali' then 'Principianti'
      when 'Migliorare il condizionamento' then 'Performance'
      when 'Preparazione sportiva' then 'Performance'
      else null
    end,
    v_template.goal,
    'Principianti'
  );
  v_level := coalesce(v_template.level, 'Intermedio');
  v_location := coalesce(case v_checkin.location when 'gym' then 'Palestra' when 'home' then 'Casa' else null end, v_template.location, 'Palestra');
  v_days := coalesce(v_checkin.available_days_per_week, v_template.sessions_per_week, 3);
  v_duration := coalesce(v_checkin.available_minutes, v_template.estimated_session_minutes, 45);
  v_equipment := coalesce(v_checkin.equipment_level, v_cycle.fitness_profile_snapshot #>> '{fitness_profile,equipment_level}', case when v_location = 'Palestra' then 'full_gym' else 'bodyweight_only' end);

  if not public._dynamic_auto_program_available(v_goal, v_level, v_location, v_days, v_duration, v_equipment, v_client_id) then
    return query select v_result.decision, v_result.cycle_id, v_result.next_cycle_id, v_result.decision_reason, v_result.blocked, v_result.result_code, v_result.metrics;
    return;
  end if;

  v_reason := 'Revisione recuperata dal motore dinamico: stesso goal, livello compatibile, luogo/attrezzatura reali, esclusioni rispettate.';

  -- Rete di sicurezza (BUG-066): stesso ragionamento di assign_initial_auto_program.
  -- Se _assemble_dynamic_auto_program fallisce comunque per un caso non previsto dal
  -- gate di disponibilita', il ciclo precedente torna a pending_template invece di
  -- restare 'replaced' con un ciclo nuovo mai completato o di propagare l'errore.
  begin
    update public.client_program_cycles set status = 'replaced', replaced_at = now(), completed_at = null where id = v_cycle.id;

    insert into public.client_program_cycles(client_id,status,cycle_number,previous_cycle_id,source,decision_reason,template_id,fitness_profile_snapshot,started_at,review_due_at,created_by,algorithm_version)
    values (v_client_id,'active',v_cycle.cycle_number + 1,v_cycle.id,'auto_partial_change',v_reason,null,v_cycle.fitness_profile_snapshot || jsonb_build_object('dynamic_engine_version',7),current_date,current_date+28,v_client_id,7)
    returning id into v_new_cycle_id;

    v_plan_ids := public._assemble_dynamic_auto_program(v_new_cycle_id, v_client_id, v_goal, v_level, v_location, v_days, v_duration, v_equipment, 'Programma automatico dinamico');
    perform public._generate_cycle_sessions(v_new_cycle_id, v_plan_ids);

    select id into v_review_id from public.client_cycle_reviews where client_cycle_reviews.cycle_id = v_cycle.id order by reviewed_at desc limit 1;
    if v_review_id is not null then
      update public.client_cycle_reviews
      set decision = 'partial_change', decision_reason = v_reason, eligibility_result = 'eligible', next_cycle_id = v_new_cycle_id, next_template_id = null, algorithm_version = 7
      where id = v_review_id;
    end if;

    delete from public.app_notifications
    where dedup_key = 'review_blocked_no_template:' || v_cycle.id::text;

    insert into public.app_notifications(recipient_id, recipient_role, type, title, body, data, dedup_key)
    values (v_client_id, 'cliente', 'review_completed', 'Programma aggiornato', v_reason, jsonb_build_object('cycle_id', v_cycle.id, 'next_cycle_id', v_new_cycle_id, 'engine', 'dynamic'), 'review_completed_dynamic:' || v_cycle.id::text) on conflict do nothing;

    return query select 'partial_change'::text, v_cycle.id, v_new_cycle_id, v_reason, false, 'eligible_dynamic'::text, coalesce(v_result.metrics, '{}'::jsonb);
    return;
  exception when others then
    if sqlerrm like 'DYNAMIC_AUTO_PROGRAM_SLOT_UNAVAILABLE%' or sqlerrm like 'DYNAMIC_AUTO_PROGRAM_UNAVAILABLE%' then
      update public.client_program_cycles
      set status = 'pending_template',
          decision_reason = 'DYNAMIC_ENGINE_ASSEMBLY_FAILED_SAFETY_NET: ' || sqlerrm
      where id = v_cycle.id;
      return query select 'pending_template'::text, v_cycle.id, null::uuid, ('DYNAMIC_ENGINE_ASSEMBLY_FAILED_SAFETY_NET: ' || sqlerrm), true, 'eligible_dynamic_blocked'::text, coalesce(v_result.metrics, '{}'::jsonb);
      return;
    else
      raise;
    end if;
  end;
end;
$function$;

revoke all on function public.run_cycle_review(uuid) from public, anon;
grant execute on function public.run_cycle_review(uuid) to authenticated;

commit;
