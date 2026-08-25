create table if not exists public.platform_roles (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'moderator')),
  granted_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(user_id) on delete set null,
  revoked_at timestamptz
);
create unique index if not exists one_active_platform_ban
on public.moderation_bans(user_id) where active;

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(user_id) on delete restrict,
  action text not null,
  target_user_id uuid references public.profiles(user_id) on delete set null,
  target_event_id uuid references public.community_events(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists platform_roles_touch on public.platform_roles;
create trigger platform_roles_touch before update on public.platform_roles
for each row execute function public.touch_updated_at();

create or replace function public.is_platform_staff(target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.platform_roles as pr
    where pr.user_id = target_user and pr.role in ('owner', 'admin', 'moderator')
  );
$$;

create or replace function public.is_platform_owner(target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.platform_roles as pr
    where pr.user_id = target_user and pr.role = 'owner'
  );
$$;

create or replace function public.is_user_banned(target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.moderation_bans as mb
    where mb.user_id = target_user and mb.active
      and (mb.expires_at is null or mb.expires_at > now())
  );
$$;

alter table public.platform_roles enable row level security;
alter table public.moderation_bans enable row level security;
alter table public.admin_audit_log enable row level security;

drop policy if exists platform_roles_read on public.platform_roles;
create policy platform_roles_read on public.platform_roles for select to authenticated
using (user_id = auth.uid() or public.is_platform_staff());

drop policy if exists moderation_bans_read on public.moderation_bans;
create policy moderation_bans_read on public.moderation_bans for select to authenticated
using (user_id = auth.uid() or public.is_platform_staff());

drop policy if exists admin_audit_read on public.admin_audit_log;
create policy admin_audit_read on public.admin_audit_log for select to authenticated
using (public.is_platform_staff());

alter table public.community_events add column if not exists reviewed_by uuid references public.profiles(user_id) on delete set null;
alter table public.community_events add column if not exists reviewed_at timestamptz;
alter table public.community_events add column if not exists review_note text check (review_note is null or char_length(review_note) <= 500);
alter table public.community_events alter column status set default 'pending';
alter table public.community_events drop constraint if exists community_events_status_check;
alter table public.community_events add constraint community_events_status_check
check (status in ('pending', 'published', 'rejected', 'cancelled', 'completed'));

drop policy if exists community_events_read on public.community_events;
create policy community_events_read on public.community_events for select to authenticated
using (status = 'published' or creator_id = auth.uid() or public.is_platform_staff());

create or replace function public.get_my_platform_access()
returns table(access_role text, banned boolean, ban_reason text, ban_expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return query
    select
      (select pr.role from public.platform_roles as pr where pr.user_id = auth.uid()),
      (mb.id is not null),
      mb.reason,
      mb.expires_at
    from (select 1) as seed
    left join lateral (
      select b.id, b.reason, b.expires_at
      from public.moderation_bans as b
      where b.user_id = auth.uid() and b.active
        and (b.expires_at is null or b.expires_at > now())
      order by b.created_at desc limit 1
    ) as mb on true;
end;
$$;

create or replace function public.list_admin_users()
returns table(account_id uuid, handle text, platform_role text, banned boolean, ban_reason text, ban_expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_staff() then raise exception 'Staff access required'; end if;
  return query
    select p.user_id, p.rsi_handle::text, pr.role, (mb.id is not null), mb.reason, mb.expires_at
    from public.profiles as p
    left join public.platform_roles as pr on pr.user_id = p.user_id
    left join lateral (
      select b.id, b.reason, b.expires_at
      from public.moderation_bans as b
      where b.user_id = p.user_id and b.active
        and (b.expires_at is null or b.expires_at > now())
      order by b.created_at desc limit 1
    ) as mb on true
    order by case pr.role when 'owner' then 0 when 'admin' then 1 when 'moderator' then 2 else 3 end,
      lower(p.rsi_handle::text);
end;
$$;

create or replace function public.set_platform_role(target_user uuid, new_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_role text;
begin
  if not public.is_platform_owner() then raise exception 'Only the platform owner can assign staff roles'; end if;
  if target_user = auth.uid() then raise exception 'The owner cannot change their own role'; end if;
  if not exists(select 1 from public.profiles as p where p.user_id = target_user) then raise exception 'User not found'; end if;
  select pr.role into current_role from public.platform_roles as pr where pr.user_id = target_user;
  if current_role = 'owner' then raise exception 'Owner roles cannot be changed here'; end if;

  if new_role is null or trim(new_role) = '' or new_role = 'user' then
    delete from public.platform_roles as pr where pr.user_id = target_user;
    insert into public.admin_audit_log(actor_id, action, target_user_id, details)
    values(auth.uid(), 'role_removed', target_user, jsonb_build_object('previous_role', current_role));
    return;
  end if;
  if new_role not in ('admin', 'moderator') then raise exception 'Role must be admin or moderator'; end if;

  insert into public.platform_roles(user_id, role, granted_by)
  values(target_user, new_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by;
  insert into public.admin_audit_log(actor_id, action, target_user_id, details)
  values(auth.uid(), 'role_changed', target_user, jsonb_build_object('previous_role', current_role, 'new_role', new_role));
end;
$$;

create or replace function public.ban_platform_user(target_user uuid, submitted_reason text, submitted_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_role text; created_ban uuid; clean_reason text := trim(submitted_reason);
begin
  if not public.is_platform_staff() then raise exception 'Staff access required'; end if;
  if target_user = auth.uid() then raise exception 'You cannot ban your own account'; end if;
  if char_length(clean_reason) < 3 or char_length(clean_reason) > 500 then raise exception 'Ban reasons must contain 3 to 500 characters'; end if;
  if submitted_expires_at is not null and submitted_expires_at <= now() then raise exception 'Ban expiration must be in the future'; end if;
  select pr.role into target_role from public.platform_roles as pr where pr.user_id = target_user;
  if target_role = 'owner' then raise exception 'The platform owner cannot be banned'; end if;
  if target_role in ('admin', 'moderator') and not public.is_platform_owner() then raise exception 'Only the owner can ban staff accounts'; end if;
  if not exists(select 1 from public.profiles as p where p.user_id = target_user) then raise exception 'User not found'; end if;

  update public.moderation_bans as mb set active = false, revoked_by = auth.uid(), revoked_at = now()
  where mb.user_id = target_user and mb.active;
  insert into public.moderation_bans(user_id, reason, expires_at, created_by)
  values(target_user, clean_reason, submitted_expires_at, auth.uid()) returning id into created_ban;
  update public.queue_entries as qe set status = 'cancelled'
  where qe.status = 'searching' and (
    qe.user_id = target_user or qe.party_id in (
      select pm.party_id from public.party_members as pm where pm.user_id = target_user
    )
  );
  update public.parties as p set status = 'open'
  where p.status = 'queued' and p.id in (
    select pm.party_id from public.party_members as pm where pm.user_id = target_user
  );
  insert into public.admin_audit_log(actor_id, action, target_user_id, details)
  values(auth.uid(), 'user_banned', target_user, jsonb_build_object('reason', clean_reason, 'expires_at', submitted_expires_at));
  return created_ban;
end;
$$;

create or replace function public.revoke_platform_ban(target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_role text;
begin
  if not public.is_platform_staff() then raise exception 'Staff access required'; end if;
  select pr.role into target_role from public.platform_roles as pr where pr.user_id = target_user;
  if target_role in ('admin', 'moderator') and not public.is_platform_owner() then raise exception 'Only the owner can unban staff accounts'; end if;
  update public.moderation_bans as mb set active = false, revoked_by = auth.uid(), revoked_at = now()
  where mb.user_id = target_user and mb.active;
  insert into public.admin_audit_log(actor_id, action, target_user_id)
  values(auth.uid(), 'user_unbanned', target_user);
end;
$$;

create or replace function public.review_community_event(target_event uuid, decision text, submitted_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare target public.community_events%rowtype; next_status text; clean_note text := trim(coalesce(submitted_note, ''));
begin
  if not public.is_platform_staff() then raise exception 'Staff access required'; end if;
  if decision not in ('approve', 'reject') then raise exception 'Decision must be approve or reject'; end if;
  if char_length(clean_note) > 500 then raise exception 'Review notes cannot exceed 500 characters'; end if;
  select ce.* into target from public.community_events as ce where ce.id = target_event for update;
  if target.id is null then raise exception 'Event not found'; end if;
  if target.status <> 'pending' then raise exception 'This event has already been reviewed'; end if;
  if decision = 'approve' and target.starts_at <= now() then raise exception 'Expired events cannot be approved'; end if;
  next_status := case decision when 'approve' then 'published' else 'rejected' end;
  update public.community_events as ce set status = next_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(clean_note, '')
  where ce.id = target_event;
  insert into public.admin_audit_log(actor_id, action, target_event_id, details)
  values(auth.uid(), 'event_' || next_status, target_event, jsonb_build_object('note', clean_note));
end;
$$;

create or replace function public.enforce_not_banned()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and public.is_user_banned(auth.uid()) then
    raise exception 'This NEXUS account is banned';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare protected_table text;
begin
  foreach protected_table in array array['chat_messages','parties','party_members','queue_entries','match_disputes','tournament_registrations','community_events'] loop
    execute format('drop trigger if exists enforce_not_banned_write on public.%I', protected_table);
    execute format('create trigger enforce_not_banned_write before insert or update or delete on public.%I for each row execute function public.enforce_not_banned()', protected_table);
  end loop;
end;
$$;

revoke all on table public.platform_roles, public.moderation_bans, public.admin_audit_log from anon, authenticated;
grant select on table public.platform_roles, public.moderation_bans, public.admin_audit_log to authenticated;

revoke execute on function public.is_platform_staff(uuid), public.is_platform_owner(uuid), public.is_user_banned(uuid) from public, anon;
grant execute on function public.is_platform_staff(uuid), public.is_platform_owner(uuid), public.is_user_banned(uuid) to authenticated;
revoke execute on function public.get_my_platform_access(), public.list_admin_users(), public.set_platform_role(uuid, text), public.ban_platform_user(uuid, text, timestamptz), public.revoke_platform_ban(uuid), public.review_community_event(uuid, text, text) from public, anon;
grant execute on function public.get_my_platform_access(), public.list_admin_users(), public.set_platform_role(uuid, text), public.ban_platform_user(uuid, text, timestamptz), public.revoke_platform_ban(uuid), public.review_community_event(uuid, text, text) to authenticated;
