import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/learning-study.js";
import { handler as dashboard } from "../src/functions/student-dashboard.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import {
  STUDY_PAGE_MAX_POINTS, STUDY_MODULE_MAX_POINTS, STUDY_POINT_PER_ACTIVITY, studyPointsForPage, studyPointsForModule, studyPointsFromModules,
  buildStrengthSummary, rankTierFromStrength, TRAINING_MAX_STRENGTH_POINTS,
} from "../src/lib/student-strength.js";
import {
  studyDocName, loadStudyIndex, findStudyActivity, evaluateStudyResponse, normalizeStudyDoc, applyStudyCompletion, studyStateOf, studyModulesForStrength, studyAllowedForClass,
} from "../src/lib/learning-study.js";
import { listLearningModules } from "../src/lib/learning-materials-registry.js";

// Study Practice Strength — the SERVER authority for in-page learning exercises over the REAL generated key index
// (api/src/data/learning-study/791381.json) and the in-memory container: policy (1 per exercise, 2 per page, 15 per
// module), anti-farming (completion state, idempotent CAS writes), security (invented ids, wrong page, hidden
// module, archived class, persisted-class authority, client claims ignored, malformed payloads) and the Unified
// Strength integration (study points enter the total; T / F / projects / exams / thresholds unchanged).

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
  it("covers the real content: 216 pages / 454 eligible activities of four kinds, every page mapped to a registered module; unknown ids resolve to null", () => {
    expect(INDEX.schemaVersion).toBe(1); expect(INDEX.courseId).toBe("791381");
    const pages = Object.entries(INDEX.pages);
    expect(pages.length).toBe(216);
    const kinds = {};
    let count = 0;
    for (const [pageId, p] of pages) {
      expect(ORDER).toContain(p.moduleId);
      expect(pageId.startsWith(p.moduleId + "-")).toBe(true);
      for (const [id, key] of Object.entries(p.activities)) { count++; kinds[key.kind] = (kinds[key.kind] || 0) + 1; expect(id).toMatch(/^m\d\d-l\d\d-p\d\d-/); }
    }
    expect(count).toBe(454);
    expect(kinds).toEqual({ multipleChoice: 247, trueFalse: 86, shortInput: 60, "practice-table": 61 });
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

describe("policy — the authoritative formula", () => {
  it("constants: 1 per activity, 2 per page, 15 per module", () => {
    expect([STUDY_POINT_PER_ACTIVITY, STUDY_PAGE_MAX_POINTS, STUDY_MODULE_MAX_POINTS]).toEqual([1, 2, 15]);
  });
  it("page: 0 → 0, 1 → 1, 2 → 2, 3+ → 2 (malformed → 0); module: Σ pages capped at 15; total = Σ modules", () => {
    expect([0, 1, 2, 3, 9, -1, NaN, "x"].map(studyPointsForPage)).toEqual([0, 1, 2, 2, 2, 0, 0, 0]);
    expect(studyPointsForModule({ a: 1, b: 2, c: 5 })).toBe(5);
    const twelvePages = Object.fromEntries(Array.from({ length: 12 }, (_, i) => ["p" + i, 2]));
    expect(studyPointsForModule(twelvePages)).toBe(15);                                    // 24 → capped 15
    expect(studyPointsForModule(null)).toBe(0);
    expect(studyPointsFromModules({ m1: { a: 1 }, m2: twelvePages, m3: { x: 2, y: 2 } })).toBe(1 + 15 + 4);
    expect(studyPointsFromModules(null)).toBe(0);
  });
  it("buildStrengthSummary: study enters the total as a FOURTH source; absent study → 0 (legacy student unchanged); T ≤ 25, F = 0, projects and exams as before; thresholds unchanged", () => {
    const base = { finalizedCount: 3, trainings: { T01: { bestPercentage: 100 }, F01: { bestPercentage: 100 } }, projects: [{ projectCode: "794589", overallProgress: 25 }] };
    const without = buildStrengthSummary(base);
    expect(without).toMatchObject({ examPoints: 300, practicePoints: 25, studyPoints: 0, projectPoints: 100, totalPoints: 425, tier: "beginner" });
    const withStudy = buildStrengthSummary({ ...base, study: { [M08]: { p1: 2, p2: 1 }, "791381-m09": { p3: 5 } } });
    expect(withStudy).toMatchObject({ examPoints: 300, practicePoints: 25, studyPoints: 5, projectPoints: 100, totalPoints: 430, tier: "beginner" });
    expect(withStudy.practicePoints).toBe(TRAINING_MAX_STRENGTH_POINTS);
    expect(buildStrengthSummary({ finalizedCount: 0, study: { m: { p: 2 } } }).totalPoints).toBe(2);
    expect(buildStrengthSummary({ finalizedCount: 3, trainings: {}, projects: [], study: { m: { p: 2 } } })).toMatchObject({ totalPoints: 302, tier: null, nextTier: "beginner", withinLevelPoints: 302, nextLevelRemaining: 98 });
    expect(rankTierFromStrength(399)).toBeNull(); expect(rankTierFromStrength(400)).toBe("beginner");
    // the whole content, fully completed, stays a small source: every page at its cap, every module at its cap
    const everything = {};
    for (const [pageId, p] of Object.entries(INDEX.pages)) { everything[p.moduleId] = everything[p.moduleId] || {}; everything[p.moduleId][pageId] = Object.keys(p.activities).length; }
    expect(studyPointsFromModules(everything)).toBe(292);   // Reader follow-up added one worksheet on m20-l01-p02 (page rose 1→2 pts; formula & thresholds unchanged)
  });
});

describe("storage — completion state, never a counter", () => {
  it("normalize: malformed docs → empty; foreign ids dropped; applyStudyCompletion is idempotent and keeps the first timestamp", () => {
    expect(normalizeStudyDoc(null)).toEqual({ schemaVersion: 1, pages: {} });
    expect(normalizeStudyDoc({ pages: { "bad id!": { completed: { a: "t" } }, ok: { completed: { "x y": "t", good: 3 } } } })).toEqual({ schemaVersion: 1, pages: { ok: { courseId: "", moduleId: "", completed: { good: "" } } } });
    const a = act(P1, 0), b = act(P1, 1), c = act(P1, 2);
    let r = applyStudyCompletion(null, INDEX, { courseId: "791381", moduleId: M08, pageId: P1.pageId, activityId: a.activityId }, "2026-09-20T10:00:00.000Z");
    expect(r).toMatchObject({ alreadyCompleted: false, pageBefore: 0, pageAfter: 1 });
    r = applyStudyCompletion(r.doc, INDEX, { courseId: "791381", moduleId: M08, pageId: P1.pageId, activityId: a.activityId }, "2026-09-20T11:00:00.000Z");
    expect(r).toMatchObject({ alreadyCompleted: true, pageBefore: 1, pageAfter: 1 });
    expect(r.doc.pages[P1.pageId].completed[a.activityId]).toBe("2026-09-20T10:00:00.000Z");
    r = applyStudyCompletion(r.doc, INDEX, { courseId: "791381", moduleId: M08, pageId: P1.pageId, activityId: b.activityId }, "t2");
    expect(r).toMatchObject({ alreadyCompleted: false, pageBefore: 1, pageAfter: 2 });
    r = applyStudyCompletion(r.doc, INDEX, { courseId: "791381", moduleId: M08, pageId: P1.pageId, activityId: c.activityId }, "t3");
    expect(r).toMatchObject({ alreadyCompleted: false, pageBefore: 2, pageAfter: 2 });          // third: completed, no extra point
    expect(Object.keys(r.doc.pages[P1.pageId].completed).length).toBe(3);
    const state = studyStateOf(r.doc, INDEX);
    expect(state.pages[P1.pageId]).toMatchObject({ moduleId: M08, points: 2, max: 2 }); expect(state.pages[P1.pageId].completed.length).toBe(3);
    expect(state.moduleViews[M08]).toEqual({ points: 2, max: 15 }); expect(state.totalPoints).toBe(2);
    expect(state.modules).toEqual({ [M08]: { [P1.pageId]: 3 } });
  });
  it("ids that are no longer in the index stop counting (an activity removed / renamed in content never keeps a point), and a stored 'points' field is never trusted", () => {
    const doc = { schemaVersion: 1, points: 999, pages: { [P1.pageId]: { courseId: "791381", moduleId: M08, points: 99, completed: { [act(P1, 0).activityId]: "t", "m08-l01-p01-ghost": "t", "renamed-id": "t" } } } };
    const state = studyStateOf(doc, INDEX);
    expect(state.pages[P1.pageId].completed).toEqual([act(P1, 0).activityId]);
    expect(state.totalPoints).toBe(1);
    expect(studyModulesForStrength(doc, ["791381"])).toEqual({ [M08]: { [P1.pageId]: 1 } });
    expect(studyModulesForStrength(doc, ["000000"])).toEqual({});
    // a page stored under another course id does not count for this course's index
    expect(studyStateOf({ pages: { [P1.pageId]: { courseId: "999999", moduleId: M08, completed: { [act(P1, 0).activityId]: "t" } } } }, INDEX).totalPoints).toBe(0);
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
  it("1 correct = 1 point (+1 gained), 2 = 2, 3+ on the same page = still 2 (persisted, gained 0); wrong = 0 and nothing written; state lists the completed ids", async () => {
    const ctx = seed(through(M08));
    const a = act(P1, 0), b = act(P1, 1), c = act(P1, 2);
    const before = await get(studentDeps(ctx));
    expect(before.status).toBe(200);
    expect(before.jsonBody).toMatchObject({ ok: true, actor: "student", courseId: "791381", policy: { pointPerActivity: 1, pagePointsMax: 2, modulePointsMax: 15 }, pages: {}, modules: {}, totalPoints: 0 });
    const wrong = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: wrongResponse(a.key) });
    expect(wrong.jsonBody).toMatchObject({ ok: true, correct: false, persisted: false, gained: 0, page: { pageId: a.pageId, moduleId: M08, completed: [], points: 0, max: 2 } });
    expect(ctx.names("platform/learning-study/")).toEqual([]);                                // a wrong answer writes nothing
    const r1 = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
    expect(r1.jsonBody).toMatchObject({ ok: true, actor: "student", correct: true, persisted: true, alreadyCompleted: false, gained: 1, page: { completed: [a.activityId], points: 1, max: 2 }, module: { points: 1, max: 15 }, totalPoints: 1 });
    const r2 = await attempt(studentDeps(ctx), { pageId: b.pageId, activityId: b.activityId, response: correctResponse(b.key) });
    expect(r2.jsonBody).toMatchObject({ correct: true, persisted: true, gained: 1, page: { points: 2 }, module: { points: 2 }, totalPoints: 2 });
    const r3 = await attempt(studentDeps(ctx), { pageId: c.pageId, activityId: c.activityId, response: correctResponse(c.key) });
    expect(r3.jsonBody).toMatchObject({ correct: true, persisted: true, alreadyCompleted: false, gained: 0, page: { points: 2 }, module: { points: 2 }, totalPoints: 2 });
    expect(r3.jsonBody.page.completed.sort()).toEqual([a.activityId, b.activityId, c.activityId].sort());
    const after = await get(studentDeps(ctx));
    expect(after.jsonBody.pages[P1.pageId]).toMatchObject({ moduleId: M08, points: 2, max: 2 });
    expect(after.jsonBody.modules[M08]).toEqual({ points: 2, max: 15 }); expect(after.jsonBody.totalPoints).toBe(2);
    expect(ctx.names("platform/").sort()).toEqual([USR("u1"), CLS("cA"), studyDocName("u1")].sort());  // ONLY the study document was written
    expect(ctx.names("platform/learning-practice/")).toEqual([]); expect(ctx.names("platform/assignments/")).toEqual([]); expect(ctx.names("platform/gradebook/")).toEqual([]);
  });
  it("anti-farming: repeat of a completed activity, duplicate requests, a re-opened page and correct-after-wrong never add a second point; concurrent retries converge", async () => {
    const ctx = seed(through(M08));
    const a = act(P1, 0);
    await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: wrongResponse(a.key) });
    const first = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
    expect(first.jsonBody).toMatchObject({ gained: 1, alreadyCompleted: false, persisted: true });
    const stamp = ctx.getJson(studyDocName("u1")).pages[a.pageId].completed[a.activityId];
    for (let i = 0; i < 5; i++) {
      const again = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
      expect(again.jsonBody).toMatchObject({ correct: true, persisted: false, alreadyCompleted: true, gained: 0, page: { points: 1 }, totalPoints: 1 });
    }
    expect(ctx.getJson(studyDocName("u1")).pages[a.pageId].completed[a.activityId]).toBe(stamp);   // the first completion stands
    // overlapping submissions: the CAS loop re-applies against the freshest document → one entry, one point
    const results = await Promise.all(Array.from({ length: 6 }, () => attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) })));
    expect(results.every(r => r.status === 200 && r.jsonBody.gained === 0)).toBe(true);
    const b = act(P1, 1);
    const parallel = await Promise.all(Array.from({ length: 6 }, () => attempt(studentDeps(ctx), { pageId: b.pageId, activityId: b.activityId, response: correctResponse(b.key) })));
    // every overlapping copy either converged (200, at most ONE of them with +1) or gave up cleanly after the CAS
    // retries (503, the client retries later) — never a duplicate award, never a partial write
    expect(parallel.every(r => r.status === 200 || r.status === 503)).toBe(true);
    expect(parallel.filter(r => r.status === 200).length).toBeGreaterThan(0);
    expect(parallel.filter(r => r.status === 200 && r.jsonBody.gained === 1).length).toBe(1);   // exactly one +1 among the overlapping copies
    expect(parallel.filter(r => r.status === 200 && r.jsonBody.gained === 0).every(r => r.jsonBody.alreadyCompleted === true)).toBe(true);
    expect(Object.keys(ctx.getJson(studyDocName("u1")).pages[a.pageId].completed).length).toBe(2);
    expect((await get(studentDeps(ctx))).jsonBody.totalPoints).toBe(2);
    // a stale-write conflict that never resolves surfaces as 503, never as a duplicate award
    const stuck = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", through(M08)), [studyDocName("u1")]: { schemaVersion: 1, pages: {} } }, { beforeConditionalUpload: (name, api) => { if (name === studyDocName("u1")) api.setJson(name, api.getJson(name)); } });
    const conflict = await attempt(studentDeps(stuck), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
    expect(conflict.status).toBe(503);
  });
  it("several pages add up inside a module; the module cap holds at 15; several modules add up — the dashboard total agrees", async () => {
    const ctx = seed(through("791381-m28"));
    // fill nine pages of m28 (2 each → 18 → capped 15) and one page of m08 (1)
    const m28 = pagesOf("791381-m28").filter(p => p.activities.length >= 2).slice(0, 9);
    for (const p of m28) for (const i of [0, 1]) { const x = act(p, i); const r = await attempt(studentDeps(ctx), { pageId: x.pageId, activityId: x.activityId, response: correctResponse(x.key) }); expect(r.status).toBe(200); }
    const a = act(P1, 0);
    await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
    const state = await get(studentDeps(ctx));
    expect(Object.values(state.jsonBody.pages).filter(p => p.moduleId === "791381-m28").every(p => p.points === 2)).toBe(true);
    expect(state.jsonBody.modules["791381-m28"]).toEqual({ points: 15, max: 15 });
    expect(state.jsonBody.modules[M08]).toEqual({ points: 1, max: 15 });
    expect(state.jsonBody.totalPoints).toBe(16);
    // the last m28 attempt beyond the cap reported gained 0 for the module? gained is page-level: page went 1 → 2 (+1) even when the module is capped
    const d = await dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, {
      requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "u1", sv: 1, classId: "STALE" }, student: ctx.getJson(USR("u1")) }),
      downloadJsonOrNull: async (_c, n) => ctx.getJson(n), listJson: async (_c, prefix) => ctx.names(prefix).map(n => ctx.getJson(n)),
    });
    expect(d.status).toBe(200);
    expect(d.jsonBody.strength).toMatchObject({ studyPoints: 16, practicePoints: 0, examPoints: 0, projectPoints: 0, totalPoints: 16, tier: null });
  });
});

describe("API — `gained` is the ACTUAL Strength delta, not the page delta (review fix, REAL m28 data)", () => {
  it("module at 14 → activity A gains 1 (module 15) → activity B on the SAME page: page 1 → 2, persisted, module stays 15, total unchanged, gained 0; a new page under the capped module: gained 0", async () => {
    const ctx = seed(through("791381-m28"));
    const m28 = pagesOf("791381-m28").filter(p => p.activities.length >= 2);
    expect(m28.length).toBeGreaterThanOrEqual(9);
    for (const p of m28.slice(0, 7)) for (const i of [0, 1]) { const x = act(p, i); expect((await attempt(studentDeps(ctx), { pageId: x.pageId, activityId: x.activityId, response: correctResponse(x.key) })).jsonBody.gained).toBe(1); }
    expect((await get(studentDeps(ctx))).jsonBody.modules["791381-m28"]).toEqual({ points: 14, max: 15 });
    const A = act(m28[7], 0), B = act(m28[7], 1), C = act(m28[8], 0);
    const ra = await attempt(studentDeps(ctx), { pageId: A.pageId, activityId: A.activityId, response: correctResponse(A.key) });
    expect(ra.jsonBody).toMatchObject({ persisted: true, gained: 1, page: { points: 1 }, module: { points: 15, max: 15 }, totalPoints: 15 });
    const rb = await attempt(studentDeps(ctx), { pageId: B.pageId, activityId: B.activityId, response: correctResponse(B.key) });
    expect(rb.jsonBody).toMatchObject({ correct: true, persisted: true, alreadyCompleted: false, gained: 0, page: { points: 2, max: 2 }, module: { points: 15, max: 15 }, totalPoints: 15 });
    expect(rb.jsonBody.page.completed).toContain(B.activityId);                              // the completion IS recorded
    const rc = await attempt(studentDeps(ctx), { pageId: C.pageId, activityId: C.activityId, response: correctResponse(C.key) });
    expect(rc.jsonBody).toMatchObject({ persisted: true, gained: 0, page: { points: 1, max: 2 }, module: { points: 15, max: 15 }, totalPoints: 15 });
    // repeats stay 0 and the dashboard agrees with the server total
    expect((await attempt(studentDeps(ctx), { pageId: B.pageId, activityId: B.activityId, response: correctResponse(B.key) })).jsonBody).toMatchObject({ alreadyCompleted: true, gained: 0 });
    expect((await get(studentDeps(ctx))).jsonBody.totalPoints).toBe(15);
  });
  it("page cap: the third eligible completion on a 2-point page gains 0 (page 2 → 2) even though the module is far below its cap; the pure helper reports the same", async () => {
    const ctx = seed(through(M08));
    const a = act(P1, 0), b = act(P1, 1), c = act(P1, 2);
    for (const x of [a, b]) expect((await attempt(studentDeps(ctx), { pageId: x.pageId, activityId: x.activityId, response: correctResponse(x.key) })).jsonBody.gained).toBe(1);
    const r = await attempt(studentDeps(ctx), { pageId: c.pageId, activityId: c.activityId, response: correctResponse(c.key) });
    expect(r.jsonBody).toMatchObject({ persisted: true, alreadyCompleted: false, gained: 0, page: { points: 2 }, module: { points: 2 }, totalPoints: 2 });
    const doc = ctx.getJson(studyDocName("u1"));
    expect(applyStudyCompletion(doc, INDEX, { courseId: "791381", moduleId: M08, pageId: act(P2, 0).pageId, activityId: act(P2, 0).activityId }, "t").gained).toBe(1);
    expect(applyStudyCompletion(doc, INDEX, { courseId: "791381", moduleId: M08, pageId: c.pageId, activityId: c.activityId }, "t").gained).toBe(0);   // repeat
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
  it("client-supplied correct / points / gained are ignored: a wrong answer with 'correct: true' earns nothing; a correct answer with 'points: 99' earns exactly 1", async () => {
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
  it("study points enter the total next to exams, T-series and projects; F-series stays 0; a legacy student without a study document is unchanged", async () => {
    const dash = ctx => dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, {
      requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "u1", sv: 1, classId: "STALE" }, student: ctx.getJson(USR("u1")) }),
      downloadJsonOrNull: async (_c, n) => ctx.getJson(n), listJson: async (_c, prefix) => ctx.names(prefix).map(n => ctx.getJson(n)),
    });
    const practice = { schemaVersion: 1, trainings: { T05: { bestPercentage: 80, attempts: 1 }, F01: { bestPercentage: 100, bestPoints: 25, attempts: 1 } } };
    const legacy = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", through(M08)), ["platform/learning-practice/u1.json"]: practice });
    const l = await dash(legacy);
    expect(l.jsonBody.strength).toMatchObject({ examPoints: 0, practicePoints: 20, studyPoints: 0, projectPoints: 0, totalPoints: 20 });
    const a = act(P1, 0), b = act(P2, 0);
    for (const x of [a, b]) await attempt(studentDeps(legacy), { pageId: x.pageId, activityId: x.activityId, response: correctResponse(x.key) });
    const s = await dash(legacy);
    expect(s.jsonBody.strength).toMatchObject({ examPoints: 0, practicePoints: 20, studyPoints: 2, projectPoints: 0, totalPoints: 22, tier: null });
    // a forged study document cannot inflate anything: stored points / ghost ids are ignored
    legacy.setJson(studyDocName("u1"), { schemaVersion: 1, totalPoints: 999, pages: { [P1.pageId]: { courseId: "791381", moduleId: M08, points: 99, completed: { [a.activityId]: "t", ghost1: "t", ghost2: "t" } } } });
    expect((await dash(legacy)).jsonBody.strength).toMatchObject({ studyPoints: 1, totalPoints: 21 });
  });
});
