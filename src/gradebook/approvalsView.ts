// Class gradebook GB6b — what the approvals section says (docs/enterprise-class-gradebook-gb.md §4.8). PURE: the server decides whether a
// part or the final may be approved (`readiness`), what is approved and whether it changed since (`approvals`); this module only words it.
import type { GbApprovalEntry, GbDrift, GbGradebook, GbIssue } from "./types";

export type ApprovalStatus =
  | { kind: "approved"; approvedAt: string; drift: string | null }
  | { kind: "ready" }
  | { kind: "notReady"; reasons: string[] }
  | { kind: "unknown" };          // an older API without readiness: nothing is offered

/** The ids of the approved parts (their columns are locked in the table and the builder). */
export function approvedCategoryIds(gb: GbGradebook): Set<string> {
  return new Set(gb.approvals ? Object.keys(gb.approvals.parts) : []);
}
export const finalApproved = (gb: GbGradebook) => Boolean(gb.approvals && gb.approvals.final);

const categoryTitle = (gb: GbGradebook, id: string) => (gb.scheme && gb.scheme.categories.find(c => c.categoryId === id)?.title) || "جزء محذوف";
const columnTitle = (gb: GbGradebook, itemId: string) => {
  const col = gb.columns.find(c => c.itemId === itemId);
  return col ? col.title || (col.source.kind === "manual" ? col.source.title : "عمود") : "عمود";
};
const list = (xs: string[]) => xs.map(x => "«" + x + "»").join("، ");

/** One refusal reason in words, with what the teacher needs to fix it. */
export function issueText(gb: GbGradebook, issue: GbIssue): string {
  switch (issue.code) {
    case "PART_INCOMPLETE":
      return "خانات غير مكتملة: " + (issue.cells ?? 0) + " لدى " + (issue.students ?? 0) + " من الطلاب (بانتظار التصحيح أو لم يُسلَّم أو بلا علامة). سجّل علامة أو «معفى» أو «صفر» لكل خانة.";
    case "RESULTS_NOT_RELEASED":
      return "نتائج " + list((issue.itemIds || []).map(id => columnTitle(gb, id))) + " لم تُنشر للطلاب بعد. انشرها من صفحة الواجب أولًا.";
    case "PART_WITHHELD":
      return "يحوي أعمدة مشاريع لا تملك صلاحية رؤيتها.";
    case "PARTS_NOT_APPROVED":
      return "اعتمد الأجزاء أولًا: " + list((issue.categoryIds || []).map(id => categoryTitle(gb, id))) + ".";
    case "PART_DRIFT":
      return "تغيّرت علامات " + list((issue.categoryIds || []).map(id => categoryTitle(gb, id))) + " بعد اعتمادها: أعد فتحها واعتمدها من جديد.";
    case "FINAL_INCOMPLETE":
      return "العلامة النهائية غير مكتملة لـ " + (issue.students ?? 0) + " من الطلاب.";
    default:
      return issue.message || "غير جاهز للاعتماد.";
  }
}

/** A change since the approval, in words; null when nothing changed. */
export function driftText(drift: GbDrift | undefined): string | null {
  if (!drift) return null;
  if (drift.structure) return "تغيّر المخطط بعد الاعتماد. يرى الطلاب العلامات المعتمدة؛ أعد الفتح ثم الاعتماد لتحديثها.";
  if (drift.students === null) return "تعذّر التحقق من التغيّر: يحوي أعمدة لا تملك صلاحية رؤيتها.";
  if (drift.students > 0) return "تغيّرت علامات " + drift.students + " من الطلاب بعد الاعتماد (تصحيح جديد أو طالب جديد). يرى الطلاب العلامات المعتمدة؛ أعد الفتح ثم الاعتماد لتحديثها.";
  return null;
}

export function partStatus(gb: GbGradebook, categoryId: string): ApprovalStatus {
  const approved = gb.approvals && gb.approvals.parts[categoryId];
  if (approved) return { kind: "approved", approvedAt: approved.approvedAt, drift: driftText(approved.drift) };
  const r = gb.readiness && gb.readiness.parts[categoryId];
  if (!r) return { kind: "unknown" };
  return r.ready ? { kind: "ready" } : { kind: "notReady", reasons: r.issues.map(i => issueText(gb, i)) };
}

export function finalApprovalStatus(gb: GbGradebook): ApprovalStatus {
  const approved = gb.approvals && gb.approvals.final;
  if (approved) return { kind: "approved", approvedAt: approved.approvedAt, drift: driftText(approved.drift) };
  const r = gb.readiness && gb.readiness.final;
  if (!r) return { kind: "unknown" };
  return r.ready ? { kind: "ready" } : { kind: "notReady", reasons: r.issues.map(i => issueText(gb, i)) };
}

/** A date for the page («18 نوفمبر 2026»); the raw value when it cannot be read. */
export function approvalDate(at: string): string {
  const t = Date.parse(at);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" }) : at;
}

const ACTION_TEXT: Record<string, string> = {
  "part.approve": "اعتماد",
  "part.reopen": "إعادة فتح",
  "final.approve": "اعتماد العلامة النهائية",
  "final.reopen": "إعادة فتح العلامة النهائية"
};

/** One history line: what, which part, when, and why (for a reopen). Newest first is the caller's order. */
export function historyText(gb: GbGradebook, h: GbApprovalEntry): string {
  const what = ACTION_TEXT[h.action] || h.action;
  const part = h.categoryId ? " «" + categoryTitle(gb, h.categoryId) + "»" : "";
  return what + part + " · " + approvalDate(h.at) + (h.reason ? " · السبب: " + h.reason : "");
}

export const REASON_MIN = 3, REASON_MAX = 300;
/** Whether a typed reopen reason is acceptable (the server checks again, on cleaned text). */
export function reasonOk(text: string): boolean {
  const n = Array.from(text.trim().replace(/\s+/g, " ")).length;
  return n >= REASON_MIN && n <= REASON_MAX;
}
