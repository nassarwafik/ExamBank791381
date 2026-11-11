// Phase R-5a — the chart series of the class and student reports (`insights`; docs/enterprise-reports-insight-charts-r5a.md).
// Pinned over the pure shaping (api/src/lib/reports/insights.js) and the REAL reports handler with the in-memory container:
//   A. the series say exactly what the rest of the Reports Center says (same figures as the assessments report's rows and the
//      KPIs of the same report) and keep the grading-safety rules: a result awaiting the teacher has NO percentage (never a zero,
//      never in an average), a student who never handed in is «missing» (never a zero), an unknown outcome never becomes a number;
//   B. the series follow the assessments' creation order and the date range, like the KPIs beside them;
//   C. access: the academic part withheld → `insights: null` and nothing of it read; a student stamped as this teacher's but sitting
//      in another teacher's class (P10-H) → an empty series and none of that class's submissions or roster read.
// TEST data only.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { recordedManagedToken } from "./fixtures/managed-session.js";
import { school, NOW, SUB, instrument } from "./fixtures/analytics-school.js";

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "r5a-reports-insights-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "STUDENT_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const ins = cjs("../src/lib/reports/insights.js");
const { handler: reports } = await import("../src/functions/reports.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const final = (percentage, extra = {}) => ({ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: percentage / 10, totalMarks: 10, percentage, manualReviewMarks: 0, finalized: true, ...extra });
// Awaiting the teacher: the stored provisional score is 0 — the number that must never surface.
const pending = (extra = {}) => ({ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false, ...extra });
const sub = (...attempts) => ({ attempts });
const subsMap = obj => new Map(Object.entries(obj));

describe("R-5a A — pure shaping (insights.js)", () => {
  const students = [{ studentId: "s1", displayName: "أ" }, { studentId: "s2", displayName: "ب" }, { studentId: "s3", displayName: "ج" }];
  const assignments = [{ assignmentId: "a1", title: "الأول", createdAt: "2026-02-01T08:00:00.000Z" }, { assignmentId: "a2", title: "الثاني", createdAt: "not a date" }];
  const subs = [subsMap({ s1: sub(final(80)), s2: sub(pending()) }), subsMap({ s1: sub(final(0)), s2: sub(final(60)) })];

  it("assessmentSeries: one point per assessment in the given order — final-only average, pending handed in, missing apart", () => {
    expect(ins.assessmentSeries(assignments, students, subs)).toEqual([
      { assignmentId: "a1", title: "الأول", date: "2026-02-01", students: 3, submitted: 2, missing: 1, pendingReview: 1, submissionRate: 67, average: 80 },
      { assignmentId: "a2", title: "الثاني", date: "", students: 3, submitted: 2, missing: 1, pendingReview: 0, submissionRate: 67, average: 30 }
    ]);
  });
  it("an assessment with only pending / missing results has NO average (null), never 0", () => {
    const [p] = ins.assessmentSeries([assignments[0]], students, [subsMap({ s1: sub(pending()) })]);
    expect(p).toMatchObject({ submitted: 1, pendingReview: 1, missing: 2, average: null });
  });
  it("studentStandings: final-only average (null when none), graded + pending + missing = assessments", () => {
    const st = ins.studentStandings(students, subs);
    expect(st).toEqual([
      { studentId: "s1", displayName: "أ", average: 40, graded: 2, pending: 0, missing: 0 },       // a REAL zero is averaged
      { studentId: "s2", displayName: "ب", average: 60, graded: 1, pending: 1, missing: 0 },       // the provisional 0 is not
      { studentId: "s3", displayName: "ج", average: null, graded: 0, pending: 0, missing: 2 }      // never a zero
    ]);
    for (const s of st) expect(s.graded + s.pending + s.missing).toBe(assignments.length);
    expect(ins.submissionSplit(st)).toEqual({ graded: 3, pending: 1, missing: 2 });
  });
  it("classAverages = the per-assessment «المتوسط» (roster only: a non-member's result is not averaged)", () => {
    const withOutsider = [subsMap({ s1: sub(final(80)), outsider: sub(final(0)) })];
    expect(ins.classAverages(students, withOutsider)).toEqual([80]);
    expect(ins.classAverages(students, [subsMap({})])).toEqual([null]);
  });
  it("studentSeries: a percentage ONLY for a final result; pending and missing carry null; the class average rides along", () => {
    const series = ins.studentSeries(
      [...assignments, { assignmentId: "a3", title: "الثالث", createdAt: "2026-02-20T08:00:00.000Z" }],
      [sub(final(90), pending({ attemptNumber: 2 })), null, sub(final(10), final(55, { attemptNumber: 2 }))],
      [80, 30]);
    expect(series).toEqual([
      // only the LATEST attempt decides: the earlier final 90 does not leak while the newest awaits the teacher
      { assignmentId: "a1", title: "الأول", date: "2026-02-01", state: "pending", percentage: null, attempts: 2, classAverage: 80 },
      { assignmentId: "a2", title: "الثاني", date: "", state: "missing", percentage: null, attempts: 0, classAverage: 30 },
      { assignmentId: "a3", title: "الثالث", date: "2026-02-20", state: "submitted", percentage: 55, attempts: 2, classAverage: null }
    ]);
    expect(ins.studentSplit(series)).toEqual({ graded: 1, pending: 1, missing: 1 });
  });
  it("isoDay: the calendar day of an ISO timestamp, \"\" for anything else", () => {
    expect([ins.isoDay("2026-03-01T10:00:00.000Z"), ins.isoDay(""), ins.isoDay(null), ins.isoDay("soon")]).toEqual(["2026-03-01", "", "", ""]);
  });
});

describe("R-5a B — the REAL reports handler: class and student `insights`", () => {
  const CP = "platform/classes/", UP = "platform/users/", AP = "platform/assignments/", SP = "platform/submissions/";
  const stu = (userId, displayName) => ({ userId, role: "student", active: true, archived: false, classId: "c1", displayName });
  const asg = (id, createdAt) => ({ assignmentId: id, classId: "c1", status: "published", title: "واجب " + id, createdAt, totalMarks: 10 });
  const doc = (aid, sid, ...attempts) => ({ assignmentId: aid, studentId: sid, classId: "c1", attempts, activeAttempt: null });
  // a1 (Feb): s1 final 80, s2 pending (provisional 0), s3 missing.   a2 (Mar): s1 final 0 (a REAL zero), s2 final 60, s3 missing.
  // The documents are seeded newest first, so the series' order is the creation order and not the storage order.
  const seed = () => createMemoryContainer({
    [CP + "c1.json"]: { classId: "c1", name: "صف أ", status: "active", studentIds: ["s1", "s2", "s3"], schoolYear: "2025-2026" },
    [UP + "s1.json"]: stu("s1", "أحمد"), [UP + "s2.json"]: stu("s2", "بلال"), [UP + "s3.json"]: stu("s3", "جمال"),
    [AP + "a2.json"]: asg("a2", "2026-03-05T10:00:00.000Z"), [AP + "a1.json"]: asg("a1", "2026-02-05T10:00:00.000Z"),
    [AP + "draft.json"]: { ...asg("draft", "2026-02-10T10:00:00.000Z"), status: "draft" },
    [SP + "a1/s1.json"]: doc("a1", "s1", final(80)), [SP + "a1/s2.json"]: doc("a1", "s2", pending()),
    [SP + "a2/s1.json"]: doc("a2", "s1", final(0)), [SP + "a2/s2.json"]: doc("a2", "s2", final(60))
  });
  const deps = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container });
  const report = async (ctx, qs) => { const r = await reports({ method: "GET", url: "https://x/api/reports?" + qs }, deps(ctx)); expect(r.status).toBe(200); return r.jsonBody; };

  it("class report: the per-assessment series is the assessments report's rows, oldest first (a draft never appears)", async () => {
    const ctx = seed();
    const cls = await report(ctx, "type=class&classId=c1");
    const rows = (await report(ctx, "type=assignments&classId=c1")).perAssignment;
    expect(cls.insights.assessments.map(p => [p.assignmentId, p.date])).toEqual([["a1", "2026-02-05"], ["a2", "2026-03-05"]]);
    for (const [i, p] of cls.insights.assessments.entries()) {
      const { assignmentId, title, students, submitted, missing, pendingReview, submissionRate, average } = rows[i];
      expect(p).toMatchObject({ assignmentId, title, students, submitted, missing, pendingReview, submissionRate, average });
    }
    expect(cls.insights.assessments.map(p => p.average)).toEqual([80, 30]);
  });
  it("class report: each student's standing and the cells by state agree with the KPIs; pending / missing never a number", async () => {
    const cls = await report(seed(), "type=class&classId=c1");
    expect(cls.insights.students).toEqual([
      { studentId: "s1", displayName: "أحمد", average: 40, graded: 2, pending: 0, missing: 0 },
      { studentId: "s2", displayName: "بلال", average: 60, graded: 1, pending: 1, missing: 0 },
      { studentId: "s3", displayName: "جمال", average: null, graded: 0, pending: 0, missing: 2 }
    ]);
    const { graded, pending, missing } = cls.insights.submission;
    expect([graded, pending, missing]).toEqual([3, 1, 2]);
    // the same cells the KPIs count: handed in = graded + pending; the pending count; every cell accounted for
    expect(cls.kpis).toMatchObject({ assignments: 2, averageScore: 46.7, submissionRate: 67, pendingReview: 1 });
    expect(Math.round(((graded + pending) / (graded + pending + missing)) * 100)).toBe(cls.kpis.submissionRate);
    expect(pending).toBe(cls.kpis.pendingReview);
  });
  it("class report: the fields that existed before R-5a are unchanged (additive response)", async () => {
    const cls = await report(seed(), "type=class&classId=c1");
    expect(Object.keys(cls).sort()).toEqual(["class", "insights", "kpis", "ok", "projects", "type", "withheld"]);
    expect(cls.kpis).toEqual({ assignments: 2, averageScore: 46.7, submissionRate: 67, pendingReview: 1 });
  });
  it("student report: result per assessment beside the class average; pending / missing carry no percentage", async () => {
    const ctx = seed();
    const s2 = await report(ctx, "type=student&studentId=s2");
    expect(s2.insights.assessments).toEqual([
      { assignmentId: "a1", title: "واجب a1", date: "2026-02-05", state: "pending", percentage: null, attempts: 1, classAverage: 80 },
      { assignmentId: "a2", title: "واجب a2", date: "2026-03-05", state: "submitted", percentage: 60, attempts: 1, classAverage: 30 }
    ]);
    expect(s2.insights.submission).toEqual({ graded: 1, pending: 1, missing: 0 });
    expect(s2.academic).toMatchObject({ average: 60, submittedCount: 2, assessmentCount: 2, pendingCount: 1 });   // unchanged (R-1)
    const s3 = await report(ctx, "type=student&studentId=s3");
    expect(s3.insights.assessments.map(p => [p.state, p.percentage])).toEqual([["missing", null], ["missing", null]]);
    expect(s3.insights.submission).toEqual({ graded: 0, pending: 0, missing: 2 });
    expect(s3.academic.average).toBeNull();
    const s1 = await report(ctx, "type=student&studentId=s1");
    expect(s1.insights.assessments.map(p => [p.state, p.percentage])).toEqual([["submitted", 80], ["submitted", 0]]);   // a REAL zero stays a zero
    // the class average is the assessments report's own «المتوسط»
    const rows = (await report(ctx, "type=assignments&classId=c1")).perAssignment;
    expect(s1.insights.assessments.map(p => p.classAverage)).toEqual(rows.map(r => r.average));
  });
  it("the date range clips the series exactly like the KPIs beside them", async () => {
    const ctx = seed();
    const cls = await report(ctx, "type=class&classId=c1&from=2026-03-01&to=2026-03-31");
    expect(cls.kpis.assignments).toBe(1);
    expect(cls.insights.assessments.map(p => p.assignmentId)).toEqual(["a2"]);
    expect(cls.insights.students.map(s => [s.studentId, s.average, s.graded, s.pending, s.missing])).toEqual([["s1", 0, 1, 0, 0], ["s2", 60, 1, 0, 0], ["s3", null, 0, 0, 1]]);
    const s2 = await report(ctx, "type=student&studentId=s2&from=2026-03-01&to=2026-03-31");
    expect(s2.insights.assessments.map(p => p.assignmentId)).toEqual(["a2"]);
    const none = await report(ctx, "type=class&classId=c1&from=2027-01-01&to=2027-01-31");
    expect(none.insights).toEqual({ assessments: [], students: [{ studentId: "s1", displayName: "أحمد", average: null, graded: 0, pending: 0, missing: 0 }, { studentId: "s2", displayName: "بلال", average: null, graded: 0, pending: 0, missing: 0 }, { studentId: "s3", displayName: "جمال", average: null, graded: 0, pending: 0, missing: 0 }], submission: { graded: 0, pending: 0, missing: 0 },
      // Reports R-5b added `summary` (additive): with no final result every figure of it is null — never 0
      summary: { highest: null, lowest: null, median: null, stdDev: null, withAverage: 0 } });
  });
  it("read cost: the student report downloads no document twice, and a repeated request over unchanged storage downloads none of the class's", async () => {
    const ctx = seed(), st = instrument(ctx);
    const first = await report(ctx, "type=student&studentId=s2");
    expect(st.dups()).toBe(0);                                               // the student's own user document and submission included
    expect(st.subs()).toEqual([SUB + "a1/s1.json", SUB + "a1/s2.json", SUB + "a2/s1.json", SUB + "a2/s2.json"]);
    st.downloads.length = 0; st.lists.length = 0;
    const second = await report(ctx, "type=student&studentId=s2");
    expect(second).toEqual(first);
    expect(st.subs()).toEqual([]);                                           // ETag-verified reuse (R-3): listed again, not downloaded
    expect(st.subLists().sort()).toEqual([SUB + "a1/", SUB + "a2/"]);
    // a changed submission is read again and the class average follows it
    ctx.setJson(SP + "a2/s1.json", doc("a2", "s1", final(100)));
    const third = await report(ctx, "type=student&studentId=s2");
    expect(third.insights.assessments[1].classAverage).toBe(80);
  });
  it("the student's own result is the document named after them, even beside another student's in the same scan", async () => {
    const body = await report(seed(), "type=student&studentId=s2");
    expect(body.insights.assessments[1]).toMatchObject({ assignmentId: "a2", state: "submitted", percentage: 60 });   // s1's 0 in a2 is not theirs
    expect(body.academic.average).toBe(60);
  });
  it("a student with no class: an empty series, nothing invented", async () => {
    const ctx = seed();
    ctx.setJson(UP + "s9.json", { userId: "s9", role: "student", active: true, archived: false, classId: "", displayName: "بلا صف" });
    const body = await report(ctx, "type=student&studentId=s9");
    expect(body.insights).toEqual({ assessments: [], submission: { graded: 0, pending: 0, missing: 0 } });
  });
  it("class report: each project section carries its student count (the population of «مكتملون» / «لم يبدأوا»)", async () => {
    const { getProjectDefinition, getStorageNamespace } = cjs("../src/lib/project-tracker/registry.js");
    const ctx = seed();
    ctx.setJson(CP + "c1.json", { classId: "c1", name: "صف أ", status: "active", studentIds: ["s1", "s2", "s3"], schoolYear: "2025-2026", programCodes: ["899373"] });
    const stage = getProjectDefinition("899373").stages.filter(s => s.active !== false)[0].stageId;
    ctx.setJson(getStorageNamespace("899373").progressName("c1", "s1"), { programCode: "899373", classId: "c1", studentId: "s1", stages: { [stage]: { status: "approved", updatedAt: NOW } }, history: [], updatedAt: NOW });
    const cls = await report(ctx, "type=class&classId=c1");
    expect(cls.projects).toHaveLength(1);
    expect(cls.projects[0]).toMatchObject({ projectCode: "899373", studentCount: 3, completedCount: 0 });
  });
});

describe("R-5a C — access: `insights` is part of the academic part and never crosses a teacher's boundary", () => {
  const SARA = "t_00112233445566aa";   // owns c1 (and c3)
  const OMAR = "t_00112233445566bb";   // owns c2
  const NOW_MS = Date.parse(NOW);
  function setup({ widgets } = {}) {
    resetRevisionCache(); resetOperatorGateCache();
    const seed = school();
    seed["platform/classes/c1.json"].ownerId = SARA;
    seed["platform/classes/c3.json"].ownerId = SARA;
    seed["platform/classes/c2.json"].ownerId = OMAR;
    seed["platform/users/s11.json"].ownerId = SARA;   // sits in Omar's class c2 but carries Sara's owner stamp (P10-H)
    const mem = createMemoryContainer(seed);
    for (const id of [SARA, OMAR]) {
      const { revision } = buildRevision({ accountId: id, presetId: "full-teaching", presetVersion: 2, grants: [], createdBy: "owner:x", ...(widgets && id === SARA ? { resources: { widgets } } : {}) });
      mem.setJson(revisionName(revision.revisionId), revision);
      mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username: "t." + id.slice(-2), displayName: "معلم", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: "full-teaching", version: 2 } });
    }
    mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "enforce" });
    const tokens = Object.fromEntries([SARA, OMAR].map(id => [id, recordedManagedToken(mem, { accountId: id, sid: newTeacherSessionId(), authVersion: 1 }).token]));
    return { mem, tokens, deps: { getContainer: () => mem.container, container: mem.container, nowMs: NOW_MS, docCache: null } };
  }
  const as = (ctx, who, path) => reports({ method: "GET", url: "https://x" + path, headers: { get: k => (String(k).toLowerCase() === "x-builder-token" ? ctx.tokens[who] : null) } }, ctx.deps);

  it("the academic part withheld («ملخص العلامات» left out): class and student `insights` are null and no submission is read", async () => {
    const ctx = setup({ widgets: ["grading.pending", "insights"] });
    const st = instrument(ctx.mem);
    const c = await as(ctx, SARA, "/api/reports?type=class&classId=c1");
    expect([c.status, c.jsonBody.kpis, c.jsonBody.insights]).toEqual([200, null, null]);
    expect(c.jsonBody.withheld).toContain("academic");
    const s = await as(ctx, SARA, "/api/reports?type=student&studentId=s01");
    expect([s.status, s.jsonBody.academic, s.jsonBody.insights]).toEqual([200, null, null]);
    expect(st.subs()).toEqual([]);
    expect(st.subLists()).toEqual([]);
  });
  it("with the academic part: Sara's own student gets the series, with her class's averages", async () => {
    const ctx = setup();
    const r = await as(ctx, SARA, "/api/reports?type=student&studentId=s01");
    expect(r.status).toBe(200);
    expect(r.jsonBody.insights.assessments.length).toBe(r.jsonBody.academic.assessmentCount);
    expect(r.jsonBody.insights.assessments.length).toBeGreaterThan(0);
    const { graded, pending } = r.jsonBody.insights.submission;
    expect(graded + pending).toBe(r.jsonBody.academic.submittedCount);
  });
  it("P10-H: Sara's stamped student in Omar's class — an empty series; none of Omar's submissions listed or read, his class's name nowhere", async () => {
    const ctx = setup();
    const st = instrument(ctx.mem);
    const r = await as(ctx, SARA, "/api/reports?type=student&studentId=s11");
    expect(r.status).toBe(200);
    expect(r.jsonBody.insights).toEqual({ assessments: [], submission: { graded: 0, pending: 0, missing: 0 } });
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/صف 2|"c2"|P3/);
    expect(st.downloads.filter(n => n.startsWith(SUB))).toEqual([]);
    expect(st.subLists()).toEqual([]);
  });
  it("another teacher's class or student is still a 404 (unchanged) — no series", async () => {
    const ctx = setup();
    const c = await as(ctx, SARA, "/api/reports?type=class&classId=c2");
    expect([c.status, c.jsonBody.insights]).toEqual([404, undefined]);
    const s = await as(ctx, SARA, "/api/reports?type=student&studentId=s12");
    expect([s.status, s.jsonBody.insights]).toEqual([404, undefined]);
  });
});

describe("R-5a D — the hub overview (type=overview)", () => {
  it("overviewRollup: per-class rows, pooled totals and a month-by-month trend — final-only averages, pending handed in", () => {
    const roster = ids => ids.map(id => ({ studentId: id, displayName: id }));
    const out = ins.overviewRollup([
      { meta: { classId: "c1", name: "أ", schoolYear: "2025-2026" }, students: roster(["s1", "s2"]),
        assignments: [{ assignmentId: "a1", createdAt: "2026-02-05T10:00:00.000Z" }, { assignmentId: "a2", createdAt: "2026-03-05T10:00:00.000Z" }],
        subsByAssignment: [subsMap({ s1: sub(final(80)), s2: sub(pending()) }), subsMap({ s1: sub(final(0)) })] },
      { meta: { classId: "c2", name: "ب" }, students: roster(["s3"]), assignments: [{ assignmentId: "b1", createdAt: "2026-03-09T10:00:00.000Z" }], subsByAssignment: [subsMap({ s3: sub(final(100)) })] },
      { meta: { classId: "c3", name: "ج", schoolYear: "2025-2026" }, students: roster(["s4"]), assignments: [], subsByAssignment: [] }
    ]);
    expect(out.classes).toEqual([
      { classId: "c1", name: "أ", schoolYear: "2025-2026", studentCount: 2, assessments: 2, average: 40, submissionRate: 75, pendingReview: 1, graded: 2, pending: 1, missing: 1 },
      { classId: "c2", name: "ب", schoolYear: "", studentCount: 1, assessments: 1, average: 100, submissionRate: 100, pendingReview: 0, graded: 1, pending: 0, missing: 0 },
      { classId: "c3", name: "ج", schoolYear: "2025-2026", studentCount: 1, assessments: 0, average: null, submissionRate: 0, pendingReview: 0, graded: 0, pending: 0, missing: 0 }
    ]);
    expect(out.totals).toEqual({ classes: 3, students: 4, assessments: 3, average: 60, submissionRate: 80, pendingReview: 1 });
    expect(out.trend).toEqual([
      { month: "2026-02", assessments: 1, average: 80, submissionRate: 100 },     // the pending result: handed in, not averaged
      { month: "2026-03", assessments: 2, average: 50, submissionRate: 67 }
    ]);
  });
  it("a month with only pending results has no average (null), never 0; an undated assessment joins the totals but no month", () => {
    const out = ins.overviewRollup([{ meta: { classId: "c1", name: "أ" }, students: [{ studentId: "s1" }],
      assignments: [{ assignmentId: "a1", createdAt: "2026-02-05T10:00:00.000Z" }, { assignmentId: "a2", createdAt: "" }],
      subsByAssignment: [subsMap({ s1: sub(pending()) }), subsMap({ s1: sub(final(70)) })] }]);
    expect(out.trend).toEqual([{ month: "2026-02", assessments: 1, average: null, submissionRate: 100 }]);
    expect(out.totals).toMatchObject({ assessments: 2, average: 70, submissionRate: 100, pendingReview: 1 });
  });

  const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb";
  function setup({ widgets } = {}) {
    resetRevisionCache(); resetOperatorGateCache();
    const seed = school();
    seed["platform/classes/c1.json"].ownerId = SARA;
    seed["platform/classes/c3.json"].ownerId = SARA;   // archived
    seed["platform/classes/c2.json"].ownerId = OMAR;
    const mem = createMemoryContainer(seed);
    for (const id of [SARA, OMAR]) {
      const { revision } = buildRevision({ accountId: id, presetId: "full-teaching", presetVersion: 2, grants: [], createdBy: "owner:x", ...(widgets && id === SARA ? { resources: { widgets } } : {}) });
      mem.setJson(revisionName(revision.revisionId), revision);
      mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username: "t." + id.slice(-2), displayName: "معلم", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: "full-teaching", version: 2 } });
    }
    mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "enforce" });
    const tokens = Object.fromEntries([SARA, OMAR].map(id => [id, recordedManagedToken(mem, { accountId: id, sid: newTeacherSessionId(), authVersion: 1 }).token]));
    return { mem, tokens, deps: { getContainer: () => mem.container, container: mem.container, nowMs: Date.parse(NOW), docCache: null } };
  }
  const as = (ctx, who, path) => reports({ method: "GET", url: "https://x" + path, headers: { get: k => (String(k).toLowerCase() === "x-builder-token" ? ctx.tokens[who] : null) } }, ctx.deps);

  it("a teacher sees only their own ACTIVE classes; each row equals that class's own report; another teacher's class is never read", async () => {
    const ctx = setup();
    const st = instrument(ctx.mem);
    const r = await as(ctx, SARA, "/api/reports?type=overview");
    expect(r.status).toBe(200);
    const { classes, totals, trend } = r.jsonBody.overview;
    expect(classes.map(c => c.classId)).toEqual(["c1"]);                       // c2 is Omar's, c3 is archived
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/صف 2|"c2"|صف 3|"c3"/);
    expect(st.downloads.filter(n => n.startsWith(SUB + "P3/") || n.startsWith(SUB + "P4/"))).toEqual([]);
    expect(st.subLists().filter(p => p.startsWith(SUB + "P3/") || p.startsWith(SUB + "P4/"))).toEqual([]);
    const cls = (await as(ctx, SARA, "/api/reports?type=class&classId=c1")).jsonBody;
    expect(classes[0]).toMatchObject({ assessments: cls.kpis.assignments, average: cls.kpis.averageScore, submissionRate: cls.kpis.submissionRate, pendingReview: cls.kpis.pendingReview });
    expect([classes[0].graded, classes[0].pending, classes[0].missing]).toEqual([cls.insights.submission.graded, cls.insights.submission.pending, cls.insights.submission.missing]);
    expect(totals).toMatchObject({ classes: 1, assessments: cls.kpis.assignments, average: cls.kpis.averageScore, submissionRate: cls.kpis.submissionRate });
    expect(trend.reduce((n, m) => n + m.assessments, 0)).toBe(totals.assessments);
    expect(trend.map(m => m.month)).toEqual([...trend.map(m => m.month)].sort());
    // Omar's overview is his class, not Sara's
    expect((await as(ctx, OMAR, "/api/reports?type=overview")).jsonBody.overview.classes.map(c => c.classId)).toEqual(["c2"]);
  });
  it("the date range and the school year narrow it", async () => {
    const ctx = setup();
    const all = (await as(ctx, SARA, "/api/reports?type=overview")).jsonBody.overview;
    const recent = (await as(ctx, SARA, "/api/reports?type=overview&from=2026-01-01&to=2026-12-31")).jsonBody.overview;
    expect(recent.totals.assessments).toBeLessThan(all.totals.assessments);    // P_old (a year earlier) is out
    expect(recent.trend.every(m => m.month.startsWith("2026-"))).toBe(true);
    expect((await as(ctx, SARA, "/api/reports?type=overview&schoolYear=1999-2000")).jsonBody.overview).toEqual({ classes: [], totals: { classes: 0, students: 0, assessments: 0, average: null, submissionRate: 0, pendingReview: 0 }, trend: [] });
    expect((await as(ctx, SARA, "/api/reports?type=overview&from=2026-05-01&to=2026-01-01")).status).toBe(400);
  });
  it("the academic part withheld → overview: null, and no class, assignment or submission is read for it", async () => {
    const ctx = setup({ widgets: ["grading.pending", "insights"] });
    const st = instrument(ctx.mem);
    const r = await as(ctx, SARA, "/api/reports?type=overview");
    expect([r.status, r.jsonBody.overview]).toEqual([200, null]);
    expect(r.jsonBody.withheld).toContain("academic");
    expect(st.lists.filter(p => p.startsWith("platform/classes/") || p.startsWith("platform/assignments/") || p.startsWith(SUB))).toEqual([]);
    expect(st.subs()).toEqual([]);
  });
  it("no session → refused before anything is read", async () => {
    const ctx = setup();
    const r = await reports({ method: "GET", url: "https://x/api/reports?type=overview", headers: { get: () => null } }, ctx.deps);
    expect(r.status).toBe(401);
    expect(r.jsonBody.overview).toBeUndefined();
  });
});
