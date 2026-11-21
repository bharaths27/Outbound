-- 005: Outbound Rewards on Solana (devnet). Run after 004.
--
-- Players earn OUT tokens (1 OUT per XP) minted to their Phantom wallet, then spend OUT on
-- discount tiers. The token moves happen on Solana; this table is the ledger the app reads.
--
-- Only our server may write the ledger. It proves that with a shared secret that lives in
-- app_private.secrets (not reachable through the API) and in Vercel's REWARDS_SECRET env var.
-- After running this file, set the secret once (the setup script prints the exact line):
--   insert into app_private.secrets (key, value) values ('rewards', '<REWARDS_SECRET>')
--   on conflict (key) do update set value = excluded.value;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
create table if not exists app_private.secrets (
  key   text primary key,
  value text not null
);
revoke all on app_private.secrets from public, anon, authenticated;

create table if not exists public.reward_events (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('mint', 'redeem')),
  amount     int  not null check (amount > 0),
  wallet     text not null,
  status     text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  tx_sig     text unique,               -- Solana transaction signature (Explorer link)
  tier       int,                       -- redeem only: discount percent
  coupon     text,                      -- redeem only: code shown as a QR
  created_at timestamptz not null default now()
);
create index if not exists reward_events_user on public.reward_events (user_id, created_at desc);

alter table public.reward_events enable row level security;
drop policy if exists "own reward events" on public.reward_events;
create policy "own reward events" on public.reward_events for select using (user_id = auth.uid());
grant select on public.reward_events to authenticated;
grant all on public.reward_events to service_role;
grant usage, select on sequence public.reward_events_id_seq to service_role;

create or replace function app_private.check_secret(p_secret text) returns void
language plpgsql security definer set search_path = app_private as $$
begin
  if p_secret is null or not exists (select 1 from app_private.secrets where key = 'rewards' and value = p_secret) then
    raise exception 'not allowed' using hint = 'BAD_SECRET';
  end if;
end $$;

-- Balance summary for one player (also callable by the player for their own id).
create or replace function public.reward_summary(p_user uuid)
returns table (earned int, minted int, pending int, redeemed int, claimable int)
language sql security definer set search_path = public stable as $$
  with p as (select coalesce(xp, 0) as xp from profiles where id = p_user),
  e as (
    select
      coalesce(sum(amount) filter (where kind = 'mint' and status = 'done'), 0)::int    as minted,
      coalesce(sum(amount) filter (where kind = 'mint' and status = 'pending'), 0)::int as pending,
      coalesce(sum(amount) filter (where kind = 'redeem' and status = 'done'), 0)::int  as redeemed
    from reward_events where user_id = p_user
  )
  select p.xp, e.minted, e.pending, e.redeemed, greatest(0, p.xp - e.minted - e.pending)
  from p, e
  where p_user = auth.uid() or auth.role() = 'service_role' or current_setting('app.rewards_ok', true) = '1';
$$;

-- Server: reserve everything this player can claim. Returns the new event id and amount (0 = nothing).
create or replace function public.reward_reserve_mint(p_user uuid, p_wallet text, p_secret text)
returns table (event_id bigint, amount int)
language plpgsql security definer set search_path = public as $$
declare v_claim int; v_id bigint;
begin
  perform app_private.check_secret(p_secret);
  perform pg_advisory_xact_lock(hashtext('reward:' || p_user::text));
  perform set_config('app.rewards_ok', '1', true);
  select s.claimable into v_claim from reward_summary(p_user) s;
  if coalesce(v_claim, 0) <= 0 then
    return query select null::bigint, 0;
    return;
  end if;
  insert into reward_events (user_id, kind, amount, wallet) values (p_user, 'mint', v_claim, p_wallet)
  returning id into v_id;
  return query select v_id, v_claim;
end $$;

-- Server: mark a reserved mint done (with its Solana signature) or failed.
create or replace function public.reward_finish_mint(p_event bigint, p_tx text, p_ok boolean, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform app_private.check_secret(p_secret);
  update reward_events
     set status = case when p_ok then 'done' else 'failed' end, tx_sig = case when p_ok then p_tx end
   where id = p_event and kind = 'mint' and status = 'pending';
end $$;

-- Server: record a redemption the server already verified on-chain. The unique tx_sig stops reuse.
create or replace function public.reward_record_redeem(
  p_user uuid, p_wallet text, p_amount int, p_tier int, p_tx text, p_coupon text, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform app_private.check_secret(p_secret);
  insert into reward_events (user_id, kind, amount, wallet, status, tx_sig, tier, coupon)
  values (p_user, 'redeem', p_amount, p_wallet, 'done', p_tx, p_tier, p_coupon);
exception when unique_violation then
  raise exception 'transaction already used' using hint = 'TX_ALREADY_USED';
end $$;

revoke all on function public.reward_summary(uuid) from public;
revoke all on function public.reward_reserve_mint(uuid, text, text) from public;
revoke all on function public.reward_finish_mint(bigint, text, boolean, text) from public;
revoke all on function public.reward_record_redeem(uuid, text, int, int, text, text, text) from public;
revoke all on function app_private.check_secret(text) from public;
grant execute on function public.reward_summary(uuid) to authenticated, service_role;
grant execute on function public.reward_reserve_mint(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.reward_finish_mint(bigint, text, boolean, text) to anon, authenticated, service_role;
grant execute on function public.reward_record_redeem(uuid, text, int, int, text, text, text) to anon, authenticated, service_role;
