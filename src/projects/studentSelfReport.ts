// Phase P2 — the student's ONE project write: mark completed stages (mark: true) or undo the student's own unconfirmed
// marks (mark: false). The body carries only the project and the stage ids; the server takes the student and the class
// from the session. Kept out of StudentProjectPanel so the panel stays presentation-only over its single read.
export type SelfReportResult = { stageId: string; ok: boolean; changed: boolean; error?: string };
export type SelfReportResponse = { ok: true; changed: number; results: SelfReportResult[] };

export async function postSelfReport(token: string, projectCode: string, stageIds: string[], mark: boolean): Promise<SelfReportResponse> {
  const r = await fetch("/api/student-project-tracker", { method: "POST", headers: { "Content-Type": "application/json", "x-student-token": token, Authorization: "Bearer " + token }, body: JSON.stringify({ projectCode, stageIds, mark }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j || j.ok !== true) throw new Error((j && j.error) || "تعذر حفظ التغيير.");
  return j as SelfReportResponse;
}
