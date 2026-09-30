// Phase 16A — the CODE-OWNED server grading registry. api/src/lib/assignment-grading.js stays the authority for official
// scores; it resolves a handler here instead of growing a central if/else per type:
//   • registered type (Wave 1 / plugin)             → its deterministic handler (the shared pure scoring module)
//   • legacy type / alias / missing type            → the LEGACY adapter (the original grader, byte-for-byte)
//   • unknown type, or an unsupported type version  → unknownTypeResult(): score 0, manual review, never full credit, never
//                                                     another grader, never a crash
// Handlers are registered from repository code only; nothing in exam JSON can name a grader, module or path.
const shared = require("./shared-finalization/questionTypeCatalog");
const { resolveQuestionTypeKeyOrAlias } = require("./shared-finalization/questionTypeAliases");
const scoring = require("./shared-finalization/questionTypeScoring");

const LEGACY = Symbol.for("exambank.legacy-grader");
// ONE process-wide registry (a test runner may load this module through two loaders — ESM import and CJS require — and a
// grader registered through one must be visible to the authoritative grader loaded through the other).
const REGISTRY_KEY = Symbol.for("exambank.question-type-graders");
const graders = globalThis[REGISTRY_KEY] || (globalThis[REGISTRY_KEY] = new Map());

function registerGrader(key, handler) {
  if (typeof key !== "string" || !/^[A-Za-z][A-Za-z0-9]{1,63}$/.test(key)) throw new Error("invalid grader key");
  if (typeof handler !== "function") throw new Error("grader handler must be a function");
  if (graders.has(key)) throw new Error("grader already registered: " + key);
  graders.set(key, handler);
  return () => { graders.delete(key); };
}
/** A legacy type key (catalog legacy entry, case-insensitive spelling or alias) or an ABSENT type → the legacy adapter. */
function isLegacyType(rawType) {
  const raw = String(rawType || "").trim();
  if (!raw) return true;
  const key = resolveQuestionTypeKeyOrAlias(raw);
  const def = key ? shared.questionTypeDefinition(key) : undefined;
  return !!def && def.legacy === true;
}
/**
 * Resolves the grading handler for a question's type. Returns the registered handler, the LEGACY marker, or undefined
 * (unknown type). An unsupported version of ANY known type resolves to undefined (fail closed).
 */
function resolveGrader(rawType, version, options = {}) {
  const raw = String(rawType || "").trim();
  if (!raw) return LEGACY;
  // A grader registered from repository code is, by definition, a known type on this server (a plugin registers its
  // catalog definition in the shared catalog too; a test-only plugin may register the grader alone → version 1 only).
  if (graders.has(raw)) {
    const supported = shared.isKnownQuestionType(raw) ? shared.supportsQuestionTypeVersion(raw, version) : (version === undefined || version === 1);
    return supported ? graders.get(raw) : undefined;
  }
  const key = resolveQuestionTypeKeyOrAlias(raw);
  if (!key) {
    // Unknown key: fail closed by default. ONLY a legacy flat question (no `presentationType`, student-facing `type` such as
    // "sequence" / "table" from pre-builder exams) keeps the original grader — parity for old data, never for structured
    // / imported questions.
    return options.legacyFlat ? LEGACY : undefined;
  }
  if (version !== undefined && !shared.supportsQuestionTypeVersion(key, version)) return undefined;
  const def = shared.questionTypeDefinition(key);
  if (def && def.legacy) return LEGACY;
  return graders.get(key);
}
function unknownTypeResult(max) {
  const m = Number.isFinite(Number(max)) ? Math.max(0, Number(max)) : 0;
  return { score: 0, maxMarks: m, correct: false, manualReview: true, unsupportedType: true };
}

// ── Wave 1 handlers: (question, response, max) → { score, manualReview, correct?, parts? } ───────────────────────────
const registerBuiltIn = (key, handler) => { if (!graders.has(key)) registerGrader(key, handler); };
registerBuiltIn("multipleSelect", (question, response, max) => {
  const options = Array.isArray(question.options) ? question.options : [];
  const answer = question.answer && typeof question.answer === "object" ? question.answer : {};
  const r = scoring.scoreMultipleSelect({ optionIds: options.map(o => o && o.id), correctOptionIds: answer.correctOptionIds, selectedOptionIds: response && response.kind === "multiChoice" ? response.optionIds : undefined, scoring: answer.scoring, maxMarks: max });
  return { score: r.score, correct: r.correct, manualReview: false };
});
registerBuiltIn("numericResponse", (question, response, max) => {
  const answer = question.answer && typeof question.answer === "object" ? question.answer : {};
  const unitRequired = !!(question.numeric && question.numeric.unitRequired === true);
  const r = scoring.scoreNumericResponse({ answer, unitRequired, response, maxMarks: max });
  return { score: r.score, correct: r.correct, manualReview: false };
});
registerBuiltIn("matrix", (question, response, max) => {
  const m = question.matrix && typeof question.matrix === "object" ? question.matrix : {};
  const answer = question.answer && typeof question.answer === "object" ? question.answer : {};
  const r = scoring.scoreMatrix({ rows: Array.isArray(m.rows) ? m.rows : [], columns: Array.isArray(m.columns) ? m.columns : [], correctColumnByRow: answer.correctColumnByRow, values: response && response.kind === "fields" ? response.values : undefined, maxMarks: max });
  return { score: r.score, correct: r.correct, manualReview: false, parts: { correct: r.correctRows, total: r.totalRows } };
});
registerBuiltIn("categorization", (question, response, max) => {
  const c = question.categorization && typeof question.categorization === "object" ? question.categorization : {};
  const answer = question.answer && typeof question.answer === "object" ? question.answer : {};
  const r = scoring.scoreCategorization({ categories: Array.isArray(c.categories) ? c.categories : [], items: Array.isArray(c.items) ? c.items : [], correctCategoryByItem: answer.correctCategoryByItem, values: response && response.kind === "fields" ? response.values : undefined, maxMarks: max });
  return { score: r.score, correct: r.correct, manualReview: false, parts: { correct: r.correctItems, total: r.totalItems } };
});

module.exports = { registerGrader, resolveGrader, isLegacyType, unknownTypeResult, LEGACY };
