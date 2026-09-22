import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/game-number-conversion.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { bitsFromValue, buildTask, canonicalAnswerForTask } from "../src/lib/number-conversion.js";
import { gameDocName } from "../src/lib/number-conversion-store.js";

// The Number Conversion game API end-to-end over the REAL handler + REAL platform-storage (memory container):
// student auth required, snapshotted round survives refresh, no answer key leaked, the server grades the TYPED final
// answer (the boxes are only working/hint context), malformed answers are format errors that change nothing, client
// score ignored, result + best record server-derived and non-additive.
const DOC = gameDocName("u1");
const studentDeps = (ctx, id = "u1") => ({ requireActiveStudentSession: async () => ({ ok: true, user: { sub: id }, student: { userId: id }, container: ctx.container }) });
const anonDeps = () => ({ requireActiveStudentSession: async () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) });

const get = deps => handler({ method: "GET", url: "https://x/api/game-number-conversion", headers: { get: () => null }, params: {} }, deps);
const start = (deps, body = { path: "mixed", level: "guided" }) => handler({ method: "POST", url: "https://x/api/game-number-conversion/start", headers: { get: () => null }, params: { action: "start" }, json: async () => body }, deps);
const answer = (deps, body) => handler({ method: "POST", url: "https://x/api/game-number-conversion/answer", headers: { get: () => null }, params: { action: "answer" }, json: async () => body }, deps);

const EMPTY = [0, 0, 0, 0, 0, 0, 0, 0];
/** The CURRENT task from the server-side snapshot (tests only — the client never sees `value`). */
const currentTask = ctx => { const a = ctx.getJson(DOC).active; return a.tasks[a.index]; };
const currentTaskId = ctx => currentTask(ctx).taskId;
const rightAnswer = ctx => canonicalAnswerForTask(currentTask(ctx));
const wrongAnswer = ctx => { const t = currentTask(ctx); return canonicalAnswerForTask(buildTask("x", t.direction, (t.value + 1) % 256)); };
const malformedAnswer = ctx => ({ 2: "102010", 10: "4x", 16: "G7" })[currentTask(ctx).targetBase];
const etagOf = ctx => ctx.store.get(DOC).etag;
const roundSig = doc => doc.active.tasks.map(t => t.direction + ":" + t.value).join(",");

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
    expect(raw).not.toContain("canonicalAnswer");
    // refresh: GET returns the SAME task snapshot
    const g = await get(studentDeps(ctx));
    expect(g.jsonBody.active.currentTask.taskId).toBe("t1");
    expect(g.jsonBody.active.currentTask.sourceDisplay).toBe(s.jsonBody.active.currentTask.sourceDisplay);
    expect(g.jsonBody.active.total).toBe(10);
  });

  it("refresh keeps the EXACT stored snapshot, while every deliberate start/restart draws a FRESH seed + round", async () => {
    const ctx = createMemoryContainer();
    await start(studentDeps(ctx), { path: "mixed", level: "guided" });
    const first = ctx.getJson(DOC);
    await get(studentDeps(ctx)); await get(studentDeps(ctx));                       // refreshes never regenerate
    expect(roundSig(ctx.getJson(DOC))).toBe(roundSig(first));
    expect(ctx.getJson(DOC).active.seed).toBe(first.active.seed);
    await start(studentDeps(ctx), { path: "mixed", level: "guided" });              // «ابدأ التحدّي» again
    const second = ctx.getJson(DOC);
    expect(second.active.seed).not.toBe(first.active.seed);
    expect(roundSig(second)).not.toBe(roundSig(first));
    await handler({ method: "POST", url: "https://x/api/game-number-conversion/restart", headers: { get: () => null }, params: { action: "restart" }, json: async () => ({ path: "mixed", level: "guided" }) }, studentDeps(ctx));
    expect(ctx.getJson(DOC).active.seed).not.toBe(second.active.seed);             // «إعادة المحاولة» → fresh too
  });
});

describe("the TEXT answer is graded; boxes are working context; client score is ignored", () => {
  it("a forged correct:true with a wrong answer is incorrect; the real typed answer (with arbitrary boxes) succeeds", async () => {
    const ctx = createMemoryContainer();
    await start(studentDeps(ctx), { path: "mixed", level: "guided" });
    const tid = currentTaskId(ctx);
    const bad = await answer(studentDeps(ctx), { taskId: tid, bits: bitsFromValue(currentTask(ctx).value), answer: wrongAnswer(ctx), correct: true, score: 999 });
    expect(bad.status).toBe(200);
    expect(bad.jsonBody).toMatchObject({ ok: true, correct: false, attempts: 1 });   // right boxes do NOT make it correct
    expect(bad.jsonBody.hint).toBeTruthy();
    expect(bad.jsonBody).not.toHaveProperty("solutionBits");
    expect(bad.jsonBody).not.toHaveProperty("canonicalAnswer");
    const good = await answer(studentDeps(ctx), { taskId: tid, bits: EMPTY, answer: rightAnswer(ctx) });
    expect(good.jsonBody).toMatchObject({ ok: true, correct: true });
    expect(typeof good.jsonBody.canonicalAnswer).toBe("string");
    expect(Array.isArray(good.jsonBody.solutionBits)).toBe(true);
    expect(ctx.getJson(DOC).active.index).toBe(1);
  });

  it("second wrong answer reveals the canonical answer + bits and resolves; a stale task id → 409", async () => {
    const ctx = createMemoryContainer();
    await start(studentDeps(ctx), { path: "mixed", level: "guided" });
    const tid = currentTaskId(ctx);
    const expected = rightAnswer(ctx);
    const wrong = wrongAnswer(ctx);
    await answer(studentDeps(ctx), { taskId: tid, bits: EMPTY, answer: wrong });
    const r2 = await answer(studentDeps(ctx), { taskId: tid, bits: EMPTY, answer: wrong });
    expect(r2.jsonBody).toMatchObject({ ok: true, correct: false, revealed: true, canonicalAnswer: expected });
    expect(Array.isArray(r2.jsonBody.solutionBits)).toBe(true);
    expect(ctx.getJson(DOC).active.index).toBe(1);
    const stale = await answer(studentDeps(ctx), { taskId: tid, bits: EMPTY, answer: wrong });
    expect(stale.status).toBe(409);
    expect(stale.jsonBody).toMatchObject({ ok: false, error: "stale-task" });
  });
});

describe("malformed FINAL answer = format error (422): no attempt consumed, nothing written", () => {
  it("returns invalid-answer-format with an Arabic message and leaves the stored document untouched", async () => {
    const ctx = createMemoryContainer();
    await start(studentDeps(ctx), { path: "mixed", level: "guided" });
    const tid = currentTaskId(ctx);
    const before = JSON.stringify(ctx.getJson(DOC));
    const etag = etagOf(ctx);
    const r = await answer(studentDeps(ctx), { taskId: tid, bits: EMPTY, answer: malformedAnswer(ctx) });
    expect(r.status).toBe(422);
    expect(r.jsonBody).toMatchObject({ ok: false, error: "invalid-answer-format", message: "تحقّق من صيغة الإجابة." });
    expect(r.jsonBody).not.toHaveProperty("solutionBits");
    expect(r.jsonBody).not.toHaveProperty("canonicalAnswer");
    expect(JSON.stringify(ctx.getJson(DOC))).toBe(before);                         // attempts/index/outcomes unchanged
    expect(etagOf(ctx)).toBe(etag);                                                // not even rewritten
  });
  it("every base's malformed answers are rejected, then a real wrong answer still gets its FIRST attempt (hint)", async () => {
    const ctx = createMemoryContainer();
    await start(studentDeps(ctx), { path: "mixed", level: "guided" });
    const tid = currentTaskId(ctx);
    // each of these is malformed in EVERY target base (2 / 10 / 16), whatever the current task is
    for (const bad of ["102010", "4x", "G7", "", "0x3A", "1 0", "256G"]) {
      const r = await answer(studentDeps(ctx), { taskId: tid, bits: EMPTY, answer: bad });
      expect(r.status, JSON.stringify(bad)).toBe(422);
      expect(r.jsonBody.error).toBe("invalid-answer-format");
    }
    const snap = ctx.getJson(DOC).active;
    expect(snap.currentAttempts).toBe(0);                                          // seven format errors consumed nothing
    expect(snap.index).toBe(0);
    expect(snap.outcomes).toEqual([]);
    const w = await answer(studentDeps(ctx), { taskId: tid, bits: EMPTY, answer: wrongAnswer(ctx) });
    expect(w.jsonBody).toMatchObject({ ok: true, correct: false, attempts: 1 });   // the FIRST real attempt
    expect(w.jsonBody.hint).toBeTruthy();
  });
});

describe("strict payload validation — malformed payloads are a 400 that never mutates the attempt", () => {
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
    const ans = rightAnswer(ctx);
    const malformedPayloads = [
      { taskId: tid, bits: [1, 0, 1], answer: ans },                                // too short
      { taskId: tid, bits: [0, 0, 0, 0, 0, 0, 0, 0, 0], answer: ans },              // too long
      { taskId: tid, bits: [0, 0, 0, 0, 0, 0, 0, 2], answer: ans },                 // value 2
      { taskId: tid, bits: ["0", "1", "0", "1", "0", "1", "0", "1"], answer: ans }, // strings
      { taskId: tid, bits: [0, 0, 0, 0, 0, 0, 0, true], answer: ans },              // boolean
      { taskId: tid, bits: null, answer: ans },                                     // null bits
      { taskId: tid, answer: ans },                                                 // missing bits
      { bits: EMPTY, answer: ans },                                                 // missing taskId
      { taskId: tid, bits: EMPTY },                                                 // missing answer
      { taskId: tid, bits: EMPTY, answer: 45 },                                     // non-string answer
      { taskId: tid, bits: EMPTY, answer: "1".repeat(40) },                         // absurdly long answer
    ];
    for (const body of malformedPayloads) {
      const r = await answer(studentDeps(ctx), body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.jsonBody.ok).toBe(false);
      expect(r.jsonBody).not.toHaveProperty("solutionBits");                 // nothing revealed
      expect(snapshot(ctx)).toEqual(before);                                 // no attempt consumed / advance
    }
    // a well-formed submission after the malformed ones still works normally
    const good = await answer(studentDeps(ctx), { taskId: tid, bits: EMPTY, answer: ans });
    expect(good.status).toBe(200);
  });
});

describe("completion → server result + idempotent best", () => {
  async function playAllCorrect(ctx) {
    for (let i = 0; i < 10; i++) {
      const tid = currentTaskId(ctx);
      const r = await answer(studentDeps(ctx), { taskId: tid, bits: EMPTY, answer: rightAnswer(ctx) });
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
      const wrong = wrongAnswer(ctx);
      await answer(studentDeps(ctx), { taskId: tid, bits: EMPTY, answer: wrong });      // 1st wrong
      await answer(studentDeps(ctx), { taskId: tid, bits: EMPTY, answer: wrong });      // 2nd wrong → reveal, resolve
    }
    const best2 = ctx.getJson(DOC).best;
    expect(best2).toEqual(best1);                                     // unchanged: best record, not a farmable counter
    expect(best2.percentage).toBe(100);
  });
});
