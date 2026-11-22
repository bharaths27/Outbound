"use client";
// Floating "Ask Outbound Guide" chat, powered by Grok via /api/guide. Type, or snap a photo of food or a place.
// Self-contained: drop <GrokGuide /> anywhere (it's in the root layout so it shows on every page).
import { Camera, Sparkles } from "lucide-react";
import Link from "next/link";
import { OPEN_GUIDE_EVENT, type OpenGuideDetail } from "@/features/guide/open-guide";
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
  image?: string; // data URL, shown in the chat only (not resent in history)
  quests?: Pick[];
}

// Shrink any photo (including iPhone HEIC, which the browser can decode) to a JPEG of at most 1024 px.
async function toJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const PRICE = ["Free", "$", "$$", "$$$"];
const STARTERS = ["Cheap eats open now", "Photo spot on the Green Line", "Date night, about 2 hours"];
const WELCOME =
  "Hey! Tell me your craving, budget, or how much time you have, or tap the camera to snap a photo of food or a place. I'll find you a quest on the T.";

/**
 * The launcher sits bottom-left, clear of the map's zoom buttons (bottom-right) and the
 * station hub (right sheet on desktop). `hideLauncher` hides only the button, e.g. while the
 * phone hub drawer is up; the hub has its own Ask Guide button that opens the same chat.
 */
export default function GrokGuide({ hideLauncher = false }: { hideLauncher?: boolean }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const prompt = (e as CustomEvent<OpenGuideDetail>).detail?.prompt;
      setOpen(true);
      if (prompt) setInput(prompt);
    };
    window.addEventListener(OPEN_GUIDE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, onOpen);
  }, []);

  // Esc closes the panel (DESIGN.md §10).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (hideLauncher && !open) return null;

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto(await toJpeg(file));
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "I couldn't open that photo. Try a JPEG or PNG?" }]);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function send(text: string) {
    const message = text.trim();
    const image = photo;
    if ((!message && !image) || busy) return;
    const history = msgs
      .slice(1)
      .map(({ role, content, image: img }) => ({ role, content: img ? `[sent a photo] ${content}`.trim() : content }));
    setMsgs((m) => [...m, { role: "user", content: message, image: image ?? undefined }]);
    setInput("");
    setPhoto(null);
    setBusy(true);
    try {
      const res = await fetch("/api/guide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history, image }),
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
    <div className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-4 z-[60] flex flex-col items-start gap-2 desk:bottom-6 desk:left-6">
      {open && (
        <div
          role="dialog"
          aria-labelledby="guide-title"
          className="flex h-[480px] max-h-[75vh] w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-white text-ink shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border py-1.5 pr-1.5 pl-4">
            <div>
              <p id="guide-title" className="text-sm font-semibold">Outbound Guide</p>
              <p className="text-xs text-muted-foreground">Powered by Grok</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close guide"
              className="flex size-11 items-center justify-center rounded-full text-lg text-muted-foreground hover:bg-sand"
            >
              ×
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
                  <img src={m.image} alt="Your photo" className="mb-1 ml-auto max-h-40 rounded-2xl" />
                )}
                {m.content && (
                  <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${m.role === "user" ? "bg-maroon text-white" : "bg-sand"}`}>
                    {m.content}
                  </div>
                )}
                {m.quests && m.quests.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {m.quests.map((q) => (
                      <Link key={q.id} href={`/q/${q.id}`} className="block rounded-xl border border-border px-3 py-2 hover:border-maroon">
                        <p className="font-medium">{q.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {q.station_name ?? q.station_id} · {PRICE[q.price_tier] ?? ""} · +{q.xp} XP
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <p className="text-xs text-muted-foreground">{photo === null && msgs.at(-1)?.image ? "Looking at your photo…" : "Guide is thinking…"}</p>}
            {msgs.length === 1 && (
              <div className="flex flex-wrap gap-1.5">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-border px-3 py-1 text-xs hover:border-maroon">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {photo && (
            <div className="flex items-center gap-2 border-t border-border px-3 pt-2 text-xs text-muted-foreground">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
              <img src={photo} alt="Photo to send" className="h-10 w-10 rounded-lg object-cover" />
              Photo ready. Add a note or just tap Ask.
              <button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo" className="ml-auto flex size-11 items-center justify-center text-base">
                ×
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 border-t border-border p-3"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickPhoto(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label="Snap or upload a photo"
              title="Snap or upload a photo"
              className="flex items-center rounded-full border border-border px-3 disabled:opacity-40"
            >
              <Camera className="size-4" aria-hidden />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              placeholder={photo ? "What do you want to know?" : "Cheap dumplings, 1 hour…"}
              className="min-w-0 flex-1 rounded-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-maroon"
            />
            <button type="submit" disabled={busy || (!input.trim() && !photo)} className="rounded-full bg-maroon px-4 text-sm font-medium text-white disabled:opacity-40">
              Ask
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-14 items-center gap-2 rounded-full border-2 border-gold bg-maroon pr-5 pl-4 text-base font-bold text-white shadow-float outline-none hover:bg-maroon-600 focus-visible:ring-2 focus-visible:ring-gold"
      >
        {open ? (
          "Close guide"
        ) : (
          <>
            <Sparkles className="size-5 text-gold" aria-hidden />
            Ask Guide
          </>
        )}
      </button>
    </div>
  );
}
