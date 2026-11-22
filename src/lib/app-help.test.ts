import { describe, expect, it } from "vitest";
import { answerAppQuestion, appHelpPrompt } from "./app-help";
import { buildSystemPrompt, fallbackGuide } from "./guide";

describe("Guide answers questions about the app", () => {
  it("answers app questions from the FAQ when the models are down", () => {
    expect(answerAppQuestion("How do I earn XP?")).toMatch(/checking in/i);
    expect(answerAppQuestion("what is OUT and how do coupons work")).toMatch(/Solana/);
    expect(answerAppQuestion("how do I host an event for my club?")).toMatch(/Host tab/);
    expect(answerAppQuestion("why can't I check in?")).toMatch(/75 m/);
  });
  it("leaves quest requests to the quest matcher", () => {
    expect(answerAppQuestion("where can I get cheap dumplings?")).toBeNull();
    expect(answerAppQuestion("recommend a museum near the Green Line")).toBeNull();
    expect(answerAppQuestion("pizza")).toBeNull();
  });
  it("puts the app facts in the model prompt", () => {
    const p = buildSystemPrompt([]);
    expect(p).toContain(appHelpPrompt().split("\n")[0]);
    expect(p).toMatch(/OUT/);
  });
  it("fallback guide replies with the FAQ and no quests", () => {
    const r = fallbackGuide("How does the passport work?", []);
    expect(r.reply).toMatch(/Bronze/);
    expect(r.quests).toEqual([]);
  });
});
