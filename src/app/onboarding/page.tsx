// Owner: Angie. Full-screen (no tab bar): see BARE_ROUTES in the app shell.
import type { Metadata } from "next";
import { OnboardingPage } from "@/features/auth/onboarding-page";

export const metadata: Metadata = { title: "Welcome" };

export default function Page() {
  return <OnboardingPage />;
}
