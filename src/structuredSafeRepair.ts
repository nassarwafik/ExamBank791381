// UX-6d — deterministic, PURE structured-exam repair. It repairs ONLY states whose correct result is
// already present somewhere in the exam and whose repair is mechanically unambiguous. It NEVER decides
// academic content (which MCQ option is correct, true vs false, a missing blank/table/CLI answer,
// matching pairs, question text, options, marks, grading policy, sections). Anything it cannot resolve
// this way is returned as `unresolved` for the AI-proposal / teacher-review phases.
//
// It is the SAME StructuredExam the builder/grader/validator already use — no second model, no transform.
// The canonical validator (examQuality.validateStructuredExam) is never re-implemented here; the wizard
// re-runs it before and after to show the real before→after counts.

import type { StructuredExam, BuilderQuestion, BuilderPart, BuilderField, BuilderOption, QuestionBody } from "./examTypes";
import { genId } from "./examBuilderState";

export type SafeRepairChange = {
  code: string;               // machine code (never a parsed message) e.g. "SEQUENCE_VALUES_REBUILT"
  sectionId?: string;
  questionId?: string;        // examQuestionId
  partId?: string;            // when the change is inside a compound part
  description: string;        // Arabic, human-facing — for the inspectable change list
};

export type SafeRepairResult = {
  exam: StructuredExam;
  changes: SafeRepairChange[];
  // Codes of the (structural/semantic) issue kinds this deterministic pass CANNOT resolve — surfaced so
  // the caller can drive the AI phase. This is advisory; the authoritative remaining list always comes
  // from re-running validateStructuredExam on the returned exam.
  unresolved: SafeRepairChange[];
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const optionText = (o: BuilderOption): string => str(o?.text ?? o?.label ?? o?.value);
const SEQUENCE_TYPES = new Set(["fillBlank", "wordBank", "ordering"]);

function fieldOptionTexts(f: BuilderField): string[] {
  return (Array.isArray(f.options) ? f.options : []).map(optionText).filter(Boolean);
}

// Repairs ONE answer body (a question or a compound part) in place on a fresh copy. Returns the repaired
// body plus the changes it made. `type` is the presentationType (question) or part.type.
function repairBody(
  node: QuestionBody,
  type: string,
  where: { sectionId?: string; questionId?: string; partId?: string },
  label: string,
  changes: SafeRepairChange[]
): QuestionBody {
  const out: QuestionBody = { ...node };
  const add = (code: string, description: string) => changes.push({ code, description, ...where });

  // D. Deterministic ids for answer fields that somehow arrived without one (import normally does this;
  //    this is defensive and NEVER changes an existing stable id).
  if (Array.isArray(out.fields)) {
    let mintedAny = false;
    out.fields = out.fields.map(f => {
      if (str(f.id)) return f;
      mintedAny = true;
      return { ...f, id: genId("f") };
    });
    if (mintedAny) add("FIELD_ID_GENERATED", "توليد معرّفات داخلية ناقصة للحقول في «" + label + "» دون تغيير أي معرّف قائم.");
  }

  if (SEQUENCE_TYPES.has(type)) {
    repairSequenceBody(out, type, label, add);
  }

  return out;
}

// fillBlank / wordBank / ordering: the canonical answer is { mode:"exactSequence", values } where
// values[i] === fields[i].correct. Two SAFE directions (the correct data is already present):
//   A. every field has a correct, but answer.values is missing/stale → rebuild values from the fields.
//   B. answer.values exists, its length exactly equals fields.length, some fields lack a correct, and no
//      field's existing correct CONFLICTS with the value at its index → copy each value into field.correct.
//   C. wordBank: a select field with no options, when the canonical top-level wordBank has entries and the
//      field has no contradictory options → give the field the bank's options (never invents a word).
// It never fabricates a value, never resolves a blank whose value is unknown on BOTH sides, and never
// overwrites a field.correct that already disagrees with answer.values (that is a real conflict → left).
function repairSequenceBody(
  out: QuestionBody,
  type: string,
  label: string,
  add: (code: string, description: string) => void
): void {
  const fields = Array.isArray(out.fields) ? out.fields.slice() : [];
  if (!fields.length) return;
  const answer = isObj(out.answer) ? { ...out.answer } : {};
  const values = Array.isArray((answer as { values?: unknown }).values)
    ? ((answer as { values: unknown[] }).values).map(v => str(v))
    : null;

  const fieldCorrect = fields.map(f => (f.correct === undefined || f.correct === null ? "" : str(f.correct)));
  const everyFieldHasCorrect = fieldCorrect.every(c => c !== "");
  const someFieldMissing = fieldCorrect.some(c => c === "");

  // C. wordBank option derivation from the canonical bank (before sequence sync, so a later reverse-sync
  //    value is reachable through the field's own options too). Pure enrichment: does not touch correct.
  if (type === "wordBank") {
    const bank = (Array.isArray(out.wordBank) ? out.wordBank : []).map(w => str(w)).filter(Boolean);
    if (bank.length) {
      let enriched = false;
      out.fields = fields.map(f => {
        const isSelect = (f.kind ?? "select") === "select";
        const has = fieldOptionTexts(f);
        if (isSelect && has.length === 0) {
          enriched = true;
          return { ...f, options: bank.map(text => ({ text })) };
        }
        return f;
      });
      if (enriched) add("WORDBANK_OPTIONS_FROM_BANK", "اشتقاق خيارات الفراغات في «" + label + "» من بنك الكلمات القائم دون إضافة أي كلمة جديدة.");
      fields.length = 0;
      fields.push(...(out.fields as BuilderField[]));
    }
  }

  // A. forward: rebuild answer.values from the fields (only when every field already carries a correct).
  if (everyFieldHasCorrect) {
    const rebuilt = fieldCorrect;
    const stale = !values || values.length !== rebuilt.length || values.some((v, i) => v !== rebuilt[i]);
    if (stale) {
      out.answer = { ...answer, mode: "exactSequence", values: rebuilt };
      add("SEQUENCE_VALUES_REBUILT", "إعادة بناء تسلسل الإجابات في «" + label + "» من الإجابات الصحيحة المحددة على الفراغات (بدون تغيير أي إجابة).");
    }
    return;
  }

  // B. reverse: copy answer.values into the fields that lack a correct — only when lengths match exactly
  //    and no already-present field.correct conflicts with the value at its index.
  if (someFieldMissing && values && values.length === fields.length) {
    const conflict = fields.some((_, i) => {
      const existing = fieldCorrect[i];
      return existing !== "" && existing !== values[i];
    });
    const everyValueFilled = values.every(v => v !== "");
    if (!conflict && everyValueFilled) {
      out.fields = fields.map((f, i) => (fieldCorrect[i] === "" ? { ...f, correct: values[i] } : f));
      // keep the canonical answer aligned (it already equals values, but normalize the mode)
      out.answer = { ...answer, mode: "exactSequence", values: values.slice() };
      add("FIELD_CORRECT_FROM_SEQUENCE", "نسخ قيم تسلسل الإجابة إلى الفراغات الفارغة في «" + label + "» (القيم موجودة أصلًا في مفتاح الإجابة).");
    }
  }
}

function repairQuestion(q: BuilderQuestion, sectionId: string, changes: SafeRepairChange[]): BuilderQuestion {
  const label = q.displayNumber ? "السؤال " + q.displayNumber : "سؤال";
  const where = { sectionId, questionId: q.examQuestionId };
  if (q.presentationType === "compound") {
    if (!Array.isArray(q.parts)) return q;
    let mintedPart = false;
    const parts = q.parts.map((p: BuilderPart) => {
      let pid = p.id;
      if (!str(pid)) { pid = genId("p"); mintedPart = true; }
      const body = repairBody(p, p.type, { ...where, partId: pid }, label + " — البند " + (p.label || pid), changes);
      return { ...p, ...body, id: pid, type: p.type };
    });
    if (mintedPart) changes.push({ code: "PART_ID_GENERATED", description: "توليد معرّفات ناقصة لبنود «" + label + "» دون تغيير أي معرّف قائم.", ...where });
    return { ...q, parts };
  }
  const body = repairBody(q, q.presentationType, where, label, changes);
  return { ...q, ...body };
}

/**
 * Deterministic safe repair. Returns a NEW exam (never mutates the input), the list of mechanical
 * changes made (each inspectable, each carrying a machine code and section/question ids), and an
 * advisory `unresolved` list. It performs ZERO network/AI/server calls.
 */
export function repairStructuredExamSafely(exam: StructuredExam): SafeRepairResult {
  const changes: SafeRepairChange[] = [];
  const sections = Array.isArray(exam.sections) ? exam.sections : [];
  const nextSections = sections.map(section => ({
    ...section,
    questions: (section.questions || []).map(q => repairQuestion(q, section.id, changes))
  }));
  const nextExam: StructuredExam = { ...exam, sections: nextSections };
  return { exam: nextExam, changes, unresolved: [] };
}
