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
  commitSaved: (snapshot: StructuredExam, payload: StructuredExam, serverEtag?: string | null) => void;
}): Promise<StructuredSaveResult> {
  const verdict = decideStructuredSave(args.snapshot, args.mode);
  if (!verdict.allowed) return { ok: false, reason: verdict.reason, decision: verdict.decision };
  const payload = { ...toSavedStructuredExam(args.snapshot), status: args.mode } as StructuredExam;
  const response = await args.request(payload);
  args.commitSaved(args.snapshot, payload, savedEtagOf(response));
  return { ok: true, payload };
}

// ── Phase 21F.0 · conditional saves ──
/** The version the server returned for a successful save (null when the response carries none). */
export function savedEtagOf(response: unknown): string | null {
  const etag = response && typeof response === "object" ? (response as { etag?: unknown }).etag : undefined;
  return typeof etag === "string" && etag ? etag : null;
}
/** The request fields of a save from the base version the client holds (see ExamHistory.serverEtag): unknown → none (the
 *  historical last-write-wins save), null → create-only, an ETag → only if the server still holds that version. */
export function saveConditionFields(serverEtag: string | null | undefined): { conditional?: true; baseEtag?: string | null } {
  if (serverEtag === undefined) return {};
  return { conditional: true, baseEtag: serverEtag };
}
/** A refused conditional save (409 EXAM_CONFLICT): what the server holds now. */
export type SaveConflict = { serverEtag: string | null; serverSavedAt: string | null; blobName: string | null };
export function saveConflictOf(error: unknown): SaveConflict | null {
  const e = error as { status?: unknown; payload?: unknown } | null;
  if (!e || e.status !== 409 || !e.payload || typeof e.payload !== "object") return null;
  const p = e.payload as { code?: unknown; serverEtag?: unknown; serverSavedAt?: unknown; blobName?: unknown };
  if (p.code !== "EXAM_CONFLICT") return null;
  const text = (v: unknown) => (typeof v === "string" && v ? v : null);
  return { serverEtag: text(p.serverEtag), serverSavedAt: text(p.serverSavedAt), blobName: text(p.blobName) };
}
