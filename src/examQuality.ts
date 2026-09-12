// Quality validation for structured exams. Pure and unit-testable. Produces a flat list of issues,
// each classified as "error" (a serious structural problem that blocks FINAL save) or "warning" (a
// draft may still be saved). It never silently fixes content — it only tells the teacher what is
// wrong and where. Legacy flat exams keep App.tsx's existing buildQualityIssues(); this module covers
// the structured format the builder produces.
//
// A single reusable validateBody() runs the type-specific structural rules, so a COMPOUND PART is
// validated exactly like a standalone question of the same type (a malformed CLI/tableFill/etc. part
// can no longer slip through to final status).

import type { BuilderQuestion, BuilderSection, QuestionBody, StructuredExam, BuilderPartType, BuilderQuestionType } from "./examTypes";
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

type Add = (severity: Severity, code: string, message: string, extra?: { sectionId?: string; questionId?: string }) => void;
type Where = { sectionId?: string; questionId?: string };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export function validateStructuredExam(exam: StructuredExam): StructuredIssue[] {
  const issues: StructuredIssue[] = [];
  let n = 0;
  const add: Add = (severity, code, message, extra = {}) => {
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

function validateSection(section: BuilderSection, label: string, add: Add): void {
  // Grading policy and answer unit are NEVER guessed (e.g. on import) — a wrong default would silently
  // change the exam's academic meaning. Both must be explicitly one of the known values. `as` widening
  // is intentional: the static type is a closed union, but a loaded/imported section may carry anything.
  const unit = section.answerUnit as string | null | undefined;
  if (unit != null && unit !== "question" && unit !== "part") {
    add("error", "ANSWER_UNIT_INVALID", "وحدة الإجابة في القسم «" + label + "» غير صالحة (يجب أن تكون «سؤال» أو «بند»).", { sectionId: section.id });
  }
  const policy = section.gradingPolicy as string | null | undefined;
  if (policy == null || policy === "") {
    add("error", "GRADING_POLICY_REQUIRED", "القسم «" + label + "» بلا قاعدة تصحيح — اختر «تصحيح جميع الأسئلة» أو «سقف للعلامة» أو «أول عدد محدد».", { sectionId: section.id });
    return; // policy-dependent checks below are meaningless without a valid policy
  }
  if (policy !== "all" && policy !== "capScore" && policy !== "firstNAnswered") {
    add("error", "GRADING_POLICY_INVALID", "قاعدة تصحيح غير معروفة «" + policy + "» في القسم «" + label + "» — اختر قاعدة صالحة.", { sectionId: section.id });
    return;
  }
  // capScore and firstNAnswered both require an explicit positive section maximum — the real 791381
  // sections always state one, and a missing cap would let "all"-style raw totals leak past the
  // intended maximum. "all" must have NO cap. A present-but-invalid value is always an error.
  if (section.gradingPolicy === "all") {
    // "all" never uses a cap; changeSectionPolicy clears it, but guard a hand-edited/loaded exam too.
    if (section.maxMarks != null) {
      add("error", "ALL_HAS_MAXMARKS", "قسم «" + label + "» بقاعدة «تصحيح جميع الأسئلة» لا يجوز أن يحمل حدًّا أقصى للعلامة.", { sectionId: section.id });
    }
  } else if (section.maxMarks == null) {
    add("error", "MAXMARKS_REQUIRED", "قسم «" + label + "» يحتاج علامة قصوى موجبة للقسم.", { sectionId: section.id });
  } else if (!Number.isFinite(num(section.maxMarks)) || num(section.maxMarks) <= 0) {
    add("error", "INVALID_MAXMARKS", "العلامة القصوى للقسم «" + label + "» غير صالحة.", { sectionId: section.id });
  }
  if (section.gradingPolicy === "firstNAnswered") {
    // firstNAnswered grades a specific NUMBER of answered UNITS, so the unit (question vs part) is
    // academically load-bearing and must be stated explicitly — never inferred. A missing unit blocks
    // finalization (so selectGradedUnits is never run on an ambiguous firstN exam) but still opens as a
    // draft. (An invalid value is caught by ANSWER_UNIT_INVALID above.)
    const unitResolved = unit === "question" || unit === "part";
    if (unit == null) {
      add("error", "ANSWER_UNIT_REQUIRED", "القسم «" + label + "» يستخدم «تصحيح أول عدد محدد» دون تحديد وحدة الإجابة (سؤال أو بند).", { sectionId: section.id });
    }
    const req = section.requiredAnswers;
    if (req == null) {
      add("error", "FIRSTN_NO_REQUIRED", "القسم «" + label + "» يستخدم «تصحيح أول عدد محدد» دون تحديد عدد الإجابات المطلوبة.", { sectionId: section.id });
    } else if (!Number.isInteger(num(req)) || num(req) <= 0) {
      add("error", "FIRSTN_BAD_REQUIRED", "عدد الإجابات المطلوبة في «" + label + "» يجب أن يكون أكبر من صفر.", { sectionId: section.id });
    } else if (unitResolved) {
      // Only compare against available units when the unit is unambiguous — otherwise ANSWER_UNIT_*
      // already flags it and the count would be a guess.
      const available = section.answerUnit === "part"
        ? section.questions.reduce((c, q) => c + ((q.parts && q.parts.length) ? q.parts.length : 1), 0)
        : section.questions.length;
      if (num(req) > available) {
        // Blocking: a section that requires more answers than it has units can never be graded as
        // intended. It can still be saved as a DRAFT (draft saves skip validation).
        add("error", "FIRSTN_EXCEEDS", "عدد الإجابات المطلوبة (" + req + ") في «" + label + "» يتجاوز عدد " + (section.answerUnit === "part" ? "البنود" : "الأسئلة") + " المتاحة (" + available + ").", { sectionId: section.id });
      }
    }
  }
}

function validateQuestion(q: BuilderQuestion, sectionLabel: string, section: BuilderSection, add: Add): void {
  const where: Where = { sectionId: section.id, questionId: q.examQuestionId };
  const disp = q.displayNumber ? "«" + q.displayNumber + "»" : "";
  if ((!q.text || !q.text.trim()) && q.presentationType !== "compound") {
    add("error", "EMPTY_TEXT", "سؤال " + disp + " في «" + sectionLabel + "» بلا نص.", where);
  }
  if (!Number.isFinite(num(q.marks)) || num(q.marks) <= 0) {
    add("error", "MARKS_PROBLEM", "سؤال " + disp + " في «" + sectionLabel + "» علامته غير صالحة.", where);
  }
  if (q.presentationType === "compound") {
    validateCompound(q, disp, sectionLabel, where, add);
  } else {
    validateBody(q, q.presentationType, disp, where, add);
  }
}

// Type-specific structural validation for ONE answer body — used for both a top-level question and a
// compound part. `label` is a human hint (question display number, or part label) for messages.
function validateBody(node: QuestionBody, type: BuilderQuestionType | BuilderPartType, label: string, where: Where, add: Add): void {
  switch (type) {
    case "multipleChoice": {
      const opts = node.options || [];
      if (opts.length < 2) add("error", "MISSING_OPTIONS", "«" + label + "» اختيار من متعدد بأقل من خيارين.", where);
      const ci = num((node.answer as { correctOptionIndex?: unknown })?.correctOptionIndex);
      if (!Number.isInteger(ci) || ci < 0 || ci >= opts.length) add("error", "MISSING_ANSWER", "«" + label + "» اختيار من متعدد بلا إجابة صحيحة محددة.", where);
      break;
    }
    case "trueFalse": {
      const a = node.answer as { correct?: unknown; correctOptionIndex?: unknown } | undefined;
      const ok = a && (typeof a.correct === "boolean" || a.correctOptionIndex === 0 || a.correctOptionIndex === 1);
      if (!ok) add("error", "MISSING_ANSWER", "«" + label + "» صح/خطأ بلا إجابة صحيحة.", where);
      break;
    }
    case "multiTrueFalse": {
      const fields = node.fields || [];
      if (!fields.length) add("error", "MISSING_FIELDS", "«" + label + "» صح/خطأ متعدد بلا بنود.", where);
      fields.forEach((f, i) => {
        if (typeof f.correct !== "boolean") add("error", "FIELD_NO_CORRECT", "البند " + (i + 1) + " في «" + label + "» بلا إجابة صحيحة محددة.", where);
      });
      break;
    }
    case "tableFill":
      validateTableFill(node, label, where, add);
      break;
    case "cliFill":
      validateCliFill(node, label, where, add);
      break;
    case "fillBlank":
    case "wordBank":
    case "ordering": {
      // Auto-graded: every blank needs a reachable correct value, and the canonical answer.values must
      // line up with the fields. Missing keys are BLOCKING errors (draft still allowed), NOT warnings —
      // an auto-gradeable type must never silently fall into manual review at final status.
      const fields = node.fields || [];
      const bank = Array.isArray(node.wordBank) ? node.wordBank.filter(w => String(w ?? "").trim() !== "") : [];
      if (!fields.length) { add("error", "MISSING_FIELDS", "«" + label + "» يحتاج حقول إجابة.", where); break; }
      fields.forEach((f, i) => {
        const correct = String(f.correct ?? "").trim();
        if (correct === "") { add("error", "FIELD_NO_CORRECT", "الفراغ " + (i + 1) + " في «" + label + "» بلا إجابة صحيحة.", where); return; }
        // reachability: a word-bank / select correct value must be one of the offered choices
        const choices = f.kind === "select" && Array.isArray(f.options) && f.options.length ? f.options.map(o => String(o.text ?? o.value ?? o.label ?? "").trim()) : bank;
        if (choices.length && !choices.map(c => c).includes(correct)) {
          add("error", "CORRECT_NOT_IN_CHOICES", "الإجابة الصحيحة للفراغ " + (i + 1) + " في «" + label + "» غير موجودة ضمن الخيارات المتاحة.", where);
        }
      });
      const values = (node.answer as { values?: unknown })?.values;
      if (!Array.isArray(values) || values.length !== fields.length) {
        add("error", "ANSWER_SEQUENCE_MISMATCH", "قيم الإجابة في «" + label + "» لا تطابق عدد الفراغات.", where);
      }
      break;
    }
    case "matching": {
      // Auto-graded: at least one pair, every pair fully filled, each correct reachable from options.
      const fields = node.fields || [];
      if (!fields.length) { add("error", "MISSING_FIELDS", "«" + label + "» مطابقة بلا أزواج.", where); break; }
      fields.forEach((f, i) => {
        const left = String(f.label ?? "").trim();
        const right = String(f.correct ?? "").trim();
        if (left === "" || right === "") { add("error", "MATCH_INCOMPLETE_PAIR", "الزوج " + (i + 1) + " في «" + label + "» غير مكتمل (يلزم عنصر وإجابته).", where); return; }
        const opts = Array.isArray(f.options) ? f.options.map(o => String(o.text ?? o.value ?? o.label ?? "").trim()) : [];
        if (opts.length && !opts.includes(right)) add("error", "CORRECT_NOT_IN_CHOICES", "الإجابة الصحيحة للزوج " + (i + 1) + " في «" + label + "» غير موجودة ضمن الخيارات.", where);
      });
      const text = (node.answer as { text?: unknown })?.text;
      if (typeof text !== "string" || !text.includes("=")) add("error", "MISSING_ANSWER", "«" + label + "» مطابقة بلا مفتاح إجابة صالح.", where);
      break;
    }
    case "shortAnswer":
      // open question: a model answer is optional; without it the engine sends it to manual review.
      // This is the ONLY structured type where a missing key is allowed at final status.
      break;
    default:
      break;
  }
}

function validateTableFill(node: QuestionBody, label: string, where: Where, add: Add): void {
  const rows = node.tableRows || [];
  const cols = (node.tableHeaders || []).length || Math.max(0, ...rows.map(r => r.length));
  const fields = node.fields || [];
  if (!fields.length) { add("error", "MISSING_FIELDS", "«" + label + "» جدول بلا أي خلية قابلة للإجابة.", where); return; }
  const seenCells = new Set<string>();
  fields.forEach((f, i) => {
    const r = Number(f.row), c = Number(f.column);
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= rows.length || c >= cols) {
      add("error", "TABLE_BAD_CELL", "خلية جواب رقم " + (i + 1) + " في «" + label + "» تشير إلى موقع غير صالح.", where);
      return;
    }
    const key = r + ":" + c;
    if (seenCells.has(key)) add("error", "TABLE_DUP_CELL", "خليتان قابلتان للإجابة تشيران إلى الموقع نفسه في «" + label + "».", where);
    seenCells.add(key);
    if (f.correct === undefined || f.correct === "") add("error", "FIELD_NO_CORRECT", "خلية جواب في «" + label + "» بلا إجابة صحيحة.", where);
    if (f.kind === "select" && !(Array.isArray(f.options) && f.options.length)) add("error", "TABLE_SELECT_NO_OPTIONS", "خلية قائمة في «" + label + "» بلا خيارات.", where);
  });
}

function validateCliFill(node: QuestionBody, label: string, where: Where, add: Add): void {
  const placeholders = cliPlaceholders(node.cli || "");
  const fieldIds = new Set((node.fields || []).map(f => f.id));
  if (!(node.cli || "").trim()) { add("error", "CLI_EMPTY", "«" + label + "» أوامر CLI بلا نص.", where); return; }
  placeholders.forEach(ph => { if (!fieldIds.has(ph)) add("error", "CLI_PLACEHOLDER_NO_FIELD", "الفراغ [[" + ph + "]] في «" + label + "» لا يقابله حقل معرّف.", where); });
  (node.fields || []).forEach(f => {
    if (!placeholders.includes(f.id)) add("warning", "CLI_FIELD_UNUSED", "الحقل «" + (f.label || f.id) + "» في «" + label + "» غير مستخدم داخل نص الأوامر.", where);
    if (f.correct === undefined || f.correct === "") add("error", "FIELD_NO_CORRECT", "حقل CLI في «" + label + "» بلا إجابة صحيحة.", where);
  });
}

function validateCompound(q: BuilderQuestion, disp: string, sectionLabel: string, where: Where, add: Add): void {
  const parts = q.parts || [];
  if (!parts.length) { add("error", "COMPOUND_NO_PARTS", "السؤال المركّب " + disp + " في «" + sectionLabel + "» بلا بنود.", where); return; }
  const seen = new Set<string>();
  parts.forEach((p, i) => {
    if (seen.has(p.id)) add("error", "COMPOUND_DUP_PART", "معرّف بند مكرّر في السؤال المركّب " + disp + ".", where);
    seen.add(p.id);
    // Each part runs the SAME type-specific structural validation a standalone question of that type
    // would, so a malformed compound part is caught before finalization.
    validateBody(p, p.type, "البند " + (p.label || i + 1) + " من " + disp, where, add);
  });
  const info = partMarksInfo(q);
  if (info.mismatch) {
    add("warning", "MARKS_MISMATCH", "مجموع علامات البنود (" + info.total + ") لا يساوي علامة السؤال المركّب " + disp + " (" + info.questionMarks + ").", where);
  }
}

export const hasBlockingErrors = (issues: StructuredIssue[]): boolean => issues.some(i => i.severity === "error");
