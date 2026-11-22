// POST /api/agent  { "message": "cheap food near Kenmore, I have an hour" }
// -> { reply, quests: [{ id, title, station_id, station_name, xp, price_tier }], tools: ["searchQuests", ...],
//      framework: "mastra", model }
// GET /api/agent?q=... for quick testing in the browser.
//
// The Outbound Trip Planner: a Mastra agent on Gemini that calls our own tools (Supabase quests,
// MBTA next trains, Tiger Data line delays). Env: GEMINI_API_KEY (server-only), optional MASTRA_MODEL.
import { NextResponse } from "next/server";
import { AGENT_MODEL, loadQuests, makePlanner, plannerPrompt, splitReply } from "@/lib/agent/planner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let message = "";
  try {
    message = String((await req.json())?.message ?? "").trim().slice(0, 500);
  } catch {
    return NextResponse.json({ error: 'Send JSON like { "message": "cheap food near Kenmore" }' }, { status: 400 });
  }
  if (!message) return NextResponse.json({ error: "message is empty" }, { status: 400 });

  try {
    const origin = new URL(req.url).origin;
    const agent = makePlanner(origin);
    const result = await agent.generate(plannerPrompt(message), { maxSteps: 6 });
    const tools = [...new Set(result.steps.flatMap((s) => s.toolCalls.map((c) => c.payload.toolName)))];
    const { reply, quests } = splitReply(result.text, await loadQuests());
    return NextResponse.json({ reply, quests, tools, framework: "mastra", model: AGENT_MODEL });
  } catch (e) {
    console.error("[agent]", (e as Error).message);
    return NextResponse.json({ error: "The trip planner is unavailable right now" }, { status: 503 });
  }
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return POST(new Request(req.url, { method: "POST", body: JSON.stringify({ message: q }) }));
}
