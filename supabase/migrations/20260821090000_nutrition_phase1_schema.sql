-- FitCoach Nutrizione Fase 1 (YMove foods/recipes/mealplans).
-- Schema per: piano alimentare generato e persistito (con snapshot ricetta/
-- ingredienti, per non richiedere una seconda chiamata YMove ad ogni
-- apertura), e diario alimentare del cliente.
--
-- Fuori scope esplicito per questa fase (nota per il futuro, non cancellare
-- l'idea): il concetto "piano nutrizionale assegnato manualmente dal coach"
-- NON viene reintrodotto qui. Un possibile sviluppo futuro e' un override del
-- coach su un singolo pasto gia' generato (stessa forma di
-- client_nutrition_plan_meals, con un campo aggiuntivo tipo
-- overridden_by_coach_id) — non implementato ora, deliberatamente.

begin;

create table if not exists public.client_nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  calories integer not null,
  diet text not null,
  meals_per_day integer not null,
  days_count integer not null,
  macro_split text not null,
  average_daily_totals jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_nutrition_plans_status_check check (status in ('active', 'archived')),
  -- Enum verificato byte-per-byte contro l'OpenAPI reale di /mealplans/generate
  -- (2026-08-04): 'balanced' e' valido SOLO qui, non su /recipes/search.
  constraint client_nutrition_plans_diet_check check (
    diet in ('balanced', 'high_protein', 'low_carb', 'keto', 'vegan', 'vegetarian', 'mediterranean', 'paleo')
  ),
  constraint client_nutrition_plans_macro_split_check check (
    macro_split in ('balanced', 'high_protein', 'low_carb', 'high_fat')
  ),
  constraint client_nutrition_plans_meals_per_day_check check (meals_per_day between 3 and 6),
  constraint client_nutrition_plans_days_count_check check (days_count between 1 and 7),
  constraint client_nutrition_plans_calories_check check (calories > 0)
);

-- Un solo piano 'active' per cliente alla volta (stesso pattern del ciclo
-- corrente in client_program_cycles): generare un piano nuovo archivia quello
-- precedente, mai due piani attivi in contemporanea.
create unique index if not exists client_nutrition_plans_one_active_per_client_idx
  on public.client_nutrition_plans(client_id) where status = 'active';

create index if not exists client_nutrition_plans_client_idx on public.client_nutrition_plans(client_id);

drop trigger if exists client_nutrition_plans_set_updated_at on public.client_nutrition_plans;
create trigger client_nutrition_plans_set_updated_at
before update on public.client_nutrition_plans
for each row execute function public.set_updated_at();

create table if not exists public.client_nutrition_plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.client_nutrition_plans(id) on delete cascade,
  day_index integer not null,
  totals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_nutrition_plan_days_day_index_check check (day_index between 1 and 7),
  constraint client_nutrition_plan_days_unique unique (plan_id, day_index)
);

create index if not exists client_nutrition_plan_days_plan_idx on public.client_nutrition_plan_days(plan_id);

drop trigger if exists client_nutrition_plan_days_set_updated_at on public.client_nutrition_plan_days;
create trigger client_nutrition_plan_days_set_updated_at
before update on public.client_nutrition_plan_days
for each row execute function public.set_updated_at();

create table if not exists public.client_nutrition_plan_meals (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.client_nutrition_plan_days(id) on delete cascade,
  meal_order integer not null,
  meal_type text not null,
  recipe_id text not null,
  recipe_slug text not null,
  name text not null,
  image_url text,
  portion_multiplier numeric not null,
  calories numeric not null,
  protein numeric not null,
  carbs numeric not null,
  fat numeric not null,
  -- Snapshot completo (recipe + foods, gia' scalati per portionMultiplier)
  -- cosi' come restituito da /mealplans/generate: la UI mostra ricetta,
  -- istruzioni e ingredienti senza una seconda chiamata a /recipes/{id}.
  recipe_snapshot jsonb not null default '{}'::jsonb,
  foods_snapshot jsonb not null default '[]'::jsonb,
  swapped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_nutrition_plan_meals_meal_type_check check (
    meal_type in ('breakfast', 'lunch', 'dinner', 'snack')
  ),
  constraint client_nutrition_plan_meals_portion_check check (portion_multiplier > 0),
  constraint client_nutrition_plan_meals_unique unique (plan_day_id, meal_order)
);

create index if not exists client_nutrition_plan_meals_day_idx on public.client_nutrition_plan_meals(plan_day_id);

drop trigger if exists client_nutrition_plan_meals_set_updated_at on public.client_nutrition_plan_meals;
create trigger client_nutrition_plan_meals_set_updated_at
before update on public.client_nutrition_plan_meals
for each row execute function public.set_updated_at();

create table if not exists public.client_nutrition_diary_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null,
  meal_type text not null,
  source text not null,
  ymove_food_id text,
  ymove_recipe_id text,
  name text not null,
  quantity_grams numeric,
  quantity_portions numeric,
  calories numeric not null,
  protein numeric not null,
  carbs numeric not null,
  fat numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_nutrition_diary_entries_meal_type_check check (
    meal_type in ('breakfast', 'lunch', 'dinner', 'snack')
  ),
  constraint client_nutrition_diary_entries_source_check check (source in ('food', 'recipe')),
  constraint client_nutrition_diary_entries_source_id_check check (
    (source = 'food' and ymove_food_id is not null) or (source = 'recipe' and ymove_recipe_id is not null)
  ),
  constraint client_nutrition_diary_entries_quantity_check check (
    quantity_grams is not null or quantity_portions is not null
  ),
  constraint client_nutrition_diary_entries_macros_check check (
    calories >= 0 and protein >= 0 and carbs >= 0 and fat >= 0
  )
);

create index if not exists client_nutrition_diary_entries_client_date_idx
  on public.client_nutrition_diary_entries(client_id, entry_date);

drop trigger if exists client_nutrition_diary_entries_set_updated_at on public.client_nutrition_diary_entries;
create trigger client_nutrition_diary_entries_set_updated_at
before update on public.client_nutrition_diary_entries
for each row execute function public.set_updated_at();

-- RLS: cliente legge/scrive SOLO i propri dati. Stesso schema a cascata gia'
-- usato da workout_days/workout_day_exercises (join fino al proprietario).
alter table public.client_nutrition_plans enable row level security;
alter table public.client_nutrition_plan_days enable row level security;
alter table public.client_nutrition_plan_meals enable row level security;
alter table public.client_nutrition_diary_entries enable row level security;

drop policy if exists client_nutrition_plans_owner_all on public.client_nutrition_plans;
create policy client_nutrition_plans_owner_all on public.client_nutrition_plans
for all to authenticated
using (client_id = auth.uid())
with check (client_id = auth.uid());

drop policy if exists client_nutrition_plans_superadmin_all on public.client_nutrition_plans;
create policy client_nutrition_plans_superadmin_all on public.client_nutrition_plans
for all to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists client_nutrition_plan_days_owner_read on public.client_nutrition_plan_days;
create policy client_nutrition_plan_days_owner_read on public.client_nutrition_plan_days
for select to authenticated
using (exists (
  select 1 from public.client_nutrition_plans p
  where p.id = client_nutrition_plan_days.plan_id and p.client_id = auth.uid()
));

drop policy if exists client_nutrition_plan_days_superadmin_all on public.client_nutrition_plan_days;
create policy client_nutrition_plan_days_superadmin_all on public.client_nutrition_plan_days
for all to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists client_nutrition_plan_meals_owner_read on public.client_nutrition_plan_meals;
create policy client_nutrition_plan_meals_owner_read on public.client_nutrition_plan_meals
for select to authenticated
using (exists (
  select 1 from public.client_nutrition_plan_days d
  join public.client_nutrition_plans p on p.id = d.plan_id
  where d.id = client_nutrition_plan_meals.plan_day_id and p.client_id = auth.uid()
));

drop policy if exists client_nutrition_plan_meals_superadmin_all on public.client_nutrition_plan_meals;
create policy client_nutrition_plan_meals_superadmin_all on public.client_nutrition_plan_meals
for all to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

-- Scritture su plan/days/meals passano SEMPRE dalle RPC SECURITY DEFINER sotto
-- (save_nutrition_plan / swap_nutrition_plan_meal): nessuna policy INSERT/
-- UPDATE/DELETE diretta lato client per queste 3 tabelle (solo owner_all su
-- client_nutrition_plans copre anche insert/update/delete diretti, ma le RPC
-- sono comunque il percorso previsto per garantire coerenza tra piano/giorni/
-- pasti/totali in un'unica transazione).

drop policy if exists client_nutrition_diary_entries_owner_all on public.client_nutrition_diary_entries;
create policy client_nutrition_diary_entries_owner_all on public.client_nutrition_diary_entries
for all to authenticated
using (client_id = auth.uid())
with check (client_id = auth.uid());

drop policy if exists client_nutrition_diary_entries_superadmin_all on public.client_nutrition_diary_entries;
create policy client_nutrition_diary_entries_superadmin_all on public.client_nutrition_diary_entries
for all to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

revoke all on public.client_nutrition_plans from public, anon;
revoke all on public.client_nutrition_plan_days from public, anon;
revoke all on public.client_nutrition_plan_meals from public, anon;
revoke all on public.client_nutrition_diary_entries from public, anon;
grant select, insert, update, delete on public.client_nutrition_plans to authenticated;
grant select on public.client_nutrition_plan_days to authenticated;
grant select on public.client_nutrition_plan_meals to authenticated;
grant select, insert, update, delete on public.client_nutrition_diary_entries to authenticated;

-- Salva un piano generato da /mealplans/generate: archivia l'eventuale piano
-- attivo precedente, inserisce piano + giorni + pasti in un'unica
-- transazione. p_days rispecchia esattamente data.days[] dello schema YMove
-- (dayIndex, totals, meals[]) — MAI data.meals/data.totals (alias solo del
-- giorno 1, verificato esplicitamente contro l'OpenAPI reale).
create or replace function public.save_nutrition_plan(
  p_calories integer,
  p_diet text,
  p_meals_per_day integer,
  p_days_count integer,
  p_macro_split text,
  p_average_daily_totals jsonb,
  p_days jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_plan_id uuid;
  v_day jsonb;
  v_day_id uuid;
  v_meal jsonb;
  v_meal_order integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  v_client_id := auth.uid();
  if not exists (select 1 from public.profiles where id = v_client_id and role = 'cliente') then
    raise exception 'FORBIDDEN: solo un cliente puo'' salvare il proprio piano nutrizionale';
  end if;

  update public.client_nutrition_plans
  set status = 'archived', updated_at = now()
  where client_id = v_client_id and status = 'active';

  insert into public.client_nutrition_plans (
    client_id, status, calories, diet, meals_per_day, days_count, macro_split, average_daily_totals
  ) values (
    v_client_id, 'active', p_calories, p_diet, p_meals_per_day, p_days_count, p_macro_split,
    coalesce(p_average_daily_totals, '{}'::jsonb)
  )
  returning id into v_plan_id;

  for v_day in select * from jsonb_array_elements(coalesce(p_days, '[]'::jsonb))
  loop
    insert into public.client_nutrition_plan_days (plan_id, day_index, totals)
    values (v_plan_id, (v_day->>'dayIndex')::integer, coalesce(v_day->'totals', '{}'::jsonb))
    returning id into v_day_id;

    v_meal_order := 1;
    for v_meal in select * from jsonb_array_elements(coalesce(v_day->'meals', '[]'::jsonb))
    loop
      insert into public.client_nutrition_plan_meals (
        plan_day_id, meal_order, meal_type, recipe_id, recipe_slug, name, image_url,
        portion_multiplier, calories, protein, carbs, fat, recipe_snapshot, foods_snapshot
      ) values (
        v_day_id, v_meal_order, v_meal->>'type', v_meal->>'recipeId', v_meal->>'recipeSlug',
        v_meal->>'name', nullif(v_meal->>'imageUrl', ''),
        (v_meal->>'portionMultiplier')::numeric,
        (v_meal->>'calories')::numeric, (v_meal->>'protein')::numeric,
        (v_meal->>'carbs')::numeric, (v_meal->>'fat')::numeric,
        coalesce(v_meal->'recipe', '{}'::jsonb), coalesce(v_meal->'foods', '[]'::jsonb)
      );
      v_meal_order := v_meal_order + 1;
    end loop;
  end loop;

  return v_plan_id;
end;
$$;

revoke all on function public.save_nutrition_plan(integer, text, integer, integer, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_nutrition_plan(integer, text, integer, integer, text, jsonb, jsonb) to authenticated;

-- Sostituisce UN pasto gia' generato con un'alternativa scelta dal cliente
-- (guida ufficiale YMove: /recipes/search con stesso mealType+diet, poi
-- /recipes/{id-or-slug} per macro/ingredienti/istruzioni complete) e
-- ricalcola i totali del solo giorno interessato — MAI rigenera l'intero
-- piano. p_new_meal ha la stessa forma di un elemento di data.days[].meals[].
create or replace function public.swap_nutrition_plan_meal(
  p_meal_id uuid,
  p_new_meal jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_plan_day_id uuid;
  v_new_totals jsonb;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  v_client_id := auth.uid();

  select d.id into v_plan_day_id
  from public.client_nutrition_plan_meals m
  join public.client_nutrition_plan_days d on d.id = m.plan_day_id
  join public.client_nutrition_plans p on p.id = d.plan_id
  where m.id = p_meal_id and p.client_id = v_client_id
  for update;

  if v_plan_day_id is null then
    raise exception 'FORBIDDEN: pasto non trovato o non appartenente al cliente corrente';
  end if;

  update public.client_nutrition_plan_meals
  set
    meal_type = coalesce(p_new_meal->>'type', meal_type),
    recipe_id = p_new_meal->>'recipeId',
    recipe_slug = p_new_meal->>'recipeSlug',
    name = p_new_meal->>'name',
    image_url = nullif(p_new_meal->>'imageUrl', ''),
    portion_multiplier = (p_new_meal->>'portionMultiplier')::numeric,
    calories = (p_new_meal->>'calories')::numeric,
    protein = (p_new_meal->>'protein')::numeric,
    carbs = (p_new_meal->>'carbs')::numeric,
    fat = (p_new_meal->>'fat')::numeric,
    recipe_snapshot = coalesce(p_new_meal->'recipe', '{}'::jsonb),
    foods_snapshot = coalesce(p_new_meal->'foods', '[]'::jsonb),
    swapped_at = now()
  where id = p_meal_id;

  select jsonb_build_object(
    'calories', coalesce(sum(calories), 0),
    'protein', coalesce(sum(protein), 0),
    'carbs', coalesce(sum(carbs), 0),
    'fat', coalesce(sum(fat), 0)
  ) into v_new_totals
  from public.client_nutrition_plan_meals
  where plan_day_id = v_plan_day_id;

  update public.client_nutrition_plan_days
  set totals = v_new_totals
  where id = v_plan_day_id;

  return v_new_totals;
end;
$$;

revoke all on function public.swap_nutrition_plan_meal(uuid, jsonb) from public, anon;
grant execute on function public.swap_nutrition_plan_meal(uuid, jsonb) to authenticated;

commit;
