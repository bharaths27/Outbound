-- Run after 005_gamification.sql. Safe to run any time: adds quests.has_qr and makes QR codes uppercase.
-- Step 1 of 2 for hiding QR codes. Step 2 (007_hide_qr_codes.sql) runs after the app reads has_qr.

-- The app asks "which quests need a code?" with has_qr, never with the code itself.
alter table public.quests
  add column if not exists has_qr boolean generated always as (qr_code is not null) stored;

-- Codes are compared exactly in check_in(). The app sends what the player typed in capitals,
-- so keep every stored code uppercase and trimmed (e.g. OUTBOUND-EXPO).
update public.quests set qr_code = upper(trim(qr_code))
where qr_code is not null and qr_code <> upper(trim(qr_code));
do $$ begin
  alter table public.quests add constraint quests_qr_code_upper check (qr_code is null or qr_code = upper(trim(qr_code)));
exception when duplicate_object then null; end $$;

comment on column public.quests.hours is
  'Opening hours in Boston time: "always", "HH:MM-HH:MM" (24 h; an end before the start closes the next day), '
  'or per day like "Mon-Thu 09:00-20:00; Sat,Sun 10:00-14:00" (see content/README.md). Text, so no migration.';
