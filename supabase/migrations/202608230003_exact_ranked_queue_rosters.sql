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

revoke execute on function public.create_or_get_party(public.queue_format) from public, anon;
revoke execute on function public.queue_current_party(uuid, public.queue_format, text) from public, anon;
grant execute on function public.create_or_get_party(public.queue_format) to authenticated;
grant execute on function public.queue_current_party(uuid, public.queue_format, text) to authenticated;
