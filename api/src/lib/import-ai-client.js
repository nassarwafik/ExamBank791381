// Minimal AI-provider client for the file-import feature only. Deliberately NOT a refactor of the
// four existing functions that each duplicate this same GLM/Qwen/OpenAI dispatch (
// analyze-global-exam-instruction.js, interpret-exam-request.js, question-ai-action.js,
// classify-bank-batch.js/classify-question-preview.js) - touching any of those working files is
// out of scope here and carries real regression risk right after a production outage. This copy
// is modeled closely on analyze-global-exam-instruction.js's createClient()/parseJsonObjectText().

async function loadOpenAI() {
  const module = await import("openai");
  return module.default;
}

async function createClient(provider) {
  const OpenAI = await loadOpenAI();

  if (provider === "glm") {
    const apiKey = process.env.ZAI_API_KEY;
    if (!apiKey) {
      throw new Error("ZAI_API_KEY is not configured.");
    }
    return {
      client: new OpenAI({ apiKey, baseURL: process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4" }),
      model: process.env.ZAI_MODEL || "glm-5.3-flash",
      mode: "chat"
    };
  }

  if (provider === "qwen" || provider === "qwenplus") {
    const apiKey = process.env.QWEN_API_KEY;
    if (!apiKey) {
      throw new Error("QWEN_API_KEY is not configured.");
    }
    return {
      client: new OpenAI({ apiKey, baseURL: process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" }),
      model: provider === "qwenplus"
        ? (process.env.QWEN_PLUS_MODEL || "qwen3.7-plus")
        : (process.env.QWEN_MODEL || "qwen3.5-flash"),
      mode: "qwen"
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return {
    client: new OpenAI({ apiKey }),
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    mode: "responses"
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

function normalizeProvider(requested) {
  const value = String(requested || "glm").trim().toLowerCase();
  return ["glm", "qwen", "qwenplus", "openai"].includes(value) ? value : "glm";
}

// Sends one text-only prompt to the configured provider and returns the parsed JSON response,
// validated against `schema` via strict json_schema mode when the provider supports it (OpenAI
// responses API); GLM/Qwen use non-strict JSON mode, so callers MUST still validate/clamp every
// field of the parsed result themselves (see import-ai-detect.js's normalizeDetectedQuestion).
async function callTextJson({ provider, instructions, prompt, schema, schemaName, maxTokens = 3200 }) {
  const { client, model, mode } = await createClient(normalizeProvider(provider));

  if (mode === "responses") {
    const response = await client.responses.create({
      model,
      store: false,
      instructions,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      text: { format: { type: "json_schema", name: schemaName, strict: true, schema } }
    });
    return { result: parseJsonObjectText(response.output_text), provider: normalizeProvider(provider), model };
  }

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: prompt + "\nJSON schema:\n" + JSON.stringify(schema) }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: maxTokens,
    ...(mode === "qwen" ? { enable_thinking: false } : {})
  });

  return {
    result: parseJsonObjectText(response?.choices?.[0]?.message?.content),
    provider: normalizeProvider(provider),
    model
  };
}

// Vision fallback for a scanned page image. Always uses OpenAI's responses API + input_image
// (the one vision mechanism already proven in this codebase, in classify-bank-batch.js), rather
// than trying to route images through GLM/Qwen (unproven for this codebase's usage).
async function callVisionJson({ instructions, prompt, schema, schemaName, imageBuffer, contentType }) {
  const { client, model } = await createClient("openai");
  const dataUrl = `data:${contentType || "image/png"};base64,${imageBuffer.toString("base64")}`;

  const response = await client.responses.create({
    model,
    store: false,
    instructions,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl, detail: "high" }
        ]
      }
    ],
    text: { format: { type: "json_schema", name: schemaName, strict: true, schema } }
  });

  return { result: parseJsonObjectText(response.output_text), provider: "openai", model };
}

module.exports = { createClient, parseJsonObjectText, normalizeProvider, callTextJson, callVisionJson };
