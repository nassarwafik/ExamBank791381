// Phase P6 — what waits for the teacher in Projects, from App's ONE aggregated `projects-summary` read
// (`include=attention`): stages ready for review (as before) and the stages the STUDENTS marked as done (P2) that the
// teacher has not confirmed yet, in total, per project and per active class. Values are the server's, never recomputed;
// an older server without the attention fields simply reports no student marks.
export type ClassAttention = { ready: number; selfReported: number };
export type ProjectAttention = {
  total: number;
  byProject: Record<string, number>;
  selfTotal: number;
  selfByProject: Record<string, number>;
  byClass: Record<string, Record<string, ClassAttention>>;
};
export type ProjectsSummaryResponse = {
  totalReadyForReview?: number;
  byProject?: Record<string, number>;
  totalSelfReported?: number;
  selfReportedByProject?: Record<string, number>;
  byClass?: Record<string, Record<string, Partial<ClassAttention>>>;
};

export const NO_PROJECT_ATTENTION: ProjectAttention = { total: 0, byProject: {}, selfTotal: 0, selfByProject: {}, byClass: {} };

const count = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);

export function projectAttentionOf(r: ProjectsSummaryResponse | null | undefined): ProjectAttention {
  if (!r) return NO_PROJECT_ATTENTION;
  const byClass: ProjectAttention["byClass"] = {};
  for (const [code, classes] of Object.entries(r.byClass || {})) {
    byClass[code] = {};
    for (const [classId, c] of Object.entries(classes || {})) byClass[code][classId] = { ready: count(c?.ready), selfReported: count(c?.selfReported) };
  }
  return { total: count(r.totalReadyForReview), byProject: r.byProject || {}, selfTotal: count(r.totalSelfReported), selfByProject: r.selfReportedByProject || {}, byClass };
}
