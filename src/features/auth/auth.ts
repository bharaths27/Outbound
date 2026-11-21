// Pure helpers for sign-in. The backend gates sign-up by school email domain
// (handle_new_user()); the login screen checks the domain first so it can say which
// schools are supported before sending anything.

import type { School } from "@/lib/data/types";

export function isEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

/** The school for an email, matching the domain or a subdomain (husky.neu.edu → neu.edu). */
export function schoolForEmail(email: string, schools: School[]): School | null {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  if (!domain) return null;
  return (
    schools
      .filter((s) => domain === s.email_domain || domain.endsWith(`.${s.email_domain}`))
      .sort((a, b) => b.email_domain.length - a.email_domain.length)[0] ?? null
  );
}

/** Only same-site paths, so ?next= can't send people to another website. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
