// Squad invite link: /squad/join/<code>. Owner: Angie.
import type { Metadata } from "next";
import { JoinSquadPage } from "@/features/compete/join-squad-page";

export const metadata: Metadata = { title: "Join a squad" };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinSquadPage code={code} />;
}
