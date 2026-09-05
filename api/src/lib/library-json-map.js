// Converts the JSON-defined question objects of F03 (const EXAM = {s1,s2}) and F06
// (const baseQ/infraQ/graphicQ = [...]) - both of which store real, structured question data rather
// than DOM - into ExamQuestions. Reuses the same certainty discipline and answer shapes as
// library-fseries-map.js: a rule fires only when the answer is unambiguous, otherwise the question
// is kept with the right presentationType but flagged requiresManualReview with an empty answer.

const { baseQuestion, withManualReview, clean } = require("./library-fseries-map");

const IMAGE_MIME = "image/png";

function stripInlineTags(value) {
  return String(value == null ? "" : value).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Attaches base64 images (F06's `images` map: key -> raw base64) referenced by a question's
// `image`/`images` fields, as data URLs. NOTE: base64 is inlined here only for this offline build;
// Phase 2 will move these to Azure Blob assets and store blobName references instead (see plan).
function imageBlock(imageKeys, imagesMap) {
  const keys = (Array.isArray(imageKeys) ? imageKeys : [imageKeys]).filter(Boolean);
  const assets = keys
    .map(key => imagesMap && imagesMap[key])
    .filter(Boolean)
    .map((base64, index) => ({
      id: "img-" + index,
      origin: "uploaded",
      contentType: IMAGE_MIME,
      dataUrl: "data:" + IMAGE_MIME + ";base64," + base64
    }));
  return assets.length
    ? { exists: true, visible: true, origin: "uploaded", assets, prompt: null }
    : { exists: false, visible: false, origin: null, assets: [], prompt: null };
}

function mcFromOptions(question, options, correctValue) {
  const mapped = options.map((option, index) => ({
    value: String(index),
    text: stripInlineTags(typeof option === "string" ? option : option.t)
  }));
  const result = { ...question, presentationType: "multipleChoice", options: mapped };

  if (correctValue === undefined || correctValue === null || correctValue === "") {
    return withManualReview(result, "لا يوجد مفتاح إجابة في المصدر.");
  }

  // F03 answer is a numeric index string ("0".."3"); F06 answer ("correct") is an option value
  // ("a"/"1"/...). Resolve both: try index first, then match against each option's original value.
  let matchIndex = -1;
  const numeric = Number(correctValue);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric < options.length && /^\d+$/.test(String(correctValue))) {
    matchIndex = numeric;
  }
  else {
    options.forEach((option, index) => {
      const optionValue = typeof option === "string" ? String(index) : option.v;
      if (clean(optionValue) === clean(correctValue)) matchIndex = index;
    });
  }

  if (matchIndex < 0) {
    return withManualReview(result, "قيمة الإجابة في المصدر لا تطابق أي خيار.");
  }
  return { ...result, answer: { correctOptionIndex: matchIndex } };
}

function openFromText(question, answers) {
  const list = Array.isArray(answers) ? answers : answers != null ? [answers] : [];
  const result = { ...question, presentationType: "open" };
  if (!list.length || list[0] === "") {
    return withManualReview(result, "لا يوجد مفتاح إجابة في المصدر.");
  }
  const mapped = { ...result, answer: { text: String(list[0]) } };
  // assignment-grading.js's text path grades a single exact answer.text; a source that accepts
  // several equally-correct strings can't be fully represented, so flag it rather than silently
  // mark the other accepted answers wrong.
  if (list.length > 1) {
    return withManualReview(mapped, "المصدر يقبل عدة إجابات نصية؛ التصحيح الآلي الحالي يقارن إجابة واحدة فقط.");
  }
  return mapped;
}

// A per-row question (labels/statements/fields + ordered answers) -> a table graded by gradeTable.
// rowLabels and answers must be equal-length and every answer present, else it's flagged.
function tableFromRows(question, rowLabels, answers, rowOptions) {
  const labels = rowLabels.map(stripInlineTags);
  const headers = ["البند", "الإجابة"];
  const tableLines = ["| " + headers[0] + " | " + headers[1] + " |", "| --- | --- |"]
    .concat(labels.map(label => "| " + label + " | |"));
  const text = question.text + "\n\n" + tableLines.join("\n");

  const fields = labels.map((label, index) => ({
    id: "f" + index,
    label,
    order: index,
    kind: "select",
    options: (rowOptions && rowOptions[index] ? rowOptions[index] : []).map(value => ({ value }))
  }));

  const result = { ...question, presentationType: "matching", text, fields };

  const known = Array.isArray(answers) && answers.length === labels.length && answers.every(a => a != null && a !== "");
  if (!known) {
    return withManualReview(result, "بعض بنود السؤال بلا مفتاح إجابة في المصدر.");
  }

  const answerText = labels.map((label, index) => label + "=" + answers[index]).join("؛ ");
  return { ...result, answer: { text: answerText } };
}

// F03 renders each question as a <div class="q-card" data-qid="..."> that may contain an inline
// data:-URI <img>. Builds a qid -> {contentType, base64} map so images link to questions by their
// own id (deterministic, no positional guessing) - the EXAM JSON object itself carries no image
// reference, so this DOM pass is the only correct way to attach F03 diagrams.
function extractF03ImagesByQid(html) {
  const map = new Map();
  const cardRegex = /<div class='q-card'[^>]*data-qid='([^']*)'[^>]*>([\s\S]*?)(?=<div class='q-card'|<\/div>\s*<\/div>\s*<\/section>|$)/g;
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    const imgMatch = /<img[^>]*src=['"]data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)['"]/.exec(match[2]);
    if (imgMatch) map.set(match[1], { contentType: imgMatch[1], base64: imgMatch[2] });
  }
  return map;
}

function imageBlockFromF03(entry) {
  if (!entry) return { exists: false, visible: false, origin: null, assets: [], prompt: null };
  return {
    exists: true, visible: true, origin: "uploaded",
    assets: [{ id: "img-0", origin: "uploaded", contentType: entry.contentType, dataUrl: "data:" + entry.contentType + ";base64," + entry.base64 }],
    prompt: null
  };
}

// F03: one EXAM question object. imagesByQid (from extractF03ImagesByQid) attaches the diagram when
// this question's id has one.
function mapF03Question(raw, { examId, ordinal, marks, imagesByQid }) {
  const text = stripInlineTags(raw.text) + (raw.after ? " " + stripInlineTags(raw.after) : "");
  const image = imageBlockFromF03(imagesByQid && imagesByQid.get(raw.id));
  const q = { ...baseQuestion(examId, ordinal, raw.id), text, marks, image };

  switch (raw.type) {
    case "mcq":
    case "mcq_img":
      return mcFromOptions(q, raw.options || [], raw.answer);
    case "text":
      return openFromText(q, raw.answers);
    case "multi_text2":
    case "multi_text2_img":
      return tableFromRows(q, raw.labels || [], raw.answers);
    case "tf2":
    case "tf3":
      return tableFromRows(q, raw.statements || [], raw.answers, (raw.statements || []).map(() => ["صحيح", "غير صحيح"]));
    default:
      return withManualReview({ ...q, presentationType: "open" }, "نوع سؤال غير مدعوم للتحويل الحتمي: " + raw.type);
  }
}

// F06: one baseQ/infraQ/graphicQ question object. imagesMap is the file's `images` object.
function mapF06Question(raw, { examId, ordinal, marks, imagesMap }) {
  const q = {
    ...baseQuestion(examId, ordinal, raw.id),
    text: stripInlineTags(raw.text),
    marks,
    image: imageBlock(raw.images || raw.image, imagesMap)
  };

  switch (raw.type) {
    case "radio":
    case "radioImage":
      return mcFromOptions(q, raw.options || [], raw.correct);
    case "text":
    case "textImage":
      return openFromText(q, raw.acceptAny);
    case "multiText":
    case "multiTextImage":
    case "multiTextImages":
      return tableFromRows(q, (raw.fields || []).map(f => f.label), raw.accept);
    case "multiSelect":
      return tableFromRows(q, (raw.fields || []).map(f => f.label), raw.accept, (raw.fields || []).map(() => ["صحيح", "غير صحيح"]));
    case "multiSelectCustomImage":
      return tableFromRows(q, (raw.fields || []).map(f => f.label), raw.accept, (raw.fields || []).map(f => (f.options || []).map(o => stripInlineTags(o.t))));
    case "combo":
    case "comboImage":
      return withManualReview({ ...q, presentationType: "open" }, "سؤال متعدد الأجزاء مختلط (radio+text+select) لا يُمثَّل بوحدة تصحيح واحدة — يحتاج مراجعة.");
    case "manualImages":
      return withManualReview({ ...q, presentationType: "open" }, "سؤال فحص يدوي في المصدر (mark=يدوي).");
    default:
      return withManualReview({ ...q, presentationType: "open" }, "نوع سؤال غير مدعوم للتحويل الحتمي: " + raw.type);
  }
}

module.exports = { mapF03Question, mapF06Question, extractF03ImagesByQid, imageBlock, stripInlineTags };
