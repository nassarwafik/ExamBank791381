import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { handler } from "../src/functions/game-number-conversion-preview.js";
import { openPreview, sealPreview, previewKeyFrom } from "../src/lib/number-conversion-preview.js";
import { generateRound, buildTask, canonicalAnswerForTask, solutionBits, explanationForTask, hintForTask } from "../src/lib/number-conversion.js";

// The Number Conversion TEACHER PREVIEW API over the REAL handler: builder auth (never a student session), stateless and
// non-persistent (no storage module at all), and the SAME engine semantics as the student game (start / correct / first
// wrong hint / second wrong reveal / format error / result) driven through a sealed, server-validated continuation.
const require = createRequire(import.meta.url);
const KEY = previewKeyFrom("test-preview-secret");
const teacherDeps = (sub = "teacher-1", extra = {}) => ({
  previewKey: KEY,
  requireBuilderAuth: () => ({ ok: true, user: { role: "teacher", sub } }),
  requireActiveStudentSession: () => { throw new Error("a student session must never be consulted"); },
  ...extra,
});
const anonDeps = () => ({
  previewKey: KEY,
  requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }),
  requireActiveStudentSession: () => { throw new Error("a student session must never be consulted"); },
});

const req = (action, body, method = "POST") => ({ method, url: "https://x/api/game-number-conversion-preview/" + action, headers: { get: () => null }, params: { action }, json: async () => body });
const start = (deps, body = { path: "mixed", level: "guided" }) => handler(req("start", body), deps);
const answer = (deps, body) => handler(req("answer", body), deps);

const EMPTY = [0, 0, 0, 0, 0, 0, 0, 0];
const NOW = () => new Date().toISOString();
/** The server-side view of a continuation (tests only — the browser can't open it). */
const opened = (cont, sub = "teacher-1") => openPreview(cont, { sub, key: KEY, now: NOW() });
const taskOf = cont => { const a = opened(cont).doc.active; return a.tasks[a.index]; };
const right = cont => canonicalAnswerForTask(taskOf(cont));
const wrong = cont => { const t = taskOf(cont); return canonicalAnswerForTask(buildTask("x", t.direction, (t.value + 1) % 256)); };
const malformed = cont => ({ 2: "102010", 10: "4x", 16: "G7" })[taskOf(cont).targetBase];
const SAFE_TASK_KEYS = ["bitWidth", "direction", "sourceBase", "sourceDisplay", "targetBase", "taskId"];

afterEach(() => vi.restoreAllMocks());

describe("auth — teacher/builder only, never a student session", () => {
  it("unauthenticated start and answer are rejected (401)", async () => {
    expect((await start(anonDeps())).status).toBe(401);
    expect((await answer(anonDeps(), { taskId: "t", bits: EMPTY, answer: "1", continuation: "x" })).status).toBe(401);
  });
  it("a valid builder session is accepted (the student-session guard is never called)", async () => {
    const r = await start(teacherDeps());
    expect(r.status).toBe(200);
    expect(r.jsonBody.ok).toBe(true);
  });
  it("the handler authenticates with requireBuilderAuth and does not reference the student session guard", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "api/src/functions/game-number-conversion-preview.js"), "utf8");
    expect(src).toContain("requireBuilderAuth");
    expect(src).not.toMatch(/requireActiveStudentSession|student-auth/);
  });
  it("unsupported methods/actions → 405", async () => {
    expect((await handler(req("", {}, "GET"), teacherDeps())).status).toBe(405);
    expect((await handler(req("state", {}), teacherDeps())).status).toBe(405);
  });
});

describe("no storage — the preview is stateless and non-persistent by construction", () => {
  it("neither the endpoint nor its continuation helper imports storage or the student game document", () => {
    for (const f of ["api/src/functions/game-number-conversion-preview.js", "api/src/lib/number-conversion-preview.js"]) {
      const src = fs.readFileSync(path.join(process.cwd(), f), "utf8");
      expect(src, f).not.toMatch(/platform-storage|uploadJson|mutateJsonWithRetry|downloadJsonOrNull|getContainer|deleteBlob|listJson|gameDocName|GAME_PREFIX/);
      expect(src, f).not.toMatch(/require\([^)]*(strength|medal|achievement|student)/i);   // no reward / student modules
    }
  });
  it("a whole preview round (start → hint → reveal → correct … → result) never touches a storage helper", async () => {
    const storage = require("../src/lib/platform-storage.js");
    const spies = ["uploadJson", "mutateJsonWithRetry", "downloadJsonOrNull", "getContainer", "deleteBlob", "listJson"]
      .filter(n => typeof storage[n] === "function").map(n => vi.spyOn(storage, n));
    expect(spies.length).toBeGreaterThan(0);
    let s = await start(teacherDeps(), { path: "dec-bin", level: "practice" });
    let cont = s.jsonBody.continuation;
    let r = await answer(teacherDeps(), { taskId: s.jsonBody.active.currentTask.taskId, bits: EMPTY, answer: wrong(cont), continuation: cont });
    let taskId = s.jsonBody.active.currentTask.taskId;
    for (let i = 0; i < 12 && !r.jsonBody.done; i++) {
      if (r.jsonBody.continuation) { cont = r.jsonBody.continuation; if (r.jsonBody.state) taskId = r.jsonBody.state.currentTask?.taskId || taskId; }
      r = await answer(teacherDeps(), { taskId, bits: EMPTY, answer: right(cont), continuation: cont });
    }
    expect(r.jsonBody.done).toBe(true);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("start — a fresh server-seeded round; client-safe state; opaque continuation", () => {
  it("default round has 10 tasks; the public task is the student-safe shape (no value / answer / solution bits)", async () => {
    const r = await start(teacherDeps(), { path: "dec-hex", level: "challenge" });
    const a = r.jsonBody.active;
    expect(a.total).toBe(10);
    expect(a.index).toBe(0);
    expect(a.path).toBe("dec-hex");
    expect(a.level).toBe("challenge");
    expect(Object.keys(a.currentTask).sort()).toEqual(SAFE_TASK_KEYS);
    expect(r.jsonBody.best).toBeNull();
    const text = JSON.stringify({ ...r.jsonBody, continuation: undefined });
    expect(text).not.toMatch(/"value"|canonicalAnswer|solutionBits|"seed"|"tasks"/);
  });
  it("the continuation is sealed: it reveals no seed, value or JSON, and the attempt id is not the seed", async () => {
    const r = await start(teacherDeps());
    const cont = r.jsonBody.continuation;
    const { doc } = opened(cont);
    expect(typeof cont).toBe("string");
    expect(cont).not.toContain(doc.active.seed);
    const decoded = Buffer.from(cont, "base64url").toString("latin1");
    for (const plain of ['"seed"', '"outcomes"', '"path"', doc.active.seed]) expect(decoded).not.toContain(plain);   // ciphertext, not encoded JSON
    expect(r.jsonBody.active.attemptId).not.toBe(doc.active.seed);
  });
  it("every path and every assistance level starts (and invalid values are 400, not a silent fallback)", async () => {
    for (const p of ["dec-bin", "bin-hex", "dec-hex", "mixed"]) for (const l of ["guided", "practice", "challenge"]) {
      const r = await start(teacherDeps(), { path: p, level: l });
      expect(r.status, p + "/" + l).toBe(200);
      expect(r.jsonBody.active.path).toBe(p);
      expect(r.jsonBody.active.level).toBe(l);
    }
    expect((await start(teacherDeps(), { path: "octal" })).status).toBe(400);
    expect((await start(teacherDeps(), { level: "easy" })).status).toBe(400);
  });
  it("every start/restart draws a FRESH server seed; one continuation always reconstructs the SAME deterministic round", async () => {
    const a = await start(teacherDeps());
    const b = await handler(req("restart", { path: "mixed", level: "guided" }), teacherDeps());
    const da = opened(a.jsonBody.continuation).doc.active, db = opened(b.jsonBody.continuation).doc.active;
    expect(da.seed).not.toBe(db.seed);
    // same seed/spec → the same round, every time the continuation is opened, and equal to the real generator
    const again = opened(a.jsonBody.continuation).doc.active;
    expect(again.tasks).toEqual(da.tasks);
    expect(da.tasks).toEqual(generateRound(da.seed, { path: "mixed", count: 10 }));
    expect(a.jsonBody.active.currentTask.taskId).toBe(da.tasks[0].taskId);
  });
});

describe("answer — the SAME engine semantics as the student game", () => {
  it("correct typed answer: resolved with canonical answer, solution bits and explanation only AFTER submission", async () => {
    const s = await start(teacherDeps(), { path: "dec-bin", level: "guided" });
    const cont = s.jsonBody.continuation, task = taskOf(cont);
    const r = await answer(teacherDeps(), { taskId: task.taskId, bits: EMPTY, answer: right(cont), continuation: cont });
    expect(r.status).toBe(200);
    expect(r.jsonBody.correct).toBe(true);
    expect(r.jsonBody.attempts).toBe(1);
    expect(r.jsonBody.canonicalAnswer).toBe(canonicalAnswerForTask(task));
    expect(r.jsonBody.solutionBits).toEqual(solutionBits(task));
    expect(r.jsonBody.explanation).toBe(explanationForTask(task));
    expect(r.jsonBody.state.index).toBe(1);
    expect(r.jsonBody.state.correct).toBe(1);
    expect(Object.keys(r.jsonBody.state.currentTask).sort()).toEqual(SAFE_TASK_KEYS);
    expect(r.jsonBody.best).toBeNull();
    expect(opened(r.jsonBody.continuation).doc.active.index).toBe(1);   // the continuation advanced
  });

  it("first valid wrong → the store's hint, attempt 1, nothing revealed; second → reveal + resolved", async () => {
    const s = await start(teacherDeps(), { path: "dec-bin", level: "guided" });
    const cont = s.jsonBody.continuation, task = taskOf(cont), w = wrong(cont);
    const r1 = await answer(teacherDeps(), { taskId: task.taskId, bits: EMPTY, answer: w, continuation: cont });
    expect(r1.status).toBe(200);
    expect(r1.jsonBody.correct).toBe(false);
    expect(r1.jsonBody.attempts).toBe(1);
    expect(r1.jsonBody.hint).toBe(hintForTask(task, EMPTY, "guided", (task.value + 1) % 256));
    for (const k of ["canonicalAnswer", "solutionBits", "explanation", "revealed", "state"]) expect(r1.jsonBody[k], k).toBeUndefined();
    const cont2 = r1.jsonBody.continuation;
    expect(opened(cont2).doc.active.currentAttempts).toBe(1);

    const r2 = await answer(teacherDeps(), { taskId: task.taskId, bits: EMPTY, answer: w, continuation: cont2 });
    expect(r2.jsonBody.revealed).toBe(true);
    expect(r2.jsonBody.attempts).toBe(2);
    expect(r2.jsonBody.canonicalAnswer).toBe(canonicalAnswerForTask(task));
    expect(r2.jsonBody.solutionBits).toEqual(solutionBits(task));
    expect(r2.jsonBody.explanation).toBe(explanationForTask(task));
    expect(r2.jsonBody.state.index).toBe(1);
    expect(r2.jsonBody.state.correct).toBe(0);
  });

  it("format error → 422, consumes no attempt, reveals nothing, returns no new continuation", async () => {
    const s = await start(teacherDeps());
    const cont = s.jsonBody.continuation, task = taskOf(cont);
    const r = await answer(teacherDeps(), { taskId: task.taskId, bits: EMPTY, answer: malformed(cont), continuation: cont });
    expect(r.status).toBe(422);
    expect(r.jsonBody.error).toBe("invalid-answer-format");
    expect(r.jsonBody.message).toBe("تحقّق من صيغة الإجابة.");
    for (const k of ["canonicalAnswer", "solutionBits", "explanation", "continuation", "attempts"]) expect(r.jsonBody[k], k).toBeUndefined();
    // the same continuation still holds the untouched task: the first REAL wrong answer is attempt 1
    const w = await answer(teacherDeps(), { taskId: task.taskId, bits: EMPTY, answer: wrong(cont), continuation: cont });
    expect(w.jsonBody.attempts).toBe(1);
  });

  it("a full round ends with a server-derived result, NO best record and no continuation", async () => {
    const s = await start(teacherDeps(), { path: "bin-hex", level: "practice" });
    let cont = s.jsonBody.continuation, r = null;
    for (let i = 0; i < 10; i++) {
      r = await answer(teacherDeps(), { taskId: taskOf(cont).taskId, bits: EMPTY, answer: right(cont), continuation: cont });
      if (!r.jsonBody.done) cont = r.jsonBody.continuation;
    }
    expect(r.jsonBody.done).toBe(true);
    expect(r.jsonBody.result).toMatchObject({ correct: 10, total: 10, percentage: 100, bestStreak: 10 });
    expect(r.jsonBody.best).toBeNull();
    expect(r.jsonBody.continuation).toBeNull();
    expect(r.jsonBody.state.currentTask).toBeNull();
  });

  it("a stale task id → 409 (same as the student game)", async () => {
    const s = await start(teacherDeps());
    const r = await answer(teacherDeps(), { taskId: "not-the-task", bits: EMPTY, answer: "1", continuation: s.jsonBody.continuation });
    expect(r.status).toBe(409);
    expect(r.jsonBody.error).toBe("stale-task");
  });
});

describe("the continuation is validated, never trusted", () => {
  it("missing / tampered / another teacher's / expired continuation → 409 no-active-attempt", async () => {
    const s = await start(teacherDeps());
    const cont = s.jsonBody.continuation, taskId = s.jsonBody.active.currentTask.taskId;
    const body = c => ({ taskId, bits: EMPTY, answer: "1", continuation: c });
    expect((await answer(teacherDeps(), body(null))).jsonBody.error).toBe("no-active-attempt");
    const raw = Buffer.from(cont, "base64url"); raw[raw.length - 1] ^= 1;
    const tampered = await answer(teacherDeps(), body(raw.toString("base64url")));
    expect(tampered.status).toBe(409);
    expect((await answer(teacherDeps("teacher-2"), body(cont))).status).toBe(409);
    const otherKey = await answer(teacherDeps("teacher-1", { previewKey: previewKeyFrom("another-secret") }), body(cont));
    expect(otherKey.status).toBe(409);
    // a continuation older than a teacher session is expired
    const active = opened(cont).doc.active;
    const old = sealPreview({ ...active, startedAt: new Date(Date.now() - 9 * 3600 * 1000).toISOString() }, { sub: "teacher-1", key: KEY });
    expect((await answer(teacherDeps(), body(old))).status).toBe(409);
  });
  it("an internally inconsistent continuation (progress not matching the regenerated round) is rejected", () => {
    const base = { seed: "s", attemptId: "a", path: "mixed", level: "guided", startedAt: NOW(), tasks: generateRound("s", { path: "mixed", count: 10 }) };
    const ok = sealPreview({ ...base, index: 0, currentAttempts: 0, outcomes: [] }, { sub: "t", key: KEY });
    expect(openPreview(ok, { sub: "t", key: KEY, now: NOW() }).ok).toBe(true);
    const bad = [
      { index: 1, currentAttempts: 0, outcomes: [] },                                                // index ≠ outcomes
      { index: 1, currentAttempts: 0, outcomes: [{ taskId: "forged", status: "correct", attempts: 1 }] },
      { index: 0, currentAttempts: 2, outcomes: [] },                                                // exhausted attempts can't be current
      { index: 10, currentAttempts: 0, outcomes: base.tasks.map(t => ({ taskId: t.taskId, status: "correct", attempts: 1 })) },   // finished round
    ];
    for (const b of bad) expect(openPreview(sealPreview({ ...base, ...b }, { sub: "t", key: KEY }), { sub: "t", key: KEY, now: NOW() }).ok).toBe(false);
  });
  it("strict answer payloads → 400", async () => {
    const s = await start(teacherDeps());
    const cont = s.jsonBody.continuation, taskId = s.jsonBody.active.currentTask.taskId;
    for (const b of [
      { taskId, bits: [0, 1], answer: "1", continuation: cont },
      { taskId, bits: EMPTY, continuation: cont },
      { taskId, bits: EMPTY, answer: 5, continuation: cont },
      { taskId, bits: EMPTY, answer: "1".repeat(33), continuation: cont },
      { taskId, bits: EMPTY, answer: "1", continuation: 42 },
      { taskId, bits: EMPTY, answer: "1", continuation: "x".repeat(5000) },
      { bits: EMPTY, answer: "1", continuation: cont },
    ]) expect((await answer(teacherDeps(), b)).status, JSON.stringify(b).slice(0, 60)).toBe(400);
  });
  it("without a configured preview key the preview is unavailable (503), never unsealed", async () => {
    const saved = { a: process.env.BUILDER_SESSION_SECRET, b: process.env.BANK_SETUP_KEY };
    delete process.env.BUILDER_SESSION_SECRET; delete process.env.BANK_SETUP_KEY;
    try {
      const r = await start({ requireBuilderAuth: () => ({ ok: true, user: { sub: "t" } }) });
      expect(r.status).toBe(503);
    } finally {
      if (saved.a !== undefined) process.env.BUILDER_SESSION_SECRET = saved.a;
      if (saved.b !== undefined) process.env.BANK_SETUP_KEY = saved.b;
    }
  });
});
