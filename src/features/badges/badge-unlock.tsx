"use client";

// "Badge unlocked!" overlay. Mounted once in the app shell. After a check-in (PROGRESS_CHANGED)
// it asks for the player's badges, compares with the ones they've already seen, and plays the
// unlock for each new one, waiting until the check-in celebration dialog has closed. Tapping an
// earned badge on the passport (SHOW_BADGE) replays it.

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { data } from "@/lib/data";
import type { BadgeId } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { BADGE_ART, BadgePatch } from "./badge-patch";
import { PROGRESS_CHANGED, SHOW_BADGE, newlyEarned, readSeen, recordUnlocks, unlockDates, writeSeen } from "./unlock";
import { DateStamp } from "@/features/passport/date-stamp";

const CONFETTI = Array.from({ length: 28 }, (_, i) => {
  const a = (i / 28) * Math.PI * 2 + (i % 3) * 0.2;
  const d = 120 + (i % 5) * 26;
  return {
    dx: Math.round(Math.cos(a) * d),
    dy: Math.round(Math.sin(a) * d - 40),
    r: (i * 47) % 360,
    c: ["#F2C14E", "#F7B8C9", "#FFF8EF", "#E5A92F", "#C8E6D4"][i % 5],
    w: i % 2 ? 6 : 9,
    delay: (i % 4) * 25,
  };
});

/** Some dialog (the check-in celebration) is open: wait for it to close first. */
function dialogOpen() {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
}

export function BadgeUnlockHost() {
  const [queue, setQueue] = useState<BadgeId[]>([]);
  const [replay, setReplay] = useState(false);
  const busy = useRef(false);
  const uid = useRef<string | null>(null);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const me = await data.getCurrentUser();
      if (!me) return;
      uid.current = me.id;
      const progress = await data.getGameProgress();
      if (!progress) return;
      const fresh = newlyEarned(readSeen(me.id), progress.badges);
      writeSeen(me.id, progress.badges);
      if (fresh.length) {
        recordUnlocks(me.id, fresh);
        uid.current = me.id;
        setReplay(false);
        setQueue((q) => [...q, ...fresh.filter((b) => !q.includes(b))]);
      }
    } catch {
      // badges are a bonus; never break the page over them
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    void check(); // remembers the current badges on first visit
    const onProgress = () => void check();
    const onShow = (e: Event) => {
      const id = (e as CustomEvent<BadgeId>).detail;
      if (id in BADGE_ART) {
        setReplay(true);
        setQueue([id]);
      }
    };
    window.addEventListener(PROGRESS_CHANGED, onProgress);
    window.addEventListener(SHOW_BADGE, onShow);
    return () => {
      window.removeEventListener(PROGRESS_CHANGED, onProgress);
      window.removeEventListener(SHOW_BADGE, onShow);
    };
  }, [check]);

  // Hold the overlay while another dialog is up.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!queue.length) return setReady(false);
    if (replay) return setReady(true);
    const t = setInterval(() => {
      if (!dialogOpen()) {
        setReady(true);
        clearInterval(t);
      }
    }, 300);
    return () => clearInterval(t);
  }, [queue, replay]);

  const current = ready ? queue[0] : undefined;
  if (!current) return null;
  return (
    <BadgeUnlock
      key={`${current}-${queue.length}`}
      id={current}
      more={queue.length - 1}
      unlockedAt={unlockDates(uid.current)[current] ?? null}
      onClose={() => {
        setReady(false);
        setQueue((q) => q.slice(1));
      }}
    />
  );
}

function BadgeUnlock({ id, more, unlockedAt, onClose }: { id: BadgeId; more: number; unlockedAt: string | null; onClose: () => void }) {
  const art = BADGE_ART[id];
  const btn = useRef<HTMLButtonElement>(null);
  // Layout effect: Escape works from the very first frame the overlay is on screen.
  useLayoutEffect(() => {
    btn.current?.focus();
    try {
      navigator.vibrate?.([18, 40, 28]);
    } catch {}
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="badge-unlock-title"
      data-testid="badge-unlock"
      className="fixed inset-0 z-[100] grid place-items-center bg-[rgb(30_10_16/0.72)] p-6 backdrop-blur-[2px] animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="ob-unlock-card relative flex w-full max-w-[340px] flex-col items-center rounded-[28px] bg-maroon px-6 pt-8 pb-6 text-center text-white shadow-dialog">
        <div className="relative grid size-[200px] place-items-center">
          <span aria-hidden className="ob-unlock-rays absolute inset-[-30px] rounded-full" />
          <span aria-hidden className="ob-unlock-ring absolute inset-6 rounded-full border-[3px] border-gold" />
          {CONFETTI.map((p, i) => (
            <span
              key={i}
              aria-hidden
              className="ob-confetti absolute top-1/2 left-1/2 rounded-[2px]"
              style={
                {
                  "--dx": `${p.dx}px`,
                  "--dy": `${p.dy}px`,
                  "--r": `${p.r}deg`,
                  width: p.w,
                  height: p.w * 0.45,
                  background: p.c,
                  animationDelay: `${380 + p.delay}ms`,
                } as React.CSSProperties
              }
            />
          ))}
          <div className="ob-unlock-patch relative">
            <BadgePatch id={id} size={168} />
          </div>
          {unlockedAt && (
            <span className="ob-date-press absolute -right-2 bottom-1" style={{ animationDelay: "900ms" }}>
              <DateStamp at={unlockedAt} onMaroon />
            </span>
          )}
        </div>
        <p className="ob-unlock-text mt-2 text-xs font-bold tracking-[0.12em] text-gold uppercase" style={{ animationDelay: "550ms" }}>
          Badge unlocked
        </p>
        <h2 id="badge-unlock-title" className="ob-unlock-text mt-1 font-display text-[30px] leading-tight font-semibold" style={{ animationDelay: "650ms" }}>
          {art.name}
        </h2>
        <p className="ob-unlock-text mt-1.5 text-sm text-on-maroon-muted" style={{ animationDelay: "750ms" }}>
          {art.how}.
        </p>
        <div className="ob-unlock-text mt-5 flex w-full gap-2" style={{ animationDelay: "850ms" }}>
          <Link
            href="/passport"
            onClick={onClose}
            className="flex h-10 flex-1 items-center justify-center rounded-xl border border-white/25 text-sm font-semibold text-white hover:bg-white/10"
          >
            See passport
          </Link>
          <button
            ref={btn}
            type="button"
            onClick={onClose}
            className={cn("h-10 flex-1 rounded-xl bg-gold text-sm font-bold text-gold-foreground shadow-glow transition-transform active:scale-95")}
          >
            {more > 0 ? `Next (${more} more)` : "Nice!"}
          </button>
        </div>
      </div>
    </div>
  );
}
