-- Outbound: migration 011 (social profiles). Run AFTER 010. Safe to re-run.
--
-- Beli-style profiles: 1–10 reviews of places you've checked in at (or imported from a
-- Google Takeout file), a want-to-visit list, likes and comments. Who sees what follows the
-- existing profile privacy: you, public players, or friends-only players you're friends with.
-- Ghost mode shows nothing to anyone else.

create or replace function public.can_view_profile(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer = owner or exists (
    select 1 from profiles p where p.id = owner and (
      p.privacy = 'public' or (p.privacy = 'friends' and public.are_friends(viewer, owner))
    )
  );
$$;
grant execute on function public.can_view_profile(uuid, uuid) to anon, authenticated;

create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  quest_id      text references public.quests(id) on delete set null,
  place_name    text not null check (length(place_name) between 1 and 200),
  place_address text,
  lat           double precision,
  lon           double precision,
  rating        numeric(3,1) not null check (rating between 1 and 10),
  note          text not null default '' check (length(note) <= 600),
  visited_on    date not null default (now() at time zone 'America/New_York')::date,
  source        text not null default 'outbound' check (source in ('outbound', 'google')),
  created_at    timestamptz not null default now()
);
-- One Outbound review per quest per player (re-rating updates it).
create unique index if not exists reviews_one_per_quest on public.reviews (user_id, quest_id) where quest_id is not null;
create index if not exists reviews_user on public.reviews (user_id, created_at desc);

create table if not exists public.saved_places (
  user_id    uuid references public.profiles(id) on delete cascade,
  quest_id   text references public.quests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, quest_id)
);

create table if not exists public.review_likes (
  review_id uuid references public.reviews(id) on delete cascade,
  user_id   uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create table if not exists public.review_comments (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.reviews(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  text       text not null check (length(text) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists review_comments_review on public.review_comments (review_id, created_at);

alter table public.reviews         enable row level security;
alter table public.saved_places    enable row level security;
alter table public.review_likes    enable row level security;
alter table public.review_comments enable row level security;

-- reviews: readable by whoever can see the author; written only by the author.
-- Outbound reviews need a check-in at that quest first; imported ones need no quest.
drop policy if exists "read reviews" on public.reviews;
create policy "read reviews" on public.reviews for select using (public.can_view_profile(auth.uid(), user_id));
drop policy if exists "write own reviews" on public.reviews;
create policy "write own reviews" on public.reviews for insert with check (
  user_id = auth.uid() and (
    (source = 'google' and quest_id is null)
    or (source = 'outbound' and exists (select 1 from visits v where v.user_id = auth.uid() and v.quest_id = reviews.quest_id))
  )
);
drop policy if exists "edit own reviews" on public.reviews;
create policy "edit own reviews" on public.reviews for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete own reviews" on public.reviews;
create policy "delete own reviews" on public.reviews for delete using (user_id = auth.uid());

-- want-to-visit lists follow the same visibility.
drop policy if exists "read saved" on public.saved_places;
create policy "read saved" on public.saved_places for select using (public.can_view_profile(auth.uid(), user_id));
drop policy if exists "write own saved" on public.saved_places;
create policy "write own saved" on public.saved_places for insert with check (user_id = auth.uid());
drop policy if exists "delete own saved" on public.saved_places;
create policy "delete own saved" on public.saved_places for delete using (user_id = auth.uid());

-- likes and comments: on reviews you can see.
drop policy if exists "read likes" on public.review_likes;
create policy "read likes" on public.review_likes for select using (
  exists (select 1 from reviews r where r.id = review_id)
);
drop policy if exists "like visible reviews" on public.review_likes;
create policy "like visible reviews" on public.review_likes for insert with check (
  user_id = auth.uid() and exists (select 1 from reviews r where r.id = review_id)
);
drop policy if exists "unlike" on public.review_likes;
create policy "unlike" on public.review_likes for delete using (user_id = auth.uid());

drop policy if exists "read comments" on public.review_comments;
create policy "read comments" on public.review_comments for select using (
  exists (select 1 from reviews r where r.id = review_id)
);
drop policy if exists "comment on visible reviews" on public.review_comments;
create policy "comment on visible reviews" on public.review_comments for insert with check (
  user_id = auth.uid() and exists (select 1 from reviews r where r.id = review_id)
);
drop policy if exists "delete own comments" on public.review_comments;
create policy "delete own comments" on public.review_comments for delete using (
  user_id = auth.uid() or exists (select 1 from reviews r where r.id = review_id and r.user_id = auth.uid())
);

grant select on public.reviews, public.saved_places, public.review_likes, public.review_comments to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;
grant insert, delete on public.saved_places, public.review_likes, public.review_comments to authenticated;
