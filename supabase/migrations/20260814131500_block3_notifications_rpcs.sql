-- feat: Blocco 3 — RPC del centro notifiche (cliente e superadmin
-- condividono lo stesso set: entrambi leggono solo le PROPRIE notifiche
-- via recipient_id = auth.uid(), gia' garantito da RLS dal 2.1 — un
-- superadmin riceve solo righe con recipient_role='superadmin' indirizzate
-- al proprio id, quindi "le proprie" e "quelle amministrative" coincidono
-- per costruzione, nessuna RPC separata necessaria).
--
-- Payload di navigazione: la colonna `data` (jsonb) di ogni notifica
-- contiene solo id (cycle_id/client_id/checkin_id/...) usati dal client
-- mobile per navigare alla schermata pertinente — MAI validati qui come
-- "autorizzazione": la vera verifica di autorizzazione avviene alla
-- destinazione (es. superadmin_get_client_program_history verifica di
-- nuovo is_superadmin() indipendentemente da come il chiamante e' arrivato
-- a quell'id). Le notifiche sono solo un suggerimento di navigazione, mai
-- una fonte di autorizzazione.
--
-- Irrigidimento RLS: la policy UPDATE preesistente
-- (app_notifications_recipient_mark_read) permetteva a un client REST di
-- scrivere QUALUNQUE colonna della propria notifica (non solo read_at) —
-- titolo/corpo/tipo/payload inclusi. Sostituita: nessun UPDATE diretto per
-- authenticated, tutte le scritture passano da mark_notification_read/
-- mark_all_notifications_read (SECURITY DEFINER, aggiornano solo read_at).

drop policy if exists app_notifications_recipient_mark_read on public.app_notifications;

create or replace function public.list_my_notifications(
  p_limit integer default 50,
  p_before timestamptz default null
)
returns setof public.app_notifications
language sql
stable
security definer
set search_path to 'public'
as $$
  select *
  from public.app_notifications
  where recipient_id = auth.uid()
    and (p_before is null or created_at < p_before)
  order by created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.count_my_unread_notifications()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)::integer
  from public.app_notifications
  where recipient_id = auth.uid() and read_at is null;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns public.app_notifications
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result public.app_notifications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.app_notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id and recipient_id = auth.uid()
  returning * into v_result;

  if not found then
    raise exception 'FORBIDDEN_OR_NOT_FOUND: notifica non trovata o non appartenente al chiamante';
  end if;

  return v_result;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.app_notifications
  set read_at = now()
  where recipient_id = auth.uid() and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.list_my_notifications(integer, timestamptz) to authenticated;
grant execute on function public.count_my_unread_notifications() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

revoke all on function public.list_my_notifications(integer, timestamptz) from public, anon;
revoke all on function public.count_my_unread_notifications() from public, anon;
revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;

notify pgrst, 'reload schema';
