// Some HTML pages a teacher imports from a URL aren't a plain prose exam document - they're a
// self-contained, JS-driven interactive quiz page (e.g. the standalone practice-quiz pages this
// app can generate) whose actual question bank lives in a `const QUESTIONS = [...]` array inside a
// <script> tag, not as visible text. html-extract.js's normal sanitize-then-markdown path strips
// <script> content entirely, so a page like that always produced zero detected questions even
// though the data is fully present, structured, and unambiguous.
//
// The array is JS syntax (unquoted keys, single/double-quoted strings), not JSON, but the fetched
// page is fully untrusted external content (same threat model as url-fetch.js) - it must NEVER be
// evaluated as code (no eval/Function/vm). parseLiteral() below is a small, deliberately narrow
// hand-rolled parser: it only recognizes object/array literals, string/number/boolean/null
// primitives, and // and /* */ comments. Anything else it doesn't recognize (a function call, a
// template-literal interpolation, an identifier that isn't true/false/null, ...) throws and aborts
// parsing immediately - it never guesses, never partially executes, and never falls through to
// executing anything.

class LiteralSyntaxError extends Error {}

function parseLiteral(source) {
  let i = 0;
  const len = source.length;

  function fail(message) {
    throw new LiteralSyntaxError(message + " at offset " + i);
  }

  function skipWs() {
    while (i < len) {
      const ch = source[i];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }
      if (ch === "/" && source[i + 1] === "/") { while (i < len && source[i] !== "\n") i++; continue; }
      if (ch === "/" && source[i + 1] === "*") {
        i += 2;
        while (i < len && !(source[i] === "*" && source[i + 1] === "/")) i++;
        i += 2;
        continue;
      }
      break;
    }
  }

  function parseString(quote) {
    i++; // opening quote
    let out = "";
    const escapeMap = { n: "\n", t: "\t", r: "\r", "\\": "\\", "`": "`" };
    while (i < len && source[i] !== quote) {
      const ch = source[i];
      if (ch === "\\") {
        i++;
        const esc = source[i];
        if (esc === "u") {
          const hex = source.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("invalid unicode escape");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 5;
          continue;
        }
        if (esc === quote) { out += quote; i++; continue; }
        out += escapeMap[esc] !== undefined ? escapeMap[esc] : esc;
        i++;
        continue;
      }
      if (ch === "\n") fail("unterminated string");
      out += ch;
      i++;
    }
    if (source[i] !== quote) fail("unterminated string");
    i++; // closing quote
    return out;
  }

  function parseNumber() {
    const start = i;
    if (source[i] === "-") i++;
    if (!/[0-9]/.test(source[i])) fail("invalid number");
    while (i < len && /[0-9]/.test(source[i])) i++;
    if (source[i] === ".") { i++; while (i < len && /[0-9]/.test(source[i])) i++; }
    return Number(source.slice(start, i));
  }

  function parseValue() {
    skipWs();
    const ch = source[i];
    if (ch === '"' || ch === "'") return parseString(ch);
    if (ch === "{") return parseObject();
    if (ch === "[") return parseArray();
    if (ch === "-" || (ch >= "0" && ch <= "9")) return parseNumber();
    if (source.startsWith("true", i) && !/\w/.test(source[i + 4] || "")) { i += 4; return true; }
    if (source.startsWith("false", i) && !/\w/.test(source[i + 5] || "")) { i += 5; return false; }
    if (source.startsWith("null", i) && !/\w/.test(source[i + 4] || "")) { i += 4; return null; }
    fail("unsupported value syntax");
  }

  function parseKey() {
    skipWs();
    const ch = source[i];
    if (ch === '"' || ch === "'") return parseString(ch);
    const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(i));
    if (!match) fail("invalid object key");
    i += match[0].length;
    return match[0];
  }

  function parseObject() {
    i++; // {
    const obj = {};
    skipWs();
    if (source[i] === "}") { i++; return obj; }
    for (;;) {
      const key = parseKey();
      skipWs();
      if (source[i] !== ":") fail("expected ':'");
      i++;
      obj[key] = parseValue();
      skipWs();
      if (source[i] === ",") {
        i++;
        skipWs();
        if (source[i] === "}") { i++; break; }
        continue;
      }
      if (source[i] === "}") { i++; break; }
      fail("expected ',' or '}'");
    }
    return obj;
  }

  function parseArray() {
    i++; // [
    const arr = [];
    skipWs();
    if (source[i] === "]") { i++; return arr; }
    for (;;) {
      arr.push(parseValue());
      skipWs();
      if (source[i] === ",") {
        i++;
        skipWs();
        if (source[i] === "]") { i++; break; }
        continue;
      }
      if (source[i] === "]") { i++; break; }
      fail("expected ',' or ']'");
    }
    return arr;
  }

  skipWs();
  if (source[i] !== "[" && source[i] !== "{") fail("expected top-level array or object");
  const result = source[i] === "{" ? parseObject() : parseArray();
  return { value: result, endOffset: i };
}

// Looks for `(const|let|var) QUESTIONS = [...]` anywhere in the raw HTML/script source and safely
// parses just that array literal (ignoring everything before/after it - the parser above naturally
// stops at the matching closing bracket). Returns null - never throws - when no such declaration
// exists or its contents don't parse as a safe literal.
function findEmbeddedQuestionsArray(html) {
  const match = /\b(?:const|let|var)\s+QUESTIONS\s*=\s*(?=\[)/.exec(html);
  if (!match) return null;

  const startIndex = match.index + match[0].length;
  try {
    return parseLiteral(html.slice(startIndex)).value;
  } catch {
    return null;
  }
}

// Validates each parsed item loosely matches the expected quiz-question shape (a single-correct-
// answer multiple choice question) before trusting it - anything that doesn't is dropped rather
// than guessed at.
function extractEmbeddedQuestionBank(html) {
  const parsed = findEmbeddedQuestionsArray(html);
  if (!Array.isArray(parsed)) return null;

  const questions = parsed.filter(item =>
    item && typeof item === "object" &&
    typeof item.text === "string" && item.text.trim() &&
    Array.isArray(item.options) && item.options.length >= 2 &&
    item.options.every(option => typeof option === "string" && option.trim()) &&
    Number.isInteger(item.answer) && item.answer >= 0 && item.answer < item.options.length
  );

  return questions.length ? questions : null;
}

// Deterministic, verbatim-preserving prose rendering - not a summary or a rephrasing of anything -
// so the existing AI question-detection pipeline (which only ever copies text it's given, never
// invents it) can pick each question up exactly as it already does for a normal document with a
// visibly-stated correct answer.
function renderQuestionBankAsText(questions) {
  return questions.map((question, index) => {
    const optionLines = question.options
      .map((option, optionIndex) => "  " + String.fromCharCode(65 + optionIndex) + ") " + option)
      .join("\n");
    const topicLine = question.topic ? "الموضوع: " + question.topic + "\n" : "";
    const correctText = question.options[question.answer];

    return "السؤال " + (index + 1) + ":\n" + topicLine + question.text + "\n" + optionLines +
      "\nالإجابة الصحيحة: " + correctText;
  }).join("\n\n---\n\n");
}

module.exports = {
  LiteralSyntaxError,
  parseLiteral,
  extractEmbeddedQuestionBank,
  renderQuestionBankAsText
};
