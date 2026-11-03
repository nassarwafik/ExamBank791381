import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { school, NOW, SUB, instrument } from "./fixtures/analytics-school.js";

// Tadris+ P7-A1 — the teacher's dashboard serves a section only to a teacher who holds the capability behind it (blueprint §9.2).
// TEST data only. The first block is the FAIL-FIRST proof: on the baseline (before P7-A1) GET /api/teacher-today was gated only by
// classes.class.view, so a teacher on «التعلّم فقط» (no assignments, no messages, no projects) still received the assignment figures
// (pending grading, live attempts, recent submissions with marks), the unread-messages count and the project-evaluation block while
// the owner ENFORCES access; the analytics (reports.widget.view) and the reports carried the same assignment marks.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p7a1-dashboard-sections-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: today } = await import("../src/functions/teacher-today.js");
const { handler: analytics } = await import("../src/functions/teacher-analytics.js");
const { handler: analyticsAi } = await import("../src/functions/teacher-analytics-ai.js");
const { handler: reports } = await import("../src/functions/reports.js");
const { directPrefix, sequencedMessageId } = await import("../src/lib/message-store.js");
const { createUnreadMemo } = await import("../src/lib/message-unread-memo.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const SARA = "t_00112233445566aa";
const NOW_MS = Date.parse(NOW);

function setup({ mode = "enforce", preset = "learning-only", version = 1, grants = [] } = {}) {
  resetRevisionCache(); resetOperatorGateCache();
  const seed = school();
  for (const c of ["c1", "c2", "c3"]) seed["platform/classes/" + c + ".json"].ownerId = SARA;
  const mem = createMemoryContainer(seed);
  const { revision } = buildRevision({ accountId: SARA, presetId: preset, presetVersion: version, grants, createdBy: "owner:x" });
  mem.setJson(revisionName(revision.revisionId), revision);
  mem.setJson(teacherAccountName(SARA), { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: preset, version } });
  if (mode) mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  // one unread direct message from a student of c1
  const prefix = directPrefix("s01"), id = sequencedMessageId(prefix, 1);
  mem.setJson(prefix + id + ".json", { schemaVersion: 1, messageId: id, createdAt: NOW, kind: "direct", studentId: "s01", senderRole: "student", senderId: "s01", senderDisplayName: "طالب", body: "سؤال" });
  const token = createManagedTeacherToken({ accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token;
  const deps = { getContainer: () => mem.container, container: mem.container, nowMs: NOW_MS, unreadMemo: createUnreadMemo(), docCache: null };
  return { mem, deps, token };
}
const get = (ctx, path) => ({ method: "GET", url: "https://x" + path, headers: { get: k => (String(k).toLowerCase() === "x-builder-token" ? ctx.token : null) } });
const post = (ctx, body) => ({ method: "GET", url: "https://x/api/teacher-analytics-ai", json: async () => body, headers: { get: k => (String(k).toLowerCase() === "x-builder-token" ? ctx.token : null) } });
const todayOf = async ctx => (await today(get(ctx, "/api/teacher-today"), ctx.deps));

describe("P7-A1 fail-first — a learning-only teacher (enforce) receives no assignment, message or project data", () => {
  it("GET /api/teacher-today: no grading / attempts / deadlines / recent marks, no unread count, no project block", async () => {
    const r = await todayOf(setup());
    expect(r.status).toBe(200);
    const a = r.jsonBody.attention;
    expect(a.pendingReview).toEqual({ count: 0, assignments: 0, items: [] });
    expect(a.notStarted).toEqual({ count: 0, assignments: 0, items: [] });
    expect(a.activeAttempts).toEqual({ count: 0, items: [] });
    expect(r.jsonBody.recent).toEqual([]);
    expect(a.unreadMessages).toBeNull();
    expect(r.jsonBody.projectEvaluation).toBeUndefined();
    expect(r.jsonBody.scope.publishedAssignments).toBe(0);
  });

  it("GET /api/teacher-analytics: no submissions, marks, trends or topics", async () => {
    const ctx = setup();
    const r = await analytics(get(ctx, "/api/teacher-analytics"), ctx.deps);
    expect(r.status).toBe(200);
    expect(r.jsonBody.kpis.submissions).toBe(0);
    expect(r.jsonBody.kpis.average).toBeNull();
    expect(r.jsonBody.assignmentTrend).toEqual([]);
    expect(r.jsonBody.topicAnalytics).toEqual([]);
  });

  it("GET /api/reports?type=assignments is refused; ?type=class carries no assignment figures", async () => {
    const ctx = setup();
    const r = await reports(get(ctx, "/api/reports?type=assignments&classId=c1"), ctx.deps);
    expect([r.status, r.jsonBody.code]).toEqual([403, "CAPABILITY_DENIED"]);
    const c = await reports(get(ctx, "/api/reports?type=class&classId=c1"), ctx.deps);
    expect(c.status).toBe(200);
    expect(c.jsonBody.kpis).toBeNull();
  });
});

describe("P7-A1 — teacher-today serves each section with its capability", () => {
  it("full-teaching: every section, and `widgets` lists them", async () => {
    const r = await todayOf(setup({ preset: "full-teaching", version: 2 }));
    const a = r.jsonBody.attention;
    expect(a.pendingReview.count).toBeGreaterThan(0);
    expect(r.jsonBody.recent.length).toBeGreaterThan(0);
    expect(a.unreadMessages.total).toBe(1);
    expect(r.jsonBody.projectEvaluation).toBeTruthy();
    expect(r.jsonBody.widgets).toEqual(expect.arrayContaining(["grading.pending", "attempts.live", "assignments.notStarted", "assignments.deadlines", "results.unreleased", "activity.recent", "messages.unread", "projects.evaluation", "students.count"]));
  });

  it("learning-only: `widgets` names only the class / student figure; nothing withheld is listed in `partial`", async () => {
    const r = await todayOf(setup());
    expect(r.jsonBody.widgets).toEqual(["students.count"]);
    expect(r.jsonBody.partial).toEqual([]);
    expect(r.jsonBody.scope.activeClasses).toBeGreaterThan(0);
    expect(r.jsonBody.scope.students).toBeGreaterThan(0);
  });

  it("learning-only: the withheld sources are not even read (no assignment index, no submission folder, no message, no project read)", async () => {
    const ctx = setup();
    const st = instrument(ctx.mem);
    let unread = 0, projects = 0;
    ctx.deps.teacherDirectUnread = async () => { unread++; return { totalUnread: 9, capped: false }; };
    ctx.deps.loadProjectEvaluationSources = async () => { projects++; return []; };
    await todayOf(ctx);
    expect([unread, projects]).toEqual([0, 0]);
    expect(st.subLists()).toEqual([]);
    expect(st.subs()).toEqual([]);
    expect(st.downloads.filter(n => n.startsWith("platform/assignments/") || n.startsWith("platform/class-assignments/"))).toEqual([]);
  });

  it("learning-ready-assignments: assignments and messages, no projects", async () => {
    const r = await todayOf(setup({ preset: "learning-ready-assignments" }));
    expect(r.jsonBody.attention.pendingReview.count).toBeGreaterThan(0);
    expect(r.jsonBody.attention.unreadMessages.total).toBe(1);
    expect(r.jsonBody.projectEvaluation).toBeUndefined();
    expect(r.jsonBody.widgets).toContain("messages.unread");
    expect(r.jsonBody.widgets).not.toContain("projects.evaluation");
  });

  it("a single grant opens its section only (learning-only + messages.inbox.read → the unread count, still no assignments)", async () => {
    const r = await todayOf(setup({ grants: ["messages.inbox.read"] }));
    expect(r.jsonBody.attention.unreadMessages.total).toBe(1);
    expect(r.jsonBody.attention.pendingReview.count).toBe(0);
    expect(r.jsonBody.widgets).toEqual(["students.count", "messages.unread"]);
  });

  it("observe / legacy mode: nothing is narrowed yet (exactly like the capabilities themselves)", async () => {
    for (const mode of ["observe", "legacy"]) {
      const r = await todayOf(setup({ mode }));
      expect(r.jsonBody.attention.pendingReview.count).toBeGreaterThan(0);
      expect(r.jsonBody.attention.unreadMessages.total).toBe(1);
      expect(r.jsonBody.widgets).toContain("grading.pending");
    }
  });

  it("enforce, but the teacher's revision cannot be read → 503 (fail closed), never a narrowed or a full answer", async () => {
    const ctx = setup();
    const acc = ctx.mem.getJson(teacherAccountName(SARA));
    ctx.mem.setJson(teacherAccountName(SARA), { ...acc, accessRevisionId: "rev_missing_00000000000000" });
    resetRevisionCache();
    const r = await todayOf(ctx);
    expect(r.status).toBe(503);
    expect(r.jsonBody.attention).toBeUndefined();
  });
});

describe("P7-A1 — analytics, AI analysis and reports", () => {
  it("analytics, learning-only: no assignment or submission document is read; the class / student figures stay", async () => {
    const ctx = setup();
    const st = instrument(ctx.mem);
    const r = await analytics(get(ctx, "/api/teacher-analytics"), ctx.deps);
    expect(st.lists.filter(p => p.startsWith("platform/assignments/") || p.startsWith(SUB))).toEqual([]);
    expect(st.subs()).toEqual([]);
    expect(r.jsonBody.kpis.activeClasses).toBeGreaterThan(0);
    expect(r.jsonBody.kpis.activeStudents).toBeGreaterThan(0);
    expect(r.jsonBody.kpis.pendingReview).toBe(0);
    expect(r.jsonBody.gradeDistribution.every(b => b.count === 0)).toBe(true);
    expect(r.jsonBody.classComparison).toEqual([]);
    expect(r.jsonBody.widgets).not.toContain("scores.overview");
    expect(JSON.stringify(r.jsonBody.insights)).not.toMatch(/واجب|تسليم|مراجعة/);
  });

  it("analytics, full-teaching: unchanged figures, and `widgets` lists every analytics widget", async () => {
    const ctx = setup({ preset: "full-teaching", version: 2 });
    const r = await analytics(get(ctx, "/api/teacher-analytics"), ctx.deps);
    expect(r.jsonBody.kpis.submissions).toBeGreaterThan(0);
    expect(r.jsonBody.assignmentTrend.length).toBeGreaterThan(0);
    expect(r.jsonBody.widgets).toEqual(expect.arrayContaining(["scores.overview", "scores.trend", "classes.comparison", "topics.performance", "students.followUp", "students.improvers", "insights"]));
  });

  it("AI analysis with reports.ai.use but no assignments.assignment.view → 403, and the model is never called", async () => {
    const ctx = setup({ grants: ["reports.ai.use"] });
    let calls = 0;
    ctx.deps.createAiClient = async () => ({ chat: { completions: { create: async () => { calls++; return { choices: [{ message: { content: "x" } }] }; } } } });
    const r = await analyticsAi(post(ctx, {}), ctx.deps);
    expect([r.status, r.jsonBody.code, r.jsonBody.capability]).toEqual([403, "CAPABILITY_DENIED", "assignments.assignment.view"]);
    expect(calls).toBe(0);
  });

  it("reports, learning-only: student report without the academic block; project reports refused; filters list no project", async () => {
    const ctx = setup();
    const s = await reports(get(ctx, "/api/reports?type=student&studentId=s01"), ctx.deps);
    expect(s.status).toBe(200);
    expect(s.jsonBody.academic).toBeNull();
    expect(s.jsonBody.projects).toEqual([]);
    expect(s.jsonBody.withheld).toEqual(["academic", "projects"]);
    const p = await reports(get(ctx, "/api/reports?type=project&classId=c1&projectCode=x"), ctx.deps);
    expect([p.status, p.jsonBody.code, p.jsonBody.capability]).toEqual([403, "CAPABILITY_DENIED", "projects.tracker.view"]);
    const f = await reports(get(ctx, "/api/reports?type=filters"), ctx.deps);
    expect(f.status).toBe(200);
    expect(f.jsonBody.projects).toEqual([]);
    expect(f.jsonBody.classes.length).toBeGreaterThan(0);
  });

  it("reports, full-teaching: the class report keeps its assignment figures", async () => {
    const ctx = setup({ preset: "full-teaching", version: 2 });
    const c = await reports(get(ctx, "/api/reports?type=class&classId=c1"), ctx.deps);
    expect(c.status).toBe(200);
    expect(c.jsonBody.kpis.assignments).toBeGreaterThan(0);
    expect(c.jsonBody.withheld).toEqual([]);
  });
});
