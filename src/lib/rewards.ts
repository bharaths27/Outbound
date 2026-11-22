// Outbound Rewards: shared constants for the client and server. Safe to import in the browser.
// Players earn 1 OUT (Solana devnet token) per XP, then spend OUT on discount tiers.
// The more OUT you spend, the bigger the discount. Discounts are SAMPLES for the demo.

export const OUT_PER_XP = 1;
export const OUT_DECIMALS = 0;

export const TIERS = [
  { percent: 10, cost: 100, label: "10% off a quest spot" },
  { percent: 20, cost: 250, label: "20% off a quest spot" },
  { percent: 30, cost: 500, label: "30% off + free drink (sample)" },
] as const;
export type Tier = (typeof TIERS)[number];

export const tierFor = (percent: number) => TIERS.find((t) => t.percent === percent);

export const SOLANA_CLUSTER = "devnet";
export const DEFAULT_RPC = "https://api.devnet.solana.com";
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

// The memo a redeem transaction must carry, so the server can tie it to one player and tier.
export const redeemMemo = (userId: string, percent: number) => `outbound:redeem:${userId}:${percent}`;

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=${SOLANA_CLUSTER}`;
export const explorerAddress = (addr: string) => `https://explorer.solana.com/address/${addr}?cluster=${SOLANA_CLUSTER}`;
