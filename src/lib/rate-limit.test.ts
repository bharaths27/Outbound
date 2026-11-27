import { describe, expect, it } from "vitest";
import { allow, clientKey, rateLimit } from "./rate-limit";

describe("rate limit", () => {
  it("allows up to max per window, then blocks, then recovers", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(allow("t1", "a", 3, 60_000, t + i)).toBe(true);
    expect(allow("t1", "a", 3, 60_000, t + 10)).toBe(false);
    expect(allow("t1", "b", 3, 60_000, t + 10)).toBe(true); // other visitors unaffected
    expect(allow("t1", "a", 3, 60_000, t + 61_000)).toBe(true);
  });
  it("keys by player when known, else by IP", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } });
    expect(clientKey(req)).toBe("ip:1.2.3.4");
    expect(clientKey(req, "user-9")).toBe("u:user-9");
  });
  it("answers 429 with Retry-After", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9" } });
    expect(rateLimit(req, "t2", 1, 30_000)).toBeNull();
    const res = rateLimit(req, "t2", 1, 30_000)!;
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
  });
});
