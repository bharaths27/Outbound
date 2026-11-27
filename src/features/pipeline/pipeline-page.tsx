"use client";

// Pipeline (/pipeline): Outbound as one big flow chart for the demo. Six stages; click one (or press
// Play) and it opens below the chart with what to say, its steps, the tech and the tracks it covers.

import { ArrowDown, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, Pause, Play, ShieldCheck } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { PageHeader } from "@/features/shell/page-header";
import { cn } from "@/lib/utils";
import { BUILT_WITH, HONESTY, MAIN_ROW, STAGES, TRACKS, type Stage, type StageId } from "./pipeline-data";

const ORDER: StageId[] = [...MAIN_ROW, "host"];
const byId = (id: StageId) => STAGES.find((s) => s.id === id)!;
const STEP_MS = 6000;
const hasTrack = (s: Stage, name: string) => s.tracks.some((t) => t.startsWith(name));

export function PipelinePage() {
  const [sel, setSel] = useState<StageId>("trains");
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState<number | null>(null); // trains on the map now, -1 = feed unreachable
  const stage = byId(sel);
  const idx = ORDER.indexOf(sel);

  useEffect(() => {
    let alive = true;
    fetch("/api/trains", { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => alive && setLive(Array.isArray(j?.trains) ? j.trains.length : -1))
      .catch(() => alive && setLive(-1));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (idx < ORDER.length - 1) setSel(ORDER[idx + 1]);
      else setPlaying(false);
    }, STEP_MS);
    return () => clearTimeout(t);
  }, [playing, idx]);

  const pick = (id: StageId) => {
    setSel(id);
    setPlaying(false);
  };
  const play = () => {
    if (playing) return setPlaying(false);
    if (idx === ORDER.length - 1) setSel(ORDER[0]);
    setPlaying(true);
  };
  const go = (d: number) => pick(ORDER[(idx + d + ORDER.length) % ORDER.length]);

  const node = (id: StageId) => <StageNode key={id} stage={byId(id)} selected={sel === id} playing={playing && sel === id} onClick={() => pick(id)} />;
  const arrow = (i: number, Icon = ArrowRight) => (
    <span key={`a${i}`} className="grid place-items-center text-muted-foreground/70" aria-hidden>
      <Icon className="size-7" strokeWidth={2.5} />
    </span>
  );

  return (
    <>
      <PageHeader title="How it works" />
      <div className="mx-auto w-full max-w-[720px] px-4 pt-3 pb-28 desk:max-w-[1400px] desk:px-8 desk:pt-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[26px] leading-tight font-semibold text-ink italic desk:text-[34px]">From a live train to a reward</h2>
            <p className="mt-0.5 text-[15px] text-muted-foreground desk:text-base">Click any box to open it, or press Play to walk through every part.</p>
          </div>
          <button
            type="button"
            onClick={play}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-maroon px-6 text-sm font-bold text-white hover:bg-maroon-600"
          >
            {playing ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
            {playing ? "Pause" : "Play"}
          </button>
        </div>

        {/* the chart: desktop = one row with Host feeding the map from below; phone = a column */}
        <div className="hidden desk:grid desk:grid-cols-[1fr_40px_1fr_40px_1fr_40px_1fr_40px_1fr]">
          {MAIN_ROW.flatMap((id, i) => (i ? [arrow(i), node(id)] : [node(id)]))}
          <span className="col-start-3 grid place-items-center text-muted-foreground/70" aria-hidden>
            <ArrowUp className="size-6" strokeWidth={2.5} />
          </span>
          <div className="col-start-3">{node("host")}</div>
        </div>
        <div className="flex flex-col gap-1 desk:hidden">
          {ORDER.flatMap((id, i) => (i ? [arrow(i, ArrowDown), node(id)] : [node(id)]))}
        </div>

        {/* the open stage */}
        <section
          key={sel}
          aria-live="polite"
          className="mt-4 animate-in rounded-3xl border-2 bg-surface p-5 duration-300 fade-in slide-in-from-top-2 desk:px-7 desk:py-5"
          style={{ borderColor: stage.color }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl text-2xl" style={{ background: `${stage.color}22` }} aria-hidden>
              {stage.emoji}
            </span>
            <h3 className="min-w-0 flex-1 text-2xl font-semibold text-ink desk:text-[28px]">{stage.title}</h3>
            <div className="flex items-center gap-1">
              <NavBtn label="Previous" onClick={() => go(-1)}>
                <ChevronLeft className="size-5" />
              </NavBtn>
              <span className="w-10 text-center text-sm font-semibold text-muted-foreground tabular-nums">
                {idx + 1}/{ORDER.length}
              </span>
              <NavBtn label="Next" onClick={() => go(1)}>
                <ChevronRight className="size-5" />
              </NavBtn>
            </div>
          </div>

          <p className="mt-3 text-lg leading-relaxed text-ink desk:text-[20px]">{stage.say}</p>

          {sel === "trains" && live !== null && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              <span className="size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
              {live < 0 ? "Live feed not reachable here, the map replays saved trains" : `Live now: ${live} train${live === 1 ? "" : "s"} on the map`}
            </p>
          )}

          <ol className="mt-4 flex flex-col gap-1 desk:flex-row desk:items-stretch desk:gap-0">
            {stage.steps.map((s, i) => (
              <li key={s.title} className="flex flex-col items-center desk:min-w-0 desk:flex-1 desk:flex-row">
                <div className="w-full rounded-2xl border border-border bg-background p-3 desk:h-full">
                  <p className="text-[16px] font-semibold text-ink">
                    <span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}.</span>
                    {s.title}
                  </p>
                  <p className="mt-0.5 text-[14px] leading-snug text-muted-foreground">{s.tech}</p>
                </div>
                {i < stage.steps.length - 1 && (
                  <span className="grid place-items-center p-1 text-muted-foreground/60 desk:px-1.5" aria-hidden>
                    <ArrowDown className="size-5 desk:hidden" />
                    <ArrowRight className="hidden size-5 desk:block" />
                  </span>
                )}
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {stage.tracks.map((t) => (
              <span key={t} className="rounded-full px-3 py-1 text-[13px] font-bold text-white" style={{ background: stage.color }}>
                {t}
              </span>
            ))}
            {stage.notes?.map((n) => (
              <span key={n} className="inline-flex items-center gap-1.5 text-[14px] text-muted-foreground">
                <ShieldCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
                {n}
              </span>
            ))}
          </div>
        </section>

        {/* every track, lit up where the open stage covers it */}
        <div className="mt-6">
          <p className="type-eyebrow mb-2 text-muted-foreground">Tracks we entered</p>
          <ul className="flex flex-wrap gap-2">
            {TRACKS.map((t) => {
              const on = hasTrack(stage, t.name);
              const home = STAGES.find((s) => hasTrack(s, t.name));
              return (
                <li key={t.name}>
                  <button
                    type="button"
                    onClick={() => home && pick(home.id)}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[14px] font-semibold transition-colors",
                      on ? "border-transparent text-white" : "border-border bg-surface text-ink-2 hover:bg-sand",
                    )}
                    style={on ? { background: stage.color } : undefined}
                  >
                    <span className={cn("text-[10px] font-bold tracking-wide uppercase", on ? "text-white/80" : "text-muted-foreground")}>{t.kind === "MLH" ? "MLH" : "BH"}</span>
                    {t.name}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[14px] text-muted-foreground">{BUILT_WITH}</p>
          <p className="mt-1 text-[14px] text-muted-foreground">{HONESTY}</p>
        </div>
      </div>
    </>
  );
}

function StageNode({ stage, selected, playing, onClick }: { stage: Stage; selected: boolean; playing: boolean; onClick: () => void }) {
  const style = { "--c": stage.color, borderColor: selected ? stage.color : undefined, background: selected ? `${stage.color}14` : undefined } as CSSProperties;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={style}
      className={cn(
        "relative flex w-full items-center gap-3 overflow-hidden rounded-3xl border-2 bg-surface p-4 text-left transition-all duration-200 desk:h-full desk:min-h-[112px]",
        selected ? "shadow-lg desk:-translate-y-1" : "border-border hover:border-[var(--c)]",
      )}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-2xl desk:size-[52px] desk:text-[28px]" style={{ background: `${stage.color}22` }} aria-hidden>
        {stage.emoji}
      </span>
      <span className="min-w-0">
        <span className="block text-[18px] leading-tight font-semibold text-ink desk:text-[20px]">{stage.title}</span>
        <span className="mt-1 block text-[14px] leading-snug text-muted-foreground">{stage.short}</span>
      </span>
      {playing && (
        <span className="absolute inset-x-4 bottom-2 h-1 overflow-hidden rounded-full bg-black/10" aria-hidden>
          <span className="block h-full origin-left animate-[ob-progress_6s_linear] rounded-full" style={{ background: stage.color }} />
        </span>
      )}
    </button>
  );
}

function NavBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="grid size-10 place-items-center rounded-full border border-border text-ink hover:bg-sand">
      {children}
    </button>
  );
}
