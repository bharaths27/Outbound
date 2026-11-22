// Events: not designed yet (DESIGN.md §2.4, §12). Events still appear as a quest type in the
// station hub. Owner: Angie.
import type { Metadata } from "next";
import { ComingSoon } from "@/features/shell/coming-soon";

export const metadata: Metadata = { title: "Events" };

export default function Page() {
  return (
    <ComingSoon
      title="Events"
      body="A calendar of shows, markets, and pop-ups near the T is on the way. For now, events show up as quests in each station's hub."
    />
  );
}
