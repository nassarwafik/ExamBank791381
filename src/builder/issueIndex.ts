// Phase 21E.2 (D) — where each canonical structural issue belongs on screen. The SAME issues the finalization decision holds
// (evaluateExamFinalization → structuralErrors / structuralWarnings) are only regrouped: by question, by section, and the
// exam-level remainder. Nothing is re-validated, filtered out or re-ranked, so the inline lists and the global summary can
// never disagree with what blocks finalization.
import type { StructuredIssue } from "../examQuality";
import { compositeStructure } from "../compositeQuestion";

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

/**
 * RF2-1 — which occurrence of its code an issue is among its question's issues (1-based, in the canonical order the index keeps).
 * The canonical issue names no row: a rule that fires per row emits one issue per row, in row order, so the n-th
 * MATCH_INCOMPLETE_PAIR of a question is its n-th incomplete pair — the number the field mapping gives that pair's frames
 * (teacher/questionFieldIssues → Field `issueNth` → data-issue-nth). A code a question has once is occurrence 1.
 */
export function issueOccurrence(issue: StructuredIssue, questionIssues: readonly StructuredIssue[]): number {
  return Math.max(1, questionIssues.filter(i => i.code === issue.code).indexOf(issue) + 1);
}

/**
 * RF3 I-3 — the issues of the card a summary entry leads to. A duplicated question id (an imported / hand-edited exam) is a blocking
 * DUPLICATE_ID error that validateStructuredExam raises right before that duplicate's own issues; the builder's node map (and the
 * entry's label, issueTargets) hold the LAST card carrying the id, so its issues are the ones after the last DUPLICATE_ID. An issue
 * before it belongs to an earlier card: `null` (the caller matches its code only — no instance number). DUPLICATE_ID and every
 * per-row code are errors, so their relative order in the index (errors, then warnings) is the canonical one.
 */
export function targetCardIssues(issue: StructuredIssue, questionIssues: readonly StructuredIssue[]): readonly StructuredIssue[] | null {
  let last = -1;
  questionIssues.forEach((i, k) => { if (i.code === "DUPLICATE_ID") last = k; });
  if (last < 0) return questionIssues;
  const own = questionIssues.slice(last + 1);
  return own.includes(issue) ? own : null;
}

/** RF3 I-1 — a part of a compound question (its position in `parts`: the frozen compound@1 editor renders `.sb-compound-editor >
 *  .sb-part` in that order, with no attribute of its own) or of a composite question (its id: the editor's `data-part-id`). */
export type IssuePart = { family: "compound"; index: number } | { family: "composite"; id: string };
type PartsShape = { presentationType?: unknown; displayNumber?: unknown; parts?: unknown };
/** One part as the canonical validator names it (examQuality validateCompound / validateComposite): «البند <label> من <disp>». */
type PartEntry = { part: IssuePart; name: string; label: string; type: string };
const partName = (label: unknown, disp: string) => "البند " + label + " من " + disp;
function partEntries(question: PartsShape): PartEntry[] {
  const disp = question.displayNumber ? "«" + question.displayNumber + "»" : "";
  if (question.presentationType === "compound" && Array.isArray(question.parts)) {
    return question.parts.map((p, i) => {
      const part = p as { label?: unknown; type?: unknown } | null;
      const label = String(part?.label || i + 1);
      return { part: { family: "compound", index: i }, name: partName(label, disp), label, type: String(part?.type ?? "") };
    });
  }
  if (question.presentationType !== "composite") return [];
  const st = compositeStructure(question);
  return st.ok ? st.model.groups.flatMap(g => g.parts.map(p => ({ part: { family: "composite" as const, id: p.id }, name: partName(p.label, disp), label: String(p.label), type: String(p.type) }))) : [];
}
/** A canonical message names that part: the body rules quote the name («…»); the presentation rules start with it («…: », and
 *  «… — المحتوى المنسق: …» for a composite part's rich content, RR3-1); the composite authority quotes the bare label after «البند»
 *  («نوع البند «ب» …», «فحوص البند «ب» …», RR3-1). */
const namesPart = (message: string, e: PartEntry) =>
  message.includes("«" + e.name + "»") || message.startsWith(e.name + ":") || message.startsWith(e.name + " — ")
  || (e.part.family === "composite" && message.includes("البند «" + e.label + "»"));
const namedParts = (issue: StructuredIssue, question: PartsShape | null | undefined) => (question ? partEntries(question).filter(e => namesPart(issue.message, e)) : []);

/**
 * RF3 I-1 — which part of a compound / composite question a canonical issue belongs to. A part has no Field frame (the compound@1
 * markup is frozen: compoundFreeze.20d F-12), so no frame carries its codes; the issue itself names the part exactly as the
 * validator labels it (compound: the part's label, else its 1-based position; composite: the structure's label), and this reads
 * that name back against the question's parts — nothing is re-validated. Exactly one part named → that part; several (two parts
 * with the same label) → "ambiguous"; none → null (a question-level issue: the marks, the stem, a duplicated part id…).
 */
export function issuePart(issue: StructuredIssue, question: PartsShape | null | undefined): IssuePart | "ambiguous" | null {
  const hits = namedParts(issue, question);
  return hits.length === 1 ? hits[0].part : hits.length ? "ambiguous" : null;
}

/** The part's type / version is what the issue is about (the head's type select). */
const TYPE_CODES: ReadonlySet<string> = new Set(["UNKNOWN_QUESTION_TYPE", "UNSUPPORTED_QUESTION_TYPE_VERSION", "COMPOSITE_CHILD_TYPE_UNSUPPORTED"]);
/** One row / cell / field of the part's answer body is what the issue is about — never the part as a whole (examQuality
 *  validateBody / validateTableFill / validateCliFill). */
const ROW_CODES: ReadonlySet<string> = new Set(["MATCH_INCOMPLETE_PAIR", "CORRECT_NOT_IN_CHOICES", "FIELD_NO_CORRECT", "TABLE_BAD_CELL", "TABLE_DUP_CELL", "TABLE_SELECT_NO_OPTIONS", "CLI_PLACEHOLDER_NO_FIELD", "CLI_FIELD_UNUSED", "ANSWER_SEQUENCE_MISMATCH"]);
/** Of those, the row's correct-answer control is the one at fault (the last input / select of the row). */
const ANSWER_CODES: ReadonlySet<string> = new Set(["FIELD_NO_CORRECT", "CORRECT_NOT_IN_CHOICES"]);
/** The part bodies whose N-th `.sb-field-row` is the validator's N-th row (QuestionBodyEditor's matching pairs, QuestionFieldEditor's
 *  statements / blanks — the same `fields` order). A table or CLI body has no such row: its row issues lead to the named list. */
const ROW_TYPES: ReadonlySet<string> = new Set(["matching", "multiTrueFalse", "fillBlank", "wordBank", "ordering"]);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Where in the part a summary entry puts focus: its answer body, the N-th row of it (`answer`: that row's correct-answer
 *  control), its rich content, its type select — or, for a row issue whose row cannot be located, the card's named list. */
export type PartFocus =
  | { part: IssuePart; at: "body" | "rich" | "type" | "list" }
  | { part: IssuePart; at: "row"; row: number; answer: boolean };

/**
 * RF3 I-1 / RR3-3 — the part a canonical issue names (issuePart) and WHAT of it the issue is about, read from the issue's code and
 * the validator's own wording: a numbered row («الزوج 3 في «البند 1 من «2»»», «الفراغ 2 في …», «البند 2 في …» — the number right
 * before « في «<part name>»»), the part's rich content («<part name> — المحتوى المنسق: …»), its type, else the answer body as a
 * whole («… بأقل من خيارين»). A row issue that names no number, or whose part body has no countable rows (a table, a CLI), is "list":
 * focus goes to the card's named issue list, never to a row the issue does not name.
 */
export function issuePartFocus(issue: StructuredIssue, question: PartsShape | null | undefined): PartFocus | "ambiguous" | null {
  const hits = namedParts(issue, question);
  if (hits.length !== 1) return hits.length ? "ambiguous" : null;
  const { part, name, type } = hits[0];
  if (TYPE_CODES.has(issue.code)) return { part, at: "type" };
  if (issue.code === "PARAMETRIC_RICH_CONTENT_FORBIDDEN" || issue.message.startsWith(name + " — المحتوى المنسق")) return { part, at: "rich" };
  if (!ROW_CODES.has(issue.code)) return { part, at: "body" };
  const m = new RegExp("(\\d+) في «" + escapeRe(name) + "»").exec(issue.message);
  return m && ROW_TYPES.has(type) ? { part, at: "row", row: Number(m[1]), answer: ANSWER_CODES.has(issue.code) } : { part, at: "list" };
}

/** The one polite summary sentence announced when the counts change (never per keystroke: see useIssueAnnouncer). */
export function issueSummaryText(errors: number, warnings: number): string {
  if (!errors && !warnings) return "لا توجد مشكلات في الامتحان.";
  const parts = [errors ? errors + (errors === 1 ? " خطأ" : " أخطاء") : "", warnings ? warnings + (warnings === 1 ? " تنبيه" : " تنبيهات") : ""].filter(Boolean);
  return "مشكلات الامتحان: " + parts.join(" و") + (errors ? " — يجب إصلاح الأخطاء قبل الاعتماد النهائي." : ".");
}
