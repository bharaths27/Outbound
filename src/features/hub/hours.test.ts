import { describe, expect, it } from "vitest";
import { bostonMinutes, bostonTime, formatHours, formatSchedule, isOpenAt, openState, parseHours, parseSchedule, scheduleRows } from "./hours";

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
    expect(formatHours("Daily 07:00-19:00")).toBe("7 AM – 7 PM");
    expect(formatHours("12:00-15:30")).toBe("Noon – 3:30 PM");
    expect(formatHours("always")).toBe("Open 24 hours");
    expect(formatHours(null)).toBeNull();
  });
});

// 2026-11-21 is a Saturday; 11-22 Sunday; 11-23 Monday; 11-17 Tuesday.
const at = (date: string, hhmm: string) => new Date(`2026-11-${date}T${hhmm}:00-05:00`);

describe("weekday schedules", () => {
  const library = "Mon,Fri 10:00-18:00; Tue-Thu 10:00-21:00; Sat 10:00-14:00";

  it("knows the Boston weekday", () => {
    expect(bostonTime(at("21", "12:00"))).toEqual({ day: 5, minutes: 720 });
    expect(bostonTime(new Date("2026-11-23T03:00:00Z"))).toEqual({ day: 6, minutes: 22 * 60 }); // still Sunday in Boston
  });

  it("parses day lists, ranges, wrapping ranges, and Daily", () => {
    expect(parseSchedule("Sun-Tue 08:00-18:00")).toEqual([
      { day: 6, start: 480, end: 1080 },
      { day: 0, start: 480, end: 1080 },
      { day: 1, start: 480, end: 1080 },
    ].sort((a, b) => a.day - b.day));
    expect(parseSchedule("Daily 07:00-19:00")).toHaveLength(7);
    expect(parseSchedule("Mon–Thu 09:00–20:00")).toHaveLength(4); // en dashes are fine
    expect(parseSchedule("Funday 09:00-10:00")).toBeNull();
    expect(parseSchedule("Mon-Tue-Wed 09:00-10:00")).toBeNull();
    expect(parseSchedule("Mon 9 AM-5 PM")).toBeNull();
    expect(parseHours("Mon-Fri 09:00-17:00")).toBeNull(); // not the same every day
    expect(parseHours("Daily 09:00-17:00")).toEqual({ start: 540, end: 1020 });
  });

  it("is closed on days that aren't listed", () => {
    expect(isOpenAt(library, at("22", "12:00"))).toBe(false); // Sunday
    expect(isOpenAt(library, at("21", "13:59"))).toBe(true); // Saturday
    expect(isOpenAt(library, at("21", "14:00"))).toBe(false);
    expect(isOpenAt(library, at("17", "20:30"))).toBe(true); // Tuesday late hours
  });

  it("keeps after-midnight hours with the day they started", () => {
    const bar = "Fri,Sat 18:00-02:00";
    expect(isOpenAt(bar, at("22", "01:30"))).toBe(true); // Sunday 1:30 AM, from Saturday
    expect(isOpenAt(bar, at("23", "01:30"))).toBe(false); // Monday 1:30 AM, Sunday is closed
  });

  it("says when a closed place opens next", () => {
    expect(openState(library, at("22", "12:00"))).toEqual({ open: false, label: "Closed · opens tomorrow 10 AM" });
    expect(openState(library, at("21", "15:00"))).toEqual({ open: false, label: "Closed · opens Mon 10 AM" });
    expect(openState(library, at("17", "08:00"))).toEqual({ open: false, label: "Closed · opens 10 AM" });
    expect(openState(library, at("17", "12:00"))).toEqual({ open: true, label: "Open until 9 PM" });
  });

  it("formats a week of hours", () => {
    expect(formatSchedule(library)).toEqual(["Mon, Fri 10 AM – 6 PM", "Tue–Thu 10 AM – 9 PM", "Sat 10 AM – 2 PM"]);
    expect(formatSchedule("Sat,Sun 08:00-16:00; Mon-Fri 07:00-15:00")).toEqual(["Mon–Fri 7 AM – 3 PM", "Sat, Sun 8 AM – 4 PM"]);
    expect(formatSchedule("Mon-Sat 07:00-20:00; Sun 07:30-19:00")).toEqual(["Mon–Sat 7 AM – 8 PM", "Sun 7:30 AM – 7 PM"]);
    expect(formatSchedule("Sun-Tue 08:00-18:00; Wed-Sat 08:00-20:00")).toEqual(["Sun–Tue 8 AM – 6 PM", "Wed–Sat 8 AM – 8 PM"]);
  });
});

describe("scheduleRows", () => {
  it("lists each range with closed days and flags today", () => {
    // 2026-11-21 is a Saturday
    expect(scheduleRows("Mon,Fri 10:00-18:00; Tue-Thu 10:00-21:00; Sat 10:00-14:00", at("21", "12:00"))).toEqual([
      { days: "Mon, Fri", time: "10 AM – 6 PM", today: false },
      { days: "Tue–Thu", time: "10 AM – 9 PM", today: false },
      { days: "Sat", time: "10 AM – 2 PM", today: true },
      { days: "Sun", time: "Closed", today: false },
    ]);
    expect(scheduleRows("07:00-19:00", at("21", "12:00"))).toEqual([{ days: "Every day", time: "7 AM – 7 PM", today: true }]);
    expect(scheduleRows("always", at("21", "12:00"))).toEqual([{ days: "Every day", time: "Open 24 hours", today: true }]);
    expect(scheduleRows(null, at("21", "12:00"))).toBeNull();
  });
});
