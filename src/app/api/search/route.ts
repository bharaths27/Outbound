// POST /api/search  { "q": "cheap dumplings, 40 min" }
// -> { filters: { craving, budget, minutes }, tags: string[], keywords: string[], source: "gemini" | "fallback" }
//
// Uses Gemini to turn free text into filters. Falls back to a keyword parser if Gemini
// fails or takes over 6 s, so the search bar always answers.
// Env: GEMINI_API_KEY (server-only). Optional GEMINI_MODEL (default gemini-2.5-flash).
import { NextResponse } from "next/server";
import { buildPrompt, fallbackParse, RESPONSE_SCHEMA, sanitize } from "@/lib/search";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

async function askGemini(q: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(q) }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
      signal: AbortSignal.timeout(6000),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text");
  return sanitize(JSON.parse(text), "gemini");
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "search", 40, 60000);
  if (limited) return limited;
  let q = "";
  try {
    q = String((await req.json())?.q ?? "").trim().slice(0, 300);
  } catch {
    return NextResponse.json({ error: 'Send JSON like { "q": "cheap dumplings" }' }, { status: 400 });
  }
  if (!q) return NextResponse.json({ error: "q is empty" }, { status: 400 });
  try {
    return NextResponse.json(await askGemini(q));
  } catch (e) {
    console.warn("[search] Gemini failed, using fallback:", (e as Error).message);
    return NextResponse.json(fallbackParse(q));
  }
}

// GET /api/search?q=... for quick testing in the browser
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return POST(new Request(req.url, { method: "POST", body: JSON.stringify({ q }) }));
}
