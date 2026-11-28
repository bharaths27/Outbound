"use client";

// On a quest: rate it (1–10 with a note) once you've checked in, or save it to your
// want-to-go list before you go. Below, what friends and public players thought.

import { Bookmark, BookmarkCheck, Loader2, Star } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { data } from "@/lib/data";
import type { MyPlaceState, ReviewWithMeta } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { ReviewCard, Score } from "./review-card";

const WORDS: [number, string][] = [
  [9, "Loved it"],
  [7.5, "Really liked it"],
  [6, "It was fine"],
  [4, "Not for me"],
  [0, "Didn't like it"],
];
const wordFor = (r: number) => WORDS.find(([min]) => r >= min)![1];

export function RatePanel({ questId, signedIn, myId }: { questId: string; signedIn: boolean; myId: string | null }) {
  const [me, setMe] = useState<MyPlaceState | null>(null);
  const [others, setOthers] = useState<ReviewWithMeta[] | null>(null);
  const [rating, setRating] = useState(8);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [state, list] = await Promise.all([
      signedIn ? data.getMyPlaceState(questId) : Promise.resolve({ visited: false, saved: false, review: null }),
      data.getQuestReviews(questId).catch(() => []),
    ]);
    setMe(state);
    setOthers(list);
    if (state.review) {
      setRating(state.review.rating);
      setNote(state.review.note);
    }
  }, [questId, signedIn]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      await data.saveReview(questId, rating, note);
      toast(me?.review ? "Rating updated" : "Rated! It's on your profile board.");
      setEditing(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSaved() {
    if (!me) return;
    const next = !me.saved;
    setMe({ ...me, saved: next });
    try {
      await data.setSaved(questId, next);
      toast(next ? "Saved to your want-to-go list" : "Removed from your list");
    } catch {
      setMe({ ...me, saved: !next });
      toast.error("That didn't save.");
    }
  }

  const avg = others?.length ? Math.round((others.reduce((s, r) => s + r.rating, 0) / others.length) * 10) / 10 : null;
  const showForm = me?.visited && (!me.review || editing);

  return (
    <section aria-label="Ratings" className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface px-4 py-3.5" data-testid="rate-panel">
      <div className="flex items-center gap-3">
        <h3 className="flex-1 text-[15px] font-bold">Ratings</h3>
        {avg !== null && (
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Score rating={avg} size={30} /> avg of {others!.length}
          </span>
        )}
      </div>

      {!signedIn ? (
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="font-semibold text-maroon underline">
            Sign in
          </Link>{" "}
          to rate places and save them for later.
        </p>
      ) : me === null ? (
        <div className="h-10 animate-pulse rounded-xl bg-sand" aria-hidden />
      ) : showForm ? (
        <div className="flex flex-col gap-3 rounded-xl bg-cream p-3">
          <div className="flex items-center gap-3">
            <Score rating={rating} size={56} className="transition-colors" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{wordFor(rating)}</p>
              <input
                type="range"
                min={1}
                max={10}
                step={0.1}
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                aria-label="Your rating out of 10"
                className="ob-range mt-1 w-full"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground" aria-hidden>
                <span>1</span>
                <span>10</span>
              </div>
            </div>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={600}
            rows={2}
            placeholder="What should friends know? (optional)"
            aria-label="Your note"
            className="w-full resize-none rounded-xl border border-input bg-surface px-3 py-2 text-base outline-none focus:border-maroon desk:text-sm"
          />
          <div className="flex gap-2">
            {editing && (
              <button type="button" onClick={() => setEditing(false)} className="h-9 rounded-xl border border-border-strong px-4 text-sm font-semibold">
                Cancel
              </button>
            )}
            <button type="button" onClick={save} disabled={busy} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-maroon text-sm font-bold text-white hover:bg-maroon-600 disabled:opacity-60">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Star className="size-4" aria-hidden />}
              {me.review ? "Update rating" : "Save rating"}
            </button>
          </div>
        </div>
      ) : me.review ? (
        <div className="flex items-center gap-3 rounded-xl bg-cream p-3">
          <Score rating={me.review.rating} size={44} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">You rated it · {wordFor(me.review.rating)}</p>
            {me.review.note && <p className="truncate text-[13px] text-muted-foreground">{me.review.note}</p>}
          </div>
          <button type="button" onClick={() => setEditing(true)} className="h-8 rounded-full px-3 text-[13px] font-semibold text-maroon hover:bg-sand">
            Edit
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleSaved}
            aria-pressed={me.saved}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-all active:scale-95",
              me.saved ? "bg-gold text-gold-foreground" : "border border-border-strong text-maroon hover:bg-sand",
            )}
          >
            {me.saved ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
            {me.saved ? "On your want-to-go list" : "Want to go"}
          </button>
          <span className="text-[13px] text-muted-foreground">Check in to rate it.</span>
        </div>
      )}

      {others && others.filter((r) => r.user_id !== myId).length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-muted-foreground">What people thought</p>
          {others
            .filter((r) => r.user_id !== myId)
            .slice(0, 4)
            .map((r) => (
              <ReviewCard key={r.id} review={r} showAuthor signedIn={signedIn} myId={myId} />
            ))}
        </div>
      )}
    </section>
  );
}
