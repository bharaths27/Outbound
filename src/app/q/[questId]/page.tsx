// Full-page quest detail: the page a share-card QR code opens. Owner: Angie.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuestPage } from "@/features/hub/quest-page";
import { data } from "@/lib/data";

type Props = { params: Promise<{ questId: string }> };

async function load(questId: string) {
  const quest = await data.getQuest(questId);
  if (!quest) return null;
  const station = await data.getStation(quest.station_id);
  return station ? { quest, station } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load((await params).questId);
  if (!found) return { title: "Quest not found" };
  return {
    title: found.quest.title,
    description: found.quest.description ?? `A quest near ${found.station.name} station`,
  };
}

export default async function QuestSharePage({ params }: Props) {
  const found = await load((await params).questId);
  if (!found) notFound();
  return <QuestPage quest={found.quest} station={found.station} />;
}
