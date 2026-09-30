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
// displayNumber) — is preserved untouched, EXCEPT question media the teacher has hidden, which is removed from the
// student copy (see applyStudentMediaVisibility).

// Answer-key / solution flags that may appear on options and fields.
const FLAG_SECRET_KEYS = ["correct", "isCorrect", "correctText", "correctOptionIndex", "correctOptionValue", "correctOptionLabel", "solution", "expectedAnswer", "answerKey"];
// Teacher-side / secret keys that may appear on a question or a compound part.
const NODE_SECRET_KEYS = ["teacherNote", "aiInstruction", "hint", "history", "redoStack", "explanation", "rationale", ...FLAG_SECRET_KEYS];
// Phase 13C-A — TEACHER PLANNING DATA: the assessment blueprint (exam level) and a question's / part's pedagogical
// classification are authoring data and never reach a student.
const PLANNING_KEYS = ["assessmentMeta"];
// Phase 13C-B — the live Blueprint intelligence (coverage report / evidence index) is runtime-derived teacher data and is
// never persisted on the exam; should any future path ever do so, it is removed here (defense in depth).
const TEACHER_ANALYTICS_KEYS = ["coverageReport", "blueprintCoverage", "assessmentIntelligence", "evidenceIndex",
  // Phase 13C-C — quality policy / gate results / finalization data are teacher governance data (the policy itself lives
  // inside the blueprint, which is already removed; these root keys are defense in depth)
  "qualityPolicy", "qualityGateReport", "finalizationDecision", "qualityBlockers", "qualityWarnings"];
// Phase 13C-A — an interactive-context descriptor IS student-visible, but only as DATA: these are the only fields kept.
// Anything content might use to name code (component / module / src / html …) or to claim trust (assessmentSafe …) is
// dropped here (the client registry ignores it anyway — defense in depth), and secret-looking keys are removed from the
// config recursively because the config is rendered in the student's browser.
const ACTIVITY_FIELDS = ["id", "kind", "key", "version", "title", "description", "config", "placement"];
// Review Fix 1 / R3: config keys are judged by the CANONICAL secret-key policy (case-insensitive, separators removed,
// semantic families), mirrored from src/secretKeyPolicy.ts and pinned by src/secretKeyPolicy.parity.test.ts — never an
// exact-spelling denylist that `correct_answer` / `CorrectAnswer` / `teacherAnswer` could walk past.
const { isSecretConfigKey } = require("./secret-key-policy.js");
// Import-only / teacher-only image keys that must never reach a student: the original URL of an external
// image the importer refused to embed, and the AI-generation `prompt` (Phase 5B never persists it on a
// structured question, but the legacy builder stores it on image objects — strip it here so it can never
// reach a student). Stripped from every image object AND asset (defense in depth).
const IMPORT_ONLY_IMAGE_KEYS = ["externalUrl", "prompt"];

function stripKeys(obj, keys) {
  for (const k of keys) if (k in obj) delete obj[k];
}
function stripSecretsDeep(value, depth = 0) {
  if (depth > 12) return undefined;
  if (Array.isArray(value)) return value.map(v => stripSecretsDeep(v, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!isSecretConfigKey(k)) out[k] = stripSecretsDeep(v, depth + 1);
    return out;
  }
  return value;
}
// Student copy of an interactive-context descriptor (see ACTIVITY_FIELDS). Returns undefined for anything that is not a
// plain object, so a malformed value is dropped rather than forwarded.
function sanitizeActivityForStudent(activity) {
  if (!activity || typeof activity !== "object" || Array.isArray(activity)) return undefined;
  const out = {};
  for (const k of ACTIVITY_FIELDS) if (k in activity && activity[k] !== undefined) out[k] = activity[k];
  if (out.config && typeof out.config === "object") out.config = stripSecretsDeep(out.config);
  return out;
}
function applyActivityForStudent(node) {
  if (!("activity" in node)) return;
  const clean = sanitizeActivityForStudent(node.activity);
  if (clean) node.activity = clean; else delete node.activity;
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

// STUDENT-VISIBLE MEDIA — the one visibility rule (hiding is a teacher choice; the student browser is student-
// controlled, so anything returned here is visible to the student even if the renderer never draws it).
// A question/part carries the canonical image { exists, visible, assets[] } and a legacy images[] fallback that
// the student renderer shows only when the canonical image is not shown:
//   • canonical SHOWN  (exists && visible)                              → its assets; images[] is never rendered → []
//   • canonical HIDDEN (exists && assets non-empty && visible === false) → nothing: its assets AND images[] are removed,
//     so the fallback can never re-show what the teacher hid (the teacher editor's isImageHidden, exactly)
//   • otherwise (no canonical image, e.g. a legacy images[]-only question) → images[] unchanged
// Canonical asset bytes are only ever sent when the canonical image is shown; otherwise only { exists, visible }
// remain (no assets key, so the renderer's image-vs-images[] precedence is exactly what it was). Only the student
// copy changes — the teacher's stored exam keeps the bytes, so "show" restores the same image.
function applyStudentMediaVisibility(node) {
  const img = node.image && typeof node.image === "object" && !Array.isArray(node.image) ? node.image : null;
  if (!img) return;
  const shown = !!(img.exists && img.visible && Array.isArray(img.assets));
  const hidden = !!(img.exists && Array.isArray(img.assets) && img.assets.length && img.visible === false);
  if (!shown) node.image = { exists: img.exists, visible: img.visible };   // flags only: no assets / bytes
  if ((shown || hidden) && "images" in node) node.images = [];
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

// Phase 16A / Review Fix 1 — the UNIVERSAL student projection contract for registered question types (Wave 1 today; every
// simulation / interactive runtime profile of Phase 16B tomorrow): a type's student-visible data is PUBLIC configuration
// carried under type-owned object fields (numeric / matrix / categorization / scenario / publicConfig / …); every answer key,
// expected state, scoring assertion or solution lives ONLY under `answer` (removed above) or another teacher-only field the
// sanitizer always strips. This function never names a domain: EVERY object-valued field of a node that is not one of the
// structural fields with a dedicated sanitizer below is passed through the canonical secret-key policy (recursive), so a
// smuggled `correctColumn` / `expectedState` / `answerKey` inside any plugin object never reaches a student (defense in
// depth) while public structure (ids, labels, values) passes byte-for-byte. Persisted exam JSON can never name this code.
const STRUCTURAL_NODE_KEYS = new Set(["answer", "options", "fields", "parts", "image", "images", "activity", "stimulus"]);
function applyTypeConfigForStudent(node) {
  for (const k of Object.keys(node)) {
    if (STRUCTURAL_NODE_KEYS.has(k)) continue;
    const v = node[k];
    if (v && typeof v === "object") node[k] = stripSecretsDeep(v);
  }
}

function sanitizePartForStudent(part) {
  if (!part || typeof part !== "object") return part;
  const out = { ...part }; // keeps id / label / text / textHtml / marks / type / questionTypeVersion / wordBank / cli / tableHeaders / tableRows / image(s) / groupId
  delete out.answer; // remove part.answer (grading key)
  applyTypeConfigForStudent(out);
  stripKeys(out, NODE_SECRET_KEYS);
  stripKeys(out, PLANNING_KEYS);
  applyActivityForStudent(out);
  if (out.image) out.image = sanitizeImageForStudent(out.image);
  if (Array.isArray(out.images)) out.images = out.images.map(sanitizeImageAssetForStudent);
  applyStudentMediaVisibility(out);
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
  applyTypeConfigForStudent(out);
  stripKeys(out, ["explanation", "rationale", ...FLAG_SECRET_KEYS]);
  stripKeys(out, PLANNING_KEYS);
  applyActivityForStudent(out);
  if (out.image) out.image = sanitizeImageForStudent(out.image);
  if (Array.isArray(out.images)) out.images = out.images.map(sanitizeImageAssetForStudent);
  applyStudentMediaVisibility(out);
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
      if (stim && typeof stim === "object") { const copy = { ...stim, ...(stim.image ? { image: sanitizeImageForStudent(stim.image) } : {}) }; applyActivityForStudent(copy); stimuli[key] = copy; }
      else stimuli[key] = stim;
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
  if ("blueprint" in x) delete x.blueprint;                                   // Phase 13C-A: teacher planning data
  for (const k of TEACHER_ANALYTICS_KEYS) if (k in x) delete x[k];             // Phase 13C-B: live intelligence is never student data
  if ("coverPage" in x) x.coverPage = sanitizeCoverForStudent(x.coverPage);
  if (Array.isArray(x.questions)) x.questions = x.questions.map(sanitizeQuestionForStudent);
  if (Array.isArray(x.sections)) x.sections = x.sections.map(sanitizeSectionForStudent);
  return x;
}

module.exports = {
  sanitizeExamForStudent,
  applyStudentMediaVisibility,
  sanitizeCoverForStudent,
  sanitizeSectionForStudent,
  sanitizeQuestionForStudent,
  sanitizePartForStudent,
  sanitizeFieldForStudent,
  sanitizeOptionForStudent
};
