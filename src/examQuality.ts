// Quality validation for structured exams. Pure and unit-testable. Produces a flat list of issues,
// each classified as "error" (a serious structural problem that blocks FINAL save) or "warning" (a
// draft may still be saved). It never silently fixes content — it only tells the teacher what is
// wrong and where. Legacy flat exams keep App.tsx's existing buildQualityIssues(); this module covers
// the structured format the builder produces.

import type { BuilderPart, BuilderQuestion, BuilderSection, StructuredExam } from "./examTypes";
import { cliPlaceholders, partMarksInfo } from "./examBuilderState";

export type Severity = "error" | "warning";
export type StructuredIssue = {
  id: string;
  severity: Severity;
  code: string;
  message: string;
  sectionId?: string;
  questionId?: string;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function partHasAnswerKey(p: BuilderPart): boolean {
  if (p.type === "shortAnswer") return true; // model answer optional → manual review is legitimate
  if (p.type === "multipleChoice" || p.type === "trueFalse") return !!p.answer && (p.answer.correctOptionIndex != null || p.answer.correct != null);
  if (p.type === "multiTrueFalse" || p.type === "tableFill" || p.type === "cliFill") return (p.fields || []).some(f => f.correct !== undefined && f.correct !== "");
  if (p.type === "fillBlank" || p.type === "wordBank" || p.type === "ordering") return !!p.answer && Array.isArray(p.answer.values) && (p.answer.values as unknown[]).length > 0;
  if (p.type === "matching") return !!p.answer && typeof p.answer.text === "string" && (p.answer.text as string).includes("=");
  return false;
}

export function validateStructuredExam(exam: StructuredExam): StructuredIssue[] {
  const issues: StructuredIssue[] = [];
  let n = 0;
  const add = (severity: Severity, code: string, message: string, extra: { sectionId?: string; questionId?: string } = {}) => {
    n += 1;
    issues.push({ id: "sq-" + n, severity, code, message, ...extra });
  };

  const sections = Array.isArray(exam.sections) ? exam.sections : [];
  if (!sections.length) {
    add("error", "NO_SECTIONS", "الامتحان لا يحتوي على أي قسم.");
    return issues;
  }

  const seenQuestionIds = new Set<string>();

  sections.forEach((section, si) => {
    const label = section.title || "القسم " + (si + 1);
    validateSection(section, label, add);

    // stimulus references
    const stimuli = section.stimuli || {};
    section.questions.forEach(q => {
      if (q.groupId && !stimuli[q.groupId]) {
        add("warning", "STIMULUS_MISSING", "السؤال يشير إلى مادة مشتركة «" + q.groupId + "» غير موجودة في «" + label + "».", { sectionId: section.id, questionId: q.examQuestionId });
      }
    });

    if (!section.questions.length) {
      add("warning", "EMPTY_SECTION", "القسم «" + label + "» لا يحتوي على أسئلة.", { sectionId: section.id });
    }

    section.questions.forEach(q => {
      if (seenQuestionIds.has(q.examQuestionId)) {
        add("error", "DUPLICATE_ID", "معرّف داخلي مكرّر للسؤال: " + q.examQuestionId + ".", { sectionId: section.id, questionId: q.examQuestionId });
      }
      seenQuestionIds.add(q.examQuestionId);
      validateQuestion(q, label, section, add);
    });
  });

  return issues;
}

function validateSection(section: BuilderSection, label: string, add: (s: Severity, c: string, m: string, e?: { sectionId?: string; questionId?: string }) => void): void {
  if (section.maxMarks != null && (!Number.isFinite(num(section.maxMarks)) || num(section.maxMarks) <= 0)) {
    add("error", "INVALID_MAXMARKS", "العلامة القصوى للقسم «" + label + "» غير صالحة.", { sectionId: section.id });
  }
  if (section.gradingPolicy === "firstNAnswered") {
    const req = section.requiredAnswers;
    if (req == null) {
      add("error", "FIRSTN_NO_REQUIRED", "القسم «" + label + "» يستخدم «تصحيح أول عدد محدد» دون تحديد عدد الإجابات المطلوبة.", { sectionId: section.id });
    } else if (!Number.isInteger(num(req)) || num(req) <= 0) {
      add("error", "FIRSTN_BAD_REQUIRED", "عدد الإجابات المطلوبة في «" + label + "» يجب أن يكون أكبر من صفر.", { sectionId: section.id });
    } else {
      const available = section.answerUnit === "part"
        ? section.questions.reduce((c, q) => c + ((q.parts && q.parts.length) ? q.parts.length : 1), 0)
        : section.questions.length;
      if (num(req) > available) {
        add("warning", "FIRSTN_EXCEEDS", "عدد الإجابات المطلوبة (" + req + ") في «" + label + "» يتجاوز عدد " + (section.answerUnit === "part" ? "البنود" : "الأسئلة") + " المتاحة (" + available + ").", { sectionId: section.id });
      }
    }
  }
}

function validateQuestion(q: BuilderQuestion, sectionLabel: string, section: BuilderSection, add: (s: Severity, c: string, m: string, e?: { sectionId?: string; questionId?: string }) => void): void {
  const where = { sectionId: section.id, questionId: q.examQuestionId };
  const disp = q.displayNumber ? "«" + q.displayNumber + "»" : "";
  if (!q.text || !q.text.trim()) {
    if (q.presentationType !== "compound") add("error", "EMPTY_TEXT", "سؤال " + disp + " في «" + sectionLabel + "» بلا نص.", where);
  }
  if (!Number.isFinite(num(q.marks)) || num(q.marks) <= 0) {
    add("error", "MARKS_PROBLEM", "سؤال " + disp + " في «" + sectionLabel + "» علامته غير صالحة.", where);
  }

  switch (q.presentationType) {
    case "multipleChoice": {
      const opts = q.options || [];
      if (opts.length < 2) add("error", "MISSING_OPTIONS", "سؤال " + disp + " اختيار من متعدد بأقل من خيارين.", where);
      const ci = num((q.answer as { correctOptionIndex?: unknown })?.correctOptionIndex);
      if (!Number.isInteger(ci) || ci < 0 || ci >= opts.length) add("error", "MISSING_ANSWER", "سؤال " + disp + " اختيار من متعدد بلا إجابة صحيحة محددة.", where);
      break;
    }
    case "trueFalse":
      if (!q.answer || (q.answer.correct == null && q.answer.correctOptionIndex == null)) add("error", "MISSING_ANSWER", "سؤال " + disp + " صح/خطأ بلا إجابة صحيحة.", where);
      break;
    case "multiTrueFalse":
      if (!(q.fields || []).length) add("error", "MISSING_FIELDS", "سؤال " + disp + " صح/خطأ متعدد بلا بنود.", where);
      (q.fields || []).forEach((f, i) => { if (f.correct === undefined) add("error", "FIELD_NO_CORRECT", "البند " + (i + 1) + " في سؤال " + disp + " بلا إجابة صحيحة.", where); });
      break;
    case "tableFill":
      validateTableFill(q, disp, add, where);
      break;
    case "cliFill":
      validateCliFill(q, disp, add, where);
      break;
    case "fillBlank":
    case "wordBank":
    case "ordering":
      if (!(q.fields || []).length) add("error", "MISSING_FIELDS", "سؤال " + disp + " يحتاج حقول إجابة.", where);
      if (!q.answer || !Array.isArray(q.answer.values) || (q.answer.values as unknown[]).length === 0) add("warning", "MISSING_ANSWER", "سؤال " + disp + " بلا ترتيب/قيم صحيحة محددة — سيذهب للمراجعة اليدوية.", where);
      break;
    case "matching":
      if (!q.answer || typeof q.answer.text !== "string" || !(q.answer.text as string).includes("=")) add("warning", "MISSING_ANSWER", "سؤال " + disp + " مطابقة بلا مفتاح إجابة — سيذهب للمراجعة اليدوية.", where);
      break;
    case "shortAnswer":
      // open question: a model answer is optional; without it the engine sends it to manual review.
      break;
    case "compound":
      validateCompound(q, disp, sectionLabel, add, where);
      break;
    default:
      break;
  }
}

function validateTableFill(q: BuilderQuestion, disp: string, add: (s: Severity, c: string, m: string, e?: { sectionId?: string; questionId?: string }) => void, where: { sectionId?: string; questionId?: string }): void {
  const rows = q.tableRows || [];
  const cols = (q.tableHeaders || []).length || Math.max(0, ...rows.map(r => r.length));
  const fields = q.fields || [];
  if (!fields.length) { add("error", "MISSING_FIELDS", "سؤال " + disp + " جدول بلا أي خلية قابلة للإجابة.", where); return; }
  const seenCells = new Set<string>();
  fields.forEach((f, i) => {
    const r = Number(f.row), c = Number(f.column);
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= rows.length || c >= cols) {
      add("error", "TABLE_BAD_CELL", "خلية جواب رقم " + (i + 1) + " في سؤال " + disp + " تشير إلى موقع غير صالح.", where);
      return;
    }
    const key = r + ":" + c;
    if (seenCells.has(key)) add("error", "TABLE_DUP_CELL", "خليتان قابلتان للإجابة تشيران إلى الموقع نفسه في سؤال " + disp + ".", where);
    seenCells.add(key);
    if (f.correct === undefined || f.correct === "") add("error", "FIELD_NO_CORRECT", "خلية جواب في سؤال " + disp + " بلا إجابة صحيحة.", where);
  });
}

function validateCliFill(q: BuilderQuestion, disp: string, add: (s: Severity, c: string, m: string, e?: { sectionId?: string; questionId?: string }) => void, where: { sectionId?: string; questionId?: string }): void {
  const placeholders = cliPlaceholders(q.cli || "");
  const fieldIds = new Set((q.fields || []).map(f => f.id));
  if (!(q.cli || "").trim()) { add("error", "CLI_EMPTY", "سؤال " + disp + " أوامر CLI بلا نص.", where); return; }
  placeholders.forEach(ph => { if (!fieldIds.has(ph)) add("error", "CLI_PLACEHOLDER_NO_FIELD", "الفراغ [[" + ph + "]] في سؤال " + disp + " لا يقابله حقل معرّف.", where); });
  (q.fields || []).forEach(f => {
    if (!placeholders.includes(f.id)) add("warning", "CLI_FIELD_UNUSED", "الحقل «" + (f.label || f.id) + "» في سؤال " + disp + " غير مستخدم داخل نص الأوامر.", where);
    if (f.correct === undefined || f.correct === "") add("error", "FIELD_NO_CORRECT", "حقل CLI في سؤال " + disp + " بلا إجابة صحيحة.", where);
  });
}

function validateCompound(q: BuilderQuestion, disp: string, sectionLabel: string, add: (s: Severity, c: string, m: string, e?: { sectionId?: string; questionId?: string }) => void, where: { sectionId?: string; questionId?: string }): void {
  const parts = q.parts || [];
  if (!parts.length) { add("error", "COMPOUND_NO_PARTS", "السؤال المركّب " + disp + " في «" + sectionLabel + "» بلا بنود.", where); return; }
  const seen = new Set<string>();
  parts.forEach((p, i) => {
    if (seen.has(p.id)) add("error", "COMPOUND_DUP_PART", "معرّف بند مكرّر في السؤال المركّب " + disp + ".", where);
    seen.add(p.id);
    if (!partHasAnswerKey(p)) add("warning", "PART_NO_ANSWER", "البند " + (p.label || i + 1) + " في السؤال المركّب " + disp + " بلا مفتاح إجابة موثوق.", where);
  });
  const info = partMarksInfo(q);
  if (info.mismatch) {
    add("warning", "MARKS_MISMATCH", "مجموع علامات البنود (" + info.total + ") لا يساوي علامة السؤال المركّب " + disp + " (" + info.questionMarks + ").", where);
  }
}

export const hasBlockingErrors = (issues: StructuredIssue[]): boolean => issues.some(i => i.severity === "error");
