"use client";

// Friends: an Add friend button for leaderboard rows, and the Friends section on Profile
// (incoming requests with Accept / Decline, your friends with Remove).

import { Check, Clock, Loader2, UserPlus, UserRoundCheck, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { data } from "@/lib/data";
import type { Friendship, Profile } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export type FriendState = "friends" | "sent" | "received" | "none";

export function friendStateOf(rows: Friendship[], myId: string, otherId: string): FriendState {
  const row = rows.find(
    (f) => (f.user_id === myId && f.friend_id === otherId) || (f.user_id === otherId && f.friend_id === myId),
  );
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.user_id === myId ? "sent" : "received";
}

/** Friendship rows for the signed-in player, with actions that update the list right away. */
export function useFriendships(myId: string | null) {
  const [rows, setRows] = useState<Friendship[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!myId) return;
    data
      .getFriendships()
      .then(setRows)
      .catch(() => setRows([]));
  }, [myId]);

  useEffect(reload, [reload]);

  async function run(otherId: string, action: () => Promise<void>, ok: string) {
    setBusy(otherId);
    try {
      await action();
      toast(ok);
      reload();
    } catch {
      toast.error("That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return {
    ready: rows !== null,
    busy,
    stateOf: (otherId: string): FriendState => (myId && rows ? friendStateOf(rows, myId, otherId) : "none"),
    add: (id: string, name: string) => run(id, () => data.sendFriendRequest(id), `Friend request sent to ${name}`),
    accept: (id: string, name: string) => run(id, () => data.acceptFriendRequest(id), `You and ${name} are friends now`),
    remove: (id: string, msg: string) => run(id, () => data.removeFriend(id), msg),
  };
}

const PILL =
  "inline-flex h-7 min-w-[84px] shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-xs font-semibold outline-none transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-maroon disabled:opacity-60";

/** Small pill for a leaderboard row. */
export function FriendButton({
  name,
  userId,
  friends,
}: {
  name: string;
  userId: string;
  friends: ReturnType<typeof useFriendships>;
}) {
  if (!friends.ready) return <span className="h-7 w-[84px] shrink-0" aria-hidden />;
  const state = friends.stateOf(userId);
  const busy = friends.busy === userId;
  const spin = <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />;

  if (state === "friends") {
    return (
      <span className={cn(PILL, "bg-success/10 text-success")} title={`You and ${name} are friends`}>
        <UserRoundCheck className="size-3.5" aria-hidden /> Friends
      </span>
    );
  }
  if (state === "sent") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => friends.remove(userId, "Request canceled")}
        className={cn(PILL, "bg-sand text-muted-foreground hover:bg-sand/70")}
        aria-label={`Cancel friend request to ${name}`}
        title="Tap to cancel"
      >
        {busy ? spin : <Clock className="size-3.5" aria-hidden />} Requested
      </button>
    );
  }
  if (state === "received") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => friends.accept(userId, name)}
        className={cn(PILL, "bg-gold text-gold-foreground hover:bg-gold-500")}
        aria-label={`Accept friend request from ${name}`}
      >
        {busy ? spin : <Check className="size-3.5" aria-hidden />} Accept
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => friends.add(userId, name)}
      className={cn(PILL, "border border-border-strong bg-surface text-maroon hover:border-maroon hover:bg-maroon hover:text-white")}
      aria-label={`Add ${name} as a friend`}
    >
      {busy ? spin : <UserPlus className="size-3.5" aria-hidden />} Add
    </button>
  );
}

type SectionLoad = { status: "loading" } | { status: "ready"; friends: Profile[]; requests: Profile[] };

/** Profile section: requests waiting on you, then your friends. */
export function FriendsSection() {
  const [load, setLoad] = useState<SectionLoad>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([data.getFriends(), data.getFriendRequests()])
      .then(([friends, requests]) => setLoad({ status: "ready", friends, requests }))
      .catch(() => setLoad({ status: "ready", friends: [], requests: [] }));
  }, []);
  useEffect(reload, [reload]);

  async function act(id: string, fn: () => Promise<void>, ok: string) {
    setBusy(id);
    try {
      await fn();
      toast(ok);
      reload();
    } catch {
      toast.error("That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const nameOf = (p: Profile) => p.display_name ?? p.email.split("@")[0];

  return (
    <section aria-labelledby="friends-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="friends-heading" className="type-heading">
          Friends
          {load.status === "ready" && (
            <span className="type-small text-muted-foreground tabular-nums"> · {load.friends.length}</span>
          )}
        </h2>
        <Link href="/leaderboard?tab=players" className="type-small font-semibold text-maroon underline-offset-4 hover:underline">
          Find players
        </Link>
      </div>

      {load.status === "loading" ? (
        <div className="h-14 animate-pulse rounded-xl bg-sand motion-reduce:animate-none" aria-hidden />
      ) : (
        <>
          {load.requests.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="Friend requests">
              {load.requests.map((p) => (
                <li
                  key={p.id}
                  className="flex animate-in items-center gap-3 rounded-xl border border-gold/60 bg-gold/10 px-3 py-2 fade-in slide-in-from-top-1 duration-300"
                >
                  <Initial name={nameOf(p)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{nameOf(p)}</span>
                    <span className="block text-xs text-muted-foreground">Wants to be friends</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => act(p.id, () => data.acceptFriendRequest(p.id), `You and ${nameOf(p)} are friends now`)}
                    className={cn(PILL, "bg-maroon text-white hover:bg-maroon-600")}
                  >
                    <Check className="size-3.5" aria-hidden /> Accept
                  </button>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => act(p.id, () => data.removeFriend(p.id), "Request declined")}
                    className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-sand hover:text-ink"
                    aria-label={`Decline ${nameOf(p)}'s request`}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {load.friends.length === 0 ? (
            <p className="type-body text-muted-foreground">
              No friends yet. Add players from the leaderboard to see their stamps.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2" aria-label="Your friends">
              {load.friends.map((p) => (
                <li
                  key={p.id}
                  className="group flex items-center gap-2 rounded-full border border-border bg-surface py-1 pr-1 pl-1 text-sm font-semibold transition-colors hover:border-border-strong"
                >
                  <Initial name={nameOf(p)} small />
                  <span className="max-w-36 truncate">{nameOf(p)}</span>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => act(p.id, () => data.removeFriend(p.id), `Removed ${nameOf(p)}`)}
                    className="grid size-6 place-items-center rounded-full text-muted-foreground opacity-60 transition-all hover:bg-sand hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Remove ${nameOf(p)} from friends`}
                    title="Remove friend"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Initial({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-gold font-display font-bold text-gold-foreground",
        small ? "size-6 text-xs" : "size-8 text-sm",
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
