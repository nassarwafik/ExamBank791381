// Minimal, OpenAI-only AI-provider client for the Exam Quality Auto-Fix feature. The teacher
// explicitly required OpenAI (never GLM/Qwen) for this feature specifically, so unlike the other
// AI-calling files in this codebase there is no provider dispatch at all - only the OpenAI
// responses.create + strict json_schema path. Modeled closely on import-ai-client.js's own
// createClient()/parseJsonObjectText()/callTextJson(), which itself documents why this codebase
// duplicates a small client per feature instead of sharing one: import-ai-client.js's top comment
// explicitly scopes it to "the file-import feature only" - this file follows the same convention
// for this feature, rather than reusing that module across two unrelated features.

async function loadOpenAI() {
  const module = await import("openai");
  return module.default;
}

// See import-ai-client.js for the production incident this guards against: the openai SDK retries
// a failed/timed-out call up to `maxRetries` times by default, silently multiplying wall-clock time
// past whatever `timeout` was requested. Auto-Fix calls one question at a time and surfaces a
// failure as "needs manual review" rather than retrying, so SDK-level retries must stay disabled.
const NO_SDK_RETRIES = { maxRetries: 0 };

async function createClient() {
  const OpenAI = await loadOpenAI();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return {
    client: new OpenAI({ apiKey, ...NO_SDK_RETRIES }),
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna"
  };
}

function parseJsonObjectText(value) {
  let text = String(value || "").trim();
  const fence = String.fromCharCode(96).repeat(3);

  if (text.startsWith(fence)) {
    text = text.slice(fence.length).trimStart();
    if (text.toLowerCase().startsWith("json")) {
      text = text.slice(4).trimStart();
    }
    if (text.endsWith(fence)) {
      text = text.slice(0, -fence.length).trimEnd();
    }
  }

  return JSON.parse(text);
}

// A single quality-fix call is for one question only (never a whole exam), so it comfortably fits
// well under Azure Static Web Apps' gateway timeout without needing import-analyze.js's dynamic,
// deadline-aware budget math - a fixed conservative ceiling is enough here.
const AI_CALL_TIMEOUT_MS = 25000;

async function callTextJson({ instructions, prompt, schema, schemaName, timeoutMs = AI_CALL_TIMEOUT_MS }) {
  const { client, model } = await createClient();

  const response = await client.responses.create({
    model,
    store: false,
    instructions,
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    text: { format: { type: "json_schema", name: schemaName, strict: true, schema } }
  }, { timeout: timeoutMs });

  if (!response.output_text) {
    throw new Error("OpenAI returned no output_text.");
  }

  return { result: parseJsonObjectText(response.output_text), model };
}

module.exports = { createClient, parseJsonObjectText, callTextJson, AI_CALL_TIMEOUT_MS };
