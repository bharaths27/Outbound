-- T Quest: Supabase schema
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Safe to re-run: it drops and recreates the T Quest objects (NOT auth users).

-- ============ CLEAN SLATE (only T Quest objects) ============
drop view if exists public.leaderboard_weekly cascade;
drop view if exists public.passport cascade;
drop function if exists public.check_in(text, double precision, double precision, text, uuid) cascade;
drop function if exists public.handle_new_user() cascade;
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.friends, public.squad_members, public.squads, public.visits,
  public.deals, public.quests, public.stations, public.profiles, public.schools cascade;

-- ============ CONTENT TABLES (Suki fills these) ============
create table public.schools (
  id           serial primary key,
  name         text not null,
  email_domain text not null unique,      -- e.g. bu.edu (lowercase)
  color        text default '#CC0000'
);

create table public.stations (
  id           text primary key,          -- MBTA parent stop id, e.g. place-kencl
  name         text not null,
  lines        text[] not null,           -- e.g. {Green-B,Green-C,Green-D}
  lat          double precision not null,
  lon          double precision not null,
  neighborhood text not null,
  story        text                       -- short stop story (Gemini-polished, facts from Suki)
);

create table public.quests (
  id               text primary key,      -- e.g. kenmore-citgo-scenic
  station_id       text not null references public.stations(id) on delete cascade,
  type             text not null check (type in ('food','event','scenic')),
  title            text not null,
  description      text,
  lat              double precision not null,
  lon              double precision not null,
  price_tier       int not null default 0 check (price_tier between 0 and 3), -- 0 free .. 3 splurge
  vibe_tags        text[] default '{}',
  hours            text,                  -- "always", "HH:MM-HH:MM", or per day "Mon-Thu 09:00-20:00; Sat,Sun 10:00-14:00" (Boston time)
  photo_url        text,
  xp               int not null default 50,
  checkin_radius_m int not null default 75,
  qr_code          text unique,           -- set for event quests checked in by QR
  created_at       timestamptz default now()
);

create table public.deals (
  id        serial primary key,
  quest_id  text references public.quests(id) on delete cascade,
  text      text not null,                -- e.g. "SAMPLE: 10% off with student ID"
  is_sample boolean not null default true
);

-- ============ USER TABLES ============
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  school_id    int not null references public.schools(id),
  display_name text,
  avatar_url   text,
  xp           int not null default 0,
  privacy      text not null default 'friends' check (privacy in ('public','friends','ghost')),
  created_at   timestamptz default now()
);

create table public.squads (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique default upper(substr(md5(random()::text), 1, 6)),
  name       text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

create table public.squad_members (
  squad_id  uuid references public.squads(id) on delete cascade,
  user_id   uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (squad_id, user_id)
);

create table public.visits (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  quest_id      text not null references public.quests(id) on delete cascade,
  squad_id      uuid references public.squads(id) on delete set null,
  checked_in_at timestamptz not null default now(),
  visit_date    date not null default (now() at time zone 'America/New_York')::date,
  xp_awarded    int not null default 0,
  cross_school  boolean not null default false,
  hidden        boolean not null default false,
  unique (user_id, quest_id, visit_date)             -- one check-in per quest per day
);

create table public.friends (
  user_id    uuid references public.profiles(id) on delete cascade,
  friend_id  uuid references public.profiles(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create index on public.visits (user_id);
create index on public.visits (quest_id, checked_in_at);
create index on public.quests (station_id);

-- ============ SCHOOL-EMAIL SIGN-UP GATE ============
-- Runs when someone signs up. Unknown email domain => sign-up fails.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_school int;
  v_domain text := lower(split_part(new.email, '@', 2));
begin
  -- also accept subdomains like g.harvard.edu or husky.neu.edu
  select id into v_school from public.schools
   where v_domain = email_domain or v_domain like '%.' || email_domain
   order by length(email_domain) desc limit 1;
  if v_school is null then
    raise exception 'T Quest is only open to students with a supported school email (got %)', v_domain;
  end if;
  insert into public.profiles (id, email, school_id, display_name)
  values (new.id, new.email, v_school, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ CHECK-IN (all game rules run here, server-side) ============
-- Frontend calls: supabase.rpc('check_in', { p_quest_id, p_lat, p_lon, p_qr, p_squad_id })
-- XP rules (Suki can tune the numbers below):
--   base = quest.xp
--   +25 first time ever at this quest
--   +25 first quest in a new neighborhood
--   +20% if done with a squad
--   x2 if a squad member from a DIFFERENT school checked in to the same quest in the last 60 min
create or replace function public.check_in(
  p_quest_id text,
  p_lat      double precision default null,
  p_lon      double precision default null,
  p_qr       text default null,
  p_squad_id uuid default null
) returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_school  int;
  q         public.quests%rowtype;
  v_hood    text;
  v_dist    double precision;
  v_xp      int;
  v_first   boolean;
  v_newhood boolean;
  v_cross   boolean := false;
  v_tier    text;
  v_count   int;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  select school_id into v_school from profiles where id = v_user;

  select * into q from quests where id = p_quest_id;
  if not found then raise exception 'quest not found'; end if;
  select neighborhood into v_hood from stations where id = q.station_id;

  -- location or QR proof
  if p_qr is not null then
    if q.qr_code is distinct from p_qr then
      raise exception 'QR code does not match this quest';
    end if;
  else
    if p_lat is null or p_lon is null then
      raise exception 'location required';
    end if;
    -- haversine distance in meters
    v_dist := 2 * 6371000 * asin(sqrt(
        power(sin(radians(q.lat - p_lat) / 2), 2)
      + cos(radians(p_lat)) * cos(radians(q.lat)) * power(sin(radians(q.lon - p_lon) / 2), 2)));
    if v_dist > q.checkin_radius_m then
      raise exception 'too far: % m away (need within % m)', round(v_dist::numeric), q.checkin_radius_m;
    end if;
  end if;

  -- squad membership check
  if p_squad_id is not null and not exists (
       select 1 from squad_members where squad_id = p_squad_id and user_id = v_user) then
    raise exception 'you are not in that squad';
  end if;

  if exists (select 1 from visits where user_id = v_user and quest_id = q.id
             and visit_date = (now() at time zone 'America/New_York')::date) then
    raise exception 'already checked in to this quest today';
  end if;

  v_first := not exists (select 1 from visits where user_id = v_user and quest_id = q.id);
  v_newhood := not exists (
    select 1 from visits vi join quests qq on qq.id = vi.quest_id
    join stations s on s.id = qq.station_id
    where vi.user_id = v_user and s.neighborhood = v_hood);

  if p_squad_id is not null then
    v_cross := exists (
      select 1 from visits vi join profiles p on p.id = vi.user_id
      where vi.squad_id = p_squad_id and vi.quest_id = q.id
        and vi.user_id <> v_user and p.school_id <> v_school
        and vi.checked_in_at > now() - interval '60 minutes');
  end if;

  v_xp := q.xp
        + case when v_first   then 25 else 0 end
        + case when v_newhood then 25 else 0 end;
  if p_squad_id is not null then v_xp := round(v_xp * 1.2); end if;
  if v_cross then v_xp := v_xp * 2; end if;

  insert into visits (user_id, quest_id, squad_id, xp_awarded, cross_school)
  values (v_user, q.id, p_squad_id, v_xp, v_cross);

  -- the earlier squad-mate also gets the cross-school gold border
  if v_cross then
    update visits vi set cross_school = true
    from profiles p
    where p.id = vi.user_id and vi.squad_id = p_squad_id and vi.quest_id = q.id
      and vi.user_id <> v_user and p.school_id <> v_school
      and vi.checked_in_at > now() - interval '60 minutes';
  end if;

  update profiles set xp = xp + v_xp where id = v_user;

  select count(distinct vi.quest_id) into v_count
  from visits vi join quests qq on qq.id = vi.quest_id join stations s on s.id = qq.station_id
  where vi.user_id = v_user and s.neighborhood = v_hood;
  v_tier := case when v_count >= 5 then 'gold' when v_count >= 3 then 'silver' else 'bronze' end;

  return json_build_object(
    'xp_awarded', v_xp,
    'first_visit', v_first,
    'new_neighborhood', v_newhood,
    'cross_school', v_cross,
    'neighborhood', v_hood,
    'neighborhood_quests', v_count,
    'tier', v_tier,
    'total_xp', (select xp from profiles where id = v_user));
end;
$$;

grant execute on function public.check_in(text, double precision, double precision, text, uuid) to authenticated;

-- ============ PASSPORT (tier per neighborhood) ============
-- Tiers: bronze 1-2 quests, silver 3-4, gold 5+ in a neighborhood.
create or replace view public.passport as
select vi.user_id,
       s.neighborhood,
       count(distinct vi.quest_id)                       as quests_done,
       case when count(distinct vi.quest_id) >= 5 then 'gold'
            when count(distinct vi.quest_id) >= 3 then 'silver'
            else 'bronze' end                            as tier,
       bool_or(vi.cross_school)                          as has_cross_school_stamp,
       json_agg(json_build_object('quest_id', vi.quest_id, 'at', vi.checked_in_at,
                                  'cross_school', vi.cross_school)
                order by vi.checked_in_at)               as stamps
from public.visits vi
join public.quests q  on q.id = vi.quest_id
join public.stations s on s.id = q.station_id
group by vi.user_id, s.neighborhood;

-- ============ WEEKLY SCHOOL LEADERBOARD ============
-- Resets every Monday (America/New_York). Schools need 5+ active players to rank.
create or replace view public.leaderboard_weekly as
select sc.id as school_id, sc.name, sc.color,
       coalesce(sum(vi.xp_awarded), 0)::int as weekly_xp,
       count(distinct vi.user_id)::int       as players,
       count(distinct vi.user_id) >= 5       as eligible
from public.schools sc
left join public.profiles p on p.school_id = sc.id
left join public.visits vi on vi.user_id = p.id
  and vi.checked_in_at >= date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York'
group by sc.id, sc.name, sc.color
order by eligible desc, weekly_xp desc;

-- ============ ROW-LEVEL SECURITY ============
alter table public.schools       enable row level security;
alter table public.stations      enable row level security;
alter table public.quests        enable row level security;
alter table public.deals         enable row level security;
alter table public.profiles      enable row level security;
alter table public.visits        enable row level security;
alter table public.squads        enable row level security;
alter table public.squad_members enable row level security;
alter table public.friends       enable row level security;

-- content: anyone can read
create policy "read schools"  on public.schools  for select using (true);
create policy "read stations" on public.stations for select using (true);
create policy "read quests"   on public.quests   for select using (true);
create policy "read deals"    on public.deals    for select using (true);

-- helper: are two users accepted friends?
create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friends
    where status = 'accepted'
      and ((user_id = a and friend_id = b) or (user_id = b and friend_id = a)));
$$;

-- profiles: you, public profiles, or friends (ghost = only you)
create policy "read profiles" on public.profiles for select using (
  id = auth.uid()
  or privacy = 'public'
  or (privacy = 'friends' and public.are_friends(auth.uid(), id)));
create policy "update own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- visits: inserted only through check_in(); you can hide/unhide your own
create policy "read visits" on public.visits for select using (
  user_id = auth.uid()
  or (not hidden and exists (select 1 from profiles p where p.id = user_id and (
        p.privacy = 'public'
        or (p.privacy = 'friends' and public.are_friends(auth.uid(), p.id))))));
create policy "hide own visits" on public.visits for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- squads
create policy "read squads" on public.squads for select using (auth.uid() is not null);
create policy "create squad" on public.squads for insert with check (created_by = auth.uid());
create policy "read squad members" on public.squad_members for select using (auth.uid() is not null);
create policy "join squad" on public.squad_members for insert with check (user_id = auth.uid());
create policy "leave squad" on public.squad_members for delete using (user_id = auth.uid());

-- friends
create policy "read own friendships" on public.friends for select
  using (user_id = auth.uid() or friend_id = auth.uid());
create policy "send request" on public.friends for insert with check (user_id = auth.uid());
create policy "accept request" on public.friends for update
  using (friend_id = auth.uid()) with check (friend_id = auth.uid());
create policy "remove friendship" on public.friends for delete
  using (user_id = auth.uid() or friend_id = auth.uid());

-- ============ STARTER SCHOOLS (edit freely) ============
insert into public.schools (name, email_domain, color) values
  ('Boston University',      'bu.edu',            '#CC0000'),
  ('Northeastern',           'northeastern.edu',  '#D41B2C'),
  ('MIT',                    'mit.edu',           '#A31F34'),
  ('Harvard',                'harvard.edu',       '#A51C30'),
  ('Tufts',                  'tufts.edu',         '#3E8EDE'),
  ('Emerson',                'emerson.edu',       '#6C2C91'),
  ('Suffolk',                'suffolk.edu',       '#1D4F91'),
  ('Boston College',         'bc.edu',            '#8A100B'),
  ('UMass Boston',           'umb.edu',           '#005A8B'),
  ('Berklee',                'berklee.edu',       '#000000'),
  ('Wentworth',              'wit.edu',           '#A6192E'),
  ('Simmons',                'simmons.edu',       '#003F6F'),
  ('Mass College of Art',    'massart.edu',       '#E4002B');
