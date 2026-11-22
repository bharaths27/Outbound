-- Run after 006_qr_has_qr.sql, and only once the deployed app reads quests.has_qr
-- (src/lib/data/supabase/index.ts no longer filters on qr_code). Before that, the app's quest list breaks.
--
-- Hides QR codes from the public API, so reading them can't fake a QR check-in.
-- check_in() and quest_of_the_week() run as their owner, so they still see qr_code.
-- Note: with column grants, select("*") on quests fails; select the columns by name.
revoke select on public.quests from anon, authenticated;
grant select (id, station_id, type, title, description, lat, lon, price_tier, vibe_tags, hours, photo_url,
              xp, checkin_radius_m, created_at, duration_min, walk_min, has_qr)
  on public.quests to anon, authenticated;

-- Check (as anon or a signed-in player) that this now fails:  select qr_code from public.quests;
