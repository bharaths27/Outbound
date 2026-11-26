"use client";

// Host (/host, BU Spark! track): students and clubs publish events (a party, a study jam, a club
// night...) with a description, food (free / cheap / paid / none) and prizes. A published event
// shows on the map for everyone right away (TransitMap loads data.getHostedEvents()) and in the
// list here. Signed-in players can publish; only the host can delete their own event.

import { CalendarPlus, LocateFixed, MapPin, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { data } from "@/lib/data";
import type { HostedEvent, HostedEventKind, HostedFood, NewHostedEvent, Station } from "@/lib/data/types";
import { locate } from "@/features/checkin/use-check-in";
import { useShellPlayer } from "@/features/shell/use-shell-player";
import { PageHeader } from "@/features/shell/page-header";
import { Input } from "@/components/ui/input";
import { EVENTS_CHANGED, EVENT_KINDS, FOOD_OPTIONS, SPARK_EXAMPLE, eventMapHref, eventStatus, foodInfo, kindInfo, whenText } from "./hosted";

const LENGTHS = [1, 2, 3, 4, 6, 8, 12];

/** "2026-11-22T19:30" in local time, for <input type="datetime-local">. */
function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function nextHalfHour() {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}
const inBoston = (lat: number, lon: number) => lat >= 42.0 && lat <= 42.7 && lon >= -71.6 && lon <= -70.7;
function closestStation(stations: Station[], lat: number, lon: number) {
  let best: Station | null = null;
  let bestD = Infinity;
  for (const s of stations) {
    const d = (s.lat - lat) ** 2 + ((s.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) [best, bestD] = [s, d];
  }
  return best;
}

interface Draft {
  host_name: string;
  title: string;
  kind: HostedEventKind;
  description: string;
  food: HostedFood;
  prizes: string;
  start: string;
  hours: number;
  place_name: string;
  station_id: string;
  here: { lat: number; lon: number } | null; // "Use my location"
}
const emptyDraft = (hostName: string): Draft => ({
  host_name: hostName,
  title: "",
  kind: "party",
  description: "",
  food: "free",
  prizes: "",
  start: localInput(nextHalfHour()),
  hours: 3,
  place_name: "",
  station_id: "",
  here: null,
});

export function HostPage() {
  const player = useShellPlayer();
  const me = player?.profile.id ?? null;
  const [events, setEvents] = useState<HostedEvent[] | null | "error">(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft("BU Spark!"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<HostedEvent | null>(null);
  const [locating, setLocating] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = () =>
    data
      .getHostedEvents()
      .then(setEvents)
      .catch(() => setEvents("error"));
  useEffect(() => {
    load();
    data.getStations().then((s) => setStations([...s].sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
    const t = setInterval(() => setNow(new Date()), 60_000);
    window.addEventListener(EVENTS_CHANGED, load);
    return () => {
      clearInterval(t);
      window.removeEventListener(EVENTS_CHANGED, load);
    };
  }, []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const station = stations.find((s) => s.id === draft.station_id) ?? null;

  const useSpark = () => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    setDraft({
      ...emptyDraft(SPARK_EXAMPLE.host_name),
      ...SPARK_EXAMPLE,
      start: localInput(new Date(start.getTime() + 3600_000)),
      hours: 4,
      here: { lat: SPARK_EXAMPLE.lat, lon: SPARK_EXAMPLE.lon },
    });
    setError(null);
    setOpen(true);
  };

  const useMyLocation = async () => {
    setLocating(true);
    setError(null);
    const pos = await locate();
    setLocating(false);
    if ("code" in pos) return setError("Couldn’t get your location. Allow location access, or pick the closest T stop instead.");
    if (!inBoston(pos.lat, pos.lon)) return setError("You’re outside the Boston area. Pick the closest T stop instead.");
    const near = closestStation(stations, pos.lat, pos.lon);
    setDraft((d) => ({ ...d, here: { lat: pos.lat, lon: pos.lon }, station_id: near?.id ?? d.station_id }));
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setError(null);
    const title = draft.title.trim();
    const place = draft.place_name.trim() || station?.name || "";
    const at = draft.here ?? (station ? { lat: station.lat, lon: station.lon } : null);
    const start = new Date(draft.start);
    if (!me) return setError("Sign in to publish an event.");
    if (title.length < 3) return setError("Give the event a name (at least 3 letters).");
    if (!draft.host_name.trim()) return setError("Say who is hosting (your name or your club).");
    if (!at) return setError("Pick the closest T stop, or tap “Use my location”.");
    if (place.length < 2) return setError("Say where it is (a building, room or address).");
    if (Number.isNaN(start.getTime())) return setError("Pick when it starts.");
    const end = new Date(start.getTime() + draft.hours * 3600_000);
    if (end.getTime() < Date.now()) return setError("That time has already passed. Pick a later start.");
    const e: NewHostedEvent = {
      host_name: draft.host_name.trim().slice(0, 80),
      title: title.slice(0, 100),
      kind: draft.kind,
      description: draft.description.trim().slice(0, 1000),
      food: draft.food,
      prizes: draft.prizes.trim().slice(0, 200) || null,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      place_name: place.slice(0, 120),
      lat: at.lat,
      lon: at.lon,
      station_id: station?.id ?? null,
    };
    setBusy(true);
    try {
      const saved = await data.createHostedEvent(e);
      setPublished(saved);
      setOpen(false);
      setDraft(emptyDraft(draft.host_name));
      window.dispatchEvent(new Event(EVENTS_CHANGED));
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /hosted_events|relation|schema cache/i.test(msg)
          ? "Events aren’t set up in the database yet (run 010_hosted_events.sql in Supabase)."
          : /not signed|sign in|jwt|auth/i.test(msg)
            ? "Sign in to publish an event."
            : "Couldn’t publish the event. Check the fields and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await data.deleteHostedEvent(id);
      if (published?.id === id) setPublished(null);
      window.dispatchEvent(new Event(EVENTS_CHANGED));
      await load();
    } catch {
      setError("Couldn’t delete that event. Try again.");
    }
  };

  const list = useMemo(() => (Array.isArray(events) ? events.filter((e) => eventStatus(e, now) !== "ended") : []), [events, now]);
  const liveCount = list.filter((e) => eventStatus(e, now) === "now").length;

  return (
    <>
      <PageHeader title="Host" />
      <div className="mx-auto w-full max-w-[720px] px-4 pt-3 pb-10 desk:max-w-[1360px] desk:px-8 desk:pt-6 desk:pb-14">
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 desk:flex-row desk:items-center desk:p-5">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-ink">Throw something. Students will find it on the map.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Parties, study jams, club nights, pop-ups. Say what it is, if there’s free or cheap food, and what people can
              win. It shows on the map for everyone as soon as you publish.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                setError(null);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-maroon px-5 text-sm font-semibold text-white transition-all hover:bg-maroon-600 active:scale-95"
            >
              <CalendarPlus className="size-4" aria-hidden />
              Create an event
            </button>
            <button
              type="button"
              onClick={useSpark}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border-strong px-4 text-sm font-semibold text-ink hover:bg-sand"
            >
              <Sparkles className="size-4" aria-hidden />
              Use the Spark! example
            </button>
          </div>
        </div>

        {published && (
          <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-green-600/30 bg-green-50 p-4 text-green-900 dark:bg-green-950/40 dark:text-green-100">
            <p className="min-w-0 flex-1 text-sm">
              <b>{published.title}</b> is published. It’s on the map now for everyone.
            </p>
            <Link href={eventMapHref(published)} className="inline-flex h-10 items-center gap-1 rounded-full bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800">
              <MapPin className="size-4" aria-hidden />
              See it on the map
            </Link>
            <button type="button" aria-label="Dismiss" onClick={() => setPublished(null)} className="rounded-full p-1 hover:bg-green-100 dark:hover:bg-green-900">
              <X className="size-5" aria-hidden />
            </button>
          </div>
        )}

        {open && (
          <form onSubmit={submit} className="mb-6 flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 desk:p-6" aria-label="Create an event">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-ink">Create an event</h2>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-muted-foreground hover:bg-sand">
                <X className="size-5" aria-hidden />
              </button>
            </div>

            {!me && (
              <p className="rounded-xl bg-sand p-3 text-base text-ink">
                You’ll need to{" "}
                <Link href="/login?next=/host" className="font-semibold underline">
                  sign in
                </Link>{" "}
                to publish. You can fill this in first.
              </p>
            )}

            <Field label="What kind of event?">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind of event">
                {EVENT_KINDS.map((k) => (
                  <Chip key={k.id} on={draft.kind === k.id} onClick={() => set("kind", k.id)}>
                    <span aria-hidden>{k.emoji}</span> {k.label}
                  </Chip>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 desk:grid-cols-2">
              <Field label="Event name" htmlFor="ev-title">
                <Input id="ev-title" value={draft.title} maxLength={100} placeholder="Spark! Demo Night" onChange={(e) => set("title", e.target.value)} />
              </Field>
              <Field label="Hosted by" htmlFor="ev-host">
                <Input id="ev-host" value={draft.host_name} maxLength={80} placeholder="Your name or club" onChange={(e) => set("host_name", e.target.value)} />
              </Field>
            </div>

            <Field label="Description" htmlFor="ev-desc" hint={`${draft.description.length}/1000`}>
              <textarea
                id="ev-desc"
                value={draft.description}
                maxLength={1000}
                rows={3}
                placeholder="What’s happening, who it’s for, what to bring."
                onChange={(e) => set("description", e.target.value)}
                className="w-full rounded-lg border border-input bg-surface px-3.5 py-2.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </Field>

            <Field label="Food">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Food">
                {FOOD_OPTIONS.map((f) => (
                  <Chip key={f.id} on={draft.food === f.id} onClick={() => set("food", f.id)}>
                    {f.label}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Prizes (optional)" htmlFor="ev-prizes">
              <Input id="ev-prizes" value={draft.prizes} maxLength={200} placeholder="Raffle: headphones and swag" onChange={(e) => set("prizes", e.target.value)} />
            </Field>

            <div className="grid gap-4 desk:grid-cols-2">
              <Field label="Starts" htmlFor="ev-start">
                <Input id="ev-start" type="datetime-local" value={draft.start} onChange={(e) => set("start", e.target.value)} />
              </Field>
              <Field label="How long" htmlFor="ev-len">
                <select
                  id="ev-len"
                  value={draft.hours}
                  onChange={(e) => set("hours", Number(e.target.value))}
                  className="h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {LENGTHS.map((h) => (
                    <option key={h} value={h}>
                      {h} hour{h > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 desk:grid-cols-2">
              <Field label="Closest T stop" htmlFor="ev-station">
                <div className="flex gap-2">
                  <select
                    id="ev-station"
                    value={draft.station_id}
                    onChange={(e) => setDraft((d) => ({ ...d, station_id: e.target.value, here: null }))}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-surface px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">Pick a stop…</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={locating}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-sm font-semibold text-ink hover:bg-sand disabled:opacity-60"
                  >
                    <LocateFixed className="size-4" aria-hidden />
                    {locating ? "Finding…" : "Use my location"}
                  </button>
                </div>
                {draft.here && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pinned at {draft.here.lat.toFixed(4)}, {draft.here.lon.toFixed(4)}
                    {station ? `, near ${station.name}` : ""}.
                  </p>
                )}
              </Field>
              <Field label="Where exactly" htmlFor="ev-place">
                <Input id="ev-place" value={draft.place_name} maxLength={120} placeholder="Building, room or address" onChange={(e) => set("place_name", e.target.value)} />
              </Field>
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-base text-red-800 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-10 items-center rounded-full bg-maroon px-6 text-sm font-semibold text-white hover:bg-maroon-600 disabled:opacity-60"
              >
                {busy ? "Publishing…" : "Publish event"}
              </button>
              <p className="text-sm text-muted-foreground">Everyone using Outbound will see it on the map.</p>
            </div>
          </form>
        )}

        {!open && error && (
          <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-base text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        )}

        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold text-ink">Student events</h2>
          {list.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {list.length} on the map{liveCount ? `, ${liveCount} happening now` : ""}
            </p>
          )}
        </div>
        {events === null && <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted-foreground">Loading events…</p>}
        {events === "error" && (
          <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted-foreground">
            Events didn’t load. Check your connection and refresh.
          </p>
        )}
        {Array.isArray(events) && list.length === 0 && (
          <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted-foreground">
            No events yet. Be the first: tap Create an event.
          </p>
        )}
        {list.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 desk:grid-cols-2 desk:gap-4">
            {list.map((e) => {
              const k = kindInfo(e.kind);
              const f = foodInfo(e.food);
              const live = eventStatus(e, now) === "now";
              return (
                <li key={e.id} className={`flex gap-3 rounded-2xl border bg-surface p-4 ${live ? "border-pink-500/60" : "border-border"}`}>
                  <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-violet-100 text-3xl dark:bg-violet-950" aria-hidden>
                    {k.emoji}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-lg font-semibold leading-snug text-ink">{e.title}</span>
                      {live && <span className="rounded-full bg-pink-600 px-2 py-0.5 text-xs font-bold text-white">Now</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {k.label} · by {e.host_name}
                    </p>
                    <p className="text-sm text-ink">{whenText(e, now)}</p>
                    <p className="text-sm text-ink">{e.place_name}</p>
                    {e.description && <p className="text-[15px] leading-snug text-ink-2">{e.description}</p>}
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${
                          e.food === "free" ? "bg-green-100 text-green-800" : e.food === "cheap" ? "bg-amber-100 text-amber-800" : "bg-sand text-ink-2"
                        }`}
                      >
                        {f.label}
                      </span>
                      {e.prizes && <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[13px] font-semibold text-violet-800">🏆 {e.prizes}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link
                        href={eventMapHref(e)}
                        className="inline-flex h-10 items-center gap-1 rounded-full bg-maroon px-4 text-sm font-semibold text-white transition-all hover:bg-maroon-600 active:scale-95"
                      >
                        <MapPin className="size-4" aria-hidden />
                        Directions
                      </Link>
                      {me && e.host_id === me && (
                        <button
                          type="button"
                          onClick={() => remove(e.id)}
                          className="inline-flex h-10 items-center gap-1 rounded-full border border-border-strong px-4 text-sm font-semibold text-ink hover:bg-sand"
                        >
                          <Trash2 className="size-4" aria-hidden />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-[15px] font-semibold text-ink">
            {label}
          </label>
        ) : (
          <span className="text-[15px] font-semibold text-ink">{label}</span>
        )}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-1 rounded-full border px-3.5 text-sm font-medium transition-colors ${
        on ? "border-maroon bg-maroon text-white" : "border-border-strong bg-surface text-ink hover:bg-sand"
      }`}
    >
      {children}
    </button>
  );
}
