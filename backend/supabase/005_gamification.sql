-- Run after 004_api_grants.sql.
begin;

-- Only the check-in function may change earned XP or check-in evidence.
revoke update on public.profiles, public.visits from public, anon, authenticated;
grant update (display_name, avatar_url, privacy) on public.profiles to authenticated;
grant update (hidden) on public.visits to authenticated;

create index if not exists visits_squad_checked_in_idx
  on public.visits (squad_id, checked_in_at) where squad_id is not null;
create index if not exists visits_date_idx on public.visits (visit_date);

-- Return only an achievement flag. Teammates' private visits can count
-- toward a shared outing without exposing their times, quests or identities.

create or replace function public.has_squad_goals()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.visits mine
    join public.quests q on q.id = mine.quest_id
    join public.visits start_visit on start_visit.squad_id = mine.squad_id
      and start_visit.checked_in_at between mine.checked_in_at - interval '60 minutes' and mine.checked_in_at
    join public.quests start_quest on start_quest.id = start_visit.quest_id
      and start_quest.station_id = q.station_id
    join public.visits teammate on teammate.squad_id = mine.squad_id
      and teammate.checked_in_at between start_visit.checked_in_at and start_visit.checked_in_at + interval '60 minutes'
    join public.quests teammate_quest on teammate_quest.id = teammate.quest_id
      and teammate_quest.station_id = q.station_id
    where mine.user_id = (select auth.uid())
    group by mine.id, start_visit.id
    having count(distinct teammate.user_id) >= 3
  );
$$;

-- Compute achievements from visit history, including visits before this migration.
-- Only the signed-in player can request their progress.
create or replace function public.my_game_progress()
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with my_visits as (
    select v.*, s.id as station_id, s.lines, s.neighborhood
    from public.visits v
    join public.quests q on q.id = v.quest_id
    join public.stations s on s.id = q.station_id
    where v.user_id = (select auth.uid())
  ), days as (
    select distinct visit_date from my_visits
    where visit_date <= (now() at time zone 'America/New_York')::date
  ), streaks as (
    select max(visit_date) as last_day, count(*)::int as days
    from (
      select visit_date, visit_date - row_number() over (order by visit_date)::int as island
      from days
    ) d
    group by island
  ), lines_visited as (
    select distinct split_part(line, '-', 1) as color
    from my_visits cross join lateral unnest(lines) as line
  )
  select jsonb_build_object(
    'badges', to_jsonb(array_remove(array[
      case when (select count(*) from lines_visited where color in ('Red', 'Orange', 'Green')) = 3
        then 'line_collector' end,
      case when exists (select 1 from my_visits
        where (checked_in_at at time zone 'America/New_York')::time >= time '22:00')
        then 'night_owl' end,
      case when public.has_squad_goals() then 'squad_goals' end,
      case when exists (select 1 from my_visits
        group by date_trunc('week', visit_date::timestamp)
        having count(distinct neighborhood) >= 4)
        then 'cross_town' end
    ], null)),
    'current_streak', coalesce((select days from streaks
      where last_day >= (now() at time zone 'America/New_York')::date - 1
      order by last_day desc limit 1), 0),
    'longest_streak', coalesce((select max(days) from streaks), 0)
  );
$$;

-- Return only an achievement flag. Teammates' private visits can count
-- toward a shared outing without exposing their times, quests or identities.
revoke all on function public.has_squad_goals(), public.my_game_progress() from public, anon;
grant execute on function public.has_squad_goals(), public.my_game_progress() to authenticated;

-- Rank public players by XP from visible visits, with no email or visit details.
create or replace view public.leaderboard_players_weekly as
select p.id as user_id, coalesce(nullif(p.display_name, ''), 'Outbound player') as display_name,
       p.avatar_url, s.name as school_name, sum(v.xp_awarded)::bigint as weekly_xp,
       rank() over (order by sum(v.xp_awarded) desc) as rank
from public.visits v
join public.profiles p on p.id = v.user_id
join public.schools s on s.id = p.school_id
where p.privacy = 'public'
  and not v.hidden
  and v.visit_date >= date_trunc('week', now() at time zone 'America/New_York')::date
  and v.visit_date <= (now() at time zone 'America/New_York')::date
group by p.id, s.id;
revoke all on public.leaderboard_players_weekly from public, anon, authenticated;
grant select on public.leaderboard_players_weekly to anon, authenticated;

-- Weekly game data is written only through the RPCs below.
create table if not exists public.quest_recommendations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id text not null references public.quests(id) on delete cascade,
  week_start date not null,
  primary key (user_id, quest_id, week_start)
);
create index if not exists quest_recommendations_week_idx
  on public.quest_recommendations (week_start, quest_id);

create table if not exists public.featured_quests (
  week_start date primary key,
  quest_id text not null references public.quests(id)
);
alter table public.quest_recommendations enable row level security;
alter table public.featured_quests enable row level security;
revoke all on public.quest_recommendations, public.featured_quests
  from public, anon, authenticated;

create or replace function public.quest_of_the_week()
returns table (quest_id text, week_start date, base_xp_multiplier int)
language plpgsql security definer set search_path = ''
as $$
declare
  v_week date := date_trunc('week', now() at time zone 'America/New_York')::date;
begin
  if not exists (select 1 from public.featured_quests f where f.week_start = v_week) then
    insert into public.featured_quests (week_start, quest_id)
    select v_week, q.id
    from public.quests q
    left join public.quest_recommendations r
      on r.quest_id = q.id and r.week_start = v_week - 7
    where q.qr_code is null and q.xp > 0
    group by q.id
    order by count(r.user_id) desc, q.id
    limit 1
    on conflict on constraint featured_quests_pkey do nothing;
  end if;
  return query select f.quest_id, f.week_start, 2
    from public.featured_quests f where f.week_start = v_week;
end;
$$;

create or replace function public.recommend_quest(p_quest_id text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_week date := date_trunc('week', now() at time zone 'America/New_York')::date;
begin
  if v_user is null or not exists (
    select 1 from public.visits v
    where v.user_id = v_user and v.quest_id = p_quest_id
      and v.visit_date >= v_week and v.visit_date < v_week + 7
  ) then
    raise exception 'A check-in this week is required to recommend this quest';
  end if;
  insert into public.quest_recommendations values (v_user, p_quest_id, v_week)
  on conflict do nothing;
end;
$$;

revoke all on function public.quest_of_the_week(), public.recommend_quest(text) from public, anon;
grant execute on function public.quest_of_the_week() to anon, authenticated;
grant execute on function public.recommend_quest(text) to authenticated;

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
  v_demo    boolean;
  q         public.quests%rowtype;
  v_hood    text;
  v_dist    double precision;
  v_xp      int;
  v_first   boolean;
  v_newhood boolean;
  v_cross   boolean := false;
  v_tier    text;
  v_count   int;
  v_parts   json[] := '{}';
  v_sub     int;
begin
  if v_user is null then
    raise exception 'not signed in' using hint = 'NOT_SIGNED_IN';
  end if;
  -- Serialize a player's check-ins so first-visit and neighborhood bonuses cannot race.
  select school_id, is_demo into v_school, v_demo from profiles where id = v_user for update;

  select * into q from quests where id = p_quest_id;
  if not found then raise exception 'quest not found' using hint = 'QUEST_NOT_FOUND'; end if;
  select neighborhood into v_hood from stations where id = q.station_id;

  if p_qr is not null then
    if q.qr_code is distinct from p_qr then
      raise exception 'QR code does not match this quest' using hint = 'QR_MISMATCH';
    end if;
  elsif not coalesce(v_demo, false) then
    if p_lat is null or p_lon is null then
      raise exception 'location required' using hint = 'LOCATION_REQUIRED';
    end if;
    v_dist := 2 * 6371000 * asin(sqrt(
        power(sin(radians(q.lat - p_lat) / 2), 2)
      + cos(radians(p_lat)) * cos(radians(q.lat)) * power(sin(radians(q.lon - p_lon) / 2), 2)));
    if v_dist > q.checkin_radius_m then
      raise exception 'too far: % m away (need within % m)', round(v_dist::numeric), q.checkin_radius_m
        using hint = 'TOO_FAR';
    end if;
  end if;

  if p_squad_id is not null and not exists (
       select 1 from squad_members where squad_id = p_squad_id and user_id = v_user) then
    raise exception 'you are not in that squad' using hint = 'NOT_IN_SQUAD';
  end if;

  if exists (select 1 from visits where user_id = v_user and quest_id = q.id
             and visit_date = (now() at time zone 'America/New_York')::date) then
    raise exception 'already checked in to this quest today' using hint = 'ALREADY_CHECKED_IN_TODAY';
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

  -- XP, with a breakdown entry per reason
  v_xp := q.xp;
  v_parts := v_parts || json_build_object('reason', 'base', 'xp', q.xp);
  if v_first then
    v_xp := v_xp + 25;
    v_parts := v_parts || json_build_object('reason', 'first_visit', 'xp', 25);
  end if;
  if v_newhood then
    v_xp := v_xp + 25;
    v_parts := v_parts || json_build_object('reason', 'new_neighborhood', 'xp', 25);
  end if;
  if p_squad_id is not null then
    v_sub := round(v_xp * 0.2);
    v_xp := v_xp + v_sub;
    v_parts := v_parts || json_build_object('reason', 'squad', 'xp', v_sub);
  end if;
  if v_cross then
    v_parts := v_parts || json_build_object('reason', 'cross_school', 'xp', v_xp);
    v_xp := v_xp * 2;
  end if;

  -- Add the weekly bonus after regular bonuses to double base XP only.
  if exists (
    select 1 from public.quest_of_the_week() featured
    where featured.quest_id = q.id and not exists (
      select 1 from public.visits v
      where v.user_id = v_user and v.quest_id = q.id
        and v.visit_date >= featured.week_start and v.visit_date < featured.week_start + 7
    )
  ) then
    v_xp := v_xp + q.xp;
    v_parts := v_parts || json_build_object('reason', 'quest_of_the_week', 'xp', q.xp);
  end if;

  insert into visits (user_id, quest_id, squad_id, xp_awarded, cross_school)
  values (v_user, q.id, p_squad_id, v_xp, v_cross);

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

  return (
    select json_build_object(
      'xp_awarded', v_xp,
      'xp_breakdown', array_to_json(v_parts),
      'first_visit', v_first,
      'new_neighborhood', v_newhood,
      'cross_school', v_cross,
      'neighborhood', v_hood,
      'neighborhood_quests', v_count,
      'tier', v_tier,
      'next_tier', case when v_count >= 5 then null when v_count >= 3 then 'gold' else 'silver' end,
      'quests_to_next_tier', case when v_count >= 5 then 0 when v_count >= 3 then 5 - v_count else 3 - v_count end,
      'total_xp', p.xp,
      'level', p.level,
      'xp_to_next_level', p.xp_to_next_level)
    from profiles p where p.id = v_user);
end;
$$;

grant execute on function public.check_in(text, double precision, double precision, text, uuid) to authenticated;

revoke execute on function public.check_in(text, double precision, double precision, text, uuid) from public, anon;

commit;
