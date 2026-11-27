// A player's profile board: where they've been, ratings, want-to-go list. Privacy applies.
import type { Metadata } from "next";
import { UserBoardPage } from "@/features/social/user-board-page";

export const metadata: Metadata = { title: "Profile" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserBoardPage userId={decodeURIComponent(id)} />;
}
