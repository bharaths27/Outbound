-- 010: Host (BU Spark! track). Students and clubs publish events (a party, a study jam, a club
-- night...) with a description, food (free / cheap / paid / none) and prizes. Published events
-- show on the map and on the Host page for everyone.
--
-- Anyone signed in can publish; only the host can delete their own event. Everyone (signed in or
-- not) can read events that haven't ended more than a day ago. Run once in the Supabase SQL editor.
-- Safe to run again.

create table if not exists public.hosted_events (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid references auth.users on delete cascade,
  host_name   text not null check (length(host_name) between 1 and 80),
  title       text not null check (length(title) between 3 and 100),
  kind        text not null check (kind in ('party', 'social', 'food', 'study', 'sports', 'music', 'workshop', 'other')),
  description text not null default '' check (length(description) <= 1000),
  food        text not null default 'none' check (food in ('free', 'cheap', 'paid', 'none')),
  prizes      text check (length(prizes) <= 200),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  place_name  text not null check (length(place_name) between 2 and 120),
  lat         double precision not null check (lat between 42.0 and 42.7),
  lon         double precision not null check (lon between -71.6 and -70.7),
  station_id  text references public.stations(id),
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at and ends_at < starts_at + interval '3 days')
);

alter table public.hosted_events enable row level security;

drop policy if exists "read current events" on public.hosted_events;
create policy "read current events" on public.hosted_events
  for select using (ends_at > now() - interval '1 day');

drop policy if exists "publish as yourself" on public.hosted_events;
create policy "publish as yourself" on public.hosted_events
  for insert to authenticated with check (host_id = auth.uid());

drop policy if exists "delete your own" on public.hosted_events;
create policy "delete your own" on public.hosted_events
  for delete to authenticated using (host_id = auth.uid());

grant select on public.hosted_events to anon, authenticated;
grant insert, delete on public.hosted_events to authenticated;

-- The example: BU Spark!'s demo night, happening now (from the top of this hour, for 12 hours).
insert into public.hosted_events (host_id, host_name, title, kind, description, food, prizes, starts_at, ends_at, place_name, lat, lon, station_id)
select null, 'BU Spark!', 'Spark! Demo Night', 'party',
  'Student teams show what they built this semester. Meet people from other schools, try the demos, vote for your favorite.',
  'free', 'Raffle: headphones and Spark! swag',
  date_trunc('hour', now()), date_trunc('hour', now()) + interval '12 hours',
  'BU Spark!, 665 Commonwealth Ave', 42.3505, -71.1035, 'place-bucen'
where not exists (select 1 from public.hosted_events where title = 'Spark! Demo Night' and host_id is null and ends_at > now());
