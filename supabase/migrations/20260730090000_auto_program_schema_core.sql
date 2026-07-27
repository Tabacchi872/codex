-- feat: schema completo per il sistema "programmi automatici" (clienti senza coach).
--
-- Contesto: un cliente registrato SENZA coach (client_onboarding.client_mode
-- = 'self_guided', gia' esistente) deve poter completare un questionario
-- fitness dedicato, ricevere una prima scheda assegnata automaticamente da
-- un motore di selezione, accumulare progressi per 4 settimane e ricevere poi
-- una revisione automatica (progredisci/mantieni/riduci/blocca per dolore).
-- Questa migration crea l'INTERO schema necessario a tutto il sistema (anche
-- le tabelle che verranno popolate solo nei blocchi successivi: questionario
-- mensile, esito revisione, notifiche), per evitare ALTER dolorosi piu'
-- avanti — ma questo blocco implementa via RPC/UI SOLO questionario iniziale
-- + prima assegnazione automatica.
--
-- GARANZIE non negoziabili verificate riga per riga sullo schema esistente
-- prima di scrivere questa migration:
--   - Nessuna scheda creata da un coach viene mai letta/scritta da questa
--     migration: tutte le nuove RPC (migration successiva) verificano sempre
--     client_has_no_active_coach() prima di agire.
--   - I tre trigger di immutabilita' post-completamento
--     (prevent_completed_workout_plan_edit/_day_write/_day_exercise_write,
--     20260727090000/20260728090000) leggono solo session_status e
--     workout_plan_id/workout_day_id: NON dipendono da coach_id, quindi
--     renderlo nullable non li rompe.
--   - workout_plans_coach_scope ("coach_id = auth.uid()") non fa mai match
--     quando coach_id e' null (NULL = uuid e' sempre NULL, mai true in SQL):
--     nessuna esposizione accidentale di un piano automatico a un coach.
--   - Le RLS di lettura cliente ESISTENTI (workout_plans_client_read,
--     workout_days_client_read, workout_day_exercises_client_read, aggiornate
--     l'ultima volta in 20260718195148_add_client_suspension_and_removal.sql)
--     richiedono pero' un JOIN a coach_clients con coach_id = workout_plans.
--     coach_id: con coach_id NULL quell'EXISTS non trova mai nulla, quindi il
--     cliente non potrebbe leggere le proprie schede automatiche. Questa
--     migration AGGIUNGE un ramo esplicito "coach_id is null and client_id =
--     auth.uid()" a tutte e tre le policy (nessuna rimozione del ramo
--     esistente, il flusso coach_guided resta identico).

-- ============================================================================
-- 1) client_fitness_profile — questionario fitness iniziale (self_guided)
-- ============================================================================
-- Struttura SEPARATA da client_onboarding (che resta invariata: e' condivisa
-- anche dal percorso coach_guided e ha una macchina di immutabilita' propria
-- che non va toccata per un requisito che riguarda solo i clienti senza
-- coach). requires_professional_supervision e' SEMPRE una risposta esplicita
-- e diretta del questionario (mai un'euristica dedotta da pain_notes testo
-- libero) — e' l'unico segnale che la RPC di assegnazione userà per decidere
-- se bloccare l'assegnazione automatica.
create table if not exists public.client_fitness_profile (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.profiles(id) on delete cascade,
  age integer check (age is null or age between 14 and 100),
  location text check (location is null or location in ('gym', 'home')),
  equipment_level text check (equipment_level is null or equipment_level in ('bodyweight_only', 'home_basic', 'full_gym')),
  session_duration_minutes integer check (session_duration_minutes is null or session_duration_minutes between 15 and 120),
  preferred_training_style text check (preferred_training_style is null or preferred_training_style in ('full_body', 'upper_lower', 'split', 'hybrid', 'no_preference')),
  has_pain_or_limitation boolean not null default false,
  pain_areas text[] not null default '{}'::text[],
  pain_notes text,
  requires_professional_supervision boolean not null default false,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    completed = false
    or (
      age is not null
      and location is not null
      and session_duration_minutes is not null
      and preferred_training_style is not null
    )
  )
);
create index if not exists client_fitness_profile_completed_idx on public.client_fitness_profile(completed);

drop trigger if exists client_fitness_profile_set_updated_at on public.client_fitness_profile;
create trigger client_fitness_profile_set_updated_at before update on public.client_fitness_profile
for each row execute function public.set_updated_at();

-- Immutabilita' minima (non tutta la macchina di client_onboarding): il
-- cliente puo' aggiornare le proprie risposte anche dopo il completamento
-- (il motore di rinnovo di un blocco successivo legge lo stato corrente),
-- ma completed non puo' mai tornare false e client_id non e' mai cambiabile.
-- Lo snapshot congelato per-ciclo vive in
-- client_program_cycles.fitness_profile_snapshot (vedi sotto), non qui.
create or replace function public.prevent_client_fitness_profile_unsafe_changes()
returns trigger
language plpgsql
as $$
begin
  if new.client_id <> old.client_id then
    raise exception 'CLIENT_FITNESS_PROFILE_CLIENT_IMMUTABLE';
  end if;
  if old.completed = true and new.completed = false then
    raise exception 'CLIENT_FITNESS_PROFILE_COMPLETION_IRREVERSIBLE';
  end if;
  return new;
end;
$$;

drop trigger if exists client_fitness_profile_prevent_unsafe_changes on public.client_fitness_profile;
create trigger client_fitness_profile_prevent_unsafe_changes before update on public.client_fitness_profile
for each row execute function public.prevent_client_fitness_profile_unsafe_changes();

alter table public.client_fitness_profile enable row level security;

drop policy if exists client_fitness_profile_superadmin_all on public.client_fitness_profile;
create policy client_fitness_profile_superadmin_all on public.client_fitness_profile
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists client_fitness_profile_owner_all on public.client_fitness_profile;
create policy client_fitness_profile_owner_all on public.client_fitness_profile
  for all using (
    client_id = auth.uid()
    and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'cliente')
  )
  with check (
    client_id = auth.uid()
    and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'cliente')
  );

-- ============================================================================
-- 2) client_excluded_exercises — running-list esercizi esclusi/non graditi
-- ============================================================================
create table if not exists public.client_excluded_exercises (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text not null,
  reason text not null check (reason in ('dislike', 'pain', 'injury', 'other')),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, exercise_id)
);
create index if not exists client_excluded_exercises_client_active_idx on public.client_excluded_exercises(client_id) where active;

drop trigger if exists client_excluded_exercises_set_updated_at on public.client_excluded_exercises;
create trigger client_excluded_exercises_set_updated_at before update on public.client_excluded_exercises
for each row execute function public.set_updated_at();

alter table public.client_excluded_exercises enable row level security;

drop policy if exists client_excluded_exercises_superadmin_all on public.client_excluded_exercises;
create policy client_excluded_exercises_superadmin_all on public.client_excluded_exercises
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists client_excluded_exercises_owner_all on public.client_excluded_exercises;
create policy client_excluded_exercises_owner_all on public.client_excluded_exercises
  for all using (client_id = auth.uid()) with check (client_id = auth.uid());

-- ============================================================================
-- 3) client_program_cycles — wrapper "ciclo" (bozza/attiva/completata/
-- sostituita/sospesa), MAI dentro workout_plans
-- ============================================================================
create table if not exists public.client_program_cycles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('draft', 'active', 'completed', 'superseded', 'suspended', 'pending_review')),
  cycle_number integer not null check (cycle_number > 0),
  previous_cycle_id uuid references public.client_program_cycles(id) on delete set null,
  source text not null check (source in ('auto_initial', 'auto_renewal', 'auto_progression', 'auto_regression', 'auto_maintain', 'auto_block_pain', 'superadmin_override')),
  decision_reason text,
  template_id uuid references public.workout_templates(id) on delete set null,
  fitness_profile_snapshot jsonb not null default '{}'::jsonb,
  matching_score numeric,
  started_at date not null default current_date,
  review_due_at date,
  suspended_at timestamptz,
  suspended_reason text,
  superseded_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mai due cicli "in corso" per lo stesso cliente — stesso meccanismo gia'
-- usato da coach_clients_one_current_per_client_idx per "un solo coach
-- corrente per cliente".
create unique index if not exists client_program_cycles_one_current_per_client_idx
  on public.client_program_cycles(client_id)
  where status in ('draft', 'active', 'pending_review');
create index if not exists client_program_cycles_client_idx on public.client_program_cycles(client_id);
create index if not exists client_program_cycles_previous_idx on public.client_program_cycles(previous_cycle_id);

drop trigger if exists client_program_cycles_set_updated_at on public.client_program_cycles;
create trigger client_program_cycles_set_updated_at before update on public.client_program_cycles
for each row execute function public.set_updated_at();

alter table public.client_program_cycles enable row level security;

drop policy if exists client_program_cycles_superadmin_all on public.client_program_cycles;
create policy client_program_cycles_superadmin_all on public.client_program_cycles
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Nessun insert/update/delete diretto per il cliente: solo lettura. Tutte le
-- scritture passano da RPC security definer (migration successiva).
drop policy if exists client_program_cycles_owner_read on public.client_program_cycles;
create policy client_program_cycles_owner_read on public.client_program_cycles
  for select using (client_id = auth.uid());

-- ============================================================================
-- 4) client_program_cycle_plans — join ciclo <-> workout_plans reali generati
-- ============================================================================
create table if not exists public.client_program_cycle_plans (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.client_program_cycles(id) on delete cascade,
  workout_plan_id uuid not null references public.workout_plans(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (cycle_id, workout_plan_id)
);
create index if not exists client_program_cycle_plans_cycle_idx on public.client_program_cycle_plans(cycle_id);
create index if not exists client_program_cycle_plans_plan_idx on public.client_program_cycle_plans(workout_plan_id);

alter table public.client_program_cycle_plans enable row level security;

drop policy if exists client_program_cycle_plans_superadmin_all on public.client_program_cycle_plans;
create policy client_program_cycle_plans_superadmin_all on public.client_program_cycle_plans
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists client_program_cycle_plans_owner_read on public.client_program_cycle_plans;
create policy client_program_cycle_plans_owner_read on public.client_program_cycle_plans
  for select using (
    exists (
      select 1 from public.client_program_cycles
      where client_program_cycles.id = client_program_cycle_plans.cycle_id
        and client_program_cycles.client_id = auth.uid()
    )
  );

-- ============================================================================
-- 5) client_monthly_checkins — questionario mensile (schema pronto, Blocco 2)
-- ============================================================================
create table if not exists public.client_monthly_checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  cycle_id uuid not null unique references public.client_program_cycles(id) on delete cascade,
  perceived_difficulty text check (perceived_difficulty is null or perceived_difficulty in ('too_easy', 'right', 'too_hard')),
  sessions_completed_estimate integer check (sessions_completed_estimate is null or sessions_completed_estimate >= 0),
  has_pain_or_limitation boolean not null default false,
  pain_areas text[] not null default '{}'::text[],
  pain_notes text,
  requires_professional_supervision boolean not null default false,
  wants_to_continue boolean not null default true,
  available_minutes integer,
  goal_changed_to text,
  variety_preference text check (variety_preference is null or variety_preference in ('keep_structure', 'more_variety')),
  liked_exercise_ids text[] not null default '{}'::text[],
  disliked_exercise_ids text[] not null default '{}'::text[],
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_monthly_checkins_client_idx on public.client_monthly_checkins(client_id);

drop trigger if exists client_monthly_checkins_set_updated_at on public.client_monthly_checkins;
create trigger client_monthly_checkins_set_updated_at before update on public.client_monthly_checkins
for each row execute function public.set_updated_at();

alter table public.client_monthly_checkins enable row level security;

drop policy if exists client_monthly_checkins_superadmin_all on public.client_monthly_checkins;
create policy client_monthly_checkins_superadmin_all on public.client_monthly_checkins
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists client_monthly_checkins_owner_all on public.client_monthly_checkins;
create policy client_monthly_checkins_owner_all on public.client_monthly_checkins
  for all using (client_id = auth.uid()) with check (client_id = auth.uid());

-- ============================================================================
-- 6) client_cycle_reviews — esito revisione automatica (schema pronto, Blocco 2)
-- ============================================================================
create table if not exists public.client_cycle_reviews (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null unique references public.client_program_cycles(id) on delete cascade,
  checkin_id uuid references public.client_monthly_checkins(id) on delete set null,
  decision text not null check (decision in ('progress', 'maintain', 'reduce', 'block_pain', 'superadmin_required')),
  decision_reason text,
  metrics_snapshot jsonb not null default '{}'::jsonb,
  next_cycle_id uuid references public.client_program_cycles(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.client_cycle_reviews enable row level security;

drop policy if exists client_cycle_reviews_superadmin_all on public.client_cycle_reviews;
create policy client_cycle_reviews_superadmin_all on public.client_cycle_reviews
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists client_cycle_reviews_owner_read on public.client_cycle_reviews;
create policy client_cycle_reviews_owner_read on public.client_cycle_reviews
  for select using (
    exists (
      select 1 from public.client_program_cycles
      where client_program_cycles.id = client_cycle_reviews.cycle_id
        and client_program_cycles.client_id = auth.uid()
    )
  );

-- ============================================================================
-- 7) app_notifications — centro notifiche in-app multi-ruolo
-- ============================================================================
-- Nuova tabella pulita: admin_notifications (esistente) non ha recipient_id
-- per-utente e non e' referenziata da alcun file mobile (verificato via
-- grep) — non riusata, scopo diverso.
create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('cliente', 'coach', 'superadmin')),
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists app_notifications_recipient_unread_idx on public.app_notifications(recipient_id) where read_at is null;
create index if not exists app_notifications_recipient_created_idx on public.app_notifications(recipient_id, created_at desc);

alter table public.app_notifications enable row level security;

drop policy if exists app_notifications_superadmin_all on public.app_notifications;
create policy app_notifications_superadmin_all on public.app_notifications
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists app_notifications_recipient_read on public.app_notifications;
create policy app_notifications_recipient_read on public.app_notifications
  for select using (recipient_id = auth.uid());

-- Solo l'aggiornamento di read_at e' concesso al destinatario (mai altri
-- campi, mai insert diretto: le notifiche vengono create solo da RPC
-- security definer).
drop policy if exists app_notifications_recipient_mark_read on public.app_notifications;
create policy app_notifications_recipient_mark_read on public.app_notifications
  for update using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ============================================================================
-- 8) superadmin_program_overrides — log/audit interno (mai letto da cliente/coach)
-- ============================================================================
create table if not exists public.superadmin_program_overrides (
  id uuid primary key default gen_random_uuid(),
  superadmin_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  cycle_id uuid references public.client_program_cycles(id) on delete set null,
  action text not null check (action in ('manual_assign', 'force_progress', 'force_maintain', 'force_reduce', 'unblock_pain', 'suspend_cycle', 'resume_cycle', 'disable_template')),
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.superadmin_program_overrides enable row level security;

drop policy if exists superadmin_program_overrides_superadmin_all on public.superadmin_program_overrides;
create policy superadmin_program_overrides_superadmin_all on public.superadmin_program_overrides
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- ============================================================================
-- 9) workout_templates — idoneita' al motore automatico + regole (JSONB)
-- ============================================================================
-- is_active = disponibilita' generale del template; auto_eligible = idoneita'
-- specifica per il motore automatico (concetti distinti: un template puo'
-- restare attivo per i coach senza essere ancora validato per l'assegnazione
-- automatica). auto_assignment_rules/auto_progression_rules restano jsonb
-- nullable non lette da alcuna RPC in questo blocco (pronte per il Blocco 2).
alter table public.workout_templates add column if not exists is_active boolean not null default true;
alter table public.workout_templates add column if not exists auto_eligible boolean not null default false;
alter table public.workout_templates add column if not exists auto_assignment_rules jsonb;
alter table public.workout_templates add column if not exists auto_progression_rules jsonb;
alter table public.workout_templates add column if not exists next_template_id uuid references public.workout_templates(id) on delete set null;

create index if not exists workout_templates_auto_eligible_idx on public.workout_templates(auto_eligible) where auto_eligible and is_active;

-- Rende i 18 template di sistema gia' esistenti idonei al motore automatico
-- fin da subito: senza questo, il sistema automatico non sarebbe testabile
-- end-to-end finche' un pannello superadmin (Blocco successivo) non li
-- abilita manualmente uno per uno.
update public.workout_templates
set auto_eligible = true
where is_system = true;

-- ============================================================================
-- 10) workout_plans — coach_id nullable + origine (schede automatiche)
-- ============================================================================
-- Stesso precedente gia' applicato a workout_templates.coach_id (migration
-- 20260723090000): reso nullable SOLO per un caso specifico e vincolato da un
-- CHECK esplicito, mai un nullable "libero".
alter table public.workout_plans alter column coach_id drop not null;

alter table public.workout_plans add column if not exists origin text not null default 'coach' check (origin in ('coach', 'auto_system', 'superadmin_override'));

alter table public.workout_plans drop constraint if exists workout_plans_origin_coach_consistency_check;
alter table public.workout_plans add constraint workout_plans_origin_coach_consistency_check
  check ((origin = 'coach' and coach_id is not null) or (origin in ('auto_system', 'superadmin_override') and coach_id is null));

create index if not exists workout_plans_origin_idx on public.workout_plans(origin);

-- Le RLS di lettura cliente esistenti richiedono un JOIN a coach_clients
-- (coach_id = workout_plans.coach_id, status='active'): con coach_id NULL
-- quell'EXISTS non trova mai nulla. Aggiungiamo un ramo esplicito, senza
-- toccare il ramo esistente (flusso coach_guided identico a prima).
drop policy if exists workout_plans_client_read on public.workout_plans;
create policy workout_plans_client_read on public.workout_plans
  for select using (
    client_id = auth.uid()
    and (
      (coach_id is null)
      or exists (
        select 1 from public.coach_clients
        where coach_clients.coach_id = workout_plans.coach_id
          and coach_clients.client_id = auth.uid()
          and coach_clients.status = 'active'
      )
    )
  );

drop policy if exists workout_days_client_read on public.workout_days;
create policy workout_days_client_read on public.workout_days
  for select using (
    exists (
      select 1
      from public.workout_plans
      where workout_plans.id = workout_days.workout_plan_id
        and workout_plans.client_id = auth.uid()
        and (
          (workout_plans.coach_id is null)
          or exists (
            select 1 from public.coach_clients
            where coach_clients.coach_id = workout_plans.coach_id
              and coach_clients.client_id = auth.uid()
              and coach_clients.status = 'active'
          )
        )
    )
  );

drop policy if exists workout_day_exercises_client_read on public.workout_day_exercises;
create policy workout_day_exercises_client_read on public.workout_day_exercises
  for select using (
    exists (
      select 1
      from public.workout_days
      join public.workout_plans on workout_plans.id = workout_days.workout_plan_id
      where workout_days.id = workout_day_exercises.workout_day_id
        and workout_plans.client_id = auth.uid()
        and (
          (workout_plans.coach_id is null)
          or exists (
            select 1 from public.coach_clients
            where coach_clients.coach_id = workout_plans.coach_id
              and coach_clients.client_id = auth.uid()
              and coach_clients.status = 'active'
          )
        )
    )
  );

-- ============================================================================
-- 11) exercise_progress_history — schema-prep (coach_id nullable + dolore)
-- ============================================================================
-- Schema-only in questo blocco: nessuna RPC/UI di logging per clienti senza
-- coach viene costruita ora (arriva nel Blocco successivo insieme al
-- questionario mensile). Fatto ORA per evitare un ALTER doloroso quando la
-- tabella avra' gia' righe reali. Le RLS esistenti (coach_id = auth.uid())
-- restano valide cosi' come sono: nessuna riga esistente ha oggi coach_id
-- null, e nessun percorso applicativo scrive coach_id null finche' non verra'
-- costruito il logger per clienti automatici (RLS da estendere in quel
-- momento, non ora).
alter table public.exercise_progress_history alter column coach_id drop not null;
alter table public.exercise_progress_history add column if not exists has_pain boolean not null default false;
alter table public.exercise_progress_history add column if not exists pain_notes text;

-- ============================================================================
-- 12) Predicato "cliente senza coach attivo" — esatto, distinto da is_coach_for_client
-- ============================================================================
-- is_coach_for_client() risponde a "sono IO il coach di questo cliente" (solo
-- status='active', pensata per il coach chiamante). Qui serve il predicato
-- opposto e assoluto: "questo cliente non ha alcun coach corrente", usando
-- lo stesso set di stati ('active','suspended') dell'indice unico
-- coach_clients_one_current_per_client_idx — un cliente 'suspended' ha
-- comunque un coach corrente (sospeso, non rimosso) e non deve rientrare nel
-- sistema automatico.
create or replace function public.client_has_no_active_coach(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.coach_clients
    where coach_clients.client_id = p_client_id
      and coach_clients.status in ('active', 'suspended')
  );
$$;

revoke all on function public.client_has_no_active_coach(uuid) from public, anon;
grant execute on function public.client_has_no_active_coach(uuid) to authenticated;

notify pgrst, 'reload schema';
