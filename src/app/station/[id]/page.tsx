// Deep link to a station. There is one hub implementation, the drawer or sheet over the
// map, so this redirects to /?station=<id> (Angie, 2026-11-21).
import { redirect } from "next/navigation";

export default async function StationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/?station=${encodeURIComponent(id)}`);
}
