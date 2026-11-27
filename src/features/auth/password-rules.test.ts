import { describe, expect, it } from "vitest";
import { checkPassword } from "./password-rules";

describe("checkPassword", () => {
  it("needs 8+ chars, upper, lower, and a number or symbol", () => {
    expect(checkPassword("Short1!").ok).toBe(false);
    expect(checkPassword("alllowercase1").ok).toBe(false);
    expect(checkPassword("ALLUPPERCASE1").ok).toBe(false);
    expect(checkPassword("NoNumbersHere").ok).toBe(false);
    expect(checkPassword("Green-Line-27").ok).toBe(true);
    expect(checkPassword("Tquest4ever").ok).toBe(true);
  });
  it("reports each rule", () => {
    const r = checkPassword("abc");
    expect(r.rules.map((x) => [x.id, x.ok])).toEqual([["length", false], ["lower", true], ["upper", false], ["other", false]]);
  });
  it("rejects common passwords even if they pass the rules", () => {
    expect(checkPassword("Password1").ok).toBe(false);
    expect(checkPassword("Password1").problem).toMatch(/too common/);
    expect(checkPassword("Boston123").ok).toBe(false);
  });
  it("rejects passwords containing the email name", () => {
    expect(checkPassword("Vernalin2027!", "vernalin@bu.edu").problem).toMatch(/email name/);
  });
});
