// Pure, immutable update helpers + presets + legacy→structured conversion for the Structured Exam
// Builder. Every function returns NEW objects/arrays — it never mutates the section/question/part/
// field trees React holds in state. Kept dependency-light and fully unit-testable (no React).

import type {
  AnswerUnit,
  BuilderField,
  BuilderPart,
  BuilderPartType,
  BuilderQuestion,
  BuilderQuestionType,
  BuilderSection,
  GradingPolicy,
  QuestionBody,
  Stimulus,
  StructuredExam
} from "./examTypes";

// ── Identity ────────────────────────────────────────────────────────────────
// Stable unique ids. crypto.randomUUID when available (browser / modern Node), else a random string.
// Display numbers are NEVER identity.
export function genId(prefix = "id"): string {
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (g && typeof g.randomUUID === "function") return prefix + "-" + g.randomUUID();
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

const ARABIC_ORDINALS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي", "ك", "ل", "م", "ن", "س", "ع", "ف", "ص", "ق", "ر", "ش", "ت", "ث", "خ", "ذ", "ض", "ظ", "غ"];
export const ordinalLabel = (i: number): string => ARABIC_ORDINALS[i] || String(i + 1);

// ── Factories ─────────────────────────────────────────────────────────────
export function newField(overrides: Partial<BuilderField> = {}): BuilderField {
  return { id: genId("f"), kind: "text", ...overrides };
}

export function newPart(type: BuilderPartType = "multipleChoice", overrides: Partial<BuilderPart> = {}): BuilderPart {
  const base: BuilderPart = { id: genId("p"), type, text: "", marks: undefined };
  return applyTypeDefaults({ ...base, ...overrides }) as BuilderPart;
}

export function newQuestion(type: BuilderQuestionType = "multipleChoice", overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  const base: BuilderQuestion = { examQuestionId: genId("q"), presentationType: type, text: "", marks: 1 };
  return applyTypeDefaults({ ...base, ...overrides }) as BuilderQuestion;
}

export function newSection(overrides: Partial<BuilderSection> = {}): BuilderSection {
  return {
    id: genId("sec"),
    title: "",
    instructions: "",
    maxMarks: null,
    gradingPolicy: "all",
    requiredAnswers: null,
    answerUnit: "question",
    stimuli: {},
    questions: [],
    ...overrides
  };
}

// Seeds the minimal shape each type needs so the editor and the engine both have something to work
// with. Never overwrites fields the caller already provided.
function applyTypeDefaults<T extends { presentationType?: BuilderQuestionType; type?: BuilderPartType } & Record<string, unknown>>(node: T): T {
  const t = (node.presentationType || node.type) as BuilderQuestionType | undefined;
  const out: Record<string, unknown> = { ...node };
  const ensure = (key: string, value: unknown) => { if (out[key] === undefined) out[key] = value; };
  switch (t) {
    case "multipleChoice":
      ensure("options", [{ text: "" }, { text: "" }]);
      ensure("answer", { correctOptionIndex: 0 });
      break;
    case "trueFalse":
      ensure("answer", { correct: true });
      break;
    case "multiTrueFalse":
      // correct starts UNSET (undefined) so validation flags it until the teacher explicitly picks
      // صحيح / غير صحيح — an empty selection must never silently mean "false".
      ensure("fields", [newField({ statement: "", kind: "boolean" })]);
      break;
    case "tableFill":
      ensure("tableHeaders", ["", ""]);
      ensure("tableRows", [["", ""]]);
      ensure("fields", []);
      break;
    case "cliFill":
      ensure("cli", "");
      ensure("fields", []);
      break;
    case "fillBlank":
    case "wordBank":
      ensure("wordBank", []);
      ensure("fields", [newField({ label: "", kind: "select" })]);
      ensure("answer", { mode: "exactSequence", values: [] });
      break;
    case "matching":
      ensure("fields", []);
      ensure("answer", { text: "" });
      break;
    case "ordering":
      ensure("wordBank", []);
      ensure("fields", [newField({ label: "", kind: "select" })]);
      ensure("answer", { mode: "exactSequence", values: [] });
      break;
    case "shortAnswer":
      ensure("answer", {});
      break;
    case "compound":
      ensure("parts", [newPart("multipleChoice", { marks: undefined })]);
      break;
    default:
      break;
  }
  return out as T;
}

// Re-seed defaults when the teacher changes a question/part type, preserving text/marks/label.
export function changeQuestionType(q: BuilderQuestion, type: BuilderQuestionType): BuilderQuestion {
  const carried: BuilderQuestion = { examQuestionId: q.examQuestionId, displayNumber: q.displayNumber, groupId: q.groupId, presentationType: type, text: q.text, marks: q.marks };
  return applyTypeDefaults(carried);
}
export function changePartType(p: BuilderPart, type: BuilderPartType): BuilderPart {
  const carried: BuilderPart = { id: p.id, label: p.label, type, text: p.text, marks: p.marks };
  return applyTypeDefaults(carried) as BuilderPart;
}

// ── Immutable list operations ────────────────────────────────────────────
function insertAt<T>(arr: T[], index: number, value: T): T[] {
  const copy = arr.slice();
  copy.splice(index, 0, value);
  return copy;
}
// Move item at `from` by `delta` (clamped). Returns the same array reference-wise only when no move.
export function moveInArray<T>(arr: T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return arr;
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

// ── Section-level operations (all return a new sections array) ────────────
export const addSection = (sections: BuilderSection[], section = newSection()): BuilderSection[] => [...sections, section];
export const deleteSection = (sections: BuilderSection[], id: string): BuilderSection[] => sections.filter(s => s.id !== id);
export const updateSection = (sections: BuilderSection[], id: string, patch: Partial<BuilderSection>): BuilderSection[] =>
  sections.map(s => (s.id === id ? { ...s, ...patch } : s));
export function moveSection(sections: BuilderSection[], id: string, delta: number): BuilderSection[] {
  const i = sections.findIndex(s => s.id === id);
  return i < 0 ? sections : moveInArray(sections, i, delta);
}

// ── Question-level operations (scoped to one section) ─────────────────────
function mapSection(sections: BuilderSection[], sectionId: string, fn: (s: BuilderSection) => BuilderSection): BuilderSection[] {
  return sections.map(s => (s.id === sectionId ? fn(s) : s));
}
export const addQuestion = (sections: BuilderSection[], sectionId: string, question = newQuestion()): BuilderSection[] =>
  mapSection(sections, sectionId, s => ({ ...s, questions: [...s.questions, question] }));
export const deleteQuestion = (sections: BuilderSection[], sectionId: string, questionId: string): BuilderSection[] =>
  mapSection(sections, sectionId, s => ({ ...s, questions: s.questions.filter(q => q.examQuestionId !== questionId) }));
export const updateQuestion = (sections: BuilderSection[], sectionId: string, questionId: string, patch: Partial<BuilderQuestion>): BuilderSection[] =>
  mapSection(sections, sectionId, s => ({ ...s, questions: s.questions.map(q => (q.examQuestionId === questionId ? { ...q, ...patch } : q)) }));
export function moveQuestion(sections: BuilderSection[], sectionId: string, questionId: string, delta: number): BuilderSection[] {
  return mapSection(sections, sectionId, s => {
    const i = s.questions.findIndex(q => q.examQuestionId === questionId);
    return i < 0 ? s : { ...s, questions: moveInArray(s.questions, i, delta) };
  });
}
// A duplicate gets a fresh internal id (identity is never shared) but keeps the same displayNumber.
export function duplicateQuestion(sections: BuilderSection[], sectionId: string, questionId: string): BuilderSection[] {
  return mapSection(sections, sectionId, s => {
    const i = s.questions.findIndex(q => q.examQuestionId === questionId);
    if (i < 0) return s;
    const copy = cloneQuestionWithNewIds(s.questions[i]);
    return { ...s, questions: insertAt(s.questions, i + 1, copy) };
  });
}
export function moveQuestionToSection(sections: BuilderSection[], fromSectionId: string, questionId: string, toSectionId: string): BuilderSection[] {
  if (fromSectionId === toSectionId) return sections;
  const from = sections.find(s => s.id === fromSectionId);
  const q = from?.questions.find(x => x.examQuestionId === questionId);
  if (!q) return sections;
  return sections.map(s => {
    if (s.id === fromSectionId) return { ...s, questions: s.questions.filter(x => x.examQuestionId !== questionId) };
    if (s.id === toSectionId) return { ...s, questions: [...s.questions, q] };
    return s;
  });
}

// Deep clone a question assigning fresh ids to the question, its parts and fields (used by duplicate
// and by legacy import when ids might collide). Preserves displayNumber, marks, answers, everything.
export function cloneQuestionWithNewIds(q: BuilderQuestion): BuilderQuestion {
  const copy: BuilderQuestion = JSON.parse(JSON.stringify(q));
  copy.examQuestionId = genId("q");
  if (Array.isArray(copy.fields)) copy.fields = copy.fields.map(f => ({ ...f, id: genId("f") }));
  if (Array.isArray(copy.parts)) copy.parts = copy.parts.map(p => ({ ...p, id: genId("p"), fields: Array.isArray(p.fields) ? p.fields.map(f => ({ ...f, id: genId("f") })) : p.fields }));
  return copy;
}

// ── Compound part operations (scoped to one question) ─────────────────────
export function updateQuestionParts(sections: BuilderSection[], sectionId: string, questionId: string, fn: (parts: BuilderPart[]) => BuilderPart[]): BuilderSection[] {
  return updateQuestionBy(sections, sectionId, questionId, q => ({ ...q, parts: fn(Array.isArray(q.parts) ? q.parts : []) }));
}
export function updateQuestionBy(sections: BuilderSection[], sectionId: string, questionId: string, fn: (q: BuilderQuestion) => BuilderQuestion): BuilderSection[] {
  return mapSection(sections, sectionId, s => ({ ...s, questions: s.questions.map(q => (q.examQuestionId === questionId ? fn(q) : q)) }));
}
export const addPart = (parts: BuilderPart[], part = newPart()): BuilderPart[] => [...parts, part];
export const deletePart = (parts: BuilderPart[], id: string): BuilderPart[] => parts.filter(p => p.id !== id);
export const updatePart = (parts: BuilderPart[], id: string, patch: Partial<BuilderPart>): BuilderPart[] => parts.map(p => (p.id === id ? { ...p, ...patch } : p));
export function movePart(parts: BuilderPart[], id: string, delta: number): BuilderPart[] {
  const i = parts.findIndex(p => p.id === id);
  return i < 0 ? parts : moveInArray(parts, i, delta);
}
export function duplicatePart(parts: BuilderPart[], id: string): BuilderPart[] {
  const i = parts.findIndex(p => p.id === id);
  if (i < 0) return parts;
  const src = parts[i];
  const copy: BuilderPart = JSON.parse(JSON.stringify(src));
  copy.id = genId("p");
  if (Array.isArray(copy.fields)) copy.fields = copy.fields.map(f => ({ ...f, id: genId("f") }));
  return insertAt(parts, i + 1, copy);
}

// ── Field operations (multiTrueFalse / tableFill / cliFill / fill / wordBank) ─
export const addField = (fields: BuilderField[], field = newField()): BuilderField[] => [...(fields || []), field];
export const deleteField = (fields: BuilderField[], id: string): BuilderField[] => (fields || []).filter(f => f.id !== id);
export const updateField = (fields: BuilderField[], id: string, patch: Partial<BuilderField>): BuilderField[] => (fields || []).map(f => (f.id === id ? { ...f, ...patch } : f));
export function moveField(fields: BuilderField[], id: string, delta: number): BuilderField[] {
  const i = (fields || []).findIndex(f => f.id === id);
  return i < 0 ? fields : moveInArray(fields, i, delta);
}

// ── tableFill grid operations ─────────────────────────────────────────────
// A tableFill body is a grid: tableHeaders (columns), tableRows (static cell text), and fields that
// mark which (row,column) cells are answerable. Generic over QuestionBody so the same helpers serve a
// top-level tableFill question and a tableFill compound part. Adding/removing rows or columns keeps
// fields and static cells consistent.
export function addTableRow<T extends QuestionBody>(q: T): T {
  const headers = q.tableHeaders || [];
  const rows = q.tableRows || [];
  return { ...q, tableRows: [...rows, headers.map(() => "")] };
}
export function deleteTableRow<T extends QuestionBody>(q: T, rowIndex: number): T {
  const rows = (q.tableRows || []).filter((_, i) => i !== rowIndex);
  const fields = (q.fields || [])
    .filter(f => f.row !== rowIndex)
    .map(f => (typeof f.row === "number" && f.row > rowIndex ? { ...f, row: f.row - 1 } : f));
  return { ...q, tableRows: rows, fields };
}
export function addTableColumn<T extends QuestionBody>(q: T, header = ""): T {
  const headers = [...(q.tableHeaders || []), header];
  const rows = (q.tableRows || []).map(r => [...r, ""]);
  return { ...q, tableHeaders: headers, tableRows: rows };
}
export function deleteTableColumn<T extends QuestionBody>(q: T, colIndex: number): T {
  const headers = (q.tableHeaders || []).filter((_, i) => i !== colIndex);
  const rows = (q.tableRows || []).map(r => r.filter((_, i) => i !== colIndex));
  const fields = (q.fields || [])
    .filter(f => f.column !== colIndex)
    .map(f => (typeof f.column === "number" && f.column > colIndex ? { ...f, column: f.column - 1 } : f));
  return { ...q, tableHeaders: headers, tableRows: rows, fields };
}
// Toggle a cell between static text and an answerable field.
export function toggleTableCell<T extends QuestionBody>(q: T, row: number, column: number): T {
  const fields = q.fields || [];
  const existing = fields.find(f => f.row === row && f.column === column);
  if (existing) return { ...q, fields: fields.filter(f => f !== existing) };
  return { ...q, fields: [...fields, newField({ kind: "text", row, column, correct: "" })] };
}
export const tableFieldAt = (q: QuestionBody, row: number, column: number): BuilderField | undefined =>
  (q.fields || []).find(f => f.row === row && f.column === column);

// ── cliFill placeholder helpers ───────────────────────────────────────────
// CLI templates mark editable blanks as [[fieldId]]. This extracts those ids in order of appearance.
export function cliPlaceholders(cli: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cli || "")) !== null) out.push(m[1].trim());
  return out;
}

// ── Compound mark distribution (display only; the engine does the real split) ─
export function partMarksInfo(q: BuilderQuestion): { mode: "explicit" | "auto"; total: number; questionMarks: number; mismatch: boolean } {
  const parts = q.parts || [];
  const hasAll = parts.length > 0 && parts.every(p => p.marks != null && Number.isFinite(Number(p.marks)));
  const total = parts.reduce((s, p) => s + (p.marks != null ? Number(p.marks) || 0 : 0), 0);
  const questionMarks = Number(q.marks) || 0;
  return { mode: hasAll ? "explicit" : "auto", total, questionMarks, mismatch: hasAll && Math.abs(total - questionMarks) > 1e-9 };
}

// ── Section presets (fill settings only; teacher may edit afterwards) ──────
export type SectionPreset = { id: string; label: string; apply: () => Partial<BuilderSection> };
export const SECTION_PRESETS: SectionPreset[] = [
  { id: "core-2026", label: "أساس 2026", apply: () => ({ title: "أنظمة حوسبة — أساس", gradingPolicy: "capScore", maxMarks: 60, requiredAnswers: null, answerUnit: "question" }) },
  { id: "infra-2026", label: "بنى تحتية 2026", apply: () => ({ title: "البنى التحتية للاتصالات", gradingPolicy: "firstNAnswered", answerUnit: "part", requiredAnswers: 8, maxMarks: 40 }) },
  { id: "infra-2025", label: "بنى تحتية 2025", apply: () => ({ title: "البنى التحتية للاتصالات", gradingPolicy: "firstNAnswered", answerUnit: "part", requiredAnswers: 10, maxMarks: 40 }) }
];
export function applyPreset(sections: BuilderSection[], sectionId: string, presetId: string): BuilderSection[] {
  const preset = SECTION_PRESETS.find(p => p.id === presetId);
  return preset ? updateSection(sections, sectionId, preset.apply()) : sections;
}

// ── Arabic explanation of a section's grading rule (shown under the controls) ─
export function gradingRuleExplanation(section: Pick<BuilderSection, "gradingPolicy" | "maxMarks" | "requiredAnswers" | "answerUnit">): string {
  if (section.gradingPolicy === "capScore") {
    return "تُصحَّح كل الأسئلة، ويُحتسب مجموع العلامات حتى الحد الأقصى" + (section.maxMarks != null ? " (" + section.maxMarks + " علامة)" : "") + "، ولا يتجاوز هذا الحد مهما زادت الإجابات الصحيحة.";
  }
  if (section.gradingPolicy === "firstNAnswered") {
    const unit = section.answerUnit === "part" ? "بنود" : "أسئلة";
    const n = section.requiredAnswers != null ? section.requiredAnswers : "؟";
    return "سيتم تصحيح أول " + n + " " + unit + " أجاب عنها الطالب حسب ترتيب ظهورها؛ وتبقى الإجابات الإضافية محفوظة لكنها لا تدخل في العلامة.";
  }
  return "تُصحَّح جميع الأسئلة ويُجمع مجموع علاماتها.";
}

// ── Legacy exam ⇄ structured exam ─────────────────────────────────────────
// Non-destructive conversion of a legacy flat exam into a single structured section, preserving every
// question id, answer, marks, image and metadata. Called only when the teacher explicitly asks — a
// legacy exam is never auto-converted merely by opening it.
export function legacyToStructured(exam: Record<string, unknown>): StructuredExam {
  const clone = JSON.parse(JSON.stringify(exam || {})) as Record<string, unknown>;
  const legacyQuestions = Array.isArray(clone.questions) ? (clone.questions as BuilderQuestion[]) : [];
  const section: BuilderSection = {
    id: genId("sec"),
    title: "القسم الأول",
    instructions: "",
    maxMarks: null,
    gradingPolicy: "all",
    requiredAnswers: null,
    answerUnit: "question",
    stimuli: {},
    questions: legacyQuestions
  };
  const out: StructuredExam = { ...(clone as StructuredExam), sections: [section] };
  // sections[].questions[] is the ONLY canonical question tree now — remove the top-level questions[]
  // so there is no stale duplicate copy to accidentally assign/grade after the teacher edits the
  // structured questions. Everything else (metadata, theme, unknown fields, ids/answers/marks/images
  // inside the questions) is preserved.
  delete (out as { questions?: unknown }).questions;
  return out;
}

// Compute total marks across all sections (each section's maxMarks cap when set, else the sum of its
// question marks). Mirrors the backend examStats() so the saved totalMarks is consistent.
export function computeTotalMarks(exam: StructuredExam): number {
  return (exam.sections || []).reduce((total, s) => {
    const sum = (s.questions || []).reduce((a, q) => a + (Number(q.marks) || 0), 0);
    return total + (s.maxMarks != null ? Number(s.maxMarks) || 0 : sum);
  }, 0);
}
export function countQuestions(exam: StructuredExam): number {
  return (exam.sections || []).reduce((n, s) => n + (s.questions || []).length, 0);
}

// Prepare a structured exam for saving: refresh totals/marks and timestamps without dropping unknown
// fields. The saved object keeps `sections` canonical.
export function toSavedStructuredExam(exam: StructuredExam): StructuredExam {
  const now = new Date().toISOString();
  const out: StructuredExam = { ...exam, sections: exam.sections, totalMarks: computeTotalMarks(exam), updatedAt: now, createdAt: exam.createdAt || now };
  // Never persist a stale top-level questions[] alongside canonical sections[].
  delete (out as { questions?: unknown }).questions;
  return out;
}

// A copy for the "duplicate exam" flow: new examId, fresh question/part/field ids, preserved section
// ids (they are not global storage keys), preserved everything else.
export function structuredExamCopy(exam: StructuredExam): StructuredExam {
  const now = new Date().toISOString();
  const clone = JSON.parse(JSON.stringify(exam)) as StructuredExam;
  return {
    ...clone,
    examId: "EXAM-" + Date.now(),
    title: (exam.title || "امتحان") + " - نسخة",
    createdAt: now,
    updatedAt: now,
    sections: (clone.sections || []).map(s => ({ ...s, questions: (s.questions || []).map(cloneQuestionWithNewIds) }))
  };
}

// ── MCQ option operations that keep the correct answer pointing at the SAME option ──
// answer.correctOptionIndex is a positional pointer, so moving/deleting options must move the pointer
// with the option it refers to — otherwise the official answer silently changes.
function currentCorrectIndex(node: QuestionBody): number {
  const v = Number((node.answer as { correctOptionIndex?: unknown })?.correctOptionIndex);
  return Number.isInteger(v) ? v : -1;
}
export function moveMcqOption(node: QuestionBody, from: number, delta: number): Partial<QuestionBody> {
  const options = node.options || [];
  const to = from + delta;
  if (from < 0 || from >= options.length || to < 0 || to >= options.length) return {};
  const nextOptions = moveInArray(options, from, delta);
  const correct = currentCorrectIndex(node);
  let nextCorrect = correct;
  if (correct === from) nextCorrect = to; // the correct option itself moved
  else if (from < correct && to >= correct) nextCorrect = correct - 1; // an option jumped past it downward
  else if (from > correct && to <= correct) nextCorrect = correct + 1; // an option jumped past it upward
  return { options: nextOptions, answer: nextCorrect >= 0 ? { correctOptionIndex: nextCorrect } : {} };
}
export function deleteMcqOption(node: QuestionBody, index: number): Partial<QuestionBody> {
  const options = node.options || [];
  if (index < 0 || index >= options.length) return {};
  const nextOptions = options.filter((_, i) => i !== index);
  const correct = currentCorrectIndex(node);
  let answer: Record<string, unknown>;
  if (correct === index) answer = {}; // deleting the correct option UNSETS the answer (never silently pick another)
  else if (correct > index) answer = { correctOptionIndex: correct - 1 };
  else if (correct >= 0) answer = { correctOptionIndex: correct };
  else answer = {};
  return { options: nextOptions, answer };
}

// ── Answer synchronisation for the sequence / matching grade paths ────────
// fillBlank / wordBank / ordering are graded by the engine via answer = { mode:"exactSequence",
// values:[...] } compared per field position. The editor stores each blank's correct value on the
// field (field.correct) for a clean UX; this rebuilds the canonical answer from the fields' order so
// the saved object is always gradeable without a separate transform.
export function syncSequenceAnswer(fields: BuilderField[]): { mode: string; values: string[] } {
  return { mode: "exactSequence", values: (fields || []).map(f => String(f.correct ?? "")) };
}

// matching is graded by the engine via the table path: a markdown 2-column table in question.text,
// per-row dropdown options (field.options), and answer.text as a "left=right;..." pair map. This
// derives all three from the teacher's pairs so the object stays canonical and gradeable.
export type MatchPair = { left: string; right: string };
export function buildMatchingPatch(pairs: MatchPair[], headers: [string, string] = ["العمود أ", "العمود ب"]): Partial<BuilderQuestion> {
  const rights = Array.from(new Set(pairs.map(p => p.right).filter(Boolean)));
  const tableLines = ["| " + headers[0] + " | " + headers[1] + " |", "| --- | --- |", ...pairs.map(p => "| " + p.left + " |  |")];
  const fields: BuilderField[] = pairs.map((p, i) => ({ id: "m" + i, label: p.left, kind: "select", options: rights.map(r => ({ text: r })), correct: p.right }));
  const answer = { text: pairs.filter(p => p.left && p.right).map(p => p.left + "=" + p.right).join(";") };
  return { text: tableLines.join("\n"), fields, answer };
}
// Recover the teacher's editable pairs from a matching question (fields carry label=left, correct=right).
export function matchingPairs(q: QuestionBody): MatchPair[] {
  return (q.fields || []).map(f => ({ left: String(f.label ?? ""), right: String(f.correct ?? "") }));
}

// Preview-only scrub: deep-copies a structured exam and removes teacher-side answer keys so the
// student-preview components never even hold them. This is a convenience for the in-builder preview on
// the teacher's own screen — the AUTHORITATIVE student payload is still stripped server-side by
// api/src/lib/student-exam-sanitize.js, which this does not touch or replace.
export function stripAnswersForPreview(exam: StructuredExam): StructuredExam {
  const clone = JSON.parse(JSON.stringify(exam)) as StructuredExam;
  const scrubOption = (o: Record<string, unknown>) => { delete o.correct; delete o.isCorrect; };
  const scrubField = (f: Record<string, unknown>) => { delete f.correct; delete f.isCorrect; if (Array.isArray(f.options)) (f.options as Record<string, unknown>[]).forEach(scrubOption); };
  const scrubNode = (n: Record<string, unknown> | null | undefined) => {
    if (!n || typeof n !== "object") return;
    delete n.answer; delete n.teacherNote; delete n.aiInstruction; delete n.hint;
    if (Array.isArray(n.fields)) (n.fields as Record<string, unknown>[]).forEach(scrubField);
    if (Array.isArray(n.options)) (n.options as Record<string, unknown>[]).forEach(scrubOption);
    if (Array.isArray(n.parts)) (n.parts as Record<string, unknown>[]).forEach(scrubNode);
  };
  (clone.sections || []).forEach(s => (s.questions || []).forEach(q => scrubNode(q as unknown as Record<string, unknown>)));
  return clone;
}

// Convenience re-exports so callers import ids/labels from one place.
export type { AnswerUnit, GradingPolicy, Stimulus };
