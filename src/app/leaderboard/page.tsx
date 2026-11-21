// Compete: weekly school leaderboard and squads. Owner: Angie.
import type { Metadata } from "next";
import { CompetePage } from "@/features/compete/compete-page";

export const metadata: Metadata = { title: "Compete" };

export default function Page() {
  return <CompetePage />;
}
