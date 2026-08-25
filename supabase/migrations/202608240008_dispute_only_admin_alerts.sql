alter table public.notifications add column if not exists kind text not null default 'general';
alter table public.notifications add column if not exists entity_id uuid;

create or replace function public.notify_staff_on_match_dispute()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  match_public_id text;
  opener_handle text;
begin
  select m.public_id into match_public_id
  from public.matches as m where m.id = new.match_id;

  select p.rsi_handle::text into opener_handle
  from public.profiles as p where p.user_id = new.opened_by;

  update public.matches as m
  set status = 'disputed', updated_at = now()
  where m.id = new.match_id;

  insert into public.notifications(user_id, title, body, kind, entity_id)
  select
    pr.user_id,
    'MATCH RESULT DISPUTED',
    coalesce(match_public_id, 'A ranked match') || ' was disputed by ' || coalesce(opener_handle, 'a verified player') || '.',
    'match_dispute',
    new.id
  from public.platform_roles as pr
  where pr.role in ('owner', 'admin', 'moderator');

  return new;
end;
$$;

drop trigger if exists notify_staff_on_match_dispute on public.match_disputes;
create trigger notify_staff_on_match_dispute
after insert on public.match_disputes
for each row execute function public.notify_staff_on_match_dispute();

create or replace function public.list_open_match_disputes()
returns table(
  dispute_id uuid,
  match_id uuid,
  public_id text,
  match_format text,
  star_citizen_match_id text,
  submitted_result jsonb,
  dispute_reason text,
  opened_by_handle text,
  player_handles text,
  disputed_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_staff() then raise exception 'Staff access required'; end if;

  return query
    select
      d.id,
      m.id,
      m.public_id,
      m.format::text,
      m.star_citizen_match_id,
      m.result,
      d.reason,
      opener.rsi_handle::text,
      string_agg(players.rsi_handle::text, ', ' order by mp.side, lower(players.rsi_handle::text)),
      d.created_at
    from public.match_disputes as d
    join public.matches as m on m.id = d.match_id
    join public.profiles as opener on opener.user_id = d.opened_by
    join public.match_players as mp on mp.match_id = m.id
    join public.profiles as players on players.user_id = mp.user_id
    where d.status = 'open'
    group by d.id, m.id, m.public_id, m.format, m.star_citizen_match_id, m.result, d.reason, opener.rsi_handle, d.created_at
    order by d.created_at asc;
end;
$$;

create or replace function public.review_match_dispute(target_dispute uuid, decision text, submitted_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.match_disputes%rowtype;
  target_public_id text;
  clean_note text := trim(coalesce(submitted_note, ''));
begin
  if not public.is_platform_staff() then raise exception 'Staff access required'; end if;
  if decision not in ('approve_result', 'void_match') then raise exception 'Invalid dispute decision'; end if;
  if char_length(clean_note) > 500 then raise exception 'Review notes cannot exceed 500 characters'; end if;

  select d.* into target from public.match_disputes as d where d.id = target_dispute for update;
  if target.id is null then raise exception 'Dispute not found'; end if;
  if target.status <> 'open' then raise exception 'This dispute has already been reviewed'; end if;

  select m.public_id into target_public_id from public.matches as m where m.id = target.match_id;

  update public.match_disputes as d
  set status = case when decision = 'approve_result' then 'rejected' else 'resolved' end,
      resolved_at = now()
  where d.match_id = target.match_id and d.status = 'open';

  update public.matches as m
  set status = case when decision = 'approve_result' then 'approved'::public.match_status else 'cancelled'::public.match_status end,
      updated_at = now()
  where m.id = target.match_id;

  insert into public.notifications(user_id, title, body, kind, entity_id)
  select
    mp.user_id,
    'DISPUTE RESOLVED',
    coalesce(target_public_id, 'Your match') || case when decision = 'approve_result'
      then ': the submitted result was approved.' else ': the result was voided by staff.' end,
    'match_dispute_resolved',
    target.id
  from public.match_players as mp where mp.match_id = target.match_id;

  insert into public.admin_audit_log(actor_id, action, details)
  values(auth.uid(), 'match_dispute_' || decision, jsonb_build_object(
    'dispute_id', target.id,
    'match_id', target.match_id,
    'note', clean_note
  ));
end;
$$;

revoke execute on function public.list_open_match_disputes(), public.review_match_dispute(uuid, text, text) from public, anon;
grant execute on function public.list_open_match_disputes(), public.review_match_dispute(uuid, text, text) to authenticated;

revoke execute on function public.notify_staff_on_match_dispute() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
