// UX-6c — client model for the Question Bank management page. Mirrors the canonical bank question schema served
// by /api/bank-questions (the SAME store bank-import-action commits to and the builder selects from) and the
// server's validation rules, so the form can reject a question before any request and the server stays the authority.

export type BankSection = "BASIC" | "INFRASTRUCTURE";
export type BankPresentationType = "multipleChoice" | "fillBlank" | "wordBank" | "open";
export type BankSourceKind = "official" | "import" | "manual";

export type BankQuestionRow = {
  id: string;
  sourceId: string;
  sourceKind: BankSourceKind;
  official: boolean;
  questionNumber: string;
  section: BankSection | "";
  topic: string;
  difficulty: number | null;
  difficultyLabel: string;
  type: string;
  presentationType: BankPresentationType;
  text: string;
  options: { value: string; text: string }[];
  fields: BankField[];
  wordBank: string[];
  answer: Record<string, unknown>;
  hasImage: boolean;
  reviewStatus: string;
  createdAt: string;
  updatedAt: string;
};

// A blank of a fill-blank / word-bank question: its label and its expected value (teacher-side; the server writes
// the canonical field with kind "text" / "select" and the exactSequence answer from these).
export type BankField = { id: string; label: string; correct: string };

// The editable payload. Each presentation type owns ONE structure and switching type rebuilds it whole:
//   multipleChoice → options + answer.correctOptionValue     fillBlank → fields
//   wordBank       → fields + wordBank (the choices)          open      → answer.values (accepted answers)
export type BankQuestionInput = {
  section: BankSection;
  topic: string;
  difficulty: number;
  presentationType: BankPresentationType;
  text: string;
  options: { value: string; text: string }[];
  fields: BankField[];
  wordBank: string[];
  answer: { correctOptionValue?: string; values?: string[] };
};

export const SECTION_LABELS: Record<BankSection, string> = { BASIC: "الأساسي", INFRASTRUCTURE: "البنى التحتية" };
export const TYPE_LABELS: Record<BankPresentationType, string> = { multipleChoice: "اختيار من متعدد", fillBlank: "إكمال فراغ", wordBank: "بنك كلمات", open: "سؤال مفتوح" };
export const SOURCE_LABELS: Record<BankSourceKind, string> = { official: "رسمي", import: "مستورد", manual: "يدوي" };
export const PRESENTATION_TYPES: BankPresentationType[] = ["multipleChoice", "fillBlank", "wordBank", "open"];
export const SECTIONS: BankSection[] = ["BASIC", "INFRASTRUCTURE"];

export function sectionLabel(section: string): string { return (SECTION_LABELS as Record<string, string>)[section] || section || "—"; }
export function typeLabel(type: string): string { return (TYPE_LABELS as Record<string, string>)[type] || type || "—"; }
export function sourceLabel(kind: string): string { return (SOURCE_LABELS as Record<string, string>)[kind] || kind; }

export function emptyInput(): BankQuestionInput {
  return { section: "BASIC", topic: "", difficulty: 3, presentationType: "multipleChoice", text: "", options: [{ value: "a", text: "" }, { value: "b", text: "" }], fields: [], wordBank: [], answer: { correctOptionValue: "" } };
}

let fieldSeq = 0;
export function newField(): BankField { fieldSeq += 1; return { id: "f" + Date.now().toString(36) + fieldSeq.toString(36), label: "", correct: "" }; }

/** The structure a type owns, rebuilt from whatever the previous type left (only the compatible part is carried). */
export function structureForType(input: BankQuestionInput, presentationType: BankPresentationType): BankQuestionInput {
  const blanks = input.fields.length ? input.fields.map(f => ({ ...f })) : [newField()];
  switch (presentationType) {
    case "multipleChoice":
      return { ...input, presentationType, options: input.options.length >= 2 ? input.options : [{ value: "a", text: "" }, { value: "b", text: "" }], fields: [], wordBank: [], answer: { correctOptionValue: input.answer.correctOptionValue || "" } };
    case "fillBlank":
      return { ...input, presentationType, options: [], fields: blanks, wordBank: [], answer: {} };
    case "wordBank":
      return { ...input, presentationType, options: [], fields: blanks, wordBank: input.wordBank.slice(), answer: {} };
    default:
      return { ...input, presentationType, options: [], fields: [], wordBank: [], answer: { values: input.answer.values || [] } };
  }
}

/** A per-form idempotency key: the server derives the manual question id from it, so a retried create (after a
 *  failure whose first half already landed) reconciles instead of storing a second copy. */
export function newRequestKey(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10).padEnd(8, "0");
}

/** The editable projection of a stored row (what the edit form starts from). */
export function inputFromRow(row: BankQuestionRow): BankQuestionInput {
  const values = Array.isArray(row.answer?.values) ? (row.answer.values as unknown[]).map(v => String(v)) : [];
  const t = row.presentationType;
  const blanks = t === "fillBlank" || t === "wordBank";
  return {
    section: row.section === "INFRASTRUCTURE" ? "INFRASTRUCTURE" : "BASIC",
    topic: row.topic,
    difficulty: row.difficulty && row.difficulty >= 1 && row.difficulty <= 5 ? row.difficulty : 3,
    presentationType: t,
    text: row.text,
    options: t === "multipleChoice"
      ? (row.options.length >= 2 ? row.options.map(o => ({ value: o.value, text: o.text })) : [{ value: "a", text: "" }, { value: "b", text: "" }])
      : [],
    // a stored blank's expected value comes from the field; older multiField rows without one fall back to the
    // answer sequence at the same position (still shown so the teacher can confirm it)
    fields: blanks ? (row.fields || []).map((f, i) => ({ id: f.id || "f" + (i + 1), label: f.label || "", correct: f.correct || values[i] || "" })) : [],
    wordBank: t === "wordBank" ? (row.wordBank || []).slice() : [],
    answer: t === "multipleChoice"
      ? { correctOptionValue: String(row.answer?.correctOptionValue ?? values[0] ?? "") }
      : t === "open" ? { values } : {}
  };
}

/** Same rules as the server (bank-questions.js validateQuestionInput); messages identical so the UI can show them. */
export function validateInput(input: BankQuestionInput): string[] {
  const errors: string[] = [];
  if (!input.text.trim()) errors.push("نص السؤال مطلوب.");
  if (!SECTIONS.includes(input.section)) errors.push("القسم يجب أن يكون BASIC أو INFRASTRUCTURE.");
  if (!input.topic.trim()) errors.push("الموضوع مطلوب.");
  if (!Number.isInteger(input.difficulty) || input.difficulty < 1 || input.difficulty > 5) errors.push("الصعوبة يجب أن تكون رقمًا من 1 إلى 5.");
  if (!PRESENTATION_TYPES.includes(input.presentationType)) errors.push("نوع السؤال غير معروف.");
  if (input.presentationType === "multipleChoice") {
    if (input.options.length < 2) errors.push("سؤال الاختيار من متعدد يحتاج خيارين على الأقل.");
    input.options.forEach((o, i) => { if (!o.text.trim()) errors.push("الخيار " + (i + 1) + " بلا نص."); });
    const correct = String(input.answer.correctOptionValue ?? "").trim();
    if (!correct || !input.options.some(o => o.value === correct)) errors.push("حدّد الإجابة الصحيحة من بين الخيارات.");
  } else if (input.presentationType === "fillBlank" || input.presentationType === "wordBank") {
    if (input.fields.length < 1) errors.push("أضف فراغًا واحدًا على الأقل.");
    const words = input.presentationType === "wordBank" ? distinctWords(input.wordBank) : [];
    input.fields.forEach((f, i) => {
      const correct = f.correct.trim();
      if (!correct) errors.push("الفراغ " + (i + 1) + " بلا إجابة صحيحة.");
      else if (input.presentationType === "wordBank" && words.length && !words.includes(correct)) errors.push("الإجابة الصحيحة للفراغ " + (i + 1) + " غير موجودة في بنك الكلمات.");
    });
    if (input.presentationType === "wordBank" && words.length < 2) errors.push("بنك الكلمات يحتاج كلمتين مختلفتين على الأقل.");
  }
  return errors;
}

export function distinctWords(words: string[]): string[] {
  return Array.from(new Set((words || []).map(w => String(w ?? "").trim()).filter(Boolean)));
}
export function parseWordBank(text: string): string[] {
  return distinctWords(text.split(/\r?\n|\|/));
}

export type BankFilters = { q: string; section: string; type: string; difficulty: string; source: string };
export const EMPTY_FILTERS: BankFilters = { q: "", section: "", type: "", difficulty: "", source: "" };

/** Pure client-side filtering over the loaded list (no request): free text over question text / topic / id. */
export function filterRows(rows: BankQuestionRow[], f: BankFilters): BankQuestionRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter(r =>
    (!f.section || r.section === f.section) &&
    (!f.type || r.presentationType === f.type) &&
    (!f.difficulty || String(r.difficulty ?? "") === f.difficulty) &&
    (!f.source || r.sourceKind === f.source) &&
    (!q || r.text.toLowerCase().includes(q) || r.topic.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
  );
}

export type BankSummary = {
  total: number;
  editable: number;
  official: number;
  bySection: Record<string, number>;
  byType: Record<string, number>;
  byDifficulty: Record<string, number>;
  byTopic: { topic: string; count: number }[];
  pendingClassification: number;
};

/** Counts derived from the loaded list — the overview needs no second request. Zero counts stay 0, never blank. */
export function summarize(rows: BankQuestionRow[]): BankSummary {
  const bySection: Record<string, number> = {}, byType: Record<string, number> = {}, byDifficulty: Record<string, number> = {}, topicMap: Record<string, number> = {};
  let official = 0, pending = 0;
  for (const r of rows) {
    bySection[r.section || "—"] = (bySection[r.section || "—"] || 0) + 1;
    byType[r.presentationType] = (byType[r.presentationType] || 0) + 1;
    const d = r.difficulty === null ? "—" : String(r.difficulty);
    byDifficulty[d] = (byDifficulty[d] || 0) + 1;
    if (r.topic) topicMap[r.topic] = (topicMap[r.topic] || 0) + 1;
    if (r.official) official += 1;
    if (r.reviewStatus === "pending-classification") pending += 1;
  }
  const byTopic = Object.entries(topicMap).map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
  return { total: rows.length, editable: rows.length - official, official, bySection, byType, byDifficulty, byTopic, pendingClassification: pending };
}

/** Distinct topics present in the bank (for the topic filter and the form's datalist). */
export function distinctTopics(rows: BankQuestionRow[]): string[] {
  return Array.from(new Set(rows.map(r => r.topic).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function correctOptionText(row: BankQuestionRow): string {
  const value = String(row.answer?.correctOptionValue ?? (Array.isArray(row.answer?.values) ? (row.answer.values as unknown[])[0] : "") ?? "");
  return row.options.find(o => o.value === value)?.text || "";
}
