import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { handler } from "../src/functions/learning-training.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P11-A fix (found while preparing P11-C) — Tadris+ O5 withholds the review of a training (keys, hints, per-question
// correctness) while the SAME library item is a published homework of the student's class. P11-A let a student be in a class of
// ANOTHER teacher as well (student.sharedClasses) and solve that class's assignments, but the O5 check still read the HOME class
// only: a student could practise the item as a training released by their home class and read the keys of the shared class's open
// homework. The check now covers every class of the student. TEST data only.
// The first test is the FAIL-FIRST evidence (on the defective baseline the review comes back with every key).
const req_ = createRequire(import.meta.url);
const T01 = req_("../src/data/exam-library/items/T01.json");
const M01 = "791381-m01";
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json", ASG = id => "platform/assignments/" + id + ".json";
const student = (shared = ["cB"]) => ({ userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "ليان", code: "S1", ...(shared.length ? { sharedClasses: shared.map(classId => ({ classId, addedAt: "2026-10-01T00:00:00.000Z", addedBy: "owner:x" })) } : {}) });
// the home class releases the training's module; the shared class (another teacher's) does not need to
const home = () => ({ classId: "cA", name: "صف cA", active: true, status: "active", studentIds: [], ownerId: "t_00112233445566aa", learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01] }] });
const other = (id, over = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], ownerId: "t_00112233445566bb", ...over });
const assignment = (id, classId, itemId, status = "published") => ({ assignmentId: id, classId, title: "واجب", status, source: { kind: "library", itemId }, createdAt: "2026-11-01T08:00:00.000Z" });
const deps = (ctx, extra = {}) => ({ requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }), requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student" } }), container: ctx.container, getContainer: () => ctx.container, ...extra });
const submit = (ctx, extra) => handler({ method: "POST", url: "https://x/api/learning-training", headers: { get: () => null }, params: { trainingId: "T01", action: "submit" }, json: async () => ({ answers: {} }) }, deps(ctx, extra));
const seed = (extra = {}, shared = ["cB"]) => createMemoryContainer({ [USR("u1")]: student(shared), [CLS("cA")]: home(), [CLS("cB")]: other("cB"), [CLS("cC")]: other("cC"), ...extra });

describe("P11-A fix — a training's review is withheld for an open homework of ANY class of the student", () => {
  it("fail-first: T01 is a published homework of the class the student SHARES → the score only, no key", async () => {
    const ctx = seed({ [ASG("b1")]: assignment("b1", "cB", "T01") });
    const r = await submit(ctx);
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.review).toEqual([]);
    expect(r.jsonBody.result.reviewWithheld).toBe("assignment");
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/correctOptionIndex|correctText|"hint"/);
  });
  it("the second of two shared classes counts as well", async () => {
    const ctx = seed({ [ASG("c1")]: assignment("c1", "cC", "T01") }, ["cB", "cC"]);
    expect((await submit(ctx)).jsonBody.result).toMatchObject({ review: [], reviewWithheld: "assignment" });
  });
  it.each([["closed", "cB", "T01"], ["archived", "cB", "T01"], ["published", "cB", "T02"], ["published", "cC", "T01"]])(
    "an assignment %s / of class %s / from %s does not withhold: the full review, as before", async (status, classId, itemId) => {
      const ctx = seed({ [ASG("x1")]: assignment("x1", classId, itemId, status) });      // cC: a class the student is NOT in
      const r = await submit(ctx);
      expect(r.jsonBody.result.reviewWithheld).toBeUndefined();
      expect(r.jsonBody.result.review.map(q => q.correctOptionIndex)).toEqual(T01.examSnapshot.questions.map(q => q.answer.correctOptionIndex));
    });
  it("a student who shares no class is unaffected by another class's homework (pin)", async () => {
    const ctx = seed({ [ASG("b1")]: assignment("b1", "cB", "T01") }, []);
    const r = await submit(ctx);
    expect(r.jsonBody.result.reviewWithheld).toBeUndefined();
    expect(r.jsonBody.result.review).toHaveLength(10);
  });
  it("failure withholds, and every class of the student is asked for (pin of the fail-closed rule)", async () => {
    const ctx = seed();
    const asked = [];
    const r = await submit(ctx, { loadPublishedAssignmentsForClasses: async (_c, ids) => { asked.push(...ids); throw new Error("storage down"); } });
    expect(r.jsonBody.result).toMatchObject({ review: [], reviewWithheld: "assignment" });
    expect(asked).toEqual(["cA", "cB"]);
  });
});
