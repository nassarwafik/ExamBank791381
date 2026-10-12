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

/** The label a question goes by in the builder: its display number, else its 1-based position in its section. */
export const questionLabelOf = (displayNumber: string | null | undefined, index: number): string => (displayNumber?.trim() ? displayNumber.trim() : String(index + 1));

/** A DOM-id-safe fragment (the builder's existing sanitiser: ASCII letters, digits, "_" and "-"). */
export const domIdPart = (raw: string): string => raw.replace(/[^a-zA-Z0-9_-]/g, "");

/** Where a summary entry leads: the question card or the section it was indexed under, named the way the builder names it. */
export type IssueTarget = { kind: "question" | "section"; id: string; label: string };

type SectionShape = { id: string; questions?: readonly { examQuestionId: string; displayNumber?: string }[] };

/**
 * The summary entry → target map, read from the index's OWN buckets (never a second routing): an issue in `byQuestion` leads to
 * that question, one in `bySection` to that section, and an exam-level issue leads nowhere (it stays a plain summary item).
 * A question is labelled «السؤال N في القسم S» (N = its display number, else its position; S = its section's position), a
 * section «القسم S». With a duplicated question id the label names the last card carrying it — the card the builder's node map
 * holds (the duplicate itself is a blocking error).
 */
export function issueTargets(index: IssueIndex, sections: readonly SectionShape[]): Map<StructuredIssue, IssueTarget> {
  const questionLabels = new Map<string, string>(), sectionLabels = new Map<string, string>();
  sections.forEach((s, si) => {
    sectionLabels.set(s.id, "القسم " + (si + 1));
    (s.questions || []).forEach((q, qi) => questionLabels.set(q.examQuestionId, "السؤال " + questionLabelOf(q.displayNumber, qi) + " في القسم " + (si + 1)));
  });
  const out = new Map<StructuredIssue, IssueTarget>();
  for (const [id, list] of index.byQuestion) { const label = questionLabels.get(id); if (label) for (const i of list) out.set(i, { kind: "question", id, label }); }
  for (const [id, list] of index.bySection) { const label = sectionLabels.get(id); if (label) for (const i of list) out.set(i, { kind: "section", id, label }); }
  return out;
}

/** The one polite summary sentence announced when the counts change (never per keystroke: see useIssueAnnouncer). */
export function issueSummaryText(errors: number, warnings: number): string {
  if (!errors && !warnings) return "لا توجد مشكلات في الامتحان.";
  const parts = [errors ? errors + (errors === 1 ? " خطأ" : " أخطاء") : "", warnings ? warnings + (warnings === 1 ? " تنبيه" : " تنبيهات") : ""].filter(Boolean);
  return "مشكلات الامتحان: " + parts.join(" و") + (errors ? " — يجب إصلاح الأخطاء قبل الاعتماد النهائي." : ".");
}
