// Labels and small helpers for student-hosted events (010_hosted_events.sql). Shared by the Host
// page and the map, so an event reads the same in both places.

import { BookOpen, Hand, Music, PartyPopper, Pizza, Sparkles, Volleyball, Wrench, type LucideIcon } from "lucide-react";
import {
  type IconNode,
  BookOpen as BookOpenNode,
  Hand as HandNode,
  Music as MusicNode,
  PartyPopper as PartyPopperNode,
  Pizza as PizzaNode,
  Sparkles as SparklesNode,
  Volleyball as VolleyballNode,
  Wrench as WrenchNode,
} from "lucide";
import type { HostedEvent, HostedEventKind, HostedFood } from "@/lib/data/types";

// Each kind has a lucide icon: `icon` for React, `node` for the map's plain-DOM pins.
export const EVENT_KINDS: { id: HostedEventKind; label: string; icon: LucideIcon; node: IconNode }[] = [
  { id: "party", label: "Party", icon: PartyPopper, node: PartyPopperNode },
  { id: "social", label: "Social / mixer", icon: Hand, node: HandNode },
  { id: "food", label: "Food event", icon: Pizza, node: PizzaNode },
  { id: "study", label: "Study jam", icon: BookOpen, node: BookOpenNode },
  { id: "sports", label: "Sports", icon: Volleyball, node: VolleyballNode },
  { id: "music", label: "Music / show", icon: Music, node: MusicNode },
  { id: "workshop", label: "Workshop / talk", icon: Wrench, node: WrenchNode },
  { id: "other", label: "Other", icon: Sparkles, node: SparklesNode },
];

export const FOOD_OPTIONS: { id: HostedFood; label: string; spend: string }[] = [
  { id: "free", label: "Free food", spend: "Free food" },
  { id: "cheap", label: "Cheap (under $10)", spend: "Under $10 for food" },
  { id: "paid", label: "Food for sale", spend: "Food for sale" },
  { id: "none", label: "No food", spend: "Free to go, no food" },
];

export const kindInfo = (k: HostedEventKind) => EVENT_KINDS.find((x) => x.id === k) ?? EVENT_KINDS[EVENT_KINDS.length - 1];
export const foodInfo = (f: HostedFood) => FOOD_OPTIONS.find((x) => x.id === f) ?? FOOD_OPTIONS[3];

/** Happening now, later today, or ended. */
export function eventStatus(e: Pick<HostedEvent, "starts_at" | "ends_at">, now = new Date()): "now" | "soon" | "later" | "ended" {
  const s = new Date(e.starts_at).getTime();
  const end = new Date(e.ends_at).getTime();
  const t = now.getTime();
  if (t >= end) return "ended";
  if (t >= s) return "now";
  return s - t < 3 * 3600_000 ? "soon" : "later";
}

/** "Now until 9:00 PM", "Today 7:00 PM to 10:00 PM", "Sat, Nov 28, 7:00 PM to 10:00 PM". */
export function whenText(e: Pick<HostedEvent, "starts_at" | "ends_at">, now = new Date()): string {
  const s = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = (d: Date) =>
    sameDay(d, now)
      ? "Today"
      : sameDay(d, new Date(now.getTime() + 86400_000))
        ? "Tomorrow"
        : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const status = eventStatus(e, now);
  if (status === "ended") return `Ended ${day(end).toLowerCase() === "today" ? "today" : day(end)} at ${time(end)}`;
  if (status === "now") return `Happening now, until ${sameDay(end, now) ? "" : day(end) + " "}${time(end)}`;
  return `${day(s)} ${time(s)} to ${sameDay(s, end) ? "" : day(end) + " "}${time(end)}`;
}

/** Map link that opens the place card with directions. */
export const eventMapHref = (e: Pick<HostedEvent, "lat" | "lon" | "title" | "id">) =>
  `/?go=${e.lat.toFixed(5)},${e.lon.toFixed(5)}&name=${encodeURIComponent(e.title)}&event=${encodeURIComponent(e.id)}`;

/** Fired on window after an event is published or deleted, so the map redraws its event pins. */
export const EVENTS_CHANGED = "outbound:events-changed";

/** The BU Spark! example, for the "Use the Spark! example" button. */
export const SPARK_EXAMPLE = {
  host_name: "BU Spark!",
  title: "Spark! Demo Night",
  kind: "party" as HostedEventKind,
  description: "Student teams show what they built this semester. Meet people from other schools, try the demos, vote for your favorite.",
  food: "free" as HostedFood,
  prizes: "Raffle: headphones and Spark! swag",
  place_name: "BU Spark!, 665 Commonwealth Ave",
  lat: 42.3505,
  lon: -71.1035,
  station_id: "place-bucen",
};
