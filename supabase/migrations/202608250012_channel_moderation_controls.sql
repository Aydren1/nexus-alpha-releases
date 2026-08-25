alter table public.chat_channel_members
  add column if not exists timed_out_until timestamptz,
  add column if not exists timed_out_by uuid references public.profiles(user_id) on delete set null;

create or replace function public.can_send_chat_channel(target_channel text, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_chat_channel(target_channel, target_user)
    and not exists (
      select 1
      from public.chat_channels as c
      join public.chat_channel_members as cm on cm.channel_id = c.id
      where c.channel_key = target_channel
        and cm.user_id = target_user
        and cm.timed_out_until > now()
    );
$$;

drop function if exists public.list_chat_channel_members(text);
create function public.list_chat_channel_members(target_channel text)
returns table (
  user_id uuid,
  handle text,
  avatar_url text,
  member_role text,
  joined_at timestamptz,
  timed_out_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_access_chat_channel(target_channel, auth.uid()) then raise exception 'You do not have access to this channel'; end if;
  return query
    select cm.user_id, p.rsi_handle::text, p.avatar_url, cm.role, cm.joined_at, cm.timed_out_until
    from public.chat_channel_members as cm
    join public.chat_channels as c on c.id = cm.channel_id
    join public.profiles as p on p.user_id = cm.user_id
    where c.channel_key = target_channel
    order by case cm.role when 'owner' then 0 when 'admin' then 1 else 2 end, p.rsi_handle;
end;
$$;

create or replace function public.timeout_chat_channel_member(target_channel text, target_user uuid, timeout_minutes integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_channels%rowtype;
  actor_role text;
  target_role text;
  target_handle text;
  timeout_until timestamptz;
begin
  if timeout_minutes is null or timeout_minutes not in (0, 10, 60, 1440, 10080) then
    raise exception 'Choose a 10 minute, 1 hour, 24 hour, or 7 day timeout';
  end if;
  select c.* into target from public.chat_channels as c where c.channel_key = target_channel and c.kind <> 'public';
  if target.id is null then raise exception 'Private channel not found'; end if;
  if not public.can_manage_chat_channel(target_channel, auth.uid()) then raise exception 'Channel moderation permission required'; end if;

  select cm.role into actor_role from public.chat_channel_members as cm where cm.channel_id = target.id and cm.user_id = auth.uid();
  select cm.role, p.rsi_handle::text into target_role, target_handle
  from public.chat_channel_members as cm join public.profiles as p on p.user_id = cm.user_id
  where cm.channel_id = target.id and cm.user_id = target_user;
  if target_role is null then raise exception 'That pilot is not a channel member'; end if;
  if target_user = target.owner_id then raise exception 'The channel creator cannot be timed out'; end if;
  if target_user = auth.uid() then raise exception 'You cannot time yourself out'; end if;
  if target.owner_id <> auth.uid() and (actor_role <> 'admin' or target_role <> 'member') then
    raise exception 'Channel admins can only moderate ordinary members';
  end if;

  timeout_until := case when timeout_minutes = 0 then null else now() + make_interval(mins => timeout_minutes) end;
  update public.chat_channel_members as cm
  set timed_out_until = timeout_until,
      timed_out_by = case when timeout_until is null then null else auth.uid() end
  where cm.channel_id = target.id and cm.user_id = target_user;

  insert into public.notifications(user_id, title, body, kind, entity_id)
  values(
    target_user,
    case when timeout_until is null then 'CHANNEL TIMEOUT LIFTED' else 'CHANNEL TIMEOUT' end,
    case when timeout_until is null
      then 'Your posting timeout in #' || target.name || ' was lifted.'
      else 'You cannot post in #' || target.name || ' until ' || to_char(timeout_until at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC.'
    end,
    'channel_moderation',
    target.id
  );
  return timeout_until;
end;
$$;

create or replace function public.remove_chat_channel_member(target_channel text, target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_channels%rowtype;
  actor_role text;
  target_role text;
begin
  select c.* into target from public.chat_channels as c where c.channel_key = target_channel and c.kind <> 'public';
  if target.id is null then raise exception 'Private channel not found'; end if;
  select cm.role into target_role from public.chat_channel_members as cm where cm.channel_id = target.id and cm.user_id = target_user;
  if target_role is null then raise exception 'That pilot is not a channel member'; end if;
  if target_user = target.owner_id then raise exception 'The channel creator cannot leave; delete the channel instead'; end if;

  if target_user <> auth.uid() then
    if not public.can_manage_chat_channel(target_channel, auth.uid()) then raise exception 'Channel moderation permission required'; end if;
    select cm.role into actor_role from public.chat_channel_members as cm where cm.channel_id = target.id and cm.user_id = auth.uid();
    if target.owner_id <> auth.uid() and (actor_role is distinct from 'admin' or target_role is distinct from 'member') then
      raise exception 'Channel admins can only kick ordinary members';
    end if;
  end if;

  delete from public.chat_channel_members as cm where cm.channel_id = target.id and cm.user_id = target_user;
end;
$$;

drop policy if exists chat_member_insert on public.chat_messages;
create policy chat_member_insert on public.chat_messages for insert to authenticated
  with check (author_id = auth.uid() and public.can_send_chat_channel(channel, auth.uid()));

revoke execute on function public.can_send_chat_channel(text, uuid), public.list_chat_channel_members(text), public.timeout_chat_channel_member(text, uuid, integer), public.remove_chat_channel_member(text, uuid) from public, anon;
grant execute on function public.can_send_chat_channel(text, uuid), public.list_chat_channel_members(text), public.timeout_chat_channel_member(text, uuid, integer), public.remove_chat_channel_member(text, uuid) to authenticated;

notify pgrst, 'reload schema';
