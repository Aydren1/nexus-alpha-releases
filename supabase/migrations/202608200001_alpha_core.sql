create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pg_cron with schema extensions;

create type public.queue_format as enum ('1v1', '3v3', '5v5');
create type public.party_status as enum ('open', 'queued', 'in_match', 'closed');
create type public.tournament_status as enum ('scheduled', 'registration', 'check_in', 'running', 'completed', 'cancelled');
create type public.registration_status as enum ('registered', 'checked_in', 'eliminated', 'winner', 'withdrawn');
create type public.match_status as enum ('scheduled', 'active', 'pending_verification', 'approved', 'disputed', 'cancelled');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rsi_handle extensions.citext not null unique,
  rsi_verified_at timestamptz,
  avatar_url text,
  region text not null default 'US East',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_rsi_handle check (rsi_handle::text ~ '^[A-Za-z0-9_-]{3,32}$'),
  constraint verified_identity check (rsi_verified_at is not null),
  constraint safe_avatar_url check (avatar_url is null or avatar_url ~ '^https://')
);

create table public.rsi_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_handle extensions.citext not null,
  code_hash text not null,
  succeeded boolean not null,
  failure_reason text,
  attempted_at timestamptz not null default now()
);
create index rsi_attempt_user_time on public.rsi_verification_attempts(user_id, attempted_at desc);

create table public.ratings (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  format public.queue_format not null,
  rating integer not null default 1500 check (rating between 0 and 5000),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  streak integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, format)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('general', 'looking-for-crew', 'tournament-lounge')),
  author_id uuid not null references public.profiles(user_id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index chat_channel_time on public.chat_messages(channel, created_at desc);

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  captain_id uuid not null references public.profiles(user_id) on delete cascade,
  format public.queue_format not null default '3v3',
  status public.party_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.party_members (
  party_id uuid not null references public.parties(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);
create unique index one_open_party_per_user on public.party_members(user_id);

create table public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  party_id uuid references public.parties(id) on delete cascade,
  user_id uuid references public.profiles(user_id) on delete cascade,
  format public.queue_format not null,
  region text not null default 'US East',
  status text not null default 'searching' check (status in ('searching', 'matched', 'cancelled')),
  joined_at timestamptz not null default now(),
  constraint queue_owner check ((party_id is null) <> (user_id is null))
);
create unique index one_active_solo_queue on public.queue_entries(user_id) where status = 'searching' and user_id is not null;
create unique index one_active_party_queue on public.queue_entries(party_id) where status = 'searching' and party_id is not null;

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('SL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  format public.queue_format not null,
  status public.match_status not null default 'scheduled',
  star_citizen_match_id text,
  result jsonb,
  approval_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  side smallint not null check (side in (1, 2)),
  confirmed_at timestamptz,
  primary key (match_id, user_id)
);

create table public.match_disputes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  opened_by uuid not null references public.profiles(user_id) on delete cascade,
  reason text not null check (char_length(reason) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.tournament_templates (
  slug text primary key,
  name text not null,
  weekday smallint not null check (weekday between 0 and 6),
  format public.queue_format not null,
  required_roster smallint not null check (required_roster in (1, 3, 5)),
  local_start time not null default '20:00',
  timezone text not null default 'America/New_York',
  enabled boolean not null default true
);

insert into public.tournament_templates(slug, name, weekday, format, required_roster) values
  ('friday-duel', 'FRIDAY DUEL NIGHT', 5, '1v1', 1),
  ('saturday-skirmish', 'SATURDAY SKIRMISH', 6, '3v3', 3),
  ('sunday-squadron', 'SUNDAY SQUADRON CUP', 0, '5v5', 5);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  template_slug text not null references public.tournament_templates(slug),
  starts_at timestamptz not null,
  registration_opens_at timestamptz not null,
  check_in_opens_at timestamptz not null,
  status public.tournament_status not null default 'registration',
  created_at timestamptz not null default now(),
  unique (template_slug, starts_at)
);
create index tournaments_upcoming on public.tournaments(starts_at) where status not in ('completed', 'cancelled');

create table public.tournament_registrations (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  captain_id uuid not null references public.profiles(user_id) on delete cascade,
  party_id uuid references public.parties(id) on delete set null,
  roster_size smallint not null check (roster_size in (1, 3, 5)),
  status public.registration_status not null default 'registered',
  registered_at timestamptz not null default now(),
  checked_in_at timestamptz,
  primary key (tournament_id, captain_id)
);

create table public.circuit_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete set null,
  points integer not null check (points between -1000 and 1000),
  reason text not null,
  created_at timestamptz not null default now(),
  unique (user_id, tournament_id, reason)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_time on public.notifications(user_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger parties_touch before update on public.parties for each row execute function public.touch_updated_at();
create trigger matches_touch before update on public.matches for each row execute function public.touch_updated_at();

create or replace function public.create_default_ratings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ratings(user_id, format) values (new.user_id, '1v1'), (new.user_id, '3v3'), (new.user_id, '5v5');
  return new;
end;
$$;
create trigger profile_default_ratings after insert on public.profiles for each row execute function public.create_default_ratings();

create or replace function public.is_party_member(target_party uuid, target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.party_members where party_id = target_party and user_id = target_user);
$$;

create or replace function public.is_match_player(target_match uuid, target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.match_players where match_id = target_match and user_id = target_user);
$$;

create or replace function public.ensure_weekly_tournaments(weeks_ahead integer default 8)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  template public.tournament_templates%rowtype;
  target_date date;
  target_start timestamptz;
  inserted_count integer := 0;
  week_offset integer;
begin
  weeks_ahead := greatest(1, least(weeks_ahead, 16));
  for template in select * from public.tournament_templates where enabled loop
    for week_offset in 0..weeks_ahead - 1 loop
      target_date := current_date + ((template.weekday - extract(dow from current_date)::integer + 7) % 7) + (week_offset * 7);
      target_start := (target_date + template.local_start) at time zone template.timezone;
      if target_start <= now() then continue; end if;
      insert into public.tournaments(template_slug, starts_at, registration_opens_at, check_in_opens_at)
      values (template.slug, target_start, date_trunc('week', target_start at time zone template.timezone) at time zone template.timezone, target_start - interval '30 minutes')
      on conflict (template_slug, starts_at) do nothing;
      if found then inserted_count := inserted_count + 1; end if;
    end loop;
  end loop;
  return inserted_count;
end;
$$;

create or replace function public.register_weekly_tournament(template_key text, submitted_roster_size integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  event_id uuid;
  required_size integer;
  registered_party uuid;
  actual_roster_size integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select t.id, tt.required_roster into event_id, required_size
  from public.tournaments t join public.tournament_templates tt on tt.slug = t.template_slug
  where t.template_slug = template_key and t.starts_at > now() and t.registration_opens_at <= now() and t.status in ('scheduled', 'registration')
  order by t.starts_at limit 1;
  if event_id is null then raise exception 'No upcoming tournament found'; end if;
  if submitted_roster_size <> required_size then raise exception 'This event requires exactly % pilots', required_size; end if;
  select p.id into registered_party from public.parties p where p.captain_id = auth.uid() and p.status = 'open' limit 1;
  if registered_party is null then raise exception 'Create a party before registering'; end if;
  select count(*) into actual_roster_size from public.party_members where party_id = registered_party;
  if actual_roster_size <> required_size then raise exception 'Your party must contain exactly % pilots', required_size; end if;
  insert into public.tournament_registrations(tournament_id, captain_id, party_id, roster_size)
  values(event_id, auth.uid(), registered_party, actual_roster_size)
  on conflict (tournament_id, captain_id) do update set status = 'registered', party_id = excluded.party_id, roster_size = excluded.roster_size;
  return event_id;
end;
$$;

create or replace function public.create_or_get_party(requested_format public.queue_format)
returns table(party_id uuid, invite_code text) language plpgsql security definer set search_path = '' as $$
declare existing_party uuid; created_party public.parties%rowtype; member_count integer; capacity integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select pm.party_id into existing_party from public.party_members pm where pm.user_id = auth.uid() limit 1;
  if existing_party is not null then
    capacity := case requested_format when '1v1' then 1 when '3v3' then 3 else 5 end;
    select count(*) into member_count from public.party_members where party_id = existing_party;
    if member_count > capacity then raise exception 'Remove pilots before changing to this format'; end if;
    update public.parties set format = requested_format where id = existing_party and captain_id = auth.uid() and status = 'open';
    return query select p.id, p.invite_code from public.parties p where p.id = existing_party;
    return;
  end if;
  insert into public.parties(captain_id, format) values(auth.uid(), requested_format) returning * into created_party;
  insert into public.party_members(party_id, user_id, ready) values(created_party.id, auth.uid(), true);
  return query select created_party.id, created_party.invite_code;
end;
$$;

create or replace function public.join_party_by_code(submitted_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.parties%rowtype; member_count integer; capacity integer; current_party uuid; current_captain uuid; current_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select pm.party_id, p.captain_id into current_party, current_captain from public.party_members pm join public.parties p on p.id = pm.party_id where pm.user_id = auth.uid() limit 1;
  if current_party is not null then
    select count(*) into current_count from public.party_members where party_id = current_party;
    if current_captain = auth.uid() and current_count = 1 then delete from public.parties where id = current_party;
    else raise exception 'Leave your current party first';
    end if;
  end if;
  select * into target from public.parties where invite_code = upper(trim(submitted_code)) and status = 'open' for update;
  if target.id is null then raise exception 'Party code not found'; end if;
  capacity := case target.format when '1v1' then 1 when '3v3' then 3 else 5 end;
  select count(*) into member_count from public.party_members where party_id = target.id;
  if member_count >= capacity then raise exception 'That party is full'; end if;
  insert into public.party_members(party_id, user_id) values(target.id, auth.uid());
  return target.id;
end;
$$;

create or replace function public.set_party_format(target_party uuid, requested_format public.queue_format)
returns void language plpgsql security definer set search_path = '' as $$
declare member_count integer; capacity integer;
begin
  if not exists(select 1 from public.parties where id = target_party and captain_id = auth.uid() and status = 'open') then raise exception 'Only the captain can change the party format'; end if;
  capacity := case requested_format when '1v1' then 1 when '3v3' then 3 else 5 end;
  select count(*) into member_count from public.party_members where party_id = target_party;
  if member_count > capacity then raise exception 'Remove pilots before changing to this format'; end if;
  update public.parties set format = requested_format where id = target_party;
end;
$$;

create or replace function public.remove_party_member(target_party uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.parties where id = target_party and captain_id = auth.uid()) then raise exception 'Only the captain can remove pilots'; end if;
  if target_user = auth.uid() then raise exception 'The captain cannot remove themselves'; end if;
  delete from public.party_members where party_id = target_party and user_id = target_user;
end;
$$;

create or replace function public.queue_current_party(target_party uuid, requested_format public.queue_format, requested_region text default 'US East')
returns uuid language plpgsql security definer set search_path = '' as $$
declare entry_id uuid; member_count integer; capacity integer;
begin
  if not exists(select 1 from public.parties where id = target_party and captain_id = auth.uid() and status = 'open') then raise exception 'Only the captain can queue this party'; end if;
  capacity := case requested_format when '1v1' then 1 when '3v3' then 3 else 5 end;
  select count(*) into member_count from public.party_members where party_id = target_party;
  if member_count <> capacity then raise exception 'This queue requires exactly % pilots', capacity; end if;
  update public.parties set format = requested_format, status = 'queued' where id = target_party;
  insert into public.queue_entries(party_id, format, region) values(target_party, requested_format, requested_region)
  returning id into entry_id;
  return entry_id;
end;
$$;

create or replace function public.cancel_current_queue(target_party uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.parties where id = target_party and captain_id = auth.uid() and status = 'queued') then raise exception 'Only the captain can cancel this queue'; end if;
  update public.queue_entries set status = 'cancelled' where party_id = target_party and status = 'searching';
  update public.parties set status = 'open' where id = target_party;
end;
$$;

create or replace function public.withdraw_weekly_tournament(template_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.tournament_registrations tr set status = 'withdrawn'
  from public.tournaments t
  where tr.tournament_id = t.id and tr.captain_id = auth.uid() and t.template_slug = template_key and t.starts_at > now();
end;
$$;

create or replace function public.finalize_due_match_results()
returns integer language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  update public.matches m set status = 'approved', updated_at = now()
  where m.status = 'pending_verification' and m.approval_deadline <= now()
    and not exists(select 1 from public.match_disputes d where d.match_id = m.id and d.status = 'open');
  get diagnostics changed = row_count;
  return changed;
end;
$$;

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
      and candidate.format = first_entry.format and candidate.region = first_entry.region
      and (case when candidate.party_id is null then 1 else (select count(*) from public.party_members where party_id = candidate.party_id) end) = first_size
    order by candidate.joined_at limit 1 for update skip locked;
    if second_entry.id is null then continue; end if;

    insert into public.matches(format, status) values(first_entry.format, 'scheduled') returning id into created_match;
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
      select mp.user_id, 'MATCH FOUND', 'Your STARLADDER match room is ready.' from public.match_players mp where mp.match_id = created_match;
    matched_count := matched_count + 1;
  end loop;
  return matched_count;
end;
$$;

create or replace view public.weekly_circuit_leaderboard with (security_invoker = true) as
select p.user_id, p.rsi_handle::text as handle, p.avatar_url, coalesce(sum(cp.points), 0)::integer as points,
       count(distinct cp.tournament_id)::integer as events
from public.profiles p left join public.circuit_points cp on cp.user_id = p.user_id
group by p.user_id, p.rsi_handle, p.avatar_url
order by points desc, events desc, handle asc;

alter table public.profiles enable row level security;
alter table public.rsi_verification_attempts enable row level security;
alter table public.ratings enable row level security;
alter table public.chat_messages enable row level security;
alter table public.parties enable row level security;
alter table public.party_members enable row level security;
alter table public.queue_entries enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_disputes enable row level security;
alter table public.tournament_templates enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.circuit_points enable row level security;
alter table public.notifications enable row level security;

create policy profiles_public_read on public.profiles for select to authenticated using (true);
create policy profiles_own_update on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and rsi_handle = (select p.rsi_handle from public.profiles p where p.user_id = auth.uid()));
create policy ratings_public_read on public.ratings for select to authenticated using (true);
create policy chat_authenticated_read on public.chat_messages for select to authenticated using (true);
create policy chat_own_insert on public.chat_messages for insert to authenticated with check (author_id = auth.uid());
create policy chat_own_delete on public.chat_messages for delete to authenticated using (author_id = auth.uid() and created_at > now() - interval '10 minutes');
create policy parties_member_read on public.parties for select to authenticated using (public.is_party_member(id));
create policy parties_captain_update on public.parties for update to authenticated using (captain_id = auth.uid()) with check (captain_id = auth.uid());
create policy parties_create on public.parties for insert to authenticated with check (captain_id = auth.uid());
create policy party_members_member_read on public.party_members for select to authenticated using (public.is_party_member(party_id));
create policy party_members_self_join on public.party_members for insert to authenticated with check (user_id = auth.uid());
create policy party_members_self_leave on public.party_members for delete to authenticated using (user_id = auth.uid() or exists(select 1 from public.parties p where p.id = party_id and p.captain_id = auth.uid()));
create policy queue_owner_read on public.queue_entries for select to authenticated using (user_id = auth.uid() or (party_id is not null and public.is_party_member(party_id)));
create policy queue_owner_insert on public.queue_entries for insert to authenticated with check (user_id = auth.uid() or (party_id is not null and exists(select 1 from public.parties p where p.id = party_id and p.captain_id = auth.uid())));
create policy queue_owner_update on public.queue_entries for update to authenticated using (user_id = auth.uid() or (party_id is not null and exists(select 1 from public.parties p where p.id = party_id and p.captain_id = auth.uid())));
create policy matches_player_read on public.matches for select to authenticated using (public.is_match_player(id));
create policy match_players_same_match_read on public.match_players for select to authenticated using (public.is_match_player(match_id));
create policy disputes_player_read on public.match_disputes for select to authenticated using (public.is_match_player(match_id));
create policy disputes_player_insert on public.match_disputes for insert to authenticated with check (opened_by = auth.uid() and public.is_match_player(match_id));
create policy tournament_templates_read on public.tournament_templates for select to authenticated using (enabled);
create policy tournaments_read on public.tournaments for select to authenticated using (true);
create policy registrations_read on public.tournament_registrations for select to authenticated using (true);
create policy registrations_own on public.tournament_registrations for update to authenticated using (captain_id = auth.uid()) with check (captain_id = auth.uid());
create policy circuit_points_read on public.circuit_points for select to authenticated using (true);
create policy notifications_own_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.weekly_circuit_leaderboard to authenticated;
revoke update on public.profiles from authenticated;
grant update (avatar_url, region) on public.profiles to authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.create_default_ratings() from public, anon, authenticated;
revoke execute on function public.is_party_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_match_player(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.register_weekly_tournament(text, integer) from public, anon, authenticated;
revoke execute on function public.withdraw_weekly_tournament(text) from public, anon, authenticated;
revoke execute on function public.create_or_get_party(public.queue_format) from public, anon, authenticated;
revoke execute on function public.join_party_by_code(text) from public, anon, authenticated;
revoke execute on function public.set_party_format(uuid, public.queue_format) from public, anon, authenticated;
revoke execute on function public.remove_party_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.queue_current_party(uuid, public.queue_format, text) from public, anon, authenticated;
revoke execute on function public.cancel_current_queue(uuid) from public, anon, authenticated;
grant execute on function public.is_party_member(uuid, uuid) to authenticated;
grant execute on function public.is_match_player(uuid, uuid) to authenticated;
grant execute on function public.register_weekly_tournament(text, integer) to authenticated;
grant execute on function public.withdraw_weekly_tournament(text) to authenticated;
grant execute on function public.create_or_get_party(public.queue_format) to authenticated;
grant execute on function public.join_party_by_code(text) to authenticated;
grant execute on function public.set_party_format(uuid, public.queue_format) to authenticated;
grant execute on function public.remove_party_member(uuid, uuid) to authenticated;
grant execute on function public.queue_current_party(uuid, public.queue_format, text) to authenticated;
grant execute on function public.cancel_current_queue(uuid) to authenticated;
revoke execute on function public.ensure_weekly_tournaments(integer) from public, anon, authenticated;
revoke execute on function public.finalize_due_match_results() from public, anon, authenticated;
revoke execute on function public.run_small_matchmaker() from public, anon, authenticated;

select public.ensure_weekly_tournaments(8);
select cron.schedule('starladder-generate-weekly-tournaments', '5 5 * * 1', 'select public.ensure_weekly_tournaments(8)');
select cron.schedule('starladder-finalize-match-results', '*/5 * * * *', 'select public.finalize_due_match_results()');
select cron.schedule('starladder-small-matchmaker', '* * * * *', 'select public.run_small_matchmaker()');

alter publication supabase_realtime add table public.chat_messages;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy avatar_public_read on storage.objects for select using (bucket_id = 'avatars');
create policy avatar_own_insert on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatar_own_update on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatar_own_delete on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
