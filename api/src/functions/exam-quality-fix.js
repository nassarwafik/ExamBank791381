
const { app } = require("@azure/functions");

const { requireBuilderAuth } = require("../lib/builder-auth");
const { callTextJson } = require("../lib/quality-fix-ai-client");

// Deliberate duplicate of the same tiny markdown-table-row parser already used in
// assignment-grading.js's tableRows() (and src/questionContent.tsx's parseTable() on the
// frontend) - not exported from either of those files, and this endpoint only needs the row list,
// not the full ParsedTable shape, so a small local copy avoids adding a cross-file dependency to a
// working grading path for one field.
function tableRows(text) {
  const lines = String(text || "").split(/\r?\n/).map(x => x.trim()).filter(x => x.startsWith("|") && x.endsWith("|"));
  if (lines.length < 2) return [];
  const split = line => line.slice(1, -1).split("|").map(x => x.trim());
  const rows = lines.map(split).filter(c => !c.every(x => /^:?-{3,}:?$/.test(x.replace(/\s/g, ""))));
  return rows.length > 1 ? rows.slice(1) : [];
}

const VALID_PRESENTATION_TYPES = ["multipleChoice", "fillBlank", "wordBank", "open", "matching", "ordering"];

// additionalProperties:false + an explicit property list is what keeps the AI from ever being able
// to return topic/difficulty/section/marks/origin/images at all - the same enforcement-by-omission
// pattern already proven in question-ai-action.js's buildSchema(). fields[] carries one entry per
// table row (or per fillBlank/wordBank field) with its own options, so table rows can each get a
// different inferred option set instead of one shared word bank.
function buildSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      text: { type: "string" },
      presentationType: { type: "string", enum: VALID_PRESENTATION_TYPES },
      options: { type: "array", maxItems: 8, items: { type: "string" } },
      fields: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            options: { type: "array", maxItems: 6, items: { type: "string" } },
            isBoolean: { type: "boolean" }
          },
          required: ["label", "options", "isBoolean"]
        }
      },
      fieldAnswers: { type: "array", maxItems: 12, items: { type: "string" } },
      wordBank: { type: "array", maxItems: 16, items: { type: "string" } },
      answerText: { type: "string" },
      correctOptionIndex: { type: "integer", minimum: -1, maximum: 7 }
    },
    required: ["text", "presentationType", "options", "fields", "fieldAnswers", "wordBank", "answerText", "correctOptionIndex"]
  };
}

function buildPrompt(question, issueCodes) {
  const rows = tableRows(question?.text);

  return [
    "You are fixing solvability/gradability problems in ONE exam question from a high-school computer networking exam bank.",
    "You must NOT replace this question with a different one, and must NOT invent a new question or a different learning objective.",
    "Do not change the difficulty, section, topic, or marks of this question - those are handled elsewhere and are not part of what you return.",
    "Only change the question text if truly unavoidable to make it solvable; otherwise return the text unchanged.",
    "Quality issues detected for this question: " + issueCodes.join(", "),
    "Current question JSON: " + JSON.stringify({
      text: question?.text || "",
      presentationType: question?.presentationType || "",
      options: question?.options || [],
      fields: question?.fields || [],
      answer: question?.answer || {},
      wordBank: question?.wordBank || []
    }),
    rows.length
      ? "This question contains a table with " + rows.length + " data row(s) (row labels: " +
        rows.map(r => r[0]).join(", ") +
        "). Return exactly one entry in `fields` per row, IN THE SAME ORDER, with `label` set to that row's label. " +
        "For each row, infer 2-5 sensible dropdown options based on what that column actually represents (for example: صالح/غير صالح for an address-validity column, خاص/عام for a public/private classification, A/B/C for an IP address class, or a plausible set of protocol/technology names) - include the correct answer plus reasonable, non-silly distractors, in the same language as the question. " +
        "Set `isBoolean:true` only when the row is genuinely a true/false judgment (e.g. \"is this a valid host address?\"), and in that case still set `options` to two Arabic labels [\"صحيح\",\"غير صحيح\"]. " +
        "If every row shares the same answer domain, you may reuse the same options list for all of them; otherwise vary options per row. " +
        "Return the correct value for each row in `fieldAnswers`, at the same index as its field, and it MUST exactly match one of that row's `options` values - EXCEPT when isBoolean is true, in which case `fieldAnswers` for that row must be the literal English string \"true\" or \"false\" (lowercase, not the Arabic label), since that is the value the student's dropdown actually submits."
      : "For fillBlank/wordBank fields (if any), return one `fields` entry per blank with inferred `options` and the correct value at the matching index in `fieldAnswers`.",
    question?.presentationType === "matching" && rows.length
      ? "This is a MATCHING question specifically: every row's `options` MUST be the exact same shared list (the pool of right-hand terms to match against), not a different set per row, and no row should be `isBoolean`."
      : "",
    question?.presentationType === "ordering"
      ? "This is an ORDERING question: each entry in `fields` is one item from a list the student must arrange into the correct sequence (leave its `options` empty and `isBoolean` false). Return, at the matching index in `fieldAnswers`, the correct 1-based position of that item as a string (e.g. \"1\", \"2\", ...) - do not return `wordBank`, the position numbers are generated automatically."
      : "",
    "For multipleChoice, provide 4 plausible options in `options` and a zero-based `correctOptionIndex`.",
    "For a question with no answer model at all, solve the question yourself and provide a complete, correct answer using whichever of these fields fits its presentationType.",
    "For open questions, provide the answer in `answerText`.",
    "Use clear Arabic appropriate for the exam unless technical CLI/code requires English."
  ].filter(Boolean).join("\n");
}

// Pure and exported for testing. Builds the fields the caller should merge onto the original
// question - never the whole question object - so any property this function doesn't touch (most
// importantly topic/difficulty/section/marks/origin/images/examQuestionId) is guaranteed to survive
// untouched by simply never being read from `result` here, mirroring question-ai-action.js's
// convertResult() approach.
function buildQualityFixPatch(result, currentQuestion) {
  const presentationType = VALID_PRESENTATION_TYPES.includes(result?.presentationType)
    ? result.presentationType
    : currentQuestion.presentationType;

  const options = presentationType === "multipleChoice"
    ? (Array.isArray(result.options) ? result.options : []).map((text, index) => ({
        value: String(index + 1),
        text: String(text || ""),
        order: index + 1
      }))
    : [];

  const rawFields = Array.isArray(result.fields) ? result.fields : [];
  const fieldAnswers = Array.isArray(result.fieldAnswers) ? result.fieldAnswers.map(v => String(v ?? "")) : [];

  const fields = rawFields.map((field, index) => {
    const isBoolean = field?.isBoolean === true;
    const cleanedOptions = (Array.isArray(field?.options) ? field.options : [])
      .map(v => String(v ?? "").trim())
      .filter(Boolean);

    return {
      id: "quality-fix-field-" + (index + 1),
      label: String(field?.label || ("Row " + (index + 1))),
      order: index,
      kind: isBoolean ? "boolean" : "select",
      options: isBoolean ? [] : cleanedOptions.map((value, optionIndex) => ({ value, order: optionIndex }))
    };
  });

  const hasTable = tableRows(currentQuestion?.text).length > 0;

  let answer = currentQuestion?.answer || {};

  if (presentationType === "multipleChoice") {
    const correctIndex = Number(result.correctOptionIndex);
    answer = {
      correctOptionIndex: Number.isInteger(correctIndex) ? correctIndex : -1,
      correctAnswer: Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < options.length
        ? options[correctIndex].text
        : String(result.answerText || "")
    };
  }
  else if (hasTable && fields.length) {
    // Table rows are graded via assignment-grading.js's gradeTable()/pairMap(), which expects
    // answer.text as "rowLabel=correctValue;rowLabel2=correctValue2..." - building that string here
    // from fields/fieldAnswers means zero grading-code changes are needed for AI-authored tables.
    const pairs = fields
      .map((field, index) => {
        const value = fieldAnswers[index];
        return value ? field.label + "=" + value : null;
      })
      .filter(Boolean);
    answer = { text: pairs.join(";") };
  }
  else if (presentationType === "fillBlank" || presentationType === "wordBank" || presentationType === "ordering") {
    answer = { mode: "exactSequence", values: fieldAnswers };
  }
  else {
    answer = { text: String(result.answerText || "") };
  }

  const wordBank = Array.from(new Set(
    (Array.isArray(result.wordBank) ? result.wordBank : [])
      .map(v => String(v || "").trim())
      .filter(Boolean)
  ));

  // Ordering's word bank is just the position numbers 1..N, deterministic from the field count -
  // built here in code rather than trusted to the AI, since there's only ever one correct set.
  const orderingWordBank = fields.map((_, index) => String(index + 1));

  return {
    presentationType,
    text: String(result.text || currentQuestion?.text || "").trim(),
    options,
    fields,
    answer,
    wordBank: presentationType === "ordering"
      ? orderingWordBank
      : (presentationType === "fillBlank" || presentationType === "wordBank") ? wordBank : (currentQuestion?.wordBank || [])
  };
}

app.http("examQualityFix", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "exam-quality-fix",
  handler: async request => {
    try {
      const auth = requireBuilderAuth(request);
      if (!auth.ok) {
        return auth.response;
      }

      let body = {};
      try {
        body = await request.json();
      }
      catch {
        body = {};
      }

      const question = body?.question;
      if (!question || typeof question.text !== "string") {
        return { status: 400, jsonBody: { ok: false, error: "Question is required." } };
      }

      const issueCodes = Array.isArray(body?.issueCodes) ? body.issueCodes.map(String).filter(Boolean) : [];
      if (!issueCodes.length) {
        return { status: 400, jsonBody: { ok: false, error: "At least one issue code is required." } };
      }

      const schema = buildSchema();
      const prompt = buildPrompt(question, issueCodes);

      const { result } = await callTextJson({
        instructions: "Return only the requested structured question-fix JSON.",
        prompt,
        schema,
        schemaName: "exam_quality_fix"
      });

      const patch = buildQualityFixPatch(result, question);

      return { status: 200, jsonBody: { ok: true, patch } };
    }
    catch {
      return { status: 500, jsonBody: { ok: false, error: "تعذر إصلاح هذا السؤال تلقائيًا حاليًا." } };
    }
  }
});

module.exports = { buildQualityFixPatch, buildPrompt, buildSchema };
