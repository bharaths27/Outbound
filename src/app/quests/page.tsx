// Quests: "Today's quests" across stations (DESIGN.md §2.3). Owner: Angie.
import type { Metadata } from "next";
import { QuestsPage } from "@/features/quests/quests-page";

export const metadata: Metadata = { title: "Quests" };

export default function Page() {
  return <QuestsPage />;
}
