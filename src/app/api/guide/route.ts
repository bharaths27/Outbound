// POST /api/guide  { "message": "cheap food near Kenmore, I have an hour", "history": [{ role, content }],
//                   "image"?: "data:image/jpeg;base64,...", "stream"?: true }
// -> { reply, quests: [{ id, title, station_id, station_name, xp, price_tier }], report: FinalReport,
//      source: "pipeline" | "fallback", stages: [{ stage, status, detail }] }
// With "stream": true the answer is NDJSON: one {"type":"stage",...} line per pipeline stage as it
// happens, then one {"type":"result",...} line with the object above.
//
// Outbound Guide. Text: Grok answers, then the Report tool structures it. Photo: Grok describes it and the
// Photo Decider agent decides food / place / neither; food goes to the Food Researcher agent, then the Trip Planner agent; a place goes
// straight to the Trip Planner; neither asks for another photo. Agents are Mastra + Gemini
// (src/lib/agent/pipeline.ts). A keyword matcher answers if everything is down.
// Env: XAI_API_KEY, GEMINI_API_KEY (server-only). Optional GROK_MODEL, MASTRA_MODEL.
import { NextResponse } from "next/server";
import { cleanHistory, fallbackGuide, type GuideQuest, type GuideTurn } from "@/lib/guide";
import { loadQuests } from "@/lib/agent/planner";
import { makeChatWorkflow, makePhotoWorkflow, runWorkflow, type StageEvent } from "@/lib/agent/pipeline";
import { fallbackReport, type FinalReport } from "@/lib/agent/report";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // photo: Grok (up to 40 s) + decider + agents

const IMAGE_RE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_CHARS = 4_000_000; // ~3 MB of base64; Vercel's request limit is 4.5 MB

function photoDown(reason: string): FinalReport {
  return {
    kind: "retry", detected: null, title: "I couldn't look at that photo just now",
    summary: "Try the photo again in a moment, or type what you're craving and I'll find a quest.",
    steps: [], picks: [], places: [], transit: null, tips: [], debug: reason.slice(0, 300),
  };
}

async function answer(origin: string, message: string, history: GuideTurn[], image: string | null, emit: (e: StageEvent) => void) {
  const stages: StageEvent[] = [];
  const track = (e: StageEvent) => {
    stages.push(e);
    emit(e);
  };
  let quests: GuideQuest[];
  try {
    quests = await loadQuests();
  } catch (e) {
    console.error("[guide]", (e as Error).message);
    return { error: "Couldn't load quests", status: 503 as const };
  }
  let report: FinalReport;
  let source: "pipeline" | "fallback" = "pipeline";
  try {
    report = image
      ? await runWorkflow(makePhotoWorkflow({ origin, quests, emit: track }), { image, note: message })
      : await runWorkflow(makeChatWorkflow({ origin, quests, emit: track }), { message, history });
  } catch (e) {
    console.warn("[guide] pipeline failed, using fallback:", (e as Error).message);
    source = "fallback";
    if (image) report = photoDown((e as Error).message);
    else {
      const fb = fallbackGuide(message, quests);
      report = fallbackReport(fb.reply, fb.quests.map((q) => q.id), quests, null);
    }
  }
  const latest = new Map(stages.map((s) => [s.stage, s]));
  return {
    reply: report.summary,
    quests: report.picks.map(({ id, title, station_id, station_name, xp, price_tier }) => ({ id, title, station_id, station_name, xp, price_tier })),
    report,
    source,
    stages: [...latest.values()],
  };
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "guide", 20, 60000);
  if (limited) return limited;
  let message = "";
  let history: GuideTurn[] = [];
  let image: string | null = null;
  let stream = false;
  try {
    const body = await req.json();
    message = String(body?.message ?? "").trim().slice(0, 500);
    history = cleanHistory(body?.history);
    stream = body?.stream === true;
    if (body?.image != null) {
      image = String(body.image);
      if (image.length > MAX_IMAGE_CHARS) return NextResponse.json({ error: "Photo is too big. Try a smaller one." }, { status: 413 });
      if (!IMAGE_RE.test(image)) return NextResponse.json({ error: "Photo must be a JPEG or PNG." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Send JSON like { "message": "cheap food near Kenmore" }' }, { status: 400 });
  }
  if (!message && !image) return NextResponse.json({ error: "message is empty" }, { status: 400 });
  const origin = new URL(req.url).origin;

  if (!stream) {
    const out = await answer(origin, message, history, image, () => {});
    return "error" in out ? NextResponse.json({ error: out.error }, { status: out.status }) : NextResponse.json(out);
  }

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(obj)}\n`));
      try {
        const out = await answer(origin, message, history, image, (e) => send({ type: "stage", ...e }));
        send("error" in out ? { type: "error", error: out.error } : { type: "result", ...out });
      } catch (e) {
        send({ type: "error", error: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}

// GET /api/guide?q=... for quick testing in the browser
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return POST(new Request(req.url, { method: "POST", body: JSON.stringify({ message: q }) }));
}
