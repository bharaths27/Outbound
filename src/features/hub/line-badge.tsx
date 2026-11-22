// Line marks for a station: a line-color dot with the line name in ink text (white text
// on orange fails contrast). Station.lines holds route names
// ("Red", "Green-B"), so Green branches collapse into one badge: "Green B C D".

import { LINE_COLORS } from "@/lib/lines";

type LineName = keyof typeof LINE_COLORS;

export interface LineGroup {
  line: LineName;
  branches: string[];
}

const ORDER: LineName[] = ["Red", "Orange", "Green", "Blue", "Silver"];

export function groupLines(routes: string[]): LineGroup[] {
  const groups = new Map<LineName, Set<string>>();
  for (const route of routes) {
    const [name, branch] = route.split("-");
    const line = (name === "Mattapan" ? "Silver" : name) as LineName;
    if (!(line in LINE_COLORS)) continue;
    const branches = groups.get(line) ?? new Set<string>();
    if (branch) branches.add(branch);
    groups.set(line, branches);
  }
  return ORDER.filter((l) => groups.has(l)).map((line) => ({ line, branches: [...groups.get(line)!].sort() }));
}

/** In headers: a colored dot plus the line and branches ("Green B C D E"), DESIGN.md §5. */
export function LineBadge({ group }: { group: LineGroup }) {
  const label = [group.line, ...group.branches].join(" ");
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm font-semibold"
      aria-label={`${group.line} Line${group.branches.length ? `, branches ${group.branches.join(", ")}` : ""}`}
    >
      <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: LINE_COLORS[group.line] }} />
      {label}
    </span>
  );
}

export function LineBadges({ routes }: { routes: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {groupLines(routes).map((g) => (
        <LineBadge key={g.line} group={g} />
      ))}
    </div>
  );
}

const LETTER: Record<LineName, string> = { Red: "R", Orange: "O", Green: "G", Blue: "B", Silver: "SL" };
// White text on orange fails contrast, so badges use a darker orange (DESIGN.md §3).
const BADGE_BG: Partial<Record<LineName, string>> = { Orange: "#C46A00" };

/** A colored circle with a white letter (G / R / O / B / SL), DESIGN.md §5 Line badge. */
export function LineLetter({ line, size = 20 }: { line: LineName; size?: number }) {
  return (
    <span
      aria-label={`${line} Line`}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.55, backgroundColor: BADGE_BG[line] ?? LINE_COLORS[line] }}
    >
      {LETTER[line]}
    </span>
  );
}
