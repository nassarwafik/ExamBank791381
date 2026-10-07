// Phase 20F — the Composer STATE MACHINE (one explicit state instead of scattered booleans). Pure reducer; an event that is not legal in
// the current state is ignored (the state object is returned unchanged), so a late provider response after Cancel / Discard can never
// resurrect a result, and nothing reaches the Builder except through `applying → applied`.
export const COMPOSER_STATES = Object.freeze(["idle", "planning", "generating", "validating", "repairing", "ready", "applying", "applied", "failed", "cancelled", "stale"] as const);
export type ComposerStateName = (typeof COMPOSER_STATES)[number];
export type ComposerFailureKind = "provider" | "invalidResponse" | "unsupported" | "validation" | "stale" | "cancelled" | "rateLimited" | "timeout" | "request";
export type ComposerFailure = { kind: ComposerFailureKind; message: string; issues: { code: string; message: string }[] };
export type ComposerMachine<R = unknown> = { name: ComposerStateName; run: number; stage: string; detail: string; result: R | null; failure: ComposerFailure | null };
export type ComposerEvent<R = unknown> =
  | { type: "START"; run: number }
  | { type: "STAGE"; run: number; name: "planning" | "generating" | "validating" | "repairing"; stage: string; detail?: string }
  | { type: "READY"; run: number; result: R }
  | { type: "FAIL"; run: number; failure: ComposerFailure }
  | { type: "CANCEL" }
  | { type: "STALE" }
  | { type: "APPLY" }
  | { type: "APPLIED" }
  | { type: "APPLY_FAILED"; failure: ComposerFailure }
  | { type: "RESET" };
export const initialComposer = <R>(): ComposerMachine<R> => ({ name: "idle", run: 0, stage: "", detail: "", result: null, failure: null });
const BUSY: readonly ComposerStateName[] = ["planning", "generating", "validating", "repairing"];
export const isComposerBusy = (s: ComposerMachine): boolean => BUSY.includes(s.name) || s.name === "applying";

export function composerReducer<R>(s: ComposerMachine<R>, e: ComposerEvent<R>): ComposerMachine<R> {
  switch (e.type) {
    case "START": return isComposerBusy(s) ? s : { name: "planning", run: e.run, stage: "", detail: "", result: null, failure: null };
    case "STAGE": return BUSY.includes(s.name) && e.run === s.run ? { ...s, name: e.name, stage: e.stage, detail: e.detail ?? "" } : s;
    case "READY": return BUSY.includes(s.name) && e.run === s.run ? { ...s, name: "ready", result: e.result, failure: null } : s;
    case "FAIL": return BUSY.includes(s.name) && e.run === s.run ? { ...s, name: "failed", failure: e.failure, result: null } : s;
    case "CANCEL": return BUSY.includes(s.name) ? { ...s, name: "cancelled", result: null, failure: { kind: "cancelled", message: "أُلغي الطلب؛ لم يتغيّر الامتحان.", issues: [] } } : s;
    case "STALE": return s.name === "ready" || s.name === "applying" ? { ...s, name: "stale", failure: { kind: "stale", message: "تم تعديل الامتحان أثناء عمل الذكاء الاصطناعي.", issues: [] } } : s;
    case "APPLY": return s.name === "ready" ? { ...s, name: "applying" } : s;
    case "APPLIED": return s.name === "applying" ? { ...s, name: "applied" } : s;
    case "APPLY_FAILED": return s.name === "applying" ? { ...s, name: "failed", failure: e.failure } : s;
    case "RESET": return isComposerBusy(s) ? s : { ...initialComposer<R>(), run: s.run };
  }
}
