import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicQuest } from "@/lib/public-quest";

export default async function QuestSharePage({ params }: { params: Promise<{ questId: string }> }) {
  const { questId } = await params;
  const quest = await getPublicQuest(questId);
  if (!quest) notFound();

  return (
    <main className="mx-auto max-w-xl space-y-4 p-8">
      <p>Outbound · Boston Passport</p>
      <h1 className="text-2xl font-bold">{quest.title}</h1>
      {quest.station && <p>{quest.station.name} · {quest.station.neighborhood}</p>}
      {quest.description && <p>{quest.description}</p>}
      <p>{quest.xp} base XP</p>
      <Link href="/" className="underline">Explore the quest map</Link>
    </main>
  );
}
