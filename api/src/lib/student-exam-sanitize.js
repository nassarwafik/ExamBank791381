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
// Import-only, teacher-review keys that must never reach a student (e.g. the original URL of an external
// image the importer refused to embed). Stripped from every image object/asset (defense in depth — the
// importer already avoids persisting these on the exam).
const IMPORT_ONLY_IMAGE_KEYS = ["externalUrl"];

function stripKeys(obj, keys) {
  for (const k of keys) if (k in obj) delete obj[k];
}

// Optional cover/start page: keep ONLY known, safe display fields for the student, and only a banner
// that is a safe embedded raster data URL (no external URL / SVG / HTML). The cover never contains
// student identity or answer keys; this drops any teacher-only or foreign keys defensively. Returns
// undefined when there is no cover, so exams without one are unchanged.
const SAFE_BANNER_DATA_URL = /^data:image\/(png|jpe?g|webp|gif)\b/i;
function sanitizeCoverForStudent(cover) {
  if (!cover || typeof cover !== "object") return undefined;
  const bool = (v, d) => (typeof v === "boolean" ? v : d);
  const str = v => (typeof v === "string" ? v : undefined);
  const bannerUrl = cover.banner && typeof cover.banner === "object" ? cover.banner.dataUrl : undefined;
  const out = {
    enabled: bool(cover.enabled, false),
    activityType: cover.activityType === "training" ? "training" : cover.activityType === "exam" ? "exam" : undefined,
    subtitle: str(cover.subtitle),
    instructions: str(cover.instructions),
    allowedMaterials: str(cover.allowedMaterials),
    showStudentName: bool(cover.showStudentName, true),
    showClassName: bool(cover.showClassName, true),
    showExamDate: bool(cover.showExamDate, true),
    showDuration: bool(cover.showDuration, false),
    showTotalMarks: bool(cover.showTotalMarks, true),
    showMarksDistribution: bool(cover.showMarksDistribution, true)
  };
  if (typeof bannerUrl === "string" && SAFE_BANNER_DATA_URL.test(bannerUrl)) out.banner = { dataUrl: bannerUrl };
  return out;
}

// Removes import-only keys from an image object ({ dataUrl, assets: [...] }) and its assets.
function sanitizeImageForStudent(image) {
  if (!image || typeof image !== "object") return image;
  if (Array.isArray(image)) return image.map(sanitizeImageAssetForStudent);
  const out = { ...image };
  stripKeys(out, IMPORT_ONLY_IMAGE_KEYS);
  if (Array.isArray(out.assets)) out.assets = out.assets.map(sanitizeImageAssetForStudent);
  return out;
}
function sanitizeImageAssetForStudent(asset) {
  if (!asset || typeof asset !== "object") return asset;
  const out = { ...asset };
  stripKeys(out, IMPORT_ONLY_IMAGE_KEYS);
  return out;
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
  if (out.image) out.image = sanitizeImageForStudent(out.image);
  if (Array.isArray(out.images)) out.images = out.images.map(sanitizeImageAssetForStudent);
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
  if (out.image) out.image = sanitizeImageForStudent(out.image);
  if (Array.isArray(out.images)) out.images = out.images.map(sanitizeImageAssetForStudent);
  if (Array.isArray(out.options)) out.options = out.options.map(sanitizeOptionForStudent);
  if (Array.isArray(out.fields)) out.fields = out.fields.map(sanitizeFieldForStudent);
  if (Array.isArray(out.parts)) out.parts = out.parts.map(sanitizePartForStudent);
  return out;
}

function sanitizeSectionForStudent(section) {
  if (!section || typeof section !== "object") return section;
  const out = { ...section }; // keeps id / title / instructions / gradingPolicy / maxMarks / requiredAnswers / answerUnit / stimuli
  if (Array.isArray(out.questions)) out.questions = out.questions.map(sanitizeQuestionForStudent);
  if (out.stimuli && typeof out.stimuli === "object" && !Array.isArray(out.stimuli)) {
    const stimuli = {};
    for (const [key, stim] of Object.entries(out.stimuli)) {
      stimuli[key] = stim && typeof stim === "object" ? { ...stim, ...(stim.image ? { image: sanitizeImageForStudent(stim.image) } : {}) } : stim;
    }
    out.stimuli = stimuli;
  }
  return out;
}

// The one entry point. Deep-copies, drops revisionHistory, and sanitizes both legacy questions[] and
// structured sections[].questions[]. Top-level presentation fields (presentationTheme, metadata, …)
// pass through unchanged EXCEPT teacher/import-only provenance (metadata.import), which is removed so
// import details (source file name, original examId, …) never reach a student.
function sanitizeExamForStudent(exam) {
  const x = JSON.parse(JSON.stringify(exam || {}));
  x.revisionHistory = [];
  if (x.metadata && typeof x.metadata === "object" && "import" in x.metadata) delete x.metadata.import;
  if ("coverPage" in x) x.coverPage = sanitizeCoverForStudent(x.coverPage);
  if (Array.isArray(x.questions)) x.questions = x.questions.map(sanitizeQuestionForStudent);
  if (Array.isArray(x.sections)) x.sections = x.sections.map(sanitizeSectionForStudent);
  return x;
}

module.exports = {
  sanitizeExamForStudent,
  sanitizeCoverForStudent,
  sanitizeSectionForStudent,
  sanitizeQuestionForStudent,
  sanitizePartForStudent,
  sanitizeFieldForStudent,
  sanitizeOptionForStudent
};
