import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
const constructorArgsSeen = [];

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      constructor(options) {
        constructorArgsSeen.push(options);
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
    constructorArgsSeen.length = 0;
    process.env.ZAI_API_KEY = "test-key";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.QWEN_API_KEY = "test-key";
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

// Regression test for a second, real production incident: even after bounding every AI call to a
// short per-call timeout, a live request still took ~45s wall-clock and failed - LONGER than the
// 35s whole-request budget the timeout was supposed to fit inside. Root cause: the openai SDK
// retries a failed/timed-out request up to `maxRetries` additional times by default (documented
// default: 2), so a single "timeout: 20000" call could actually run up to ~3x that before finally
// rejecting. This feature already has its own higher-level retry mechanism (a failed chunk is
// caught and warned about; the resumable import-analyze loop picks up later chunks on a later
// call), so SDK-level retries must be disabled - otherwise `timeout` is a per-ATTEMPT limit, not
// the hard per-call ceiling the deadline math in import-analyze.js assumes it is.
describe("createClient - SDK-level retries are disabled for every provider", () => {
  beforeEach(() => {
    createMock.mockReset();
    constructorArgsSeen.length = 0;
    process.env.ZAI_API_KEY = "test-key";
    process.env.QWEN_API_KEY = "test-key";
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("passes maxRetries:0 when constructing the glm (Z.ai) client", async () => {
    const { createClient } = await import("../src/lib/import-ai-client.js");
    await createClient("glm");
    expect(constructorArgsSeen[0]).toMatchObject({ maxRetries: 0 });
  });

  it("passes maxRetries:0 when constructing the qwen client", async () => {
    const { createClient } = await import("../src/lib/import-ai-client.js");
    await createClient("qwen");
    expect(constructorArgsSeen[0]).toMatchObject({ maxRetries: 0 });
  });

  it("passes maxRetries:0 when constructing the openai client", async () => {
    const { createClient } = await import("../src/lib/import-ai-client.js");
    await createClient("openai");
    expect(constructorArgsSeen[0]).toMatchObject({ maxRetries: 0 });
  });
});

describe("normalizeProvider - Import Questions From Files defaults to OpenAI, not GLM", () => {
  it("defaults to openai for an empty/undefined value", async () => {
    const { normalizeProvider } = await import("../src/lib/import-ai-client.js");
    expect(normalizeProvider(undefined)).toBe("openai");
    expect(normalizeProvider("")).toBe("openai");
  });

  it("defaults to openai for an unrecognized/garbage value rather than silently landing on glm", async () => {
    const { normalizeProvider } = await import("../src/lib/import-ai-client.js");
    expect(normalizeProvider("not-a-real-provider")).toBe("openai");
  });

  it("still honors an explicit glm/qwen/qwenplus/openai request", async () => {
    const { normalizeProvider } = await import("../src/lib/import-ai-client.js");
    expect(normalizeProvider("glm")).toBe("glm");
    expect(normalizeProvider("qwen")).toBe("qwen");
    expect(normalizeProvider("qwenplus")).toBe("qwenplus");
    expect(normalizeProvider("openai")).toBe("openai");
  });
});
