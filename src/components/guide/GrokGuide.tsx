"use client";
// Floating Outbound Guide. Type a question (Grok answers), or add a photo of food or a place:
// Grok checks it, Mastra agents (Food Researcher, Trip Planner) plan the trip, and the Report tool
// structures every answer. Progress streams in from /api/guide as each agent works.
// It can be put away (minimized) without losing the chat. Drop <GrokGuide /> anywhere.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  ArrowUp, Camera, Check, ChevronDown, Clock, ImagePlus, Keyboard, Lightbulb, Loader2, MapPin, Navigation, RotateCcw,
  Search, Sparkles, Star, TrainFront, TriangleAlert, Utensils, X,
} from "lucide-react";
import type { FinalReport } from "@/lib/agent/report";
import { data } from "@/lib/data";
import type { Quest } from "@/lib/data/types";
import { openState } from "@/features/hub/hours";
import { OPEN_GUIDE_EVENT, type OpenGuideDetail } from "@/features/guide/open-guide";

type StageId = "vision" | "decide" | "where" | "food" | "trip" | "grok" | "report";
type StageStatus = "running" | "done" | "skipped" | "error";
interface Stage {
  stage: StageId;
  status: StageStatus;
  detail?: string;
}
interface Msg {
  role: "user" | "assistant";
  content: string;
  image?: string; // data URL, shown in the chat only (not resent in history)
  report?: FinalReport;
  stages?: Stage[];
}

const STAGE_TEXT: Record<StageId, { label: string; who: string }> = {
  vision: { label: "Looking at your photo", who: "Grok" },
  decide: { label: "Deciding: food or a place?", who: "Photo Decider · Mastra" },
  where: { label: "Finding where it is in Boston", who: "Trip Planner" },
  food: { label: "Researching food spots", who: "Food Researcher · Mastra" },
  trip: { label: "Planning your ride", who: "Trip Planner · Mastra" },
  grok: { label: "Finding quests", who: "Grok" },
  report: { label: "Writing your plan", who: "Report tool" },
};
const PHOTO_FLOW: StageId[] = ["vision", "decide", "where", "food", "trip", "report"];
// Only one of these runs, picked by the Photo Decider, so they stay hidden until they start.
const BRANCH: StageId[] = ["where", "food"];
const TEXT_FLOW: StageId[] = ["grok", "report"];
const PRICE = ["Free", "$", "$$", "$$$"];
const STARTERS = ["Cheap eats open now", "Photo spot on the Green Line", "Date night, about 2 hours"];
const LINE_COLOR: Record<string, string> = { Red: "#da291c", Orange: "#ed8b00", Green: "#00843d", Blue: "#003da5" };
const lineColor = (l?: string | null) => LINE_COLOR[(l ?? "").split("-")[0]] ?? "#6b1f33";

// Shrink any photo (including iPhone HEIC, which the browser can decode) to a JPEG of at most 1024 px.
async function toJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Raw model errors only show with ?debug in the URL, so a demo never shows provider errors. */
function showDebug() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
}

function StageList({ stages, photo }: { stages: Stage[]; photo: boolean }) {
  const byId = new Map(stages.map((s) => [s.stage, s]));
  return (
    <ol className="space-y-1.5" aria-live="polite">
      {(photo ? PHOTO_FLOW : TEXT_FLOW).map((id) => {
        const s = byId.get(id);
        const status = s?.status ?? "waiting";
        if (status === "skipped" || (status === "waiting" && BRANCH.includes(id))) return null;
        return (
          <li key={id} className="flex items-start gap-2 text-[13px]">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
              {status === "running" ? (
                <Loader2 className="size-4 animate-spin text-maroon motion-reduce:animate-none" aria-hidden />
              ) : status === "done" ? (
                <Check className="size-4 text-success" aria-hidden />
              ) : status === "error" ? (
                <TriangleAlert className="size-4 text-danger" aria-hidden />
              ) : (
                <span className="size-2 rounded-full bg-border" aria-hidden />
              )}
            </span>
            <span className={status === "waiting" ? "text-muted-foreground" : ""}>
              <span className="font-semibold">{STAGE_TEXT[id].label}</span>
              <span className="text-muted-foreground"> · {STAGE_TEXT[id].who}</span>
              {s?.detail && status === "done" && id === "vision" && <span className="block text-muted-foreground">Saw: {s.detail}</span>}
              {s?.detail && status === "done" && id === "decide" && <span className="block text-muted-foreground">{s.detail}</span>}
              {s?.detail && status === "done" && id === "where" && <span className="block text-muted-foreground">Found: {s.detail}</span>}
              {s?.detail && status === "error" && showDebug() && <span className="block break-words text-[11px] text-danger">{s.detail}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export interface MapTarget {
  name: string;
  lat: number;
  lng: number;
}

/** A quest the Guide picked. Tap to open a small preview right here (photo, what to do, hours,
 *  walk) with Directions on the map; the full quest page (to check in) is one more tap away. */
function QuestPick({ q, onRoute }: { q: FinalReport["picks"][number]; onRoute: (t: MapTarget) => void }) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<Quest | null | "loading">(null);
  useEffect(() => {
    if (!open || full) return;
    setFull("loading");
    data.getQuest(q.id).then((x) => setFull(x), () => setFull(null));
  }, [open, full, q.id]);
  const quest = full && full !== "loading" ? full : null;
  const state = quest ? openState(quest.hours, new Date()) : null;
  const lat = quest?.lat ?? q.lat, lng = quest?.lon ?? q.lon;
  return (
    <div className={`rounded-xl border px-3 py-2 transition-colors ${open ? "border-maroon" : "border-border hover:border-maroon"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold leading-tight">{q.title}</p>
          <span className="shrink-0 rounded-full bg-xp-chip px-2 py-0.5 text-[11px] font-bold text-xp-chip-ink">+{q.xp} XP</span>
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: lineColor(q.lines[0]) }} aria-hidden />
          {q.station_name ?? q.station_id} · {PRICE[q.price_tier] ?? ""}
          <span className="ml-auto text-[11px] font-semibold text-maroon">{open ? "Hide" : "Preview"}</span>
        </p>
        {q.why && <p className="mt-1 text-xs leading-snug">{q.why}</p>}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
          {full === "loading" && <p className="text-xs text-muted-foreground">Loading…</p>}
          {quest?.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element -- remote Commons photo, sized by the browser
            <img src={quest.photo_url} alt="" className="h-28 w-full rounded-lg object-cover" loading="lazy" />
          )}
          {quest?.description && <p className="text-xs leading-snug">{quest.description}</p>}
          {quest && (
            <p className="text-[11px] text-muted-foreground">
              {[`${quest.walk_min} min walk from the T`, `about ${quest.duration_min} min there`].join(" · ")}
              {state && <span className={state.open ? "font-semibold text-success" : "text-closed"}> · {state.label}</span>}
            </p>
          )}
          <div className="flex items-center gap-2">
            {lat != null && lng != null && <RouteButton t={{ name: q.title, lat, lng }} onRoute={onRoute} big />}
            <Link href={`/q/${q.id}`} className="shrink-0 text-xs font-semibold text-maroon underline-offset-2 hover:underline">
              Quest page
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function RouteButton({ t, onRoute, big }: { t: MapTarget; onRoute: (t: MapTarget) => void; big?: boolean }) {
  return big ? (
    <button
      onClick={() => onRoute(t)}
      className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-maroon px-3 py-2 text-[13px] font-semibold text-white hover:bg-maroon-600"
    >
      <Navigation className="size-4" aria-hidden /> Show route on map
    </button>
  ) : (
    <button
      onClick={() => onRoute(t)}
      aria-label={`Show the route to ${t.name} on the map`}
      title="Show route on map"
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-maroon hover:border-maroon"
    >
      <Navigation className="size-3" aria-hidden /> Route
    </button>
  );
}

function ReportCard({ r, onRetryPhoto, onType, onRoute }: { r: FinalReport; onRetryPhoto: () => void; onType: () => void; onRoute: (t: MapTarget) => void }) {
  const d = r.destination;
  if (r.kind === "retry") {
    return (
      <div className="rounded-2xl border border-gold-500/60 bg-gold/15 p-3.5">
        <p className="flex items-center gap-1.5 font-semibold">
          <TriangleAlert className="size-4 text-gold-600" aria-hidden /> {r.title}
        </p>
        <p className="mt-1 text-[13px] leading-snug">{r.summary}</p>
        {r.debug && showDebug() && <p className="mt-1.5 break-words text-[11px] text-muted-foreground">Why: {r.debug}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={onRetryPhoto} className="inline-flex items-center gap-1.5 rounded-full bg-maroon px-3 py-1.5 text-xs font-semibold text-white hover:bg-maroon-600">
            <Camera className="size-3.5" aria-hidden /> Try another photo
          </button>
          <button onClick={onType} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold hover:border-maroon">
            <Keyboard className="size-3.5" aria-hidden /> Type instead
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="bg-sand/70 px-3.5 py-3">
        {r.detected && (
          <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-maroon">
            {r.detected.kind === "food" ? <Utensils className="size-3" aria-hidden /> : <MapPin className="size-3" aria-hidden />}
            {r.detected.label}
          </span>
        )}
        <p className="font-display text-[17px] leading-tight font-semibold">{r.title}</p>
        {r.summary && <p className="mt-1 text-[13px] leading-snug text-ink-2">{r.summary}</p>}
      </div>

      <div className="space-y-3 px-3.5 py-3">
        {d && (
          <div className="rounded-xl border border-maroon/30 bg-maroon/5 px-3 py-2.5">
            <p className="text-[11px] font-bold tracking-wide text-maroon uppercase">
              {d.inBoston === false ? "Not Boston · closest Boston match" : r.detected?.kind === "location" ? "Where this is" : "Where to go"}
            </p>
            <p className="mt-0.5 flex items-start gap-1.5 font-semibold leading-tight">
              <MapPin className="mt-0.5 size-4 shrink-0 text-maroon" aria-hidden /> {d.name}
            </p>
            {d.address && d.address !== d.name && <p className="ml-5.5 text-xs text-muted-foreground">{d.address}</p>}
            {d.why && (
              <p className="mt-1.5 flex gap-1.5 text-xs leading-snug">
                <Search className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span><span className="font-semibold">Clues:</span> {d.why}</span>
              </p>
            )}
            {d.station && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs">
                <TrainFront className="size-3.5 shrink-0" style={{ color: lineColor(d.station.lines[0]) }} aria-hidden />
                Closest T: <span className="font-semibold">{d.station.name}</span>
                <span className="text-muted-foreground">({d.station.lines.join("/")}) · {d.station.walkMin} min walk</span>
              </p>
            )}
            {d.ride && <p className="mt-1 ml-5 text-xs text-muted-foreground">About {d.ride.minutes} min from {d.ride.from} by T{d.ride.fare ? ` · ${"$"}${d.ride.fare.toFixed(2)} fare` : ""}</p>}
            <RouteButton t={{ name: d.name, lat: d.lat, lng: d.lng }} onRoute={onRoute} big />
          </div>
        )}
        {r.transit && (
          <div className="flex items-center gap-2 rounded-xl border border-border px-2.5 py-2 text-[13px]">
            <TrainFront className="size-4 shrink-0" style={{ color: lineColor(r.transit.line) }} aria-hidden />
            <span className="min-w-0 flex-1">
              Ride to <span className="font-semibold">{r.transit.station}</span>
              {r.transit.line && <span className="text-muted-foreground"> · {r.transit.line}</span>}
            </span>
            {r.transit.nextTrainMin != null && (
              <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                next in {r.transit.nextTrainMin} min
              </span>
            )}
          </div>
        )}
        {r.transit?.delay && (
          <p className="-mt-1.5 flex items-center gap-1 text-xs text-danger">
            <Clock className="size-3.5" aria-hidden /> {r.transit.delay} right now
          </p>
        )}

        {r.steps.length > 0 && (
          <ol className="space-y-1.5">
            {r.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-maroon text-[11px] font-bold text-white">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        )}

        {r.picks.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Quests</p>
            {r.picks.map((q) => (
              <QuestPick key={q.id} q={q} onRoute={onRoute} />
            ))}
          </div>
        )}

        {r.places.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Spots nearby</p>
            {r.places.map((p, i) => (
              <div key={i} className="rounded-xl bg-paper px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold leading-tight">{p.name}</p>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs">
                    {p.rating != null && (
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="size-3 fill-gold-500 text-gold-500" aria-hidden /> {p.rating}
                      </span>
                    )}
                    {p.price && <span className="text-muted-foreground">{p.price}</span>}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {p.note}
                  {p.nearStation && ` · near ${p.nearStation}`}
                  {p.openNow === true && <span className="font-semibold text-success"> · Open now</span>}
                  {p.openNow === false && <span className="text-closed"> · Closed now</span>}
                </p>
                {typeof p.lat === "number" && typeof p.lng === "number" && (
                  <div className="mt-1.5 flex justify-end">
                    <RouteButton t={{ name: p.name, lat: p.lat, lng: p.lng }} onRoute={onRoute} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {r.tips.length > 0 && (
          <ul className="space-y-1">
            {r.tips.map((t, i) => (
              <li key={i} className="flex gap-1.5 text-xs leading-snug text-muted-foreground">
                <Lightbulb className="mt-px size-3.5 shrink-0 text-gold-600" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const WELCOME: Msg = { role: "assistant", content: "" };

/**
 * Placement follows the app shell (src/features/shell/shell-guide.tsx): the launcher sits bottom-left,
 * clear of the map's zoom buttons and the station hub. `hideLauncher` hides only the button (pages with a
 * header Ask Guide button, or while the phone hub drawer is up); the chat still opens from openGuide().
 */
export default function GrokGuide({
  hideLauncher = false,
  openFromHeader = false,
}: {
  hideLauncher?: boolean;
  /** The page opens the chat from a header button: on desktop the panel drops from the top right. */
  openFromHeader?: boolean;
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const onMap = pathname === "/";
  // Put the guide away and let the map draw the route (TransitMap listens for "outbound:go").
  const showOnMap = (t: MapTarget) => {
    setOpen(false);
    if (onMap) window.dispatchEvent(new CustomEvent<MapTarget>("outbound:go", { detail: t }));
    else router.push(`/?go=${t.lat.toFixed(6)},${t.lng.toFixed(6)}&name=${encodeURIComponent(t.name)}`);
  };
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy, open]);

  // openGuide() from the hub, headers and empty states; an optional prompt is typed in, not sent.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const prompt = (e as CustomEvent<OpenGuideDetail>).detail?.prompt;
      setOpen(true);
      setUnread(false);
      if (prompt) setInput(prompt);
    };
    window.addEventListener(OPEN_GUIDE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, onOpen);
  }, []);

  // Esc puts the panel away (DESIGN.md §10).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsgs((m) => [...m, { role: "assistant", content: "That file isn't a photo. Try a JPEG or PNG of food or a place." }]);
      return;
    }
    try {
      setPhoto(await toJpeg(file));
      inputRef.current?.focus();
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "I couldn't open that photo. Try a JPEG or PNG?" }]);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!busy) pickPhoto(e.dataTransfer.files?.[0]);
  }

  const patchLast = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

  async function send(text: string) {
    const message = text.trim();
    const image = photo;
    if ((!message && !image) || busy) return;
    const history = msgs
      .slice(1)
      .filter((m) => m.content || m.report)
      .map(({ role, content, image: img, report }) => ({
        role,
        content: (report ? `${report.title}. ${report.summary}` : img ? `[sent a photo] ${content}` : content).trim(),
      }));
    setMsgs((m) => [...m, { role: "user", content: message, image: image ?? undefined }, { role: "assistant", content: "", stages: [] }]);
    setInput("");
    setPhoto(null);
    setBusy(true);
    try {
      const res = await fetch("/api/guide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history, image, stream: true }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        patchLast((m) => ({ ...m, content: data?.error ?? "Something went wrong. Try again?" }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "stage") {
            patchLast((m) => ({ ...m, stages: [...(m.stages ?? []).filter((s) => s.stage !== ev.stage), { stage: ev.stage, status: ev.status, detail: ev.detail }] }));
          } else if (ev.type === "result") {
            patchLast((m) => ({ ...m, report: ev.report, content: ev.report ? "" : ev.reply }));
            if (!openRef.current) setUnread(true);
          } else if (ev.type === "error") {
            patchLast((m) => ({ ...m, content: "The guide hit a snag. Try again in a moment?" }));
          }
        }
      }
    } catch {
      patchLast((m) => ({ ...m, content: "I couldn't reach the guide. Check your connection?" }));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    if (busy) return;
    setMsgs([WELCOME]);
    setPhoto(null);
    setInput("");
  }

  const empty = msgs.length === 1;
  const openPicker = () => fileRef.current?.click();
  const focusInput = () => inputRef.current?.focus();

  return (
    <div
      hidden={hideLauncher && !open}
      className={`fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-4 z-[60] flex-col items-start gap-2 ${hideLauncher && !open ? "hidden" : "flex"} ${
        openFromHeader ? "desk:top-20 desk:right-6 desk:bottom-auto desk:left-auto desk:items-end" : "desk:bottom-6 desk:left-6"
      }`}
    >
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />

      {open && (
        <section
          aria-label="Outbound Guide"
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDragging(false);
          }}
          onDrop={onDrop}
          className={`relative flex h-[680px] max-h-[calc(100dvh-8.5rem)] w-[460px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-border bg-white text-ink shadow-2xl ${
            // Phones/tablets on the map: stay below the Explore card. Desktop: the card is on the right.
            onMap && !openFromHeader
              ? "min-[820px]:max-h-[max(320px,calc(100dvh-28rem))] desk:max-h-[calc(100dvh-10.5rem)]"
              : "desk:max-h-[calc(100dvh-6.5rem)]"
          }`}
        >
          <header className="flex items-center gap-2.5 bg-maroon px-4 py-3 text-on-maroon">
            <span className="flex size-9 items-center justify-center rounded-full bg-gold text-gold-foreground">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[17px] leading-tight font-semibold">Outbound Guide</p>
              <p className="text-xs text-on-maroon-muted">Grok + Mastra agents</p>
            </div>
            <button onClick={reset} disabled={busy || empty} aria-label="New chat" title="New chat" className="rounded-full p-2 hover:bg-white/10 disabled:opacity-40">
              <RotateCcw className="size-4" aria-hidden />
            </button>
            <button onClick={() => setOpen(false)} aria-label="Put the guide away" title="Put away" className="rounded-full p-2 hover:bg-white/10">
              <ChevronDown className="size-5" aria-hidden />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-paper/60 px-4 py-4 text-sm">
            <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 shadow-sm">
              Hey! Tell me your craving, budget or time, or <span className="font-semibold">send a photo of food or a place</span>. I&apos;ll plan a trip on the T.
            </div>

            {empty && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={openPicker} className="flex flex-col items-start gap-1 rounded-2xl border-2 border-dashed border-maroon/30 bg-white p-3 text-left hover:border-maroon">
                    <Utensils className="size-5 text-maroon" aria-hidden />
                    <span className="font-semibold">Photo of food</span>
                    <span className="text-xs leading-snug text-muted-foreground">We&apos;ll find where to get it near the T</span>
                  </button>
                  <button onClick={openPicker} className="flex flex-col items-start gap-1 rounded-2xl border-2 border-dashed border-maroon/30 bg-white p-3 text-left hover:border-maroon">
                    <MapPin className="size-5 text-maroon" aria-hidden />
                    <span className="font-semibold">Photo of a place</span>
                    <span className="text-xs leading-snug text-muted-foreground">We&apos;ll plan your ride there</span>
                  </button>
                </div>
                <p className="text-center text-xs text-muted-foreground">or drop a photo here, or try:</p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium hover:border-maroon">
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}

            {msgs.slice(1).map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex flex-col items-end gap-1">
                  {m.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
                    <img src={m.image} alt="Your photo" className="max-h-44 rounded-2xl rounded-tr-md border border-border object-cover" />
                  )}
                  {m.content && <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-maroon px-3.5 py-2 whitespace-pre-wrap text-white">{m.content}</div>}
                </div>
              ) : (
                <div key={i} className="space-y-2">
                  {m.stages && !m.report && !m.content && (
                    <div className="rounded-2xl rounded-tl-md bg-white px-3.5 py-3 shadow-sm">
                      <StageList stages={m.stages} photo={m.stages.some((s) => s.stage === "vision")} />
                    </div>
                  )}
                  {m.report && <ReportCard r={m.report} onRetryPhoto={openPicker} onType={focusInput} onRoute={showOnMap} />}
                  {m.content && <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 shadow-sm">{m.content}</div>}
                  {m.report && m.report.kind !== "retry" && (
                    <p className="px-1 text-[11px] text-muted-foreground">
                      {msgs[i]?.image ? "Grok → " + (m.report.detected?.kind === "food" ? "Food Researcher → " : "") + "Trip Planner → Report" : "Grok → Report"}
                    </p>
                  )}
                </div>
              ),
            )}
            <div ref={endRef} />
          </div>

          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-3xl border-4 border-dashed border-maroon bg-white/90 text-maroon">
              <ImagePlus className="size-10" aria-hidden />
              <p className="font-semibold">Drop a photo of food or a place</p>
            </div>
          )}

          <div className="border-t border-border bg-white p-3">
            {photo && (
              <div className="mb-2 flex items-center gap-2.5 rounded-2xl bg-sand/70 p-2 text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
                <img src={photo} alt="Photo to send" className="size-12 rounded-xl object-cover" />
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="block font-semibold">Photo ready</span>
                  <span className="text-muted-foreground">We&apos;ll check if it&apos;s food or a place. Add a note or just send.</span>
                </span>
                <button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo" className="rounded-full p-1.5 hover:bg-white">
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-end gap-2"
            >
              <button
                type="button"
                onClick={openPicker}
                disabled={busy}
                aria-label="Add a photo of food or a place"
                title="Add a photo of food or a place"
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-semibold hover:border-maroon disabled:opacity-40"
              >
                <Camera className="size-4.5" aria-hidden /> Photo
              </button>
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                maxLength={500}
                placeholder={photo ? "Add a note (optional)" : "Cheap dumplings, 1 hour…"}
                className="max-h-24 min-h-11 min-w-0 flex-1 resize-none rounded-3xl border border-border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-maroon"
              />
              <button
                type="submit"
                disabled={busy || (!input.trim() && !photo)}
                aria-label="Send"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-maroon text-white hover:bg-maroon-600 disabled:opacity-40"
              >
                {busy ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden /> : <ArrowUp className="size-5" aria-hidden />}
              </button>
            </form>
          </div>
        </section>
      )}

      {!hideLauncher && (
      <button
        onClick={() => {
          setOpen((o) => !o);
          setUnread(false);
        }}
        aria-expanded={open}
        className="relative flex items-center gap-2 rounded-full bg-maroon py-3 pr-5 pl-4 text-[15px] font-semibold text-white shadow-lg hover:bg-maroon-600"
      >
        {open ? <ChevronDown className="size-5" aria-hidden /> : <Sparkles className="size-5 text-gold" aria-hidden />}
        {open ? "Put away" : busy ? "Guide is working…" : "Ask Guide"}
        {!open && unread && <span className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full border-2 border-white bg-gold" aria-label="New answer" />}
      </button>
      )}
    </div>
  );
}
