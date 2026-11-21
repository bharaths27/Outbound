// POST /api/guide  { "message": "cheap food near Kenmore, I have an hour", "history": [{ role, content }] }
// -> { reply: string, quests: [{ id, title, station_id, station_name, xp, price_tier }], source: "grok" | "fallback" }
//
// Outbound Guide: a chat helper powered by Grok (xAI) that recommends real quests from our
// Supabase data. Falls back to a keyword matcher if Grok fails or takes over 15 s.
// Env: XAI_API_KEY (server-only). Optional GROK_MODEL (default grok-4.7).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildSystemPrompt, cleanHistory, fallbackGuide, parseGuideReply,
  type GuideQuest, type GuideTurn,
} from "@/lib/guide";

export const dynamic = "force-dynamic";

const MODEL = process.env.GROK_MODEL || "grok-4.7";
const QUEST_FIELDS =
  "id,title,type,description,price_tier,vibe_tags,hours,xp,duration_min,walk_min,station_id,stations(name,lines,neighborhood)";

// Quests are public data, so the publishable key is enough. Cached for 5 minutes.
let cache: { at: number; quests: GuideQuest[] } | null = null;
async function loadQuests(): Promise<GuideQuest[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.quests;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env not set");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.from("quests").select(QUEST_FIELDS).limit(300);
  if (error) throw new Error(`quests: ${error.message}`);
  cache = { at: Date.now(), quests: (data ?? []) as unknown as GuideQuest[] };
  return cache.quests;
}

async function askGrok(message: string, history: GuideTurn[], quests: GuideQuest[]) {
  // Tolerate stray spaces or quotes pasted around the key.
  const key = process.env.XAI_API_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("XAI_API_KEY not set");
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: buildSystemPrompt(quests) },
        ...history,
        { role: "user", content: message },
      ],
      temperature: 0.5,
      store: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Grok ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string | undefined =
    data?.output_text ??
    data?.output
      ?.filter((o: { type?: string }) => o?.type === "message")
      .flatMap((o: { content?: { type?: string; text?: string }[] }) => o.content ?? [])
      .find((c: { type?: string }) => c?.type === "output_text")?.text;
  if (!text) throw new Error("Grok returned no text");
  return parseGuideReply(text, quests);
}

export async function POST(req: Request) {
  let message = "";
  let history: GuideTurn[] = [];
  try {
    const body = await req.json();
    message = String(body?.message ?? "").trim().slice(0, 500);
    history = cleanHistory(body?.history);
  } catch {
    return NextResponse.json({ error: 'Send JSON like { "message": "cheap food near Kenmore" }' }, { status: 400 });
  }
  if (!message) return NextResponse.json({ error: "message is empty" }, { status: 400 });

  let quests: GuideQuest[];
  try {
    quests = await loadQuests();
  } catch (e) {
    console.error("[guide]", (e as Error).message);
    return NextResponse.json({ error: "Couldn't load quests" }, { status: 503 });
  }
  try {
    return NextResponse.json(await askGrok(message, history, quests));
  } catch (e) {
    console.warn("[guide] Grok failed, using fallback:", (e as Error).message);
    return NextResponse.json(fallbackGuide(message, quests));
  }
}

// GET /api/guide?q=... for quick testing in the browser
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return POST(new Request(req.url, { method: "POST", body: JSON.stringify({ message: q }) }));
}
