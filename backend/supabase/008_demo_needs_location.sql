-- 008: demo accounts check in by location too.
--
-- check_in() (005_gamification.sql) already refuses a check-in more than checkin_radius_m (75 m)
-- from the quest for every normal player: the location is checked in the database, so tapping
-- Check in from home does nothing. Only accounts with profiles.is_demo = true skipped that check,
-- so the team could demo check-ins from the judging table.
--
-- Run this to make the demo accounts follow the same rule (QR quests still work by code, e.g. the
-- BostonHacks expo quest). Safe to run more than once.
update public.profiles set is_demo = false where is_demo;

-- To undo (let demo accounts check in anywhere again, e.g. for a remote demo):
--   update public.profiles set is_demo = true
--   where id in (select id from auth.users where email like 'outbound-demo%');
