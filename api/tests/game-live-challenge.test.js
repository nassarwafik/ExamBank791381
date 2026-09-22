import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/game-live-challenge.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { challengeDocName, summaryOf } from "../src/lib/live-challenge-store.js";

// The Live Challenge Generator API end-to-end over the REAL handler + REAL platform-storage (memory container):
// teacher auth required, save/load/list/delete, order + content preserved, malformed rejected, immutable snapshots.
const teacherDeps = (ctx, sub = "teacher-1") => ({ container: ctx.container, requireBuilderAuth: () => ({ ok: true, user: { role: "teacher", sub } }) });
const anonDeps = () => ({ requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) });

const q = (id, type = "multipleChoice", over = {}) => ({ question: { examQuestionId: id, presentationType: type, text: "", marks: 1, ...over }, source: { kind: "manual" } });
const defOf = (over = {}) => ({ schemaVersion: 1, challengeId: "chal-1", title: "تحدّي", courseId: "791381", questions: [q("q1"), q("q2", "cliFill")], ...over });

const list = deps => handler({ method: "GET", headers: { get: () => null }, params: {} }, deps);
const save = (deps, challenge) => handler({ method: "POST", headers: { get: () => null }, params: { action: "save" }, json: async () => ({ challenge }) }, deps);
const get = (deps, challengeId) => handler({ method: "POST", headers: { get: () => null }, params: { action: "get" }, json: async () => ({ challengeId }) }, deps);
const del = (deps, challengeId) => handler({ method: "POST", headers: { get: () => null }, params: { action: "delete" }, json: async () => ({ challengeId }) }, deps);

describe("auth", () => {
  it("requires a builder/teacher session", async () => {
    const r = await list(anonDeps());
    expect(r.status).toBe(401);
  });
});

describe("save + get + list (order and content preserved)", () => {
  it("saves a challenge and loads it back with the SAME question order and content", async () => {
    const ctx = createMemoryContainer();
    const s = await save(teacherDeps(ctx), defOf());
    expect(s.status).toBe(200);
    expect(s.jsonBody.summary).toEqual({ challengeId: "chal-1", title: "تحدّي", questionCount: 2, updatedAt: expect.any(String) });
    const g = await get(teacherDeps(ctx), "chal-1");
    expect(g.status).toBe(200);
    expect(g.jsonBody.challenge.questions.map(cq => cq.question.examQuestionId)).toEqual(["q1", "q2"]);
    expect(g.jsonBody.challenge.questions[1].question.presentationType).toBe("cliFill");
    expect(g.jsonBody.challenge.courseId).toBe("791381");
  });

  it("GET lists this teacher's challenges as summaries with no question content", async () => {
    const ctx = createMemoryContainer();
    await save(teacherDeps(ctx), defOf({ challengeId: "chal-1", title: "أول" }));
    await save(teacherDeps(ctx), defOf({ challengeId: "chal-2", title: "ثاني" }));
    const r = await list(teacherDeps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody.challenges.map(c => c.challengeId).sort()).toEqual(["chal-1", "chal-2"]);
    expect(JSON.stringify(r.jsonBody.challenges)).not.toContain("examQuestionId");
  });

  it("challenges are isolated per teacher", async () => {
    const ctx = createMemoryContainer();
    await save(teacherDeps(ctx, "teacher-A"), defOf({ challengeId: "chal-A" }));
    const other = await list(teacherDeps(ctx, "teacher-B"));
    expect(other.jsonBody.challenges).toEqual([]);
    const mine = await list(teacherDeps(ctx, "teacher-A"));
    expect(mine.jsonBody.challenges.length).toBe(1);
  });

  it("re-saving replaces (does not duplicate) and updates the stored order", async () => {
    const ctx = createMemoryContainer();
    await save(teacherDeps(ctx), defOf());
    await save(teacherDeps(ctx), defOf({ questions: [q("q2", "cliFill"), q("q1")] }));   // reordered
    const g = await get(teacherDeps(ctx), "chal-1");
    expect(g.jsonBody.challenge.questions.map(cq => cq.question.examQuestionId)).toEqual(["q2", "q1"]);
    expect(ctx.names(challengeDocName("teacher-1", "chal-1")).length).toBe(1);            // single blob, replaced
  });
});

describe("delete + not-found", () => {
  it("deletes a challenge; a later get returns 404", async () => {
    const ctx = createMemoryContainer();
    await save(teacherDeps(ctx), defOf());
    expect((await del(teacherDeps(ctx), "chal-1")).status).toBe(200);
    expect((await get(teacherDeps(ctx), "chal-1")).status).toBe(404);
  });
  it("get for an unknown challenge is 404", async () => {
    const ctx = createMemoryContainer();
    expect((await get(teacherDeps(ctx), "nope")).status).toBe(404);
  });
});

describe("strict validation — malformed input rejected with 400, nothing written", () => {
  it("rejects missing challengeId / non-array questions / malformed question entries", async () => {
    const ctx = createMemoryContainer();
    expect((await save(teacherDeps(ctx), { title: "no id", questions: [] })).status).toBe(400);
    expect((await save(teacherDeps(ctx), { challengeId: "c", questions: "x" })).status).toBe(400);
    expect((await save(teacherDeps(ctx), { challengeId: "c", questions: [{ nope: 1 }] })).status).toBe(400);
    expect((await save(teacherDeps(ctx), { challengeId: "c", questions: [{ question: { presentationType: "multipleChoice" } }] })).status).toBe(400); // no examQuestionId
    expect(ctx.names("platform/games/live-challenge/").length).toBe(0);                   // nothing persisted
  });
  it("save with an empty questions array is allowed (a new empty challenge)", async () => {
    const ctx = createMemoryContainer();
    const r = await save(teacherDeps(ctx), defOf({ questions: [] }));
    expect(r.status).toBe(200);
    expect(r.jsonBody.summary.questionCount).toBe(0);
  });
});
