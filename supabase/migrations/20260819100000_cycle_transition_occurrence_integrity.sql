begin;

alter table public.client_cycle_exercise_transitions
  add column if not exists previous_workout_exercise_id uuid references public.workout_day_exercises(id) on delete set null,
  add column if not exists new_workout_exercise_id uuid references public.workout_day_exercises(id) on delete set null;

do $$
declare
  v_duplicates integer;
begin
  select count(*) into v_duplicates
  from (
    select review_id, previous_exercise_id, new_exercise_id, action
    from public.client_cycle_exercise_transitions
    group by review_id, previous_exercise_id, new_exercise_id, action
    having count(*) > 1
  ) duplicate_keys;

  if v_duplicates > 0 then
    raise exception 'CYCLE_TRANSITION_STATE_INCOHERENT: % duplicate legacy transition keys exist', v_duplicates;
  end if;
end;
$$;

alter table public.client_cycle_exercise_transitions
  drop constraint client_cycle_exercise_transitions_unique;

create unique index client_cycle_exercise_transitions_occurrence_unique
  on public.client_cycle_exercise_transitions (
    review_id,
    coalesce(previous_workout_exercise_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(new_workout_exercise_id, '00000000-0000-0000-0000-000000000000'::uuid),
    action
  );

create or replace function public.resolve_cycle_transition_occurrences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_id uuid;
  v_new_id uuid;
begin
  if new.origin <> 'automatic' or new.review_id is null then
    return new;
  end if;

  if new.previous_workout_exercise_id is null
     and new.previous_exercise_id is not null
     and new.previous_cycle_id is not null then
    select wde.id into v_previous_id
    from public.client_program_cycle_plans cpp
    join public.workout_days wd on wd.workout_plan_id = cpp.workout_plan_id
    join public.workout_day_exercises wde on wde.workout_day_id = wd.id
    where cpp.cycle_id = new.previous_cycle_id
      and wde.exercise_id = new.previous_exercise_id
      and not exists (
        select 1
        from public.client_cycle_exercise_transitions used_t
        where used_t.review_id = new.review_id
          and used_t.previous_workout_exercise_id = wde.id
      )
    order by wd.day_order nulls last, wd.id, wde.exercise_order nulls last, wde.id
    limit 1;

    if v_previous_id is null then
      raise exception 'CYCLE_TRANSITION_OCCURRENCE_REQUIRED: no unused previous occurrence for exercise % in cycle %',
        new.previous_exercise_id, new.previous_cycle_id;
    end if;
    new.previous_workout_exercise_id := v_previous_id;
  end if;

  if new.new_workout_exercise_id is null
     and new.new_exercise_id is not null
     and new.next_cycle_id is not null then
    select wde.id into v_new_id
    from public.client_program_cycle_plans cpp
    join public.workout_days wd on wd.workout_plan_id = cpp.workout_plan_id
    join public.workout_day_exercises wde on wde.workout_day_id = wd.id
    where cpp.cycle_id = new.next_cycle_id
      and wde.exercise_id = new.new_exercise_id
      and not exists (
        select 1
        from public.client_cycle_exercise_transitions used_t
        where used_t.review_id = new.review_id
          and used_t.new_workout_exercise_id = wde.id
      )
    order by wd.day_order nulls last, wd.id, wde.exercise_order nulls last, wde.id
    limit 1;

    if v_new_id is null then
      select wde.id into v_new_id
      from public.workout_plans wp
      join public.workout_days wd on wd.workout_plan_id = wp.id
      join public.workout_day_exercises wde on wde.workout_day_id = wd.id
      where wp.client_id = new.client_id
        and wp.origin = 'auto_system'
        and wp.created_at >= (select created_at from public.client_program_cycles where id = new.next_cycle_id)
        and wde.exercise_id = new.new_exercise_id
        and not exists (
          select 1
          from public.client_cycle_exercise_transitions used_t
          where used_t.review_id = new.review_id
            and used_t.new_workout_exercise_id = wde.id
        )
      order by wp.created_at, wp.id, wd.day_order, wd.id, wde.exercise_order, wde.id
      limit 1;
    end if;

    if v_new_id is null then
      raise exception 'CYCLE_TRANSITION_OCCURRENCE_REQUIRED: no unused new occurrence for exercise % in cycle %',
        new.new_exercise_id, new.next_cycle_id;
    end if;
    new.new_workout_exercise_id := v_new_id;
  end if;

  return new;
end;
$$;

create or replace function public.validate_cycle_transition_occurrences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exercise_id text;
  v_cycle_id uuid;
begin
  if new.previous_workout_exercise_id is not null then
    select wde.exercise_id, cpp.cycle_id
      into v_exercise_id, v_cycle_id
    from public.workout_day_exercises wde
    join public.workout_days wd on wd.id = wde.workout_day_id
    join public.client_program_cycle_plans cpp on cpp.workout_plan_id = wd.workout_plan_id
    where wde.id = new.previous_workout_exercise_id;

    if v_exercise_id is null or v_exercise_id <> new.previous_exercise_id or v_cycle_id <> new.previous_cycle_id then
      raise exception 'CYCLE_TRANSITION_OCCURRENCE_MISMATCH: previous occurrence %, exercise %, cycle %',
        new.previous_workout_exercise_id, new.previous_exercise_id, new.previous_cycle_id;
    end if;
  end if;

  if new.new_workout_exercise_id is not null then
    select wde.exercise_id, cpp.cycle_id
      into v_exercise_id, v_cycle_id
    from public.workout_day_exercises wde
    join public.workout_days wd on wd.id = wde.workout_day_id
    join public.client_program_cycle_plans cpp on cpp.workout_plan_id = wd.workout_plan_id
    where wde.id = new.new_workout_exercise_id;

    if v_exercise_id is null or v_exercise_id <> new.new_exercise_id or v_cycle_id <> new.next_cycle_id then
      raise exception 'CYCLE_TRANSITION_OCCURRENCE_MISMATCH: new occurrence %, exercise %, cycle %',
        new.new_workout_exercise_id, new.new_exercise_id, new.next_cycle_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger client_cycle_transition_resolve_occurrences
before insert on public.client_cycle_exercise_transitions
for each row execute function public.resolve_cycle_transition_occurrences();

create trigger client_cycle_transition_validate_occurrences
before insert or update on public.client_cycle_exercise_transitions
for each row execute function public.validate_cycle_transition_occurrences();

commit;
