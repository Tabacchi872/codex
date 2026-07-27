-- fix: permette la cancellazione (via eliminazione account) di schede
-- allenamento completate, senza indebolire l'immutabilita' verso coach/
-- client/PostgREST diretto. Vedi docs/BUGS.md BUG-054.
--
-- CAUSA CONFERMATA: prevent_completed_workout_plan_edit (20260727090000,
-- esteso a DELETE in 20260728090000) e i due trigger analoghi su
-- workout_days/workout_day_exercises (20260728090000) bloccano QUALUNQUE
-- UPDATE/DELETE su una riga con session_status='completed' (o il cui piano
-- genitore lo e'), senza eccezioni. Questo era intenzionale per coach/
-- client/superadmin via API (vedi commenti originali: "nessuna eccezione
-- per il coach"), ma ha un effetto collaterale non previsto: quando
-- l'Auth Admin API elimina un utente (supabase.auth.admin.deleteUser, usata
-- da supabase/functions/delete-account), Postgres cancella a cascata
-- auth.users -> public.profiles (on delete cascade) -> public.workout_plans
-- (coach_id/client_id on delete cascade) -> workout_days -> workout_day_
-- exercises. Se anche una sola riga workout_plans dell'utente ha
-- session_status='completed', il trigger BEFORE DELETE la blocca e l'intera
-- transazione di eliminazione utente fallisce, con il messaggio generico
-- "{}" gia' investigato in precedenza (causa reale, non solo l'errore
-- transitorio corretto in quel task: qui l'errore e' deterministico e si
-- ripete identico ad ogni tentativo).
--
-- PERCHE' NON auth.role() = 'service_role' (pattern gia' usato altrove, es.
-- prevent_client_onboarding_unsafe_changes): quel controllo legge
-- current_setting('request.jwt.claims', true)->>'role', valorizzato solo
-- quando la richiesta passa da PostgREST con un JWT (incluso un JWT
-- service_role, es. una chiamata Edge Function -> supabase-js .from()/.rpc()
-- con la service role key). L'eliminazione utente via Auth Admin API NON
-- passa da PostgREST: GoTrue si connette a Postgres direttamente con il
-- proprio ruolo dedicato 'supabase_auth_admin' (proprietario dello schema
-- auth, verificato in questo progetto: select rolname from pg_roles where
-- rolname in (...) -> presente) ed esegue li' la cascata DELETE. In quel
-- contesto request.jwt.claims non e' impostato, quindi auth.role() sarebbe
-- NULL e la condizione service_role non scatterebbe mai: il bypass corretto
-- deve verificare current_user/session_user = 'supabase_auth_admin', non
-- auth.role(). Verificato empiricamente end-to-end con account sintetici
-- (creazione, scheda completed, deleteUser fallito PRIMA di questa
-- migration con lo stesso errore "{}", riuscito DOPO) prima di committare.
--
-- SCOPE VOLUTAMENTE MINIMO: il bypass si applica SOLO al ramo DELETE (mai a
-- UPDATE/INSERT) e SOLO quando l'esecutore e' 'supabase_auth_admin'. Nessuna
-- eccezione aggiunta per service_role o superadmin generico: l'intento
-- originale "una scheda completed e' interamente read-only per coach/
-- client/superadmin via API" resta invariato. L'unica scrittura ora permessa
-- e' la cancellazione dell'intera riga come effetto collaterale della
-- cancellazione dell'account proprietario, mai una modifica dei suoi dati.

create or replace function public.prevent_completed_workout_plan_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and (current_user = 'supabase_auth_admin' or session_user = 'supabase_auth_admin') then
    return old;
  end if;

  if old.session_status = 'completed' then
    raise exception 'WORKOUT_LOCKED: questo workout e'' gia'' completato e non puo'' essere modificato';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_completed_workout_plan_edit() from public, anon, authenticated;

create or replace function public.prevent_completed_workout_day_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' and (current_user = 'supabase_auth_admin' or session_user = 'supabase_auth_admin') then
    return old;
  end if;

  select session_status into v_status
  from public.workout_plans
  where id = coalesce(new.workout_plan_id, old.workout_plan_id);

  if v_status = 'completed' then
    raise exception 'WORKOUT_LOCKED: questo workout e'' gia'' completato e non puo'' essere modificato';
  end if;

  if tg_op = 'UPDATE' and old.workout_plan_id is distinct from new.workout_plan_id then
    select session_status into v_status
    from public.workout_plans
    where id = old.workout_plan_id;
    if v_status = 'completed' then
      raise exception 'WORKOUT_LOCKED: questo workout e'' gia'' completato e non puo'' essere modificato';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_completed_workout_day_write() from public, anon, authenticated;

create or replace function public.prevent_completed_workout_day_exercise_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' and (current_user = 'supabase_auth_admin' or session_user = 'supabase_auth_admin') then
    return old;
  end if;

  select workout_plans.session_status into v_status
  from public.workout_days
  join public.workout_plans on workout_plans.id = workout_days.workout_plan_id
  where workout_days.id = coalesce(new.workout_day_id, old.workout_day_id);

  if v_status = 'completed' then
    raise exception 'WORKOUT_LOCKED: questo workout e'' gia'' completato e non puo'' essere modificato';
  end if;

  if tg_op = 'UPDATE' and old.workout_day_id is distinct from new.workout_day_id then
    select workout_plans.session_status into v_status
    from public.workout_days
    join public.workout_plans on workout_plans.id = workout_days.workout_plan_id
    where workout_days.id = old.workout_day_id;
    if v_status = 'completed' then
      raise exception 'WORKOUT_LOCKED: questo workout e'' gia'' completato e non puo'' essere modificato';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_completed_workout_day_exercise_write() from public, anon, authenticated;

notify pgrst, 'reload schema';
