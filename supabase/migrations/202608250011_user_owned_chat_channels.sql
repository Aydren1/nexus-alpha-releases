create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  channel_key text not null unique,
  name text not null check (char_length(name) between 3 and 48),
  kind text not null check (kind in ('public', 'personal', 'organization')),
  organization_name text check (organization_name is null or char_length(organization_name) between 2 and 60),
  owner_id uuid references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (kind = 'public' and owner_id is null and organization_name is null) or
    (kind = 'personal' and owner_id is not null and organization_name is null) or
    (kind = 'organization' and owner_id is not null and organization_name is not null)
  )
);

create table if not exists public.chat_channel_members (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  invited_by uuid references public.profiles(user_id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists chat_channel_members_user on public.chat_channel_members(user_id, joined_at desc);

insert into public.chat_channels(channel_key, name, kind) values
  ('general', 'general', 'public'),
  ('looking-for-crew', 'looking-for-crew', 'public'),
  ('tournament-lounge', 'tournament-lounge', 'public')
on conflict (channel_key) do nothing;

alter table public.chat_messages drop constraint if exists chat_messages_channel_check;
alter table public.chat_messages drop constraint if exists chat_messages_channel_fkey;
alter table public.chat_messages
  add constraint chat_messages_channel_fkey foreign key (channel)
  references public.chat_channels(channel_key) on update cascade on delete cascade;

create or replace function public.can_access_chat_channel(target_channel text, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_channels as c
    where c.channel_key = target_channel
      and (
        c.kind = 'public'
        or c.owner_id = target_user
        or exists (
          select 1 from public.chat_channel_members as cm
          where cm.channel_id = c.id and cm.user_id = target_user
        )
      )
  );
$$;

create or replace function public.can_manage_chat_channel(target_channel text, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_channels as c
    where c.channel_key = target_channel
      and c.kind <> 'public'
      and (
        c.owner_id = target_user
        or exists (
          select 1 from public.chat_channel_members as cm
          where cm.channel_id = c.id and cm.user_id = target_user and cm.role in ('owner', 'admin')
        )
      )
  );
$$;

create or replace function public.list_my_chat_channels()
returns table (
  channel_key text,
  channel_name text,
  channel_kind text,
  organization_name text,
  owner_id uuid,
  my_role text,
  member_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.channel_key,
    c.name,
    c.kind,
    c.organization_name,
    c.owner_id,
    case
      when c.owner_id = auth.uid() then 'owner'
      when c.kind = 'public' then null
      else cm.role
    end,
    case when c.kind = 'public' then 0 else count(all_members.user_id)::integer end
  from public.chat_channels as c
  left join public.chat_channel_members as cm
    on cm.channel_id = c.id and cm.user_id = auth.uid()
  left join public.chat_channel_members as all_members
    on all_members.channel_id = c.id
  where auth.uid() is not null
    and (c.kind = 'public' or c.owner_id = auth.uid() or cm.user_id is not null)
  group by c.id, c.channel_key, c.name, c.kind, c.organization_name, c.owner_id, cm.role
  order by case when c.kind = 'public' then 0 else 1 end, c.created_at, c.name;
$$;

create or replace function public.create_chat_channel(
  submitted_name text,
  submitted_kind text,
  submitted_organization_name text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := btrim(coalesce(submitted_name, ''));
  clean_kind text := lower(btrim(coalesce(submitted_kind, '')));
  clean_org text := nullif(btrim(coalesce(submitted_organization_name, '')), '');
  new_id uuid := gen_random_uuid();
  new_key text := 'room:' || replace(new_id::text, '-', '');
begin
  if auth.uid() is null then raise exception 'Sign in before creating a channel'; end if;
  if not exists (select 1 from public.profiles as p where p.user_id = auth.uid() and p.rsi_verified_at is not null) then
    raise exception 'Verify your RSI account before creating a channel';
  end if;
  if clean_kind not in ('personal', 'organization') then raise exception 'Choose a personal or organization channel'; end if;
  if char_length(clean_name) not between 3 and 48 then raise exception 'Channel names must be 3 to 48 characters'; end if;
  if clean_name !~ '^[A-Za-z0-9][A-Za-z0-9 _-]*$' then raise exception 'Use letters, numbers, spaces, dashes, or underscores in channel names'; end if;
  if clean_kind = 'organization' and (clean_org is null or char_length(clean_org) not between 2 and 60) then
    raise exception 'Enter an organization name between 2 and 60 characters';
  end if;
  if clean_kind = 'personal' then clean_org := null; end if;
  if (select count(*) from public.chat_channels as c where c.owner_id = auth.uid()) >= 12 then
    raise exception 'You can own up to 12 private channels during the alpha';
  end if;

  insert into public.chat_channels(id, channel_key, name, kind, organization_name, owner_id)
  values(new_id, new_key, clean_name, clean_kind, clean_org, auth.uid());
  insert into public.chat_channel_members(channel_id, user_id, role, invited_by)
  values(new_id, auth.uid(), 'owner', auth.uid());
  return new_key;
end;
$$;

create or replace function public.list_chat_channel_members(target_channel text)
returns table (
  user_id uuid,
  handle text,
  avatar_url text,
  member_role text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_access_chat_channel(target_channel, auth.uid()) then raise exception 'You do not have access to this channel'; end if;
  return query
    select cm.user_id, p.rsi_handle::text, p.avatar_url, cm.role, cm.joined_at
    from public.chat_channel_members as cm
    join public.chat_channels as c on c.id = cm.channel_id
    join public.profiles as p on p.user_id = cm.user_id
    where c.channel_key = target_channel
    order by case cm.role when 'owner' then 0 when 'admin' then 1 else 2 end, p.rsi_handle;
end;
$$;

create or replace function public.invite_chat_channel_member(target_channel text, invited_handle text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_channels%rowtype;
  invitee public.profiles%rowtype;
  inviter_handle text;
begin
  if not public.can_manage_chat_channel(target_channel, auth.uid()) then raise exception 'Only channel owners and admins can invite pilots'; end if;
  select c.* into target from public.chat_channels as c where c.channel_key = target_channel;
  select p.* into invitee from public.profiles as p where lower(p.rsi_handle::text) = lower(btrim(invited_handle)) and p.rsi_verified_at is not null;
  if invitee.user_id is null then raise exception 'No verified RSI pilot was found with that handle'; end if;
  if invitee.user_id = target.owner_id then raise exception 'The channel owner is already a member'; end if;
  if (select count(*) from public.chat_channel_members as cm where cm.channel_id = target.id) >= 250 then raise exception 'This channel has reached its 250 member alpha limit'; end if;

  insert into public.chat_channel_members(channel_id, user_id, role, invited_by)
  values(target.id, invitee.user_id, 'member', auth.uid())
  on conflict (channel_id, user_id) do update set invited_by = excluded.invited_by;

  select p.rsi_handle::text into inviter_handle from public.profiles as p where p.user_id = auth.uid();
  insert into public.notifications(user_id, title, body, kind, entity_id)
  values(
    invitee.user_id,
    'CHANNEL INVITATION',
    coalesce(inviter_handle, 'A verified pilot') || ' added you to #' || target.name || case when target.kind = 'organization' then ' for ' || target.organization_name else '' end || '.',
    'channel_invite',
    target.id
  );
end;
$$;

create or replace function public.set_chat_channel_member_role(target_channel text, target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target public.chat_channels%rowtype;
begin
  select c.* into target from public.chat_channels as c where c.channel_key = target_channel;
  if target.owner_id <> auth.uid() then raise exception 'Only the channel owner can change member roles'; end if;
  if target_user = target.owner_id then raise exception 'The owner role cannot be changed'; end if;
  if new_role not in ('admin', 'member') then raise exception 'Choose admin or member'; end if;
  update public.chat_channel_members as cm set role = new_role where cm.channel_id = target.id and cm.user_id = target_user;
  if not found then raise exception 'That pilot is not a channel member'; end if;
end;
$$;

create or replace function public.remove_chat_channel_member(target_channel text, target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target public.chat_channels%rowtype;
begin
  select c.* into target from public.chat_channels as c where c.channel_key = target_channel;
  if target.id is null then raise exception 'Channel not found'; end if;
  if target_user = target.owner_id then raise exception 'The channel owner cannot leave; delete the channel instead'; end if;
  if target_user <> auth.uid() and not public.can_manage_chat_channel(target_channel, auth.uid()) then
    raise exception 'Only channel owners and admins can remove pilots';
  end if;
  delete from public.chat_channel_members as cm where cm.channel_id = target.id and cm.user_id = target_user;
  if not found then raise exception 'That pilot is not a channel member'; end if;
end;
$$;

create or replace function public.delete_chat_channel(target_channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.chat_channels as c where c.channel_key = target_channel and c.owner_id = auth.uid() and c.kind <> 'public';
  if not found then raise exception 'Only the channel owner can delete this channel'; end if;
end;
$$;

alter table public.chat_channels enable row level security;
alter table public.chat_channel_members enable row level security;

drop policy if exists chat_authenticated_read on public.chat_messages;
drop policy if exists chat_own_insert on public.chat_messages;
drop policy if exists chat_own_delete on public.chat_messages;
create policy chat_member_read on public.chat_messages for select to authenticated
  using (public.can_access_chat_channel(channel, auth.uid()));
create policy chat_member_insert on public.chat_messages for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_chat_channel(channel, auth.uid()));
create policy chat_member_delete on public.chat_messages for delete to authenticated
  using (author_id = auth.uid() and created_at > now() - interval '10 minutes' and public.can_access_chat_channel(channel, auth.uid()));
create policy chat_channels_member_read on public.chat_channels for select to authenticated
  using (public.can_access_chat_channel(channel_key, auth.uid()));
create policy chat_channel_members_member_read on public.chat_channel_members for select to authenticated
  using (exists (
    select 1 from public.chat_channels as c
    where c.id = channel_id and public.can_access_chat_channel(c.channel_key, auth.uid())
  ));

drop trigger if exists enforce_not_banned_write on public.chat_channels;
create trigger enforce_not_banned_write before insert or update or delete on public.chat_channels
for each row execute function public.enforce_not_banned();
drop trigger if exists enforce_not_banned_write on public.chat_channel_members;
create trigger enforce_not_banned_write before insert or update or delete on public.chat_channel_members
for each row execute function public.enforce_not_banned();

revoke all on table public.chat_channels, public.chat_channel_members from anon, authenticated;
grant select on table public.chat_channels, public.chat_channel_members to authenticated;

revoke execute on function public.can_access_chat_channel(text, uuid), public.can_manage_chat_channel(text, uuid), public.list_my_chat_channels(), public.create_chat_channel(text, text, text), public.list_chat_channel_members(text), public.invite_chat_channel_member(text, text), public.set_chat_channel_member_role(text, uuid, text), public.remove_chat_channel_member(text, uuid), public.delete_chat_channel(text) from public, anon;
grant execute on function public.can_access_chat_channel(text, uuid), public.can_manage_chat_channel(text, uuid), public.list_my_chat_channels(), public.create_chat_channel(text, text, text), public.list_chat_channel_members(text), public.invite_chat_channel_member(text, text), public.set_chat_channel_member_role(text, uuid, text), public.remove_chat_channel_member(text, uuid), public.delete_chat_channel(text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_channels') then
    alter publication supabase_realtime add table public.chat_channels;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_channel_members') then
    alter publication supabase_realtime add table public.chat_channel_members;
  end if;
end;
$$;
