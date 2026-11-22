-- Outbound: migration 004 (API access). Run AFTER 003. Safe to re-run.
--
-- This Supabase project doesn't grant table access to its API roles automatically,
-- so the website (anon / authenticated) and scripts (service_role) got
-- "permission denied for table ...". These grants open the doors;
-- row-level security still decides which rows each user can see or change.

grant usage on schema public to anon, authenticated, service_role;

-- Public game content: anyone can read (logged in or not)
grant select on public.schools, public.stations, public.quests, public.deals,
                public.leaderboard_weekly
  to anon, authenticated;

-- Player data: logged-in users only (RLS limits rows)
grant select on public.profiles, public.visits, public.squads, public.squad_members,
                public.friends, public.passport, public.squad_member_profiles
  to authenticated;
grant update on public.profiles, public.visits to authenticated;            -- edit own profile, hide own visits
grant insert on public.squads, public.squad_members, public.friends to authenticated;
grant delete on public.squad_members, public.friends to authenticated;      -- leave squad, unfriend
grant update on public.friends to authenticated;                            -- accept request
-- visits are only inserted through check_in(), never directly

-- Functions used by the app and by RLS policies
grant execute on function public.check_in(text, double precision, double precision, text, uuid) to authenticated;
grant execute on function public.are_friends(uuid, uuid) to anon, authenticated;

-- Server-side scripts (secret key): full access, bypasses RLS
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
