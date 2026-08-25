create or replace function public.create_or_get_party(requested_format public.queue_format)
returns table(party_id uuid, invite_code text)
language plpgsql security definer set search_path = '' as $$
declare
  existing_party uuid;
  created_party public.parties%rowtype;
  member_count integer;
  capacity integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select pm.party_id into existing_party
  from public.party_members as pm
  where pm.user_id = auth.uid()
  limit 1;

  if existing_party is not null then
    capacity := case requested_format when '1v1' then 1 when '3v3' then 3 else 5 end;
    select count(*) into member_count
    from public.party_members as pm
    where pm.party_id = existing_party;

    if member_count > capacity then
      raise exception 'Remove pilots before changing to this format';
    end if;

    update public.parties as p
    set format = requested_format
    where p.id = existing_party and p.captain_id = auth.uid() and p.status = 'open';

    return query
      select p.id, p.invite_code
      from public.parties as p
      where p.id = existing_party;
    return;
  end if;

  insert into public.parties(captain_id, format)
  values(auth.uid(), requested_format)
  returning * into created_party;

  insert into public.party_members(party_id, user_id, ready)
  values(created_party.id, auth.uid(), true);

  return query select created_party.id, created_party.invite_code;
end;
$$;

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

  select p.* into target
  from public.parties as p
  where p.id = target_party
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
  select count(*) into member_count
  from public.party_members as pm
  where pm.party_id = target_party;

  if member_count <> capacity then
    raise exception 'The % queue requires exactly % pilot%', requested_format, capacity,
      case when capacity = 1 then '' else 's' end;
  end if;

  update public.queue_entries as qe
  set status = 'cancelled'
  where qe.party_id = target_party and qe.status = 'searching';

  update public.parties as p
  set format = requested_format, status = 'queued'
  where p.id = target_party;

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

  select p.* into target
  from public.parties as p
  where p.id = target_party
  for update;

  if target.id is null then return; end if;
  if target.captain_id <> auth.uid() then
    raise exception 'Only the party captain can cancel matchmaking';
  end if;
  if target.status = 'in_match' then
    raise exception 'Your party already has an active match';
  end if;

  update public.queue_entries as qe
  set status = 'cancelled'
  where qe.party_id = target_party and qe.status = 'searching';

  update public.parties as p
  set status = 'open'
  where p.id = target_party and p.status = 'queued';
end;
$$;

revoke execute on function public.create_or_get_party(public.queue_format) from public, anon;
revoke execute on function public.queue_current_party(uuid, public.queue_format, text) from public, anon;
revoke execute on function public.cancel_current_queue(uuid) from public, anon;
grant execute on function public.create_or_get_party(public.queue_format) to authenticated;
grant execute on function public.queue_current_party(uuid, public.queue_format, text) to authenticated;
grant execute on function public.cancel_current_queue(uuid) to authenticated;
