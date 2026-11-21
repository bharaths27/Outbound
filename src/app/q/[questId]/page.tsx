// The page a share-card QR code opens. Owner: Angie.
export default async function QuestSharePage({ params }: { params: Promise<{ questId: string }> }) {
  const { questId } = await params;
  return <main className="p-8"><h1 className="text-2xl font-bold">Quest {questId}</h1></main>;
}
