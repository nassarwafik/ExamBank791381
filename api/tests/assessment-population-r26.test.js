import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { handler as reportsHandler } from "../src/functions/reports.js";
import { handler as studentHandler } from "../src/functions/manage-students.js";
import { isReportableAssessment, normalizeAssignmentStatus, applyAssignmentArchive } from "../src/lib/assignment-lifecycle.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Roadmap #26 — Canonical Assessment Population for Reports & Student Profile.
//
// "Which assessments belong to a class's academic record?" was answered three ways: the reports center used
// `status !== "draft"` (so a DRAFT that was archived — the archive-first "delete" since Roadmap #7 — counted as an
// assessment nobody submitted), the teacher's student profile counted EVERY assignment of the class including
// plain drafts (so each draft the teacher was preparing showed as "لم تُحل" for every student), and analytics /
// the student dashboard used `published` only. These tests drive the REAL reports and manage-students handlers
// over the in-memory container and pin the ONE predicate (isReportableAssessment: published, or archived after
// being published; legacy archived without metadata kept) on both surfaces, plus the unchanged "published only"
// semantics of the student-facing / analytics surfaces.

const CP = "platform/classes/", UP = "platform/users/", AP = "platform/assignments/", SP = "platform/submissions/";
const T0 = "2026-03-01T10:00:00.000Z";
const AUTH_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const deps = ctx => ({ ...AUTH_OK, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} });
const report = (ctx, qs) => reportsHandler({ method: "GET", url: "https://x/api/reports?" + qs, json: async () => ({}) }, deps(ctx));
const profile = (ctx, userId) => studentHandler({ method: "GET", url: "https://x/api/students?profileUserId=" + userId, json: async () => ({}) }, deps(ctx));
const stu = (userId, classId, over = {}) => ({ userId, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "طالب " + userId, firstName: "ط", familyName: userId, code: "1", identityNumber: "1", ...over });
const asg = (assignmentId, over = {}) => ({ assignmentId, classId: "c1", status: "published", title: "واجب " + assignmentId, createdAt: T0, dueAt: T0, maxAttempts: 1, totalMarks: 10, examSnapshot: { questions: [] }, ...over });
const final = { attemptNumber: 1, submittedAt: T0, score: 8, totalMarks: 10, percentage: 80, manualReviewMarks: 0, finalized: true };
const sub = (assignmentId, studentId, attempt = final) => ({ assignmentId, studentId, classId: "c1", attempts: [attempt], activeAttempt: null });

// Class c1 with s1, s2. Assessments:
//   aPub        published                              — s1 submitted
//   aArchPub    archived, archivedFromStatus:published — s2 submitted            (reportable: history)
//   aLegacyArch archived, NO archivedFromStatus        — s1 submitted            (reportable: legacy, unchanged)
//   aArchDraft  archived, archivedFromStatus:draft     — nobody could submit      (NOT reportable)
//   aDraft      draft                                  — nobody could submit      (NOT reportable)
// Reportable = 3 → cells = 3 assessments × 2 students = 6, submitted cells = 3 → 50 %.
function seed() {
  return createMemoryContainer({
    [CP + "c1.json"]: { classId: "c1", name: "صف أ", active: true, status: "active", studentIds: ["s1", "s2"], schoolYear: "2025-2026" },
    [UP + "s1.json"]: stu("s1", "c1"), [UP + "s2.json"]: stu("s2", "c1"),
    [AP + "aPub.json"]: asg("aPub"),
    [AP + "aArchPub.json"]: asg("aArchPub", { status: "archived", archivedFromStatus: "published", archivedAt: T0 }),
    [AP + "aLegacyArch.json"]: asg("aLegacyArch", { status: "archived" }),
    [AP + "aArchDraft.json"]: asg("aArchDraft", { status: "archived", archivedFromStatus: "draft", archivedAt: T0 }),
    [AP + "aDraft.json"]: asg("aDraft", { status: "draft" }),
    [SP + "aPub/s1.json"]: sub("aPub", "s1"),
    [SP + "aArchPub/s2.json"]: sub("aArchPub", "s2"),
    [SP + "aLegacyArch/s1.json"]: sub("aLegacyArch", "s1")
  });
}
const REPORTABLE = ["aArchPub", "aLegacyArch", "aPub"];

describe("R26 A — the ONE reportable-assessment predicate", () => {
  it("published → reportable; archived-from-published → reportable; archived-from-draft → NOT; draft → NOT; legacy archived (no metadata) → reportable (unchanged)", () => {
    expect(isReportableAssessment({ status: "published" })).toBe(true);
    expect(isReportableAssessment({ status: "archived", archivedFromStatus: "published" })).toBe(true);
    expect(isReportableAssessment({ status: "archived", archivedFromStatus: "draft" })).toBe(false);
    expect(isReportableAssessment({ status: "draft" })).toBe(false);
    expect(isReportableAssessment({})).toBe(false);                                      // unknown status normalizes to draft
    expect(isReportableAssessment({ status: "archived" })).toBe(true);                   // legacy, kept
  });
  it("is consistent with the real archive helper: archiving a draft yields a non-reportable record, archiving a published one keeps it reportable", () => {
    const now = "2026-04-01T00:00:00.000Z";
    expect(isReportableAssessment(applyAssignmentArchive({ status: "draft" }, { actor: "t", now }))).toBe(false);
    expect(isReportableAssessment(applyAssignmentArchive({ status: "published" }, { actor: "t", now }))).toBe(true);
    expect(normalizeAssignmentStatus(applyAssignmentArchive({ status: "published" }, { actor: "t", now }))).toBe("archived");
  });
});

describe("R26 B — reports center uses the canonical population (real handler)", () => {
  it("B1 class report: assessment count and submission rate exclude drafts and archived drafts", async () => {
    const r = await report(seed(), "type=class&classId=c1");
    expect(r.status).toBe(200);
    expect(r.jsonBody.kpis.assignments).toBe(3);            // pre-R26: 4 (archived draft counted)
    expect(r.jsonBody.kpis.submissionRate).toBe(50);        // pre-R26: 3/8 → 38
    expect(r.jsonBody.kpis.averageScore).toBe(80);
  });
  it("B2 assignments report: per-assignment rows and the matrix contain only reportable assessments", async () => {
    const r = await report(seed(), "type=assignments&classId=c1");
    expect(r.status).toBe(200);
    expect(r.jsonBody.perAssignment.map(a => a.assignmentId).sort()).toEqual(REPORTABLE);
    expect(r.jsonBody.matrix.map(m => m.assignmentId).sort()).toEqual(REPORTABLE);
    expect(r.jsonBody.overall).toMatchObject({ assessmentCount: 3, participants: 3, submissionRate: 50 });
    const archDraftRow = r.jsonBody.perAssignment.find(a => a.assignmentId === "aArchDraft");
    expect(archDraftRow).toBeUndefined();                    // pre-R26: a row with 2 "missing" students
  });
  it("B3 student report: assessmentCount / submissionRate use the same population", async () => {
    const r = await report(seed(), "type=student&studentId=s1");
    expect(r.status).toBe(200);
    expect(r.jsonBody.academic).toMatchObject({ assessmentCount: 3, submittedCount: 2, submissionRate: 67, average: 80 });
    const r2 = await report(seed(), "type=student&studentId=s2");
    expect(r2.jsonBody.academic).toMatchObject({ assessmentCount: 3, submittedCount: 1, submissionRate: 33 });
  });
  it("B4 archived-after-published results are NOT hidden (history preserved), and a date range still applies", async () => {
    const r = await report(seed(), "type=assignments&classId=c1&from=2026-01-01&to=2026-12-31");
    expect(r.jsonBody.perAssignment.find(a => a.assignmentId === "aArchPub")).toMatchObject({ submitted: 1, missing: 1 });
    const none = await report(seed(), "type=assignments&classId=c1&from=2027-01-01");
    expect(none.jsonBody.overall.assessmentCount).toBe(0);
  });
  it("B5 unauthenticated → 401 (builder auth unchanged)", async () => {
    const ctx = seed();
    const r = await reportsHandler({ method: "GET", url: "https://x/api/reports?type=class&classId=c1" }, { container: ctx.container, requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) });
    expect(r.status).toBe(401);
  });
});

describe("R26 C — teacher student profile uses the canonical population (real handler)", () => {
  it("C1 stats.assigned / pending exclude drafts and archived drafts; archived-after-published stays in the record", async () => {
    const r = await profile(seed(), "s1");
    expect(r.status).toBe(200);
    expect(r.jsonBody.profile.stats).toMatchObject({ assigned: 3, completed: 2, pending: 1, average: 80 });   // pre-R26: assigned 5, pending 3
    expect(r.jsonBody.profile.assignments.map(a => a.assignmentId).sort()).toEqual(REPORTABLE);
    expect(r.jsonBody.profile.assignments.find(a => a.assignmentId === "aArchPub")).toMatchObject({ status: "archived", gradingStatus: "notSubmitted" });
  });
  it("C2 a plain draft the teacher is preparing never appears as 'لم تُحل' for a student", async () => {
    const ctx = createMemoryContainer({
      [CP + "c1.json"]: { classId: "c1", name: "صف أ", active: true, studentIds: ["s1"] },
      [UP + "s1.json"]: stu("s1", "c1"),
      [AP + "aPub.json"]: asg("aPub"), [AP + "aDraft.json"]: asg("aDraft", { status: "draft" }),
      [SP + "aPub/s1.json"]: sub("aPub", "s1")
    });
    const r = await profile(ctx, "s1");
    expect(r.jsonBody.profile.stats).toMatchObject({ assigned: 1, completed: 1, pending: 0 });
  });
  it("C3 the cross-class submitted history is submission-based and unchanged (a real submission is never hidden)", async () => {
    const r = await profile(seed(), "s1");
    expect(r.jsonBody.profile.submittedAssignmentsCount).toBe(2);
    expect(r.jsonBody.profile.submittedAssignments.map(a => a.assignmentId).sort()).toEqual(["aLegacyArch", "aPub"]);
  });
});

describe("R26 D — 'takeable now' surfaces intentionally keep published-only (regression boundary)", () => {
  it("student dashboard, student assignment/submission gates and teacher analytics still filter on published (source guards)", () => {
    const read = f => readFileSync(new URL("../src/functions/" + f, import.meta.url), "utf8");
    expect(read("student-dashboard.js")).toMatch(/status==="published"/);
    expect(read("student-assignment.js")).toMatch(/status!=="published"/);
    // Roadmap #34: teacher analytics states "published" through the canonical assignment-lifecycle helper (same
    // takeable-now boundary, authority-aligned) — and still never through the history predicate.
    const analyticsCore = readFileSync(new URL("../src/lib/teacher-analytics-core.js", import.meta.url), "utf8");
    expect(analyticsCore).toMatch(/normalizeAssignmentStatus\(item\) === "published"/);
    expect(analyticsCore).not.toMatch(/isReportableAssessment/);
    // reports + profile are the ONLY consumers of the history predicate; no second interpretation remains.
    expect(read("reports.js")).toMatch(/isReportableAssessment\(a\)/);
    expect(read("reports.js")).not.toMatch(/status !== "draft"/);
    expect(read("manage-students.js")).toMatch(/isReportableAssessment\(assignment\)/);
  });
});
