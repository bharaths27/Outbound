"use client";

// "Vote for next week's quest": rpc('recommend_quest'). The backend only counts a vote
// from someone who checked in at the quest this week, so the button shows only then.
// Next week's Quest of the Week is the one with the most votes.

import { Check, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { data } from "@/lib/data";
import type { Visit } from "@/lib/data/types";
import { bostonDateKey, bostonWeekStart } from "@/features/quests/daily";

// Votes cast in this page load, keyed by player and quest, so signing in as someone else
// doesn't show their button as already voted. The backend ignores repeat votes anyway.
const voted = new Set<string>();

export function RecommendButton({ questId, visits, className, compact = false }: { questId: string; visits: Visit[]; className?: string; compact?: boolean }) {
  const key = `${visits[0]?.user_id ?? "anon"}:${questId}`;
  const [state, setState] = useState<"idle" | "busy" | "done">(voted.has(key) ? "done" : "idle");
  const week = bostonWeekStart(bostonDateKey(new Date()));
  const eligible = visits.some((v) => v.quest_id === questId && v.visit_date >= week);
  if (!eligible) return null;

  async function vote() {
    setState("busy");
    try {
      await data.recommendQuest(questId);
      voted.add(key);
      setState("done");
      toast.success("Thanks! Your vote counts toward next week’s Quest of the Week.");
    } catch {
      setState("idle");
      toast.error("Your vote didn’t go through. Try again in a moment.");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={vote}
      disabled={state !== "idle"}
      aria-label={compact ? (state === "done" ? "Voted for next week" : "Vote for next week’s quest") : undefined}
      title={compact ? "Vote for next week’s Quest of the Week" : undefined}
    >
      {state === "done" ? <Check aria-hidden /> : <ThumbsUp aria-hidden />}
      {compact ? (state === "done" ? "Voted" : "Vote") : state === "done" ? "Voted for next week" : "Vote for next week’s quest"}
    </Button>
  );
}
