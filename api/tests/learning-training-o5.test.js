import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { handler } from "../src/functions/learning-training.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { practiceDocName, normalizePracticeDoc, trainingEntry } from "../src/lib/learning-practice.js";

// Tadris+ O5 (security review docs/enterprise-security-review-p9b3.md; owner «اختر انت» → option (a); approved design
// docs/enterprise-training-keys-o5.md). After a training submission the review revealed every key, hint and per-question
// correctness — also when the SAME library item is a published official homework of the student's class (submit blank → the
// homework's keys), and to a teacher whose account does not include «رؤية مفاتيح الإجابة» (examLibrary.item.viewKeys). In those
// two cases the review is now withheld (score only): review [] and reviewWithheld "assignment" / "keys". Failure withholds.
// Grading, points and the best score are unchanged. TEST data only.
const req_ = createRequire(import.meta.url);
const T01 = req_("../src/data/exam-library/items/T01.json");
const M01 = "791381-m01";
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json", ASG = id => "platform/assignments/" + id + ".json";
const student = (id, classId) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1" });
const room = id => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01] }] });
const assignment = (id, classId, itemId, status = "published") => ({ assignmentId: id, classId, title: "واجب", status, source: { kind: "library", itemId }, createdAt: "2026-11-01T08:00:00.000Z" });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const studentDeps = (ctx, extra = {}) => ({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container, ...extra });
const teacherDeps = (ctx, user, extra = {}) => ({ requireBuilderAuth: () => ({ ok: true, user }), container: ctx.container, getContainer: () => ctx.container, ...extra });
const submit = (deps, answers = {}) => handler({ method: "POST", url: "https://x/api/learning-training", headers: { get: () => null }, params: { trainingId: "T01", action: "submit" }, json: async () => ({ answers }) }, deps);
const allCorrect = () => Object.fromEntries(T01.examSnapshot.questions.map(q => [q.examQuestionId, { kind: "choice", index: q.answer.correctOptionIndex }]));
const seed = (extra = {}) => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA"), [CLS("cB")]: room("cB"), ...extra });

describe("O5 — a student: the keys of an OPEN official homework of their class are never revealed by training", () => {
  it("fail-first: T01 is a published homework of the student's class → a blank submission gets the score only (baseline: every key)", async () => {
    const ctx = seed({ [ASG("a1")]: assignment("a1", "cA", "T01") });
    const r = await submit(studentDeps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.review).toEqual([]);
    expect(r.jsonBody.result.reviewWithheld).toBe("assignment");
    expect(r.jsonBody.result).toMatchObject({ correctCount: 0, questionCount: 10, percentage: 0 });
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/correctOptionIndex|correctText|"hint"/);
  });

  it("the score, the points and the best attempt are kept while the review is withheld", async () => {
    const ctx = seed({ [ASG("a1")]: assignment("a1", "cA", "T01") });
    const r = await submit(studentDeps(ctx), allCorrect());
    expect(r.jsonBody.result).toMatchObject({ correctCount: 10, percentage: 100, review: [], reviewWithheld: "assignment" });
    expect(trainingEntry(normalizePracticeDoc(ctx.getJson(practiceDocName("u1"))), "T01")).toMatchObject({ bestPercentage: 100, attempts: 1 });
  });

  it.each([["closed", "cA", "T01"], ["archived", "cA", "T01"], ["published", "cA", "T02"], ["published", "cB", "T01"]])(
    "an assignment %s / of class %s / from %s does not withhold: the full review, as before", async (status, classId, itemId) => {
      const ctx = seed({ [ASG("a1")]: assignment("a1", classId, itemId, status) });
      const r = await submit(studentDeps(ctx));
      expect(r.jsonBody.result.reviewWithheld).toBeUndefined();
      expect(r.jsonBody.result.review).toHaveLength(10);
      expect(r.jsonBody.result.review.map(q => q.correctOptionIndex)).toEqual(T01.examSnapshot.questions.map(q => q.answer.correctOptionIndex));
    });

  it("the persisted class decides, never the token's (the token says STALE; the student's class cB has no homework)", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cB"), [CLS("cA")]: room("cA"), [CLS("cB")]: room("cB"), [ASG("a1")]: assignment("a1", "cA", "T01") });
    const r = await submit(studentDeps(ctx, { requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: "cA" } }) }));
    expect(r.jsonBody.result.reviewWithheld).toBeUndefined();
    expect(r.jsonBody.result.review).toHaveLength(10);
  });

  it("failure withholds: the class's assignments cannot be read → score only, the result still saved", async () => {
    const ctx = seed();
    const r = await submit(studentDeps(ctx, { loadPublishedAssignmentsForClasses: async () => { throw new Error("storage down"); } }));
    expect(r.status).toBe(200);
    expect(r.jsonBody.result).toMatchObject({ review: [], reviewWithheld: "assignment", questionCount: 10 });
  });
});

describe("O5 — a teacher: the keys only with «رؤية مفاتيح الإجابة» while access is enforced", () => {
  const managed = { ver: 3, role: "teacher", am: "managed", sub: "t_00112233445566aa" };
  it("an enforced managed teacher without examLibrary.item.viewKeys gets the score only", async () => {
    const ctx = seed();
    const asked = [];
    const r = await submit(teacherDeps(ctx, managed, { requireCapability: async () => null, authorizeCapability: async (user, cap) => { asked.push(cap); return { allowed: false, decision: "deny" }; } }));
    expect(asked).toEqual(["examLibrary.item.viewKeys"]);
    expect(r.jsonBody.result).toMatchObject({ review: [], reviewWithheld: "keys", questionCount: 10 });
  });
  it("with the capability (or not evaluated: legacy / observe), the full review as before", async () => {
    const ctx = seed();
    const r = await submit(teacherDeps(ctx, managed, { requireCapability: async () => null, authorizeCapability: async () => ({ allowed: true, decision: "allow" }) }));
    expect(r.jsonBody.result.reviewWithheld).toBeUndefined();
    expect(r.jsonBody.result.review).toHaveLength(10);
  });
  it("a deciding failure withholds; a teacher without a managed account (shared / multi-user) is not asked at all", async () => {
    const ctx = seed();
    const r = await submit(teacherDeps(ctx, managed, { requireCapability: async () => null, authorizeCapability: async () => { throw new Error("down"); } }));
    expect(r.jsonBody.result.reviewWithheld).toBe("keys");
    let asked = 0;
    const legacy = await submit(teacherDeps(ctx, { sub: "teacher-1" }, { authorizeCapability: async () => { asked++; return { allowed: false }; } }));
    expect(asked).toBe(0);
    expect(legacy.jsonBody.result.review).toHaveLength(10);
  });
});
