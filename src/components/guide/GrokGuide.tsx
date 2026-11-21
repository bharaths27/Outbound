"use client";
// Floating "Ask Outbound Guide" chat, powered by Grok via /api/guide.
// Self-contained: drop <GrokGuide /> anywhere (it's in the root layout so it shows on every page).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Pick {
  id: string;
  title: string;
  station_id: string;
  station_name: string | null;
  xp: number;
  price_tier: number;
}
interface Msg {
  role: "user" | "assistant";
  content: string;
  quests?: Pick[];
}

const PRICE = ["Free", "$", "$$", "$$$"];
const STARTERS = ["Cheap eats open now", "Photo spot on the Green Line", "Date night, about 2 hours"];

export default function GrokGuide() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", content: "Hey! Tell me your craving, budget, or how much time you have, and I'll find you a quest on the T." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history = msgs.slice(1).map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/guide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json();
      setMsgs((m) => [
        ...m,
        res.ok
          ? { role: "assistant", content: data.reply, quests: data.quests }
          : { role: "assistant", content: data.error ?? "Something went wrong. Try again?" },
      ]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "I couldn't reach the guide. Check your connection?" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="flex h-[480px] max-h-[75vh] w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-2xl dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <div>
              <p className="text-sm font-semibold">Outbound Guide</p>
              <p className="text-xs text-neutral-500">Powered by Grok</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close guide" className="rounded-full px-2 text-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900">
              ×
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${m.role === "user" ? "bg-emerald-600 text-white" : "bg-neutral-100 dark:bg-neutral-900"}`}>
                  {m.content}
                </div>
                {m.quests && m.quests.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {m.quests.map((q) => (
                      <Link key={q.id} href={`/q/${q.id}`} className="block rounded-xl border border-neutral-200 px-3 py-2 hover:border-emerald-500 dark:border-neutral-800">
                        <p className="font-medium">{q.title}</p>
                        <p className="text-xs text-neutral-500">
                          {q.station_name ?? q.station_id} · {PRICE[q.price_tier] ?? ""} · +{q.xp} XP
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <p className="text-xs text-neutral-500">Guide is thinking…</p>}
            {msgs.length === 1 && (
              <div className="flex flex-wrap gap-1.5">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-neutral-300 px-3 py-1 text-xs hover:border-emerald-500 dark:border-neutral-700">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              placeholder="Cheap dumplings, 1 hour…"
              className="flex-1 rounded-full border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700"
            />
            <button type="submit" disabled={busy || !input.trim()} className="rounded-full bg-emerald-600 px-4 text-sm font-medium text-white disabled:opacity-40">
              Ask
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-emerald-700"
      >
        {open ? "Close" : "✦ Ask Guide"}
      </button>
    </div>
  );
}
