// Gemini out of credits (429): agents answer with Grok, and the next calls skip Gemini entirely.
import { expect, it, vi } from "vitest";

it("switches to Grok when Gemini is out of quota", async () => {
  process.env.GEMINI_API_KEY = "g";
  process.env.XAI_API_KEY = "x";
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(String(url).includes("x.ai") ? "grok" : "gemini");
    if (String(url).includes("x.ai"))
      return Response.json({
        id: "r", object: "response", created_at: 1, model: "grok", status: "completed",
        output: [{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text: "hello from grok", annotations: [] }] }],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      });
    return Response.json({ error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } }, { status: 429 });
  });
  const { geminiModels, resetModelHealth } = await import("./planner");
  resetModelHealth();
  const { Agent } = await import("@mastra/core/agent");
  const t0 = Date.now();
  for (let i = 0; i < 2; i++) {
    const r = await new Agent({ id: "t", name: "t", instructions: "hi", model: geminiModels() }).generate("say hi");
    expect(r.text).toBe("hello from grok");
  }
  expect(calls).toEqual(["gemini", "grok", "grok"]);
  expect(Date.now() - t0).toBeLessThan(3000); // no retry waits
  vi.unstubAllGlobals();
});
