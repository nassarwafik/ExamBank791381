import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/learning-study.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { loadCheckIndex, findCheckActivity, checkResponse, revealOf } from "../src/lib/learning-check.js";
import { studyDocName, loadStudyIndex, normalizeStudyDoc, applyStudyReveal, applyStudyCompletion, wasRevealed, studyStateOf } from "../src/lib/learning-study.js";

// 791381s Phase 2 — REVEAL mode on the server (docs/enterprise-791381s-enrichment-plan.md D3/D6), over the REAL generated indexes
// of the summary booklet (the «تدريبات الوحدة» page of m01: 14 reveal questions — 8 multipleChoice, 2 trueFalse and, since Phase 3,
// one wordBank, matching, ordering and classify — all study activities) and the in-memory container:
//   • every well-formed answer to a reveal block gets the verdict, the explanation AND the right answer (`reveal`), right or wrong;
//   • a malformed answer, or one of another kind, never gets the key;
//   • a student's WRONG answer records `revealed` once (CAS); a later RIGHT answer is judged but never completed (`revealedBefore`,
//     gained 0, persisted false); a FIRST right answer completes as usual and earns Strength; a completion is never undone;
//   • teachers get the reveal and nothing is written; non-reveal blocks (791381) keep the L.6b behaviour exactly.

const C = "791381s";
const CHECKS = loadCheckIndex(C);
const INDEX = loadStudyIndex(C);
const PAGE = "791381s-m01-l02-p01";
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const seed = (visible = ["791381s-m01"]) => createMemoryContainer({
  [USR("u1")]: { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "علي", code: "S1" },
  [CLS("cA")]: { classId: "cA", name: "صف", active: true, status: "active", studentIds: [], learningMaterials: [{ courseId: C, visibleModuleIds: visible }] },
});
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }) };
const studentDeps = ctx => ({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student" } }), container: ctx.container, getContainer: () => ctx.container });
const teacherDeps = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), container: ctx.container, getContainer: () => ctx.container });
const attempt = (deps, body) => handler({ method: "POST", url: "https://x", headers: { get: () => null }, params: { courseId: C, action: "attempt" }, json: async () => body }, deps);
const get = deps => handler({ method: "GET", url: "https://x", headers: { get: () => null }, params: { courseId: C } }, deps);

const acts = Object.entries(CHECKS.pages[PAGE].activities).map(([activityId, a]) => ({ activityId, ...a }));
const mc = acts.find(a => a.key.kind === "multipleChoice");
const tf = acts.find(a => a.key.kind === "trueFalse");
const MAP_FIELD = { wordBank: "answers", matching: "pairs", classify: "assign" };
const right = key => {
  switch (key.kind) {
    case "multipleChoice": return { kind: "multipleChoice", optionId: key.correct[0] };
    case "trueFalse": return { kind: "trueFalse", value: key.answer };
    case "ordering": return { kind: "ordering", order: [...key.order] };
    default: return { kind: key.kind, choices: { ...key[MAP_FIELD[key.kind]] } };
  }
};
const wrong = key => {
  switch (key.kind) {
    case "multipleChoice": return { kind: "multipleChoice", optionId: ["a", "b", "c", "d"].find(id => !key.correct.includes(id)) };
    case "trueFalse": return { kind: "trueFalse", value: !key.answer };
    case "ordering": return { kind: "ordering", order: [...key.order].reverse() };
    default: { const m = { ...key[MAP_FIELD[key.kind]] }; const [a, b] = Object.keys(m); [m[a], m[b]] = [m[b], m[a]]; return { kind: key.kind, choices: m }; }
  }
};
const expectedReveal = key => {
  switch (key.kind) {
    case "multipleChoice": return { kind: "multipleChoice", optionIds: key.correct };
    case "trueFalse": return { kind: "trueFalse", answer: key.answer };
    case "ordering": return { kind: "ordering", order: key.order };
    default: return { kind: key.kind, [MAP_FIELD[key.kind]]: key[MAP_FIELD[key.kind]] };
  }
};

describe("791381s reveal — the generated indexes", () => {
  it("the m01 «تدريبات الوحدة» page carries 14 reveal questions of six kinds, each a study activity with an explanation", () => {
    expect(acts).toHaveLength(14);
    expect(acts.map(a => a.key.kind).sort()).toEqual(["classify", "matching", "multipleChoice", "multipleChoice", "multipleChoice", "multipleChoice", "multipleChoice", "multipleChoice", "multipleChoice", "multipleChoice", "ordering", "trueFalse", "trueFalse", "wordBank"]);
    for (const a of acts) {
      expect(a.reveal, a.activityId).toBe(true);
      expect(a.study, a.activityId).toBe(true);
      expect(a.feedback.explanation, a.activityId).toBeTruthy();
      expect(INDEX.pages[PAGE].activities[a.activityId], a.activityId).toEqual(a.key);
    }
    expect(INDEX.pages[PAGE].moduleId).toBe("791381s-m01");
  });

  it("the 791381 check index has no reveal block (the first book keeps the L.6b behaviour)", () => {
    const first = loadCheckIndex("791381");
    for (const p of Object.values(first.pages)) for (const a of Object.values(p.activities)) expect(a.reveal).toBeUndefined();
  });
});

describe("791381s reveal — checkResponse / revealOf (pure)", () => {
  it("right and wrong answers both get the explanation and the right answer; a wrong one gets no hint ladder", () => {
    for (const a of acts) {
      const check = findCheckActivity(CHECKS, PAGE, a.activityId);
      const r = checkResponse(check, right(a.key));
      expect(r.correct).toBe(true);
      expect(r.reveal).toEqual(expectedReveal(a.key));
      expect(r.feedback.explanation).toBe(a.feedback.explanation);
      const w = checkResponse(check, wrong(a.key));
      expect(w.correct).toBe(false);
      expect(w.reveal).toEqual(expectedReveal(a.key));
      expect(w.feedback.explanation).toBe(a.feedback.explanation);
      expect(w.feedback.hints).toBeUndefined();
    }
  });

  it("no key leaves without an answer of THIS question: malformed, empty, or another kind → no reveal, no explanation on a wrong verdict", () => {
    const check = findCheckActivity(CHECKS, PAGE, mc.activityId);
    for (const bad of [null, {}, { kind: "trueFalse", value: true }, { kind: "multipleChoice" }, { kind: "multipleChoice", optionId: "" }, { kind: "multipleChoice", optionId: 3 }, "x"]) {
      const r = checkResponse(check, bad);
      expect(r.correct, JSON.stringify(bad)).toBe(false);
      expect(r.reveal, JSON.stringify(bad)).toBeUndefined();
      expect(r.feedback.explanation, JSON.stringify(bad)).toBeUndefined();
    }
    expect(revealOf(tf.key, { kind: "multipleChoice", optionId: "a" })).toBeNull();
    expect(revealOf({ kind: "shortInput", answer: "x" }, { kind: "shortInput", text: "y" })).toBeNull();   // not a reveal kind
  });
});

describe("791381s reveal — storage (pure)", () => {
  it("applyStudyReveal records once (first timestamp kept), never over a completion; normalize keeps it, drops junk, adds nothing when empty", () => {
    const at = { courseId: C, moduleId: "791381s-m01", pageId: PAGE, activityId: mc.activityId };
    const r1 = applyStudyReveal(null, at, "2026-10-31T10:00:00.000Z");
    expect(r1.recorded).toBe(true);
    expect(r1.doc.pages[PAGE].revealed).toEqual({ [mc.activityId]: "2026-10-31T10:00:00.000Z" });
    const r2 = applyStudyReveal(r1.doc, at, "2026-10-31T11:00:00.000Z");
    expect(r2.recorded).toBe(false);
    expect(r2.doc.pages[PAGE].revealed[mc.activityId]).toBe("2026-10-31T10:00:00.000Z");
    const done = applyStudyCompletion(null, INDEX, at, "2026-10-31T09:00:00.000Z").doc;
    const r3 = applyStudyReveal(done, at, "2026-10-31T12:00:00.000Z");
    expect(r3.recorded).toBe(false);
    expect(r3.doc.pages[PAGE].revealed).toBeUndefined();
    expect(normalizeStudyDoc({ pages: { [PAGE]: { courseId: C, moduleId: "m", completed: {}, revealed: { "bad id!": "x", [tf.activityId]: 5 } } } }).pages[PAGE].revealed).toEqual({ [tf.activityId]: "" });
    expect("revealed" in normalizeStudyDoc({ pages: { [PAGE]: { courseId: C, moduleId: "m", completed: {}, revealed: [] } } }).pages[PAGE]).toBe(false);
  });

  it("applyStudyCompletion never completes a revealed activity (overlapping wrong/right requests) and gains 0; revealed adds no point", () => {
    const at = { courseId: C, moduleId: "791381s-m01", pageId: PAGE, activityId: mc.activityId };
    const revealed = applyStudyReveal(null, at, "2026-10-31T10:00:00.000Z").doc;
    const out = applyStudyCompletion(revealed, INDEX, at, "2026-10-31T10:00:01.000Z");
    expect(out.revealedBefore).toBe(true);
    expect(out.gained).toBe(0);
    expect(out.doc.pages[PAGE].completed).toEqual({});
    expect(studyStateOf(revealed, INDEX).totalPoints).toBe(0);
    expect(wasRevealed(revealed, PAGE, mc.activityId)).toBe(true);
    expect(wasRevealed(revealed, PAGE, tf.activityId)).toBe(false);
  });
});

describe("791381s reveal — the real handler", () => {
  it("STUDENT, first answer right: completed, Strength gained, the right answer and explanation in the reply", async () => {
    const ctx = seed();
    const res = await attempt(studentDeps(ctx), { pageId: PAGE, activityId: mc.activityId, response: right(mc.key) });
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ correct: true, persisted: true, study: true, reveal: expectedReveal(mc.key) });
    expect(res.jsonBody.revealedBefore).toBeUndefined();
    expect(res.jsonBody.feedback.explanation).toBe(mc.feedback.explanation);
    expect(res.jsonBody.module).toMatchObject({ completed: 1, eligible: 14, points: 1, max: 20 });   // round(1 / 14 × 20) = 1
    expect(res.jsonBody.gained).toBe(1);
    expect(Object.keys(ctx.getJson(studyDocName("u1")).pages[PAGE].completed)).toEqual([mc.activityId]);
  });

  it("STUDENT, wrong then right: the wrong answer reveals (recorded once), the later right answer is judged but NEVER completed", async () => {
    const ctx = seed();
    const deps = studentDeps(ctx);
    const w = await attempt(deps, { pageId: PAGE, activityId: tf.activityId, response: wrong(tf.key) });
    expect(w.status).toBe(200);
    expect(w.jsonBody).toMatchObject({ correct: false, persisted: false, gained: 0, reveal: expectedReveal(tf.key) });
    expect(w.jsonBody.feedback.explanation).toBe(tf.feedback.explanation);
    const doc1 = ctx.getJson(studyDocName("u1"));
    expect(Object.keys(doc1.pages[PAGE].revealed)).toEqual([tf.activityId]);
    expect(doc1.pages[PAGE].completed).toEqual({});
    const stamp = doc1.pages[PAGE].revealed[tf.activityId];

    const w2 = await attempt(deps, { pageId: PAGE, activityId: tf.activityId, response: wrong(tf.key) });   // a second wrong: no rewrite
    expect(w2.jsonBody.correct).toBe(false);
    expect(ctx.getJson(studyDocName("u1")).pages[PAGE].revealed[tf.activityId]).toBe(stamp);

    const r = await attempt(deps, { pageId: PAGE, activityId: tf.activityId, response: right(tf.key) });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ correct: true, persisted: false, alreadyCompleted: false, revealedBefore: true, gained: 0, reveal: expectedReveal(tf.key) });
    expect(r.jsonBody.module.points).toBe(0);
    expect(ctx.getJson(studyDocName("u1")).pages[PAGE].completed).toEqual({});
    const state = await get(deps);
    expect(state.jsonBody.totalPoints).toBe(0);
    expect(state.jsonBody.policy).toEqual({ modulePointsMax: 20, moduleCount: 37 });
  });

  it("STUDENT, right then wrong: the completion stands (never marked revealed, never undone)", async () => {
    const ctx = seed();
    const deps = studentDeps(ctx);
    await attempt(deps, { pageId: PAGE, activityId: mc.activityId, response: right(mc.key) });
    const w = await attempt(deps, { pageId: PAGE, activityId: mc.activityId, response: wrong(mc.key) });
    expect(w.jsonBody.correct).toBe(false);
    const doc = ctx.getJson(studyDocName("u1"));
    expect(Object.keys(doc.pages[PAGE].completed)).toEqual([mc.activityId]);
    expect(doc.pages[PAGE].revealed).toBeUndefined();
    const again = await attempt(deps, { pageId: PAGE, activityId: mc.activityId, response: right(mc.key) });
    expect(again.jsonBody).toMatchObject({ correct: true, alreadyCompleted: true, gained: 0 });
  });

  it("all 14 questions right at the first answer → the module reads 20 / 20", async () => {
    const ctx = seed();
    const deps = studentDeps(ctx);
    let last = null;
    for (const a of acts) last = await attempt(deps, { pageId: PAGE, activityId: a.activityId, response: right(a.key) });
    expect(last.jsonBody.module).toEqual({ completed: 14, eligible: 14, points: 20, max: 20 });
  });

  it("a malformed answer gets no key and writes nothing; a hidden module → 403", async () => {
    const ctx = seed();
    const res = await attempt(studentDeps(ctx), { pageId: PAGE, activityId: mc.activityId, response: { kind: "multipleChoice" } });
    expect(res.status).toBe(200);
    expect(res.jsonBody.correct).toBe(false);
    expect(res.jsonBody.reveal).toBeUndefined();
    expect(ctx.getJson(studyDocName("u1"))).toBeNull();
    const hidden = seed([]);
    const denied = await attempt(studentDeps(hidden), { pageId: PAGE, activityId: mc.activityId, response: wrong(mc.key) });
    expect(denied.status).toBe(403);
    expect(denied.jsonBody.reveal).toBeUndefined();
  });

  it("TEACHER: the reveal and the explanation, nothing written", async () => {
    const ctx = seed();
    const w = await attempt(teacherDeps(ctx), { pageId: PAGE, activityId: mc.activityId, response: wrong(mc.key) });
    expect(w.jsonBody).toMatchObject({ actor: "teacher", correct: false, persisted: false, reveal: expectedReveal(mc.key) });
    expect(ctx.getJson(studyDocName("u1"))).toBeNull();
    expect(ctx.names().filter(n => n.startsWith("platform/learning-study/"))).toEqual([]);
  });
});
