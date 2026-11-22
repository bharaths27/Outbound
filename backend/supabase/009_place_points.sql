-- 009: points for every restaurant and place on the map, not only quests.
--
-- The map shows XP on restaurants, cafes, parks, museums... from the basemap. Checking in at one
-- calls check_in_place(). Like check_in(), the database checks the player is within 75 m of the
-- place (no demo bypass), allows one check-in per place per day and at most 8 places a day, and
-- adds the XP to profiles.xp. XP is computed here, not trusted from the app:
--   base by kind of place (5..20) + distance (0.8 XP per minute away, up to 40) + budget bonus
--   (free 15, about $10 or less 10, about $25 5, pricier 0), rounded to 5, between 10 and 75.
-- The app shows the same numbers (src/components/map/gamify.ts placePoints).
-- Run once in the Supabase SQL editor. Safe to run again.

create table if not exists public.place_visits (
  id          bigserial primary key,
  user_id     uuid not null references auth.users on delete cascade,
  place_key   text not null,
  name        text not null,
  category    text not null,
  lat         double precision not null,
  lon         double precision not null,
  xp_awarded  int not null,
  visit_date  date not null default (now() at time zone 'America/New_York')::date,
  checked_in_at timestamptz not null default now(),
  unique (user_id, place_key, visit_date)
);
alter table public.place_visits enable row level security;
drop policy if exists "read own place visits" on public.place_visits;
create policy "read own place visits" on public.place_visits for select using (auth.uid() = user_id);
revoke insert, update, delete on public.place_visits from anon, authenticated;
grant select on public.place_visits to authenticated;

create or replace function public.place_points(p_category text, p_minutes int)
returns table (base int, distance_xp int, budget_xp int, total int)
language sql immutable
as $$
  with k as (
    select
      case
        when p_category in ('museum', 'attraction', 'art_gallery', 'theatre', 'zoo', 'aquarium', 'castle', 'monument') then 20
        when p_category in ('park', 'garden', 'viewpoint', 'library', 'place_of_worship', 'music', 'stadium') then 15
        when p_category in ('restaurant', 'bar', 'beer', 'pub', 'cinema') then 10
        else 5 -- cafe, fast_food, bakery, ice_cream, shops
      end as base,
      case
        when p_category in ('park', 'garden', 'viewpoint', 'library', 'place_of_worship', 'monument', 'castle') then 15
        when p_category in ('cafe', 'fast_food', 'bakery', 'ice_cream') then 10
        when p_category in ('restaurant', 'museum', 'art_gallery', 'cinema', 'music') then 5
        else 0 -- bars, theatres, attractions, zoo, aquarium, stadium, shops
      end as budget_xp,
      least(40, round(greatest(0, least(coalesce(p_minutes, 0), 90)) * 0.8))::int as distance_xp
  )
  select base, distance_xp, budget_xp,
         least(75, greatest(10, (round((base + distance_xp + budget_xp) / 5.0) * 5)::int))
  from k;
$$;

create or replace function public.check_in_place(
  p_key text, p_name text, p_category text,
  p_place_lat double precision, p_place_lon double precision,
  p_minutes int, p_lat double precision, p_lon double precision
) returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_dist  double precision;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_pts   record;
begin
  if v_user is null then
    raise exception 'not signed in' using hint = 'NOT_SIGNED_IN';
  end if;
  perform 1 from profiles where id = v_user for update; -- one check-in at a time per player
  if p_key is null or length(p_key) > 200 or p_name is null or length(p_name) > 200 then
    raise exception 'bad place' using hint = 'QUEST_NOT_FOUND';
  end if;
  if p_lat is null or p_lon is null then
    raise exception 'location required' using hint = 'LOCATION_REQUIRED';
  end if;
  v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_place_lat - p_lat) / 2), 2)
    + cos(radians(p_lat)) * cos(radians(p_place_lat)) * power(sin(radians(p_place_lon - p_lon) / 2), 2)));
  if v_dist > 75 then
    raise exception 'too far: % m away (need within % m)', round(v_dist::numeric), 75 using hint = 'TOO_FAR';
  end if;
  if exists (select 1 from place_visits where user_id = v_user and place_key = p_key and visit_date = v_today) then
    raise exception 'already checked in to this place today' using hint = 'ALREADY_CHECKED_IN_TODAY';
  end if;
  if (select count(*) from place_visits where user_id = v_user and visit_date = v_today) >= 8 then
    raise exception 'that is 8 places today, come back tomorrow' using hint = 'DAILY_LIMIT';
  end if;

  select * into v_pts from place_points(p_category, p_minutes);
  insert into place_visits (user_id, place_key, name, category, lat, lon, xp_awarded)
  values (v_user, p_key, left(p_name, 200), left(coalesce(p_category, 'place'), 40), p_place_lat, p_place_lon, v_pts.total);
  update profiles set xp = xp + v_pts.total where id = v_user;

  return json_build_object(
    'xp_awarded', v_pts.total,
    'base', v_pts.base, 'distance_xp', v_pts.distance_xp, 'budget_xp', v_pts.budget_xp,
    'total_xp', (select xp from profiles where id = v_user)
  );
end;
$$;
revoke execute on function public.check_in_place(text, text, text, double precision, double precision, int, double precision, double precision) from public, anon;
grant execute on function public.check_in_place(text, text, text, double precision, double precision, int, double precision, double precision) to authenticated;
