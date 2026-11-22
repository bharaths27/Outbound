-- Outbound: migration 002 (answers Angie's frontend requests)
-- Run AFTER schema.sql: Supabase > SQL Editor > New query > paste > Run. Safe to re-run.
--
--  1. quests.duration_min + quests.walk_min (for the "I have N min" filter)
--  2. profiles.is_demo: demo accounts can check in without being at the spot
--  3. squad_member_profiles view: name, avatar, school of everyone in YOUR squads
--  5. passport view: next_tier + quests_to_next_tier
--  6. profiles.level + profiles.xp_to_next_level (250 XP per level)
--  7. check_in() returns xp_breakdown
--  8. check_in() errors carry a stable code in error.hint
-- 10. sign-up error says Outbound

-- ---------- 1. time filter columns ----------
alter table public.quests add column if not exists duration_min int not null default 30; -- time spent at the spot
alter table public.quests add column if not exists walk_min     int not null default 5;  -- walk from the station, one way
-- Frontend rule: ride_min (to station) + 2 * walk_min + duration_min <= minutes available

-- ---------- 2. demo accounts ----------
alter table public.profiles add column if not exists is_demo boolean not null default false;
-- Mark demo accounts after they sign up, e.g.:
--   update public.profiles set is_demo = true where email in ('demo1@bu.edu','demo2@northeastern.edu');

-- ---------- 6. levels ----------
alter table public.profiles drop column if exists level;
alter table public.profiles drop column if exists xp_to_next_level;
alter table public.profiles add column level int generated always as (xp / 250 + 1) stored;
alter table public.profiles add column xp_to_next_level int generated always as (250 - xp % 250) stored;

-- ---------- 10. sign-up error text ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_school int;
  v_domain text := lower(split_part(new.email, '@', 2));
begin
  select id into v_school from public.schools
   where v_domain = email_domain or v_domain like '%.' || email_domain
   order by length(email_domain) desc limit 1;
  if v_school is null then
    raise exception 'Outbound is only open to students with a supported school email (got %)', v_domain
      using hint = 'SCHOOL_NOT_SUPPORTED';
  end if;
  insert into public.profiles (id, email, school_id, display_name)
  values (new.id, new.email, v_school, split_part(new.email, '@', 1));
  return new;
end;
$$;

-- ---------- 2, 7, 8. check_in ----------
-- Error codes (read error.hint in supabase-js; messages may change, codes won't):
--   NOT_SIGNED_IN, QUEST_NOT_FOUND, QR_MISMATCH, LOCATION_REQUIRED, TOO_FAR,
--   NOT_IN_SQUAD, ALREADY_CHECKED_IN_TODAY
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
  select school_id, is_demo into v_school, v_demo from profiles where id = v_user;

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

-- ---------- 5. passport with next tier ----------
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
                order by vi.checked_in_at)               as stamps,
       case when count(distinct vi.quest_id) >= 5 then null
            when count(distinct vi.quest_id) >= 3 then 'gold'
            else 'silver' end                            as next_tier,
       case when count(distinct vi.quest_id) >= 5 then 0
            when count(distinct vi.quest_id) >= 3 then 5 - count(distinct vi.quest_id)
            else 3 - count(distinct vi.quest_id) end::int as quests_to_next_tier
from public.visits vi
join public.quests q  on q.id = vi.quest_id
join public.stations s on s.id = q.station_id
group by vi.user_id, s.neighborhood;

-- ---------- 3. squad members you can see ----------
-- Everyone in any squad you belong to, regardless of friend/privacy settings.
create or replace view public.squad_member_profiles as
select sm.squad_id,
       p.id           as user_id,
       p.display_name,
       p.avatar_url,
       p.school_id,
       sc.name        as school_name,
       sc.color       as school_color,
       sm.joined_at
from public.squad_members sm
join public.profiles p on p.id = sm.user_id
join public.schools sc on sc.id = p.school_id
where sm.squad_id in (select squad_id from public.squad_members where user_id = auth.uid());

grant select on public.squad_member_profiles to authenticated;
