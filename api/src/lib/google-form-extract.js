// Extracts questions from a Google Form's raw, PUBLIC "viewform" HTML. This is fundamentally
// different from html-extract.js: a live Google Form is a JS-hydrated page - the question data
// does not exist anywhere in server-rendered prose, only inside an internal, UNDOCUMENTED
// JavaScript variable named FB_PUBLIC_LOAD_DATA_ that Google's own frontend bundle embeds in a
// <script> tag to bootstrap the form renderer. There is no official Google API for reading an
// arbitrary form's questions, and this variable's shape has no published contract, no versioning,
// and no deprecation notice - Google can change it at any time with zero warning. Every function
// here is written to degrade to a warning for the affected question (or the whole document) rather
// than ever throwing, since "the page changed shape" is an expected, ongoing possibility, not a
// bug.
//
// Deliberately does NOT reuse html-extract.js's sanitize-html pipeline: sanitize-html discards
// <script> tags entirely (by design, for untrusted uploaded HTML), which would destroy the one
// place this data lives. The raw HTML is scanned directly, before any sanitization, and only the
// synthesized plain-text question summaries below (never the raw HTML) are handed to the rest of
// the import pipeline.

const LOAD_DATA_START_REGEX = /FB_PUBLIC_LOAD_DATA_\s*=\s*\[/;

// Google's internal type codes for a form field, as commonly documented by third-party scrapers
// (not an official enum). 2=MULTIPLE_CHOICE, 3=DROPDOWN, 4=CHECKBOXES share the same
// "list of labelled options" shape and are treated identically here.
const CHOICE_TYPE_CODES = new Set([2, 3, 4]);
const ARABIC_OPTION_LETTERS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي"];

// A regex cannot reliably capture a deeply-nested array literal (a naive non-greedy `[\s\S]*?\]`
// stops at the FIRST closing bracket it finds, truncating the JSON badly). This scans character by
// character instead, tracking bracket depth and skipping over string-literal contents (so a `]`
// inside a quoted question title never miscounts), to find the exact end of the top-level array.
function extractLoadDataArray(html) {
  const startMatch = LOAD_DATA_START_REGEX.exec(html);
  if (!startMatch) {
    return null;
  }

  const arrayStart = startMatch.index + startMatch[0].length - 1; // index of the opening "["
  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let escaped = false;

  for (let i = arrayStart; i < html.length; i++) {
    const char = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      }
      else if (char === "\\") {
        escaped = true;
      }
      else if (char === stringQuote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === "[") {
      depth += 1;
    }
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        const raw = html.slice(arrayStart, i + 1);
        try {
          return JSON.parse(raw);
        }
        catch {
          return null;
        }
      }
    }
  }

  return null; // unterminated - the page was truncated or the format changed
}

// Best-effort, defensive walk of the undocumented structure - every access is optional-chained,
// and any single malformed question is skipped (with a warning) rather than aborting the batch.
function extractQuestionsFromLoadData(loadData) {
  const questions = [];
  const warnings = [];

  const rawQuestions = loadData?.[1]?.[1];
  if (!Array.isArray(rawQuestions)) {
    return { questions, warnings: ["تعذر العثور على قائمة الأسئلة داخل بنية الصفحة."] };
  }

  rawQuestions.forEach((raw, index) => {
    try {
      const title = typeof raw?.[1] === "string" ? raw[1].trim() : "";
      if (!title) {
        return;
      }

      const typeCode = raw?.[3];
      const fieldData = raw?.[4]?.[0];
      const rawOptions = Array.isArray(fieldData?.[1]) ? fieldData[1] : [];

      const options = rawOptions
        .map(option => (typeof option?.[0] === "string" ? option[0].trim() : ""))
        .filter(Boolean);

      questions.push({
        title,
        isChoice: CHOICE_TYPE_CODES.has(typeCode) && options.length > 0,
        options
      });
    }
    catch {
      warnings.push("تعذر قراءة السؤال رقم " + (index + 1) + " من النموذج - تم تخطّيه.");
    }
  });

  return { questions, warnings };
}

// Mirrors how these exams are actually hand-typed elsewhere in this project (lettered أ/ب/ج/د
// choices) so the EXISTING, already-tuned AI question-detection prompt (import-ai-detect.js, built
// for scanning real exam documents) recognizes this synthesized text the same way it would a
// human-authored Word document - no changes to that prompt/schema are needed.
function questionToText(question, number) {
  const lines = [number + ". " + question.title];
  if (question.isChoice) {
    question.options.forEach((option, index) => {
      const letter = ARABIC_OPTION_LETTERS[index] || String(index + 1);
      lines.push(letter + ". " + option);
    });
  }
  return lines.join("\n");
}

async function extractPages(buffer) {
  const html = buffer.toString("utf8");
  const loadData = extractLoadDataArray(html);

  if (!loadData) {
    return {
      pages: [],
      warnings: ["تعذر قراءة أسئلة هذا النموذج - تأكد أنه نموذج عام (يمكن لأي شخص لديه الرابط عرضه)، وأن جوجل لم تُغيّر تصميم الصفحة."]
    };
  }

  const { questions, warnings } = extractQuestionsFromLoadData(loadData);

  if (!questions.length) {
    return {
      pages: [],
      warnings: warnings.length ? warnings : ["لم يُعثر على أي سؤال قابل للقراءة في هذا النموذج."]
    };
  }

  const pages = questions.map((question, index) => ({
    pageNumber: index + 1,
    text: questionToText(question, index + 1),
    kind: "text",
    images: []
  }));

  return { pages, warnings };
}

module.exports = { extractPages, extractLoadDataArray, extractQuestionsFromLoadData, questionToText };
