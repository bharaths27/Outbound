// The structured answer every Guide reply ends as. The Report tool (Mastra + Gemini structured
// output) fills GuideReportSchema; finalizeReport() then checks it against our real quests so the
// UI never shows an invented quest. Pure functions here so they are unit-tested.
import { z } from "zod";
import type { GuideQuest } from "@/lib/guide";
import type { Destination } from "./geo";

export const GuideReportSchema = z.object({
  title: z.string().describe("Short headline, at most 60 characters, e.g. 'Ramen run on the Green Line'"),
  summary: z.string().describe("One or two friendly sentences, at most 240 characters"),
  steps: z.array(z.string()).describe("0 to 5 short trip steps in order, e.g. 'Ride the Green Line B to Kenmore'"),
  picks: z
    .array(z.object({ questId: z.string(), why: z.string().describe("Why this quest fits, under 80 characters") }))
    .describe("0 to 3 Outbound quests, ids copied exactly from the input"),
  places: z
    .array(
      z.object({
        name: z.string(),
        note: z.string().describe("What to get or see there, under 80 characters"),
        rating: z.number().nullable(),
        price: z.string().nullable().describe("$, $$, $$$ or null"),
        openNow: z.boolean().nullable(),
        nearStation: z.string().nullable().describe("Closest T station, if given in the input"),
      }),
    )
    .describe("0 to 4 real spots from the food research that are not Outbound quests"),
  transit: z
    .object({
      station: z.string(),
      line: z.string().nullable(),
      nextTrainMin: z.number().nullable(),
      delay: z.string().nullable().describe("e.g. 'Green Line +4 min', or null if on time or unknown"),
    })
    .nullable(),
  tips: z.array(z.string()).describe("0 to 3 short tips"),
});
export type GuideReport = z.infer<typeof GuideReportSchema>;

export type Detected = { kind: "food" | "location"; label: string };

export interface QuestCard {
  id: string;
  title: string;
  station_id: string;
  station_name: string | null;
  lines: string[];
  xp: number;
  price_tier: number;
  why: string;
  lat: number | null;
  lon: number | null;
}

export type PlaceCard = GuideReport["places"][number] & { lat?: number; lng?: number; address?: string | null };

export interface FinalReport extends Omit<GuideReport, "picks" | "places"> {
  kind: "plan" | "chat" | "retry";
  detected: Detected | null;
  picks: QuestCard[];
  places: PlaceCard[];
  /** Where the trip goes, located by our code (never by the model), so the map can route there. */
  destination?: Destination | null;
  /** Why a photo couldn't be read (shown small, for testing). */
  debug?: string;
}

const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

/** Keep only real quests, cap every list, trim every string. */
export function finalizeReport(
  raw: GuideReport,
  quests: GuideQuest[],
  kind: FinalReport["kind"],
  detected: Detected | null,
): FinalReport {
  const byId = new Map(quests.map((q) => [q.id, q]));
  const seen = new Set<string>();
  const picks: QuestCard[] = [];
  for (const p of raw.picks ?? []) {
    const q = byId.get(String(p.questId).trim());
    if (!q || seen.has(q.id) || picks.length >= 3) continue;
    seen.add(q.id);
    picks.push({
      id: q.id, title: q.title, station_id: q.station_id, station_name: q.stations?.name ?? null,
      lines: q.stations?.lines ?? [], xp: q.xp, price_tier: q.price_tier, why: clip(p.why, 100),
      lat: typeof q.lat === "number" ? q.lat : null, lon: typeof q.lon === "number" ? q.lon : null,
    });
  }
  const t = raw.transit;
  return {
    kind,
    detected,
    title: clip(raw.title, 70) || "Your Outbound plan",
    summary: clip(raw.summary, 300),
    steps: (raw.steps ?? []).map((s) => clip(s, 140)).filter(Boolean).slice(0, 5),
    picks,
    places: (raw.places ?? []).slice(0, 4).map((p) => ({
      name: clip(p.name, 60),
      note: clip(p.note, 100),
      rating: typeof p.rating === "number" && p.rating >= 0 && p.rating <= 5 ? Math.round(p.rating * 10) / 10 : null,
      price: p.price ? clip(p.price, 4) : null,
      openNow: typeof p.openNow === "boolean" ? p.openNow : null,
      nearStation: p.nearStation ? clip(p.nearStation, 40) : null,
    })).filter((p) => p.name),
    transit: t && t.station
      ? {
          station: clip(t.station, 40),
          line: t.line ? clip(t.line, 20) : null,
          nextTrainMin: typeof t.nextTrainMin === "number" && t.nextTrainMin >= 0 ? Math.round(t.nextTrainMin) : null,
          delay: t.delay ? clip(t.delay, 40) : null,
        }
      : null,
    tips: (raw.tips ?? []).map((s) => clip(s, 120)).filter(Boolean).slice(0, 3),
  };
}

/** Used when the Report tool is down: a plain report from the text and the quest ids we already have. */
export function fallbackReport(text: string, questIds: string[], quests: GuideQuest[], detected: Detected | null): FinalReport {
  return finalizeReport(
    {
      title: detected ? `Your ${detected.kind === "food" ? "food" : "place"} plan: ${detected.label}` : questIds.length ? "Quest ideas for you" : "Here's an idea",
      summary: text.replace(/\n?QUESTS:[\s\S]*$/i, "").replace(/\n?Quest ids:[\s\S]*$/i, "").trim().slice(0, 300),
      steps: [],
      picks: questIds.map((id) => ({ questId: id, why: "" })),
      places: [],
      transit: null,
      tips: [],
    },
    quests,
    detected ? "plan" : "chat",
    detected,
  );
}

/** What we answer when the photo isn't food or a place. */
export function retryReport(label: string): FinalReport {
  const seen = label ? `It looks like ${label.replace(/[.]+$/, "")}. ` : "";
  return {
    kind: "retry",
    detected: null,
    title: "I couldn't find food or a place in that photo",
    summary: `${seen}Send a photo of a dish, a drink, a storefront or a Boston spot, or just type what you're craving.`,
    steps: [],
    picks: [],
    places: [],
    transit: null,
    tips: ["Get close to the food or the sign", "Daylight photos work best"],
  };
}
