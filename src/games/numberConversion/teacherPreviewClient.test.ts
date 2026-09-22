import { describe, it, expect, afterEach, vi } from "vitest";
import { createNumberConversionTeacherPreviewClient, TEACHER_PREVIEW_BASE } from "./teacherPreviewClient";
import { createNumberConversionClient } from "./numberConversionClient";

// The teacher-preview transport: same NumberConversionClient interface, dedicated teacher endpoint + builder auth,
// in-memory continuation only, never a best record, never the student endpoint or a student token.
type Call = { url: string; init: RequestInit & { headers: Record<string, string> } };
const EMPTY = [0, 0, 0, 0, 0, 0, 0, 0] as (0 | 1)[];
function stubFetch(responses: unknown[]) {
  const calls: Call[] = [];
  globalThis.fetch = vi.fn(async (url: string, init: Call["init"]) => {
    calls.push({ url, init });
    const body = responses.shift();
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
  return calls;
}
const bodyOf = (c: Call) => JSON.parse(String(c.init.body));
const active = { attemptId: "a", path: "mixed", level: "guided", total: 10, index: 0, taskNumber: 1, currentTask: { taskId: "t1", direction: "dec2bin", sourceBase: 10, targetBase: 2, sourceDisplay: "45", bitWidth: 8 }, attemptsOnCurrent: 0, resolved: 0, correct: 0, streak: 0, bestStreak: 0, startedAt: "2026-01-01T00:00:00Z", done: false };

afterEach(() => vi.restoreAllMocks());

describe("teacher preview client", () => {
  it("getState() is an empty home screen (no active round, no best) and makes NO request", async () => {
    const calls = stubFetch([]);
    const c = createNumberConversionTeacherPreviewClient("builder-tok");
    expect(await c.getState()).toEqual({ ok: true, active: null, best: null });
    expect(calls.length).toBe(0);
  });

  it("start() posts to the teacher-preview endpoint with builder auth — never the student endpoint or a student token", async () => {
    const calls = stubFetch([{ ok: true, active, best: { percentage: 90 }, continuation: "C1" }]);
    const c = createNumberConversionTeacherPreviewClient("builder-tok");
    const s = await c.start("dec-hex", "practice");
    expect(calls[0].url).toBe(TEACHER_PREVIEW_BASE + "/start");
    expect(calls[0].url).toBe("/api/game-number-conversion-preview/start");
    expect(calls[0].url).not.toMatch(/^\/api\/game-number-conversion(\/|$)/);   // not the student route
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers["x-builder-token"]).toBe("builder-tok");
    expect(calls[0].init.headers.Authorization).toBe("Bearer builder-tok");
    expect(calls[0].init.headers).not.toHaveProperty("x-student-token");
    expect(bodyOf(calls[0])).toEqual({ path: "dec-hex", level: "practice" });
    expect(s).toEqual({ ok: true, active, best: null });   // a preview never exposes a best record, even if one came back
    expect(s).not.toHaveProperty("continuation");
  });

  it("answer() sends taskId + working bits + the typed answer + the in-memory continuation, then carries the new continuation", async () => {
    const calls = stubFetch([
      { ok: true, active, continuation: "C1" },
      { ok: true, correct: false, attempts: 1, hint: "h", continuation: "C2" },
      { ok: false, error: "invalid-answer-format", message: "تحقّق من صيغة الإجابة." },   // no continuation → keep C2
      { ok: true, correct: true, attempts: 2, canonicalAnswer: "00101101", done: false, state: active, continuation: "C3" },
      { ok: true, correct: true, done: true, result: { correct: 1 }, best: { percentage: 100 }, continuation: null },
      { ok: false, error: "no-active-attempt" },
    ]);
    const c = createNumberConversionTeacherPreviewClient("builder-tok");
    await c.start("mixed", "guided");
    const bits = [0, 0, 1, 0, 1, 1, 0, 1] as (0 | 1)[];
    const r1 = await c.answer("t1", bits, "101100");
    expect(calls[1].url).toBe("/api/game-number-conversion-preview/answer");
    expect(bodyOf(calls[1])).toEqual({ taskId: "t1", bits, answer: "101100", continuation: "C1" });
    expect(r1).toEqual({ ok: true, correct: false, attempts: 1, hint: "h" });   // continuation stays internal
    const fmt = await c.answer("t1", bits, "2");
    expect(bodyOf(calls[2]).continuation).toBe("C2");
    expect(fmt.error).toBe("invalid-answer-format");
    await c.answer("t1", bits, "00101101");
    expect(bodyOf(calls[3]).continuation).toBe("C2");                             // the format error kept C2
    const done = await c.answer("t2", EMPTY, "1");
    expect(bodyOf(calls[4]).continuation).toBe("C3");
    expect(done.best).toBeUndefined();                                            // never a best record
    await c.answer("t3", EMPTY, "1");
    expect(bodyOf(calls[5]).continuation).toBeNull();                             // the finished round cleared it
    for (const call of calls) expect(call.init.headers).not.toHaveProperty("x-student-token");
  });

  it("a new start (retry / new challenge) replaces the continuation with the fresh round's; getState() discards it", async () => {
    const calls = stubFetch([
      { ok: true, active, continuation: "ROUND-A" },
      { ok: true, active, continuation: "ROUND-B" },
      { ok: true, correct: false, attempts: 1, hint: "h", continuation: "ROUND-B2" },
      { ok: false, error: "no-active-attempt" },
    ]);
    const c = createNumberConversionTeacherPreviewClient("builder-tok");
    await c.start("mixed", "guided");
    await c.start("mixed", "guided");
    await c.answer("t1", EMPTY, "1");
    expect(bodyOf(calls[2]).continuation).toBe("ROUND-B");
    await c.getState();
    await c.answer("t1", EMPTY, "1");
    expect(bodyOf(calls[3]).continuation).toBeNull();
  });

  it("the STUDENT client is untouched: student endpoint + student token", async () => {
    const calls = stubFetch([{ ok: true, active: null, best: null }]);
    await createNumberConversionClient("stu-tok").getState();
    expect(calls[0].url).toBe("/api/game-number-conversion");
    expect(calls[0].init.headers["x-student-token"]).toBe("stu-tok");
    expect(calls[0].init.headers).not.toHaveProperty("x-builder-token");
  });
});
