"use client";
// The map's own panel (top left on desktop, under the Explore card on phones): the view
// (3D / 2D, illustrated / realistic), what to show on the map, the live feed, and the four
// subway lines with every train running now, delays (Tiger Data) and tonight's last trains.
// It folds down to one line so the map has room.

import {
  AlertTriangle,
  Box,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GraduationCap,
  History,
  Map as MapIcon,
  Moon,
  PartyPopper,
  Satellite,
  Palette,
  TrainFront,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LineLateness, Train } from "@/lib/types";
import { destinationOf } from "./feed";

export interface MapShow {
  trains: boolean;
  campuses: boolean;
  friends: boolean;
  delays: boolean;
  events: boolean;
}

const GROUPS: { id: "Red" | "Orange" | "Green" | "Blue"; label: string; letter: string; color: string; routes: string[] }[] = [
  { id: "Red", label: "Red Line", letter: "R", color: "#da291c", routes: ["Red", "Mattapan"] },
  { id: "Orange", label: "Orange Line", letter: "O", color: "#ed8b00", routes: ["Orange"] },
  { id: "Green", label: "Green Line", letter: "G", color: "#00843d", routes: ["Green-B", "Green-C", "Green-D", "Green-E"] },
  { id: "Blue", label: "Blue Line", letter: "B", color: "#003da5", routes: ["Blue"] },
];
const routeName = (r: string) => (r.startsWith("Green-") ? `${r.slice(6)} branch` : r === "Mattapan" ? "Mattapan trolley" : `${r} Line`);
const statusWord = (s: string | null) => (s === "STOPPED_AT" ? "At" : s === "INCOMING_AT" ? "Arriving at" : "Next stop");
const DELAY_STYLE: Record<LineLateness["color"], string> = {
  green: "bg-emerald-100 text-emerald-800",
  yellow: "bg-yellow-100 text-yellow-800",
  orange: "bg-orange-100 text-orange-800",
  red: "bg-red-100 text-red-800",
  gray: "bg-[var(--ob-sand)] text-[var(--ob-muted)]",
};

interface LastTrip {
  route: string;
  line: string;
  directionId: number;
  headsign: string | null;
  from: string | null;
  departs: string;
}
const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export default function MapPanel(props: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  is3D: boolean;
  setIs3D: (v: boolean) => void;
  realistic: boolean;
  setRealistic: ((v: boolean) => void) | null; // null: no realistic imagery available
  show: MapShow;
  setShow: (s: MapShow) => void;
  delayColors: boolean;
  setDelayColors: (v: boolean) => void;
  replaying: boolean;
  replayLabel: string;
  onReplay: () => void;
}) {
  const { collapsed, setCollapsed, show, setShow } = props;
  return (
    <section aria-label="Map view" className="ob-panel flex max-h-full min-h-0 flex-col overflow-hidden !rounded-2xl text-[14px]">
      {/* header: always visible, folds the panel */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        className="flex w-full shrink-0 items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--ob-cream)]"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-[var(--ob-maroon)] text-white [&_svg]:size-4" aria-hidden>
          <MapIcon size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] leading-tight font-semibold text-[var(--ob-ink)]">Map view</span>
          <span className="block truncate text-[12px] text-[var(--ob-ink-2)]">
            {props.is3D ? "3D" : "2D"}
            {props.setRealistic ? (props.realistic ? " · realistic" : " · illustrated") : ""} · {Object.values(show).filter(Boolean).length} layers on
          </span>
        </span>
        <span className="ob-link flex items-center gap-0.5 text-[12px] font-semibold text-[var(--ob-maroon)]">
          {collapsed ? <ChevronDown size={18} aria-hidden /> : <ChevronUp size={18} aria-hidden />}
          {collapsed ? "Show" : "Hide"}
        </span>
      </button>

      {!collapsed && (
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t border-[var(--ob-line)] px-3.5 pt-3 pb-3.5">
          {/* view */}
          <div className="grid grid-cols-2 gap-2">
            <BigSeg
              label="View"
              options={[
                { label: "3D", icon: <Box size={16} aria-hidden />, on: props.is3D, pick: () => props.setIs3D(true) },
                { label: "2D", icon: <MapIcon size={16} aria-hidden />, on: !props.is3D, pick: () => props.setIs3D(false) },
              ]}
            />
            {props.setRealistic && (
              <BigSeg
                label="Look"
                options={[
                  { label: "Illustrated", icon: <Palette size={16} aria-hidden />, on: !props.realistic, pick: () => props.setRealistic?.(false) },
                  { label: "Realistic", icon: <Satellite size={16} aria-hidden />, on: props.realistic, pick: () => props.setRealistic?.(true) },
                ]}
              />
            )}
          </div>
          <p className="-mt-2 text-[12px] leading-snug text-[var(--ob-muted)]">
            Drag to move · right-drag to turn{props.is3D ? " and tilt" : ""} · right-click for directions · tap anything for its card
          </p>

          {/* layers */}
          <div>
            <p className="mb-1.5 text-[11px] font-bold tracking-[0.08em] text-[var(--ob-muted)] uppercase">On the map</p>
            <div className="flex flex-wrap gap-1.5">
              <Tile icon={<TrainFront size={18} />} label="Trains" on={show.trains} set={(v) => setShow({ ...show, trains: v })} />
              <Tile icon={<GraduationCap size={18} />} label="Campuses" on={show.campuses} set={(v) => setShow({ ...show, campuses: v })} />
              <Tile icon={<PartyPopper size={18} />} label="Events" on={show.events} set={(v) => setShow({ ...show, events: v })} />
              <Tile icon={<Users size={18} />} label="Quests" on={show.friends} set={(v) => setShow({ ...show, friends: v })} />
              <Tile icon={<AlertTriangle size={18} />} label="Delays" on={show.delays} set={(v) => setShow({ ...show, delays: v })} />
              <Tile icon={<History size={18} />} label={props.replayLabel} on={props.replaying} set={() => props.onReplay()} />
            </div>
            {show.delays && (
              <label className="mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-lg px-1 text-[12px] text-[var(--ob-ink-2)]">
                Color the lines by delay
                <input type="checkbox" checked={props.delayColors} onChange={(e) => props.setDelayColors(e.target.checked)} className="size-4 accent-[var(--ob-maroon)]" />
              </label>
            )}
          </div>

        </div>
      )}
    </section>
  );
}

/** The MBTA card under Explore Boston: live status, then the four lines. Folds to one line. */
export function LinesPanel(props: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  badge: "LIVE" | "REPLAY" | "DEMO";
  status: string;
  weather: ReactNode;
  trains: Train[];
  lateness: LineLateness[] | null;
  stationName: (id: string | null) => string | null;
  onTrain: (t: Train) => void;
}) {
  const { collapsed, setCollapsed } = props;
  const badgeClass = props.badge === "LIVE" ? "bg-emerald-600" : props.badge === "REPLAY" ? "bg-sky-600" : "bg-amber-500";
  return (
    <section aria-label="MBTA live trains" className="ob-panel flex min-h-[52px] shrink flex-col overflow-hidden !rounded-2xl text-[14px]">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        className="flex w-full shrink-0 items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--ob-cream)]"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-[var(--ob-maroon)] text-white [&_svg]:size-4" aria-hidden>
          <TrainFront size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] leading-tight font-semibold text-[var(--ob-ink)]">MBTA live trains</span>
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--ob-ink-2)]">
            <span className={`rounded px-1.5 py-px text-[10px] font-bold tracking-wider text-white ${badgeClass}`}>{props.badge}</span>
            <span className="truncate">{props.status}</span>
          </span>
        </span>
        {props.weather}
        <span className="ob-link flex items-center gap-0.5 text-[12px] font-semibold text-[var(--ob-maroon)]">
          {collapsed ? <ChevronDown size={18} aria-hidden /> : <ChevronUp size={18} aria-hidden />}
          {collapsed ? "Show" : "Hide"}
        </span>
      </button>
      {!collapsed && (
        <div className="min-h-0 overflow-y-auto border-t border-[var(--ob-line)] px-2.5 pt-2 pb-2.5">
          <Lines trains={props.trains} lateness={props.lateness} stationName={props.stationName} onTrain={props.onTrain} />
        </div>
      )}
    </section>
  );
}

function BigSeg({ label, options }: { label: string; options: { label: string; icon: ReactNode; on: boolean; pick: () => void }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-[var(--ob-sand)] p-1">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          role="radio"
          aria-checked={o.on}
          onClick={o.pick}
          className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold transition-all duration-200 [&_svg]:size-4 ${
            o.on ? "bg-[var(--ob-maroon)] text-white shadow-sm" : "text-[var(--ob-ink-2)] hover:bg-[var(--ob-sand)]"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Tile({ icon, label, on, set }: { icon: ReactNode; label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => set(!on)}
      className={`flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-semibold transition-all duration-200 active:scale-95 [&_svg]:size-[15px] ${
        on
          ? "border-[var(--ob-maroon)] bg-[color-mix(in_srgb,var(--ob-maroon)_10%,transparent)] text-[var(--ob-maroon)]"
          : "border-[var(--ob-line)] text-[var(--ob-muted)] hover:border-[var(--ob-maroon)] hover:text-[var(--ob-ink)]"
      }`}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

/** The four subway lines: trains running now, delay vs normal, tonight's last trains. */
function Lines({
  trains,
  lateness,
  stationName,
  onTrain,
}: {
  trains: Train[];
  lateness: LineLateness[] | null;
  stationName: (id: string | null) => string | null;
  onTrain: (t: Train) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [last, setLast] = useState<LastTrip[] | null>(null);
  const [lastError, setLastError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/service")
      .then((r) => r.json())
      .then((j) => alive && (j.last?.length ? setLast(j.last) : setLastError(true)))
      .catch(() => alive && setLastError(true));
    return () => {
      alive = false;
    };
  }, []);
  const byRoute = useMemo(() => {
    const m = new Map<string, Train[]>();
    for (const t of trains) m.set(t.route, [...(m.get(t.route) ?? []), t]);
    return m;
  }, [trains]);

  return (
    <div>
      <ul className="flex flex-col gap-1.5">
        {GROUPS.map((g) => {
          const count = g.routes.reduce((n, r) => n + (byRoute.get(r)?.length ?? 0), 0);
          const late = lateness?.find((l) => l.line === g.id);
          const isOpen = open === g.id;
          const lastHere = (last ?? []).filter((l) => g.routes.includes(l.route));
          const nextLast = lastHere.filter((l) => new Date(l.departs).getTime() > Date.now()).sort((a, b) => a.departs.localeCompare(b.departs))[0];
          return (
            <li key={g.id} className="overflow-hidden rounded-xl border border-[var(--ob-line)] bg-[var(--ob-cream)]" style={{ borderLeft: `4px solid ${g.color}` }}>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--ob-sand)]"
                onClick={() => setOpen(isOpen ? null : g.id)}
                aria-expanded={isOpen}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold text-white" style={{ background: g.color }} aria-hidden>
                  {g.letter}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-[var(--ob-ink)]">{g.label}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--ob-ink-2)]">
                    {count ? `${count} train${count > 1 ? "s" : ""} running` : "No trains right now"}
                    {late && late.method !== "none" && (
                      <span className={`rounded-full px-1.5 py-px text-[11px] font-semibold ${DELAY_STYLE[late.color]}`} title={late.badge}>
                        {late.badge.replace(`${g.label} `, "")}
                      </span>
                    )}
                    {!count && nextLast && <span className="text-[var(--ob-muted)]">· last at {fmt(nextLast.departs)}</span>}
                  </span>
                </span>
                <span className="text-[17px] leading-none font-bold tabular-nums" style={{ color: g.color }}>
                  {count}
                </span>
                {isOpen ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
              </button>
              {isOpen && (
                <div className="flex flex-col gap-2.5 border-t border-[var(--ob-line)] bg-[var(--ob-paper)] px-3 py-2.5 text-[13.5px]">
                  {g.routes.map((r) => {
                    const list = byRoute.get(r) ?? [];
                    const lastR = lastHere.filter((l) => l.route === r);
                    if (!list.length && !lastR.length && g.routes.length > 1) return null;
                    return (
                      <div key={r}>
                        {g.routes.length > 1 && (
                          <p className="mb-1 flex items-center gap-1.5 font-semibold text-[var(--ob-ink)]">
                            <span className="rounded-md px-1.5 py-px text-[11px] font-bold text-white" style={{ background: g.color }}>
                              {r.startsWith("Green-") ? r.slice(6) : r === "Mattapan" ? "M" : g.letter}
                            </span>
                            {routeName(r)}
                            <span className="font-normal text-[var(--ob-muted)]">· {list.length} running</span>
                          </p>
                        )}
                        <ul className="flex flex-col gap-0.5">
                          {list.map((t) => (
                            <li key={t.id}>
                              <button className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-[var(--ob-sand)]" onClick={() => onTrain(t)} title="Show this train on the map">
                                <TrainFront size={14} style={{ color: g.color }} aria-hidden />
                                <span className="min-w-0 flex-1">
                                  <span className="font-medium text-[var(--ob-ink)]">To {destinationOf(t.route, t.directionId ?? 0)}</span>
                                  <span className="block text-[12px] text-[var(--ob-muted)]">
                                    {statusWord(t.status)} {stationName(t.stopId) ?? "the next stop"}
                                  </span>
                                </span>
                              </button>
                            </li>
                          ))}
                          {!list.length && <li className="px-1.5 text-[var(--ob-muted)]">No trains running now</li>}
                        </ul>
                        {lastR.map((l) => (
                          <p key={l.directionId} className="mt-1 flex items-start gap-1.5 px-1.5 text-[12.5px] text-[var(--ob-ink-2)]">
                            <Moon size={13} className="mt-0.5 shrink-0" aria-hidden />
                            <span>
                              Last to {l.headsign ?? destinationOf(r, l.directionId)}: <b>{fmt(l.departs)}</b>
                              {l.from ? ` from ${l.from}` : ""}
                              {new Date(l.departs).getTime() < Date.now() ? " (gone)" : ""}
                            </span>
                          </p>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {lastError && <p className="mt-2 text-[12px] text-[var(--ob-muted)]">Last-train times need the MBTA schedule feed (not reachable right now).</p>}
    </div>
  );
}
