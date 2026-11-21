// Line badges for a station: an outline pill with a small line-color dot and foreground
// text (DESIGN.md: white text on orange fails contrast). Station.lines holds route names
// ("Red", "Green-B"), so Green branches collapse into one badge: "Green B C D".

import { Badge } from "@/components/ui/badge";
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

export function LineBadge({ group }: { group: LineGroup }) {
  const label = [group.line, ...group.branches].join(" ");
  return (
    <Badge variant="outline" aria-label={`${group.line} Line${group.branches.length ? `, branches ${group.branches.join(", ")}` : ""}`}>
      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: LINE_COLORS[group.line] }} />
      {label}
    </Badge>
  );
}

export function LineBadges({ routes }: { routes: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {groupLines(routes).map((g) => (
        <LineBadge key={g.line} group={g} />
      ))}
    </div>
  );
}
