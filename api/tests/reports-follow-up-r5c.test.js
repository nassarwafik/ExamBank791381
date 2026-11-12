// Phase R-5c — «طلاب يحتاجون متابعة» (docs/enterprise-reports-follow-up-r5c.md; owner decision: option «أ», no pass mark).
// A student is listed when at least one reason holds: did not hand in 2+ assessments of the period, average 15+ points under the
// class average, or late in a project of the class (the «المتأخرون» rule). Pinned over the pure rule and the REAL reports handler:
//   A. the thresholds are inclusive and exact; a result awaiting the teacher counts against nobody; a student with no final
//      result is never «below the class»; a class with no average flags nobody as below it;
//   B. the class report's list, its order and its project reasons; the delayed report is unchanged by the shared rule;
//   C. access: the list is part of the academic part; project reasons appear only for a session that may see projects; the
//      hub overview counts by the same criteria and the same class average.
// TEST data only.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { recordedManagedToken } from "./fixtures/managed-session.js";
import { school, NOW, instrument } from "./fixtures/analytics-school.js";

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "r5c-reports-follow-up-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "STUDENT_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const fu = cjs("../src/lib/reports/follow-up.js");
const { handler: reports } = await import("../src/functions/reports.js");
const { getProjectDefinition, getStorageNamespace } = cjs("../src/lib/project-tracker/registry.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const st = (studentId, average, missing, pending = 0) => ({ studentId, displayName: "طالب " + studentId, average, graded: 0, pending, missing });

describe("R-5c A — the rule (pure)", () => {
  it("the criteria are the owner's: 2 missing assessments, 15 points under the class", () => {
    expect(fu.FOLLOW_UP_CRITERIA).toEqual({ missingAtLeast: 2, belowClassBy: 15 });
    expect(Object.isFrozen(fu.FOLLOW_UP_CRITERIA)).toBe(true);
  });
  it("missing: 2 or more (inclusive); 1 is not a reason", () => {
    expect(fu.academicReasons(st("a", 80, 1), 80)).toEqual([]);
    expect(fu.academicReasons(st("a", 80, 2), 80)).toEqual([{ code: "missing", count: 2 }]);
    expect(fu.academicReasons(st("a", 80, 5), 80)).toEqual([{ code: "missing", count: 5 }]);
  });
  it("below the class: 15 points or more (inclusive), to 1 dp; 14.9 is not; above the class never", () => {
    expect(fu.academicReasons(st("a", 55, 0), 70)).toEqual([{ code: "belowClass", gap: 15 }]);
    expect(fu.academicReasons(st("a", 55.1, 0), 70)).toEqual([]);
    expect(fu.academicReasons(st("a", 40.5, 0), 70.2)).toEqual([{ code: "belowClass", gap: 29.7 }]);
    expect(fu.academicReasons(st("a", 95, 0), 70)).toEqual([]);
    expect(fu.academicReasons(st("a", 0, 0), 70)).toEqual([{ code: "belowClass", gap: 70 }]);     // a REAL zero average is a number
  });
  it("no final result → never «below the class»; a class with no average flags nobody as below it; pending counts against nobody", () => {
    expect(fu.academicReasons(st("a", null, 0, 3), 70)).toEqual([]);                             // three results awaiting the teacher: no reason at all
    expect(fu.academicReasons(st("a", null, 2), 70)).toEqual([{ code: "missing", count: 2 }]);   // listed for what is missing only
    expect(fu.academicReasons(st("a", 10, 0), null)).toEqual([]);
    expect(fu.academicReasons(st("a", undefined, 0), 70)).toEqual([]);
    expect(fu.academicReasons(st("a", Number.NaN, 0), 70)).toEqual([]);
  });
  it("followUpList: reasons named with their numbers, project lateness joined; order = more reasons, larger gap, more missing, roster", () => {
    const standings = [st("s1", 80, 0), st("s2", 50, 0), st("s3", 30, 3), st("s4", 52, 0), st("s5", 80, 2), st("s6", null, 0, 2), st("s7", 80, 0)];
    const delays = [{ projectCode: "P", title: "مشروع", byStudent: new Map([["s7", ["لم يبدأ بعد"]], ["s3", ["بلا تحديث 7+ أيام", "تقدّم أقل من 40%"]]]) }];
    const out = fu.followUpList(standings, 70, delays);
    expect(out.criteria).toEqual({ missingAtLeast: 2, belowClassBy: 15 });
    expect(out.classAverage).toBe(70);
    expect(out.students.map(s => [s.studentId, s.reasons.map(r => r.code).join("+")])).toEqual([
      ["s3", "missing+belowClass+project"], ["s2", "belowClass"], ["s4", "belowClass"], ["s5", "missing"], ["s7", "project"]
    ]);
    expect(out.students[0]).toEqual({ studentId: "s3", displayName: "طالب s3", average: 30, missing: 3, pending: 0,
      reasons: [{ code: "missing", count: 3 }, { code: "belowClass", gap: 40 }, { code: "project", projectCode: "P", title: "مشروع", reasons: ["بلا تحديث 7+ أيام", "تقدّم أقل من 40%"] }] });
    expect(fu.academicFollowUpCount(standings, 70)).toBe(4);                                     // s7 is late in the project only
    expect(fu.followUpList([], 70).students).toEqual([]);
    expect(fu.followUpList(standings, null).classAverage).toBeNull();
  });
  it("projectDelayReasons is the «المتأخرون» rule, worded as that report words it", () => {
    expect(fu.projectDelayReasons({ notStarted: true, stale: true, complete: false, overallProgress: 0 }, { lateThreshold: 40 })).toEqual({ lateThreshold: 40, reasons: ["لم يبدأ بعد"] });
    expect(fu.projectDelayReasons({ stale: true, complete: false, overallProgress: 10 }, { lateThreshold: 30, staleDays: 5 })).toEqual({ lateThreshold: 30, reasons: ["بلا تحديث 5+ أيام", "تقدّم أقل من 30%"] });
    expect(fu.projectDelayReasons({ stale: false, complete: false, overallProgress: 39 }, {})).toEqual({ lateThreshold: 40, reasons: ["تقدّم أقل من 40%"] });
    expect(fu.projectDelayReasons({ stale: false, complete: true, overallProgress: 100 }, {})).toEqual({ lateThreshold: 40, reasons: [] });
    expect(fu.projectDelayReasons({ stale: false, complete: false, overallProgress: 40 }, {}).reasons).toEqual([]);
  });
});

describe("R-5c B — the REAL reports handler: the class report's list", () => {
  const CP = "platform/classes/", UP = "platform/users/", AP = "platform/assignments/", SP = "platform/submissions/";
  const CODE = "899373", NS = getStorageNamespace(CODE);
  const STAGE = getProjectDefinition(CODE).stages.filter(s => s.active !== false)[0].stageId;
  const final = pct => ({ attemptNumber: 1, submittedAt: NOW, score: pct / 10, totalMarks: 10, percentage: pct, manualReviewMarks: 0, finalized: true });
  const pending = () => ({ attemptNumber: 1, submittedAt: NOW, score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false });
  const stu = (userId, displayName) => ({ userId, role: "student", active: true, archived: false, classId: "c1", displayName });
  const asg = (id, createdAt) => ({ assignmentId: id, classId: "c1", status: "published", title: "واجب " + id, createdAt, totalMarks: 10 });
  const doc = (aid, sid, ...attempts) => ({ assignmentId: aid, studentId: sid, classId: "c1", attempts });
  // three assessments.  أحمد 90/90/90 · بلال 90/40/20 (avg 50) · جمال hands in one (80), misses two · دانا three pending (provisional 0s)
  // · هدى 80, one missing, one pending.            class average = (90×3 + 90+40+20 + 80 + 80) / 8 = 72.5
  function seed({ withProject = false } = {}) {
    const s = {
      [CP + "c1.json"]: { classId: "c1", name: "صف أ", status: "active", studentIds: ["s1", "s2", "s3", "s4", "s5"], schoolYear: "2025-2026", ...(withProject ? { programCodes: [CODE] } : {}) },
      [UP + "s1.json"]: stu("s1", "أحمد"), [UP + "s2.json"]: stu("s2", "بلال"), [UP + "s3.json"]: stu("s3", "جمال"), [UP + "s4.json"]: stu("s4", "دانا"), [UP + "s5.json"]: stu("s5", "هدى"),
      [AP + "a1.json"]: asg("a1", "2026-02-05T10:00:00.000Z"), [AP + "a2.json"]: asg("a2", "2026-02-20T10:00:00.000Z"), [AP + "a3.json"]: asg("a3", "2026-03-05T10:00:00.000Z")
    };
    const put = (aid, sid, attempt) => { s[SP + aid + "/" + sid + ".json"] = doc(aid, sid, attempt); };
    for (const aid of ["a1", "a2", "a3"]) { put(aid, "s1", final(90)); put(aid, "s4", pending()); }
    put("a1", "s2", final(90)); put("a2", "s2", final(40)); put("a3", "s2", final(20));
    put("a1", "s3", final(80));
    put("a1", "s5", final(80)); put("a2", "s5", pending());
    if (withProject) s[NS.progressName("c1", "s1")] = { programCode: CODE, classId: "c1", studentId: "s1", stages: { [STAGE]: { status: "approved", updatedAt: NOW } }, history: [], updatedAt: NOW };
    return createMemoryContainer(s);
  }
  const deps = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container });
  const report = async (ctx, qs) => { const r = await reports({ method: "GET", url: "https://x/api/reports?" + qs }, deps(ctx)); expect(r.status).toBe(200); return r.jsonBody; };

  it("lists who needs follow-up with the reason's own numbers; the student whose results all await the teacher is NOT listed", async () => {
    const cls = await report(seed(), "type=class&classId=c1");
    expect(cls.kpis.averageScore).toBe(72.5);
    expect(cls.insights.followUp.criteria).toEqual({ missingAtLeast: 2, belowClassBy: 15 });
    expect(cls.insights.followUp.classAverage).toBe(cls.kpis.averageScore);                      // the report's own «متوسط النتائج»
    expect(cls.insights.followUp.students).toEqual([
      { studentId: "s2", displayName: "بلال", average: 50, missing: 0, pending: 0, reasons: [{ code: "belowClass", gap: 22.5 }] },
      { studentId: "s3", displayName: "جمال", average: 80, missing: 2, pending: 0, reasons: [{ code: "missing", count: 2 }] }
    ]);
    // دانا: three results awaiting the teacher (provisional 0s) → no average, nothing missing → not listed.  هدى: one missing only → not listed.
    expect(cls.insights.followUp.students.map(s => s.studentId)).not.toContain("s4");
    expect(cls.insights.followUp.students.map(s => s.studentId)).not.toContain("s5");
  });
  it("the period decides «missing»: within one month a student misses fewer assessments", async () => {
    const cls = await report(seed(), "type=class&classId=c1&from=2026-03-01&to=2026-03-31");
    expect(cls.kpis.assignments).toBe(1);
    // only a3: أحمد 90, بلال 20 → class average 55; بلال is 35 under it; جمال misses ONE (not 2) → not listed
    expect(cls.insights.followUp.students.map(s => [s.studentId, s.reasons.map(r => r.code).join("+")])).toEqual([["s2", "belowClass"]]);
  });
  it("project lateness joins the list by the «المتأخرون» rule — and the delayed report says the same about the same students", async () => {
    const ctx = seed({ withProject: true });
    const cls = await report(ctx, "type=class&classId=c1");
    const delayed = await report(ctx, "type=delayed&projectCode=" + CODE + "&classId=c1");
    const lateInReport = Object.fromEntries(delayed.students.map(s => [s.studentId, s.reasons]));
    const lateInList = Object.fromEntries(cls.insights.followUp.students.flatMap(s => s.reasons.filter(r => r.code === "project").map(r => [s.studentId, r.reasons])));
    expect(lateInList).toEqual(lateInReport);
    expect(Object.keys(lateInReport).length).toBeGreaterThan(0);
    const project = cls.insights.followUp.students.find(s => s.studentId === "s3").reasons.find(r => r.code === "project");
    expect(project).toMatchObject({ projectCode: CODE, title: getProjectDefinition(CODE).title });
    expect(project.reasons).toEqual(["لم يبدأ بعد"]);
    // more reasons first: جمال (missing + project) before بلال
    expect(cls.insights.followUp.students[0].studentId).toBe(cls.insights.followUp.students.find(s => s.reasons.length === Math.max(...cls.insights.followUp.students.map(x => x.reasons.length))).studentId);
  });
  it("the delayed report itself is unchanged by the shared rule (reasons, order, threshold)", async () => {
    const delayed = await report(seed({ withProject: true }), "type=delayed&projectCode=" + CODE + "&classId=c1");
    expect(delayed.lateThreshold).toBe(40);
    expect(delayed.students.every(s => Array.isArray(s.reasons) && s.reasons.length > 0)).toBe(true);
    expect(delayed.students.filter(s => s.studentId !== "s1").every(s => s.reasons.length === 1 && s.reasons[0] === "لم يبدأ بعد")).toBe(true);
  });
  it("the hub overview counts by the same criteria and the same class average (assessments only)", async () => {
    const ctx = seed({ withProject: true });
    const { overview } = await report(ctx, "type=overview");
    const cls = await report(ctx, "type=class&classId=c1");
    const academic = cls.insights.followUp.students.filter(s => s.reasons.some(r => r.code !== "project")).length;
    expect(overview.classes[0].needsFollowUp).toBe(academic);
    expect(overview.classes[0].needsFollowUp).toBe(2);
    expect(overview.followUp).toEqual({ criteria: { missingAtLeast: 2, belowClassBy: 15 }, total: 2 });
  });
});

describe("R-5c C — access", () => {
  const SARA = "t_00112233445566aa";
  function setup({ widgets } = {}) {
    resetRevisionCache(); resetOperatorGateCache();
    const seed = school();
    for (const c of ["c1", "c2", "c3"]) seed["platform/classes/" + c + ".json"].ownerId = SARA;
    seed["platform/classes/c1.json"].programCodes = ["899373"];
    const mem = createMemoryContainer(seed);
    const { revision } = buildRevision({ accountId: SARA, presetId: "full-teaching", presetVersion: 2, grants: [], createdBy: "owner:x", ...(widgets ? { resources: { widgets } } : {}) });
    mem.setJson(revisionName(revision.revisionId), revision);
    mem.setJson(teacherAccountName(SARA), { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: "full-teaching", version: 2 } });
    mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "enforce" });
    const token = recordedManagedToken(mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token;
    return { mem, token, deps: { getContainer: () => mem.container, container: mem.container, nowMs: Date.parse(NOW), docCache: null } };
  }
  const get = (ctx, path) => reports({ method: "GET", url: "https://x" + path, headers: { get: k => (String(k).toLowerCase() === "x-builder-token" ? ctx.token : null) } }, ctx.deps);

  it("the academic part withheld: no list at all (insights null) — not even the project reasons — and no submission read", async () => {
    const ctx = setup({ widgets: ["projects.evaluation", "grading.pending"] });
    const st = instrument(ctx.mem);
    const r = await get(ctx, "/api/reports?type=class&classId=c1");
    expect([r.status, r.jsonBody.kpis, r.jsonBody.insights]).toEqual([200, null, null]);
    expect(JSON.stringify(r.jsonBody)).not.toContain("followUp");
    expect(st.subs()).toEqual([]);
  });
  it("projects withheld: the list carries academic reasons only — no project reason, and no project progress read for it", async () => {
    const ctx = setup({ widgets: ["scores.overview"] });
    const st = instrument(ctx.mem);
    const r = await get(ctx, "/api/reports?type=class&classId=c1");
    expect(r.status).toBe(200);
    expect(r.jsonBody.withheld).toEqual(["projects"]);
    expect(r.jsonBody.projects).toEqual([]);
    expect(r.jsonBody.insights.followUp.students.flatMap(s => s.reasons.map(x => x.code))).not.toContain("project");
    expect(st.downloads.filter(n => /progress/i.test(n))).toEqual([]);
  });
  it("with both parts: project reasons appear for the class's project", async () => {
    const ctx = setup();
    const r = await get(ctx, "/api/reports?type=class&classId=c1");
    expect(r.status).toBe(200);
    expect(r.jsonBody.insights.followUp.students.flatMap(s => s.reasons.map(x => x.code))).toContain("project");
  });
});
