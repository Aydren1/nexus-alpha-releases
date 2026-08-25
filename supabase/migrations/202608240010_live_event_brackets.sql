create table if not exists public.community_event_registrations (
  event_id uuid not null references public.community_events(id) on delete cascade,
  captain_id uuid not null references public.profiles(user_id) on delete cascade,
  party_id uuid references public.parties(id) on delete set null,
  roster_size smallint not null check (roster_size in (1, 3, 5)),
  status text not null default 'registered' check (status in ('registered', 'withdrawn', 'eliminated', 'winner')),
  registered_at timestamptz not null default now(),
  primary key (event_id, captain_id)
);

create table if not exists public.competition_bracket_matches (
  id uuid primary key default gen_random_uuid(),
  competition_kind text not null check (competition_kind in ('weekly', 'community')),
  competition_id uuid not null,
  round_number smallint not null check (round_number between 0 and 6),
  match_number smallint not null check (match_number between 0 and 63),
  winner_id uuid not null references public.profiles(user_id) on delete cascade,
  decided_by uuid not null references public.profiles(user_id) on delete cascade default auth.uid(),
  decided_at timestamptz not null default now(),
  unique (competition_kind, competition_id, round_number, match_number)
);

create index if not exists community_event_registrations_event
on public.community_event_registrations(event_id, registered_at)
where status <> 'withdrawn';

create index if not exists competition_bracket_matches_source
on public.competition_bracket_matches(competition_kind, competition_id, round_number, match_number);

alter table public.community_event_registrations enable row level security;
alter table public.competition_bracket_matches enable row level security;

drop policy if exists community_event_registrations_read on public.community_event_registrations;
create policy community_event_registrations_read
on public.community_event_registrations for select to authenticated using (true);

drop policy if exists competition_bracket_matches_read on public.competition_bracket_matches;
create policy competition_bracket_matches_read
on public.competition_bracket_matches for select to authenticated using (true);

create or replace function public.register_community_event(target_event uuid, submitted_roster_size integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.community_events%rowtype;
  expected_size integer;
  registered_party uuid;
  actual_roster_size integer;
  active_entries integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select ce.* into target from public.community_events as ce where ce.id = target_event for update;
  if target.id is null or target.status <> 'published' then raise exception 'This event is not open'; end if;
  if target.starts_at <= now() then raise exception 'Registration has closed'; end if;
  expected_size := case target.format when '1v1' then 1 when '3v3' then 3 else 5 end;
  if submitted_roster_size <> expected_size then raise exception 'This event requires exactly % pilots', expected_size; end if;

  select p.id into registered_party from public.parties as p
  where p.captain_id = auth.uid() and p.status = 'open' order by p.created_at desc limit 1;
  if registered_party is null then raise exception 'Create a party before registering'; end if;
  select count(*) into actual_roster_size from public.party_members as pm where pm.party_id = registered_party;
  if actual_roster_size <> expected_size then raise exception 'Your party must contain exactly % pilots', expected_size; end if;

  select count(*) into active_entries from public.community_event_registrations as cer
  where cer.event_id = target_event and cer.status <> 'withdrawn' and cer.captain_id <> auth.uid();
  if active_entries >= target.bracket_size then raise exception 'This bracket is full'; end if;

  insert into public.community_event_registrations(event_id, captain_id, party_id, roster_size, status)
  values(target_event, auth.uid(), registered_party, expected_size, 'registered')
  on conflict (event_id, captain_id) do update
  set party_id = excluded.party_id, roster_size = excluded.roster_size, status = 'registered', registered_at = now();
end;
$$;

create or replace function public.withdraw_community_event(target_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.community_event_registrations as cer set status = 'withdrawn'
  where cer.event_id = target_event and cer.captain_id = auth.uid();
end;
$$;

create or replace function public.record_bracket_winner(
  submitted_kind text,
  submitted_competition uuid,
  submitted_round integer,
  submitted_match integer,
  submitted_winner uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare allowed boolean := false;
begin
  if submitted_kind = 'weekly' then
    allowed := public.is_platform_staff();
    if not exists (
      select 1 from public.tournament_registrations as tr
      where tr.tournament_id = submitted_competition and tr.captain_id = submitted_winner and tr.status <> 'withdrawn'
    ) then raise exception 'Winner is not registered in this bracket'; end if;
  elsif submitted_kind = 'community' then
    allowed := public.is_platform_staff() or exists (
      select 1 from public.community_events as ce
      where ce.id = submitted_competition and ce.creator_id = auth.uid()
    );
    if not exists (
      select 1 from public.community_event_registrations as cer
      where cer.event_id = submitted_competition and cer.captain_id = submitted_winner and cer.status <> 'withdrawn'
    ) then raise exception 'Winner is not registered in this bracket'; end if;
  else
    raise exception 'Unknown competition type';
  end if;
  if not allowed then raise exception 'Organizer or staff access required'; end if;
  if submitted_round < 0 or submitted_round > 6 or submitted_match < 0 or submitted_match > 63 then
    raise exception 'Invalid bracket position';
  end if;

  insert into public.competition_bracket_matches(
    competition_kind, competition_id, round_number, match_number, winner_id, decided_by, decided_at
  ) values (
    submitted_kind, submitted_competition, submitted_round, submitted_match, submitted_winner, auth.uid(), now()
  ) on conflict (competition_kind, competition_id, round_number, match_number) do update
  set winner_id = excluded.winner_id, decided_by = auth.uid(), decided_at = now();
end;
$$;

revoke all on table public.community_event_registrations from anon, authenticated;
revoke all on table public.competition_bracket_matches from anon, authenticated;
grant select on table public.community_event_registrations to authenticated;
grant select on table public.competition_bracket_matches to authenticated;
revoke execute on function public.register_community_event(uuid, integer), public.withdraw_community_event(uuid), public.record_bracket_winner(text, uuid, integer, integer, uuid) from public, anon;
grant execute on function public.register_community_event(uuid, integer), public.withdraw_community_event(uuid), public.record_bracket_winner(text, uuid, integer, integer, uuid) to authenticated;

alter publication supabase_realtime add table public.community_event_registrations;
alter publication supabase_realtime add table public.competition_bracket_matches;
