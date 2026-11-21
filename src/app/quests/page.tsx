// Quests: "Today's quests" across stations (DESIGN.md §2.3). Waiting on the backend's
// answer for how the daily list and "done" work, so this is a placeholder. Owner: Angie.
import type { Metadata } from "next";
import { ComingSoon } from "@/features/shell/coming-soon";

export const metadata: Metadata = { title: "Quests" };

export default function Page() {
  return (
    <ComingSoon
      title="Today's quests"
      body="A daily list of quests across the T is coming soon. Until then, tap a station on the map to see what's nearby."
    />
  );
}
