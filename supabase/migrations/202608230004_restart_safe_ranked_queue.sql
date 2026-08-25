create or replace function public.queue_current_party(
  target_party uuid,
  requested_format public.queue_format,
  requested_region text default 'US East'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target public.parties%rowtype;
  entry_id uuid;
  member_count integer;
  capacity integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in before entering ranked matchmaking';
  end if;

  select * into target
  from public.parties
  where id = target_party
  for update;

  if target.id is null then
    raise exception 'This party no longer exists. Reopen the party panel to create a new one';
  end if;
  if target.captain_id <> auth.uid() then
    raise exception 'Only the party captain can start matchmaking';
  end if;
  if target.status = 'in_match' then
    raise exception 'Your party already has an active match';
  end if;
  if target.status = 'closed' then
    raise exception 'This party is closed. Create a new party before matchmaking';
  end if;

  capacity := case requested_format when '1v1' then 1 when '3v3' then 3 else 5 end;
  select count(*) into member_count from public.party_members where party_id = target_party;
  if member_count <> capacity then
    raise exception 'The % queue requires exactly % pilot%', requested_format, capacity,
      case when capacity = 1 then '' else 's' end;
  end if;

  -- Replacing an existing search makes this operation safe after an app restart
  -- and prevents duplicate active-queue rows for the same party.
  update public.queue_entries
  set status = 'cancelled'
  where party_id = target_party and status = 'searching';

  update public.parties
  set format = requested_format, status = 'queued'
  where id = target_party;

  insert into public.queue_entries(party_id, format, region)
  values(target_party, requested_format, coalesce(nullif(trim(requested_region), ''), 'US East'))
  returning id into entry_id;

  return entry_id;
end;
$$;

create or replace function public.cancel_current_queue(target_party uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.parties%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in before changing matchmaking';
  end if;

  select * into target
  from public.parties
  where id = target_party
  for update;

  if target.id is null then return; end if;
  if target.captain_id <> auth.uid() then
    raise exception 'Only the party captain can cancel matchmaking';
  end if;
  if target.status = 'in_match' then
    raise exception 'Your party already has an active match';
  end if;

  update public.queue_entries
  set status = 'cancelled'
  where party_id = target_party and status = 'searching';

  update public.parties
  set status = 'open'
  where id = target_party and status = 'queued';
end;
$$;

revoke execute on function public.queue_current_party(uuid, public.queue_format, text) from public, anon;
revoke execute on function public.cancel_current_queue(uuid) from public, anon;
grant execute on function public.queue_current_party(uuid, public.queue_format, text) to authenticated;
grant execute on function public.cancel_current_queue(uuid) to authenticated;
