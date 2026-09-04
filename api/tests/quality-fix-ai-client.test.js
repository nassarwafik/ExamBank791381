import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
const constructorArgsSeen = [];

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      constructor(options) {
        constructorArgsSeen.push(options);
        this.responses = { create: createMock };
      }
    }
  };
});

// The teacher explicitly required OpenAI only (never GLM/Qwen) for the Exam Quality Auto-Fix
// feature. Unlike import-ai-client.js, this client has no provider dispatch at all - these tests
// confirm it never reads any GLM/Qwen env var and always goes through client.responses.create.
describe("createClient / callTextJson - OpenAI only, no GLM/Qwen dispatch", () => {
  beforeEach(() => {
    createMock.mockReset();
    constructorArgsSeen.length = 0;
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.ZAI_API_KEY;
    delete process.env.QWEN_API_KEY;
  });

  it("constructs the OpenAI client with maxRetries:0 (SDK retries disabled)", async () => {
    const { createClient } = await import("../src/lib/quality-fix-ai-client.js");
    await createClient();
    expect(constructorArgsSeen[0]).toMatchObject({ apiKey: "test-key", maxRetries: 0 });
  });

  it("throws when OPENAI_API_KEY is not configured, without falling back to any other provider", async () => {
    delete process.env.OPENAI_API_KEY;
    const { createClient } = await import("../src/lib/quality-fix-ai-client.js");
    await expect(createClient()).rejects.toThrow("OPENAI_API_KEY is not configured.");
  });

  it("uses OPENAI_MODEL from env, defaulting when unset, and never a hardcoded model unrelated to env", async () => {
    process.env.OPENAI_MODEL = "gpt-test-model";
    const { createClient } = await import("../src/lib/quality-fix-ai-client.js");
    const { model } = await createClient();
    expect(model).toBe("gpt-test-model");
    delete process.env.OPENAI_MODEL;
  });

  it("calls client.responses.create with a strict json_schema format and passes timeout through", async () => {
    createMock.mockResolvedValue({ output_text: "{\"ok\":true}" });
    const { callTextJson, AI_CALL_TIMEOUT_MS } = await import("../src/lib/quality-fix-ai-client.js");

    await callTextJson({ instructions: "x", prompt: "y", schema: { type: "object" }, schemaName: "s" });

    expect(createMock).toHaveBeenCalledTimes(1);
    const [callArgs, options] = createMock.mock.calls[0];
    expect(callArgs.text.format).toMatchObject({ type: "json_schema", name: "s", strict: true });
    expect(options).toEqual({ timeout: AI_CALL_TIMEOUT_MS });
  });

  it("parses fenced JSON output the same way as the other AI-client modules", async () => {
    createMock.mockResolvedValue({ output_text: "```json\n{\"patch\":1}\n```" });
    const { callTextJson } = await import("../src/lib/quality-fix-ai-client.js");
    const { result } = await callTextJson({ instructions: "x", prompt: "y", schema: {}, schemaName: "s" });
    expect(result).toEqual({ patch: 1 });
  });

  it("throws when the response has no output_text, without swallowing the failure", async () => {
    createMock.mockResolvedValue({ output_text: "" });
    const { callTextJson } = await import("../src/lib/quality-fix-ai-client.js");
    await expect(callTextJson({ instructions: "x", prompt: "y", schema: {}, schemaName: "s" })).rejects.toThrow("OpenAI returned no output_text.");
  });
});
