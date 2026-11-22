// Every tag in Suki's content must be one Gemini search is allowed to pick, or search can't match it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KNOWN_TAGS } from "./search";

describe("search tags", () => {
  it("cover every vibe tag in content/quests.csv", () => {
    const lines = readFileSync("content/quests.csv", "utf8").trim().split("\n");
    const header = lines[0].split(",").map((h) => h.replace(/"/g, ""));
    const col = header.indexOf("vibe_tags");
    const tags = new Set<string>();
    for (const line of lines.slice(1)) {
      const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, ""));
      for (const t of cells[col].split("|")) if (t.trim()) tags.add(t.trim());
    }
    expect(tags.size).toBeGreaterThan(5);
    expect([...tags].filter((t) => !KNOWN_TAGS.includes(t))).toEqual([]);
  });
});
