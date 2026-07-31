BEGIN;

select set_config('request.jwt.claim.sub','981f182c-4c02-476e-bc2b-1215d43677e8', true);
select set_config('role','authenticated', true);

insert into public.client_onboarding (
  client_id, client_mode, onboarding_completed
) values (
  '981f182c-4c02-476e-bc2b-1215d43677e8', 'self_guided', false
);

update public.client_onboarding
set onboarding_completed = true,
    gender = 'unspecified',
    goals = array['Costruire muscoli']::text[],
    focus_areas = array['full_body']::text[],
    training_reasons = array['health']::text[],
    experience_level = 'intermediate',
    training_days_per_week = 3,
    weight_kg = 75,
    height_cm = 175,
    bmi = 24.5,
    bmi_category = 'Normopeso',
    completed_at = now()
where client_id = '981f182c-4c02-476e-bc2b-1215d43677e8';

insert into public.client_fitness_profile (
  client_id, age, location, equipment_level, session_duration_minutes, preferred_training_style,
  has_pain_or_limitation, pain_areas, requires_professional_supervision, completed, completed_at
) values (
  '981f182c-4c02-476e-bc2b-1215d43677e8', 35, 'gym', 'full_gym', 60, 'full_body',
  false, '{}'::text[], false, true, now()
);

insert into public.user_subscriptions (user_id, package_id, status, starts_at, expires_at, payment_provider, external_subscription_id)
select '981f182c-4c02-476e-bc2b-1215d43677e8', sp.id, 'active', now(), now() + interval '30 days', 'revenuecat', 'synthetic-rollback-20260816100000'
from public.subscription_packages sp
where sp.target_role='client' and sp.revenuecat_entitlement_id='client_pro' and sp.is_active
order by sp.duration_value
limit 1;

with first_call as (
  select public.assign_initial_auto_program() as cycle_id
), second_call as (
  select public.assign_initial_auto_program() as cycle_id
), duplicate_plans as (
  select cpp.cycle_id, wd.workout_plan_id, wde.exercise_id, count(*) as duplicate_count
  from public.client_program_cycle_plans cpp
  join public.workout_days wd on wd.workout_plan_id = cpp.workout_plan_id
  join public.workout_day_exercises wde on wde.workout_day_id = wd.id
  group by cpp.cycle_id, wd.workout_plan_id, wde.exercise_id
), summary as (
  select
    fc.cycle_id as first_cycle_id,
    sc.cycle_id as second_cycle_id,
    fc.cycle_id = sc.cycle_id as retry_idempotent,
    wt.name as template_name,
    cpc.status as cycle_status,
    count(distinct cpp.workout_plan_id)::integer as plan_count,
    count(distinct wde.id)::integer as exercise_count,
    count(distinct cpcs.id)::integer as occurrence_count,
    count(distinct dp.workout_plan_id || ':' || dp.exercise_id) filter (where dp.duplicate_count > 1)::integer as duplicate_exercise_count,
    exists (
      select 1 from public.workout_plans wp2
      join public.client_program_cycle_plans cpp2 on cpp2.workout_plan_id = wp2.id
      where cpp2.cycle_id = fc.cycle_id and wp2.status='active'
    ) as workout_visible_immediately
  from first_call fc
  cross join second_call sc
  join public.client_program_cycles cpc on cpc.id = fc.cycle_id
  join public.workout_templates wt on wt.id = cpc.template_id
  left join public.client_program_cycle_plans cpp on cpp.cycle_id = cpc.id
  left join public.workout_days wd on wd.workout_plan_id = cpp.workout_plan_id
  left join public.workout_day_exercises wde on wde.workout_day_id = wd.id
  left join public.client_program_cycle_sessions cpcs on cpcs.cycle_id = cpc.id
  left join duplicate_plans dp on dp.cycle_id = cpc.id and dp.workout_plan_id = cpp.workout_plan_id and dp.exercise_id = wde.exercise_id
  group by fc.cycle_id, sc.cycle_id, wt.name, cpc.status
)
select * from summary;

ROLLBACK;
