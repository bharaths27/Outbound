"use client";

// Leaderboard (/leaderboard; "Compete" before DESIGN.md v1): Schools, Players and Squads as a
// segmented toggle (DESIGN.md §2.2, references leaderboard-schools and leaderboard-squads).
// Phones: the toggle and the podium sit in the maroon title band. Desktop: the toggle is
// beside the title and the podium is a maroon card. Weekly only (§11.2).
// /leaderboard?tab=squads (or players) opens that tab; the join page sends players to Squads.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { data } from "@/lib/data";
import type { LeaderboardRow } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/features/hub/use-player";
import { PageHeader } from "@/features/shell/page-header";
import { rankSchools } from "./compete";
import { Podium, SchoolsTab, type SchoolsLoad } from "./schools-tab";
import { PlayersTab } from "./players-tab";
import { SquadsTab } from "./squads-tab";

type Tab = "schools" | "players" | "squads";
const TAB_IDS: Tab[] = ["schools", "players", "squads"];
const TITLE: Record<Tab, string> = { schools: "School Leaderboard", players: "Top Players", squads: "Squads" };

export function CompetePage() {
  return (
    <Suspense fallback={null}>
      <Leaderboard />
    </Suspense>
  );
}

const TROPHY = "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8";

function Leaderboard() {
  const param = useSearchParams().get("tab");
  const initial: Tab = TAB_IDS.find((t) => t === param) ?? "schools";
  const [tab, setTab] = useState<Tab>(initial);
  const { player, loaded: playerLoaded } = usePlayer();
  const [load, setLoad] = useState<SchoolsLoad>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    data
      .getSchoolLeaderboard()
      .then((rows: LeaderboardRow[]) => !cancelled && setLoad({ status: "ready", rows }))
      .catch(() => !cancelled && setLoad({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const selectTab = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t !== "schools") url.searchParams.set("tab", t);
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  };

  const profile = player.profile;
  const ranked = load.status === "ready" ? rankSchools(load.rows, profile?.school_id ?? null) : null;
  const podium = ranked?.rows.filter((r) => r.rank !== null && r.rank <= 3) ?? [];

  return (
    <>
      <PageHeader
        title={TITLE[tab]}
        icon={
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-gold">
            <path d={TROPHY} />
          </svg>
        }
        className="desk:pb-0"
        desktopAside={<Segmented tab={tab} onChange={selectTab} />}
      >
        <Segmented tab={tab} onChange={selectTab} onMaroon />
        {tab === "schools" && podium.length > 0 && <Podium rows={podium} className="-mb-4 mt-[18px]" />}
      </PageHeader>

      <div className="mx-auto w-full max-w-[720px] px-4 pt-3.5 pb-8 desk:max-w-[1360px] desk:px-8 desk:pt-6 desk:pb-12">
        <p className="mb-6 hidden text-base text-muted-foreground desk:block">
          {tab === "schools"
            ? "Every quest you finish adds XP to your school’s total."
            : tab === "players"
              ? "This week’s top explorers across every school."
              : "Squads can mix schools. Check in together for bonus XP."}
        </p>
        <div id="panel-schools" role="tabpanel" aria-label="Schools" hidden={tab !== "schools"}>
          <SchoolsTab
            load={load}
            ranked={ranked}
            player={player}
            playerLoaded={playerLoaded}
            onRetry={() => {
              setLoad({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
          />
        </div>
        <div id="panel-players" role="tabpanel" aria-label="Players" hidden={tab !== "players"}>
          <PlayersTab myId={profile?.id ?? null} active={tab === "players"} />
        </div>
        <div id="panel-squads" role="tabpanel" aria-label="Squads" hidden={tab !== "squads"}>
          {playerLoaded && profile === null && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="type-heading">Sign in to make a squad</p>
              <p className="type-body max-w-sm text-muted-foreground">Squads can mix schools. Check in together for bonus XP.</p>
              <Button asChild>
                <Link href="/login?next=/leaderboard?tab=squads">Sign in</Link>
              </Button>
            </div>
          )}
          {profile && tab === "squads" && <SquadsTab myId={profile.id} />}
        </div>
      </div>
    </>
  );
}

/** Schools / Squads. Sand track with a maroon pill; on the maroon band, a paper pill (DESIGN.md §5). */
function Segmented({ tab, onChange, onMaroon = false }: { tab: Tab; onChange: (t: Tab) => void; onMaroon?: boolean }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "schools", label: "Schools" },
    { id: "players", label: "Players" },
    { id: "squads", label: "Squads" },
  ];
  // Arrow keys move between tabs (and select them); only the selected tab is in the Tab order.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === tab);
    const next =
      e.key === "ArrowRight" ? (i + 1) % tabs.length
      : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? tabs.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Leaderboard"
      onKeyDown={onKeyDown}
      className={cn(
        "flex gap-1 rounded-full p-1",
        onMaroon ? "bg-white/14" : "bg-sand",
      )}
    >
      {tabs.map((t) => {
        const on = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            aria-controls={`panel-${t.id}`}
            onClick={() => onChange(t.id)}
            className={cn(
              "rounded-full border-0 font-semibold outline-none focus-visible:ring-2",
              onMaroon ? "h-11 flex-1 text-sm focus-visible:ring-gold" : "h-11 px-[22px] text-[15px] focus-visible:ring-maroon focus-visible:ring-offset-2",
              on && onMaroon && "bg-paper font-bold text-maroon",
              on && !onMaroon && "bg-maroon font-bold text-white",
              !on && onMaroon && "text-white",
              !on && !onMaroon && "text-muted-2",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
