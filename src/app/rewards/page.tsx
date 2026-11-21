"use client";
// Outbound Rewards: earn OUT tokens on Solana devnet from your XP, then spend them on discounts.
// Owner: Bharath (backend). Self-contained so it doesn't touch Angie's pages; link to /rewards from the nav.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_RPC, MEMO_PROGRAM_ID, OUT_DECIMALS, TIERS, explorerAddress, explorerTx, redeemMemo, type Tier,
} from "@/lib/rewards";

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: PublicKey | null;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
}
interface Summary { earned: number; minted: number; pending: number; redeemed: number; claimable: number }
interface RewardEvent {
  id: number; kind: "mint" | "redeem"; amount: number; status: string; tx_sig: string | null;
  tier: number | null; coupon: string | null; created_at: string;
}

const phantom = (): PhantomProvider | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { phantom?: { solana?: PhantomProvider }; solana?: PhantomProvider };
  const p = w.phantom?.solana ?? w.solana;
  return p?.isPhantom ? p : null;
};

// Poll instead of using websockets (some campus networks block them). Up to ~30 s.
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

export default function RewardsPage() {
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
  const [note, setNote] = useState<{ text: string; link?: string; error?: boolean } | null>(null);
  const [coupon, setCoupon] = useState<{ code: string; percent: number; qr: string; link: string } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
    const res = await fetch("/api/rewards", { headers: { authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) return setNote({ text: data.error ?? "Couldn't load rewards", error: true });
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

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { refreshBalance(); }, [refreshBalance]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy("signin");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(null);
    if (error) setNote({ text: error.message, error: true });
  }

  async function connect() {
    const p = phantom();
    if (!p) return setNote({ text: "Install the Phantom wallet, switch it to Devnet, then reload.", link: "https://phantom.com", error: true });
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
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet: wallet.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) setNote({ text: data.error ?? "Claim failed", error: true });
      else if (!data.minted) setNote({ text: "Nothing new to claim. Check in at a quest to earn more XP." });
      else setNote({ text: `Minted ${data.minted} OUT to your wallet.`, link: data.explorer });
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
      const mint = new PublicKey(mintAddr);
      const from = getAssociatedTokenAddressSync(mint, wallet, false, TOKEN_2022_PROGRAM_ID);
      const tx = new Transaction().add(
        createTransferCheckedInstruction(from, mint, new PublicKey(treasury), wallet, BigInt(tier.cost), OUT_DECIMALS, [], TOKEN_2022_PROGRAM_ID),
        new TransactionInstruction({
          programId: new PublicKey(MEMO_PROGRAM_ID), keys: [],
          data: new TextEncoder().encode(redeemMemo(userId, tier.percent)) as unknown as Buffer,
        }),
      );
      tx.feePayer = wallet;
      const { blockhash } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      const { signature } = await p.signAndSendTransaction(tx);
      await waitForConfirm(conn, signature);
      const res = await fetch("/api/rewards/redeem", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ signature, wallet: wallet.toBase58(), percent: tier.percent }),
      });
      const data = await res.json();
      if (!res.ok) return setNote({ text: data.error ?? "Redeem failed", error: true, link: explorerTx(signature) });
      const qr = await QRCode.toDataURL(data.coupon, { margin: 1, width: 220 });
      setCoupon({ code: data.coupon, percent: data.percent, qr, link: data.explorer });
    } catch (e) {
      setNote({ text: (e as Error).message?.slice(0, 160) || "Redeem was cancelled.", error: true });
    } finally {
      setBusy(null);
      await Promise.all([refresh(), refreshBalance()]);
    }
  }

  if (!checked) return <main className="p-6 text-sm text-neutral-500">Loading…</main>;

  if (!token) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-2xl font-bold">Outbound Rewards</h1>
        <p className="mt-1 text-sm text-neutral-500">Sign in with your school email to see your OUT rewards.</p>
        <form onSubmit={signIn} className="mt-4 space-y-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@bu.edu" required className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" required className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" />
          <button disabled={busy === "signin"} className="w-full rounded-lg bg-emerald-600 py-2 font-medium text-white disabled:opacity-50">Sign in</button>
        </form>
        {note && <p className="mt-3 text-sm text-red-500">{note.text}</p>}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl space-y-5 p-6">
      <header>
        <h1 className="text-2xl font-bold">Outbound Rewards</h1>
        <p className="text-sm text-neutral-500">
          Every XP earns 1 OUT, a token on Solana. Spend OUT on discounts: the more you spend, the bigger the deal.{" "}
          <span className="whitespace-nowrap">(Devnet test token. Discounts are samples.)</span>
        </p>
      </header>

      {!mintAddr && (
        <p className="rounded-lg bg-amber-100 p-2 text-sm text-amber-900">Rewards aren&apos;t set up on this server yet (NEXT_PUBLIC_OUT_MINT is missing).</p>
      )}
      <section className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Earned", summary?.earned],
          ["Ready to claim", summary?.claimable],
          ["In wallet", wallet ? balance : "–"],
        ].map(([label, v]) => (
          <div key={label as string} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="text-2xl font-bold">{v ?? "…"}</p>
            <p className="text-xs text-neutral-500">{label} {label === "In wallet" ? "" : "OUT"}</p>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        {!wallet ? (
          <button onClick={connect} className="w-full rounded-xl bg-violet-600 py-3 font-semibold text-white">Connect Phantom wallet</button>
        ) : (
          <>
            <p className="text-xs text-neutral-500">
              Wallet{" "}
              <a href={explorerAddress(wallet.toBase58())} target="_blank" rel="noreferrer" className="underline">
                {wallet.toBase58().slice(0, 4)}…{wallet.toBase58().slice(-4)}
              </a>
            </p>
            <button onClick={claim} disabled={!!busy || !summary?.claimable} className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40">
              {busy === "claim" ? "Minting on Solana…" : `Claim ${summary?.claimable ?? 0} OUT`}
            </button>
          </>
        )}
        {note && (
          <p className={`text-sm ${note.error ? "text-red-500" : "text-emerald-600"}`}>
            {note.text}{" "}
            {note.link && <a href={note.link} target="_blank" rel="noreferrer" className="underline">View on Solana Explorer</a>}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Spend OUT</h2>
        <div className="space-y-2">
          {TIERS.map((t) => {
            const short = balance == null || balance < t.cost;
            return (
              <div key={t.percent} className="flex items-center justify-between rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                <div>
                  <p className="font-medium">{t.label}</p>
                  <p className="text-xs text-neutral-500">{t.cost} OUT</p>
                </div>
                <button onClick={() => redeem(t)} disabled={!wallet || !!busy || short} className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-30 dark:bg-white dark:text-neutral-900">
                  {busy === `redeem-${t.percent}` ? "Confirm in Phantom…" : "Redeem"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {coupon && (
        <section className="rounded-2xl border-2 border-dashed border-emerald-500 p-4 text-center">
          <p className="text-sm text-neutral-500">Show this at the counter (sample)</p>
          <p className="text-3xl font-bold">{coupon.percent}% off</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated QR data URL */}
          <img src={coupon.qr} alt={`Coupon ${coupon.code}`} className="mx-auto my-2 h-44 w-44 rounded-lg bg-white p-1" />
          <p className="font-mono">{coupon.code}</p>
          <a href={coupon.link} target="_blank" rel="noreferrer" className="text-xs underline">Paid on Solana: view transaction</a>
        </section>
      )}

      {events.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">History</h2>
          <ul className="space-y-1 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span>
                  {e.kind === "mint" ? `+${e.amount} OUT claimed` : `−${e.amount} OUT for ${e.tier}% off (${e.coupon})`}
                  {e.status !== "done" && <span className="text-neutral-500"> · {e.status}</span>}
                </span>
                {e.tx_sig && <a href={explorerTx(e.tx_sig)} target="_blank" rel="noreferrer" className="shrink-0 text-xs underline">Explorer</a>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
