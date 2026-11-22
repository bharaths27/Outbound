// Host: students and clubs publish events that show on the map (src/features/host).
import type { Metadata } from "next";
import { HostPage } from "@/features/host/host-page";

export const metadata: Metadata = { title: "Host" };

export default function Page() {
  return <HostPage />;
}
