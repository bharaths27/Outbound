// Which quests need an event code: read from quests.has_qr (migration 006), falling back
// to an id-only qr_code filter until 006 has run. The code itself is never selected.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createSupabaseService } from "./index";

type Res = { data: unknown; error: { message: string } | null };

/** A fake query builder: records each query's calls and answers from `respond`. */
function fakeClient(respond: (calls: string[]) => Res) {
  const queries: string[][] = [];
  const client = {
    from(table: string) {
      const calls = [`from:${table}`];
      queries.push(calls);
      const builder = {
        select: (cols: string) => (calls.push(`select:${cols}`), builder),
        eq: (col: string, v: unknown) => (calls.push(`eq:${col}=${String(v)}`), builder),
        not: (col: string, op: string, v: unknown) => (calls.push(`not:${col} ${op} ${String(v)}`), builder),
        then: (ok: (r: Res) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(respond(calls)).then(ok, fail),
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, queries };
}

const QUESTS = [
  { id: "bu-gsu-expo", station_id: "place-bucen", vibe_tags: [] },
  { id: "frog-pond-lookout", station_id: "place-pktrm", vibe_tags: [] },
];

describe("requires_qr", () => {
  it("comes from has_qr and never selects qr_code", async () => {
    const { client, queries } = fakeClient((calls) =>
      calls.includes("eq:has_qr=true") ? { data: [{ id: "bu-gsu-expo" }], error: null } : { data: QUESTS, error: null },
    );
    const quests = await createSupabaseService(() => client).getAllQuests();
    expect(quests.map((q) => [q.id, q.requires_qr])).toEqual([
      ["bu-gsu-expo", true],
      ["frog-pond-lookout", false],
    ]);
    expect(queries.flat().some((c) => c.includes("qr_code"))).toBe(false);
    expect(queries.flat().some((c) => c === "select:*")).toBe(false);
  });

  it("falls back to an id-only qr_code filter before migration 006", async () => {
    const { client } = fakeClient((calls) => {
      if (calls.includes("eq:has_qr=true")) return { data: null, error: { message: "column quests.has_qr does not exist" } };
      if (calls.some((c) => c.startsWith("not:qr_code"))) return { data: [{ id: "bu-gsu-expo" }], error: null };
      return { data: QUESTS, error: null };
    });
    const quests = await createSupabaseService(() => client).getAllQuests();
    expect(quests.find((q) => q.id === "bu-gsu-expo")?.requires_qr).toBe(true);
  });
});
