// One-time setup for Outbound Rewards on Solana DEVNET (test network, no real money).
//
//   node scripts/solana-setup.mjs
//
// Safe to re-run: it only creates what's missing. It:
//   1. makes the server wallet (SOLANA_SECRET_KEY) and the ledger secret (REWARDS_SECRET) and saves both
//      into .env.local, so the secret key is never printed on screen
//   2. gets free devnet SOL for the server wallet (pays fees, and tops up players so they can redeem)
//   3. creates the OUT token (Token-2022, 0 decimals, name "Outbound Points") -> NEXT_PUBLIC_OUT_MINT
//   4. creates the treasury account where redeemed OUT goes
// Then it prints what to paste into Supabase and which env vars to copy to Vercel.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ExtensionType, LENGTH_SIZE, TOKEN_2022_PROGRAM_ID, TYPE_SIZE, createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMetadataPointerInstruction, createInitializeMintInstruction, getAssociatedTokenAddressSync, getMintLen,
} from "@solana/spl-token";
import { createInitializeInstruction, pack } from "@solana/spl-token-metadata";
import bs58 from "bs58";

const ENV = ".env.local";
if (!existsSync(ENV)) {
  console.error("Run this from the repo folder (where .env.local is).");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(ENV, "utf8").split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const save = (k, v) => {
  appendFileSync(ENV, `${readFileSync(ENV, "utf8").endsWith("\n") ? "" : "\n"}${k}=${v}\n`);
  env[k] = v;
  console.log(`  saved ${k} to .env.local`);
};

const RPC = env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const conn = new Connection(RPC, "confirmed");
const explorer = (kind, id) => `https://explorer.solana.com/${kind}/${id}?cluster=devnet`;

async function main() {
  console.log("1) Server wallet");
  if (!env.SOLANA_SECRET_KEY) save("SOLANA_SECRET_KEY", bs58.encode(Keypair.generate().secretKey));
  if (!env.REWARDS_SECRET) save("REWARDS_SECRET", randomBytes(24).toString("base64url"));
  const server = Keypair.fromSecretKey(bs58.decode(env.SOLANA_SECRET_KEY));
  console.log(`  address: ${server.publicKey.toBase58()}`);

  console.log("2) Devnet SOL");
  let bal = await conn.getBalance(server.publicKey);
  if (bal < 0.5 * LAMPORTS_PER_SOL) {
    try {
      const sig = await conn.requestAirdrop(server.publicKey, 1 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
      bal = await conn.getBalance(server.publicKey);
    } catch (e) {
      console.log(`  airdrop failed (${e.message.slice(0, 80)}).`);
      console.log(`  Get free devnet SOL at https://faucet.solana.com for ${server.publicKey.toBase58()}, then run this again.`);
      if (bal < 0.05 * LAMPORTS_PER_SOL) process.exit(1);
    }
  }
  console.log(`  balance: ${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL`);

  console.log("3) OUT token");
  if (!env.NEXT_PUBLIC_OUT_MINT) {
    const mint = Keypair.generate();
    const metadata = {
      mint: mint.publicKey, name: "Outbound Points", symbol: "OUT",
      uri: "https://outbound-red.vercel.app/out-token.json", additionalMetadata: [],
    };
    const mintLen = getMintLen([ExtensionType.MetadataPointer]);
    const metaLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
    const lamports = await conn.getMinimumBalanceForRentExemption(mintLen + metaLen);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: server.publicKey, newAccountPubkey: mint.publicKey, space: mintLen, lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeMetadataPointerInstruction(mint.publicKey, server.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(mint.publicKey, 0, server.publicKey, null, TOKEN_2022_PROGRAM_ID),
      createInitializeInstruction({
        programId: TOKEN_2022_PROGRAM_ID, metadata: mint.publicKey, updateAuthority: server.publicKey,
        mint: mint.publicKey, mintAuthority: server.publicKey,
        name: metadata.name, symbol: metadata.symbol, uri: metadata.uri,
      }),
    );
    const sig = await sendAndConfirmTransaction(conn, tx, [server, mint]);
    console.log(`  created: ${explorer("tx", sig)}`);
    save("NEXT_PUBLIC_OUT_MINT", mint.publicKey.toBase58());
  }
  console.log(`  mint: ${env.NEXT_PUBLIC_OUT_MINT}  ${explorer("address", env.NEXT_PUBLIC_OUT_MINT)}`);

  console.log("4) Treasury");
  const { PublicKey } = await import("@solana/web3.js");
  const mintPk = new PublicKey(env.NEXT_PUBLIC_OUT_MINT);
  const treasury = getAssociatedTokenAddressSync(mintPk, server.publicKey, false, TOKEN_2022_PROGRAM_ID);
  if (!(await conn.getAccountInfo(treasury))) {
    await sendAndConfirmTransaction(conn, new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(server.publicKey, treasury, server.publicKey, mintPk, TOKEN_2022_PROGRAM_ID),
    ), [server]);
  }
  console.log(`  treasury: ${treasury.toBase58()}`);

  console.log("\nDone. Next:");
  console.log("A) Supabase > SQL Editor: run backend/supabase/005_rewards.sql, then run this one line:");
  console.log(`   insert into app_private.secrets (key, value) values ('rewards', '${env.REWARDS_SECRET}') on conflict (key) do update set value = excluded.value;`);
  console.log("B) Vercel > Settings > Environment Variables: add these 3, copying the values from .env.local:");
  console.log("   SOLANA_SECRET_KEY, REWARDS_SECRET, NEXT_PUBLIC_OUT_MINT");
  console.log("C) Restart npm run dev, then open http://localhost:3000/rewards");
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
