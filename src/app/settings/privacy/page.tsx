// Owner: Angie.
import type { Metadata } from "next";
import { PrivacyPage } from "@/features/settings/privacy-page";

export const metadata: Metadata = { title: "Privacy" };

export default function Page() {
  return <PrivacyPage />;
}
