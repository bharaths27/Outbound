// Password rules for new accounts. Matches the Supabase Auth password policy the team should
// turn on (Authentication → Policies: min length 8, lowercase + uppercase + digits/symbols),
// so the server enforces the same thing.

export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { id: "lower", label: "A lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { id: "upper", label: "An uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { id: "other", label: "A number or symbol", test: (p: string) => /[^A-Za-z]/.test(p) },
] as const;

// The most-used passwords (and their obvious variants) pass the rules above but get guessed first.
const COMMON = new Set(
  [
    "password1", "password1!", "password123", "passw0rd", "p@ssw0rd", "p@ssword1", "qwerty123", "qwerty1!", "welcome1",
    "welcome123", "letmein1", "iloveyou1", "abc12345", "abcd1234", "admin123", "monkey123", "dragon123", "sunshine1",
    "football1", "baseball1", "princess1", "trustno1", "changeme1", "summer2026", "winter2026", "spring2026", "fall2026",
    "boston123", "redsox123", "patriots1", "outbound1",
  ].map((s) => s.toLowerCase()),
);

export interface PasswordCheck {
  ok: boolean;
  rules: { id: string; label: string; ok: boolean }[];
  /** Set when the password is too common or contains the email name. */
  problem: string | null;
}

export function checkPassword(password: string, email = ""): PasswordCheck {
  const rules = PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(password) }));
  const lower = password.toLowerCase();
  const handle = email.split("@")[0]?.toLowerCase() ?? "";
  let problem: string | null = null;
  if (COMMON.has(lower) || /^(.)\1+$/.test(password) || /^(?:0123456789|12345678|87654321)/.test(password)) {
    problem = "That password is too common. Pick something only you would know.";
  } else if (handle.length >= 3 && lower.includes(handle)) {
    problem = "Don't put your email name in your password.";
  }
  return { ok: rules.every((r) => r.ok) && !problem, rules, problem };
}
