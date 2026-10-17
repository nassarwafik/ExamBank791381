import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/learning-study.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { loadCheckIndex, findCheckActivity, checkResponse } from "../src/lib/learning-check.js";
import { studyDocName } from "../src/lib/learning-study.js";
import { listLearningModules } from "../src/lib/learning-materials-registry.js";

// Phase L.6b — the server judges EVERY in-page answer (the browser holds no key) and returns the verdict with only the feedback that
// answer earns, over the REAL generated check index (api/src/data/learning-check/791381.json) and the in-memory container:
// right → the right message + the explanation; wrong → the wrong message + the hint ladder; a table → a verdict per answered cell; a
// self-check block (`studyEligible: false`) → judged and answered, never recorded; the key itself is never in a reply.

const C = "791381";
const CHECKS = loadCheckIndex(C);
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const ORDER = listLearningModules(C).map(m => m.moduleId);
const through = moduleId => ORDER.slice(0, ORDER.indexOf(moduleId) + 1);
const seed = visible => createMemoryContainer({
  [USR("u1")]: { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "علي", code: "S1" },
  [CLS("cA")]: { classId: "cA", name: "صف", active: true, status: "active", studentIds: [], learningMaterials: [{ courseId: C, visibleModuleIds: visible }] },
});
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }) };
const studentDeps = ctx => ({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student" } }), container: ctx.container, getContainer: () => ctx.container });
const teacherDeps = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), container: ctx.container, getContainer: () => ctx.container });
const attempt = (deps, body) => handler({ method: "POST", url: "https://x", headers: { get: () => null }, params: { courseId: C, action: "attempt" }, json: async () => body }, deps);

const all = Object.entries(CHECKS.pages).flatMap(([pageId, p]) => Object.entries(p.activities).map(([activityId, a]) => ({ pageId, moduleId: p.moduleId, activityId, ...a })));
const right = key => {
  switch (key.kind) {
    case "multipleChoice": return { kind: "multipleChoice", optionId: key.correct[0] };
    case "trueFalse": return { kind: "trueFalse", value: key.answer };
    case "shortInput": return { kind: "shortInput", text: " " + key.answer.toUpperCase() + " " };
    case "practice-table": return { kind: "practice-table", choices: { ...key.cells } };
  }
};
const wrong = key => {
  switch (key.kind) {
    case "multipleChoice": return { kind: "multipleChoice", optionId: "no-such-option" };
    case "trueFalse": return { kind: "trueFalse", value: !key.answer };
    case "shortInput": return { kind: "shortInput", text: key.answer + "x" };
    case "practice-table": { const cells = { ...key.cells }; const first = Object.keys(cells)[0]; cells[first] = cells[first] + "؟"; return { kind: "practice-table", choices: cells }; }
  }
};
/** The key's own values, as they could appear in a reply (an MC's right option id, a short answer, a table cell's choice). */
const keyValues = key => key.kind === "multipleChoice" ? key.correct : key.kind === "shortInput" ? [key.answer] : key.kind === "practice-table" ? Object.values(key.cells) : [];

describe("L.6b — the check index and the pure checker", () => {
  it("covers the whole book: 479 checkable blocks (257 MC, 91 T/F, 67 short, 64 tables) in all 28 modules; 4 self-checks", () => {
    const kinds = {};
    for (const a of all) kinds[a.key.kind] = (kinds[a.key.kind] || 0) + 1;
    expect(kinds).toEqual({ multipleChoice: 257, trueFalse: 91, shortInput: 67, "practice-table": 64 });
    expect(new Set(all.map(a => a.moduleId)).size).toBe(28);
    expect(all.filter(a => !a.study).map(a => a.key.kind)).toEqual(["practice-table", "practice-table", "practice-table", "practice-table"]);
    expect(findCheckActivity(CHECKS, all[0].pageId, "nope")).toBeNull();
    expect(findCheckActivity(CHECKS, "../x", all[0].activityId)).toBeNull();
    expect(findCheckActivity(CHECKS, all[1].pageId === all[0].pageId ? "791381-m99-l01-p01" : all[1].pageId, all[0].activityId)).toBeNull();
    expect(loadCheckIndex("../etc")).toBeNull();
    expect(loadCheckIndex("000000")).toBeNull();
  });

  it("every block of the book: a right answer earns the right message + explanation and never a hint; a wrong one the wrong message + hints and never the explanation", () => {
    for (const a of all) {
      const ok = checkResponse(a, right(a.key)), no = checkResponse(a, wrong(a.key));
      expect(ok.correct, a.activityId).toBe(true);
      expect(no.correct, a.activityId).toBe(false);
      expect(ok.feedback, a.activityId).toEqual({ ...(a.feedback.correct ? { message: a.feedback.correct } : {}), ...(a.feedback.explanation ? { explanation: a.feedback.explanation } : {}) });
      expect(no.feedback, a.activityId).toEqual({ ...(a.feedback.incorrect ? { message: a.feedback.incorrect } : {}), ...(a.feedback.hints?.length ? { hints: a.feedback.hints } : {}) });
    }
  });

  it("a table: a verdict per answered cell (unanswered, empty and unknown cells say nothing); right only when every cell is right", () => {
    const t = all.find(a => a.key.kind === "practice-table" && Object.keys(a.key.cells).length >= 2);
    const [c1, c2] = Object.keys(t.key.cells);
    const partial = checkResponse(t, { kind: "practice-table", choices: { [c1]: t.key.cells[c1], [c2]: t.key.cells[c2] + "؟", "99:9": "x", [c1 + "x"]: "y" } });
    expect(partial).toMatchObject({ correct: false, cells: { [c1]: true, [c2]: false } });
    expect(Object.keys(partial.cells)).toEqual([c1, c2]);
    expect(checkResponse(t, { kind: "practice-table", choices: { [c1]: "" } }).cells).toEqual({});
    expect(checkResponse(t, { kind: "practice-table", choices: [] }).cells).toEqual({});
    expect(checkResponse(t, right(t.key))).toMatchObject({ correct: true });
    expect(Object.values(checkResponse(t, right(t.key)).cells).every(Boolean)).toBe(true);
  });

  it("malformed and mismatched responses are simply wrong", () => {
    const mc = all.find(a => a.key.kind === "multipleChoice");
    for (const r of [null, "x", {}, { kind: "trueFalse", value: true }, { kind: "multipleChoice" }, { kind: "multipleChoice", optionId: 3 }]) expect(checkResponse(mc, r).correct).toBe(false);
  });
});

describe("L.6b — POST /api/learning-study/{course}/attempt answers every answer", () => {
  const study = all.find(a => a.study && a.key.kind === "multipleChoice" && a.feedback.explanation && a.feedback.hints?.length && a.feedback.correct && a.feedback.incorrect);
  const self = all.find(a => !a.study);

  it("a wrong answer: the verdict, the wrong message and the hints — no explanation, no key, nothing written", async () => {
    const ctx = seed(through(study.moduleId));
    const r = await attempt(studentDeps(ctx), { pageId: study.pageId, activityId: study.activityId, response: wrong(study.key) });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, correct: false, study: true, persisted: false, gained: 0, feedback: { message: study.feedback.incorrect, hints: study.feedback.hints } });
    expect(r.jsonBody.feedback.explanation).toBeUndefined();
    for (const v of keyValues(study.key)) expect(JSON.stringify(r.jsonBody)).not.toContain('"' + v + '"');
    expect(ctx.names("platform/learning-study/")).toEqual([]);
  });

  it("a right answer to a study block: recorded once, with the right message and the explanation (no hint)", async () => {
    const ctx = seed(through(study.moduleId));
    const r = await attempt(studentDeps(ctx), { pageId: study.pageId, activityId: study.activityId, response: right(study.key) });
    expect(r.jsonBody).toMatchObject({ correct: true, study: true, persisted: true, feedback: { message: study.feedback.correct, explanation: study.feedback.explanation } });
    expect(r.jsonBody.feedback.hints).toBeUndefined();
    expect(Object.keys(ctx.getJson(studyDocName("u1")).pages[study.pageId].completed)).toEqual([study.activityId]);
    const again = await attempt(studentDeps(ctx), { pageId: study.pageId, activityId: study.activityId, response: right(study.key) });
    expect(again.jsonBody).toMatchObject({ correct: true, alreadyCompleted: true, gained: 0, feedback: { message: study.feedback.correct } });
  });

  it("a self-check block (studyEligible: false): judged with a verdict per cell, answered, never recorded", async () => {
    const ctx = seed(through(self.moduleId));
    const ok = await attempt(studentDeps(ctx), { pageId: self.pageId, activityId: self.activityId, response: right(self.key) });
    expect(ok.status).toBe(200);
    expect(ok.jsonBody).toMatchObject({ ok: true, correct: true, study: false, persisted: false, alreadyCompleted: false, gained: 0 });
    expect(Object.values(ok.jsonBody.cells).every(Boolean)).toBe(true);
    const no = await attempt(studentDeps(ctx), { pageId: self.pageId, activityId: self.activityId, response: wrong(self.key) });
    expect(no.jsonBody).toMatchObject({ correct: false, study: false });
    expect(Object.values(no.jsonBody.cells)).toContain(false);
    expect(ctx.names("platform/learning-study/")).toEqual([]);
  });

  it("the class gate holds for every answer: a hidden module's block is refused (403), nothing is judged or said", async () => {
    const at = ORDER.indexOf(study.moduleId);
    const ctx = seed(ORDER.slice(0, at));                                  // everything before the block's module
    const r = await attempt(studentDeps(ctx), { pageId: study.pageId, activityId: study.activityId, response: wrong(study.key) });
    expect(r.status).toBe(403);
    expect(r.jsonBody.feedback).toBeUndefined();
    expect((await attempt(studentDeps(ctx), { pageId: study.pageId, activityId: "invented-id", response: wrong(study.key) })).status).toBe(404);
  });

  it("a teacher previewing gets the same verdict and feedback, never recorded", async () => {
    const ctx = seed([]);
    const r = await attempt(teacherDeps(ctx), { pageId: study.pageId, activityId: study.activityId, response: wrong(study.key) });
    expect(r.jsonBody).toMatchObject({ actor: "teacher", correct: false, feedback: { message: study.feedback.incorrect, hints: study.feedback.hints } });
    const t = await attempt(teacherDeps(ctx), { pageId: self.pageId, activityId: self.activityId, response: right(self.key) });
    expect(t.jsonBody).toMatchObject({ actor: "teacher", correct: true, study: false, persisted: false });
    expect(ctx.names("platform/learning-study/")).toEqual([]);
  });

  it("every study block of a module answered right through the handler reads 20 / 20 — the study authority is unchanged", async () => {
    const m = "791381-m08";
    const ctx = seed(through(m));
    let last = null;
    for (const a of all.filter(x => x.moduleId === m && x.study)) last = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: right(a.key) });
    expect(last.jsonBody.module).toMatchObject({ completed: 14, eligible: 14, points: 20 });
  });
});
