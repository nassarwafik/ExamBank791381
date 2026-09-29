// Phase 13C-C — the App save path's SECOND-LINE guard, as a pure owner helper. A "final" save evaluates the EXACT snapshot
// about to be persisted with the canonical finalization authority; when it refuses, no request is sent and nothing is
// committed. Draft saves are never gated (quality problems are what drafts are for). Governance boundary: this is the
// authoring finalization authority inside the application; the artifact endpoint stays a generic persistence endpoint
// until the Versioning & Publishing Governance phase makes transitions server-authoritative.
import type { StructuredExam } from "./examTypes";
import { toSavedStructuredExam } from "./examBuilderState";
import { evaluateExamFinalization, finalizationRefusalReason, FINAL_REFUSED_PREFIX, type FinalizationDecision } from "./examFinalization";

export { FINAL_REFUSED_PREFIX };
export type StructuredSaveMode = "draft" | "final";
export type StructuredSaveVerdict = { allowed: true; decision: FinalizationDecision | null } | { allowed: false; reason: string; decision: FinalizationDecision };
export function decideStructuredSave(snapshot: StructuredExam, mode: StructuredSaveMode): StructuredSaveVerdict {
  if (mode !== "final") return { allowed: true, decision: null };
  const decision = evaluateExamFinalization(snapshot);
  return decision.canFinalize ? { allowed: true, decision } : { allowed: false, reason: finalizationRefusalReason(decision), decision };
}
export type StructuredSaveResult = { ok: true; payload: StructuredExam } | { ok: false; reason: string; decision: FinalizationDecision };
export async function runStructuredSave(args: {
  snapshot: StructuredExam; mode: StructuredSaveMode;
  request: (payload: StructuredExam) => Promise<unknown>;
  commitSaved: (snapshot: StructuredExam, payload: StructuredExam) => void;
}): Promise<StructuredSaveResult> {
  const verdict = decideStructuredSave(args.snapshot, args.mode);
  if (!verdict.allowed) return { ok: false, reason: verdict.reason, decision: verdict.decision };
  const payload = { ...toSavedStructuredExam(args.snapshot), status: args.mode } as StructuredExam;
  await args.request(payload);
  args.commitSaved(args.snapshot, payload);
  return { ok: true, payload };
}
