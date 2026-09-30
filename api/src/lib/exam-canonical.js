const crypto = require("crypto");
const { normalizeBankAssetsForStorage } = require("./bank-asset-hydrate");

// Phase 14A §7/§8 — the ONE canonical exam content form and its content hash.
//
// canonicalizeExamContent() is the exact cleaning the generic artifact endpoint (save-exam-artifact.cleanExam) has always
// applied — sections[].questions[] as the only question tree (no competing top-level questions[]), per-question edit
// history / redo cleared, bank image assets reduced to their durable identity (never the transient signed URL) — with two
// additions: it never mutates its input (deep copy) and it strips governance-looking / runtime-analytics root fields so an
// exam body can never smuggle authority or derived data into a saved artifact or an immutable revision. The artifact
// endpoint now delegates to it (then stamps updatedAt), so there is no second, incompatible cleaner.
//
// contentHashOf() is SHA-256 (hex) over stableStringify(canonical exam): object keys sorted recursively, array order kept,
// undefined dropped exactly like JSON.stringify. It is integrity evidence for an immutable revision, never its identity,
// and it refuses non-canonical input (a transient signed bank URL must never be hashed as durable content).
const GOVERNANCE_ROOT_KEYS = Object.freeze([
  // authority / lifecycle fields a client might try to write onto an exam body
  "governance", "lifecycleState", "stateVersion", "latestRevisionId", "latestRevisionNumber", "latestContentHash",
  "reviewRevisionId", "approvedRevisionId", "publishedRevisionId", "publishedAt", "publishedBy", "approvedAt", "approvedBy",
  "revisionId", "revisionNumber", "contentHash",
  // runtime-derived teacher analytics (never persisted content; see student-exam-sanitize TEACHER_ANALYTICS_KEYS)
  "qualityGateReport", "finalizationDecision", "coverageReport", "blueprintCoverage", "assessmentIntelligence", "evidenceIndex",
  "qualityBlockers", "qualityWarnings", "qualityPolicy"
]);

function cleanQuestionContent(question) {
  return { ...question, history: [], redoStack: [] };
}

function canonicalizeExamContent(exam) {
  const source = exam && typeof exam === "object" && !Array.isArray(exam) ? exam : {};
  const copy = JSON.parse(JSON.stringify(source));
  for (const k of GOVERNANCE_ROOT_KEYS) if (k in copy) delete copy[k];
  const normalized = normalizeBankAssetsForStorage(copy);
  if (Array.isArray(normalized.sections)) {
    const structured = {
      ...normalized,
      sections: normalized.sections.map(section => ({ ...section, questions: Array.isArray(section && section.questions) ? section.questions.map(cleanQuestionContent) : [] }))
    };
    delete structured.questions;
    return structured;
  }
  return { ...normalized, questions: Array.isArray(normalized.questions) ? normalized.questions.map(cleanQuestionContent) : [] };
}

function stableStringify(value) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(v => { const s = stableStringify(v); return s === undefined ? "null" : s; }).join(",") + "]";
  const parts = [];
  for (const key of Object.keys(value).sort()) {
    const s = stableStringify(value[key]);
    if (s !== undefined) parts.push(JSON.stringify(key) + ":" + s);
  }
  return "{" + parts.join(",") + "}";
}

const SIGNED_BANK_URL = /\/api\/question-image\?[^"]*(sig=|exp=)/;
function contentHashOf(canonicalExam) {
  if (!canonicalExam || typeof canonicalExam !== "object") throw new Error("contentHashOf requires canonical exam content.");
  for (const k of GOVERNANCE_ROOT_KEYS) if (k in canonicalExam) throw new Error("contentHashOf requires canonical exam content (governance field '" + k + "' present).");
  const text = stableStringify(canonicalExam);
  if (SIGNED_BANK_URL.test(text)) throw new Error("contentHashOf requires canonical exam content (transient signed bank URL present).");
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

module.exports = { GOVERNANCE_ROOT_KEYS, canonicalizeExamContent, cleanQuestionContent, stableStringify, contentHashOf };
