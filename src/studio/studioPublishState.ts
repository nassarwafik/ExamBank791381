import type { ExamSaveState } from "../examHistory";

// Phase 21F.7 — the publish step's timeline, derived from facts the builder already holds: the save state (the history authority —
// "saved" means the server holds exactly what the teacher sees), the finalization decision and the exam's status. Assigning happens
// in the assignments workspace, so it is never marked done here; it becomes the current stage once the exam is final and saved.

export type PublishStageKey = "saved" | "ready" | "final" | "assigned";
export type PublishStage = { key: PublishStageKey; state: "done" | "now" | "later" };

export function publishTimeline({ saveState, canFinalize, final }: { saveState?: ExamSaveState; canFinalize: boolean; final: boolean }): PublishStage[] {
  const saved = saveState === "saved";
  const done: Record<PublishStageKey, boolean> = { saved, ready: canFinalize, final: final && saved, assigned: false };
  const order: PublishStageKey[] = ["saved", "ready", "final", "assigned"];
  const now = order.find(k => !done[k]);
  return order.map(key => ({ key, state: done[key] ? "done" : key === now ? "now" : "later" }));
}
