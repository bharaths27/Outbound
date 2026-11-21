import { describe, expect, it } from "vitest";
import { bostonMinutes, formatHours, isOpenAt, openState, parseHours } from "./hours";

// Boston is UTC-5 in November (EST) and UTC-4 in July (EDT).
const bostonNov = (hhmm: string) => new Date(`2026-11-21T${hhmm}:00-05:00`);
const bostonJul = (hhmm: string) => new Date(`2026-07-10T${hhmm}:00-04:00`);

describe("parseHours", () => {
  it("reads ranges, always, and rejects junk", () => {
    expect(parseHours("11:00-22:00")).toEqual({ start: 660, end: 1320 });
    expect(parseHours("7:30 - 9:05")).toEqual({ start: 450, end: 545 });
    expect(parseHours("always")).toBe("always");
    expect(parseHours("Always")).toBe("always");
    expect(parseHours(null)).toBeNull();
    expect(parseHours("")).toBeNull();
    expect(parseHours("weekends")).toBeNull();
    expect(parseHours("25:00-26:00")).toBeNull();
  });
});

describe("bostonMinutes", () => {
  it("uses Boston time whatever the instant's offset", () => {
    expect(bostonMinutes(new Date("2026-11-21T15:30:00Z"))).toBe(10 * 60 + 30); // EST
    expect(bostonMinutes(new Date("2026-07-10T15:30:00Z"))).toBe(11 * 60 + 30); // EDT
  });
});

describe("isOpenAt", () => {
  it("handles a same-day range, including the edges", () => {
    expect(isOpenAt("11:00-22:00", bostonNov("10:59"))).toBe(false);
    expect(isOpenAt("11:00-22:00", bostonNov("11:00"))).toBe(true);
    expect(isOpenAt("11:00-22:00", bostonNov("21:59"))).toBe(true);
    expect(isOpenAt("11:00-22:00", bostonNov("22:00"))).toBe(false);
  });

  it("closes the next day when the end is before the start", () => {
    expect(isOpenAt("11:00-02:00", bostonNov("23:30"))).toBe(true);
    expect(isOpenAt("11:00-02:00", bostonNov("01:59"))).toBe(true);
    expect(isOpenAt("11:00-02:00", bostonNov("02:00"))).toBe(false);
    expect(isOpenAt("11:00-02:00", bostonNov("10:00"))).toBe(false);
    expect(isOpenAt("19:00-00:00", bostonJul("23:59"))).toBe(true);
    expect(isOpenAt("19:00-00:00", bostonJul("00:00"))).toBe(false);
  });

  it("treats always and equal start/end as open, unknown as null", () => {
    expect(isOpenAt("always", bostonNov("03:00"))).toBe(true);
    expect(isOpenAt("00:00-00:00", bostonNov("03:00"))).toBe(true);
    expect(isOpenAt(null, bostonNov("03:00"))).toBeNull();
    expect(isOpenAt("by appointment", bostonNov("03:00"))).toBeNull();
  });
});

describe("labels", () => {
  it("says when a place opens or closes", () => {
    expect(openState("11:00-22:00", bostonNov("12:00"))).toEqual({ open: true, label: "Open until 10 PM" });
    expect(openState("11:30-22:00", bostonNov("09:00"))).toEqual({ open: false, label: "Closed · opens 11:30 AM" });
    expect(openState("19:00-00:00", bostonNov("20:00"))).toEqual({ open: true, label: "Open until midnight" });
    expect(openState("always", bostonNov("04:00"))).toEqual({ open: true, label: "Open 24 hours" });
    expect(openState(null, bostonNov("04:00"))).toBeNull();
  });

  it("formats a range", () => {
    expect(formatHours("11:00-02:00")).toBe("11 AM – 2 AM");
    expect(formatHours("00:00-06:00")).toBe("Midnight – 6 AM");
    expect(formatHours("12:00-15:30")).toBe("Noon – 3:30 PM");
    expect(formatHours("always")).toBe("Open 24 hours");
    expect(formatHours(null)).toBeNull();
  });
});
