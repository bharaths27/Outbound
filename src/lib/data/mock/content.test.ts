// Checks the content in content/*.csv (via the generated content.ts) against the rules the
// schema and the hub rely on. If this fails after editing a CSV, fix the CSV and run
// `npm run content` again. Rules are written up in content/README.md.

import { describe, expect, it } from "vitest";
import { parseSchedule } from "@/features/hub/hours";
import { quests, stations } from "./content";

const ROUTES = new Set(["Red", "Orange", "Blue", "Mattapan", "Green-B", "Green-C", "Green-D", "Green-E"]);
const TYPES = new Set(["food", "event", "scenic"]);
// The budget and time filters cover these, and the search parser never reads them as cravings.
const BUDGET_TIME_WORDS = new Set(["free", "cheap", "budget", "affordable", "quick", "fast"]);
// Rough box around Greater Boston, to catch swapped or mistyped coordinates.
const inBoston = (lat: number, lon: number) => lat > 42.2 && lat < 42.5 && lon > -71.3 && lon < -70.9;

describe("content: stations", () => {
  it("has unique MBTA parent stop ids", () => {
    const ids = stations.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^place-[a-z0-9]+$/);
  });

  it.each(stations.map((s) => [s.id, s] as const))("%s is complete", (_id, s) => {
    expect(s.name).not.toBe("");
    expect(s.neighborhood).not.toBe("");
    expect(s.lines.length).toBeGreaterThan(0);
    for (const line of s.lines) expect(ROUTES, `unknown line "${line}"`).toContain(line);
    expect(inBoston(s.lat, s.lon), "lat/lon outside Boston").toBe(true);
  });
});

describe("content: quests", () => {
  const stationIds = new Set(stations.map((s) => s.id));

  it("has unique ids", () => {
    const ids = quests.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(quests.map((q) => [q.id, q] as const))("%s follows the rules", (_id, q) => {
    expect(q.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(stationIds, `unknown station "${q.station_id}"`).toContain(q.station_id);
    expect(TYPES, `type "${q.type}" must be food, event, or scenic`).toContain(q.type);
    expect(q.title).not.toBe("");
    expect([0, 1, 2, 3]).toContain(q.price_tier);
    expect(q.xp).toBeGreaterThan(0);
    expect(q.walk_min).toBeGreaterThan(0);
    expect(q.duration_min).toBeGreaterThan(0);
    expect(inBoston(q.lat, q.lon), "lat/lon outside Boston").toBe(true);
    for (const tag of q.vibe_tags) {
      expect(tag, "tags are lowercase-hyphenated").toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(BUDGET_TIME_WORDS.has(tag), `"${tag}" is a budget or time word`).toBe(false);
    }
    if (q.hours !== null) expect(parseSchedule(q.hours), `unreadable hours "${q.hours}"`).not.toBeNull();
    if (q.photo_url !== null) expect(q.photo_url).toMatch(/^https:\/\//);
  });

  it("gives every station a description", () => {
    for (const s of stations) expect(s.story?.trim(), s.id).toBeTruthy();
  });
});
