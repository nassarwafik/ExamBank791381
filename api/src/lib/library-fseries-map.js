// Converts F-series questions (either DOM q-cards or JSON question objects) into the app's standard
// ExamQuestion shape. Every rule below fires only when the mapping is certain; anything unproven is
// marked requiresManualReview:true with an empty answer, never guessed - the same "unknown stays
// unknown" discipline as normalizeDetectedQuestion.js and assignment-grading.js's manual-review
// fallback. Answer shapes are chosen to match exactly what assignment-grading.js grades and what
// StudentQuestionCard.tsx renders (verified by direct reading), so nothing can look right in the UI
// yet grade wrong.

// Same text normalization assignment-grading.js's clean() uses, so an option-value match here means
// the same thing at grading time.
function clean(value) {
  return String(value == null ? "" : value)
    .normalize("NFKC")
    .replace(/[ـ]/g, "")
    .replace(/[،,]/g, ",")
    .replace(/[؛;]/g, ";")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function baseQuestion(examId, ordinal, sourceId) {
  const qid = examId + "-Q" + String(ordinal).padStart(2, "0");
  return {
    examQuestionId: qid,
    origin: "imported",
    sourceId: examId,
    sourceQuestionId: String(sourceId),
    section: "BASIC",
    topic: "OTHER_NETWORKING",
    secondaryTopics: [],
    difficulty: 2,
    difficultyLabel: "",
    familyKey: qid,
    hasCLI: false,
    requiresCalculation: false,
    presentationType: "open",
    marks: 0,
    locked: false,
    text: "",
    textHtml: "",
    options: [],
    fields: [],
    parts: [],
    answer: {},
    hint: "",
    teacherNote: "",
    aiInstruction: "",
    wasModified: false,
    requiresManualReview: false,
    image: { exists: false, visible: false, origin: null, assets: [], prompt: null },
    history: [],
    redoStack: []
  };
}

function withManualReview(question, reason) {
  return {
    ...question,
    requiresManualReview: true,
    teacherNote: reason || "مستورد — يحتاج مراجعة يدوية قبل التصحيح الآلي."
  };
}

// radioGroup -> multipleChoice. answer.correctOptionIndex is set only when the answer key's value
// matches exactly one option (by value or by cleaned text); otherwise the question is kept as
// multipleChoice but flagged for manual review with an empty answer.
function mapRadioGroup(question, field, answerValue) {
  const options = field.options.map((option, index) => ({ value: String(index), text: option.text }));
  const result = { ...question, presentationType: "multipleChoice", options };

  if (answerValue == null || answerValue === "") {
    return withManualReview(result, "لا يوجد مفتاح إجابة لهذا السؤال في المصدر.");
  }

  const target = clean(answerValue);
  let matchIndex = -1;
  field.options.forEach((option, index) => {
    if (clean(option.value) === target || clean(option.text) === target) matchIndex = index;
  });

  if (matchIndex < 0) {
    return withManualReview(result, "قيمة الإجابة في المصدر لا تطابق أي خيار ظاهر.");
  }
  return { ...result, answer: { correctOptionIndex: matchIndex } };
}

// A single free-text answer -> presentationType "open" (NOT fillBlank): StudentQuestionCard.tsx
// renders "open" as a <textarea> graded by answer.text, whereas "fillBlank" would route to the
// word-bank dropdown path, which is wrong for a free-typed answer with no option pool.
function mapSingleText(question, answerValue) {
  const result = { ...question, presentationType: "open" };
  if (answerValue == null || answerValue === "") {
    return withManualReview(result, "لا يوجد مفتاح إجابة لهذا السؤال في المصدر.");
  }
  return { ...result, answer: { text: String(answerValue) } };
}

// A per-row control table -> a "matching"/table question graded by gradeTable: text carries a
// markdown table (one row per item) and answer.text is "label=value؛..." keyed by row label, which
// is exactly the shape gradeTable's pairMap() reads. Requires every row's answer to be known; if
// any row's answer is missing, the whole question is flagged for review (a partially-keyed table
// would silently grade the missing rows as wrong).
function mapControlTable(question, field, answerMap, headerLabels) {
  const rows = field.rows;
  const values = rows.map(row => answerMap.get(row.controlId));
  const allKnown = values.every(value => value != null && value !== "");

  const headers = headerLabels || ["البند", "الإجابة"];
  const tableLines = ["| " + headers[0] + " | " + headers[1] + " |", "| --- | --- |"]
    .concat(rows.map(row => "| " + row.label + " | |"));
  const text = question.text + "\n\n" + tableLines.join("\n");

  const fields = rows.map((row, index) => ({
    id: row.controlId || "f" + index,
    label: row.label,
    order: index,
    kind: "select",
    options: (row.options || []).map(value => ({ value }))
  }));

  const result = { ...question, presentationType: "matching", text, fields };

  if (!allKnown) {
    return withManualReview(result, "بعض صفوف الجدول بلا مفتاح إجابة في المصدر.");
  }

  const answerText = rows.map((row, index) => row.label + "=" + values[index]).join("؛ ");
  return { ...result, answer: { text: answerText } };
}

// Maps one parsed q-card (from qcard-dom-extract.js) using an answer Map (from
// library-answer-resolvers.js). field===null (multi-blank / unrecognized shapes) becomes an open,
// manual-review question with its full text preserved - never dropped, never guessed.
// Builds an image block from a card's inline images (base64, later externalized by the build step).
function cardImageBlock(card) {
  const images = Array.isArray(card.images) ? card.images : [];
  if (!images.length) return { exists: false, visible: false, origin: null, assets: [], prompt: null };
  return {
    exists: true, visible: true, origin: "uploaded",
    assets: images.map(img => ({ id: img.id, origin: "uploaded", contentType: img.contentType, dataUrl: "data:" + img.contentType + ";base64," + img.base64 })),
    prompt: null
  };
}

function mapQCard(card, { examId, ordinal, marks, answerMap }) {
  const question = { ...baseQuestion(examId, ordinal, card.id), text: card.text, marks, image: cardImageBlock(card) };

  if (!card.field) {
    return withManualReview({ ...question, presentationType: "open" }, "شكل سؤال متعدد الأجزاء غير قابل للتحويل الحتمي — يحتاج مراجعة.");
  }

  if (card.field.kind === "radioGroup") {
    return mapRadioGroup(question, card.field, answerMap.get(card.field.name || card.id));
  }
  if (card.field.kind === "singleText") {
    return mapSingleText(question, answerMap.get(card.field.fieldId || card.id));
  }
  if (card.field.kind === "controlTable") {
    return mapControlTable(question, card.field, answerMap);
  }
  // openText (textarea) - a genuinely open question with no auto-gradable key.
  return withManualReview({ ...question, presentationType: "open" }, "سؤال مفتوح بلا مفتاح إجابة في المصدر.");
}

module.exports = { clean, baseQuestion, withManualReview, mapRadioGroup, mapSingleText, mapControlTable, mapQCard };
