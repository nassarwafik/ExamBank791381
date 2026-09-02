import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      constructor() {
        this.chat = { completions: { create: createMock } };
        this.responses = { create: createMock };
      }
    }
  };
});

// Regression test for a real production incident: a large import (~30 questions, several
// sequential AI chunk calls) hit Azure Static Web Apps' own gateway timeout, which is shorter
// than this module's internal budget - the platform severed the connection and returned a raw,
// non-JSON "Backend call failure" response no try/catch in this codebase could ever intercept.
// The fix is to bound every individual AI call well under any plausible gateway ceiling so a slow
// call fails as an ordinary, catchable JS error instead of a platform-level crash. This test
// proves the bound is actually threaded through to the SDK call, not just present in a comment.
describe("callTextJson / callVisionJson - AI_CALL_TIMEOUT_MS is actually passed to the SDK", () => {
  beforeEach(() => {
    createMock.mockReset();
    process.env.ZAI_API_KEY = "test-key";
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("passes a timeout option to chat.completions.create for a chat-mode provider (glm)", async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: "{\"questions\":[]}" } }] });
    const { callTextJson, AI_CALL_TIMEOUT_MS } = await import("../src/lib/import-ai-client.js");

    await callTextJson({ provider: "glm", instructions: "x", prompt: "y", schema: {}, schemaName: "s" });

    expect(createMock).toHaveBeenCalledTimes(1);
    const [, options] = createMock.mock.calls[0];
    expect(options).toEqual({ timeout: AI_CALL_TIMEOUT_MS });
  });

  it("passes the same timeout option to responses.create for a responses-mode provider (openai)", async () => {
    createMock.mockResolvedValue({ output_text: "{\"questions\":[]}" });
    const { callTextJson, AI_CALL_TIMEOUT_MS } = await import("../src/lib/import-ai-client.js");

    await callTextJson({ provider: "openai", instructions: "x", prompt: "y", schema: {}, schemaName: "s" });

    const [, options] = createMock.mock.calls[0];
    expect(options).toEqual({ timeout: AI_CALL_TIMEOUT_MS });
  });

  it("a timed-out/rejected call surfaces as an ordinary rejected promise the caller can catch", async () => {
    createMock.mockRejectedValue(new Error("Request timed out."));
    const { callTextJson } = await import("../src/lib/import-ai-client.js");

    await expect(
      callTextJson({ provider: "glm", instructions: "x", prompt: "y", schema: {}, schemaName: "s" })
    ).rejects.toThrow("Request timed out.");
  });

  it("keeps the AI_CALL_TIMEOUT_MS fallback default comfortably under a full request budget", async () => {
    const { AI_CALL_TIMEOUT_MS } = await import("../src/lib/import-ai-client.js");
    // AI_CALL_TIMEOUT_MS is only ever used as a fallback when a caller doesn't pass its own
    // timeoutMs - import-analyze.js's real production path always computes a dynamic,
    // deadline-aware value instead (see runRemainingChunks's aiTimeoutMs calculation), which can
    // be smaller OR larger than this default depending on how much of the request budget remains.
    // This default still shouldn't itself be an unreasonably large fraction of a short request.
    expect(AI_CALL_TIMEOUT_MS).toBeLessThan(35000);
  });
});
