-- Outbound: migration 003 (privacy fix). Run AFTER 002. Safe to re-run.
--
-- Views in Supabase run as their owner by default, which skips row-level security.
-- That let anyone with the public key read every player's passport stamps
-- (which quest, and when), including ghost-mode players and hidden visits.
-- security_invoker makes the passport view follow the visits privacy rules:
-- you see your own stamps, public players' stamps, and friends' stamps.
alter view public.passport set (security_invoker = true);

-- squad_member_profiles stays owner-run on purpose (it shows squad-mates regardless
-- of privacy, filtered to your squads by auth.uid()). Logged-out users get nothing.
revoke all on public.squad_member_profiles from anon;
-- leaderboard_weekly stays owner-run: it only shows per-school totals, no individual players.
