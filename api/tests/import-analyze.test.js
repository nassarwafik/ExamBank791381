import { describe, it, expect, vi } from "vitest";
import { serializeStateForStorage, deserializeStateFromStorage, runRemainingChunks } from "../src/functions/import-analyze.js";

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

describe("runRemainingChunks - reopening an already-done job never re-calls the AI provider", () => {
  function makeState(processedChunks, totalChunks) {
    return {
      processedChunks,
      totalChunks,
      results: [],
      chunks: Array.from({ length: totalChunks }, (_, i) => ({ chunkIndex: i, pageNumbers: [i + 1], text: "x", images: [] }))
    };
  }

  it("calls the detector zero times when the job is already fully processed (status was 'done')", async () => {
    const state = makeState(3, 3);
    const detector = vi.fn().mockResolvedValue({ pageNumbers: [1], questions: [] });
    const onChunkDone = vi.fn().mockResolvedValue(undefined);

    await runRemainingChunks(state, { detector, onChunkDone, warnings: [], timeBudgetMs: 170000, now: () => Date.now() });

    expect(detector).not.toHaveBeenCalled();
    expect(onChunkDone).not.toHaveBeenCalled();
    expect(state.processedChunks).toBe(3);
  });

  it("calls the detector exactly once per remaining chunk when some are still pending (a resumed 'partial' job)", async () => {
    const state = makeState(1, 3);
    const detector = vi.fn().mockResolvedValue({ pageNumbers: [1], questions: [] });
    const onChunkDone = vi.fn().mockResolvedValue(undefined);

    await runRemainingChunks(state, { detector, onChunkDone, warnings: [], timeBudgetMs: 170000, now: () => Date.now() });

    expect(detector).toHaveBeenCalledTimes(2);
    expect(state.processedChunks).toBe(3);
  });

  it("stops starting new chunks once the time budget is exceeded, leaving the job 'partial'", async () => {
    const state = makeState(0, 5);
    let callCount = 0;
    const detector = vi.fn().mockImplementation(async () => {
      callCount += 1;
      return { pageNumbers: [1], questions: [] };
    });
    let fakeNow = 0;
    const now = () => {
      fakeNow += 100000; // each check advances the clock well past the budget after 2 chunks
      return fakeNow;
    };

    await runRemainingChunks(state, { detector, onChunkDone: async () => {}, warnings: [], timeBudgetMs: 170000, now });

    expect(callCount).toBeLessThan(5);
    expect(state.processedChunks).toBeLessThan(5);
    expect(state.processedChunks).toBeGreaterThan(0);
  });

  it("records a per-chunk failure as a warning and continues with the remaining chunks", async () => {
    const state = makeState(0, 2);
    const detector = vi.fn()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({ pageNumbers: [2], questions: [] });
    const warnings = [];

    await runRemainingChunks(state, { detector, onChunkDone: async () => {}, warnings, timeBudgetMs: 170000, now: () => Date.now() });

    expect(state.processedChunks).toBe(2);
    expect(warnings.some(w => w.includes("provider unavailable"))).toBe(true);
    expect(state.results).toHaveLength(2);
  });
});
