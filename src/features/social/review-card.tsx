"use client";

// A review on a profile board, a quest page or the friends feed: score, place, note, and
// likes and comments for anyone who can see it.

import { Heart, Loader2, MessageCircle, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { data } from "@/lib/data";
import type { CommentWithAuthor, ReviewWithMeta } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { scoreTone } from "./insights";

const TONE = {
  high: "bg-[#E3F1E8] text-[#1F5A3F] ring-[#2F6B4F]/40",
  mid: "bg-[#FCEFD0] text-[#7A4E00] ring-[#C7901A]/40",
  low: "bg-[#F8E1E6] text-[#8A2A44] ring-[#8A2A44]/35",
};

export function Score({ rating, size = 44, className }: { rating: number; size?: number; className?: string }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-bold tabular-nums ring-2", TONE[scoreTone(rating)], className)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-label={`Rated ${rating.toFixed(1)} out of 10`}
    >
      {rating.toFixed(1)}
    </span>
  );
}

export function shortDate(d: string) {
  return new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.slice(0, 4) === String(new Date().getFullYear()) ? undefined : "numeric", timeZone: "UTC" });
}

export function ReviewCard({
  review,
  showAuthor = false,
  signedIn,
  myId,
  onDelete,
}: {
  review: ReviewWithMeta;
  showAuthor?: boolean;
  signedIn: boolean;
  myId: string | null;
  onDelete?: () => void;
}) {
  const [liked, setLiked] = useState(review.liked_by_me);
  const [likes, setLikes] = useState(review.likes);
  const [pop, setPop] = useState(0);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(review.comments);

  async function toggleLike() {
    if (!signedIn) return toast("Sign in to like reviews");
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    if (next) setPop((p) => p + 1);
    try {
      await data.setLiked(review.id, next);
    } catch {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      toast.error("That didn't go through.");
    }
  }

  const place = review.quest_id ? (
    <Link href={`/q/${review.quest_id}`} className="font-bold text-ink underline-offset-4 hover:text-maroon hover:underline">
      {review.place_name}
    </Link>
  ) : (
    <span className="font-bold text-ink">{review.place_name}</span>
  );

  return (
    <article className="rounded-2xl border border-border bg-surface p-3.5 transition-shadow hover:shadow-card" data-testid="review">
      <div className="flex items-start gap-3">
        <Score rating={review.rating} />
        <div className="min-w-0 flex-1">
          {showAuthor && (
            <p className="text-[13px] text-muted-foreground">
              <Link href={`/u/${review.author.id}`} className="font-semibold text-maroon hover:underline">
                {review.author.display_name}
              </Link>{" "}
              rated
            </p>
          )}
          <p className="text-[15px] leading-snug">{place}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{shortDate(review.visited_on)}</span>
            {review.source === "google" && <span className="rounded-full bg-sand px-1.5 py-px font-semibold">From Google</span>}
            {review.place_address && <span className="truncate">{review.place_address}</span>}
          </p>
        </div>
        {onDelete && myId === review.user_id && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete your review of ${review.place_name}`}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-sand hover:text-ink"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {review.note && <p className="mt-2.5 text-sm leading-relaxed text-ink-2">{review.note}</p>}
      <div className="mt-2.5 flex items-center gap-1 text-[13px] font-semibold text-muted-foreground">
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={liked}
          aria-label={liked ? "Unlike" : "Like"}
          className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 transition-colors hover:bg-sand", liked && "text-[#C2185B]")}
        >
          <Heart key={pop} className={cn("size-4", liked && "fill-current", pop > 0 && liked && "ob-heart-pop")} aria-hidden />
          <span className="tabular-nums">{likes}</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 transition-colors hover:bg-sand"
        >
          <MessageCircle className="size-4" aria-hidden />
          <span className="tabular-nums">{count}</span>
          <span className="sr-only">comments</span>
        </button>
      </div>
      {open && <Comments reviewId={review.id} signedIn={signedIn} myId={myId} reviewOwner={review.user_id} onCount={setCount} />}
    </article>
  );
}

function Comments({
  reviewId,
  signedIn,
  myId,
  reviewOwner,
  onCount,
}: {
  reviewId: string;
  signedIn: boolean;
  myId: string | null;
  reviewOwner: string;
  onCount: (n: number) => void;
}) {
  const [list, setList] = useState<CommentWithAuthor[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    data
      .getComments(reviewId)
      .then((l) => live && setList(l))
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, [reviewId]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const c = await data.addComment(reviewId, text);
      const next = [...(list ?? []), c];
      setList(next);
      onCount(next.length);
      setText("");
    } catch {
      toast.error("Your comment didn't post. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const next = (list ?? []).filter((c) => c.id !== id);
    setList(next);
    onCount(next.length);
    await data.deleteComment(id).catch(() => toast.error("Couldn't delete that comment."));
  }

  return (
    <div className="mt-2 flex animate-in flex-col gap-2 border-t border-border pt-2.5 fade-in duration-200">
      {list === null ? (
        <p className="text-xs text-muted-foreground">Loading comments…</p>
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((c) => (
            <li key={c.id} className="group flex items-start gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <Link href={`/u/${c.author.id}`} className="font-semibold text-maroon hover:underline">
                  {c.author.display_name}
                </Link>{" "}
                <span className="text-ink-2">{c.text}</span>
              </span>
              {(c.user_id === myId || reviewOwner === myId) && (
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  aria-label="Delete comment"
                  className="text-muted-foreground opacity-50 hover:text-ink group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {signedIn ? (
        <form onSubmit={post} className="flex items-center gap-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            placeholder="Add a comment"
            aria-label="Add a comment"
            className="h-9 min-w-0 flex-1 rounded-full border border-input bg-background px-3.5 text-base outline-none focus:border-maroon desk:text-sm"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            aria-label="Post comment"
            className="grid size-9 place-items-center rounded-full bg-maroon text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          </button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">
          <Link href="/login" className="font-semibold text-maroon underline">
            Sign in
          </Link>{" "}
          to comment.
        </p>
      )}
    </div>
  );
}
