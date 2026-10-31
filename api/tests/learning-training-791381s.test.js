import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { handler } from "../src/functions/learning-training.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { listLearningTrainings, findLearningTraining, trainingAllowedForClass, trainingReleaseModuleFor, trainingReleases } from "../src/lib/learning-training-registry.js";
import { practiceDocName, practicePointsOf } from "../src/lib/learning-practice.js";
import { listLearningModules } from "../src/lib/learning-materials-registry.js";
const req_ = createRequire(import.meta.url);
const ITEM = id => req_("../src/data/exam-library/items/" + id + ".json");

// 791381s Phase 8A (docs/enterprise-791381s-enrichment-plan.md §11.2) — the summary booklet opens the SAME 36 Exam Library
// trainings (T01–T30, F01–F06) from its own units. A training gets ADDITIONAL release points: it opens for a class when ANY of
// its release modules is published to it (course assigned + that module published). The 791381 rows are untouched, nothing
// auto-publishes, and the Strength bucket stays the ONE `trainingId` bucket (a student who reads both books never gets 40 + 40).

const S = n => "791381s-m" + String(n).padStart(2, "0");
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1" });
/** A class with the given course → visible modules map (an absent course is not assigned). */
const room = (id, courses, extra = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], learningMaterials: Object.entries(courses).map(([courseId, visibleModuleIds]) => ({ courseId, visibleModuleIds })), ...extra });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const studentDeps = (ctx, id = "u1") => ({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: id, sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container });
const get = (deps, trainingId) => handler({ method: "GET", url: "https://x/api/learning-training", headers: { get: () => null }, params: trainingId ? { trainingId } : {} }, deps);
const submit = (deps, trainingId, answers) => handler({ method: "POST", url: "https://x/api/learning-training", headers: { get: () => null }, params: { trainingId, action: "submit" }, json: async () => answers }, deps);
function answersFor(id, correct) {
  const out = {};
  ITEM(id).examSnapshot.questions.forEach((q, i) => { const key = Number(q.answer.correctOptionIndex); out[q.examQuestionId] = { kind: "choice", index: i < correct ? key : (key + 1) % q.options.length }; });
  return out;
}
const seed = (courses, classId = "cA") => createMemoryContainer({ [USR("u1")]: student("u1", classId), [CLS(classId)]: room(classId, courses) });

/** The owner-approved release unit of every item in the summary booklet (the latest unit needed, §11.2). */
const EXPECTED_791381S = {
  T01: 1, T02: 2, T03: 3, T04: 3, T05: 4, T06: 5, T07: 6, T08: 7, T09: 8, T10: 9, T11: 10, T12: 11, T13: 12, T14: 14, T15: 16,
  T16: 18, T17: 19, T18: 21, T19: 22, T20: 24, T21: 25, T22: 26, T23: 29, T24: 30, T25: 24, T26: 24,
  T27: 30, T28: 30, T29: 30, T30: 30, F01: 30, F02: 30, F03: 30, F04: 30, F05: 30, F06: 30,
};

describe("registry — 791381s release points beside the untouched 791381 rows", () => {
  it("every one of the 36 items has exactly one 791381s release module, the approved one, and it is a real 791381s module", () => {
    const modules = new Set(listLearningModules("791381s").map(m => m.moduleId));
    const all = listLearningTrainings();
    expect(all).toHaveLength(36);
    for (const t of all) {
      expect(t.courseId, t.trainingId).toBe("791381");                                 // the primary row is the 791381 one
      expect(trainingReleaseModuleFor(t.trainingId, "791381s"), t.trainingId).toBe(S(EXPECTED_791381S[t.trainingId]));
      expect(modules.has(trainingReleaseModuleFor(t.trainingId, "791381s"))).toBe(true);
      expect(trainingReleases(t)).toEqual([
        { courseId: "791381", requiredModuleId: t.requiredModuleId },
        { courseId: "791381s", requiredModuleId: S(EXPECTED_791381S[t.trainingId]) },
      ]);
      expect(trainingReleaseModuleFor(t.trainingId, "791381"), t.trainingId).toBe(t.requiredModuleId);
    }
    expect(trainingReleaseModuleFor("T01", "791381S")).toBeNull();                      // exact course id only
    expect(trainingReleaseModuleFor("T99", "791381s")).toBeNull();
    expect(trainingReleaseModuleFor("T01", "")).toBeNull();
  });

  it("the gate: a 791381s-only class opens an item when ITS 791381s release module is published — and only then", () => {
    const t = id => findLearningTraining(id);
    const only = visible => room("c", { "791381s": visible });
    expect(trainingAllowedForClass(only([S(1)]), t("T01"))).toBe(true);
    expect(trainingAllowedForClass(only([S(1)]), t("T02"))).toBe(false);
    expect(trainingAllowedForClass(only([]), t("T01"))).toBe(false);
    expect(trainingAllowedForClass(only([S(29)]), t("T24"))).toBe(false);              // T24 (ACL) needs m30
    expect(trainingAllowedForClass(only([S(30)]), t("T24"))).toBe(true);
    expect(trainingAllowedForClass(only([S(30)]), t("F06"))).toBe(true);
    // a 791381s module id published under the WRONG course never opens anything, and vice versa
    expect(trainingAllowedForClass(room("c", { "791381": [S(1)] }), t("T01"))).toBe(false);
    expect(trainingAllowedForClass(room("c", { "791381s": ["791381-m01"] }), t("T01"))).toBe(false);
    // the 791381 gate is unchanged
    expect(trainingAllowedForClass(room("c", { "791381": ["791381-m01"] }), t("T01"))).toBe(true);
    expect(trainingAllowedForClass(room("c", { "791381": ["791381-m02"] }), t("T01"))).toBe(false);
    expect(trainingAllowedForClass(null, t("T01"))).toBe(false);
    expect(trainingAllowedForClass(only([S(1)]), null)).toBe(false);
  });
});

describe("API — a class that reads only the summary booklet", () => {
  it("m01 published → T01 is listed available with its title, opens, and grades; the rest stay closed without titles", async () => {
    const ctx = seed({ "791381s": [S(1)] });
    const list = await get(studentDeps(ctx));
    expect(list.status).toBe(200);
    const byId = Object.fromEntries(list.jsonBody.trainings.map(t => [t.trainingId, t]));
    expect(byId.T01).toMatchObject({ available: true, title: findLearningTraining("T01").title });
    expect(list.jsonBody.trainings.filter(t => t.available).map(t => t.trainingId)).toEqual(["T01"]);
    for (const t of list.jsonBody.trainings) if (!t.available) expect("title" in t).toBe(false);
    const item = await get(studentDeps(ctx), "T01");
    expect(item.status).toBe(200);
    expect(JSON.stringify(item.jsonBody)).not.toContain("correctOptionIndex");
    const r = await submit(studentDeps(ctx), "T01", { answers: answersFor("T01", 10) });
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.percentage).toBe(100);
    expect((await get(studentDeps(ctx), "T02")).status).toBe(403);
  });

  it("nothing published (course assigned with no module) → every item 403", async () => {
    const ctx = seed({ "791381s": [] });
    for (const id of ["T01", "T15", "F01"]) expect((await get(studentDeps(ctx), id)).status, id).toBe(403);
    expect((await submit(studentDeps(ctx), "T01", { answers: answersFor("T01", 10) })).status).toBe(403);
  });

  it("archived class → 403 even with the release module published", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", { "791381s": [S(1)] }, { status: "archived" }) });
    expect((await get(studentDeps(ctx), "T01")).status).toBe(403);
  });
});

describe("Strength — ONE bucket per item across both books", () => {
  it("a class with both books: results from either release point land in the same entry (best kept, never 40 + 40), and only the practice doc is written", async () => {
    const ctx = seed({ "791381": ["791381-m01"], "791381s": [S(1)] });
    await submit(studentDeps(ctx), "T01", { answers: answersFor("T01", 6) });
    await submit(studentDeps(ctx), "T01", { answers: answersFor("T01", 10) });
    await submit(studentDeps(ctx), "T01", { answers: answersFor("T01", 8) });
    const doc = ctx.getJson(practiceDocName("u1"));
    expect(Object.keys(doc.trainings)).toEqual(["T01"]);
    expect(doc.trainings.T01.bestPercentage).toBe(100);
    expect(practicePointsOf(doc)).toBe(40);
    expect(ctx.names("platform/").filter(n => !n.startsWith("platform/users/") && !n.startsWith("platform/classes/"))).toEqual([practiceDocName("u1")]);
  });
});
