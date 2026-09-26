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
};
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
/** Phase 9C — the additive block: undefined when the payload has none (older API → no card), null when malformed / failed. */
export function parseProjectEvaluation(raw: unknown): ProjectEvaluationAttention | null | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isCount(r.studentsWithUngradedStages) || !isCount(r.totalUngradedStages) || !Array.isArray(r.attention)) return null;
  const attention: ProjectEvaluationAttentionRow[] = [];
  for (const row of r.attention as unknown[]) {
    if (!row || typeof row !== "object") continue;
    const x = row as Record<string, unknown>;
    if (typeof x.studentId !== "string" || typeof x.projectCode !== "string" || !isCount(x.gradedStages) || !isCount(x.totalStages)) continue;
    attention.push({ studentId: x.studentId, displayName: String(x.displayName || x.studentId), classId: String(x.classId || ""), className: String(x.className || ""), projectCode: x.projectCode, projectTitle: String(x.projectTitle || x.projectCode),
      gradedStages: x.gradedStages, totalStages: x.totalStages, ungradedStages: isCount(x.ungradedStages) ? x.ungradedStages : Math.max(0, x.totalStages - x.gradedStages), evaluationProgress: isCount(x.evaluationProgress) ? x.evaluationProgress : 0 });
  }
  const projects = Array.isArray(r.projects) ? (r.projects as unknown[]).filter((p): p is ProjectEvaluationAttention["projects"][number] => !!p && typeof p === "object" && typeof (p as { projectCode?: unknown }).projectCode === "string") : [];
  return { studentsWithUngradedStages: r.studentsWithUngradedStages, totalUngradedStages: r.totalUngradedStages, projects, attentionTotal: isCount(r.attentionTotal) ? r.attentionTotal : attention.length, capped: r.capped === true, attention };
}

