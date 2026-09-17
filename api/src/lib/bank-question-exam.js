// The ONE conversion from a stored bank question (bank/sources/<sourceId>.json entry + its index entry) to the
// Builder's exam question. Extracted verbatim from question-bank-action.js (the Builder's "replace from bank"
// action) so the Exam Bank management endpoint (bank-questions.js) and its tests classify, validate and convert
// questions through exactly the same logic the Builder selects with — no second interpretation of the schema.
//
// Canonical stored shapes that survive this conversion, render a usable student control and grade:
//   multipleChoice  type "multipleChoice", options[{value,label,text,textHtml,order}],
//                   answer { mode:"singleChoice", correctOptionValue, correctOptionIndex, correctText, values:[value] }
//   fillBlank       type "multiField", fields[{id,label,labelHtml,order,kind:"text",correct}] (NO select kind, no
//                   per-field options), answer { mode:"exactSequence", values:[one expected value per field] }
//                   → presentationType "fillBlank"; the student card renders one text input per field;
//                   {kind:"sequence", values} grades through gradeSequence against answer.values.
//   wordBank        type "multiField", fields[{id,label,labelHtml,order,kind:"select",options[{value,label,text,
//                   textHtml,order}],correct}] + wordBank[string] (the same choices), answer { mode:"exactSequence",
//                   values } → presentationType "wordBank" (a field of kind "select"); the student card derives the
//                   dropdown choices from field.options (getWordBank), one <select> per field; grades as above.
//   open            type "shortAnswer", no options/fields, answer { mode:"anyAccepted", values } or { mode:"manual" }
//                   → presentationType "open"; textarea; manual review.
// field.correct and answer are teacher-side keys: student-exam-sanitize strips them before a student sees the exam.
const { createSignedAssetParams } = require("./builder-auth");

function presentationTypeFromFullQuestion(question) {
  if (question.type === "multipleChoice") return "multipleChoice";
  if (question.type === "multiField") {
    const fields = Array.isArray(question.fields) ? question.fields : [];
    const hasSelect = fields.some(field =>
      String(field.kind || "").toLowerCase() === "select" || (Array.isArray(field.options) && field.options.length > 2));
    return hasSelect ? "wordBank" : "fillBlank";
  }
  return "open";
}

function broadlyMatchesType(indexQuestion, desiredType) {
  if (!desiredType) return true;
  if (desiredType === "multipleChoice") return indexQuestion.type === "multipleChoice";
  if (desiredType === "fillBlank" || desiredType === "wordBank") return indexQuestion.type === "multiField";
  return !["multipleChoice", "multiField"].includes(indexQuestion.type);
}

function isOfficialLikeSource(question) {
  const sourceId = String(question.sourceId || "");
  const examCode = String(question.examCode || "");
  return /^791381-20\d{2}/.test(sourceId) || /^791367-20\d{2}/.test(sourceId) || examCode === "791381" || examCode === "791367";
}

function buildAssetData(asset) {
  if (!asset?.blobName) return null;
  const { exp, sig } = createSignedAssetParams(asset.blobName, 8 * 60 * 60);
  return {
    id: asset.id || asset.key || asset.blobName,
    origin: "bank",
    blobName: asset.blobName,
    contentType: asset.contentType || "image/png",
    dataUrl: "/api/question-image" + "?blob=" + encodeURIComponent(asset.blobName) + "&exp=" + encodeURIComponent(String(exp)) + "&sig=" + encodeURIComponent(sig)
  };
}

function buildExamQuestion(fullQuestion, indexQuestion, currentQuestion) {
  const renderedAssets = (Array.isArray(fullQuestion.assets) ? fullQuestion.assets : []).map(buildAssetData).filter(Boolean);
  const presentationType = presentationTypeFromFullQuestion(fullQuestion);
  return {
    examQuestionId: currentQuestion.examQuestionId,
    origin: "bank",
    bankQuestionId: fullQuestion.id,
    sourceId: fullQuestion.sourceId,
    sourceQuestionId: fullQuestion.sourceQuestionId,
    questionNumber: fullQuestion.questionNumber,
    section: indexQuestion.section,
    topic: indexQuestion.topic,
    secondaryTopics: indexQuestion.secondaryTopics || [],
    difficulty: Number(indexQuestion.difficulty),
    difficultyLabel: indexQuestion.difficultyLabel || "",
    familyKey: indexQuestion.familyKey || "",
    hasCLI: indexQuestion.hasCLI === true,
    requiresCalculation: indexQuestion.requiresCalculation === true,
    presentationType,
    bankType: fullQuestion.type,
    marks: Number(currentQuestion.marks || 0),
    locked: currentQuestion.locked === true,
    text: fullQuestion.text || "",
    textHtml: fullQuestion.textHtml || "",
    options: fullQuestion.options || [],
    fields: fullQuestion.fields || [],
    parts: fullQuestion.parts || [],
    answer: fullQuestion.answer || {},
    hint: fullQuestion.hint || "",
    // Additive: a stored word bank (teacher-entered wordBank questions carry one) travels with the question so the
    // Builder's quality checks see the same choices the fields offer. Sources without one are unchanged.
    ...(Array.isArray(fullQuestion.wordBank) && fullQuestion.wordBank.length ? { wordBank: fullQuestion.wordBank.slice() } : {}),
    teacherNote: currentQuestion.teacherNote || "",
    aiInstruction: "",
    wasModified: false,
    image: {
      exists: renderedAssets.length > 0,
      visible: renderedAssets.length > 0,
      origin: renderedAssets.length > 0 ? "bank" : null,
      assets: renderedAssets,
      prompt: null
    },
    history: [],
    redoStack: []
  };
}

module.exports = { presentationTypeFromFullQuestion, broadlyMatchesType, isOfficialLikeSource, buildAssetData, buildExamQuestion };
