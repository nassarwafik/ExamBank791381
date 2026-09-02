// Deterministic image-to-question linking for DOCX/HTML imports. No AI guessing: an image is
// linked to a question ONLY when a literal placeholder token for that image's id survives, intact,
// inside that question's extracted text - i.e. the image was structurally inside the same
// paragraph/block the AI copied verbatim into that question. An image whose token doesn't end up
// inside any detected question's text (dropped between questions, in an unprocessed chunk, or the
// AI failed to copy it verbatim) is never guessed at - it becomes "unassigned" instead of being
// silently lost or attached to the nearest question by position.

// Plain ASCII double-bracket format (not an exotic Unicode symbol) specifically because this
// token has to survive an LLM "copy verbatim" step - ordinary ASCII punctuation is far more
// reliably reproduced byte-for-byte by a language model than uncommon Unicode characters, which
// some models normalize, substitute, or drop when regenerating text.
const TOKEN_PREFIX = "[[IMG:";
const TOKEN_SUFFIX = "]]";
const IMAGE_TOKEN_PATTERN = /\[\[IMG:([a-zA-Z0-9_-]+)\]\]/g;

// Defensive-only sweep for a token the AI reproduced imperfectly (e.g. dropped one bracket, or
// mangled the id) - such a token can never be linked to a real image (its id won't match
// allImageIds), but it must still never leak into visible question text. This is intentionally
// looser than IMAGE_TOKEN_PATTERN and only ever used for removal, never for linking.
const MANGLED_TOKEN_SWEEP = /\[{0,2}IMG:[a-zA-Z0-9_-]*\]{0,2}/g;

function makeImageToken(id) {
  return `${TOKEN_PREFIX}${id}${TOKEN_SUFFIX}`;
}

// Converts every <img ... alt="TOKEN" ...> tag (our own extractors always set alt to the literal
// token for that image) into plain text containing just that token, so downstream plain-text
// processing (stripTags, table conversion, AI chunking) carries it through as ordinary text
// instead of losing it when the tag itself gets stripped.
function inlineImageTokensIntoHtml(html) {
  return String(html || "").replace(/<img\b[^>]*\balt="([^"]*)"[^>]*\/?>/gi, (match, alt) => alt);
}

function extractImageTokenIds(text) {
  const ids = [];
  const pattern = new RegExp(IMAGE_TOKEN_PATTERN.source, "g");
  let match;
  while ((match = pattern.exec(String(text || ""))) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

function stripImageTokens(text) {
  return String(text || "")
    .replace(new RegExp(IMAGE_TOKEN_PATTERN.source, "g"), "")
    .replace(new RegExp(MANGLED_TOKEN_SWEEP.source, "g"), "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// questions: [{..., text}]. allImages: [{id, ...}]. Returns new question objects (text has tokens
// stripped, plus an added imageIds[] of every image id whose token was found inside that
// question's own text) and the list of image ids that never matched any question.
function linkImagesToQuestions(questions, allImages) {
  const allImageIds = new Set((allImages || []).map(image => image.id));
  const assignedImageIds = new Set();

  const linkedQuestions = (questions || []).map(question => {
    const imageIds = extractImageTokenIds(question.text).filter(id => allImageIds.has(id));
    imageIds.forEach(id => assignedImageIds.add(id));
    return { ...question, imageIds, text: stripImageTokens(question.text) };
  });

  const unassignedImageIds = [...allImageIds].filter(id => !assignedImageIds.has(id));

  return { questions: linkedQuestions, unassignedImageIds };
}

module.exports = {
  makeImageToken,
  inlineImageTokensIntoHtml,
  extractImageTokenIds,
  stripImageTokens,
  linkImagesToQuestions
};
