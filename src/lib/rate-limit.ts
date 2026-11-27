// A small per-visitor rate limit for API routes that spend money (AI models, Google Maps) or
// devnet SOL. In memory, so on serverless it's per instance: it stops scripted floods from one
// client, not a distributed attack. For that, add Vercel Firewall rate limiting on /api/*.

const hits = new Map<string, number[]>();

export function clientKey(req: Request, who?: string | null): string {
  if (who) return `u:${who}`;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${fwd || req.headers.get("x-real-ip") || "unknown"}`;
}

/** True if this call is allowed (and counts it). */
export function allow(bucket: string, key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const k = `${bucket}|${key}`;
  const recent = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(k, recent);
    return false;
  }
  recent.push(now);
  hits.set(k, recent);
  if (hits.size > 5000) for (const [kk, ts] of hits) if (!ts.some((t) => now - t < windowMs)) hits.delete(kk);
  return true;
}

/** Returns a 429 response when over the limit, or null to carry on. */
export function rateLimit(req: Request, bucket: string, max: number, windowMs: number, who?: string | null): Response | null {
  if (allow(bucket, clientKey(req, who), max, windowMs)) return null;
  return Response.json(
    { error: "Too many requests. Wait a minute and try again.", hint: "RATE_LIMITED" },
    { status: 429, headers: { "retry-after": String(Math.ceil(windowMs / 1000)) } },
  );
}
