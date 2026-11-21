// The team's demo logins on the real project (scripts/seed-demo.mjs, PR #7). They share
// DEMO_PASSWORD, which stays on the server: the login screen calls /api/demo-login, which
// only accepts these emails. They're is_demo, so they can check in without location.

import type { DemoAccount } from "../types";

export const SUPABASE_DEMO_ACCOUNTS: DemoAccount[] = [
  { id: "outbound-demo1@bu.edu", label: "Demo player, BU", blurb: "Boston University" },
  { id: "outbound-demo2@northeastern.edu", label: "Demo player, Northeastern", blurb: "Northeastern" },
  { id: "outbound-demo3@mit.edu", label: "Demo player, MIT", blurb: "MIT" },
  { id: "outbound-demo4@harvard.edu", label: "Demo player, Harvard", blurb: "Harvard" },
];

export const DEMO_EMAILS: ReadonlySet<string> = new Set(SUPABASE_DEMO_ACCOUNTS.map((a) => a.id));
