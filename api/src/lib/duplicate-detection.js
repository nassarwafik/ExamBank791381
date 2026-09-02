// Normalized-text duplicate detection for externally imported questions against the existing
// Question Bank. No similarity engine exists anywhere else in this codebase (the only related
// concept, familyKey, is an LLM-assigned label compared by exact string match within one
// generated exam, not a general text-similarity check against the whole bank) - this is new,
// deliberately simple logic per the spec's explicit "normalized text comparison" requirement.

const ARABIC_DIACRITICS = /[ً-ٰٟۖ-ۭࣔ-ࣣ࣡-ࣿ]/g;

function normalizeQuestionText(text) {
  return String(text || "")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shingles(normalizedText, size = 5) {
  const words = normalizedText.split(" ").filter(Boolean);
  if (words.length < size) {
    return new Set(words.length ? [words.join(" ")] : []);
  }
  const result = new Set();
  for (let i = 0; i <= words.length - size; i += 1) {
    result.add(words.slice(i, i + size).join(" "));
  }
  return result;
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersection += 1;
    }
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// bankQuestions: [{sourceId, questionId, text}]. Returns candidates sorted by similarity desc,
// capped at maxResults. Cheap, in-process only - no AI call, safe to run on every "check" request.
function computeDuplicateCandidates(candidateText, bankQuestions, options = {}) {
  const maxResults = Number(options.maxResults) > 0 ? Number(options.maxResults) : 5;
  const similarityThreshold = typeof options.similarityThreshold === "number" ? options.similarityThreshold : 0.82;

  const normalizedCandidate = normalizeQuestionText(candidateText);
  if (!normalizedCandidate) {
    return [];
  }
  const candidateShingles = shingles(normalizedCandidate);

  const results = [];

  for (const bankQuestion of Array.isArray(bankQuestions) ? bankQuestions : []) {
    const normalizedBank = normalizeQuestionText(bankQuestion.text);
    if (!normalizedBank) {
      continue;
    }

    if (normalizedBank === normalizedCandidate) {
      results.push({
        sourceId: bankQuestion.sourceId,
        questionId: bankQuestion.questionId,
        matchType: "exact",
        similarity: 1,
        preview: String(bankQuestion.text || "").slice(0, 200)
      });
      continue;
    }

    const similarity = jaccardSimilarity(candidateShingles, shingles(normalizedBank));
    if (similarity >= similarityThreshold) {
      results.push({
        sourceId: bankQuestion.sourceId,
        questionId: bankQuestion.questionId,
        matchType: "similar",
        similarity,
        preview: String(bankQuestion.text || "").slice(0, 200)
      });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, maxResults);
}

module.exports = { normalizeQuestionText, computeDuplicateCandidates };
