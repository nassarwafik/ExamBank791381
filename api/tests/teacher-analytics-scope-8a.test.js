import { describe, it, expect } from "vitest";
import { computeTeacherAnalytics, AnalyticsScopeError, missingAssignmentsPhrase } from "../src/lib/teacher-analytics-core.js";
import { handler as analyticsHandler } from "../src/functions/teacher-analytics.js";
import { handler as aiHandler } from "../src/functions/teacher-analytics-ai.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 8A — ONE authoritative analytics scope per response (GLOBAL / CLASS / STUDENT). Before 8A a studentId only
// produced `studentDetail`: every KPI, chart, follow-up row and insight still described the whole class, so a teacher
// focusing on S1 (90%) saw the class average (55%) and classmates in the follow-up list. These tests pin that every
// figure now derives from the scope's own records, that a rejected scope is an explicit error, and that the AI prompt
// is built only from the same scoped result.

const CP = "platform/classes/", UP = "platform/users/", AP = "platform/assignments/", SP = "platform/submissions/";
const LOGIN = "2026-01-20T08:00:00.000Z";
const cls = (classId, name, over = {}) => ({ classId, name, grade: "10", schoolYear: "2026", active: true, status: "active", studentIds: [], ...over });
const usr = (userId, classId, name, over = {}) => ({ userId, role: "student", classId, displayName: name, code: "C" + userId, active: true, archived: false, lastLoginAt: LOGIN, ...over });
const QUESTIONS = [{ id: "q1", text: "س1", marks: 10, topic: "الجبر" }, { id: "q2", text: "س2", marks: 10, topic: "الهندسة" }];
const asg = (assignmentId, classId, dueAt, questions = QUESTIONS) => ({ assignmentId, classId, title: "واجب " + assignmentId, status: "published", dueAt, createdAt: "2026-01-01T00:00:00.000Z", totalMarks: 20, maxAttempts: 1, examSnapshot: { questions } });
// pct applies to every question, so the per-topic averages equal the attempt percentage.
const sub = (assignmentId, studentId, classId, pct, { pending = false, questions = QUESTIONS, submittedAt = "2026-02-01T10:00:00.000Z" } = {}) => ({
  assignmentId, studentId, classId, activeAttempt: null,
  attempts: [{
    attemptNumber: 1, submittedAt, score: pct / 5, totalMarks: 20, percentage: pct, finalized: !pending, manualReviewMarks: pending ? 5 : 0,
    questionGrades: questions.map(q => ({ questionId: q.id, score: pct / 10, maxMarks: 10, correct: pct >= 50 }))
  }]
});

const NAMES = { S1: "سارة الأولى", S2: "سامي الثاني", S3: "سلمى الغائبة", S4: "سعيد المؤرشف", B1: "باسل الصف ب", Z1: "زياد المؤرشف" };
const B_QUESTIONS = [{ id: "q1", text: "س", marks: 10, topic: "الإحصاء" }];
function school(extra = {}) {
  const s = {
    [CP + "A.json"]: cls("A", "الصف أ"),
    [CP + "B.json"]: cls("B", "الصف ب"),
    [CP + "Z.json"]: cls("Z", "صف مؤرشف", { active: false, status: "archived" }),
    [UP + "S1.json"]: usr("S1", "A", NAMES.S1),
    [UP + "S2.json"]: usr("S2", "A", NAMES.S2),
    [UP + "S3.json"]: usr("S3", "A", NAMES.S3, { lastLoginAt: "" }),               // never logged in, never submitted
    [UP + "S4.json"]: usr("S4", "A", NAMES.S4, { archived: true, active: false }),  // archived → not a member
    [UP + "B1.json"]: usr("B1", "B", NAMES.B1),
    [UP + "Z1.json"]: usr("Z1", "Z", NAMES.Z1),
    [UP + "T1.json"]: { userId: "T1", role: "teacher", classId: "A", displayName: "معلم" },
    [AP + "a1.json"]: asg("a1", "A", "2026-02-10T00:00:00.000Z"),
    [AP + "a2.json"]: asg("a2", "A", "2026-02-20T00:00:00.000Z"),
    [AP + "a3.json"]: asg("a3", "A", "2026-03-10T00:00:00.000Z"),
    [AP + "b1.json"]: asg("b1", "B", "2026-02-15T00:00:00.000Z", B_QUESTIONS),
    [AP + "z1.json"]: asg("z1", "Z", "2026-02-12T00:00:00.000Z"),
    // S1 = 90 everywhere (a3 is pending manual review); S2 = 20 on a1/a2 and missing a3; S3 submits nothing.
    [SP + "a1/S1.json"]: sub("a1", "S1", "A", 90),
    [SP + "a2/S1.json"]: sub("a2", "S1", "A", 90),
    [SP + "a3/S1.json"]: sub("a3", "S1", "A", 90, { pending: true }),
    [SP + "a1/S2.json"]: sub("a1", "S2", "A", 20),
    [SP + "a2/S2.json"]: sub("a2", "S2", "A", 20, { submittedAt: "2026-02-25T10:00:00.000Z" }),   // late (due 20 Feb)
    [SP + "a1/S4.json"]: sub("a1", "S4", "A", 5),
    [SP + "b1/B1.json"]: sub("b1", "B1", "B", 50, { questions: B_QUESTIONS }),
    [SP + "z1/Z1.json"]: sub("z1", "Z1", "Z", 10),
    ...extra
  };
  return createMemoryContainer(s);
}
const run = (scope, ctx = school()) => computeTeacherAnalytics(ctx.container, scope);
// Every ANALYTICS surface of a response (the picker roster `students` and the class catalog `classes` are selectors).
const analyticsSurfaces = d => JSON.stringify({ kpis: d.kpis, submissionStatus: d.submissionStatus, gradeDistribution: d.gradeDistribution, assignmentTrend: d.assignmentTrend, classComparison: d.classComparison, topicAnalytics: d.topicAnalytics, followUp: d.followUp, topImprovers: d.topImprovers, insights: d.insights, studentDetail: d.studentDetail, scope: d.scope });
const distTotal = d => d.gradeDistribution.reduce((n, b) => n + b.count, 0);
const topicNames = d => d.topicAnalytics.map(t => t.topic).sort();
const insightText = d => d.insights.map(i => i.title + " " + i.text).join(" | ");

describe("8A-1 GLOBAL scope — every current class, every current member", () => {
  it("population, KPIs and charts cover A + B only (archived class Z, archived student S4 and the teacher excluded)", async () => {
    const d = await run({});
    expect(d.scope).toMatchObject({ mode: "global", classId: "", studentId: "", className: "كل الصفوف" });
    expect(d.kpis).toMatchObject({ activeStudents: 4, publishedAssignments: 4, expectedSubmissions: 10, submissions: 6, missingSubmissions: 4, pendingReview: 1, lateSubmissions: 1, neverLogged: 1 });
    expect(d.kpis.average).toBe(60);                               // (90·3 + 20·2 + 50) / 6
    expect(d.kpis.highest).toBe(90); expect(d.kpis.lowest).toBe(20);
    expect(d.assignmentTrend.map(t => t.assignmentId).sort()).toEqual(["a1", "a2", "a3", "b1"]);
    expect(distTotal(d)).toBe(6);
    expect(topicNames(d)).toEqual(["الإحصاء", "الجبر", "الهندسة"]);
    expect(d.classComparison.map(c => c.classId).sort()).toEqual(["A", "B"]);
    expect(analyticsSurfaces(d)).not.toContain(NAMES.Z1);
    expect(analyticsSurfaces(d)).not.toContain(NAMES.S4);
    expect(d.studentDetail).toBeNull();
  });
  it("insights speak about the whole school (no class prefix)", async () => {
    const d = await run({});
    expect(insightText(d)).not.toContain("في الصف");
    expect(insightText(d)).toContain("طلاب يحتاجون متابعة");
  });
  it("a global decline is worded as a general decline", async () => {
    const ctx = school({ [SP + "a3/S1.json"]: sub("a3", "S1", "A", 10) });   // latest assignment collapses
    const d = await run({}, ctx);
    expect(d.kpis.performanceChange).toBeLessThan(-3);
    expect(d.insights.map(i => i.title)).toContain("يوجد تراجع عام في الأداء");
  });
});

describe("8A-2 CLASS scope — that class alone", () => {
  it("class A: no B data in KPIs, trend, distribution, topics, follow-up, insights or comparison", async () => {
    const d = await run({ classId: "A" });
    expect(d.scope).toMatchObject({ mode: "class", classId: "A", className: "الصف أ", studentId: "" });
    expect(d.kpis).toMatchObject({ activeStudents: 3, publishedAssignments: 3, expectedSubmissions: 9, submissions: 5, missingSubmissions: 4, pendingReview: 1, lateSubmissions: 1, neverLogged: 1 });
    expect(d.kpis.average).toBe(62);                               // (90·3 + 20·2) / 5 — never B's 50
    expect(d.assignmentTrend.map(t => t.assignmentId)).toEqual(["a1", "a2", "a3"]);
    expect(distTotal(d)).toBe(5);
    expect(topicNames(d)).toEqual(["الجبر", "الهندسة"]);        // B's "الإحصاء" absent
    expect(d.classComparison).toEqual([]);
    expect(d.followUp.map(f => f.userId).sort()).toEqual(["S2", "S3"]);
    const surfaces = analyticsSurfaces(d);
    for (const foreign of [NAMES.B1, "الصف ب", "الإحصاء", NAMES.Z1, NAMES.S4]) expect(surfaces).not.toContain(foreign);
    expect(d.students.map(s => s.userId)).toEqual(expect.arrayContaining(["S1", "S2", "S3"]));
    expect(d.students).toHaveLength(3);
  });
  it("class insights are prefixed with the class name", async () => {
    const d = await run({ classId: "A" });
    const texts = d.insights.filter(i => i.title !== "الوضع مستقر").map(i => i.text);
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t.startsWith("في الصف الصف أ")).toBe(true);
    expect(d.insights.find(i => i.title === "مراجعة يدوية مطلوبة")?.text).toContain("1 ");
  });
  it("class B carries none of class A", async () => {
    const d = await run({ classId: "B" });
    expect(d.kpis).toMatchObject({ activeStudents: 1, publishedAssignments: 1, submissions: 1, average: 50 });
    for (const foreign of [NAMES.S1, NAMES.S2, NAMES.S3, "الجبر"]) expect(analyticsSurfaces(d)).not.toContain(foreign);
  });
});

describe("8A-3 STUDENT scope — exactly one student's records", () => {
  it("S1 = 90 and never the class's 55/62: every KPI is S1's own", async () => {
    const d = await run({ classId: "A", studentId: "S1" });
    expect(d.scope).toMatchObject({ mode: "student", classId: "A", className: "الصف أ", studentId: "S1", studentName: NAMES.S1 });
    expect(d.kpis).toMatchObject({ activeStudents: 1, publishedAssignments: 3, expectedSubmissions: 3, submissions: 3, missingSubmissions: 0, pendingReview: 1, lateSubmissions: 0, neverLogged: 0, followUpStudents: 0, completionRate: 100 });
    expect(d.kpis.average).toBe(90);
    expect(d.kpis.highest).toBe(90); expect(d.kpis.lowest).toBe(90);
    expect(d.kpis.average).not.toBe(55);
    expect(d.submissionStatus).toEqual({ submitted: 3, missing: 0, pendingReview: 1, late: 0 });
  });
  it("charts are the student's: per-assignment score, own distribution, own topics", async () => {
    const d = await run({ classId: "A", studentId: "S1" });
    expect(d.assignmentTrend.map(t => [t.assignmentId, t.students, t.average])).toEqual([["a1", 1, 90], ["a2", 1, 90], ["a3", 1, 90]]);
    expect(d.gradeDistribution.find(b => b.label === "90–100").count).toBe(3);
    expect(distTotal(d)).toBe(3);
    expect(d.topicAnalytics.map(t => [t.topic, t.average]).sort()).toEqual([["الجبر", 90], ["الهندسة", 90]]);
  });
  it("no multi-student sections: comparison, improvers and follow-up hold no classmates", async () => {
    const d = await run({ classId: "A", studentId: "S1" });
    expect(d.classComparison).toEqual([]);
    expect(d.topImprovers).toEqual([]);
    expect(d.followUp).toEqual([]);
    const surfaces = analyticsSurfaces(d);
    for (const foreign of [NAMES.S2, NAMES.S3, NAMES.B1, "الإحصاء"]) expect(surfaces).not.toContain(foreign);
    expect(insightText(d)).not.toContain("طلاب يحتاجون متابعة");
    expect(insightText(d)).not.toContain("طلاب لم يدخلوا");
  });
  it("studentDetail is a projection of the SAME records (average, completion and topics equal the main KPIs)", async () => {
    for (const studentId of ["S1", "S2", "S3"]) {
      const d = await run({ classId: "A", studentId });
      expect(d.studentDetail.userId).toBe(studentId);
      expect(d.studentDetail.average).toBe(d.kpis.average);
      expect(d.studentDetail.completionRate).toBe(d.kpis.completionRate);
      expect(d.studentDetail.completed).toBe(d.kpis.submissions);
      expect(d.studentDetail.missing).toBe(d.kpis.missingSubmissions);
      expect(d.studentDetail.topicAnalytics).toEqual(d.topicAnalytics);
      expect(d.studentDetail.scoreTrend.map(p => p.percentage)).toEqual(d.assignmentTrend.filter(t => t.average !== null).map(t => t.average));
    }
  });
  it("S2: own low score, own missing work, follow-up lists S2 only, student-worded insights", async () => {
    const d = await run({ classId: "A", studentId: "S2" });
    expect(d.kpis).toMatchObject({ activeStudents: 1, expectedSubmissions: 3, submissions: 2, missingSubmissions: 1, lateSubmissions: 1, average: 20, followUpStudents: 1 });
    expect(d.followUp.map(f => f.userId)).toEqual(["S2"]);
    expect(analyticsSurfaces(d)).not.toContain(NAMES.S1);
    const text = insightText(d);
    expect(text).toContain("لدى الطالب " + missingAssignmentsPhrase(1));
    expect(text).toContain("أداء الطالب في موضوع");
    expect(text).toContain("يحتاج مراجعة");
    expect(text).toContain("الطالب يحتاج متابعة");
    expect(text).not.toContain("طلاب يحتاجون متابعة");
    expect(text).not.toContain("في الصف");
  });
  it("S3 (never logged in, nothing submitted): neverLogged is 1, average null, the whole class workload is S3's", async () => {
    const d = await run({ classId: "A", studentId: "S3" });
    expect(d.kpis).toMatchObject({ activeStudents: 1, neverLogged: 1, submissions: 0, expectedSubmissions: 3, missingSubmissions: 3, average: null, highest: null, lowest: null });
    expect(distTotal(d)).toBe(0);
    expect(d.topicAnalytics).toEqual([]);
    expect(insightText(d)).toContain("لدى الطالب " + missingAssignmentsPhrase(3));
  });
  it("the Arabic missing-count phrase", () => {
    expect(missingAssignmentsPhrase(1)).toBe("واجب واحد غير مسلّم");
    expect(missingAssignmentsPhrase(2)).toBe("واجبان غير مسلّمين");
    expect(missingAssignmentsPhrase(5)).toBe("5 واجبات غير مسلّمة");
    expect(missingAssignmentsPhrase(12)).toBe("12 واجبًا غير مسلّم");
  });
});

describe("8A-4 rejected scopes are explicit errors — never a silent fallback", () => {
  const rejects = async (scope, status) => {
    const err = await run(scope).catch(e => e);
    expect(err).toBeInstanceOf(AnalyticsScopeError);
    expect(err.httpStatus).toBe(status);
  };
  it("studentId without classId → 400", () => rejects({ studentId: "S1" }, 400));
  it("student of another class (S1 with class B) → 400", () => rejects({ classId: "B", studentId: "S1" }, 400));
  it("unknown student → 404", () => rejects({ classId: "A", studentId: "NOPE" }, 404));
  it("archived student of the class → 400", () => rejects({ classId: "A", studentId: "S4" }, 400));
  it("a non-student user id → 404", () => rejects({ classId: "A", studentId: "T1" }, 404));
  it("a student who MOVED classes is only valid with the new class", async () => {
    const ctx = school({ [UP + "S2.json"]: usr("S2", "B", NAMES.S2) });
    await expect(computeTeacherAnalytics(ctx.container, { classId: "A", studentId: "S2" })).rejects.toMatchObject({ httpStatus: 400 });
    const d = await computeTeacherAnalytics(ctx.container, { classId: "B", studentId: "S2" });
    expect(d.kpis).toMatchObject({ activeStudents: 1, expectedSubmissions: 1, submissions: 0 });   // old class-A submissions never follow
  });
  it("the dashboard endpoint returns the scope error status with ok:false", async () => {
    const ctx = school();
    const deps = { requireBuilderAuth: () => ({ ok: true }), container: ctx.container };
    const get = q => analyticsHandler({ method: "GET", url: "https://x/api/teacher-analytics" + q }, deps);
    expect(await get("?studentId=S1")).toMatchObject({ status: 400, jsonBody: { ok: false } });
    expect(await get("?classId=B&studentId=S1")).toMatchObject({ status: 400, jsonBody: { ok: false } });
    expect(await get("?classId=A&studentId=NOPE")).toMatchObject({ status: 404, jsonBody: { ok: false } });
    const ok = await get("?classId=A&studentId=S1");
    expect(ok.status).toBe(200);
    expect(ok.jsonBody).toMatchObject({ ok: true, scope: { mode: "student", studentId: "S1" }, kpis: { average: 90, activeStudents: 1 } });
  });
});

describe("8A-5 scope changes and date range combine with every scope", () => {
  it("switching class after a student scope carries nothing of that student", async () => {
    const ctx = school();
    const s1 = await computeTeacherAnalytics(ctx.container, { classId: "A", studentId: "S1" });
    const b = await computeTeacherAnalytics(ctx.container, { classId: "B" });
    expect(s1.kpis.average).toBe(90);
    expect(b.scope).toMatchObject({ mode: "class", classId: "B", studentId: "" });
    expect(b.studentDetail).toBeNull();
    expect(analyticsSurfaces(b)).not.toContain(NAMES.S1);
  });
  const FROM = Date.parse("2026-02-01T00:00:00.000Z"), TO = Date.parse("2026-02-28T23:59:59.000Z");   // a3 (March) out
  it("range + global", async () => {
    const d = await run({ fromMs: FROM, toMs: TO });
    expect(d.kpis).toMatchObject({ publishedAssignments: 3, expectedSubmissions: 7, submissions: 5, pendingReview: 0 });
    expect(d.scope).toMatchObject({ mode: "global", from: new Date(FROM).toISOString() });
  });
  it("range + class", async () => {
    const d = await run({ classId: "A", fromMs: FROM, toMs: TO });
    expect(d.kpis).toMatchObject({ publishedAssignments: 2, expectedSubmissions: 6, submissions: 4, average: 55 });
  });
  it("range + student", async () => {
    const d = await run({ classId: "A", studentId: "S1", fromMs: FROM, toMs: TO });
    expect(d.kpis).toMatchObject({ activeStudents: 1, publishedAssignments: 2, expectedSubmissions: 2, submissions: 2, pendingReview: 0, average: 90 });
    expect(d.studentDetail.scoreTrend).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------
function aiHarness(ctx = school(), advice = "نصيحة") {
  const prompts = [];
  let calls = 0;
  const deps = {
    requireBuilderAuth: () => ({ ok: true }),
    container: ctx.container,
    createAiClient: async () => ({ chat: { completions: { create: async req => { calls += 1; prompts.push(req.messages.map(m => m.content).join("\n")); return { choices: [{ message: { content: advice } }] }; } } } })
  };
  const post = body => aiHandler({ method: "POST", url: "https://x/api/teacher-analytics-ai", json: async () => body }, deps);
  return { post, prompts, calls: () => calls };
}

describe("8A-6 AI — the prompt is the server's recomputation of exactly the requested scope", () => {
  it("global: no filter needed; the prompt names the global scope and compares current classes only", async () => {
    const h = aiHarness();
    const r = await h.post({});
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, advice: "نصيحة", scope: { mode: "global", classId: "", studentId: "" } });
    expect(h.prompts[0]).toContain("كل الصفوف · جميع الطلاب");
    expect(h.prompts[0]).toContain("الصف أ"); expect(h.prompts[0]).toContain("الصف ب");
    expect(h.prompts[0]).not.toContain("صف مؤرشف");
    expect(h.prompts[0]).toContain("متوسط العلامات: 60%");
  });
  it("class: only that class — no other class name, student or comparison", async () => {
    const h = aiHarness();
    const r = await h.post({ classId: "A" });
    expect(r.jsonBody.scope).toEqual({ mode: "class", classId: "A", studentId: "" });
    const p = h.prompts[0];
    expect(p).toContain("الصف الصف أ · جميع طلاب الصف");
    expect(p).toContain("متوسط العلامات: 62%");
    for (const foreign of ["الصف ب", NAMES.B1, "مقارنة الصفوف", "الإحصاء"]) expect(p).not.toContain(foreign);
  });
  it("student: class + student; the S1 prompt has no S2 name or S2 metrics", async () => {
    const h = aiHarness();
    const r = await h.post({ classId: "A", studentId: "S1" });
    expect(r.jsonBody.scope).toEqual({ mode: "student", classId: "A", studentId: "S1" });
    const p = h.prompts[0];
    expect(p).toContain(NAMES.S1);
    expect(p).toContain("المعدل العام: 90%");
    for (const foreign of [NAMES.S2, NAMES.S3, NAMES.B1, "20%", "62%", "55%"]) expect(p).not.toContain(foreign);
  });
  it("the date range narrows the AI scope exactly like the dashboard", async () => {
    const h = aiHarness();
    await h.post({ classId: "A", from: "2026-02-01T00:00:00.000Z", to: "2026-02-28T23:59:59.000Z" });
    expect(h.prompts[0]).toContain("متوسط العلامات: 55%");
    expect(h.prompts[0]).toContain("عدد الواجبات المنشورة: 2");
  });
  it("a mismatched / unscoped / unknown student is rejected before any AI call", async () => {
    const h = aiHarness();
    expect(await h.post({ classId: "B", studentId: "S1" })).toMatchObject({ status: 400, jsonBody: { ok: false } });
    expect(await h.post({ studentId: "S1" })).toMatchObject({ status: 400, jsonBody: { ok: false } });
    expect(await h.post({ classId: "A", studentId: "NOPE" })).toMatchObject({ status: 404, jsonBody: { ok: false } });
    expect(await h.post({ classId: "A", studentId: "S4" })).toMatchObject({ status: 400, jsonBody: { ok: false } });
    expect(h.calls()).toBe(0);
  });
  it("an AI failure is a generic 500 (no scope leak)", async () => {
    const ctx = school();
    const deps = { requireBuilderAuth: () => ({ ok: true }), container: ctx.container, createAiClient: async () => { throw new Error("boom"); } };
    const r = await aiHandler({ method: "POST", url: "https://x/api/teacher-analytics-ai", json: async () => ({ classId: "A" }) }, deps);
    expect(r).toMatchObject({ status: 500, jsonBody: { ok: false } });
  });
});
