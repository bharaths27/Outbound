// Station hub (deep link). Owner: Angie (hub UI) + Verna (countdown).
export default async function StationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="p-8"><h1 className="text-2xl font-bold">Station {id}</h1></main>;
}
