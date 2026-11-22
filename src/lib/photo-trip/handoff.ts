import { createHmac, timingSafeEqual } from "node:crypto";
import type { GuidePlace } from "./types";

type Subject = { kind: "food"; dish: string } | { kind: "location"; destination: GuidePlace };

function signature(payload: string, key: string) {
  return createHmac("sha256", key).update("outbound-photo-trip:").update(payload).digest();
}

// Carry the verified subject between requests without resending the photo or trusting client-supplied destinations.
export function signSubject(subject: Subject, key: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ subject, expires: now + 30 * 60_000 })).toString("base64url");
  return `${payload}.${signature(payload, key).toString("base64url")}`;
}

export function readSubject(token: string, key: string, now = Date.now()): Subject | undefined {
  if (!/^[\w-]{1,3500}\.[\w-]{43}$/.test(token)) return;
  const [payload, signed] = token.split(".");
  const supplied = Buffer.from(signed, "base64url");
  const expected = signature(payload, key);
  if (!timingSafeEqual(supplied, expected)) return;
  const { subject, expires } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { subject: Subject; expires: number };
  if (expires > now) return subject;
}
