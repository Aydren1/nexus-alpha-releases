do $$ begin
  create type public.matchmaking_mode as enum ('ranked', 'unranked');
exception when duplicate_object then null;
end $$;

alter table public.queue_entries
  add column if not exists mode public.matchmaking_mode not null default 'ranked';

alter table public.matches
  add column if not exists mode public.matchmaking_mode not null default 'ranked';

create index if not exists queue_search_pool
  on public.queue_entries(mode, format, region, joined_at)
  where status = 'searching';

create or replace function public.queue_current_party_v2(
  target_party uuid,
  requested_format public.queue_format,
  requested_mode public.matchmaking_mode default 'ranked',
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
    raise exception 'Sign in before entering matchmaking';
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
    raise exception 'The % % queue requires exactly % pilot%', requested_mode, requested_format, capacity,
      case when capacity = 1 then '' else 's' end;
  end if;

  update public.queue_entries as qe
  set status = 'cancelled'
  where qe.party_id = target_party and qe.status = 'searching';

  update public.parties as p
  set format = requested_format, status = 'queued'
  where p.id = target_party;

  insert into public.queue_entries(party_id, format, mode, region)
  values(target_party, requested_format, requested_mode, coalesce(nullif(trim(requested_region), ''), 'US East'))
  returning id into entry_id;

  return entry_id;
end;
$$;

revoke execute on function public.queue_current_party_v2(uuid, public.queue_format, public.matchmaking_mode, text) from public, anon;
grant execute on function public.queue_current_party_v2(uuid, public.queue_format, public.matchmaking_mode, text) to authenticated;

create or replace function public.run_small_matchmaker()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  first_entry public.queue_entries%rowtype;
  second_entry public.queue_entries%rowtype;
  created_match uuid;
  first_size integer;
  matched_count integer := 0;
begin
  for first_entry in
    select * from public.queue_entries where status = 'searching' order by joined_at for update skip locked
  loop
    if first_entry.status <> 'searching' then continue; end if;
    first_size := case when first_entry.party_id is null then 1 else (select count(*) from public.party_members where party_id = first_entry.party_id) end;
    second_entry.id := null;
    select * into second_entry from public.queue_entries candidate
    where candidate.status = 'searching' and candidate.id <> first_entry.id
      and candidate.mode = first_entry.mode
      and candidate.format = first_entry.format and candidate.region = first_entry.region
      and (case when candidate.party_id is null then 1 else (select count(*) from public.party_members where party_id = candidate.party_id) end) = first_size
    order by candidate.joined_at limit 1 for update skip locked;
    if second_entry.id is null then continue; end if;

    insert into public.matches(format, mode, status)
    values(first_entry.format, first_entry.mode, 'scheduled') returning id into created_match;
    if first_entry.party_id is not null then
      insert into public.match_players(match_id, user_id, side) select created_match, user_id, 1 from public.party_members where party_id = first_entry.party_id;
    else
      insert into public.match_players(match_id, user_id, side) values(created_match, first_entry.user_id, 1);
    end if;
    if second_entry.party_id is not null then
      insert into public.match_players(match_id, user_id, side) select created_match, user_id, 2 from public.party_members where party_id = second_entry.party_id;
    else
      insert into public.match_players(match_id, user_id, side) values(created_match, second_entry.user_id, 2);
    end if;
    update public.queue_entries set status = 'matched' where id in (first_entry.id, second_entry.id);
    update public.parties set status = 'in_match' where id in (first_entry.party_id, second_entry.party_id);
    insert into public.notifications(user_id, title, body)
      select mp.user_id, 'MATCH FOUND', 'Your ' || upper(first_entry.mode::text) || ' STARLADDER match room is ready.'
      from public.match_players mp where mp.match_id = created_match;
    matched_count := matched_count + 1;
  end loop;
  return matched_count;
end;
$$;
