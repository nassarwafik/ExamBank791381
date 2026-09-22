import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/learning-study.js";
import { handler as dashboard } from "../src/functions/student-dashboard.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import {
  strengthFromModuleCompletion, MODULE_MAX_POINTS, buildStrengthSummary,
} from "../src/lib/student-strength.js";
import {
  studyDocName, loadStudyIndex, findStudyActivity, evaluateStudyResponse, normalizeStudyDoc, applyStudyCompletion,
  moduleTotalsOf, studyStateOf, studyModuleCompletionForStrength, studyAllowedForClass,
} from "../src/lib/learning-study.js";
import { listLearningModules } from "../src/lib/learning-materials-registry.js";

// Study Practice Strength — the SERVER authority for in-page learning exercises over the REAL generated key index
// (api/src/data/learning-study/791381.json) and the in-memory container, under the 25-STAGE module-completion model:
// a MODULE's Strength is round(completed / total × 20) where `total` is that module's eligible-activity count from the
// index (no per-page cap, no integer module cap). The suite drives the real handler for: the policy (module-ratio
// points, DERIVED from the index totals — never hardcoded round() values), anti-farming (completion state, idempotent
// CAS writes), security (invented ids, wrong page, hidden module, archived class, persisted-class authority, client
// claims ignored, malformed payloads) and the Unified Strength integration (module completion + library items T/F).

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
const M28 = "791381-m28";
const m08pages = pagesOf(M08);
const P1 = m08pages.find(p => p.activities.length >= 3) || m08pages[0];
const P2 = m08pages.find(p => p.pageId !== P1.pageId);
const act = (page, i) => ({ pageId: page.pageId, activityId: page.activities[i][0], key: page.activities[i][1] });

// The module-completion policy is DERIVED from the index totals, never hardcoded: a module's Strength is
// round(completed / total × 20) where `total` is the module's eligible-activity count. m08 has 14, m28 has 57.
const M08_TOTAL = moduleTotalsOf(INDEX)[M08];
const M28_TOTAL = moduleTotalsOf(INDEX)[M28];
const m08pts = n => strengthFromModuleCompletion(n, M08_TOTAL);
const m28pts = n => strengthFromModuleCompletion(n, M28_TOTAL);

describe("the generated key index", () => {
  it("covers the real content: 222 pages / 459 eligible activities of four kinds across 28 registered modules; unknown ids resolve to null", () => {
    expect(INDEX.schemaVersion).toBe(1); expect(INDEX.courseId).toBe("791381");
    const pages = Object.entries(INDEX.pages);
    expect(pages.length).toBe(222);
    const kinds = {};
    let count = 0;
    const modules = new Set();
    for (const [pageId, p] of pages) {
      expect(ORDER).toContain(p.moduleId);
      modules.add(p.moduleId);
      expect(pageId.startsWith(p.moduleId + "-")).toBe(true);
      for (const [id, key] of Object.entries(p.activities)) { count++; kinds[key.kind] = (kinds[key.kind] || 0) + 1; expect(id).toMatch(/^m\d\d-l\d\d-p\d\d-/); }
    }
    expect(count).toBe(459);
    expect(kinds).toEqual({ multipleChoice: 250, trueFalse: 88, shortInput: 61, "practice-table": 60 });
    expect(modules.size).toBe(28);
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
  it("constants: a module is worth up to 20 (the 25-stage module-completion model)", () => {
    expect(MODULE_MAX_POINTS).toBe(20);
  });
  it("module strength = round(completed / total × 20): 0 at none, 20 at full, the rounded ratio between; over-count clamps to total; total 0 or malformed → 0", () => {
    expect(strengthFromModuleCompletion(0, 14)).toBe(0);
    expect(strengthFromModuleCompletion(14, 14)).toBe(20);
    expect(strengthFromModuleCompletion(7, 14)).toBe(10);
    expect(strengthFromModuleCompletion(99, 14)).toBe(20);                                   // completed clamped to total
    expect(strengthFromModuleCompletion(3, 14)).toBe(Math.round((3 / 14) * 20));
    expect(strengthFromModuleCompletion(1, 0)).toBe(0);                                      // a module with no eligible activities earns 0
    expect(strengthFromModuleCompletion(5, -1)).toBe(0);
    expect([strengthFromModuleCompletion(NaN, 14), strengthFromModuleCompletion(2, NaN), strengthFromModuleCompletion("x", 14)]).toEqual([0, 0, 0]);
  });
  it("buildStrengthSummary reads ONLY trainings (library: T AND F, best% × 40) and moduleCompletion (ratio × 20); retired sources ignored; 25 stages of 80 up to 2000", () => {
    // library source: T AND F both count now, each up to 40; stored bestPoints never trusted; foreign ids add 0
    expect(buildStrengthSummary({ trainings: { T01: { bestPercentage: 100 } } })).toMatchObject({ libraryPoints: 40, modulePoints: 0, totalPoints: 40, stage: 1 });
    expect(buildStrengthSummary({ trainings: { F01: { bestPercentage: 100 } } }).libraryPoints).toBe(40);   // F NOW contributes
    expect(buildStrengthSummary({ trainings: { T05: { bestPercentage: 80 }, F01: { bestPercentage: 100 } } }).libraryPoints).toBe(32 + 40);
    expect(buildStrengthSummary({ trainings: { T01: { bestPercentage: 50, bestPoints: 999 }, "794589": { bestPercentage: 100 } } }).libraryPoints).toBe(20);
    // module source: full module → 20, empty → 0; sums across modules
    const mc = { [M08]: { completed: M08_TOTAL, total: M08_TOTAL }, [M28]: { completed: 0, total: M28_TOTAL } };
    expect(buildStrengthSummary({ moduleCompletion: mc })).toMatchObject({ libraryPoints: 0, modulePoints: 20, totalPoints: 20 });
    // both sources add into ONE total
    expect(buildStrengthSummary({ trainings: { T01: { bestPercentage: 100 } }, moduleCompletion: mc })).toMatchObject({ libraryPoints: 40, modulePoints: 20, totalPoints: 60 });
    // the RETIRED sources (finalized exams, projects, the old page/module study model) are IGNORED — those fields are gone
    const legacyShaped = buildStrengthSummary({ finalizedCount: 9, projects: [{ overallProgress: 100 }], study: { m: { p: 9 } }, trainings: {}, moduleCompletion: {} });
    expect(legacyShaped).toMatchObject({ totalPoints: 0, libraryPoints: 0, modulePoints: 0, stage: 1 });
    for (const gone of ["examPoints", "practicePoints", "projectPoints", "studyPoints", "tier", "nextTier"]) expect(legacyShaped).not.toHaveProperty(gone);
    // 25 stages of 80, ceiling 2000
    expect(buildStrengthSummary({}).stageCount).toBe(25);
    expect(buildStrengthSummary({}).stageSpan).toBe(80);
    expect(buildStrengthSummary({}).totalMax).toBe(2000);
  });
});

describe("storage — completion state, never a counter", () => {
  it("normalize: malformed docs → empty; foreign ids dropped; applyStudyCompletion is idempotent, keeps the first timestamp, and its gains follow the module ratio (no page cap)", () => {
    expect(normalizeStudyDoc(null)).toEqual({ schemaVersion: 1, pages: {} });
    expect(normalizeStudyDoc({ pages: { "bad id!": { completed: { a: "t" } }, ok: { completed: { "x y": "t", good: 3 } } } })).toEqual({ schemaVersion: 1, pages: { ok: { courseId: "", moduleId: "", completed: { good: "" } } } });
    const a = act(P1, 0), b = act(P1, 1), c = act(P1, 2);
    let r = applyStudyCompletion(null, INDEX, { courseId: "791381", moduleId: M08, pageId: P1.pageId, activityId: a.activityId }, "2026-09-20T10:00:00.000Z");
    expect(r).toMatchObject({ alreadyCompleted: false, pageBefore: 0, pageAfter: 1, gained: m08pts(1) - m08pts(0) });
    r = applyStudyCompletion(r.doc, INDEX, { courseId: "791381", moduleId: M08, pageId: P1.pageId, activityId: a.activityId }, "2026-09-20T11:00:00.000Z");
    expect(r).toMatchObject({ alreadyCompleted: true, pageBefore: 1, pageAfter: 1, gained: 0 });
    expect(r.doc.pages[P1.pageId].completed[a.activityId]).toBe("2026-09-20T10:00:00.000Z");
    r = applyStudyCompletion(r.doc, INDEX, { courseId: "791381", moduleId: M08, pageId: P1.pageId, activityId: b.activityId }, "t2");
    expect(r).toMatchObject({ alreadyCompleted: false, pageBefore: 1, pageAfter: 2, gained: m08pts(2) - m08pts(1) });
    r = applyStudyCompletion(r.doc, INDEX, { courseId: "791381", moduleId: M08, pageId: P1.pageId, activityId: c.activityId }, "t3");
    expect(r).toMatchObject({ alreadyCompleted: false, pageBefore: 2, pageAfter: 3, gained: m08pts(3) - m08pts(2) });   // third eligible completion IS recorded — no page cap
    expect(Object.keys(r.doc.pages[P1.pageId].completed).length).toBe(3);
    const state = studyStateOf(r.doc, INDEX);
    expect(state.pages[P1.pageId]).toMatchObject({ moduleId: M08, total: P1.activities.length });
    expect(state.pages[P1.pageId].completed.length).toBe(3);
    expect(state.pages[P1.pageId]).not.toHaveProperty("points");
    expect(state.moduleViews[M08]).toEqual({ points: m08pts(3), max: MODULE_MAX_POINTS, completed: 3, total: M08_TOTAL });
    expect(state.moduleCompletion[M08]).toEqual({ completed: 3, total: M08_TOTAL });
    expect(state.totalPoints).toBe(m08pts(3));
  });
  it("ids that are no longer in the index stop counting (an activity removed / renamed in content never keeps a point), and a stored 'points' field is never trusted", () => {
    const doc = { schemaVersion: 1, points: 999, pages: { [P1.pageId]: { courseId: "791381", moduleId: M08, points: 99, completed: { [act(P1, 0).activityId]: "t", "m08-l01-p01-ghost": "t", "renamed-id": "t" } } } };
    const state = studyStateOf(doc, INDEX);
    expect(state.pages[P1.pageId].completed).toEqual([act(P1, 0).activityId]);               // only the still-eligible id survives
    expect(state.moduleCompletion[M08]).toEqual({ completed: 1, total: M08_TOTAL });
    expect(state.totalPoints).toBe(m08pts(1));                                               // re-derived from the surviving completion, not the stored 999
    const mc = studyModuleCompletionForStrength(doc, ["791381"]);
    expect(mc[M08]).toEqual({ completed: 1, total: M08_TOTAL });
    expect(mc[M28]).toEqual({ completed: 0, total: M28_TOTAL });                             // every module with eligible activities is present, untouched ones at 0
    expect(Object.keys(mc).length).toBe(28);
    expect(studyModuleCompletionForStrength(doc, ["000000"])).toEqual({});                   // a course with no index contributes nothing
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
  it("correct answers accrue module Strength (gained = the module-ratio delta), a wrong answer earns 0 and writes nothing; state lists the completed ids", async () => {
    const ctx = seed(through(M08));
    const a = act(P1, 0), b = act(P1, 1), c = act(P1, 2);
    const before = await get(studentDeps(ctx));
    expect(before.status).toBe(200);
    expect(before.jsonBody).toMatchObject({ ok: true, actor: "student", courseId: "791381", policy: { model: "module-completion", modulePointsMax: MODULE_MAX_POINTS }, pages: {}, modules: {}, totalPoints: 0 });
    const wrong = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: wrongResponse(a.key) });
    expect(wrong.jsonBody).toMatchObject({ ok: true, correct: false, persisted: false, gained: 0, page: { pageId: a.pageId, moduleId: M08, completed: [], total: 0 } });
    expect(wrong.jsonBody.page).not.toHaveProperty("points");
    expect(ctx.names("platform/learning-study/")).toEqual([]);                                // a wrong answer writes nothing
    const r1 = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
    expect(r1.jsonBody).toMatchObject({ ok: true, actor: "student", correct: true, persisted: true, alreadyCompleted: false, gained: m08pts(1) - m08pts(0), page: { completed: [a.activityId], total: P1.activities.length }, module: { points: m08pts(1), max: MODULE_MAX_POINTS, completed: 1, total: M08_TOTAL }, totalPoints: m08pts(1) });
    expect(r1.jsonBody.page).not.toHaveProperty("points");
    const r2 = await attempt(studentDeps(ctx), { pageId: b.pageId, activityId: b.activityId, response: correctResponse(b.key) });
    expect(r2.jsonBody).toMatchObject({ correct: true, persisted: true, gained: m08pts(2) - m08pts(1), module: { points: m08pts(2), completed: 2 }, totalPoints: m08pts(2) });
    const r3 = await attempt(studentDeps(ctx), { pageId: c.pageId, activityId: c.activityId, response: correctResponse(c.key) });
    expect(r3.jsonBody).toMatchObject({ correct: true, persisted: true, alreadyCompleted: false, gained: m08pts(3) - m08pts(2), module: { points: m08pts(3), completed: 3 }, totalPoints: m08pts(3) });
    expect(r3.jsonBody.page.completed.sort()).toEqual([a.activityId, b.activityId, c.activityId].sort());
    const after = await get(studentDeps(ctx));
    expect(after.jsonBody.pages[P1.pageId]).toMatchObject({ moduleId: M08, total: P1.activities.length });
    expect(after.jsonBody.pages[P1.pageId].completed.length).toBe(3);
    expect(after.jsonBody.modules[M08]).toEqual({ points: m08pts(3), max: MODULE_MAX_POINTS, completed: 3, total: M08_TOTAL }); expect(after.jsonBody.totalPoints).toBe(m08pts(3));
    expect(ctx.names("platform/").sort()).toEqual([USR("u1"), CLS("cA"), studyDocName("u1")].sort());  // ONLY the study document was written
    expect(ctx.names("platform/learning-practice/")).toEqual([]); expect(ctx.names("platform/assignments/")).toEqual([]); expect(ctx.names("platform/gradebook/")).toEqual([]);
  });
  it("anti-farming: repeat of a completed activity, duplicate requests, a re-opened page and correct-after-wrong never add a second completion; concurrent retries converge on one entry", async () => {
    const ctx = seed(through(M08));
    const a = act(P1, 0);
    await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: wrongResponse(a.key) });
    const first = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
    expect(first.jsonBody).toMatchObject({ gained: m08pts(1) - m08pts(0), alreadyCompleted: false, persisted: true });
    const stamp = ctx.getJson(studyDocName("u1")).pages[a.pageId].completed[a.activityId];
    for (let i = 0; i < 5; i++) {
      const again = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
      expect(again.jsonBody).toMatchObject({ correct: true, persisted: false, alreadyCompleted: true, gained: 0, totalPoints: m08pts(1) });
    }
    expect(ctx.getJson(studyDocName("u1")).pages[a.pageId].completed[a.activityId]).toBe(stamp);   // the first completion stands
    // overlapping submissions: the CAS loop re-applies against the freshest document → one entry, one award
    const results = await Promise.all(Array.from({ length: 6 }, () => attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) })));
    expect(results.every(r => r.status === 200 && r.jsonBody.gained === 0)).toBe(true);
    const b = act(P1, 1);
    const parallel = await Promise.all(Array.from({ length: 6 }, () => attempt(studentDeps(ctx), { pageId: b.pageId, activityId: b.activityId, response: correctResponse(b.key) })));
    // every overlapping copy either converged (200, at most ONE with a positive award) or gave up cleanly after the CAS
    // retries (503, the client retries later) — never a duplicate award, never a partial write
    expect(parallel.every(r => r.status === 200 || r.status === 503)).toBe(true);
    expect(parallel.filter(r => r.status === 200).length).toBeGreaterThan(0);
    const gainers = parallel.filter(r => r.status === 200 && r.jsonBody.gained > 0);
    expect(gainers.length).toBe(1);                                                          // exactly one +delta among the overlapping copies
    expect(gainers[0].jsonBody.gained).toBe(m08pts(2) - m08pts(1));                          // and it is the actual module-ratio delta
    expect(parallel.filter(r => r.status === 200 && r.jsonBody.gained === 0).every(r => r.jsonBody.alreadyCompleted === true)).toBe(true);
    expect(Object.keys(ctx.getJson(studyDocName("u1")).pages[a.pageId].completed).length).toBe(2);
    expect((await get(studentDeps(ctx))).jsonBody.totalPoints).toBe(m08pts(2));
    // a stale-write conflict that never resolves surfaces as 503, never as a duplicate award
    const stuck = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", through(M08)), [studyDocName("u1")]: { schemaVersion: 1, pages: {} } }, { beforeConditionalUpload: (name, api) => { if (name === studyDocName("u1")) api.setJson(name, api.getJson(name)); } });
    const conflict = await attempt(studentDeps(stuck), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
    expect(conflict.status).toBe(503);
  });
  it("several pages add up inside a module (module Strength is the completion ratio); several modules add up — the dashboard total agrees", async () => {
    const ctx = seed(through(M28));
    // fill nine pages of m28 (2 each → 18 unique completions of 57) and one page of m08 (1 of 14)
    const m28 = pagesOf(M28).filter(p => p.activities.length >= 2).slice(0, 9);
    for (const p of m28) for (const i of [0, 1]) { const x = act(p, i); const r = await attempt(studentDeps(ctx), { pageId: x.pageId, activityId: x.activityId, response: correctResponse(x.key) }); expect(r.status).toBe(200); }
    const a = act(P1, 0);
    await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) });
    const state = await get(studentDeps(ctx));
    expect(Object.values(state.jsonBody.pages).filter(p => p.moduleId === M28).every(p => p.completed.length === 2)).toBe(true);
    expect(state.jsonBody.modules[M28]).toEqual({ points: m28pts(18), max: MODULE_MAX_POINTS, completed: 18, total: M28_TOTAL });
    expect(state.jsonBody.modules[M08]).toEqual({ points: m08pts(1), max: MODULE_MAX_POINTS, completed: 1, total: M08_TOTAL });
    expect(state.jsonBody.totalPoints).toBe(m28pts(18) + m08pts(1));
    const d = await dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, {
      requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "u1", sv: 1, classId: "STALE" }, student: ctx.getJson(USR("u1")) }),
      downloadJsonOrNull: async (_c, n) => ctx.getJson(n), listJson: async (_c, prefix) => ctx.names(prefix).map(n => ctx.getJson(n)),
    });
    expect(d.status).toBe(200);
    const expected = buildStrengthSummary({ trainings: undefined, moduleCompletion: studyModuleCompletionForStrength(ctx.getJson(studyDocName("u1")), ["791381"]) });
    expect(expected.totalPoints).toBe(m28pts(18) + m08pts(1));
    expect(d.jsonBody.strength).toMatchObject({ libraryPoints: 0, modulePoints: expected.modulePoints, totalPoints: expected.totalPoints });
  });
});

describe("API — `gained` is the ACTUAL module-Strength delta, not a per-activity point (review fix, REAL m28 data)", () => {
  it("successive completions in a large module gain 0 or 1 as the rounded ratio round(completed/total×20) crosses; repeats gain 0 and never a second entry", async () => {
    const ctx = seed(through(M28));
    const flat = [];
    for (const p of pagesOf(M28)) for (let i = 0; i < p.activities.length; i++) flat.push(act(p, i));
    for (let n = 1; n <= 6; n++) {
      const x = flat[n - 1];
      const r = await attempt(studentDeps(ctx), { pageId: x.pageId, activityId: x.activityId, response: correctResponse(x.key) });
      expect(r.jsonBody).toMatchObject({ correct: true, persisted: true, alreadyCompleted: false, gained: m28pts(n) - m28pts(n - 1), module: { points: m28pts(n), completed: n, total: M28_TOTAL }, totalPoints: m28pts(n) });
    }
    // the point of the review fix: gained is NOT a flat per-activity point — some completions gained 0, some more
    const deltas = Array.from({ length: 6 }, (_, i) => m28pts(i + 1) - m28pts(i));
    expect(deltas).toContain(0);
    expect(deltas.some(d => d > 0)).toBe(true);
    const rep = await attempt(studentDeps(ctx), { pageId: flat[0].pageId, activityId: flat[0].activityId, response: correctResponse(flat[0].key) });
    expect(rep.jsonBody).toMatchObject({ correct: true, persisted: false, alreadyCompleted: true, gained: 0 });
    const firstPageCount = flat.slice(0, 6).filter(f => f.pageId === flat[0].pageId).length;
    expect(Object.keys(ctx.getJson(studyDocName("u1")).pages[flat[0].pageId].completed).length).toBe(firstPageCount);   // the repeat added no entry
  });
  it("completions on DIFFERENT pages both count toward the module (no page cap); the pure helper reports the same gained as the endpoint", async () => {
    const ctx = seed(through(M08));
    const a = act(P1, 0), b = act(P1, 1);
    expect((await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) })).jsonBody.gained).toBe(m08pts(1) - m08pts(0));
    const rb = await attempt(studentDeps(ctx), { pageId: b.pageId, activityId: b.activityId, response: correctResponse(b.key) });
    expect(rb.jsonBody.gained).toBe(m08pts(2) - m08pts(1));
    expect(rb.jsonBody.page.completed).toContain(b.activityId);
    // a completion on ANOTHER page of the SAME module still raises the module (the pure helper predicts the delta)…
    const doc = ctx.getJson(studyDocName("u1"));
    const other = act(P2, 0);
    expect(applyStudyCompletion(doc, INDEX, { courseId: "791381", moduleId: M08, pageId: other.pageId, activityId: other.activityId }, "t").gained).toBe(m08pts(3) - m08pts(2));
    expect(applyStudyCompletion(doc, INDEX, { courseId: "791381", moduleId: M08, pageId: a.pageId, activityId: a.activityId }, "t").gained).toBe(0);   // repeat
    // …and the endpoint agrees when the same completion is actually submitted
    const rc = await attempt(studentDeps(ctx), { pageId: other.pageId, activityId: other.activityId, response: correctResponse(other.key) });
    expect(rc.jsonBody).toMatchObject({ persisted: true, gained: m08pts(3) - m08pts(2), totalPoints: m08pts(3) });
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
  it("client-supplied correct / points / gained are ignored: a wrong answer with 'correct: true' earns nothing; a correct answer with 'points: 99' earns exactly the module-ratio delta", async () => {
    const ctx = seed(through(M08));
    const a = act(P1, 0);
    const forged = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, correct: true, points: 99, gained: 5, response: { ...wrongResponse(a.key), correct: true } });
    expect(forged.jsonBody).toMatchObject({ correct: false, gained: 0, totalPoints: 0 });
    expect(ctx.names("platform/learning-study/")).toEqual([]);
    const real = await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, points: 99, gained: 5, response: correctResponse(a.key) });
    expect(real.jsonBody).toMatchObject({ correct: true, gained: m08pts(1) - m08pts(0), totalPoints: m08pts(1) });
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
    expect((await attempt(studentDeps(hidden), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) })).jsonBody.gained).toBe(m08pts(1) - m08pts(0));
  });
  it("MOVED STUDENT: the persisted class decides over the token — moved to a class without m08 → 403; back → the earlier completion still stands (no double award)", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", through(M08)), [CLS("cB")]: room("cB", through("791381-m02")) });
    const a = act(P1, 0);
    expect((await attempt(studentDeps(ctx), { pageId: a.pageId, activityId: a.activityId, response: correctResponse(a.key) })).jsonBody.gained).toBe(m08pts(1) - m08pts(0));
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
  it("module completion enters the total next to the library items (T AND F); F-series NOW contributes to the library; a forged study document cannot inflate anything", async () => {
    const dash = ctx => dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, {
      requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "u1", sv: 1, classId: "STALE" }, student: ctx.getJson(USR("u1")) }),
      downloadJsonOrNull: async (_c, n) => ctx.getJson(n), listJson: async (_c, prefix) => ctx.names(prefix).map(n => ctx.getJson(n)),
    });
    // F now counts toward the library source (T05 → 32, F01 → 40)
    expect(buildStrengthSummary({ trainings: { F01: { bestPercentage: 100 } } }).libraryPoints).toBe(40);
    const practice = { schemaVersion: 1, trainings: { T05: { bestPercentage: 80, attempts: 1 }, F01: { bestPercentage: 100, bestPoints: 25, attempts: 1 } } };
    const legacy = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", through(M08)), ["platform/learning-practice/u1.json"]: practice });
    const l = await dash(legacy);
    expect(l.jsonBody.strength).toEqual(buildStrengthSummary({ trainings: practice.trainings, moduleCompletion: studyModuleCompletionForStrength(null, ["791381"]) }));
    expect(l.jsonBody.strength).toMatchObject({ libraryPoints: 32 + 40, modulePoints: 0, totalPoints: 72 });   // legacy student without a study document
    const a = act(P1, 0), b = act(P2, 0);
    for (const x of [a, b]) await attempt(studentDeps(legacy), { pageId: x.pageId, activityId: x.activityId, response: correctResponse(x.key) });   // two m08 completions
    const s = await dash(legacy);
    expect(s.jsonBody.strength).toEqual(buildStrengthSummary({ trainings: practice.trainings, moduleCompletion: studyModuleCompletionForStrength(legacy.getJson(studyDocName("u1")), ["791381"]) }));
    expect(s.jsonBody.strength).toMatchObject({ libraryPoints: 72, modulePoints: m08pts(2), totalPoints: 72 + m08pts(2) });
    // a forged study document cannot inflate anything: stored points / ghost ids are ignored
    legacy.setJson(studyDocName("u1"), { schemaVersion: 1, totalPoints: 999, pages: { [P1.pageId]: { courseId: "791381", moduleId: M08, points: 99, completed: { [a.activityId]: "t", ghost1: "t", ghost2: "t" } } } });
    const forged = (await dash(legacy)).jsonBody.strength;
    expect(forged).toEqual(buildStrengthSummary({ trainings: practice.trainings, moduleCompletion: studyModuleCompletionForStrength(legacy.getJson(studyDocName("u1")), ["791381"]) }));
    expect(forged).toMatchObject({ libraryPoints: 72, modulePoints: m08pts(1), totalPoints: 72 + m08pts(1) });
  });
});
