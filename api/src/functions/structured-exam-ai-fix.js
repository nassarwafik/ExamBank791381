const { app } = require("@azure/functions");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { callTextJson } = require("../lib/quality-fix-ai-client");
const { withObservability } = require("../lib/observability");

/*
 * UX-6d — structured-exam AI answer-key PROPOSAL for ONE structured question or compound part at a time.
 *
 * This endpoint NEVER mutates an exam and NEVER returns a whole question. It returns an answer-shaped
 * PATCH the teacher must review and accept in the wizard, or `needsManualReview` with a safe Arabic
 * reason. It is separate from the legacy /api/exam-quality-fix (which targets legacy flat ExamDraft
 * questions and rebuilds text/options); that contract is untouched.
 *
 * Enforcement-by-omission: the per-type json_schema contains ONLY answer-shaped properties (a correct
 * option index, a boolean, or a value per EXISTING field id) plus a short `explanation`. It cannot carry
 * text, options, marks, ids, section, ordering, or images at all, so the AI can never redesign the exam.
 * Every proposal is then re-validated against the CURRENT question before it is returned (index in range,
 * word-bank/matching value reachable from existing choices, one value per existing field id, question id
 * matches the request). An invalid proposal is returned as needsManualReview, never as an applicable patch.
 *
 * The configured quality-fix AI client (quality-fix-ai-client.js, OpenAI only) is reused unchanged — no
 * new provider, no provider-selection UI, no API key on the frontend. It is text-only: a question whose
 * answer depends on an image is returned as needsManualReview rather than guessed.
 */

const AI_SUPPORTED_TYPES = ["multipleChoice", "trueFalse", "multiTrueFalse", "fillBlank", "wordBank", "ordering", "matching", "tableFill", "cliFill"];
const str = v => (v == null ? "" : String(v)).trim();
const optionText = o => str(o && (o.text != null ? o.text : o.label != null ? o.label : o.value));

function questionHasImage(question) {
  const img = question && question.image;
  if (img && img.exists && Array.isArray(img.assets) && img.assets.some(a => a && str(a.dataUrl))) return true;
  return Array.isArray(question && question.images) && question.images.some(a => a && str(a.dataUrl));
}

// The reachable answer choices for one field (word-bank/select/matching): the field's own options, else the
// question's canonical word bank. Used to VALIDATE an AI value, never to invent a choice.
function choicesForField(field, question) {
  const own = (Array.isArray(field.options) ? field.options : []).map(optionText).filter(Boolean);
  if (own.length) return own;
  const bank = (Array.isArray(question.wordBank) ? question.wordBank : []).map(str).filter(Boolean);
  return bank;
}

// Per-type strict schema. Only answer-shaped keys + explanation. additionalProperties:false everywhere so
// no protected property can ever appear.
function buildProposalSchema(type, fieldIds) {
  const explanation = { type: "string" };
  if (type === "multipleChoice") {
    return { type: "object", additionalProperties: false, required: ["correctOptionIndex", "explanation"], properties: { correctOptionIndex: { type: "integer", minimum: 0, maximum: 50 }, explanation } };
  }
  if (type === "trueFalse") {
    return { type: "object", additionalProperties: false, required: ["correct", "explanation"], properties: { correct: { type: "boolean" }, explanation } };
  }
  if (type === "multiTrueFalse") {
    return {
      type: "object", additionalProperties: false, required: ["fieldBooleans", "explanation"],
      properties: {
        fieldBooleans: { type: "array", maxItems: 40, items: { type: "object", additionalProperties: false, required: ["id", "value"], properties: { id: { type: "string", enum: fieldIds }, value: { type: "boolean" } } } },
        explanation
      }
    };
  }
  return {
    type: "object", additionalProperties: false, required: ["fieldValues", "explanation"],
    properties: {
      fieldValues: { type: "array", maxItems: 40, items: { type: "object", additionalProperties: false, required: ["id", "value"], properties: { id: { type: "string", enum: fieldIds }, value: { type: "string" } } } },
      explanation
    }
  };
}

function buildProposalPrompt(question, issueCodes) {
  const type = str(question.presentationType);
  const lines = [
    "You are proposing the CORRECT ANSWER KEY for ONE existing exam question from a high-school computer-networking exam. This is a teacher-review PROPOSAL, not a final change.",
    "You must NOT rewrite the question, its text, its options, its fields, its marks, or its section. Return ONLY the answer-key values requested by the schema.",
    "Detected answer-key issues for this question: " + issueCodes.join(", "),
    "Question JSON: " + JSON.stringify({
      presentationType: type,
      text: str(question.text),
      options: (Array.isArray(question.options) ? question.options : []).map((o, i) => ({ index: i, text: optionText(o) })),
      fields: (Array.isArray(question.fields) ? question.fields : []).map(f => ({ id: str(f.id), label: str(f.label), statement: str(f.statement), kind: str(f.kind), options: (Array.isArray(f.options) ? f.options : []).map(optionText).filter(Boolean) })),
      wordBank: (Array.isArray(question.wordBank) ? question.wordBank : []).map(str),
      cli: str(question.cli),
      tableHeaders: Array.isArray(question.tableHeaders) ? question.tableHeaders : [],
      tableRows: Array.isArray(question.tableRows) ? question.tableRows : []
    })
  ];
  if (type === "multipleChoice") lines.push("Return the zero-based index of the single correct option in `correctOptionIndex`. It MUST be an existing option index.");
  else if (type === "trueFalse") lines.push("Return the correct boolean in `correct`.");
  else if (type === "multiTrueFalse") lines.push("Return one entry in `fieldBooleans` for EVERY field, using that field's exact `id`, with the correct true/false value for its statement.");
  else if (type === "wordBank") lines.push("Return one entry in `fieldValues` per blank using its exact field `id`. Each value MUST be one of that blank's existing options / the question's existing word bank — do NOT invent a new word.");
  else if (type === "matching") lines.push("Return one entry in `fieldValues` per left-hand item using its exact field `id`. Each value MUST be one of that item's existing options — do NOT invent a new choice.");
  else if (type === "ordering") lines.push("Return one entry in `fieldValues` per item using its exact field `id`, with the correct 1-based position as a string.");
  else if (type === "tableFill") lines.push("Return one entry in `fieldValues` per answerable cell using its exact field `id`. For a select cell the value MUST be one of that cell's existing options.");
  else if (type === "cliFill") lines.push("Return one entry in `fieldValues` per CLI placeholder using its exact field `id`, with the exact command/value that belongs there.");
  lines.push("`explanation` is a short (one sentence) Arabic justification. Do NOT include any confidence score. Use Arabic unless a CLI/command value must be English.");
  return lines.join("\n");
}

// Validates an AI result against the CURRENT question. Returns { patch } (client StructuredAiPatch shape),
// or { needsManualReview:true, reason } when anything does not fit. NEVER trusts the AI: every value is
// checked against the question's existing structure and choices.
function validateProposal(result, question) {
  const type = str(question.presentationType);
  const explanation = str(result && result.explanation);
  if (type === "multipleChoice") {
    const opts = Array.isArray(question.options) ? question.options : [];
    const i = Number(result && result.correctOptionIndex);
    if (!Number.isInteger(i) || i < 0 || i >= opts.length) return { needsManualReview: true, reason: "لم يُرجِع النموذج خيارًا صحيحًا ضمن الخيارات الموجودة." };
    return { patch: { correctOptionIndex: i }, explanation };
  }
  if (type === "trueFalse") {
    if (typeof (result && result.correct) !== "boolean") return { needsManualReview: true, reason: "لم يُرجِع النموذج قيمة صح/خطأ صالحة." };
    return { patch: { correct: result.correct }, explanation };
  }
  const fields = Array.isArray(question.fields) ? question.fields : [];
  if (!fields.length) return { needsManualReview: true, reason: "لا توجد حقول إجابة في هذا السؤال." };
  const fieldById = new Map(fields.map(f => [str(f.id), f]));

  if (type === "multiTrueFalse") {
    const arr = Array.isArray(result && result.fieldBooleans) ? result.fieldBooleans : [];
    const map = {};
    for (const entry of arr) { const id = str(entry && entry.id); if (fieldById.has(id) && typeof entry.value === "boolean") map[id] = entry.value; }
    if (fields.some(f => typeof map[str(f.id)] !== "boolean")) return { needsManualReview: true, reason: "لم يُرجِع النموذج إجابة لكل بند." };
    return { patch: { fieldBooleans: map }, explanation };
  }

  const arr = Array.isArray(result && result.fieldValues) ? result.fieldValues : [];
  const map = {};
  for (const entry of arr) { const id = str(entry && entry.id); if (fieldById.has(id)) map[id] = str(entry.value); }
  if (fields.some(f => str(map[str(f.id)]) === "")) return { needsManualReview: true, reason: "لم يُرجِع النموذج قيمة لكل فراغ." };
  // Reachability for constrained types: the value must already be a choice — the AI may never add a word.
  if (type === "wordBank" || type === "matching" || type === "tableFill") {
    for (const f of fields) {
      const choices = choicesForField(f, question);
      const isSelect = type !== "tableFill" || str(f.kind) === "select";
      if (choices.length && isSelect && !choices.includes(map[str(f.id)])) {
        return { needsManualReview: true, reason: "الإجابة المقترحة لأحد الحقول ليست من الخيارات المتاحة." };
      }
    }
  }
  return { patch: { fieldValues: map }, explanation };
}

async function handler(request, deps = {}) {
  const authFn = deps.requireBuilderAuth || requireBuilderAuth;
  const ai = deps.callTextJson || callTextJson;
  try {
    const auth = authFn(request);
    if (!auth.ok) return auth.response;

    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const question = body && body.question;
    const type = question && str(question.presentationType);
    if (!question || !AI_SUPPORTED_TYPES.includes(type)) {
      return { status: 400, jsonBody: { ok: false, error: "نوع السؤال غير مدعوم لاقتراح الذكاء الاصطناعي." } };
    }
    const issueCodes = Array.isArray(body.issueCodes) ? body.issueCodes.map(str).filter(Boolean) : [];
    if (!issueCodes.length) return { status: 400, jsonBody: { ok: false, error: "لا توجد مشكلة إجابة تتطلب اقتراحًا." } };
    const fingerprint = str(body.fingerprint);
    const questionId = str(body.questionId || question.id);

    // Image-dependent question: the reused text-only AI path cannot see the diagram, so never guess.
    if (questionHasImage(question)) {
      return { status: 200, jsonBody: { ok: true, needsManualReview: true, reason: "يحتاج مراجعة يدوية — الإجابة تعتمد على صورة.", questionId, fingerprint } };
    }

    const fieldIds = (Array.isArray(question.fields) ? question.fields : []).map(f => str(f.id)).filter(Boolean);
    if ((type === "multiTrueFalse" || ["fillBlank", "wordBank", "ordering", "matching", "tableFill", "cliFill"].includes(type)) && !fieldIds.length) {
      return { status: 200, jsonBody: { ok: true, needsManualReview: true, reason: "لا توجد حقول إجابة يمكن اقتراح قيم لها.", questionId, fingerprint } };
    }

    const schema = buildProposalSchema(type, fieldIds);
    const prompt = buildProposalPrompt(question, issueCodes);

    let result;
    try {
      ({ result } = await ai({ instructions: "Return only the requested answer-key proposal JSON.", prompt, schema, schemaName: "structured_answer_proposal" }));
    } catch {
      return { status: 200, jsonBody: { ok: true, needsManualReview: false, failed: true, reason: "تعذّر الاقتراح — أعد المحاولة لاحقًا.", questionId, fingerprint } };
    }

    const verdict = validateProposal(result, question);
    if (verdict.needsManualReview) {
      return { status: 200, jsonBody: { ok: true, needsManualReview: true, reason: verdict.reason, questionId, fingerprint } };
    }
    return { status: 200, jsonBody: { ok: true, proposal: { patch: verdict.patch, explanation: verdict.explanation, presentationType: type, questionId, fingerprint } } };
  } catch {
    return { status: 500, jsonBody: { ok: false, error: "تعذّر اقتراح الإجابة حاليًا." } };
  }
}

app.http("structuredExamAiFix", { methods: ["POST"], authLevel: "anonymous", route: "structured-exam-ai-fix", handler: withObservability("structured-exam-ai-fix", (request, deps) => handler(request, deps && deps.callTextJson ? deps : {})) });

module.exports = { handler, buildProposalSchema, buildProposalPrompt, validateProposal, questionHasImage, choicesForField, AI_SUPPORTED_TYPES };
