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
  fields: { id: string; label: string }[];
  answer: Record<string, unknown>;
  hasImage: boolean;
  reviewStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type BankQuestionInput = {
  section: BankSection;
  topic: string;
  difficulty: number;
  presentationType: BankPresentationType;
  text: string;
  options: { value: string; text: string }[];
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
  return { section: "BASIC", topic: "", difficulty: 3, presentationType: "multipleChoice", text: "", options: [{ value: "a", text: "" }, { value: "b", text: "" }], answer: { correctOptionValue: "" } };
}

/** The editable projection of a stored row (what the edit form starts from). */
export function inputFromRow(row: BankQuestionRow): BankQuestionInput {
  const values = Array.isArray(row.answer?.values) ? (row.answer.values as unknown[]).map(v => String(v)) : [];
  return {
    section: row.section === "INFRASTRUCTURE" ? "INFRASTRUCTURE" : "BASIC",
    topic: row.topic,
    difficulty: row.difficulty && row.difficulty >= 1 && row.difficulty <= 5 ? row.difficulty : 3,
    presentationType: row.presentationType,
    text: row.text,
    options: row.presentationType === "multipleChoice"
      ? (row.options.length >= 2 ? row.options.map(o => ({ value: o.value, text: o.text })) : [{ value: "a", text: "" }, { value: "b", text: "" }])
      : [],
    answer: row.presentationType === "multipleChoice"
      ? { correctOptionValue: String(row.answer?.correctOptionValue ?? values[0] ?? "") }
      : { values }
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
  }
  return errors;
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
