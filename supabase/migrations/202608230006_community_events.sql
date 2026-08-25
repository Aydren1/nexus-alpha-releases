create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('NX-EVT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  creator_id uuid not null references public.profiles(user_id) on delete cascade,
  name text not null check (char_length(name) between 3 and 80),
  description text not null default '' check (char_length(description) <= 500),
  format public.queue_format not null,
  region text not null check (region in ('US East', 'US Central', 'US West', 'Europe')),
  starts_at timestamptz not null,
  bracket_size smallint not null check (bracket_size in (8, 16, 32, 64)),
  prize_pool text not null check (char_length(prize_pool) between 1 and 80),
  status text not null default 'published' check (status in ('published', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_events_upcoming
on public.community_events(starts_at)
where status = 'published';

drop trigger if exists community_events_touch on public.community_events;
create trigger community_events_touch
before update on public.community_events
for each row execute function public.touch_updated_at();

alter table public.community_events enable row level security;

drop policy if exists community_events_read on public.community_events;
create policy community_events_read
on public.community_events for select to authenticated
using (status = 'published' or creator_id = auth.uid());

create or replace function public.create_community_event(
  submitted_name text,
  submitted_description text,
  submitted_format public.queue_format,
  submitted_region text,
  submitted_starts_at timestamptz,
  submitted_bracket_size integer,
  submitted_prize_pool text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  created_event uuid;
  clean_name text := trim(submitted_name);
  clean_description text := trim(coalesce(submitted_description, ''));
  clean_prize text := trim(submitted_prize_pool);
begin
  if auth.uid() is null then
    raise exception 'Sign in before creating an event';
  end if;
  if not exists (
    select 1 from public.profiles as p
    where p.user_id = auth.uid() and p.rsi_verified_at is not null
  ) then
    raise exception 'Verify your RSI account before creating an event';
  end if;
  if char_length(clean_name) < 3 or char_length(clean_name) > 80 then
    raise exception 'Event names must contain 3 to 80 characters';
  end if;
  if char_length(clean_description) > 500 then
    raise exception 'Event descriptions cannot exceed 500 characters';
  end if;
  if submitted_region not in ('US East', 'US Central', 'US West', 'Europe') then
    raise exception 'Choose a supported event region';
  end if;
  if submitted_bracket_size not in (8, 16, 32, 64) then
    raise exception 'Bracket size must be 8, 16, 32, or 64 entries';
  end if;
  if submitted_starts_at < now() + interval '30 minutes' then
    raise exception 'Events must be scheduled at least 30 minutes ahead';
  end if;
  if submitted_starts_at > now() + interval '1 year' then
    raise exception 'Events cannot be scheduled more than one year ahead';
  end if;
  if char_length(clean_prize) < 1 or char_length(clean_prize) > 80 then
    raise exception 'Prize pool descriptions must contain 1 to 80 characters';
  end if;

  insert into public.community_events(
    creator_id, name, description, format, region, starts_at, bracket_size, prize_pool
  ) values (
    auth.uid(), clean_name, clean_description, submitted_format, submitted_region,
    submitted_starts_at, submitted_bracket_size, clean_prize
  ) returning id into created_event;

  return created_event;
end;
$$;

revoke all on table public.community_events from anon, authenticated;
grant select on table public.community_events to authenticated;
revoke execute on function public.create_community_event(text, text, public.queue_format, text, timestamptz, integer, text) from public, anon;
grant execute on function public.create_community_event(text, text, public.queue_format, text, timestamptz, integer, text) to authenticated;
