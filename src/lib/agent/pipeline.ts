// The Outbound Guide pipeline, as Mastra workflows.
//
// Photo:  Grok looks at it ─┬─ food     → Food Researcher (Mastra agent) → Trip Planner (Mastra agent) ─┐
//                           ├─ location → Trip Planner (Mastra agent) ──────────────────────────────────┤→ Report tool → answer
//                           └─ other    → "try another photo or type" ───────────────────────────────────┘
// Text:   Grok answers → Report tool → answer
//
// Every answer goes through the Report tool (Mastra agent with Gemini structured output), so the UI
// always gets the same FinalReport shape. Each stage reports progress through `emit` for the chat UI.
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { bostonNow, questLine, type GuideQuest, type GuideTurn } from "@/lib/guide";
import { makeFoodResearcher } from "./food";
import { askGrok, seePhoto, type PhotoInfo } from "./grok";
import { AGENT_MODEL, filterQuests, geminiModels, makePlanner } from "./planner";
import {
  GuideReportSchema, fallbackReport, finalizeReport, retryReport, type Detected, type FinalReport,
} from "./report";

export type StageId = "vision" | "food" | "trip" | "grok" | "report";
export type StageStatus = "running" | "done" | "skipped" | "error";
export interface StageEvent {
  stage: StageId;
  status: StageStatus;
  detail?: string;
}
export type Emit = (e: StageEvent) => void;

export const STAGE_LABELS: Record<StageId, string> = {
  vision: "Grok looks at your photo",
  food: "Food Researcher finds spots",
  trip: "Trip Planner plans your ride",
  grok: "Grok picks quests",
  report: "Report tool structures the answer",
};

interface Ctx {
  origin: string;
  quests: GuideQuest[];
  emit: Emit;
}

const idsIn = (text: string, quests: GuideQuest[]) => quests.filter((q) => text.includes(q.id)).map((q) => q.id);

// ---------- Report tool ----------

export function makeReportTool(quests: GuideQuest[]) {
  return createTool({
    id: "structureReport",
    description: "Turns agent notes into the structured Outbound answer the app shows.",
    inputSchema: z.object({
      kind: z.enum(["plan", "chat"]),
      notes: z.string(),
      research: z.string().optional(),
      detected: z.object({ kind: z.enum(["food", "location"]), label: z.string() }).nullable(),
    }),
    execute: async ({ kind, notes, research, detected }): Promise<FinalReport> => {
      const questIds = idsIn(`${notes}\n${research ?? ""}`, quests);
      try {
        const writer = new Agent({
          id: "outbound-report-writer",
          name: "Outbound Report Writer",
          instructions: `You turn notes from Outbound's agents into the structured answer the app shows.
Use ONLY facts in the notes. picks: Outbound quests mentioned in the notes, ids copied exactly from the QUEST LIST.
places: real spots from the food research that are not Outbound quests (keep their rating, price, open now, closest T).
transit: the station to ride to, with the next train minutes and line delay if the notes have them, else null.
steps: the trip in order, short. Keep the friendly voice of the notes. Never invent anything.`,
          model: geminiModels(),
        });
        const shortlist = quests.filter((q) => questIds.includes(q.id));
        const prompt = [
          detected ? `The student sent a photo of: ${detected.label} (${detected.kind}).` : "The student typed a question.",
          `NOTES:\n${notes}`,
          research ? `FOOD RESEARCH:\n${research}` : "",
          `QUEST LIST (id | title | type | station | price | hours | time | XP | tags | description):\n${(shortlist.length ? shortlist : quests.slice(0, 40)).map(questLine).join("\n")}`,
        ].filter(Boolean).join("\n\n");
        const result = await writer.generate(prompt, { structuredOutput: { schema: GuideReportSchema } });
        const report = finalizeReport(result.object, quests, kind, detected);
        // If the writer dropped every quest the agents chose, keep the agents' picks.
        if (!report.picks.length && questIds.length) report.picks = fallbackReport(notes, questIds, quests, detected).picks;
        return report;
      } catch (e) {
        console.warn("[guide] report tool fell back:", (e as Error).message);
        return fallbackReport(notes, questIds, quests, detected);
      }
    },
  });
}

async function runStage<T>(ctx: Ctx, stage: StageId, fn: () => Promise<{ value: T; detail?: string }>): Promise<T> {
  ctx.emit({ stage, status: "running" });
  try {
    const { value, detail } = await fn();
    ctx.emit({ stage, status: "done", detail });
    return value;
  } catch (e) {
    ctx.emit({ stage, status: "error", detail: (e as Error).message.slice(0, 120) });
    throw e;
  }
}

const PhotoOut = z.object({ photo: z.any(), note: z.string() });
const BriefOut = z.object({
  retry: z.boolean(),
  photo: z.any(),
  note: z.string(),
  brief: z.string(),
  research: z.string(),
});
const PlanOut = BriefOut.extend({ plan: z.string() });
const ReportOut = z.object({ report: z.any() });

/** If the Trip Planner is down (e.g. rate limited), pick quests by keyword so the student still gets a plan. */
export function backupPlan(p: PhotoInfo, quests: GuideQuest[]): string {
  const words = [...p.searchTerms, ...p.label.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)];
  const place = p.placeGuess ?? undefined;
  const type = p.category === "food" ? ("food" as const) : undefined;
  const found =
    (place && filterQuests(quests, { type, station: place.split(",")[0] }, 3)) ||
    [];
  const picks = found.length ? found : filterQuests(quests, { type, keywords: words }, 3);
  const list = picks.length ? picks : filterQuests(quests, { type }, 3);
  return [
    `Here are Outbound quests that match ${p.label}:`,
    ...list.map((q) => `- ${q.title} (${q.id}) at ${q.station} on the ${q.lines.join("/")} line, ${q.price}, +${q.xp} XP`),
    `QUESTS: ${list.map((q) => q.id).join(", ")}`,
  ].join("\n");
}

// ---------- Photo workflow ----------

export function makePhotoWorkflow(ctx: Ctx) {
  const see = createStep({
    id: "see-photo",
    description: "Grok vision: is it food, a place, or neither?",
    inputSchema: z.object({ image: z.string(), note: z.string() }),
    outputSchema: PhotoOut,
    execute: async ({ inputData }) => {
      const photo = await runStage(ctx, "vision", async () => {
        const p = await seePhoto(inputData.image, inputData.note);
        const what = p.category === "other" ? "not food or a place" : p.category === "food" ? "food" : "a place";
        return { value: p, detail: `${p.label} (${what})` };
      });
      return { photo, note: inputData.note };
    },
  });

  const research = createStep({
    id: "food-researcher",
    description: "Mastra Food Researcher agent finds where to get the dish near the T.",
    inputSchema: PhotoOut,
    outputSchema: BriefOut,
    execute: async ({ inputData }) => {
      const p = inputData.photo as PhotoInfo;
      const report = await runStage(ctx, "food", async () => {
        const agent = makeFoodResearcher(ctx.origin);
        const r = await agent.generate(
          `Dish from the photo: ${p.label}. ${p.details} Search words: ${p.searchTerms.join(", ")}.` +
            (p.placeGuess ? ` It may be from ${p.placeGuess}.` : "") +
            (inputData.note ? ` The student says: ${inputData.note}` : "") +
            `\nCurrent time in Boston: ${bostonNow()}.`,
          { maxSteps: 5 },
        );
        return { value: r.text, detail: "research report ready" };
      }).catch(() => "");
      return {
        retry: false, photo: p, note: inputData.note, research: report,
        brief: report
          ? `The student photographed food: ${p.label}. Here is the Food Researcher's report:\n${report}\nBuild the trip around the best open spot or a matching Outbound quest.`
          : `The student photographed food: ${p.label}. Search Outbound food quests for ${p.searchTerms.join(", ") || p.label} and plan a trip to the best open one.`,
      };
    },
  });

  const place = createStep({
    id: "place-brief",
    description: "A place photo goes straight to the Trip Planner.",
    inputSchema: PhotoOut,
    outputSchema: BriefOut,
    execute: async ({ inputData }) => {
      const p = inputData.photo as PhotoInfo;
      ctx.emit({ stage: "food", status: "skipped" });
      return {
        retry: false, photo: p, note: inputData.note, research: "",
        brief: `The student photographed a place: ${p.label}. ${p.details}` +
          (p.placeGuess ? ` It looks like ${p.placeGuess}.` : "") +
          ` Plan a trip there on the T, or to the closest matching Outbound quests (search by ${p.searchTerms.join(", ") || "station"}).`,
      };
    },
  });

  const other = createStep({
    id: "not-food-or-place",
    description: "Neither food nor a place: ask for another photo or a typed question.",
    inputSchema: PhotoOut,
    outputSchema: BriefOut,
    execute: async ({ inputData }) => {
      for (const stage of ["food", "trip"] as const) ctx.emit({ stage, status: "skipped" });
      return { retry: true, photo: inputData.photo, note: inputData.note, brief: "", research: "" };
    },
  });

  const plan = createStep({
    id: "trip-planner",
    description: "Mastra Trip Planner agent: quests, live trains, line delays.",
    inputSchema: BriefOut,
    outputSchema: PlanOut,
    execute: async ({ inputData }) => {
      if (inputData.retry) return { ...inputData, plan: "" };
      const text = await runStage(ctx, "trip", async () => {
        const r = await makePlanner(ctx.origin).generate(
          `Current time in Boston: ${bostonNow()}.\n${inputData.brief}` + (inputData.note ? `\nThe student also says: ${inputData.note}` : ""),
          { maxSteps: 6 },
        );
        return { value: r.text, detail: "trip ready" };
      }).catch(() => backupPlan(inputData.photo as PhotoInfo, ctx.quests));
      return { ...inputData, plan: text };
    },
  });

  const report = createStep({
    id: "report",
    description: "Report tool: structured answer for the app.",
    inputSchema: PlanOut,
    outputSchema: ReportOut,
    execute: async ({ inputData }) => {
      const p = inputData.photo as PhotoInfo;
      if (inputData.retry) {
        ctx.emit({ stage: "report", status: "done", detail: "asked for another photo" });
        return { report: retryReport(p?.label ?? "") };
      }
      const detected: Detected = { kind: p.category === "food" ? "food" : "location", label: p.label };
      const value = await runStage(ctx, "report", async () => ({
        value: await makeReportTool(ctx.quests).execute!(
          { kind: "plan", notes: inputData.plan, research: inputData.research, detected },
          {},
        ),
      }));
      return { report: value };
    },
  });

  return createWorkflow({
    id: "outbound-photo-guide",
    description: "Photo of food or a place → agents → structured trip on the T",
    inputSchema: z.object({ image: z.string(), note: z.string() }),
    outputSchema: ReportOut,
  })
    .then(see)
    .branch([
      [async ({ inputData }) => (inputData.photo as PhotoInfo).category === "food", research],
      [async ({ inputData }) => (inputData.photo as PhotoInfo).category === "location", place],
      [async ({ inputData }) => (inputData.photo as PhotoInfo).category === "other", other],
    ])
    .map(async ({ inputData }) => {
      const out = inputData as Record<string, z.infer<typeof BriefOut> | undefined>;
      return (out["food-researcher"] ?? out["place-brief"] ?? out["not-food-or-place"])!;
    })
    .then(plan)
    .then(report)
    .commit();
}

// ---------- Text workflow ----------

export function makeChatWorkflow(ctx: Ctx) {
  const ask = createStep({
    id: "grok-chat",
    description: "Grok answers the typed question with real quests.",
    inputSchema: z.object({ message: z.string(), history: z.array(z.any()) }),
    outputSchema: z.object({ notes: z.string() }),
    execute: async ({ inputData }) => {
      const notes = await runStage(ctx, "grok", async () => {
        const r = await askGrok(inputData.message, inputData.history as GuideTurn[], ctx.quests);
        return { value: `${r.reply}\nQuest ids: ${r.quests.map((q) => q.id).join(", ")}` };
      });
      return { notes };
    },
  });
  const report = createStep({
    id: "report",
    description: "Report tool: structured answer for the app.",
    inputSchema: z.object({ notes: z.string() }),
    outputSchema: ReportOut,
    execute: async ({ inputData }) => ({
      report: await runStage(ctx, "report", async () => ({
        value: await makeReportTool(ctx.quests).execute!({ kind: "chat", notes: inputData.notes, detected: null }, {}),
      })),
    }),
  });
  return createWorkflow({
    id: "outbound-chat-guide",
    description: "Typed question → Grok → structured answer",
    inputSchema: z.object({ message: z.string(), history: z.array(z.any()) }),
    outputSchema: ReportOut,
  })
    .then(ask)
    .then(report)
    .commit();
}

/** Runs a workflow and returns its FinalReport, or throws with the failed step's error. */
export async function runWorkflow(
  wf: ReturnType<typeof makePhotoWorkflow> | ReturnType<typeof makeChatWorkflow>,
  inputData: Record<string, unknown>,
): Promise<FinalReport> {
  const run = await wf.createRun();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await run.start({ inputData: inputData as any });
  if (result.status !== "success") {
    const err = result.error ?? Object.values(result.steps ?? {}).find((s: unknown) => (s as { status?: string })?.status === "failed");
    throw new Error(typeof err === "string" ? err : (err as { message?: string; error?: string })?.message ?? (err as { error?: string })?.error ?? `workflow ${result.status}`);
  }
  return result.result.report as FinalReport;
}

export { AGENT_MODEL };
