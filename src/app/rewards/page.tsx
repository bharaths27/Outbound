"use client";
// Outbound Rewards: earn OUT tokens on Solana devnet from your XP, then spend them on discounts.
// Wallet and ledger logic: Bharath (backend). Look: the maroon/gold app style (DESIGN.md),
// with the shell's title band, a gold balance card, and sample coupon cards.
import { Check, ExternalLink, Loader2, Ticket, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/shell/page-header";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  DEFAULT_RPC,
  MEMO_PROGRAM_ID,
  OUT_DECIMALS,
  TIERS,
  explorerAddress,
  explorerTx,
  redeemMemo,
  type Tier,
} from "@/lib/rewards";

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: PublicKey | null;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
}
interface Summary {
  earned: number;
  minted: number;
  pending: number;
  redeemed: number;
  claimable: number;
}
interface RewardEvent {
  id: number;
  kind: "mint" | "redeem";
  amount: number;
  status: string;
  tx_sig: string | null;
  tier: number | null;
  coupon: string | null;
  created_at: string;
}

const phantom = (): PhantomProvider | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  };
  const p = w.phantom?.solana ?? w.solana;
  return p?.isPhantom ? p : null;
};

// Poll instead of using websockets (some campus networks block them). Up to ~30 s.
/** Turn wallet and Solana errors into something a player can act on. */
function friendlyRedeemError(e: unknown): string {
  const msg = String((e as Error)?.message ?? e ?? "");
  const logs = ((e as { logs?: string[] })?.logs ?? []).join(" ");
  const all = `${msg} ${logs}`;
  if (/reject|cancel|declined/i.test(all)) return "Redeem was cancelled.";
  if (/blockhash not found|block height exceeded|expired/i.test(all))
    return "Phantom waited too long, so Solana dropped the transaction. Nothing was spent. Tap Redeem again and confirm right away.";
  if (/insufficient (funds|lamports)|0x1\b|no record of a prior credit/i.test(all))
    return "Your wallet needs a little devnet SOL for the fee. Tap Redeem again (we top it up automatically).";
  if (/unexpected error/i.test(all))
    return "Phantom couldn't send it. Check that Phantom is on Solana Devnet (Settings → Developer Settings → Testnet mode), then try again. Nothing was spent.";
  return msg.slice(0, 160) || "Redeem failed. Nothing was spent.";
}

async function waitForConfirm(conn: Connection, signature: string) {
  for (let i = 0; i < 30; i++) {
    const { value } = await conn.getSignatureStatuses([signature]);
    const st = value[0];
    if (st?.err) throw new Error("The transaction failed on Solana.");
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Solana is slow right now. Your OUT may still arrive; check History in a minute.");
}

const LIVE = process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase";

/** Rewards need Supabase (the ledger) and Solana; the mock data source shows a note instead. */
export default function RewardsPage() {
  return LIVE ? (
    <LiveRewards />
  ) : (
    <Frame>
      <SetupCheck />
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Rewards" />
      <div className="mx-auto w-full max-w-[720px] px-4 pt-4 pb-10 desk:max-w-[1360px] desk:px-8 desk:pt-6">
        <p className="mb-5 max-w-[62ch] text-[15px] leading-relaxed text-muted-2">
          Every XP you earn is 1 OUT, a token on Solana. Claim it to your Phantom wallet, then spend it on discounts at
          quest spots. OUT is a devnet test token, and the coupons are samples.
        </p>
        <HowItWorks />
        {children}
      </div>
    </>
  );
}

function LiveRewards() {
  const supabase = useMemo(() => createClient(), []);
  const conn = useMemo(() => new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_RPC, "confirmed"), []);
  const mintAddr = process.env.NEXT_PUBLIC_OUT_MINT;

  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [wallet, setWallet] = useState<PublicKey | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<RewardEvent[]>([]);
  const [treasury, setTreasury] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{
    text: string;
    link?: string;
    error?: boolean;
  } | null>(null);
  const [coupon, setCoupon] = useState<{
    code: string;
    percent: number;
    qr: string;
    link: string;
  } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
      setUserId(data.session?.user.id ?? null);
      setChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token ?? null);
      setUserId(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/rewards", {
      headers: { authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok)
      return setNote({
        text: data.error ?? "Couldn't load rewards",
        error: true,
      });
    setSummary(data.summary);
    setEvents(data.events ?? []);
    setTreasury(data.treasury);
  }, [token]);

  const refreshBalance = useCallback(async () => {
    if (!wallet || !mintAddr) return;
    try {
      const ata = getAssociatedTokenAddressSync(new PublicKey(mintAddr), wallet, false, TOKEN_2022_PROGRAM_ID);
      const b = await conn.getTokenAccountBalance(ata);
      setBalance(Number(b.value.amount));
    } catch {
      setBalance(0); // no OUT account yet
    }
  }, [wallet, mintAddr, conn]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  async function connect() {
    const p = phantom();
    if (!p)
      return setNote({
        text: "Install the Phantom wallet, switch it to Devnet, then reload.",
        link: "https://phantom.com",
        error: true,
      });
    try {
      const { publicKey } = await p.connect();
      setWallet(new PublicKey(publicKey.toString()));
    } catch {
      setNote({ text: "Wallet connection was cancelled.", error: true });
    }
  }

  async function claim() {
    if (!token || !wallet) return;
    setBusy("claim");
    setNote(null);
    try {
      const res = await fetch("/api/rewards/claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ wallet: wallet.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) setNote({ text: data.error ?? "Claim failed", error: true });
      else if (!data.minted)
        setNote({
          text: "Nothing new to claim. Check in at a quest to earn more XP.",
        });
      else
        setNote({
          text: `Minted ${data.minted} OUT to your wallet.`,
          link: data.explorer,
        });
    } finally {
      setBusy(null);
      await Promise.all([refresh(), refreshBalance()]);
    }
  }

  async function redeem(tier: Tier) {
    const p = phantom();
    if (!p || !wallet || !token || !userId || !mintAddr || !treasury) return;
    setBusy(`redeem-${tier.percent}`);
    setNote(null);
    try {
      // A redeem costs a tiny devnet SOL fee; top the wallet up first if it's nearly empty.
      if ((await conn.getBalance(wallet)) < 2_000_000) {
        await fetch("/api/rewards/gas", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ wallet: wallet.toBase58() }),
        });
      }
      const mint = new PublicKey(mintAddr);
      const from = getAssociatedTokenAddressSync(mint, wallet, false, TOKEN_2022_PROGRAM_ID);
      const tx = new Transaction().add(
        createTransferCheckedInstruction(
          from,
          mint,
          new PublicKey(treasury),
          wallet,
          BigInt(tier.cost),
          OUT_DECIMALS,
          [],
          TOKEN_2022_PROGRAM_ID,
        ),
        new TransactionInstruction({
          programId: new PublicKey(MEMO_PROGRAM_ID),
          keys: [],
          data: new TextEncoder().encode(redeemMemo(userId, tier.percent)) as unknown as Buffer,
        }),
      );
      tx.feePayer = wallet;
      const { blockhash } = await conn.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      // Phantom signs; we send it ourselves through our devnet RPC, so the error (if any) is a real one.
      let signature: string;
      if (p.signTransaction) {
        const signed = await p.signTransaction(tx);
        signature = await conn.sendRawTransaction(signed.serialize(), { preflightCommitment: "confirmed", maxRetries: 3 });
      } else {
        ({ signature } = await p.signAndSendTransaction(tx));
      }
      await waitForConfirm(conn, signature);
      const res = await fetch("/api/rewards/redeem", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          signature,
          wallet: wallet.toBase58(),
          percent: tier.percent,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        return setNote({
          text: data.error ?? "Redeem failed",
          error: true,
          link: explorerTx(signature),
        });
      const qr = await QRCode.toDataURL(data.coupon, { margin: 1, width: 220 });
      setCoupon({
        code: data.coupon,
        percent: data.percent,
        qr,
        link: data.explorer,
      });
    } catch (e) {
      console.warn("[rewards] redeem failed:", e);
      setNote({ text: friendlyRedeemError(e), error: true });
    } finally {
      setBusy(null);
      await Promise.all([refresh(), refreshBalance()]);
    }
  }

  return (
    <Frame>
      {!checked ? (
        <div
          className="h-40 animate-pulse rounded-xl bg-sand motion-reduce:animate-none"
          aria-busy
          aria-label="Loading rewards"
        />
      ) : !token ? (
        <section className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-5">
          <h2 className="font-display text-xl font-semibold text-maroon">Sign in to see your OUT</h2>
          <p className="text-sm text-muted-2">Your OUT comes from the XP on your account.</p>
          <Button asChild>
            <Link href="/login?next=/rewards">Sign in</Link>
          </Button>
        </section>
      ) : null}

      {checked && token && (
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
            {/* Shown when NEXT_PUBLIC_OUT_MINT isn't set; the variable name isn't shown to players. */}
            {!mintAddr && <Notice>Rewards aren’t available here yet. Check back soon.</Notice>}

            {/* Balance */}
            <section className="rounded-xl bg-maroon p-5 text-white">
              <p className="type-eyebrow text-gold">Ready to claim</p>
              <p className="mt-1 font-display text-[44px] leading-none font-bold text-gold tabular-nums">
                {summary ? summary.claimable.toLocaleString("en-US") : "…"} <span className="text-2xl">OUT</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-white/10 px-3 py-2.5">
                  <dt className="text-on-maroon-muted">Earned from XP</dt>
                  <dd className="text-lg font-bold tabular-nums">
                    {summary ? summary.earned.toLocaleString("en-US") : "…"} OUT
                  </dd>
                </div>
                <div className="rounded-lg bg-white/10 px-3 py-2.5">
                  <dt className="text-on-maroon-muted">In your wallet</dt>
                  <dd className="text-lg font-bold tabular-nums">
                    {wallet ? `${balance ?? "…"} OUT` : "Not connected"}
                  </dd>
                </div>
              </dl>

              <div className="mt-4">
                {!wallet ? (
                  <Button variant="gold" size="xl" className="w-full" onClick={connect}>
                    <Wallet aria-hidden />
                    Connect Phantom wallet
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="gold"
                      size="xl"
                      className="w-full"
                      onClick={claim}
                      disabled={!!busy || !summary?.claimable}
                    >
                      {busy === "claim" ? <Loader2 className="animate-spin" aria-hidden /> : null}
                      {busy === "claim" ? "Minting on Solana…" : `Claim ${summary?.claimable ?? 0} OUT`}
                    </Button>
                    <p className="mt-2 text-center text-xs text-on-maroon-muted">
                      Wallet{" "}
                      <a
                        href={explorerAddress(wallet.toBase58())}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold underline"
                      >
                        {wallet.toBase58().slice(0, 4)}…{wallet.toBase58().slice(-4)}
                      </a>{" "}
                      · Solana devnet
                    </p>
                  </>
                )}
              </div>
            </section>

            {note && (
              <p
                role="status"
                className={cn(
                  "rounded-lg px-3.5 py-2.5 text-sm",
                  note.error ? "bg-[#FBE3E3] text-[#9B1C1C]" : "bg-[#DDF1E4] text-[#1F6B3A]",
                )}
              >
                {note.text}{" "}
                {note.link && (
                  <a href={note.link} target="_blank" rel="noreferrer" className="font-semibold underline">
                    View on Solana Explorer
                  </a>
                )}
              </p>
            )}

            {/* Coupons */}
            <section>
              <h2 className="mb-1 font-display text-2xl font-semibold text-ink">Spend OUT</h2>
              <p className="mb-3 text-sm text-muted-2">The more OUT you spend, the bigger the discount.</p>
              <ul className="grid gap-3 sm:grid-cols-3">
                {TIERS.map((t) => {
                  const short = balance == null || balance < t.cost;
                  return (
                    <li key={t.percent} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-display text-[32px] leading-none font-bold text-maroon">{t.percent}%</p>
                        <span className="rounded-md bg-sample px-2 py-0.5 text-[11px] font-bold tracking-[0.06em] text-sample-foreground uppercase">
                          Sample
                        </span>
                      </div>
                      <p className="flex-1 text-sm text-ink-2">{t.label}</p>
                      <p className="text-sm font-bold tabular-nums">{t.cost} OUT</p>
                      <Button
                        variant="outline"
                        onClick={() => redeem(t)}
                        disabled={!wallet || !!busy || short}
                        className="w-full"
                      >
                        {busy === `redeem-${t.percent}` ? "Confirm in Phantom…" : "Redeem"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {!wallet && <p className="mt-2 text-[13px] text-muted-foreground">Connect your wallet to redeem.</p>}
            </section>
          </div>

          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
            {coupon && (
              <section className="rounded-xl border-2 border-dashed border-gold-600 bg-[#FFF4D6] p-5 text-center">
                <p className="type-eyebrow text-muted-2">Show this at the counter (sample)</p>
                <p className="mt-1 font-display text-[40px] leading-none font-bold text-maroon">
                  {coupon.percent}% off
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element -- generated QR data URL */}
                <img
                  src={coupon.qr}
                  alt={`Coupon ${coupon.code}`}
                  className="mx-auto my-3 size-44 rounded-lg bg-white p-1"
                />
                <p className="font-mono text-sm font-bold">{coupon.code}</p>
                <a
                  href={coupon.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-maroon underline"
                >
                  Paid on Solana
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </section>
            )}

            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="mb-2 text-[15px] font-bold">History</h2>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Claims and coupons will show up here.</p>
              ) : (
                <ul className="flex flex-col">
                  {events.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center gap-2.5 border-t border-sand py-2.5 text-sm first:border-t-0"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sand text-maroon">
                        {e.kind === "mint" ? (
                          <Check className="size-4" aria-hidden />
                        ) : (
                          <Ticket className="size-4" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        {e.kind === "mint" ? `+${e.amount} OUT claimed` : `−${e.amount} OUT for ${e.tier}% off`}
                        {e.coupon && <span className="block font-mono text-xs text-muted-foreground">{e.coupon}</span>}
                        {e.status !== "done" && <span className="block text-xs text-muted-foreground">{e.status}</span>}
                      </span>
                      {e.tx_sig && (
                        <a
                          href={explorerTx(e.tx_sig)}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-xs font-semibold text-maroon underline"
                        >
                          Explorer
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </Frame>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-[#F0D58E] bg-[#FFF4D6] px-3.5 py-2.5 text-sm text-[#3d2a2e] dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-100">
      {children}
    </p>
  );
}

/** The whole Solana loop in four steps, so anyone (judges included) gets it at a glance. */
function HowItWorks() {
  const steps = [
    { n: 1, t: "Earn XP", d: "Check in at quests and places on the map. The database checks you are really there." },
    { n: 2, t: "Claim OUT", d: "1 XP = 1 OUT. Our server mints OUT straight to your Phantom wallet on Solana (devnet)." },
    { n: 3, t: "Spend OUT", d: "Pick a coupon: 100, 250 or 500 OUT. Phantom sends that OUT back to the Outbound treasury." },
    { n: 4, t: "Get a coupon", d: "We verify that transfer on Solana and give you a coupon code and QR (samples for the demo)." },
  ];
  return (
    <ol className="mb-6 grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 desk:grid-cols-4">
      {steps.map((s) => (
        <li key={s.n} className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-maroon font-bold text-white">{s.n}</span>
          <span className="min-w-0">
            <span className="block text-[16px] font-semibold text-ink">{s.t}</span>
            <span className="block text-[14px] text-muted-foreground">{s.d}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

interface RewardsStatus {
  dataSource: "supabase" | "mock";
  supabase: boolean;
  mint: boolean;
  mintKey: string | null;
  signer: boolean;
  signerKey: string | null;
  rewardsSecret: boolean;
  devnet: boolean;
  signerSol: number | null;
}

/** Shown when the app runs on sample data: what's set up on this server, and what to add. */
function SetupCheck() {
  const [st, setSt] = useState<RewardsStatus | null | "error">(null);
  useEffect(() => {
    fetch("/api/rewards/status")
      .then((r) => r.json())
      .then(setSt)
      .catch(() => setSt("error"));
  }, []);
  const rows: [string, boolean | null, string][] =
    st && st !== "error"
      ? [
          ["App uses the real database", false, "Add NEXT_PUBLIC_DATA_SOURCE=supabase to .env.local, then restart npm run dev."],
          ["Supabase URL and key", st.supabase, "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local."],
          ["OUT token (mint address)", st.mint, "NEXT_PUBLIC_OUT_MINT from scripts/solana-setup.mjs."],
          ["Server wallet that mints OUT", st.signer, "SOLANA_SECRET_KEY (server only) from scripts/solana-setup.mjs."],
          ["Rewards secret", st.rewardsSecret, "REWARDS_SECRET (server only), the same value as in Supabase."],
          ["Solana devnet reachable", st.devnet, "Check your internet connection."],
        ]
      : [];
  return (
    <div className="flex flex-col gap-3">
      <Notice>
        Rewards are off because the app is running on <b>sample data</b> (your XP here is the sample player&apos;s). OUT
        needs real accounts, so it only runs on the real database.
      </Notice>
      {st === null && <p className="text-sm text-muted-foreground">Checking this server&apos;s setup…</p>}
      {st === "error" && <p className="text-sm text-muted-foreground">Couldn&apos;t check the setup. Is npm run dev running?</p>}
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
          {rows.map(([label, ok, fix]) => (
            <li key={label} className="flex items-start gap-3 px-4 py-3">
              <span
                className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-white",
                  ok ? "bg-emerald-600" : "bg-amber-500",
                )}
                aria-label={ok ? "Ready" : "Missing"}
              >
                {ok ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : <TriangleAlert className="size-3.5" strokeWidth={2.5} aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-ink">{label}</span>
                {!ok && <span className="block text-[13.5px] text-muted-foreground">{fix}</span>}
                {ok && label.startsWith("Server wallet") && st && st !== "error" && st.signerSol !== null && (
                  <span className="block text-[13.5px] text-muted-foreground">{st.signerSol.toFixed(2)} devnet SOL for fees</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
