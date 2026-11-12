// Phase R-6 — the period of the assessment reports is the PUBLICATION date (owner decision D-2, docs/reports-center-audit.md §6;
// design record docs/enterprise-reports-period-r6.md). Before: every report filtered, dated and ordered an assessment by its
// CREATION date, so a draft prepared two months ago and published this week was missing from «آخر 7 أيام» (audit P2-6).
// Driven through the REAL handlers — manage-assignments publishes, reports reads — over the in-memory container:
//   A. the stamp: `publishedAt` is written at the FIRST publication (create-as-published, or draft → published), never moved
//      by a later unpublish / publish again, an archive / restore or any other edit, and never written for a draft;
//   B. the reports: the period, the date shown, the order and the month of the hub trend all follow the publication date;
//   C. older documents (no stamp) keep their creation date — nothing stored is rewritten — and the reply says how many of
//      its assessments are dated that way; a stamp that cannot be read as a date is treated as no stamp (never drops the
//      assessment, never becomes a date of its own).
// TEST data only.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { handler as manage } from "../src/functions/manage-assignments.js";
import { handler as reports } from "../src/functions/reports.js";
import { createRequire } from "node:module";
import { recordedManagedToken } from "./fixtures/managed-session.js";
import { school, NOW } from "./fixtures/analytics-school.js";

process.env.BANK_SETUP_KEY = "r6-reports-period-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "STUDENT_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const cjs = createRequire(import.meta.url);
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const CP = "platform/classes/", UP = "platform/users/", AP = "platform/assignments/", SP = "platform/submissions/";
const EXAM = { title: "امتحان", sections: [{ id: "s1", gradingPolicy: "all", questions: [{ marks: 10 }] }] };
const OBS = { logInfo: () => {}, logWarn: () => {}, logError: () => {} };
const JAN_10 = "2026-01-10T09:00:00.000Z", FEB_01 = "2026-02-01T09:00:00.000Z", MAR_10 = "2026-03-10T09:00:00.000Z", MAR_20 = "2026-03-20T09:00:00.000Z";

const asg = (id, status, createdAt, extra = {}) => ({ schemaVersion: 2, attemptModelVersion: 2, attemptPolicy: "continuous", assignmentId: id, classId: "c1", className: "صف أ", title: "واجب " + id, instructions: "",
  status, openAt: "", dueAt: "", maxAttempts: 1, durationMinutes: 0, questionCount: 1, totalMarks: 10, examSnapshot: EXAM, createdAt, updatedAt: createdAt, ...extra });
const final = pct => ({ attemptNumber: 1, submittedAt: MAR_10, score: pct / 10, totalMarks: 10, percentage: pct, manualReviewMarks: 0, finalized: true });

/** One class, two students. `draft` was prepared on 10 January and is still a draft; `old` is an assessment published before this
 *  phase existed (no stamp), created on 1 February. Both students handed both in. */
function world(extra = {}) {
  const seed = {
    [CP + "c1.json"]: { classId: "c1", name: "صف أ", status: "active", active: true, schoolYear: "2025-2026" },
    [UP + "s1.json"]: { userId: "s1", role: "student", active: true, archived: false, classId: "c1", displayName: "أحمد" },
    [UP + "s2.json"]: { userId: "s2", role: "student", active: true, archived: false, classId: "c1", displayName: "بلال" },
    [AP + "draft.json"]: asg("draft", "draft", JAN_10),
    [AP + "old.json"]: asg("old", "published", FEB_01),
    ...extra
  };
  for (const aid of ["draft", "old"]) for (const [sid, pct] of [["s1", 90], ["s2", 70]]) seed[SP + aid + "/" + sid + ".json"] = { assignmentId: aid, studentId: sid, classId: "c1", attempts: [final(pct)] };
  return createMemoryContainer(seed);
}
const deps = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ctx.container, container: ctx.container, recordAuditEvent: async () => {} });
const post = (ctx, body) => manage({ method: "POST", url: "https://x/api/assignments", json: async () => body }, deps(ctx), OBS);
const ok = async (ctx, body) => { const r = await post(ctx, body); expect(r.status, JSON.stringify(r.jsonBody)).toBe(200); return r.jsonBody; };
const report = async (ctx, qs) => { const r = await reports({ method: "GET", url: "https://x/api/reports?" + qs }, deps(ctx)); expect(r.status, JSON.stringify(r.jsonBody)).toBe(200); return r.jsonBody; };
const stored = (ctx, id) => ctx.getJson(AP + id + ".json");
const at = iso => vi.setSystemTime(Date.parse(iso));
const ids = rows => rows.map(r => r.assignmentId);

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); at(MAR_10); });
afterEach(() => { vi.useRealTimers(); });

describe("R-6 A — the stamp: `publishedAt` is the moment of the FIRST publication", () => {
  it("draft → published stamps the publication moment on the stored document; nothing else of the document moves", async () => {
    const ctx = world();
    const before = stored(ctx, "draft");
    await ok(ctx, { action: "setstatus", assignmentId: "draft", status: "published" });
    const after = stored(ctx, "draft");
    expect(after.publishedAt).toBe(MAR_10);
    expect(after.createdAt).toBe(JAN_10);                                                          // the creation date is kept as it was
    expect({ ...after, publishedAt: undefined, status: undefined, updatedAt: undefined }).toEqual({ ...before, publishedAt: undefined, status: undefined, updatedAt: undefined });
  });
  it("an assessment created already published is stamped with its creation moment; one created as a draft carries no stamp", async () => {
    const ctx = world();
    const pub = (await ok(ctx, { action: "create", classId: "c1", title: "منشور", examSnapshot: EXAM, publish: true })).assignment.assignmentId;
    const dra = (await ok(ctx, { action: "create", classId: "c1", title: "مسودة", examSnapshot: EXAM, publish: false })).assignment.assignmentId;
    expect(stored(ctx, pub).publishedAt).toBe(MAR_10);
    expect(stored(ctx, pub).publishedAt).toBe(stored(ctx, pub).createdAt);
    expect("publishedAt" in stored(ctx, dra)).toBe(false);
  });
  it("unpublishing keeps the stamp; publishing again later does NOT move it (the first publication stands)", async () => {
    const ctx = world();
    await ok(ctx, { action: "setstatus", assignmentId: "draft", status: "published" });
    at(MAR_20);
    await ok(ctx, { action: "setstatus", assignmentId: "draft", status: "draft" });
    expect(stored(ctx, "draft").publishedAt).toBe(MAR_10);
    await ok(ctx, { action: "setstatus", assignmentId: "draft", status: "published" });
    expect(stored(ctx, "draft").status).toBe("published");
    expect(stored(ctx, "draft").publishedAt).toBe(MAR_10);
  });
  it("archive, restore and every other edit keep the stamp", async () => {
    const ctx = world();
    await ok(ctx, { action: "setstatus", assignmentId: "draft", status: "published" });
    at(MAR_20);
    await ok(ctx, { action: "updatedetails", assignmentId: "draft", title: "عنوان جديد" });
    await ok(ctx, { action: "setmaxattempts", assignmentId: "draft", maxAttempts: 3 });
    await ok(ctx, { action: "delete", assignmentId: "draft" });
    expect(stored(ctx, "draft").status).toBe("archived");
    expect(stored(ctx, "draft").publishedAt).toBe(MAR_10);
    await ok(ctx, { action: "restore", assignmentId: "draft" });
    expect(stored(ctx, "draft").status).toBe("published");
    expect(stored(ctx, "draft").publishedAt).toBe(MAR_10);
  });
  it("an older published assessment is NOT stamped by a repeated «published» (no transition), nor by an edit, an archive or a restore", async () => {
    const ctx = world();
    await ok(ctx, { action: "setstatus", assignmentId: "old", status: "published" });            // published → published: the index repair path
    await ok(ctx, { action: "updatedetails", assignmentId: "old", title: "قديم" });
    await ok(ctx, { action: "delete", assignmentId: "old" });
    await ok(ctx, { action: "restore", assignmentId: "old" });
    expect(stored(ctx, "old").status).toBe("published");
    expect("publishedAt" in stored(ctx, "old")).toBe(false);                                       // nothing stored is rewritten with a guessed date
  });
  it("a stored stamp that is not a readable date is replaced at the next publication (it never counted as one)", async () => {
    const ctx = world({ [AP + "bad.json"]: asg("bad", "draft", JAN_10, { publishedAt: "not a date" }) });
    await ok(ctx, { action: "setstatus", assignmentId: "bad", status: "published" });
    expect(stored(ctx, "bad").publishedAt).toBe(MAR_10);
  });
});

describe("R-6 B — the reports follow the publication date", () => {
  const WEEK = "from=2026-03-08&to=2026-03-14", JANUARY = "from=2026-01-01&to=2026-01-31", FEBRUARY = "from=2026-02-01&to=2026-02-28";
  async function published() { const ctx = world(); await ok(ctx, { action: "setstatus", assignmentId: "draft", status: "published" }); return ctx; }

  it("the assessments report: prepared in January, published on 10 March → in the week of 10 March, NOT in January", async () => {
    const ctx = await published();
    expect(ids((await report(ctx, "type=assignments&classId=c1&" + WEEK)).perAssignment)).toEqual(["draft"]);
    expect(ids((await report(ctx, "type=assignments&classId=c1&" + JANUARY)).perAssignment)).toEqual([]);
    expect(ids((await report(ctx, "type=assignments&classId=c1&" + FEBRUARY)).perAssignment)).toEqual(["old"]);
    expect(ids((await report(ctx, "type=assignments&classId=c1")).perAssignment)).toEqual(["old", "draft"]);       // no period: everything
  });
  it("the same assessments in the class report, the student report and the hub overview", async () => {
    const ctx = await published();
    const cls = await report(ctx, "type=class&classId=c1&" + WEEK);
    expect(cls.kpis.assignments).toBe(1);
    expect(ids(cls.insights.assessments)).toEqual(["draft"]);
    expect((await report(ctx, "type=class&classId=c1&" + JANUARY)).kpis.assignments).toBe(0);
    const stu = await report(ctx, "type=student&studentId=s1&" + WEEK);
    expect(ids(stu.insights.assessments)).toEqual(["draft"]);
    expect(stu.academic.assessmentCount).toBe(1);
    expect((await report(ctx, "type=student&studentId=s1&" + JANUARY)).academic.assessmentCount).toBe(0);
    expect((await report(ctx, "type=overview&" + WEEK)).overview.totals.assessments).toBe(1);
    expect((await report(ctx, "type=overview&" + JANUARY)).overview.totals.assessments).toBe(0);
  });
  it("the date shown is the publication day, and the order is by it (an assessment published later comes later, whenever it was written)", async () => {
    const ctx = await published();
    const asgs = await report(ctx, "type=assignments&classId=c1");
    expect(asgs.perAssignment.map(r => [r.assignmentId, r.date])).toEqual([["old", "2026-02-01"], ["draft", "2026-03-10"]]);
    expect(asgs.matrix.map(m => m.assignmentId)).toEqual(["old", "draft"]);
    const cls = await report(ctx, "type=class&classId=c1");
    expect(cls.insights.assessments.map(p => [p.assignmentId, p.date])).toEqual([["old", "2026-02-01"], ["draft", "2026-03-10"]]);
    const stu = await report(ctx, "type=student&studentId=s1");
    expect(stu.insights.assessments.map(p => [p.assignmentId, p.date])).toEqual([["old", "2026-02-01"], ["draft", "2026-03-10"]]);
  });
  it("the hub's month-by-month trend puts the assessment in the month it was published", async () => {
    const ctx = await published();
    expect((await report(ctx, "type=overview")).overview.trend.map(t => [t.month, t.assessments])).toEqual([["2026-02", 1], ["2026-03", 1]]);
  });
  it("the figures of an assessment are what they were — only which period it belongs to changed", async () => {
    const ctx = await published();
    const row = (await report(ctx, "type=assignments&classId=c1&" + WEEK)).perAssignment[0];
    expect([row.students, row.submitted, row.missing, row.average, row.highest, row.lowest]).toEqual([2, 2, 0, 80, 90, 70]);
  });
  it("unpublished again and published again later: the reports still date it by its first publication", async () => {
    const ctx = await published();
    at(MAR_20);
    await ok(ctx, { action: "setstatus", assignmentId: "draft", status: "draft" });
    await ok(ctx, { action: "setstatus", assignmentId: "draft", status: "published" });
    expect(ids((await report(ctx, "type=assignments&classId=c1&" + WEEK)).perAssignment)).toEqual(["draft"]);
    expect(ids((await report(ctx, "type=assignments&classId=c1&from=2026-03-18&to=2026-03-24")).perAssignment)).toEqual([]);
  });
});

describe("R-6 C — older assessments keep their creation date, and the reply says so", () => {
  it("an assessment with no stamp is dated by its creation, exactly as before this phase", async () => {
    const ctx = world();
    const feb = await report(ctx, "type=assignments&classId=c1&from=2026-02-01&to=2026-02-28");
    expect(feb.perAssignment.map(r => [r.assignmentId, r.date])).toEqual([["old", "2026-02-01"]]);
    expect(ids((await report(ctx, "type=assignments&classId=c1&from=2026-03-01&to=2026-03-31")).perAssignment)).toEqual([]);
  });
  it("every assessment report names the criterion and how many of ITS assessments are dated by creation", async () => {
    const ctx = world();
    await ok(ctx, { action: "setstatus", assignmentId: "draft", status: "published" });
    const basis = (criterionCount) => ({ criterion: "publishedAt", byCreation: criterionCount });
    expect((await report(ctx, "type=assignments&classId=c1")).periodBasis).toEqual(basis(1));       // `old`
    expect((await report(ctx, "type=assignments&classId=c1&from=2026-03-08&to=2026-03-14")).periodBasis).toEqual(basis(0));
    expect((await report(ctx, "type=class&classId=c1")).periodBasis).toEqual(basis(1));
    expect((await report(ctx, "type=student&studentId=s1")).periodBasis).toEqual(basis(1));
    expect((await report(ctx, "type=overview")).overview.periodBasis).toEqual(basis(1));
    expect((await report(ctx, "type=class&classId=c1&from=2026-01-01&to=2026-01-31")).periodBasis).toEqual(basis(0));   // no assessment at all
  });
  it("a stamp that cannot be read as a date is no stamp: the assessment stays, dated by its creation, and is counted as such", async () => {
    for (const bad of ["not a date", "", 0, 20260310, null, {}, "2026-13-45"]) {
      const ctx = world({ [AP + "odd.json"]: asg("odd", "published", FEB_01, { publishedAt: bad }) });
      const feb = await report(ctx, "type=assignments&classId=c1&from=2026-02-01&to=2026-02-28");
      expect(ids(feb.perAssignment).sort(), JSON.stringify(bad)).toEqual(["odd", "old"]);
      expect(feb.perAssignment.every(r => r.date === "2026-02-01")).toBe(true);
      expect(feb.periodBasis).toEqual({ criterion: "publishedAt", byCreation: 2 });
    }
  });
  it("a draft is still never reportable, stamp or no stamp; an assessment archived after publication keeps its publication date", async () => {
    const ctx = world({ [AP + "ghost.json"]: asg("ghost", "draft", JAN_10, { publishedAt: MAR_10 }) });
    await ok(ctx, { action: "setstatus", assignmentId: "draft", status: "published" });
    await ok(ctx, { action: "delete", assignmentId: "draft" });
    const week = await report(ctx, "type=assignments&classId=c1&from=2026-03-08&to=2026-03-14");
    expect(ids(week.perAssignment)).toEqual(["draft"]);                                           // archived after being published: still in the record
    expect(ids((await report(ctx, "type=assignments&classId=c1")).perAssignment)).not.toContain("ghost");
  });
});

describe("R-6 D — access: the period basis is part of the academic part", () => {
  const SARA = "t_00112233445566aa";
  function setup({ widgets } = {}) {
    vi.useRealTimers();
    resetRevisionCache(); resetOperatorGateCache();
    const seed = school();
    for (const c of ["c1", "c2", "c3"]) seed[CP + c + ".json"].ownerId = SARA;
    const mem = createMemoryContainer(seed);
    const { revision } = buildRevision({ accountId: SARA, presetId: "full-teaching", presetVersion: 2, grants: [], createdBy: "owner:x", ...(widgets ? { resources: { widgets } } : {}) });
    mem.setJson(revisionName(revision.revisionId), revision);
    mem.setJson(teacherAccountName(SARA), { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: "full-teaching", version: 2 } });
    mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "enforce" });
    const token = recordedManagedToken(mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token;
    return { token, deps: { getContainer: () => mem.container, container: mem.container, nowMs: Date.parse(NOW), docCache: null } };
  }
  const get = (ctx, qs) => reports({ method: "GET", url: "https://x/api/reports?" + qs, headers: { get: k => (String(k).toLowerCase() === "x-builder-token" ? ctx.token : null) } }, ctx.deps);

  it("the academic part withheld: no period basis in the class or the student report, and none in the overview", async () => {
    const ctx = setup({ widgets: ["projects.evaluation", "grading.pending"] });
    const cls = await get(ctx, "type=class&classId=c1");
    expect([cls.status, cls.jsonBody.kpis, cls.jsonBody.periodBasis]).toEqual([200, null, null]);
    const stu = await get(ctx, "type=student&studentId=s01&classId=c1");
    expect([stu.status, stu.jsonBody.academic, stu.jsonBody.periodBasis]).toEqual([200, null, null]);
    const ov = await get(ctx, "type=overview");
    expect([ov.status, ov.jsonBody.overview]).toEqual([200, null]);
  });
  it("with the academic part: every assessment of this older data set is dated by its creation, and the reply counts them", async () => {
    const ctx = setup();
    const cls = await get(ctx, "type=class&classId=c1");
    expect(cls.status).toBe(200);
    expect(cls.jsonBody.periodBasis).toEqual({ criterion: "publishedAt", byCreation: cls.jsonBody.kpis.assignments });
    expect(cls.jsonBody.kpis.assignments).toBeGreaterThan(0);
  });
});
