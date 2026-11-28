"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { data } from "@/lib/data";
import { PageHeader } from "@/features/shell/page-header";
import { ProfileBoardView } from "./profile-board";

export function UserBoardPage({ userId }: { userId: string }) {
  const router = useRouter();
  // Your own board lives on Profile.
  useEffect(() => {
    data.getCurrentUser().then((me) => me?.id === userId && router.replace("/profile")).catch(() => {});
  }, [userId, router]);
  return (
    <>
      <PageHeader title="Explorer" back={{ href: "/leaderboard?tab=players", label: "Players" }} desktopBackOnly />
      <div className="mx-auto w-full max-w-xl px-4 py-6 desk:max-w-[1100px] desk:px-8">
        <ProfileBoardView userId={userId} />
      </div>
    </>
  );
}
