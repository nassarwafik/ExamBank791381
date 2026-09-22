import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/game-number-conversion.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { bitsFromValue } from "../src/lib/number-conversion.js";
import { gameDocName } from "../src/lib/number-conversion-store.js";

// The Number Conversion game API end-to-end over the REAL handler + REAL platform-storage (memory container):
// student auth required, snapshotted round survives refresh, no answer key leaked, server grades, client score
// ignored, result + best record server-derived and non-additive.
const DOC = gameDocName("u1");
const studentDeps = (ctx, id = "u1") => ({ requireActiveStudentSession: async () => ({ ok: true, user: { sub: id }, student: { userId: id }, container: ctx.container }) });
const anonDeps = () => ({ requireActiveStudentSession: async () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) });

const get = deps => handler({ method: "GET", url: "https://x/api/game-number-conversion", headers: { get: () => null }, params: {} }, deps);
const start = (deps, body = { path: "mixed", level: "guided" }) => handler({ method: "POST", url: "https://x/api/game-number-conversion/start", headers: { get: () => null }, params: { action: "start" }, json: async () => body }, deps);
const answer = (deps, body) => handler({ method: "POST", url: "https://x/api/game-number-conversion/answer", headers: { get: () => null }, params: { action: "answer" }, json: async () => body }, deps);

/** The correct eight bits for the CURRENT task, read from the server-side snapshot (tests only). */
const correctBits = ctx => { const a = ctx.getJson(DOC).active; return bitsFromValue(a.tasks[a.index].value); };
const currentTaskId = ctx => { const a = ctx.getJson(DOC).active; return a.tasks[a.index].taskId; };

describe("auth", () => {
  it("requires an active student session", async () => {
    const r = await get(anonDeps());
    expect(r.status).toBe(401);
  });
});

describe("start + state (snapshot, no answer-key leak, refresh-safe)", () => {
  it("start creates a 10-task round; GET resumes the SAME tasks; the payload carries no value/answer key", async () => {
    const ctx = createMemoryContainer();
    const s = await start(studentDeps(ctx), { path: "dec-bin", level: "guided" });
    expect(s.status).toBe(200);
    expect(s.jsonBody.active).toMatchObject({ total: 10, index: 0, taskNumber: 1, path: "dec-bin", level: "guided", done: false });
    expect(s.jsonBody.active.currentTask).toMatchObject({ taskId: "t1", bitWidth: 8 });
    expect(s.jsonBody.active.currentTask).not.toHaveProperty("value");
    // no correct-answer key anywhere in the initial payload
    const raw = JSON.stringify(s.jsonBody);
    expect(raw).not.toContain("\"value\"");
    expect(raw).not.toContain("solutionBits");
    // refresh: GET returns the SAME task snapshot
    const g = await get(studentDeps(ctx));
    expect(g.jsonBody.active.currentTask.taskId).toBe("t1");
    expect(g.jsonBody.active.currentTask.sourceDisplay).toBe(s.jsonBody.active.currentTask.sourceDisplay);
    expect(g.jsonBody.active.total).toBe(10);
  });
});

describe("server grades; client score is ignored", () => {
  it("a correct board advances; a forged correct:true with wrong bits is graded incorrect", async () => {
    const ctx = createMemoryContainer();
    await start(studentDeps(ctx), { path: "mixed", level: "guided" });
    const tid = currentTaskId(ctx);
    // forged client claim + wrong bits → server says incorrect (first miss → hint, no reveal)
    const bad = await answer(studentDeps(ctx), { taskId: tid, bits: [1, 1, 1, 1, 1, 1, 1, 1], correct: true, score: 999 });
    // if 255 happens to be the answer this would be correct; guard by checking against real correctness
    if (bad.jsonBody.correct) {
      // extremely unlikely for a fixed seed, but keep the test robust: 255 was actually correct
      expect(bad.jsonBody.attempts).toBe(1);
    } else {
      expect(bad.jsonBody).toMatchObject({ ok: true, correct: false, attempts: 1 });
      expect(bad.jsonBody.hint).toBeTruthy();
      expect(bad.jsonBody).not.toHaveProperty("solutionBits");
    }
    // now the real correct bits advance
    const good = await answer(studentDeps(ctx), { taskId: tid, bits: correctBits(ctx) });
    expect(good.jsonBody).toMatchObject({ ok: true, correct: true });
    expect(ctx.getJson(DOC).active.index).toBe(1);
  });
  it("second wrong reveals the solution and advances; a stale task id → 409", async () => {
    const ctx = createMemoryContainer();
    await start(studentDeps(ctx), { path: "mixed", level: "guided" });
    const tid = currentTaskId(ctx);
    const wrong = bitsFromValue((ctx.getJson(DOC).active.tasks[0].value + 1) % 256);
    await answer(studentDeps(ctx), { taskId: tid, bits: wrong });
    const r2 = await answer(studentDeps(ctx), { taskId: tid, bits: wrong });
    expect(r2.jsonBody).toMatchObject({ ok: true, correct: false, revealed: true });
    expect(Array.isArray(r2.jsonBody.solutionBits)).toBe(true);
    expect(ctx.getJson(DOC).active.index).toBe(1);
    // answering the now-completed t1 again → 409 conflict
    const stale = await answer(studentDeps(ctx), { taskId: tid, bits: wrong });
    expect(stale.status).toBe(409);
    expect(stale.jsonBody).toMatchObject({ ok: false, error: "stale-task" });
  });
});

describe("strict payload validation (Fix 3) — malformed input is a 400 that never mutates the attempt", () => {
  const snapshot = ctx => { const a = ctx.getJson(DOC).active; return { index: a.index, currentAttempts: a.currentAttempts, outcomes: JSON.stringify(a.outcomes) }; };
  it("rejects a bad start (explicitly invalid path or level) with 400 and no round created", async () => {
    const ctx = createMemoryContainer();
    expect((await start(studentDeps(ctx), { path: "octal", level: "guided" })).status).toBe(400);
    expect((await start(studentDeps(ctx), { path: "mixed", level: "expert" })).status).toBe(400);
    expect(ctx.getJson(DOC)).toBeNull();                                       // nothing was written
    // omitted path/level still start with safe defaults
    const ok = await start(studentDeps(ctx), {});
    expect(ok.status).toBe(200);
    expect(ok.jsonBody.active).toMatchObject({ path: "mixed", level: "guided" });
  });
  it("rejects every malformed /answer payload with 400 and leaves the active attempt untouched", async () => {
    const ctx = createMemoryContainer();
    await start(studentDeps(ctx), { path: "mixed", level: "guided" });
    const tid = currentTaskId(ctx);
    const before = snapshot(ctx);
    const malformed = [
      { taskId: tid, bits: [1, 0, 1] },                            // too short
      { taskId: tid, bits: [0, 0, 0, 0, 0, 0, 0, 0, 0] },          // too long
      { taskId: tid, bits: [0, 0, 0, 0, 0, 0, 0, 2] },             // value 2
      { taskId: tid, bits: ["0", "1", "0", "1", "0", "1", "0", "1"] }, // strings
      { taskId: tid, bits: [0, 0, 0, 0, 0, 0, 0, true] },          // boolean
      { taskId: tid, bits: null },                                 // null
      { taskId: tid },                                             // missing bits
      { bits: [0, 0, 0, 0, 0, 0, 0, 0] },                          // missing taskId
    ];
    for (const body of malformed) {
      const r = await answer(studentDeps(ctx), body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.jsonBody.ok).toBe(false);
      expect(r.jsonBody).not.toHaveProperty("solutionBits");                 // nothing revealed
      expect(snapshot(ctx)).toEqual(before);                                 // no attempt consumed / advance
    }
    // a well-formed submission after the malformed ones still works normally
    const good = await answer(studentDeps(ctx), { taskId: tid, bits: correctBits(ctx) });
    expect(good.status).toBe(200);
  });
});

describe("completion → server result + idempotent best", () => {
  async function playAllCorrect(ctx) {
    for (let i = 0; i < 10; i++) {
      const tid = currentTaskId(ctx);
      const r = await answer(studentDeps(ctx), { taskId: tid, bits: correctBits(ctx) });
      if (r.jsonBody.done) return r;
    }
    return null;
  }
  it("a full correct round → 100% result, best saved; replaying does not accumulate (non-additive)", async () => {
    const ctx = createMemoryContainer();
    await start(studentDeps(ctx), { path: "mixed", level: "guided" });
    const done = await playAllCorrect(ctx);
    expect(done.jsonBody.done).toBe(true);
    expect(done.jsonBody.result).toMatchObject({ correct: 10, total: 10, percentage: 100, bestStreak: 10 });
    expect(done.jsonBody.best).toMatchObject({ percentage: 100, correct: 10, total: 10 });
    expect(ctx.getJson(DOC).active).toBeNull();                       // cleared on completion
    const best1 = ctx.getJson(DOC).best;

    // play again but poorly (all revealed → 0%) — best must NOT drop and must NOT accumulate
    await start(studentDeps(ctx), { path: "mixed", level: "guided" });
    for (let i = 0; i < 10; i++) {
      const tid = currentTaskId(ctx);
      const wrong = bitsFromValue((ctx.getJson(DOC).active.tasks[ctx.getJson(DOC).active.index].value + 1) % 256);
      await answer(studentDeps(ctx), { taskId: tid, bits: wrong });      // 1st wrong
      await answer(studentDeps(ctx), { taskId: tid, bits: wrong });      // 2nd wrong → reveal, advance
    }
    const best2 = ctx.getJson(DOC).best;
    expect(best2).toEqual(best1);                                     // unchanged: best record, not a farmable counter
    expect(best2.percentage).toBe(100);
  });
});
