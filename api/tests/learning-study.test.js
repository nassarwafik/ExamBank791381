import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/learning-study.js";
import { handler as dashboard } from "../src/functions/student-dashboard.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import {
  STUDY_MODULE_MAX_POINTS, STUDY_MODULE_COUNT, STUDY_MAX_TOTAL, LEARNING_PRACTICE_MAX_POINTS, studyPointsForModule, studyPointsFromModules, buildStrengthSummary,
} from "../src/lib/student-strength.js";
import {
  studyDocName, loadStudyIndex, findStudyActivity, pageEligibleCount, moduleEligibleCounts, evaluateStudyResponse, normalizeStudyDoc, applyStudyCompletion, studyStateOf, studyModulesForStrength, studyAllowedForClass,
} from "../src/lib/learning-study.js";
import { listLearningTrainings } from "../src/lib/learning-training-registry.js";
import { listLearningModules } from "../src/lib/learning-materials-registry.js";

// Study Practice Strength — the SERVER authority for in-page learning exercises over the REAL generated key index
// (api/src/data/learning-study/791381.json) and the in-memory container: policy (per MODULE round(completed /
// eligible × 20), 28 modules × 20 = 560), anti-farming (completion state, idempotent CAS writes), security (invented
// ids, wrong page, hidden module, archived class, persisted-class authority, client claims ignored, malformed
// payloads), no T/F double count and the Unified Strength integration (study points enter the raw total).

const INDEX = loadStudyIndex("791381");
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1", ...extra });
const room = (id, visible, extra = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], learningMaterials: visible === null ? [] : [{ courseId: "791381", visibleModuleIds: visible }], ...extra });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const BUILDER_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const studentDeps = (ctx, id = "u1", extra = {}) => ({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: id, sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container, ...extra });
const teacherDeps = ctx => ({ ...BUILDER_OK, container: ctx.container, getContainer: () => ctx.container });
const get = (deps, courseId = "791381") => handler({ method: "GET", url: "https://x/api/learning-study", headers: { get: () => null }, params: { courseId } }, deps);
const attempt = (deps, body, courseId = "791381") => handler({ method: "POST", url: "https://x/api/learning-study", headers: { get: () => null }, params: { courseId, action: "attempt" }, json: async () => body }, deps);
const ORDER = listLearningModules("791381").map(m => m.moduleId);
const through = moduleId => ORDER.slice(0, ORDER.indexOf(moduleId) + 1);
const seed = (visible, extra = {}) => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", visible), ...extra });

/** A correct response for an indexed activity (the key is server data — the tests build the learner's answer from it). */
function correctResponse(key) {
  switch (key.kind) {
    case "multipleChoice": return { kind: "multipleChoice", optionId: key.correct[0] };
    case "trueFalse": return { kind: "trueFalse", value: key.answer };
    case "shortInput": return { kind: "shortInput", text: "  " + key.answer.toUpperCase() + "  " };   // normalization: trim + case
    case "practice-table": return { kind: "practice-table", choices: { ...key.cells } };
  }
}
function wrongResponse(key) {
  switch (key.kind) {
    case "multipleChoice": return { kind: "multipleChoice", optionId: "no-such-option" };
    case "trueFalse": return { kind: "trueFalse", value: !key.answer };
    case "shortInput": return { kind: "shortInput", text: key.answer + "x" };
    case "practice-table": { const cells = { ...key.cells }; const first = Object.keys(cells)[0]; cells[first] = cells[first] + "؟"; return { kind: "practice-table", choices: cells }; }
  }
}
/** Pages of a module with their eligible activity ids, in index order. */
const pagesOf = moduleId => Object.entries(INDEX.pages).filter(([, p]) => p.moduleId === moduleId).map(([pageId, p]) => ({ pageId, activities: Object.entries(p.activities) }));
const M08 = "791381-m08";
const m08pages = pagesOf(M08);
const P1 = m08pages.find(p => p.activities.length >= 3) || m08pages[0];
const P2 = m08pages.find(p => p.pageId !== P1.pageId);
const act = (page, i) => ({ pageId: page.pageId, activityId: page.activities[i][0], key: page.activities[i][1] });

describe("the generated key index", () => {
  it("covers the real content: 230 pages / 475 eligible activities of four kinds across ALL 28 modules, every page mapped to a registered module; unknown ids resolve to null", () => {
    expect(INDEX.schemaVersion).toBe(1); expect(INDEX.courseId).toBe("791381");
    const pages = Object.entries(INDEX.pages);
    expect(pages.length).toBe(230);
    const kinds = {};
    let count = 0;
    for (const [pageId, p] of pages) {
      expect(ORDER).toContain(p.moduleId);
      expect(pageId.startsWith(p.moduleId + "-")).toBe(true);
      for (const [id, key] of Object.entries(p.activities)) { count++; kinds[key.kind] = (kinds[key.kind] || 0) + 1; expect(id).toMatch(/^m\d\d-l\d\d-p\d\d-/); }
    }
    expect(count).toBe(475);
    expect(kinds).toEqual({ multipleChoice: 257, trueFalse: 91, shortInput: 67, "practice-table": 60 });
    expect(findStudyActivity(INDEX, "791381-m99-l01-p01", "x")).toBeNull();
    expect(findStudyActivity(INDEX, P1.pageId, "m08-l01-p01-nope")).toBeNull();
    expect(findStudyActivity(INDEX, P2.pageId, act(P1, 0).activityId)).toBeNull();          // an activity of ANOTHER page
    expect(loadStudyIndex("000000")).toBeNull(); expect(loadStudyIndex("../x")).toBeNull();
  });
  it("the server evaluator judges every kind and rejects malformed / mismatched responses", () => {
    for (const p of Object.values(INDEX.pages)) for (const key of Object.values(p.activities)) {
      expect(evaluateStudyResponse(key, correctResponse(key))).toBe(true);
      expect(evaluateStudyResponse(key, wrongResponse(key))).toBe(false);
    }
    const mc = act(P1, 0).key;
    for (const bad of [null, undefined, "x", 1, {}, { kind: "trueFalse" }, { kind: mc.kind }, { kind: mc.kind, optionId: 5 }, { kind: mc.kind, optionId: "", correct: true }]) expect(evaluateStudyResponse(mc, bad)).toBe(false);
    expect(evaluateStudyResponse({ kind: "shortInput", answer: "abc" }, { kind: "shortInput", text: "   " })).toBe(false);
    expect(evaluateStudyResponse({ kind: "practice-table", cells: { "0:1": "a", "1:1": "b" } }, { kind: "practice-table", choices: { "0:1": "a" } })).toBe(false);   // partial table is not complete
    expect(evaluateStudyResponse({ kind: "practice-table", cells: {} }, { kind: "practice-table", choices: {} })).toBe(false);
  });
});


// m08 has 12 indexed pages / 14 eligible activities; m28 has 32 pages / 57 activities (REAL index data).
const ELIGIBLE = moduleEligibleCounts(INDEX);
const M08_ELIGIBLE = ELIGIBLE[M08];
const M28_ELIGIBLE = ELIGIBLE["791381-m28"];
const m08pts = k => Math.round(k / M08_ELIGIBLE * 20);
const m28pts = k => Math.round(k / M28_ELIGIBLE * 20);

describe("policy — the authoritative module formula", () => {
  it("constants: 20 per module, 28 modules, 560 total; m08 has 14 eligible activities, m28 has 57, m01 9, m02 13; the index covers ALL 28 modules", () => {
    expect([STUDY_MODULE_MAX_POINTS, STUDY_MODULE_COUNT, STUDY_MAX_TOTAL]).toEqual([20, 28, 560]);
    expect(M08_ELIGIBLE).toBe(14); expect(M28_ELIGIBLE).toBe(57);
    expect(Object.values(ELIGIBLE).reduce((s, n) => s + n, 0)).toBe(475);
    expect(Object.keys(ELIGIBLE).length).toBe(28);
    expect(ELIGIBLE["791381-m01"]).toBe(9); expect(ELIGIBLE["791381-m02"]).toBe(13);
    for (const id of ORDER) expect(ELIGIBLE[id], id).toBeGreaterThan(0);
    for (const id of Object.keys(ELIGIBLE)) expect(ORDER).toContain(id);
    expect(pageEligibleCount(INDEX, P1.pageId)).toBe(P1.activities.length); expect(pageEligibleCount(INDEX, "791381-m99-l01-p01")).toBe(0);
  });
  it("module: round(completed / eligible × 20) — m08 1 → 1, 2 → 3, 7 → 10, 14 → 20; m28 1 → 0, 2 → 1, 57 → 20; over-completion clamps at 20", () => {
    expect([1, 2, 7, 14].map(k => studyPointsForModule({ completed: k, eligible: 14 }))).toEqual([1, 3, 10, 20]);
    expect([1, 2, 57].map(k => studyPointsForModule({ completed: k, eligible: 57 }))).toEqual([0, 1, 20]);
    expect(studyPointsForModule({ completed: 99, eligible: 14 })).toBe(20);
    expect(studyPointsFromModules({ [M08]: { completed: 7, eligible: 14 }, "791381-m28": { completed: 57, eligible: 57 }, "791381-m01": { completed: 0, eligible: 9 } })).toBe(30);
  });
  it("the whole content fully completed = 28 modules × 20 = 560 — the FULL study capacity is attainable (m01 9/9 → 20, m02 13/13 → 20)", () => {
    const everything = Object.fromEntries(Object.entries(ELIGIBLE).map(([m, n]) => [m, { completed: n, eligible: n }]));
    expect(Object.keys(everything).length).toBe(28);
    expect(studyPointsForModule(everything["791381-m01"])).toBe(20); expect(studyPointsForModule(everything["791381-m02"])).toBe(20);
    expect(studyPointsFromModules(everything)).toBe(560);
    expect(studyPointsFromModules(everything)).toBe(STUDY_MAX_TOTAL);
  });
  it("the learning-only path reaches EXACTLY 2000: 36 perfect Learning-Practice items (1440) + every study module complete (560) → stage 25 / 2000 / 80 / 100% / pathComplete, with no exam and no project", () => {
    const everything = Object.fromEntries(Object.entries(ELIGIBLE).map(([m, n]) => [m, { completed: n, eligible: n }]));
    const trainings = Object.fromEntries(listLearningTrainings().map(t => [t.trainingId, { bestPercentage: 100 }]));
    expect(Object.keys(trainings).length).toBe(36);
    const s = buildStrengthSummary({ finalizedCount: 0, trainings, study: everything, projects: [] });
    expect(s).toMatchObject({ examPoints: 0, projectPoints: 0, practicePoints: 1440, studyPoints: 560, rawTotalPoints: 2000, stagePoints: 2000, stageNumber: 25, withinStagePoints: 80, stagePercent: 100, nextStageNumber: null, nextStageRemaining: 0, pointsToMaximum: 0, isMaximumStage: true, pathComplete: true });
    // one item or one module short of perfect is NOT complete
    expect(buildStrengthSummary({ finalizedCount: 0, trainings: { ...trainings, F06: { bestPercentage: 90 } }, study: everything, projects: [] })).toMatchObject({ rawTotalPoints: 1996, stageNumber: 25, pathComplete: false, pointsToMaximum: 4 });
  });
  it("buildStrengthSummary: study is the fourth raw source; absent study → 0; T05 80% = 32 and F01 100% = 40 both count", () => {
    const base = { finalizedCount: 3, trainings: { T05: { bestPercentage: 80 }, F01: { bestPercentage: 100 } }, projects: [{ projectCode: "794589", overallProgress: 25 }] };
    expect(buildStrengthSummary(base)).toMatchObject({ examPoints: 300, practicePoints: 72, studyPoints: 0, projectPoints: 100, rawTotalPoints: 472, stageNumber: 6 });
    const withStudy = buildStrengthSummary({ ...base, study: { [M08]: { completed: 7, eligible: 14 }, "791381-m09": { completed: 9, eligible: 9 } } });
    expect(withStudy).toMatchObject({ examPoints: 300, practicePoints: 72, studyPoints: 30, projectPoints: 100, rawTotalPoints: 502, stageNumber: 7, withinStagePoints: 22 });
    expect(withStudy.practicePoints).toBe(32 + LEARNING_PRACTICE_MAX_POINTS);
  });
});

describe("storage — completion state, never a counter", () => {
  it("normalize: malformed docs → empty; foreign ids dropped; applyStudyCompletion is idempotent, keeps the first timestamp and reports page counts + the module-derived gain", () => {
    expect(normalizeStudyDoc(null)).toEqual({ schemaVersion: 1, pages: {} });
    expect(normalizeStudyDoc({ pages: { "bad id!": { completed: { a: "t" } }, ok: { completed: { "x y": "t", good: 3 } } } })).toEqual({ schemaVersion: 1, pages: { ok: { courseId: "", moduleId: "", completed: { good: "" } } } });
    const a = act(P1, 0), b = act(P1, 1), c = act(P1, 2);
    let r = applyStudyCompletion(null, INDEX, { courseId: "791381", moduleId: M08, pageId: P1.pageId, activityId: a.activityId }, "2026-09-20T10:00:00.000Z");
    expect(r).toMatchObject({ alreadyCompleted: false, pageBefore: 0, pageAfter: 1, gained: m08pts(1) });
    r = applyStudyCompletion(r.doc, INDEX, { courseId: "791381", moduleId: M08, pageId: P1.pageId, activityId: a.activityId }, "2026-09-20T11:00:00.000Z");
    expect(r).toMatchObject({ alreadyCompleted: true, pageBefore: 1, pageAfter: 1, gained: 0 });
    expect(r.doc.pages[P1.pageId].completed[a.activityId]).toBe("2026-09-20T10:00:00.000Z");
    r = applyStudyCompletion(r.doc, INDEX, { courseId: "791381", moduleId: M08, pageId: P1.pageId, activityId: b.activityId }, "t2");
    expect(r).toMatchObject({ alreadyCompleted: false, pageBefore: 1, pageAfter: 2, gained: m08pts(2) - m08pts(1) });
    r = applyStudyCompletion(r.doc, INDEX, { courseId: "791381", moduleId: M08, pageId: P1.pageId, activityId: c.activityId }, "t3");
    expect(r).toMatchObject({ alreadyCompleted: false, pageBefore: 2, pageAfter: 3, gained: m08pts(3) - m08pts(2) });
    expect(Object.keys(r.doc.pages[P1.pageId].completed).length).toBe(3);
    const state = studyStateOf(r.doc, INDEX);
    expect(state.pages[P1.pageId]).toMatchObject({ moduleId: M08, eligible: 3 }); expect(state.pages[P1.pageId].completed.length).toBe(3);
    expect(state.moduleViews[M08]).toEqual({ completed: 3, eligible: 14, points: m08pts(3), max: 20 }); expect(state.totalPoints).toBe(m08pts(3));
    expect(state.modules[M08]).toEqual({ completed: 3, eligible: 14 });
    // EVERY indexed module is present with its eligible total even when nothing was completed there
    expect(Object.keys(state.modules).length).toBe(28);
    expect(state.modules["791381-m28"]).toEqual({ completed: 0, eligible: 57 });
    expect(state.modules["791381-m01"]).toEqual({ completed: 0, eligible: 9 }); expect(state.modules["791381-m02"]).toEqual({ completed: 0, eligible: 13 });
    expect(studyStateOf(null, INDEX).moduleViews["791381-m28"]).toEqual({ completed: 0, eligible: 57, points: 0, max: 20 });
  });
  it("ids that are no longer in the index stop counting (an activity removed / renamed in content never keeps a point), and a stored 'points' field is never trusted", () => {
    const doc = { schemaVersion: 1, points: 999, pages: { [P1.pageId]: { courseId: "791381", moduleId: M08, points: 99, completed: { [act(P1, 0).activityId]: "t", "m08-l01-p01-ghost": "t", "renamed-id": "t" } } } };
    const state = studyStateOf(doc, INDEX);
    expect(state.pages[P1.pageId].completed).toEqual([act(P1, 0).activityId]);
    expect(state.totalPoints).toBe(m08pts(1));
    expect(studyModulesForStrength(doc, ["791381"])[M08]).toEqual({ completed: 1, eligible: 14 });
    expect(Object.keys(studyModulesForStrength(doc, ["791381"])).length).toBe(28);
    expect(studyModulesForStrength(doc, ["000000"])).toEqual({});
    // a page stored under another course id does not count for this course's index
    expect(studyStateOf({ pages: { [P1.pageId]: { courseId: "999999", moduleId: M08, completed: { [act(P1, 0).activityId]: "t" } } } }, INDEX).totalPoints).toBe(0);
  });
  it("NO T/F DOUBLE COUNT: no Learning-Practice id is ever an eligible study activity, and a stored completion under a training id counts nothing", () => {
    const trainingIds = listLearningTrainings().map(t => t.trainingId);
    for (const p of Object.values(INDEX.pages)) for (const id of Object.keys(p.activities)) { expect(trainingIds).not.toContain(id); expect(id).not.toMatch(/^(T\d\d|F0\d)$/); }
    const doc = { schemaVersion: 1, pages: { [P1.pageId]: { courseId: "791381", moduleId: M08, completed: { T10: "t", F06: "t", [act(P1, 0).activityId]: "t" } } } };
    const state = studyStateOf(doc, INDEX);
    expect(state.pages[P1.pageId].completed).toEqual([act(P1, 0).activityId]);
    expect(state.modules[M08]).toEqual({ completed: 1, eligible: 14 });
    expect(findStudyActivity(INDEX, P1.pageId, "T10")).toBeNull();
  });
  it("studyAllowedForClass = active class + course attached + module published (the Learning-Practice authority)", () => {
    expect(studyAllowedForClass(room("c", through(M08)), "791381", M08)).toBe(true);
    expect(studyAllowedForClass(room("c", through("791381-m07")), "791381", M08)).toBe(false);
    expect(studyAllowedForClass(room("c", null), "791381", M08)).toBe(false);
    expect(studyAllowedForClass(room("c", through(M08), { status: "archived" }), "791381", M08)).toBe(false);
    expect(studyAllowedForClass(null, "791381", M08)).toBe(false);
  });
});

describe("API — attempts through the real handler (student)", () => {
  it("m08: 1st correct → module 1/14 = 1 (+1), 2nd → 3 (+2), 3rd → 4 (+1); wrong = nothing written; state lists the completed ids, the page's eligible count and every module", async () => {
    const ctx = seed(through(M08));
    const a = act(P1, 0), b = act(P1, 1), c = act(P1, 2);
    const before = await get(studentDeps(ctx));
    expect(before.status).toBe(200);
    expect(before.jsonBody).toMatchObject({ ok: true, actor: "student", courseId: "791381", policy: { modulePointsMax: 20, moduleCount: 28 }, pages: {}, totalPoints: 0 });
    expect(before.jsonBody.modules[M08]).toEqual({ completed: 0, eligible: 14, points: 0, max: 20 });
    expect(Object.keys(before.jsonBody.modules).length).toBe(28);
    const wrong = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: wrongResponse(a.key) });
    expect(wrong.jsonBody).toMatchObject({ ok: true, correct: false, persisted: false, gained: 0, page: { pageId: a.pageId, moduleId: M08, completed: [], eligible: 3 }, module: { completed: 0, eligible: 14, points: 0, max: 20 } });
    expect(ctx.names("platform/learning-study/")).toEqual([]);                                // a wrong answer writes nothing
    const r1 = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
    expect(r1.jsonBody).toMatchObject({ ok: true, actor: "student", correct: true, persisted: true, alreadyCompleted: false, gained: 1, page: { completed: [a.activityId], eligible: 3 }, module: { completed: 1, eligible: 14, points: 1, max: 20 }, totalPoints: 1 });
    const r2 = await attempt(studentDeps(ctx), { pageId: b.pageId, activityId: b.activityId, response: correctResponse(b.key) });
    expect(r2.jsonBody).toMatchObject({ correct: true, persisted: true, gained: 2, module: { completed: 2, points: 3 }, totalPoints: 3 });
    const r3 = await attempt(studentDeps(ctx), { pageId: c.pageId, activityId: c.activityId, response: correctResponse(c.key) });
    expect(r3.jsonBody).toMatchObject({ correct: true, persisted: true, alreadyCompleted: false, gained: 1, module: { completed: 3, points: 4 }, totalPoints: 4 });
    expect(r3.jsonBody.page.completed.sort()).toEqual([a.activityId, b.activityId, c.activityId].sort());
    const after = await get(studentDeps(ctx));
    expect(after.jsonBody.pages[P1.pageId]).toMatchObject({ moduleId: M08, eligible: 3 });
    expect(after.jsonBody.modules[M08]).toEqual({ completed: 3, eligible: 14, points: 4, max: 20 }); expect(after.jsonBody.totalPoints).toBe(4);
    expect(ctx.names("platform/").sort()).toEqual([USR("u1"), CLS("cA"), studyDocName("u1")].sort());  // ONLY the study document was written
    expect(ctx.names("platform/learning-practice/")).toEqual([]); expect(ctx.names("platform/assignments/")).toEqual([]); expect(ctx.names("platform/gradebook/")).toEqual([]);
  });
  it("anti-farming: repeat of a completed activity, duplicate requests, a re-opened page and correct-after-wrong never add a second completion; concurrent retries converge", async () => {
    const ctx = seed(through(M08));
    const a = act(P1, 0);
    await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: wrongResponse(a.key) });
    const first = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
    expect(first.jsonBody).toMatchObject({ gained: 1, alreadyCompleted: false, persisted: true });
    const stamp = ctx.getJson(studyDocName("u1")).pages[a.pageId].completed[a.activityId];
    for (let i = 0; i < 5; i++) {
      const again = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
      expect(again.jsonBody).toMatchObject({ correct: true, persisted: false, alreadyCompleted: true, gained: 0, module: { completed: 1, points: 1 }, totalPoints: 1 });
    }
    expect(ctx.getJson(studyDocName("u1")).pages[a.pageId].completed[a.activityId]).toBe(stamp);   // the first completion stands
    // overlapping submissions: the CAS loop re-applies against the freshest document → one entry, one gain
    const results = await Promise.all(Array.from({ length: 6 }, () => attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) })));
    expect(results.every(r => r.status === 200 && r.jsonBody.gained === 0)).toBe(true);
    const b = act(P1, 1);
    const parallel = await Promise.all(Array.from({ length: 6 }, () => attempt(studentDeps(ctx), { pageId: b.pageId, activityId: b.activityId, response: correctResponse(b.key) })));
    // every overlapping copy either converged (200, at most ONE of them with a gain) or gave up cleanly after the CAS
    // retries (503, the client retries later) — never a duplicate award, never a partial write
    expect(parallel.every(r => r.status === 200 || r.status === 503)).toBe(true);
    expect(parallel.filter(r => r.status === 200).length).toBeGreaterThan(0);
    expect(parallel.filter(r => r.status === 200 && r.jsonBody.gained === 2).length).toBe(1);   // exactly one +2 (1 → 3) among the overlapping copies
    expect(parallel.filter(r => r.status === 200 && r.jsonBody.gained === 0).every(r => r.jsonBody.alreadyCompleted === true)).toBe(true);
    expect(Object.keys(ctx.getJson(studyDocName("u1")).pages[a.pageId].completed).length).toBe(2);
    expect((await get(studentDeps(ctx))).jsonBody.totalPoints).toBe(3);
    // a stale-write conflict that never resolves surfaces as 503, never as a duplicate award
    const stuck = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", through(M08)), [studyDocName("u1")]: { schemaVersion: 1, pages: {} } }, { beforeConditionalUpload: (name, api) => { if (name === studyDocName("u1")) api.setJson(name, api.getJson(name)); } });
    const conflict = await attempt(studentDeps(stuck), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
    expect(conflict.status).toBe(503);
  });
  it("several pages add up inside a module (m28: 18 of 57 → 6); the module never exceeds 20; several modules add up — the dashboard total agrees", async () => {
    const ctx = seed(through("791381-m28"));
    const m28 = pagesOf("791381-m28").filter(p => p.activities.length >= 2).slice(0, 9);
    for (const p of m28) for (const i of [0, 1]) { const x = act(p, i); const r = await attempt(studentDeps(ctx), { pageId: x.pageId, activityId: x.activityId, response: correctResponse(x.key) }); expect(r.status).toBe(200); }
    const a = act(P1, 0);
    await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
    const state = await get(studentDeps(ctx));
    expect(state.jsonBody.modules["791381-m28"]).toEqual({ completed: 18, eligible: 57, points: m28pts(18), max: 20 });
    expect(m28pts(18)).toBe(6);
    expect(state.jsonBody.modules[M08]).toEqual({ completed: 1, eligible: 14, points: 1, max: 20 });
    expect(state.jsonBody.totalPoints).toBe(7);
    const d = await dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, {
      requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "u1", sv: 1, classId: "STALE" }, student: ctx.getJson(USR("u1")) }),
      downloadJsonOrNull: async (_c, n) => ctx.getJson(n), listJson: async (_c, prefix) => ctx.names(prefix).map(n => ctx.getJson(n)),
    });
    expect(d.status).toBe(200);
    expect(d.jsonBody.strength).toMatchObject({ studyPoints: 7, practicePoints: 0, examPoints: 0, projectPoints: 0, rawTotalPoints: 7, totalPoints: 7, stageNumber: 1, withinStagePoints: 7 });
  });
  it("a WHOLE module completed reads exactly 20 / 20 (m08, all 14 activities), and completing it again adds nothing", async () => {
    const ctx = seed(through(M08));
    let total = 0;
    for (const p of pagesOf(M08)) for (let i = 0; i < p.activities.length; i++) { const x = act(p, i); const r = await attempt(studentDeps(ctx), { pageId: x.pageId, activityId: x.activityId, response: correctResponse(x.key) }); expect(r.status).toBe(200); total += r.jsonBody.gained; }
    expect(total).toBe(20);
    expect((await get(studentDeps(ctx))).jsonBody.modules[M08]).toEqual({ completed: 14, eligible: 14, points: 20, max: 20 });
    for (const p of pagesOf(M08)) { const x = act(p, 0); expect((await attempt(studentDeps(ctx), { pageId: x.pageId, activityId: x.activityId, response: correctResponse(x.key) })).jsonBody).toMatchObject({ alreadyCompleted: true, gained: 0 }); }
    expect((await get(studentDeps(ctx))).jsonBody.totalPoints).toBe(20);
  });
  it("m01 (9 exercises) and m02 (13 exercises) through the real handler: wrong answers add nothing, every unique completion is recorded once, repeats gain 0, each module completes at exactly 20 / 20 — and the T01–T04 trainings page of m02 carries no study activity (no second bucket)", async () => {
    const ctx = seed(through("791381-m02"));
    for (const [moduleId, expectedCount] of [["791381-m01", 9], ["791381-m02", 13]]) {
      const pages = pagesOf(moduleId);
      const all = pages.flatMap(p => p.activities.map((_, i) => act(p, i)));
      expect(all.length, moduleId).toBe(expectedCount);
      expect(pages.some(p => p.pageId === "791381-m02-l01-p08")).toBe(false);                 // the library-training page is not a study page
      for (const x of all) expect(/^(T\d\d|F0\d)$/.test(x.activityId), x.activityId).toBe(false);
      // a wrong answer writes nothing
      const wrong = await attempt(studentDeps(ctx), { pageId: all[0].pageId, activityId: all[0].activityId, response: wrongResponse(all[0].key) });
      expect(wrong.jsonBody).toMatchObject({ correct: false, persisted: false, gained: 0 });
      let total = 0;
      for (const x of all) {
        const r = await attempt(studentDeps(ctx), { pageId: x.pageId, activityId: x.activityId, response: correctResponse(x.key) });
        expect(r.status, x.activityId).toBe(200);
        expect(r.jsonBody, x.activityId).toMatchObject({ correct: true, persisted: true, alreadyCompleted: false });
        total += r.jsonBody.gained;
      }
      expect(total, moduleId).toBe(20);
      expect((await get(studentDeps(ctx))).jsonBody.modules[moduleId], moduleId).toEqual({ completed: expectedCount, eligible: expectedCount, points: 20, max: 20 });
      // repeats: unique completion only — nothing more, the stored document keeps one entry per activity
      for (const x of all) expect((await attempt(studentDeps(ctx), { pageId: x.pageId, activityId: x.activityId, response: correctResponse(x.key) })).jsonBody, x.activityId).toMatchObject({ alreadyCompleted: true, persisted: false, gained: 0 });
      expect((await get(studentDeps(ctx))).jsonBody.modules[moduleId].points, moduleId).toBe(20);
    }
    const stored = ctx.getJson(studyDocName("u1"));
    expect(Object.values(stored.pages).reduce((n, p) => n + Object.keys(p.completed).length, 0)).toBe(22);
    expect((await get(studentDeps(ctx))).jsonBody.totalPoints).toBe(40);
    // the dashboard's study total agrees (m01 20 + m02 20), and a stored training-id "completion" still counts nothing
    ctx.setJson(studyDocName("u1"), { ...stored, pages: { ...stored.pages, "791381-m02-l01-p08": { courseId: "791381", moduleId: "791381-m02", completed: { T01: "t", T02: "t" } } } });
    expect((await get(studentDeps(ctx))).jsonBody.totalPoints).toBe(40);
    const d = await dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, {
      requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "u1", sv: 1, classId: "STALE" }, student: ctx.getJson(USR("u1")) }),
      downloadJsonOrNull: async (_c, n) => ctx.getJson(n), listJson: async (_c, prefix) => ctx.names(prefix).map(n => ctx.getJson(n)),
    });
    expect(d.jsonBody.strength).toMatchObject({ studyPoints: 40, practicePoints: 0, rawTotalPoints: 40, stageNumber: 1, withinStagePoints: 40 });
  });
});

describe("API — `gained` is the ACTUAL Strength delta of the module formula (REAL m28 data: 57 activities)", () => {
  it("the first m28 completion is persisted but gains 0 (1/57 × 20 = 0.35 → 0); the second gains 1 (0.70 → 1); the fifth gains 1 (1.75 → 2); repeats gain 0", async () => {
    const ctx = seed(through("791381-m28"));
    const m28 = pagesOf("791381-m28").filter(p => p.activities.length >= 2);
    expect(m28.length).toBeGreaterThanOrEqual(9);
    const A = act(m28[0], 0), B = act(m28[0], 1), C = act(m28[1], 0), D = act(m28[1], 1), E = act(m28[2], 0);
    const ra = await attempt(studentDeps(ctx), { pageId: A.pageId, activityId: A.activityId, response: correctResponse(A.key) });
    expect(ra.jsonBody).toMatchObject({ correct: true, persisted: true, alreadyCompleted: false, gained: 0, page: { completed: [A.activityId], eligible: 2 }, module: { completed: 1, eligible: 57, points: 0, max: 20 }, totalPoints: 0 });
    expect(ctx.getJson(studyDocName("u1")).pages[A.pageId].completed).toHaveProperty(A.activityId);   // the completion IS recorded
    const rb = await attempt(studentDeps(ctx), { pageId: B.pageId, activityId: B.activityId, response: correctResponse(B.key) });
    expect(rb.jsonBody).toMatchObject({ persisted: true, gained: 1, module: { completed: 2, points: 1 }, totalPoints: 1 });
    expect((await attempt(studentDeps(ctx), { pageId: C.pageId, activityId: C.activityId, response: correctResponse(C.key) })).jsonBody).toMatchObject({ gained: 0, module: { completed: 3, points: 1 } });
    expect((await attempt(studentDeps(ctx), { pageId: D.pageId, activityId: D.activityId, response: correctResponse(D.key) })).jsonBody).toMatchObject({ gained: 0, module: { completed: 4, points: 1 } });
    expect((await attempt(studentDeps(ctx), { pageId: E.pageId, activityId: E.activityId, response: correctResponse(E.key) })).jsonBody).toMatchObject({ gained: 1, module: { completed: 5, points: 2 }, totalPoints: 2 });
    expect((await attempt(studentDeps(ctx), { pageId: B.pageId, activityId: B.activityId, response: correctResponse(B.key) })).jsonBody).toMatchObject({ alreadyCompleted: true, gained: 0 });
    expect((await get(studentDeps(ctx))).jsonBody.totalPoints).toBe(2);
    // the pure helper reports the same deltas
    const doc = ctx.getJson(studyDocName("u1"));
    const F = act(m28[2], 1);
    expect(applyStudyCompletion(doc, INDEX, { courseId: "791381", moduleId: "791381-m28", pageId: F.pageId, activityId: F.activityId }, "t").gained).toBe(m28pts(6) - m28pts(5));
    expect(applyStudyCompletion(doc, INDEX, { courseId: "791381", moduleId: "791381-m28", pageId: B.pageId, activityId: B.activityId }, "t").gained).toBe(0);   // repeat
  });
});

describe("API — security", () => {
  it("invented activity id, activity of another page, unknown page, unknown course, malformed payload → 404 / 400, nothing written", async () => {
    const ctx = seed(through(M08));
    const a = act(P1, 0);
    expect((await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: "m08-l01-p01-q99", response: correctResponse(a.key) })).status).toBe(404);
    expect((await attempt(studentDeps(ctx), { pageId: P2.pageId, activityId: a.activityId, response: correctResponse(a.key) })).status).toBe(404);   // wrong page
    expect((await attempt(studentDeps(ctx), { pageId: "791381-m08-l09-p09", activityId: a.activityId, response: correctResponse(a.key) })).status).toBe(404);
    expect((await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) }, "000000")).status).toBe(404);
    expect((await get(studentDeps(ctx), "../etc")).status).toBe(404);
    for (const bad of [null, "x", [], {}, { pageId: a.pageId }, { activityId: a.activityId }, { pageId: "bad id!", activityId: a.activityId }, { pageId: a.pageId, activityId: { toString: () => a.activityId } }]) {
      const r = await attempt(studentDeps(ctx), bad);
      expect([400, 404]).toContain(r.status);
    }
    const noJson = await handler({ method: "POST", url: "https://x", headers: { get: () => null }, params: { courseId: "791381", action: "attempt" }, json: async () => { throw new Error("bad json"); } }, studentDeps(ctx));
    expect(noJson.status).toBe(400);
    expect(ctx.names("platform/learning-study/")).toEqual([]);
  });
  it("client-supplied correct / points / gained are ignored: a wrong answer with 'correct: true' earns nothing; a correct answer with 'points: 99' earns exactly the module formula (1)", async () => {
    const ctx = seed(through(M08));
    const a = act(P1, 0);
    const forged = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, correct: true, points: 99, gained: 5, response: { ...wrongResponse(a.key), correct: true } });
    expect(forged.jsonBody).toMatchObject({ correct: false, gained: 0, totalPoints: 0 });
    expect(ctx.names("platform/learning-study/")).toEqual([]);
    const real = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, points: 99, gained: 5, response: correctResponse(a.key) });
    expect(real.jsonBody).toMatchObject({ correct: true, gained: 1, totalPoints: 1 });
    expect(ctx.getJson(studyDocName("u1")).pages[a.pageId].completed).toEqual({ [a.activityId]: expect.any(String) });
    expect(JSON.stringify(ctx.getJson(studyDocName("u1")))).not.toMatch(/points|gained|correct/);   // nothing but completion state is stored
  });
  it("hidden module → 403 (page's own module, not the reading position); unassigned course → 403; archived class → 403; nothing written", async () => {
    const a = act(P1, 0);
    const hidden = seed(through("791381-m07"));                                              // m08 not yet published
    expect((await attempt(studentDeps(hidden), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) })).status).toBe(403);
    expect((await get(studentDeps(hidden))).status).toBe(200);                              // the state itself is readable (empty)
    const unassigned = seed(null);
    expect((await get(studentDeps(unassigned))).status).toBe(403);
    expect((await attempt(studentDeps(unassigned), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) })).status).toBe(403);
    const archived = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", through(M08), { status: "archived" }) });
    expect((await attempt(studentDeps(archived), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) })).status).toBe(403);
    expect((await get(studentDeps(archived))).status).toBe(403);
    for (const c of [hidden, unassigned, archived]) expect(c.names("platform/learning-study/")).toEqual([]);
    // publishing the module opens it
    hidden.setJson(CLS("cA"), room("cA", through(M08)));
    expect((await attempt(studentDeps(hidden), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) })).jsonBody.gained).toBe(1);
  });
  it("MOVED STUDENT: the persisted class decides over the token — moved to a class without m08 → 403; back → the earlier completion still stands (no double award)", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", through(M08)), [CLS("cB")]: room("cB", through("791381-m02")) });
    const a = act(P1, 0);
    expect((await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) })).jsonBody.gained).toBe(1);
    ctx.setJson(USR("u1"), student("u1", "cB"));
    expect((await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) })).status).toBe(403);
    ctx.setJson(USR("u1"), student("u1", "cA"));
    expect((await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) })).jsonBody).toMatchObject({ alreadyCompleted: true, gained: 0 });
  });
  it("no session → 401; TEACHER: judged, never persisted, state empty", async () => {
    const ctx = seed(through(M08));
    const a = act(P1, 0);
    const anon = await attempt({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }), requireActiveStudentSession: async () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }), container: ctx.container }, { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
    expect(anon.status).toBe(401);
    const t = await attempt(teacherDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
    expect(t.jsonBody).toMatchObject({ ok: true, actor: "teacher", correct: true, persisted: false, gained: 0, totalPoints: 0 });
    expect((await attempt(teacherDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: wrongResponse(a.key) })).jsonBody.correct).toBe(false);
    expect((await get(teacherDeps(ctx))).jsonBody).toMatchObject({ actor: "teacher", pages: {}, totalPoints: 0 });
    expect(ctx.names("platform/learning-study/")).toEqual([]);
  });
});
describe("Unified Strength — the dashboard with every source", () => {
  it("study points enter the raw total next to exams, Learning Practice (T AND F, 40 each) and projects; a legacy student without a study document is unchanged", async () => {
    const dash = ctx => dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, {
      requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "u1", sv: 1, classId: "STALE" }, student: ctx.getJson(USR("u1")) }),
      downloadJsonOrNull: async (_c, n) => ctx.getJson(n), listJson: async (_c, prefix) => ctx.names(prefix).map(n => ctx.getJson(n)),
    });
    const practice = { schemaVersion: 1, trainings: { T05: { bestPercentage: 80, attempts: 1 }, F01: { bestPercentage: 100, bestPoints: 25, attempts: 1 } } };
    const legacy = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", through(M08)), ["platform/learning-practice/u1.json"]: practice });
    const l = await dash(legacy);
    expect(l.jsonBody.strength).toMatchObject({ examPoints: 0, practicePoints: 72, studyPoints: 0, projectPoints: 0, rawTotalPoints: 72, totalPoints: 72, stageNumber: 1, withinStagePoints: 72, stagePercent: 90 });
    const a = act(P1, 0), b = act(P2, 0);
    for (const x of [a, b]) await attempt(studentDeps(legacy), { pageId: x.pageId, activityId: x.activityId, response: correctResponse(x.key) });
    const s = await dash(legacy);
    expect(s.jsonBody.strength).toMatchObject({ examPoints: 0, practicePoints: 72, studyPoints: 3, projectPoints: 0, rawTotalPoints: 75, totalPoints: 75, stageNumber: 1, withinStagePoints: 75, nextStageRemaining: 5 });
    // a forged study document cannot inflate anything: stored points / ghost ids are ignored
    legacy.setJson(studyDocName("u1"), { schemaVersion: 1, totalPoints: 999, pages: { [P1.pageId]: { courseId: "791381", moduleId: M08, points: 99, completed: { [a.activityId]: "t", ghost1: "t", ghost2: "t" } } } });
    expect((await dash(legacy)).jsonBody.strength).toMatchObject({ studyPoints: 1, totalPoints: 73 });
  });
});
