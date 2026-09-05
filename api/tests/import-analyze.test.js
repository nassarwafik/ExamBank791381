import { describe, it, expect, vi } from "vitest";
import { serializeStateForStorage, deserializeStateFromStorage, runRemainingChunks, resolveImportProvider, extractorForKind } from "../src/functions/import-analyze.js";
import { mergeChunkResults } from "../src/lib/import-ai-detect.js";

describe("extractorForKind - dispatches purely on manifest.detectedKind", () => {
  it("routes pdf, docx, gform, and html/anything-else to four distinct extractor functions", () => {
    const pdf = extractorForKind("pdf");
    const docx = extractorForKind("docx");
    const gform = extractorForKind("gform");
    const html = extractorForKind("html");
    const fallback = extractorForKind("anything-unrecognized");

    [pdf, docx, gform, html].forEach(fn => expect(typeof fn).toBe("function"));
    expect(pdf).not.toBe(docx);
    expect(pdf).not.toBe(gform);
    expect(pdf).not.toBe(html);
    expect(docx).not.toBe(gform);
    expect(docx).not.toBe(html);
    expect(gform).not.toBe(html);
    // Anything not explicitly pdf/docx/gform (including a legacy/unknown kind) falls back to the
    // same html extractor "html" itself resolves to - never a hard error on an unrecognized kind.
    expect(fallback).toBe(html);
  });
});

describe("state <-> storage Buffer serialization boundary", () => {
  it("round-trips a chunk image buffer through JSON as base64, not the broken default {type:'Buffer',data:[...]} shape", () => {
    const originalBuffer = Buffer.from("hello image bytes");
    const state = {
      importJobId: "imp-test",
      totalChunks: 1,
      processedChunks: 0,
      chunks: [{ chunkIndex: 0, pageNumbers: [1], text: "", images: [{ id: "img-1", buffer: originalBuffer, contentType: "image/png" }] }],
      results: []
    };

    const serialized = serializeStateForStorage(state);
    // Simulate the actual JSON.stringify -> upload -> download -> JSON.parse round trip.
    const roundTripped = JSON.parse(JSON.stringify(serialized));
    const restored = deserializeStateFromStorage(roundTripped);

    const restoredBuffer = restored.chunks[0].images[0].buffer;
    expect(Buffer.isBuffer(restoredBuffer)).toBe(true);
    expect(restoredBuffer.equals(originalBuffer)).toBe(true);
    expect(restoredBuffer.toString("base64")).toBe(originalBuffer.toString("base64"));
  });

  it("handles a chunk with no images", () => {
    const state = { chunks: [{ chunkIndex: 0, pageNumbers: [1], text: "hi", images: [] }] };
    const restored = deserializeStateFromStorage(JSON.parse(JSON.stringify(serializeStateForStorage(state))));
    expect(restored.chunks[0].images).toEqual([]);
  });
});

describe("runRemainingChunks - deadline-aware chunk processing", () => {
  // Production-matching defaults (see import-analyze.js): 35s request budget, 5s safety margin
  // reserved for post-loop work (merge/link/serialize/respond), 20s max per AI call, 5s floor
  // below which starting a new call isn't worth it.
  const DEFAULTS = { requestBudgetMs: 35000, safetyMarginMs: 5000, maxAiTimeoutMs: 20000, minUsefulAiTimeoutMs: 5000 };

  function makeState(processedChunks, totalChunks) {
    return {
      processedChunks,
      totalChunks,
      results: [],
      chunks: Array.from({ length: totalChunks }, (_, i) => ({ chunkIndex: i, pageNumbers: [i + 1], text: "x", images: [] }))
    };
  }

  // Returns a `now` fn that yields each value in `sequence` in turn (one call per loop iteration's
  // elapsed-time check), holding the last value if called more times than the sequence has.
  function sequencedClock(sequence) {
    let index = 0;
    return () => sequence[Math.min(index++, sequence.length - 1)];
  }

  it("calls the detector zero times when the job is already fully processed (status was 'done')", async () => {
    const state = makeState(3, 3);
    const detector = vi.fn().mockResolvedValue({ pageNumbers: [1], questions: [] });
    const onChunkDone = vi.fn().mockResolvedValue(undefined);

    await runRemainingChunks(state, { detector, onChunkDone, warnings: [], startedAt: 0, now: sequencedClock([0]), ...DEFAULTS });

    expect(detector).not.toHaveBeenCalled();
    expect(onChunkDone).not.toHaveBeenCalled();
    expect(state.processedChunks).toBe(3);
  });

  it("calls the detector exactly once per remaining chunk when comfortably under budget (a resumed 'partial' job)", async () => {
    const state = makeState(1, 3);
    const detector = vi.fn().mockResolvedValue({ pageNumbers: [1], questions: [] });
    const onChunkDone = vi.fn().mockResolvedValue(undefined);

    await runRemainingChunks(state, { detector, onChunkDone, warnings: [], startedAt: 0, now: sequencedClock([0, 1000]), ...DEFAULTS });

    expect(detector).toHaveBeenCalledTimes(2);
    expect(state.processedChunks).toBe(3);
  });

  // A genuine chunk failure (AI call throws/times out) must NEVER be treated as "this chunk had 0
  // questions" and must NEVER let the loop continue on to later chunks in the same request - the
  // exact same chunk index has to be retried on a later import-analyze call, not silently skipped.
  it("stops immediately on a chunk failure (does not continue to the next chunk, does not fabricate a questions:[] result)", async () => {
    const state = makeState(0, 3);
    const detector = vi.fn()
      .mockRejectedValueOnce(new Error("OPENAI_API_KEY is not configured."))
      .mockResolvedValue({ pageNumbers: [2], questions: [] });
    const warnings = [];

    const { lastChunkError } = await runRemainingChunks(state, { detector, onChunkDone: async () => {}, warnings, startedAt: 0, now: sequencedClock([0]), ...DEFAULTS });

    expect(detector).toHaveBeenCalledTimes(1);
    expect(state.processedChunks).toBe(0);
    expect(state.results).toHaveLength(0);
    expect(lastChunkError).toBe("OPENAI_API_KEY is not configured.");
    expect(warnings.some(w => w.includes("OPENAI_API_KEY is not configured."))).toBe(true);
  });

  // Requirement: "OpenAI timeout -> questions لا تتحول إلى [] -> processedChunks لا يزيد ->
  // status partial -> المحاولة التالية يمكن أن تعيد نفس chunk."
  it("(E) an OpenAI timeout leaves processedChunks unchanged so the same chunk can be retried next time", async () => {
    const state = makeState(1, 3); // chunk 0 already done; chunk 1 is about to be retried
    const detector = vi.fn().mockRejectedValue(new Error("Request timed out."));

    const { lastChunkError } = await runRemainingChunks(state, { detector, onChunkDone: async () => {}, warnings: [], startedAt: 0, now: sequencedClock([0]), ...DEFAULTS });

    expect(state.processedChunks).toBe(1); // unchanged - chunk index 1 is still "next up"
    expect(lastChunkError).toBe("Request timed out.");
    // Re-running with the SAME state (as a later import-analyze call would) retries chunk 1 again.
    const detectorRetry = vi.fn().mockResolvedValue({ pageNumbers: [2], questions: [{ text: "recovered" }] });
    await runRemainingChunks(state, { detector: detectorRetry, onChunkDone: async () => {}, warnings: [], startedAt: 0, now: sequencedClock([0, 1000]), ...DEFAULTS });
    expect(detectorRetry).toHaveBeenCalledTimes(2); // chunk 1 (retried) then chunk 2
    expect(state.processedChunks).toBe(3);
  });

  // Requirement: real end-to-end shape - extraction succeeds, a non-empty chunk is handed to an
  // OpenAI-mocked detector that returns 10 questions, and the final merged result has exactly 10
  // questions with the request reporting status "done" (processedChunks === totalChunks).
  it("(F) a non-empty chunk detected by a mocked OpenAI detector yields 10 merged questions and status done", async () => {
    const state = makeState(0, 1);
    state.chunks[0].text = "10 real questions worth of extracted HTML text";
    const tenQuestions = Array.from({ length: 10 }, (_, i) => ({
      questionNumberGuess: String(i + 1), topic: null, difficulty: null, presentationType: null,
      text: `Question ${i + 1}`, options: [], hasVisibleAnswer: false, answerText: "", confidence: 0.9
    }));
    const detector = vi.fn().mockResolvedValue({ pageNumbers: [1], questions: tenQuestions });

    const { lastChunkError } = await runRemainingChunks(state, { detector, onChunkDone: async () => {}, warnings: [], startedAt: 0, now: sequencedClock([0]), ...DEFAULTS });

    expect(lastChunkError).toBeNull();
    expect(state.processedChunks).toBe(state.totalChunks); // caller computes status:"done" from this
    const merged = mergeChunkResults("imp-test", state.results);
    expect(merged).toHaveLength(10);
  });

  // Scenario A: a slow first chunk consuming most of the budget must prevent a second chunk from
  // ever starting - not merely be caught by a stale "were we under budget when we started" check.
  it("(A) does not start a second chunk once the first consumed most of the request budget", async () => {
    const state = makeState(0, 3);
    const detector = vi.fn().mockResolvedValue({ pageNumbers: [1], questions: [] });
    // Chunk 1 check happens at elapsed=0. Chunk 1 itself takes 28s of wall-clock time, so the
    // NEXT check (before chunk 2) sees elapsed=28000: remaining=35000-28000=7000,
    // aiTimeout=min(20000, 7000-5000=2000)=2000, which is below the 5000 floor -> stop.
    const now = sequencedClock([0, 28000]);

    await runRemainingChunks(state, { detector, onChunkDone: async () => {}, warnings: [], startedAt: 0, now, ...DEFAULTS });

    expect(detector).toHaveBeenCalledTimes(1);
    expect(state.processedChunks).toBe(1);
  });

  // Scenario B: the timeout actually handed to the detector for each chunk must never exceed
  // (remainingMs - safetyMarginMs) at the moment that chunk started, and must shrink as the
  // request's remaining time shrinks - not stay fixed regardless of elapsed time.
  it("(B) never hands the detector a timeout larger than the remaining time minus the safety margin, and shrinks it over successive chunks", async () => {
    const state = makeState(0, 3);
    const seenTimeouts = [];
    const detector = vi.fn().mockImplementation(async (chunk, aiTimeoutMs) => {
      seenTimeouts.push(aiTimeoutMs);
      return { pageNumbers: chunk.pageNumbers, questions: [] };
    });
    // elapsed at each of the 3 chunk-start checks: 0s, 10s (chunk 1 "took" 10s), 20s (chunk 2 also
    // took 10s) - each still comfortably under budget.
    const now = sequencedClock([0, 10000, 20000]);

    await runRemainingChunks(state, { detector, onChunkDone: async () => {}, warnings: [], startedAt: 0, now, ...DEFAULTS });

    expect(detector).toHaveBeenCalledTimes(3);
    // chunk 1: remaining=35000, cap=min(20000,30000)=20000
    expect(seenTimeouts[0]).toBe(20000);
    // chunk 2: remaining=25000, cap=min(20000,20000)=20000
    expect(seenTimeouts[1]).toBe(20000);
    // chunk 3: remaining=15000, cap=min(20000,10000)=10000 - strictly smaller, proving it shrinks
    expect(seenTimeouts[2]).toBe(10000);
    for (const timeout of seenTimeouts) {
      expect(timeout).toBeLessThanOrEqual(DEFAULTS.maxAiTimeoutMs);
    }
  });

  // Scenario C: if the request already has almost no safe time left (e.g. extraction alone ate
  // most of the budget before the loop even started), no AI call is attempted at all - the request
  // returns status:"partial" immediately rather than starting a call doomed to be cut off.
  it("(C) starts zero AI calls and reports partial immediately when almost no safe time remains", async () => {
    const state = makeState(0, 4);
    const detector = vi.fn();
    // elapsed=32000 on the very first check: remaining=3000, cap=min(20000,3000-5000=-2000)=-2000.
    const now = sequencedClock([32000]);

    await runRemainingChunks(state, { detector, onChunkDone: async () => {}, warnings: [], startedAt: 0, now, ...DEFAULTS });

    expect(detector).not.toHaveBeenCalled();
    expect(state.processedChunks).toBe(0);
  });

  // Scenario D: processedChunks/results must reflect exactly how many chunks genuinely completed
  // before the deadline stopped the loop - no off-by-one, no phantom "completed" entries.
  it("(D) leaves processedChunks and results consistent (exactly the chunks that actually ran) when stopped by the deadline", async () => {
    const state = makeState(0, 5);
    const detector = vi.fn().mockResolvedValue({ pageNumbers: [1], questions: [{ text: "q" }] });
    // Chunks 1 and 2 run (checks at 0 and 5000), then chunk 3's check at 28000 stops the loop
    // (remaining=7000, cap=2000 < floor).
    const now = sequencedClock([0, 5000, 28000]);

    await runRemainingChunks(state, { detector, onChunkDone: async () => {}, warnings: [], startedAt: 0, now, ...DEFAULTS });

    expect(detector).toHaveBeenCalledTimes(2);
    expect(state.processedChunks).toBe(2);
    expect(state.results).toHaveLength(2);
    expect(state.processedChunks).toBe(state.results.length);
  });
});

describe("resolveImportProvider - Import Questions From Files defaults to OpenAI, not GLM", () => {
  it("resolves to openai when the request body has no provider field at all", () => {
    expect(resolveImportProvider({})).toBe("openai");
  });

  it("resolves to openai when the body itself is missing/undefined", () => {
    expect(resolveImportProvider(undefined)).toBe("openai");
  });

  it("resolves to openai when the body explicitly requests it", () => {
    expect(resolveImportProvider({ provider: "openai" })).toBe("openai");
  });

  it("still honors an explicit non-default provider if one is deliberately requested", () => {
    expect(resolveImportProvider({ provider: "glm" })).toBe("glm");
    expect(resolveImportProvider({ provider: "qwen" })).toBe("qwen");
  });

  it("normalizes case/whitespace the same way as before", () => {
    expect(resolveImportProvider({ provider: " OpenAI " })).toBe("openai");
  });
});
