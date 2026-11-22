// Events: every event quest near the T, open now first (src/features/events).
import type { Metadata } from "next";
import { EventsPage } from "@/features/events/events-page";

export const metadata: Metadata = { title: "Events" };

export default function Page() {
  return <EventsPage />;
}
