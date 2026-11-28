// Redeem verification against a fake Solana RPC: only an exact OUT payment from the player's
// wallet to our treasury, with this player's memo, counts.
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import { MEMO_PROGRAM_ID, redeemMemo, tierFor, TIERS } from "./rewards";

const server = Keypair.generate();
const mintKey = Keypair.generate().publicKey;
const player = Keypair.generate().publicKey;
let mod: typeof import("./solana-server");

beforeAll(async () => {
  process.env.SOLANA_SECRET_KEY = bs58.encode(server.secretKey);
  process.env.NEXT_PUBLIC_OUT_MINT = mintKey.toBase58();
  mod = await import("./solana-server");
});

function tx({ amount = "100", dest, authority = player.toBase58(), mint = mintKey.toBase58(), memo, err = null }: {
  amount?: string; dest?: string; authority?: string; mint?: string; memo?: string | null; err?: unknown;
}) {
  const instructions: unknown[] = [
    { programId: TOKEN_2022_PROGRAM_ID, parsed: { type: "transferChecked", info: { mint, destination: dest ?? mod.treasury().toBase58(), authority, tokenAmount: { amount } } } },
  ];
  if (memo !== null) instructions.push({ programId: new PublicKey(MEMO_PROGRAM_ID), parsed: memo ?? redeemMemo("user-1", 10) });
  return { meta: { err }, transaction: { message: { instructions } } };
}

function rpcReturns(value: unknown) {
  vi.spyOn(Connection.prototype, "getParsedTransaction").mockResolvedValue(value as never);
}

describe("verifyRedeem", () => {
  const memo = () => redeemMemo("user-1", 10);
  it("accepts an exact payment with the right memo", async () => {
    rpcReturns(tx({}));
    expect(await mod.verifyRedeem("sig", player, 100, memo())).toBeNull();
  });
  it("rejects the wrong amount", async () => {
    rpcReturns(tx({ amount: "99" }));
    expect(await mod.verifyRedeem("sig", player, 100, memo())).toMatch(/right amount/);
  });
  it("rejects a payment to someone else", async () => {
    rpcReturns(tx({ dest: Keypair.generate().publicKey.toBase58() }));
    expect(await mod.verifyRedeem("sig", player, 100, memo())).toMatch(/right amount/);
  });
  it("rejects another wallet's payment", async () => {
    rpcReturns(tx({ authority: Keypair.generate().publicKey.toBase58() }));
    expect(await mod.verifyRedeem("sig", player, 100, memo())).toMatch(/right amount/);
  });
  it("rejects a different token", async () => {
    rpcReturns(tx({ mint: Keypair.generate().publicKey.toBase58() }));
    expect(await mod.verifyRedeem("sig", player, 100, memo())).toMatch(/right amount/);
  });
  it("rejects a missing memo, or another player's memo (no reusing someone's payment)", async () => {
    rpcReturns(tx({ memo: null }));
    expect(await mod.verifyRedeem("sig", player, 100, memo())).toMatch(/memo/);
    rpcReturns(tx({ memo: redeemMemo("someone-else", 10) }));
    expect(await mod.verifyRedeem("sig", player, 100, memo())).toMatch(/memo/);
  });
  it("rejects a failed transaction", async () => {
    rpcReturns(tx({ err: { InstructionError: [0, "x"] } }));
    expect(await mod.verifyRedeem("sig", player, 100, memo())).toMatch(/failed/);
  });
});

describe("wallets and tiers", () => {
  it("only accepts real wallet addresses", () => {
    expect(mod.parseWallet(player.toBase58())?.toBase58()).toBe(player.toBase58());
    expect(mod.parseWallet("not a wallet")).toBeNull();
    expect(mod.parseWallet(undefined)).toBeNull();
    // a program-derived address (off the curve) can't sign, so it can't be a player's wallet
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("x")], TOKEN_2022_PROGRAM_ID);
    expect(mod.parseWallet(pda.toBase58())).toBeNull();
  });
  it("has the 100/250/500 OUT tiers and nothing else", () => {
    expect(TIERS.map((t) => [t.percent, t.cost])).toEqual([[10, 100], [20, 250], [30, 500]]);
    expect(tierFor(15)).toBeUndefined();
    expect(tierFor(30)?.cost).toBe(500);
  });
  it("treasury is the server wallet's OUT account", () => {
    expect(mod.treasury().toBase58()).toBe(mod.ata(server.publicKey).toBase58());
  });
});
