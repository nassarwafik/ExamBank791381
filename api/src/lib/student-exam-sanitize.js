// Student-safe exam sanitization.
//
// SECURITY: the exam snapshot stored on an assignment contains answer keys and teacher-side data
// (question.answer, field.correct, part.answer, hints, AI instructions, edit history). The student
// browser must NEVER receive any of it. This module is the single, recursive sanitizer used before an
// exam is sent to a student — it covers BOTH legacy flat exams (exam.questions[]) and structured
// exams (exam.sections[].questions[] with compound parts and generalized fields). It is pure and
// operates on a deep copy, so the caller's snapshot is never mutated.
//
// Design: a denylist of secret keys is stripped at every level (question, part, option, field), and
// the sanitizer recurses into options/fields/parts. Everything else — the data a student needs to
// render and answer the question (text, options text, field labels/options, wordBank, cli templates,
// table headers/rows, marks, images, stimuli, section rules, groupId, presentation metadata,
// displayNumber) — is preserved untouched.

// Answer-key / solution flags that may appear on options and fields.
const FLAG_SECRET_KEYS = ["correct", "isCorrect", "correctText", "correctOptionIndex", "correctOptionValue", "correctOptionLabel", "solution", "expectedAnswer", "answerKey"];
// Teacher-side / secret keys that may appear on a question or a compound part.
const NODE_SECRET_KEYS = ["teacherNote", "aiInstruction", "hint", "history", "redoStack", "explanation", "rationale", ...FLAG_SECRET_KEYS];

function stripKeys(obj, keys) {
  for (const k of keys) if (k in obj) delete obj[k];
}

function sanitizeOptionForStudent(option) {
  if (!option || typeof option !== "object") return option;
  const out = { ...option }; // keeps value / label / text / order / number
  stripKeys(out, FLAG_SECRET_KEYS);
  return out;
}

function sanitizeFieldForStudent(field) {
  if (!field || typeof field !== "object") return field;
  const out = { ...field }; // keeps id / number / label / kind / row / column / statement / options
  stripKeys(out, FLAG_SECRET_KEYS); // remove field.correct etc.
  if (Array.isArray(out.options)) out.options = out.options.map(sanitizeOptionForStudent);
  return out;
}

function sanitizePartForStudent(part) {
  if (!part || typeof part !== "object") return part;
  const out = { ...part }; // keeps id / label / text / textHtml / marks / type / wordBank / cli / tableHeaders / tableRows / image(s) / groupId
  delete out.answer; // remove part.answer (grading key)
  stripKeys(out, NODE_SECRET_KEYS);
  if (Array.isArray(out.options)) out.options = out.options.map(sanitizeOptionForStudent);
  if (Array.isArray(out.fields)) out.fields = out.fields.map(sanitizeFieldForStudent);
  if (Array.isArray(out.parts)) out.parts = out.parts.map(sanitizePartForStudent); // defensive: nested parts
  return out;
}

function sanitizeQuestionForStudent(question) {
  if (!question || typeof question !== "object") return question;
  // Legacy-identical blanking (answer:{}, hint:"", …) so existing behaviour/tests are unchanged,
  // then strip any additional secret flags and recurse into the new structured children.
  const out = { ...question, answer: {}, hint: "", teacherNote: "", aiInstruction: "", history: [], redoStack: [] };
  stripKeys(out, ["explanation", "rationale", ...FLAG_SECRET_KEYS]);
  if (Array.isArray(out.options)) out.options = out.options.map(sanitizeOptionForStudent);
  if (Array.isArray(out.fields)) out.fields = out.fields.map(sanitizeFieldForStudent);
  if (Array.isArray(out.parts)) out.parts = out.parts.map(sanitizePartForStudent);
  return out;
}

function sanitizeSectionForStudent(section) {
  if (!section || typeof section !== "object") return section;
  const out = { ...section }; // keeps id / title / instructions / gradingPolicy / maxMarks / requiredAnswers / answerUnit / stimuli
  if (Array.isArray(out.questions)) out.questions = out.questions.map(sanitizeQuestionForStudent);
  return out;
}

// The one entry point. Deep-copies, drops revisionHistory, and sanitizes both legacy questions[] and
// structured sections[].questions[]. Top-level presentation fields (presentationTheme, metadata, …)
// pass through unchanged.
function sanitizeExamForStudent(exam) {
  const x = JSON.parse(JSON.stringify(exam || {}));
  x.revisionHistory = [];
  if (Array.isArray(x.questions)) x.questions = x.questions.map(sanitizeQuestionForStudent);
  if (Array.isArray(x.sections)) x.sections = x.sections.map(sanitizeSectionForStudent);
  return x;
}

module.exports = {
  sanitizeExamForStudent,
  sanitizeSectionForStudent,
  sanitizeQuestionForStudent,
  sanitizePartForStudent,
  sanitizeFieldForStudent,
  sanitizeOptionForStudent
};
