"use client";

// Pipeline (/pipeline): a demo-ready walk through how Outbound works. Four flows (live trains,
// photo to trip, check in to rewards, host an event) light up step by step with "Play", plus the
// tracks we entered, every agent and tool, the safety nets, and what we built it with.

import { ArrowDown, ArrowRight, Bot, Database, Link2, MonitorSmartphone, Pause, Play, Server, ShieldCheck, Wrench, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PageHeader } from "@/features/shell/page-header";
import { cn } from "@/lib/utils";
import { AGENTS, FLOWS, HONESTY, RELIABILITY, STACK, TEAM, TRACKS, type Node } from "./pipeline-data";

const KIND: Record<Node["kind"], { icon: ReactNode; label: string; tone: string }> = {
  input: { icon: <MonitorSmartphone className="size-4" />, label: "Input", tone: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
  agent: { icon: <Bot className="size-4" />, label: "Agent", tone: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" },
  tool: { icon: <Wrench className="size-4" />, label: "Tool", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  data: { icon: <Database className="size-4" />, label: "Data", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  server: { icon: <Server className="size-4" />, label: "Server", tone: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100" },
  ui: { icon: <MonitorSmartphone className="size-4" />, label: "On screen", tone: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" },
  chain: { icon: <Link2 className="size-4" />, label: "Blockchain", tone: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200" },
};
const STEP_MS = 1800;

export function PipelinePage() {
  const [flowIdx, setFlowIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tour, setTour] = useState(false); // play every flow in a row
  const [live, setLive] = useState<{ trains: number | null; delays: string[] }>({ trains: null, delays: [] });
  const flow = FLOWS[flowIdx];
  const node = flow.nodes[step];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live numbers for the train flow, so the demo shows the real feed working right now.
  useEffect(() => {
    let alive = true;
    const get = (u: string) => fetch(u, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    get("/api/trains")
      .then((j) => alive && setLive((l) => ({ ...l, trains: Array.isArray(j?.trains) ? j.trains.length : -1 })))
      .catch(() => alive && setLive((l) => ({ ...l, trains: -1 })));
    get("/api/lateness")
      .then((j) => alive && Array.isArray(j?.lines) && setLive((l) => ({ ...l, delays: j.lines.map((x: { badge: string }) => x.badge).filter(Boolean) })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    timer.current = setTimeout(() => {
      if (step < flow.nodes.length - 1) setStep(step + 1);
      else if (tour && flowIdx < FLOWS.length - 1) {
        setFlowIdx(flowIdx + 1);
        setStep(0);
      } else {
        setPlaying(false);
        setTour(false);
      }
    }, STEP_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playing, step, flowIdx, tour, flow.nodes.length]);

  const pick = (i: number) => {
    setFlowIdx(i);
    setStep(0);
    setPlaying(false);
    setTour(false);
  };
  const play = () => {
    if (playing) return setPlaying(false);
    if (step >= flow.nodes.length - 1) setStep(0);
    setPlaying(true);
  };
  const playAll = () => {
    setFlowIdx(0);
    setStep(0);
    setTour(true);
    setPlaying(true);
  };
  const liveNote = useMemo(() => {
    if (flow.id !== "trains") return null;
    const t =
      live.trains === null
        ? "checking the feed…"
        : live.trains < 0
          ? "MBTA feed not reachable here, the map replays saved trains"
          : `${live.trains} train${live.trains === 1 ? "" : "s"} on the map right now`;
    return `${t}${live.delays.length ? ` · ${live.delays.slice(0, 3).join(" · ")}` : ""}`;
  }, [flow.id, live]);

  return (
    <>
      <PageHeader title="Pipeline" />
      <div className="mx-auto w-full max-w-[720px] px-4 pt-3 pb-12 desk:max-w-[1360px] desk:px-8 desk:pt-6">
        {/* intro */}
        <div className="mb-6 flex flex-col gap-4 rounded-3xl bg-maroon p-5 text-white desk:flex-row desk:items-center desk:p-7">
          <div className="min-w-0 flex-1">
            <p className="type-eyebrow text-gold">How Outbound works</p>
            <h2 className="mt-1 font-display text-[28px] leading-tight font-semibold italic desk:text-[40px]">From a live train to your next quest</h2>
            <p className="mt-2 max-w-[760px] text-[15px] text-on-maroon-muted desk:text-base">
              Four pipelines run Outbound: live trains from the MBTA, a chain of AI agents that turns a photo into a trip, verified
              check-ins that pay out XP and tokens, and student events on the map. Press play to watch each step.
            </p>
          </div>
          <button
            type="button"
            onClick={playAll}
            className="inline-flex h-12 shrink-0 items-center gap-2 self-start rounded-full bg-gold px-5 text-base font-bold text-[#3b2600] hover:brightness-105 desk:self-center"
          >
            <Zap className="size-5" aria-hidden />
            Play the whole demo
          </button>
        </div>

        {/* flow tabs */}
        <div role="tablist" aria-label="Pipelines" className="mb-4 flex flex-wrap gap-2">
          {FLOWS.map((f, i) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={i === flowIdx}
              onClick={() => pick(i)}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-semibold",
                i === flowIdx ? "border-maroon bg-maroon text-white" : "border-border-strong bg-surface text-ink hover:bg-sand",
              )}
            >
              <span className={cn("grid size-6 place-items-center rounded-full text-xs font-bold", i === flowIdx ? "bg-white/20" : "bg-sand")}>{i + 1}</span>
              {f.title}
            </button>
          ))}
        </div>

        {/* the active flow */}
        <section className="rounded-3xl border border-border bg-surface p-4 desk:p-6" aria-live="polite">
          <div className="mb-4 flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-2xl font-semibold text-ink">{flow.title}</h3>
              <p className="mt-1 text-base text-muted-foreground">{flow.blurb}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {flow.tracks.map((t) => (
                  <span key={t} className="rounded-full bg-sand px-2.5 py-0.5 text-[13px] font-semibold text-ink-2">
                    {t}
                  </span>
                ))}
                {liveNote && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[13px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    <span className="size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
                    Live: {liveNote}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={play}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-maroon px-5 text-[15px] font-semibold text-white hover:bg-maroon-600"
            >
              {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
              {playing ? "Pause" : step > 0 && step < flow.nodes.length - 1 ? "Resume" : "Play"}
            </button>
          </div>

          {/* nodes */}
          <ol className="flex flex-col items-stretch gap-1 desk:flex-row desk:items-stretch desk:gap-0">
            {flow.nodes.map((n, i) => {
              const k = KIND[n.kind];
              const state = i < step ? "done" : i === step ? "active" : "todo";
              return (
                <li key={n.id} className="flex flex-col items-center desk:min-w-0 desk:flex-1 desk:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(i);
                      setPlaying(false);
                    }}
                    aria-current={state === "active" ? "step" : undefined}
                    className={cn(
                      "relative flex w-full flex-col gap-1.5 rounded-2xl border-2 p-3 text-left transition-all duration-300 desk:h-full",
                      state === "active" && "scale-[1.02] border-maroon bg-maroon/5 shadow-lg",
                      state === "done" && "border-emerald-500/50 bg-emerald-50/60 dark:bg-emerald-950/30",
                      state === "todo" && "border-border bg-background opacity-70 hover:opacity-100",
                    )}
                  >
                    <span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase", k.tone)}>
                      {k.icon}
                      {k.label}
                    </span>
                    <span className="text-[16px] leading-snug font-semibold text-ink">{n.title}</span>
                    <span className="text-[13px] leading-snug text-muted-foreground">{n.tech}</span>
                    {state === "active" && playing && (
                      <span className="absolute inset-x-3 bottom-1.5 h-1 overflow-hidden rounded-full bg-maroon/15" aria-hidden>
                        <span className="block h-full origin-left animate-[ob-progress_1.8s_linear] rounded-full bg-maroon" />
                      </span>
                    )}
                  </button>
                  {i < flow.nodes.length - 1 && (
                    <span className={cn("grid place-items-center p-1 transition-colors desk:px-1.5", i < step ? "text-emerald-600" : "text-muted-foreground/60")} aria-hidden>
                      <ArrowDown className="size-5 desk:hidden" />
                      <ArrowRight className="hidden size-5 desk:block" />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {flow.branchNote && <p className="mt-3 text-sm text-muted-foreground">{flow.branchNote}</p>}

          {/* what happens at this step */}
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-sand/70 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-maroon text-lg font-bold text-white">{step + 1}</span>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-ink">{node.title}</p>
              <p className="text-[15px] text-ink-2">{node.what}</p>
            </div>
          </div>
        </section>

        {/* tracks */}
        <Section title="Tracks we entered">
          <ul className="grid grid-cols-1 gap-3 desk:grid-cols-2 min-[1280px]:grid-cols-3">
            {TRACKS.map((t) => (
              <li key={t.name} className="rounded-2xl border border-border bg-surface p-4">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold uppercase", t.kind === "MLH" ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" : "bg-maroon text-white")}>
                  {t.kind}
                </span>
                <p className="mt-2 text-[17px] font-semibold text-ink">{t.name}</p>
                <p className="mt-1 text-[15px] text-muted-foreground">{t.how}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* agents and tools */}
        <Section title="Agents and their tools">
          <ul className="grid grid-cols-1 gap-3 desk:grid-cols-2 min-[1280px]:grid-cols-3">
            {AGENTS.map((a) => (
              <li key={a.name} className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" aria-hidden>
                  <Bot className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[17px] font-semibold text-ink">{a.name}</p>
                  <p className="text-[13px] font-semibold text-violet-700 dark:text-violet-300">{a.model}</p>
                  <p className="mt-1 text-[15px] text-muted-foreground">{a.job}</p>
                  {a.tools && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {a.tools.map((t) => (
                        <code key={t} className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[12.5px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                          {t}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <div className="grid grid-cols-1 gap-6 desk:grid-cols-2">
          <Section title="Built so the demo can’t break">
            <ul className="flex flex-col gap-2">
              {RELIABILITY.map((r) => (
                <li key={r} className="flex gap-2.5 rounded-xl border border-border bg-surface p-3 text-[15px] text-ink">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Team">
            <ul className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-2">
              {TEAM.map((m) => (
                <li key={m.name} className="rounded-xl border border-border bg-surface p-3">
                  <p className="text-[16px] font-semibold text-ink">{m.name}</p>
                  <p className="text-[14px] text-muted-foreground">{m.role}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <Section title="What we built it with">
          <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 desk:grid-cols-5">
            {STACK.map((g) => (
              <div key={g.group} className="rounded-2xl border border-border bg-surface p-4">
                <p className="type-eyebrow text-muted-foreground">{g.group}</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {g.items.map((it) => (
                    <li key={it} className="text-[15px] text-ink">
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <p className="mt-6 rounded-xl bg-sand/70 p-3 text-sm text-muted-foreground">
          Honesty notes: {HONESTY.join(" ")}
        </p>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-semibold text-ink desk:text-2xl">{title}</h2>
      {children}
    </section>
  );
}
