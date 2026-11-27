// School sticker logos (public/schools/*.webp), looked up by email domain or by name.
// Schools without a sticker fall back to a colored circle with initials.

import { cn } from "@/lib/utils";

const BY_DOMAIN: Record<string, string> = {
  "bu.edu": "bu",
  "northeastern.edu": "northeastern",
  "mit.edu": "mit",
  "harvard.edu": "harvard",
  "tufts.edu": "tufts",
  "bc.edu": "bc",
  "umb.edu": "umass-boston",
  "umass.edu": "umass-amherst",
  "berklee.edu": "berklee",
  "wit.edu": "wentworth",
  "brandeis.edu": "brandeis",
  "bentley.edu": "bentley",
};

// Name matches, most specific first ("UMass Boston" before "Boston").
const BY_NAME: [RegExp, string][] = [
  [/umass\s*boston|massachusetts boston/i, "umass-boston"],
  [/umass|amherst/i, "umass-amherst"],
  [/boston college/i, "bc"],
  [/boston university|^bu$/i, "bu"],
  [/northeastern/i, "northeastern"],
  [/\bmit\b|massachusetts institute/i, "mit"],
  [/harvard/i, "harvard"],
  [/tufts/i, "tufts"],
  [/berklee/i, "berklee"],
  [/wentworth/i, "wentworth"],
  [/brandeis/i, "brandeis"],
  [/bentley/i, "bentley"],
];

export function schoolLogoSrc(school: { name?: string | null; email_domain?: string | null } | null | undefined): string | null {
  if (!school) return null;
  const d = school.email_domain?.toLowerCase().replace(/^.*@/, "");
  if (d && BY_DOMAIN[d]) return `/schools/${BY_DOMAIN[d]}.webp`;
  const name = school.name?.trim() ?? "";
  for (const [re, slug] of BY_NAME) if (re.test(name)) return `/schools/${slug}.webp`;
  return null;
}

export function schoolInitials(name: string): string {
  const words = name.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter((w) => w && !/^(of|the|and|college|university)$/i.test(w));
  if (/^[A-Z]{2,4}$/.test(name.trim())) return name.trim();
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [name.slice(0, 2)]).join("").toUpperCase();
}

/**
 * The school's sticker, sized by height. Without a sticker: a colored circle with initials.
 * Decorative by default (the school name is always written next to it).
 */
export function SchoolLogo({
  school,
  height,
  className,
  tilt = 0,
  label,
}: {
  school: { name: string; email_domain?: string | null; color?: string | null };
  height: number;
  className?: string;
  tilt?: number;
  label?: string;
}) {
  const src = schoolLogoSrc(school);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small static stickers
      <img
        src={src}
        alt={label ?? ""}
        aria-hidden={label ? undefined : true}
        draggable={false}
        style={{ height, width: "auto", rotate: tilt ? `${tilt}deg` : undefined }}
        className={cn("shrink-0 object-contain drop-shadow-[0_2px_3px_rgb(74_20_36/0.25)] select-none", className)}
      />
    );
  }
  const initials = schoolInitials(school.name);
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ height, width: height, background: school.color ?? "#6E5A5E", fontSize: height * (initials.length > 2 ? 0.28 : 0.34) }}
      className={cn("grid shrink-0 place-items-center rounded-full font-bold text-white ring-2 ring-white/80", className)}
    >
      {initials}
    </span>
  );
}
