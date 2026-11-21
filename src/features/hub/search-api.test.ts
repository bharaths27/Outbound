import { describe, expect, it } from "vitest";
import type { SearchResult } from "@/lib/search";
import { fromApi, localSearch, searchHub } from "./search-api";

const ok = (body: SearchResult) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe("searchHub", () => {
  it("uses the API result, turning tags and keywords into terms", async () => {
    const result = await searchHub("cheap dumplings 40 min", [], {
      fetchImpl: ok({
        filters: { craving: "food", budget: 1, minutes: 40 },
        tags: ["dumplings"],
        keywords: ["Dumplings", "xiao long bao"],
        source: "gemini",
      }),
    });
    expect(result).toEqual({
      filters: { craving: "food", budget: 1, minutes: 40 },
      terms: ["dumplings", "xiao long bao"],
      source: "gemini",
    });
  });

  it("falls back to the local parser when the request fails", async () => {
    const failing = (async () => new Response("nope", { status: 502 })) as unknown as typeof fetch;
    const result = await searchHub("cheap pastry", ["pastry", "coffee"], { fetchImpl: failing });
    expect(result).toEqual({ filters: { craving: "any", budget: 1, minutes: null }, terms: ["pastry"], source: "local" });
  });

  it("falls back when fetch throws", async () => {
    const throwing = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    expect((await searchHub("scenic walk", [], { fetchImpl: throwing })).filters.craving).toBe("scenic");
  });
});

describe("mapping", () => {
  it("keeps quest types as the craving", () => {
    expect(localSearch("dinner under $20", []).filters).toEqual({ craving: "food", budget: 2, minutes: null });
    expect(
      fromApi({ filters: { craving: "weird", budget: null, minutes: null }, tags: [], keywords: [], source: "fallback" })
        .filters.craving,
    ).toBe("any");
  });
});
