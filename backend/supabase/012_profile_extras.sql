-- Outbound: migration 012 (profile extras + security). Run AFTER 011. Safe to re-run.
--
-- Discord-style profile: grad year, short bio, banner, profile photo, private notes on other
-- players. Also locks down which profile columns a player may edit.
--
-- ALSO DO IN THE SUPABASE DASHBOARD (can't be set from SQL):
--   1. Authentication → Sign In / Providers → Email: turn ON "Confirm email". Without it anyone
--      can sign up as any @bu.edu address without owning that inbox.
--   2. Authentication → Policies → Password: minimum length 8, require lowercase, uppercase,
--      and digits or symbols (matches src/features/auth/password-rules.ts). Turn on leaked
--      password protection if your plan has it.
--   3. Authentication → Sign In / Providers → Google: enable, add the OAuth client from Google
--      Cloud, and add https://outboundwith.us/auth/callback to the redirect URLs. Non-school
--      Google accounts are rejected by handle_new_user() below anyway.

alter table public.profiles add column if not exists grad_year smallint check (grad_year between 2020 and 2040);
alter table public.profiles add column if not exists bio text check (length(bio) <= 160);
alter table public.profiles add column if not exists banner text check (banner ~ '^[a-z-]{1,24}$');

-- Players may edit only these columns (xp, level, school_id, is_demo, email stay server-only).
revoke update on public.profiles from public, anon, authenticated;
grant update (display_name, avatar_url, privacy, grad_year, bio, banner) on public.profiles to authenticated;

-- avatar_url must point at our own storage bucket (or be cleared), so nobody can hot-link
-- or track viewers through a third-party image URL.
create or replace function public.check_avatar_url() returns trigger
language plpgsql as $$
begin
  if new.avatar_url is not null and new.avatar_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/' then
    raise exception 'avatar must be uploaded through Outbound' using hint = 'BAD_AVATAR';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_avatar_url on public.profiles;
create trigger profiles_avatar_url before insert or update of avatar_url on public.profiles
  for each row execute function public.check_avatar_url();

-- Private notes on other players. Only the writer can ever read them.
create table if not exists public.user_notes (
  owner_id   uuid references public.profiles(id) on delete cascade,
  subject_id uuid references public.profiles(id) on delete cascade,
  text       text not null check (length(text) between 1 and 500),
  updated_at timestamptz not null default now(),
  primary key (owner_id, subject_id)
);
alter table public.user_notes enable row level security;
drop policy if exists "own notes" on public.user_notes;
create policy "own notes" on public.user_notes for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.user_notes from anon;
grant select, insert, update, delete on public.user_notes to authenticated;

-- Profile photos: public bucket, 2 MB, images only; each player writes only their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

drop policy if exists "avatar read" on storage.objects;
create policy "avatar read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatar write own" on storage.objects;
create policy "avatar write own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar update own" on storage.objects;
create policy "avatar update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar delete own" on storage.objects;
create policy "avatar delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Emails stay private: other players (and logged-out visitors) can read every profile column
-- the app shows, but not email. Your own email comes from your auth session.
revoke select on public.profiles from anon, authenticated;
grant select (id, school_id, display_name, avatar_url, xp, level, xp_to_next_level, privacy, is_demo, created_at, grad_year, bio, banner)
  on public.profiles to anon, authenticated;
