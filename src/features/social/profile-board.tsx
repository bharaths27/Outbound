"use client";

// The profile board (Beli-style): a memory of where someone has been in Boston. Stats for this
// month and overall, a calendar of visits, top rated places, then tabs for reviews, places
// they've been, their want-to-visit list and (on your own board) your friends' latest reviews.
// Privacy follows the profile setting: public, friends only, or only me.

import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Lock, MapPin, Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { data } from "@/lib/data";
import type { ProfileBoard, Quest, ReviewWithMeta, School, Station } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { FriendButton, useFriendships } from "@/features/friends/friends";
import { ProfileCard } from "@/features/profile-card/profile-card";
import { calendar, insights, monthCounts, monthLabel, shiftMonth, ym } from "./insights";
import { ReviewCard, Score, shortDate } from "./review-card";
import { parseTakeoutReviews } from "./takeout";

type Ctx = { board: ProfileBoard; quests: Map<string, Quest>; stations: Map<string, Station>; school: School | null; myId: string | null };
type Load = { status: "loading" } | { status: "missing" } | { status: "error" } | ({ status: "ready" } & Ctx);

const todayMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

export function ProfileBoardView({ userId, showHeader = true }: { userId: string; showHeader?: boolean }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const reload = useCallback(async () => {
    try {
      const [board, quests, stations, schools, me] = await Promise.all([
        data.getProfileBoard(userId),
        data.getAllQuests(),
        data.getStations(),
        data.getSchools(),
        data.getCurrentUser(),
      ]);
      if (!board) return setLoad({ status: "missing" });
      setLoad({
        status: "ready",
        board,
        quests: new Map(quests.map((q) => [q.id, q])),
        stations: new Map(stations.map((s) => [s.id, s])),
        school: schools.find((s) => s.id === board.profile.school_id) ?? null,
        myId: me?.id ?? null,
      });
    } catch {
      setLoad({ status: "error" });
    }
  }, [userId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  if (load.status === "loading") return <div className="h-64 animate-pulse rounded-2xl bg-sand motion-reduce:animate-none" aria-busy aria-label="Loading profile" />;
  if (load.status === "missing") return <p className="type-body py-10 text-center text-muted-foreground">This profile is private, or the player doesn&apos;t exist.</p>;
  if (load.status === "error") return <p className="type-body py-10 text-center text-muted-foreground">This profile didn&apos;t load. Refresh to try again.</p>;
  return <Board ctx={load} showHeader={showHeader} reload={reload} />;
}

function Board({ ctx, showHeader, reload }: { ctx: Ctx; showHeader: boolean; reload: () => Promise<void> }) {
  const { board, quests, stations, school, myId } = ctx;
  const p = board.profile;
  const name = p.display_name ?? "Player";
  const friends = useFriendships(!board.is_me ? myId : null);
  const hoodOf = useCallback((qid: string) => {
    const q = quests.get(qid);
    return q ? (stations.get(q.station_id)?.neighborhood ?? null) : null;
  }, [quests, stations]);

  const header = showHeader && (
    <ProfileCard
      profile={board.visible ? p : { ...p, bio: null, grad_year: null }}
      school={school}
      badges={board.badges}
      isMe={board.is_me}
      signedIn={!!myId}
      aside={myId && !board.is_me ? <FriendButton name={name} userId={p.id} friends={friends} /> : undefined}
      stats={
        board.visible
          ? [
              { label: "Quests done", value: new Set(board.visits.map((v) => v.quest_id)).size },
              { label: "Check-ins", value: board.visits.length },
              { label: "Reviews", value: board.reviews.length },
              { label: "Level", value: p.level },
            ]
          : []
      }
    />
  );

  if (!board.visible) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-sand text-maroon">
            <Lock className="size-5" aria-hidden />
          </span>
          <p className="type-heading">{p.privacy === "ghost" ? `${name} keeps their places private` : `${name} shares places with friends only`}</p>
          <p className="type-body max-w-sm text-muted-foreground">
            {p.privacy === "ghost" ? "Nobody else can see where they've been." : myId ? "Add them as a friend. Once they accept, their board opens up." : "Sign in and add them as a friend to see their board."}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {header}
      <BoardBody ctx={ctx} hoodOf={hoodOf} name={name} reload={reload} />
    </div>
  );
}

function BoardBody({ ctx, hoodOf, name, reload }: { ctx: Ctx; hoodOf: (q: string) => string | null; name: string; reload: () => Promise<void> }) {
  const { board, quests, myId } = ctx;
  const nowMonth = todayMonth();
  const [month, setMonth] = useState(nowMonth);
  const [day, setDay] = useState<string | null>(null);
  const [tab, setTab] = useState<"reviews" | "been" | "want" | "friends">("reviews");
  const [reviews, setReviews] = useState(board.reviews);
  useEffect(() => setReviews(board.reviews), [board.reviews]);

  const stats = useMemo(() => insights(board.visits, reviews, hoodOf, nowMonth), [board.visits, reviews, hoodOf, nowMonth]);
  const months = useMemo(() => monthCounts(board.visits, reviews, nowMonth, 6), [board.visits, reviews, nowMonth]);
  const cells = useMemo(() => calendar(board.visits, month), [board.visits, month]);
  const monthPlaces = new Set(board.visits.filter((v) => ym(v.visit_date) === month).map((v) => v.quest_id));
  const monthHoods = new Set([...monthPlaces].map(hoodOf).filter(Boolean));
  const you = board.is_me;
  const maxMonth = Math.max(1, ...months.map((m) => m.count));
  const dayVisits = day ? board.visits.filter((v) => v.visit_date === day) : [];

  async function removeReview(id: string) {
    setReviews((r) => r.filter((x) => x.id !== id));
    await data.deleteReview(id).catch(() => toast.error("Couldn't delete that review."));
  }

  const TILES = [
    { k: `In ${monthLabel(nowMonth, "long")}`, v: stats.placesThisMonth, s: stats.placesThisMonth === 1 ? "place" : "places" },
    { k: "All time", v: stats.placesAllTime, s: "places in Boston" },
    { k: "Neighborhoods", v: stats.neighborhoods, s: stats.topNeighborhood ? `most in ${stats.topNeighborhood.name}` : "explored" },
    { k: "Avg rating", v: stats.avgRating?.toFixed(1) ?? "–", s: `${stats.reviews} ${stats.reviews === 1 ? "review" : "reviews"}` },
  ];

  return (
    <>
      {/* Insight tiles */}
      <section aria-label="Insights" className="grid grid-cols-2 gap-2.5 desk:grid-cols-4">
        {TILES.map((t, i) => (
          <div
            key={t.k}
            className={cn("rounded-2xl border p-3.5", i === 0 ? "border-maroon bg-maroon text-white" : "border-border bg-surface")}
          >
            <p className={cn("text-xs font-semibold", i === 0 ? "text-on-maroon-muted" : "text-muted-foreground")}>{t.k}</p>
            <p className={cn("font-display text-[32px] leading-none font-semibold tabular-nums", i === 0 ? "text-gold" : "text-maroon")}>{t.v}</p>
            <p className={cn("mt-1 truncate text-xs", i === 0 ? "text-on-maroon-muted" : "text-muted-foreground")}>{t.s}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 desk:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* Memory calendar */}
        <section aria-label="Memory calendar" className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="type-heading">Memories</h2>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => (setMonth((m) => shiftMonth(m, -1)), setDay(null))} aria-label="Previous month" className="grid size-8 place-items-center rounded-full hover:bg-sand">
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <span className="min-w-[96px] text-center text-sm font-bold">
                {monthLabel(month, "long")} {month.slice(0, 4)}
              </span>
              <button
                type="button"
                onClick={() => (setMonth((m) => shiftMonth(m, 1)), setDay(null))}
                disabled={month >= nowMonth}
                aria-label="Next month"
                className="grid size-8 place-items-center rounded-full hover:bg-sand disabled:opacity-30"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {monthPlaces.size
              ? `${you ? "You" : name} visited ${monthPlaces.size} ${monthPlaces.size === 1 ? "place" : "places"} in ${monthHoods.size} ${monthHoods.size === 1 ? "neighborhood" : "neighborhoods"}.`
              : `No check-ins in ${monthLabel(month, "long")}.`}
          </p>
          <div className="mx-auto mt-3 grid max-w-[340px] grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground" aria-hidden>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="mx-auto mt-1 grid max-w-[340px] grid-cols-7 gap-1" role="grid" aria-label={`${monthLabel(month, "long")} visits`}>
            {cells.map((c, i) =>
              c ? (
                <button
                  key={c.date}
                  type="button"
                  disabled={!c.visits.length}
                  onClick={() => setDay(day === c.date ? null : c.date)}
                  aria-label={`${monthLabel(month, "long")} ${c.day}: ${c.visits.length} check-ins`}
                  aria-pressed={day === c.date}
                  className={cn(
                    "relative grid aspect-square place-items-center rounded-lg text-[13px] tabular-nums transition-transform",
                    c.visits.length ? "ob-bloom font-bold text-white hover:scale-110" : "text-muted-foreground",
                    c.visits.length === 1 && "bg-maroon/70",
                    c.visits.length >= 2 && "bg-maroon",
                    day === c.date && "ring-2 ring-gold ring-offset-1",
                  )}
                  style={c.visits.length ? { animationDelay: `${(i % 7) * 30}ms` } : undefined}
                >
                  {c.day}
                  {c.visits.length > 1 && <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-gold text-[9px] text-gold-foreground">{c.visits.length}</span>}
                </button>
              ) : (
                <span key={`e${i}`} />
              ),
            )}
          </div>
          {day && (
            <ul className="mt-3 flex animate-in flex-col gap-1.5 fade-in slide-in-from-top-1 duration-200">
              {dayVisits.map((v) => {
                const q = quests.get(v.quest_id);
                return (
                  <li key={v.id} className="flex items-center gap-2 text-sm">
                    <MapPin className="size-4 shrink-0 text-maroon" aria-hidden />
                    {q ? (
                      <Link href={`/q/${q.id}`} className="font-semibold hover:underline">
                        {q.title}
                      </Link>
                    ) : (
                      v.quest_id
                    )}
                    <span className="text-muted-foreground">· {hoodOf(v.quest_id)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {/* Last six months */}
          <div className="mt-4 flex h-20 items-end gap-2 border-t border-border pt-3" aria-label="Places per month">
            {months.map((m) => (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[11px] font-bold text-maroon tabular-nums">{m.count || ""}</span>
                <div className="w-full rounded-t-md bg-gold-500 transition-[height] duration-500" style={{ height: `${Math.max(3, (m.count / maxMonth) * 40)}px`, opacity: m.key === month ? 1 : 0.55 }} />
                <span className="text-[11px] text-muted-foreground">{m.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Top rated */}
        <section aria-label="Top rated" className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="type-heading">Top rated</h2>
          {stats.topRated.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{you ? "Rate a place you've checked in at and it shows up here." : "No ratings yet."}</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2.5">
              {stats.topRated.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3">
                  <span className="w-4 text-center font-display text-lg font-bold text-muted-foreground">{i + 1}</span>
                  <Score rating={r.rating} size={38} />
                  <span className="min-w-0 flex-1">
                    {r.quest_id ? (
                      <Link href={`/q/${r.quest_id}`} className="block truncate text-sm font-bold hover:underline">
                        {r.place_name}
                      </Link>
                    ) : (
                      <span className="block truncate text-sm font-bold">{r.place_name}</span>
                    )}
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.quest_id ? hoodOf(r.quest_id) : "From Google"} · {shortDate(r.visited_on)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {you && <ImportGoogle onDone={reload} />}
        </section>
      </div>

      {/* Tabs */}
      <section aria-label="Places">
        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-full bg-sand p-1 [scrollbar-width:none]">
          {(
            [
              ["reviews", `Reviews ${reviews.length}`],
              ["been", `Been ${new Set(board.visits.map((v) => v.quest_id)).size}`],
              ["want", `Want to go ${board.saved.length}`],
              ...(you ? [["friends", "Friends' picks"]] : []),
            ] as [typeof tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("h-8 shrink-0 flex-1 rounded-full px-3 text-[13px] font-semibold whitespace-nowrap transition-colors", tab === id ? "bg-maroon text-white shadow-sm" : "text-ink hover:bg-white/60")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          {tab === "reviews" &&
            (reviews.length ? (
              <div className="grid gap-2.5 desk:grid-cols-2">
                {reviews.map((r) => (
                  <ReviewCard key={r.id} review={r} signedIn={!!myId} myId={myId} onDelete={you ? () => removeReview(r.id) : undefined} />
                ))}
              </div>
            ) : (
              <Empty text={you ? "No reviews yet. Open a quest you've checked in at and rate it." : `${name} hasn't rated anything yet.`} />
            ))}
          {tab === "been" && <Been ctx={ctx} hoodOf={hoodOf} />}
          {tab === "want" && <WantList ctx={ctx} onChange={reload} />}
          {tab === "friends" && <FriendFeed myId={myId} />}
        </div>
      </section>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-border-strong bg-surface px-4 py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

function Been({ ctx, hoodOf }: { ctx: Ctx; hoodOf: (q: string) => string | null }) {
  const byQuest = new Map<string, { count: number; last: string }>();
  for (const v of ctx.board.visits) {
    const cur = byQuest.get(v.quest_id);
    byQuest.set(v.quest_id, { count: (cur?.count ?? 0) + 1, last: cur && cur.last > v.visit_date ? cur.last : v.visit_date });
  }
  const rated = new Map(ctx.board.reviews.filter((r) => r.quest_id).map((r) => [r.quest_id!, r.rating]));
  const rows = [...byQuest.entries()].sort((a, b) => b[1].last.localeCompare(a[1].last));
  if (!rows.length) return <Empty text="No check-ins yet." />;
  return (
    <ul className="grid gap-2 desk:grid-cols-2">
      {rows.map(([qid, info]) => {
        const q = ctx.quests.get(qid);
        return (
          <li key={qid} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
            {rated.has(qid) ? <Score rating={rated.get(qid)!} size={34} /> : <span className="grid size-[34px] place-items-center rounded-full bg-sand text-[11px] font-bold text-muted-foreground">–</span>}
            <span className="min-w-0 flex-1">
              <Link href={`/q/${qid}`} className="block truncate text-sm font-bold hover:underline">
                {q?.title ?? qid}
              </Link>
              <span className="block text-xs text-muted-foreground">
                {hoodOf(qid)} · {info.count > 1 ? `${info.count} visits, last ${shortDate(info.last)}` : shortDate(info.last)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function WantList({ ctx, onChange }: { ctx: Ctx; onChange: () => Promise<void> }) {
  const { board, quests, myId } = ctx;
  const [mine, setMine] = useState<Set<string> | null>(null);
  // On someone else's board, mark which of their places are already on your list.
  useEffect(() => {
    if (board.is_me || !myId) return;
    data
      .getProfileBoard(myId)
      .then((b) => setMine(new Set(b?.saved.map((s) => s.quest_id) ?? [])))
      .catch(() => setMine(new Set()));
  }, [board.is_me, myId]);

  async function toggle(qid: string, save: boolean) {
    try {
      await data.setSaved(qid, save);
      if (board.is_me) await onChange();
      else setMine((m) => {
        const n = new Set(m);
        if (save) n.add(qid);
        else n.delete(qid);
        return n;
      });
      toast(save ? "Added to your want-to-go list" : "Removed from your list");
    } catch {
      toast.error("That didn't save.");
    }
  }

  if (!board.saved.length) return <Empty text={board.is_me ? "Tap Want to go on any quest to save it here." : "Nothing saved yet."} />;
  return (
    <ul className="grid gap-2 desk:grid-cols-2">
      {board.saved.map((s) => {
        const q = quests.get(s.quest_id);
        const onMine = board.is_me || mine?.has(s.quest_id);
        return (
          <li key={s.quest_id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
            <Bookmark className="size-5 shrink-0 text-gold-500" aria-hidden />
            <Link href={`/q/${s.quest_id}`} className="min-w-0 flex-1 truncate text-sm font-bold hover:underline">
              {q?.title ?? s.quest_id}
            </Link>
            {myId &&
              (board.is_me ? (
                <button type="button" onClick={() => toggle(s.quest_id, false)} className="h-7 rounded-full px-2.5 text-xs font-semibold text-muted-foreground hover:bg-sand">
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => toggle(s.quest_id, !onMine)}
                  aria-pressed={!!onMine}
                  className={cn("inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors", onMine ? "bg-gold/25 text-gold-foreground" : "border border-border-strong text-maroon hover:bg-maroon hover:text-white")}
                >
                  {onMine ? <BookmarkCheck className="size-3.5" aria-hidden /> : <Bookmark className="size-3.5" aria-hidden />}
                  {onMine ? "On your list" : "Add to my list"}
                </button>
              ))}
          </li>
        );
      })}
    </ul>
  );
}

function FriendFeed({ myId }: { myId: string | null }) {
  const [feed, setFeed] = useState<ReviewWithMeta[] | null>(null);
  useEffect(() => {
    data
      .getFriendFeed()
      .then(setFeed)
      .catch(() => setFeed([]));
  }, []);
  if (feed === null) return <div className="h-24 animate-pulse rounded-2xl bg-sand" aria-hidden />;
  if (!feed.length) return <Empty text="When your friends rate places, their picks show up here." />;
  return (
    <div className="grid gap-2.5 desk:grid-cols-2">
      {feed.map((r) => (
        <ReviewCard key={r.id} review={r} showAuthor signedIn myId={myId} />
      ))}
    </div>
  );
}

function ImportGoogle({ onDone }: { onDone: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const items = parseTakeoutReviews(await file.text());
      if (!items.length) throw new Error("No rated places in that file.");
      const { imported, skipped } = await data.importReviews(items);
      toast(`Imported ${imported} ${imported === 1 ? "review" : "reviews"} from Google${skipped ? `, skipped ${skipped} already here` : ""}`);
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That file didn't import.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="mt-4 rounded-xl bg-sand/70 p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 text-left text-sm font-bold">
        <Upload className="size-4 text-maroon" aria-hidden />
        <span className="flex-1">Bring in your Google reviews</span>
        <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} aria-hidden />
      </button>
      {open && (
        <div className="mt-2 animate-in text-[13px] text-ink-2 fade-in duration-200">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Go to{" "}
              <a href="https://takeout.google.com" target="_blank" rel="noreferrer" className="font-semibold text-maroon underline">
                takeout.google.com
              </a>{" "}
              (takeout.google.com) and select only <b>Maps (your places)</b>.
            </li>
            <li>Download the export and unzip it.</li>
            <li>
              Pick the file <b>Reviews.json</b> below. Ratings turn into scores out of 10 (4 stars is 8.0).
            </li>
          </ol>
          <input ref={input} type="file" accept=".json,application/json" className="sr-only" id="takeout-file" onChange={(e) => pick(e.target.files?.[0])} />
          <label
            htmlFor="takeout-file"
            className={cn("mt-2.5 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-maroon px-4 text-sm font-semibold text-white hover:bg-maroon-600", busy && "pointer-events-none opacity-60")}
          >
            <Upload className="size-4" aria-hidden />
            {busy ? "Importing…" : "Choose Reviews.json"}
          </label>
          <p className="mt-2 text-xs text-muted-foreground">Your file stays on your device; only the place names, ratings and notes are saved to your profile.</p>
        </div>
      )}
    </div>
  );
}
