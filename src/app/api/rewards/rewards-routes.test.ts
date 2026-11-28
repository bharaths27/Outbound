// The claim and redeem routes with Supabase and Solana faked: auth, input checks, and what
// happens when minting fails or a transaction is reused.
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const player = vi.fn();
const mintOut = vi.fn();
const verifyRedeem = vi.fn();

vi.mock("@/lib/rewards-server", () => ({
  playerFromRequest: () => player(),
  rewardsSecret: () => "s3cret",
  serverDb: () => ({ rpc: (name: string, args: unknown) => ({ ...rpc(name, args), single: () => rpc(name, args) }) }),
}));
vi.mock("@/lib/solana-server", async () => {
  const { PublicKey } = await import("@solana/web3.js");
  return {
    mintOut: (...a: unknown[]) => mintOut(...a),
    verifyRedeem: (...a: unknown[]) => verifyRedeem(...a),
    parseWallet: (s: unknown) => {
      try {
        return new PublicKey(String(s));
      } catch {
        return null;
      }
    },
  };
});

const WALLET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const SIG = "5".repeat(88);
const req = (body: unknown) => new Request("http://x/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  rpc.mockReset();
  player.mockReset();
  mintOut.mockReset();
  verifyRedeem.mockReset();
});

describe("POST /api/rewards/claim", async () => {
  const { POST } = await import("./claim/route");
  it("needs a signed-in player", async () => {
    player.mockResolvedValue(null);
    expect((await POST(req({ wallet: WALLET }))).status).toBe(401);
  });
  it("needs a valid wallet", async () => {
    player.mockResolvedValue({ userId: "u1" });
    expect((await POST(req({ wallet: "nope" }))).status).toBe(400);
  });
  it("mints nothing when nothing is claimable", async () => {
    player.mockResolvedValue({ userId: "u1" });
    rpc.mockReturnValue({ data: { event_id: null, amount: 0 }, error: null });
    expect(await (await POST(req({ wallet: WALLET }))).json()).toEqual({ minted: 0 });
    expect(mintOut).not.toHaveBeenCalled();
  });
  it("mints the reserved amount and records the signature", async () => {
    player.mockResolvedValue({ userId: "u1" });
    rpc.mockReturnValue({ data: { event_id: 7, amount: 120 }, error: null });
    mintOut.mockResolvedValue("SIG123");
    const res = await POST(req({ wallet: WALLET }));
    expect(await res.json()).toMatchObject({ minted: 120, signature: "SIG123" });
    expect(rpc).toHaveBeenCalledWith("reward_finish_mint", { p_event: 7, p_tx: "SIG123", p_ok: true, p_secret: "s3cret" });
  });
  it("releases the reservation when Solana fails", async () => {
    player.mockResolvedValue({ userId: "u1" });
    rpc.mockReturnValue({ data: { event_id: 8, amount: 50 }, error: null });
    mintOut.mockRejectedValue(new Error("rpc down"));
    const res = await POST(req({ wallet: WALLET }));
    expect(res.status).toBe(502);
    expect(rpc).toHaveBeenCalledWith("reward_finish_mint", { p_event: 8, p_tx: null, p_ok: false, p_secret: "s3cret" });
  });
});

describe("POST /api/rewards/redeem", async () => {
  const { POST } = await import("./redeem/route");
  it("rejects bad input before touching Solana", async () => {
    player.mockResolvedValue({ userId: "u1" });
    expect((await POST(req({ wallet: WALLET, percent: 15, signature: SIG }))).status).toBe(400);
    expect((await POST(req({ wallet: WALLET, percent: 10, signature: "short" }))).status).toBe(400);
    expect(verifyRedeem).not.toHaveBeenCalled();
  });
  it("checks the payment with this player's memo and the tier's cost", async () => {
    player.mockResolvedValue({ userId: "u1" });
    verifyRedeem.mockResolvedValue(null);
    rpc.mockReturnValue({ error: null });
    const res = await POST(req({ wallet: WALLET, percent: 20, signature: SIG }));
    const body = await res.json();
    expect(body.coupon).toMatch(/^OUT-20-[0-9A-F]{6}$/);
    expect(verifyRedeem.mock.calls[0][2]).toBe(250);
    expect(verifyRedeem.mock.calls[0][3]).toBe("outbound:redeem:u1:20");
  });
  it("refuses a payment that doesn't check out", async () => {
    player.mockResolvedValue({ userId: "u1" });
    verifyRedeem.mockResolvedValue("That transaction isn't an OUT payment of the right amount to Outbound.");
    expect((await POST(req({ wallet: WALLET, percent: 10, signature: SIG }))).status).toBe(400);
  });
  it("won't accept the same transaction twice", async () => {
    player.mockResolvedValue({ userId: "u1" });
    verifyRedeem.mockResolvedValue(null);
    rpc.mockReturnValue({ error: { message: "transaction already used", hint: "TX_ALREADY_USED" } });
    expect((await POST(req({ wallet: WALLET, percent: 10, signature: SIG }))).status).toBe(409);
  });
});
