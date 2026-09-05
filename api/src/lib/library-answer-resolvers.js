// Extracts the answer key from an F-series file's own JavaScript, safely (never executed).
//
// Two source conventions exist across the q-card F files:
//   - F01 / F04: a `const AK = { qid: "value", ... }` flat object (parsed via parseLiteral).
//   - F02:       inline g('qid', 'value', ...) grader calls (a regex over the source).
// Both resolve to the same shape: a flat Map of questionId -> correct answer string.

const { parseLiteral } = require("./embedded-quiz-extract");

function resolveAkAnswers(html) {
  const match = /\bconst\s+AK\s*=\s*(?=\{)/.exec(html);
  if (!match) return new Map();
  let obj;
  try {
    obj = parseLiteral(html.slice(match.index + match[0].length)).value;
  } catch {
    return new Map();
  }
  const map = new Map();
  for (const [key, value] of Object.entries(obj || {})) {
    if (value !== null && value !== undefined && typeof value !== "object") {
      map.set(key, String(value));
    }
  }
  return map;
}

// Matches g('s1q1', 'answer', ...) / g("s1q1", "answer", ...). The first arg is the field id, the
// second is the expected answer text - this is F02's entire grading definition.
function resolveGCallAnswers(html) {
  const map = new Map();
  const callRegex = /\bg\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/g;
  let match;
  while ((match = callRegex.exec(html)) !== null) {
    map.set(match[1], match[2]);
  }
  return map;
}

// Picks whichever key source the file actually uses. A file has at most one of the two.
function resolveAnswerMap(html) {
  const ak = resolveAkAnswers(html);
  if (ak.size) return ak;
  return resolveGCallAnswers(html);
}

module.exports = { resolveAkAnswers, resolveGCallAnswers, resolveAnswerMap };
