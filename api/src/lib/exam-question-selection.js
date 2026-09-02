const BANK_CONTAINER = "bank";
const INDEX_BLOB = "index/questions-index.json";

// Extracted verbatim from generate-exam.js's original inline candidate filter (the eligibility
// rules themselves are unchanged) so both the real exam-generation endpoint and the
// question-availability/preview endpoint always agree on what counts as an eligible question —
// the count/preview the teacher reviews must never be able to drift from what generation actually
// produces.
//
// allowedDifficulties/allowedTypes are new, optional hard filters (membership checks) on top of
// the original rules. When provided as a non-empty array they restrict candidates to exactly
// those values; when omitted/empty they impose no restriction, matching the existing behavior of
// excludedTopics (empty = unrestricted). Topic restriction itself still goes through
// plan.excludedTopics exactly as before — callers that want a strict topic allow-list compute
// excludedTopics as "every known topic minus the allowed ones" rather than this function gaining a
// second, parallel topic-filtering mechanism.
function filterEligibleCandidates(indexQuestions, options = {}) {
  const excludedTopics = new Set(
    Array.isArray(options.excludedTopics)
      ? options.excludedTopics.map(String)
      : []
  );

  const allowedDifficulties = Array.isArray(options.allowedDifficulties) && options.allowedDifficulties.length
    ? new Set(options.allowedDifficulties.map(value => Number(value)))
    : null;

  const allowedTypes = Array.isArray(options.allowedTypes) && options.allowedTypes.length
    ? new Set(options.allowedTypes.map(String))
    : null;

  const excludeNeedsReview = options.excludeNeedsReview !== false;

  return indexQuestions.filter(question => {
    if (!question || !question.id || !question.sourceId) {
      return false;
    }

    if (!["BASIC", "INFRASTRUCTURE"].includes(question.section)) {
      return false;
    }

    if (!Number.isInteger(Number(question.difficulty))) {
      return false;
    }

    if (!question.topic || question.topic === "UNKNOWN") {
      return false;
    }

    if (excludedTopics.has(String(question.topic))) {
      return false;
    }

    if (allowedDifficulties && !allowedDifficulties.has(Number(question.difficulty))) {
      return false;
    }

    if (allowedTypes && !allowedTypes.has(presentationTypeFromIndex(question))) {
      return false;
    }

    if (excludeNeedsReview && question.needsReview === true) {
      return false;
    }

    if (excludeNeedsReview && question.reviewStatus === "needs-review") {
      return false;
    }

    return true;
  });
}

// Same mapping as generate-exam.js's presentationTypeFromIndex — duplicated here (not imported)
// because generate-exam.js's copy stays private to its own module; both must be kept in sync if
// the index's `type` values ever change.
function presentationTypeFromIndex(question) {
  switch (question.type) {
    case "multipleChoice":
      return "multipleChoice";
    case "multiField":
      return "fillBlank";
    case "shortAnswer":
    case "multiPart":
    case "other":
    default:
      return "open";
  }
}

module.exports = {
  BANK_CONTAINER,
  INDEX_BLOB,
  filterEligibleCandidates,
  presentationTypeFromIndex
};
