// Phase 21E.2 (D) — where each canonical structural issue belongs on screen. The SAME issues the finalization decision holds
// (evaluateExamFinalization → structuralErrors / structuralWarnings) are only regrouped: by question, by section, and the
// exam-level remainder. Nothing is re-validated, filtered out or re-ranked, so the inline lists and the global summary can
// never disagree with what blocks finalization.
import type { StructuredIssue } from "../examQuality";

export type IssueIndex = {
  byQuestion: ReadonlyMap<string, StructuredIssue[]>;
  /** Section-level issues (a sectionId and no questionId). */
  bySection: ReadonlyMap<string, StructuredIssue[]>;
  /** Issues with neither (exam cover / presentation / no sections) or whose target is no longer in the exam. */
  exam: StructuredIssue[];
  errors: number;
  warnings: number;
};

export function indexIssues(issues: readonly StructuredIssue[], live?: { questionIds: ReadonlySet<string>; sectionIds: ReadonlySet<string> }): IssueIndex {
  const byQuestion = new Map<string, StructuredIssue[]>(), bySection = new Map<string, StructuredIssue[]>(), exam: StructuredIssue[] = [];
  const push = (map: Map<string, StructuredIssue[]>, key: string, i: StructuredIssue) => { const list = map.get(key); if (list) list.push(i); else map.set(key, [i]); };
  for (const i of issues) {
    if (i.questionId && (!live || live.questionIds.has(i.questionId))) push(byQuestion, i.questionId, i);
    else if (i.sectionId && !i.questionId && (!live || live.sectionIds.has(i.sectionId))) push(bySection, i.sectionId, i);
    else exam.push(i);
  }
  return { byQuestion, bySection, exam, errors: issues.filter(i => i.severity === "error").length, warnings: issues.filter(i => i.severity === "warning").length };
}

/** The one polite summary sentence announced when the counts change (never per keystroke: see useIssueAnnouncer). */
export function issueSummaryText(errors: number, warnings: number): string {
  if (!errors && !warnings) return "لا توجد مشكلات في الامتحان.";
  const parts = [errors ? errors + (errors === 1 ? " خطأ" : " أخطاء") : "", warnings ? warnings + (warnings === 1 ? " تنبيه" : " تنبيهات") : ""].filter(Boolean);
  return "مشكلات الامتحان: " + parts.join(" و") + (errors ? " — يجب إصلاح الأخطاء قبل الاعتماد النهائي." : ".");
}
