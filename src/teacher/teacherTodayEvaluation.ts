// Phase 9C — the Teacher Today Hub's `projectEvaluation` block (students with ungraded project stages): types and the
// defensive parser, kept out of the component file so the hub exports only components (fast refresh). The server is
// the authority (api/src/lib/project-tracker/evaluation-attention.js over buildProjectEvaluation); nothing is recomputed.
export type ProjectEvaluationAttentionRow = { studentId: string; displayName: string; classId: string; className: string; projectCode: string; projectTitle: string; gradedStages: number; totalStages: number; ungradedStages: number; evaluationProgress: number };
export type ProjectEvaluationAttention = {
  studentsWithUngradedStages: number; totalUngradedStages: number;
  projects: { projectCode: string; title: string; studentsWithUngradedStages: number; totalUngradedStages: number }[];
  /** Total rows before the server's display cap; `attention` holds at most the cap. */
  attentionTotal: number; capped: boolean;
  attention: ProjectEvaluationAttentionRow[];
  /** Phase 21H.1 — additive: the stages students SUBMITTED for review (the sidebar badge's rule). Absent on older payloads
   *  (the card keeps its 9C reading); when present the card shows this teacher work instead of every ungraded stage. */
  review?: ProjectReviewAttention;
};
export type ProjectReviewRow = ProjectEvaluationAttentionRow & { readyStages: number };
export type ProjectReviewAttention = { studentsAwaitingReview: number; totalReadyStages: number; attentionTotal: number; capped: boolean; attention: ProjectReviewRow[] };
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
/** Phase 9C — the additive block: undefined when the payload has none (older API → no card), null when malformed / failed. */
export function parseProjectEvaluation(raw: unknown): ProjectEvaluationAttention | null | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isCount(r.studentsWithUngradedStages) || !isCount(r.totalUngradedStages) || !Array.isArray(r.attention)) return null;
  const attention = parseRows(r.attention as unknown[]);
  const projects = Array.isArray(r.projects) ? (r.projects as unknown[]).filter((p): p is ProjectEvaluationAttention["projects"][number] => !!p && typeof p === "object" && typeof (p as { projectCode?: unknown }).projectCode === "string") : [];
  const review = parseReview(r.review);
  return { studentsWithUngradedStages: r.studentsWithUngradedStages, totalUngradedStages: r.totalUngradedStages, projects, attentionTotal: isCount(r.attentionTotal) ? r.attentionTotal : attention.length, capped: r.capped === true, attention, ...(review ? { review } : {}) };
}

function parseRow(row: unknown): ProjectEvaluationAttentionRow | null {
  if (!row || typeof row !== "object") return null;
  const x = row as Record<string, unknown>;
  if (typeof x.studentId !== "string" || typeof x.projectCode !== "string" || !isCount(x.gradedStages) || !isCount(x.totalStages)) return null;
  return { studentId: x.studentId, displayName: String(x.displayName || x.studentId), classId: String(x.classId || ""), className: String(x.className || ""), projectCode: x.projectCode, projectTitle: String(x.projectTitle || x.projectCode),
    gradedStages: x.gradedStages, totalStages: x.totalStages, ungradedStages: isCount(x.ungradedStages) ? x.ungradedStages : Math.max(0, x.totalStages - x.gradedStages), evaluationProgress: isCount(x.evaluationProgress) ? x.evaluationProgress : 0 };
}
const parseRows = (raw: unknown[]) => raw.map(parseRow).filter((r): r is ProjectEvaluationAttentionRow => r !== null);

/** Phase 21H.1 — the `review` block; a malformed one is dropped (the card falls back to its 9C reading, never a fake zero).
 *  A row without a positive readyStages count is not review work and is skipped. */
function parseReview(raw: unknown): ProjectReviewAttention | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (!isCount(r.studentsAwaitingReview) || !isCount(r.totalReadyStages) || !Array.isArray(r.attention)) return undefined;
  const attention: ProjectReviewRow[] = [];
  for (const row of r.attention as unknown[]) {
    const base = parseRow(row), ready = (row as { readyStages?: unknown } | null)?.readyStages;
    if (base && isCount(ready) && ready > 0) attention.push({ ...base, readyStages: ready });
  }
  return { studentsAwaitingReview: r.studentsAwaitingReview, totalReadyStages: r.totalReadyStages, attentionTotal: isCount(r.attentionTotal) ? r.attentionTotal : attention.length, capped: r.capped === true, attention };
}
