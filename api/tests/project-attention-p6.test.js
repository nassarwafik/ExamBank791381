import { describe, it, expect } from "vitest";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { buildClassSnapshot } from "../src/lib/project-tracker/service.js";

// Phase P6 — the stages the STUDENTS marked as done (P2 self-reports) that the teacher has not confirmed yet are counted
// for the teacher, by the same exactness as the ready-for-review badge: only current members, only active stages of the
// class snapshot, only active classes. `projects-summary` reports them (and per-class figures) on request only
// (`include=attention`, the default body is unchanged); the class summary and each student card carry them only when
// there are any. Confirming a mark in bulk reports `readyChanged` so the badges refresh.
// Fail-first: run against ff61e730 (no attention figures, a bulk confirmation reported readyChanged: false).

const NOW = "2026-10-01T10:00:00.000Z";
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const ACTIVE = getProjectDefinition(CODE).stages.filter(s => s.active === true).sort((a, b) => a.order - b.order);
const [S1, S2, S3, S4] = ACTIVE.map(s => s.stageId);
const SELF = { status: "approved", approvedBy: "x", approvedAt: NOW, selfReportedAt: NOW, selfReportedBy: "x", selfReportedFrom: "not_started" };
const TEACHER = { status: "approved", approvedBy: "teacher-1", approvedAt: NOW };
const user = (id, cid, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id, ...extra });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: NOW, updatedAt: NOW, ...extra });
const progress = (sid, cid, stages) => ({ schemaVersion: 1, programCode: CODE, classId: cid, studentId: sid, startedAt: NOW, updatedAt: NOW, stages, history: [] });

// c1's own stage settings deactivate S4 (as «إعداد المراحل» does): a mark on it is never counted.
function c1Snapshot() {
  const snap = buildClassSnapshot(getProjectDefinition(CODE), "c1", NOW);
  return { ...snap, stages: snap.stages.map(s => (s.stageId === S4 ? { ...s, active: false } : s)) };
}

function setup(extra = {}) {
  const ctx = createMemoryContainer({
    [NS.configName("c1")]: c1Snapshot(),
    "platform/classes/c1.json": room("c1"), "platform/classes/c2.json": room("c2"), "platform/classes/c3.json": room("c3", { status: "archived", active: false }),
    "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"), "platform/users/s3.json": user("s3", "c1", { archived: true }),
    "platform/users/t1.json": user("t1", "c2"), "platform/users/a1.json": user("a1", "c3"),
    [NS.progressName("c1", "s1")]: progress("s1", "c1", { [S1]: SELF, [S2]: SELF, [S3]: { status: "ready_for_review" } }),
    [NS.progressName("c1", "s2")]: progress("s2", "c1", { [S1]: TEACHER, [S2]: SELF, [S4]: SELF, "GONE": SELF }),
    [NS.progressName("c1", "s3")]: progress("s3", "c1", { [S1]: SELF }),                     // archived student: never counted
    [NS.progressName("c2", "t1")]: progress("t1", "c2", { [S3]: { status: "ready_for_review" } }),
    [NS.progressName("c3", "a1")]: progress("a1", "c3", { [S1]: SELF }),                     // archived class: never counted
    ...extra
  });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const get = async query => (await tracker({ method: "GET", url: "https://x/api/project-tracker?" + query, json: async () => ({}) }, deps));
  const post = async body => (await tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, ...body }) }, deps));
  return { ctx, get, post };
}

describe("P6 projects-summary — the students' own marks, by the badge's exact rules", () => {
  it("include=attention adds totals, per project and per active class; members only, active stages only, archived classes excluded", async () => {
    const t = setup();
    const r = await t.get("resource=projects-summary&include=attention");
    expect(r.status).toBe(200);
    expect(r.jsonBody.totalReadyForReview).toBe(2);                                          // s1/S3 + t1/S3, as before
    expect(r.jsonBody.totalSelfReported).toBe(3);                                            // s1 ×2, s2 ×1 (not s3, not S4, not GONE, not c3)
    expect(r.jsonBody.selfReportedByProject[CODE]).toBe(3);
    expect(r.jsonBody.byClass[CODE]).toEqual({ c1: { ready: 1, selfReported: 3 }, c2: { ready: 1, selfReported: 0 } });
  });

  it("the default body is unchanged (no attention fields without the opt-in)", async () => {
    const t = setup();
    const r = await t.get("resource=projects-summary");
    expect(Object.keys(r.jsonBody).sort()).toEqual(["byProject", "ok", "totalReadyForReview"]);
    expect(r.jsonBody.totalReadyForReview).toBe(2);
  });

  it("a teacher confirmation removes the mark from the count; a student undo does too", async () => {
    const t = setup();
    const c = await t.post({ action: "progress.bulk", classId: "c1", status: "approved", items: [{ studentId: "s1", stageId: S1 }] });
    expect(c.jsonBody.totals.changed).toBe(1);
    expect(c.jsonBody.readyChanged).toBe(true);                                              // the badges must refresh
    expect((await t.get("resource=projects-summary&include=attention")).jsonBody.totalSelfReported).toBe(2);
    const back = await t.post({ action: "progress.bulk", classId: "c1", status: "in_progress", items: [{ studentId: "s2", stageId: S2 }] });
    expect(back.jsonBody.readyChanged).toBe(true);
    expect((await t.get("resource=projects-summary&include=attention")).jsonBody.byClass[CODE].c1).toEqual({ ready: 1, selfReported: 1 });
  });
});

describe("P6 class summary and student cards", () => {
  it("the class summary counts the marks and the students who made them", async () => {
    const t = setup();
    const r = await t.get("projectCode=" + CODE + "&classId=c1&resource=summary");
    expect(r.jsonBody.summary).toMatchObject({ studentsSelfReported: 2, totalSelfReportedStages: 3 });
  });

  it("each card carries selfReportedCount only when the student has unconfirmed marks", async () => {
    const t = setup();
    const cards = (await t.get("projectCode=" + CODE + "&classId=c1&resource=students")).jsonBody.students;
    const by = Object.fromEntries(cards.map(c => [c.studentId, c]));
    expect(by.s1.selfReportedCount).toBe(2);
    expect(by.s2.selfReportedCount).toBe(1);                                                 // S4 (deactivated) and "GONE" are ignored
    expect("selfReportedCount" in by.s1).toBe(true);
    const quiet = (await t.get("projectCode=" + CODE + "&classId=c2&resource=students")).jsonBody.students[0];
    expect("selfReportedCount" in quiet).toBe(false);
    const sum = (await t.get("projectCode=" + CODE + "&classId=c2&resource=summary")).jsonBody.summary;
    expect("studentsSelfReported" in sum || "totalSelfReportedStages" in sum).toBe(false);
  });
});
