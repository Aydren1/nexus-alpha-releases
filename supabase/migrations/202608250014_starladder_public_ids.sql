alter table public.matches
  alter column public_id set default ('SL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));

alter table public.community_events
  alter column public_id set default ('SL-EVT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));

comment on column public.matches.public_id is
  'Public STARLADDER match identifier. Existing NX-prefixed alpha identifiers remain valid.';

comment on column public.community_events.public_id is
  'Public STARLADDER community-event identifier. Existing NX-prefixed alpha identifiers remain valid.';
