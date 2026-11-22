import { describe, expect, it } from "vitest";
import { guideFloatsOn, guideInHeaderOn } from "./placement";

describe("Ask Guide placement", () => {
  it("explore-only: floats on Explore, header button elsewhere", () => {
    expect(guideFloatsOn("/", "explore-only")).toBe(true);
    expect(guideInHeaderOn("/", "explore-only")).toBe(false);
    for (const p of ["/quests", "/profile", "/q/abc", "/settings/privacy"]) {
      expect(guideFloatsOn(p, "explore-only")).toBe(false);
      expect(guideInHeaderOn(p, "explore-only")).toBe(true);
    }
  });

  it("everywhere: floats on every page, never in the header", () => {
    for (const p of ["/", "/quests", "/profile"]) {
      expect(guideFloatsOn(p, "everywhere")).toBe(true);
      expect(guideInHeaderOn(p, "everywhere")).toBe(false);
    }
  });
});
