import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { recordedManagedToken } from "./fixtures/managed-session.js";
import { school, NOW, SUB, instrument } from "./fixtures/analytics-school.js";

// Tadris+ P7-A2 — the owner chooses the dashboard widgets of ONE teacher (`resources.widgets` of the access revision; absent = every
// widget, the courses rule) and the teacher arranges the «اليوم» cards (teacher-profile `appearance.dashboardLayout`). The choice is
// applied with the capabilities (enforce only) and is a data boundary, not a hiding (blueprint §9.2, acceptance test 7): a widget
// left out is not sent by «اليوم», the analytics, the AI analysis or the reports. TEST data only.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p7a2-dashboard-widgets-root-secret";
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
const { handler: profile } = await import("../src/functions/teacher-profile.js");
const { handler: ownerAccess } = await import("../src/functions/owner-access.js");
const { directPrefix, sequencedMessageId } = await import("../src/lib/message-store.js");
const { createUnreadMemo } = await import("../src/lib/message-unread-memo.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName, evaluateRevision } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { WIDGETS } = await import("../src/lib/dashboard-widgets.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const SARA = "t_00112233445566aa";
const NOW_MS = Date.parse(NOW);

function setup({ mode = "enforce", preset = "full-teaching", version = 2, widgets, denies = [] } = {}) {
  resetRevisionCache(); resetOperatorGateCache();
  const seed = school();
  for (const c of ["c1", "c2", "c3"]) seed["platform/classes/" + c + ".json"].ownerId = SARA;
  const mem = createMemoryContainer(seed);
  const { revision } = buildRevision({ accountId: SARA, presetId: preset, presetVersion: version, denies, createdBy: "owner:x", ...(widgets ? { resources: { widgets } } : {}) });
  mem.setJson(revisionName(revision.revisionId), revision);
  mem.setJson(teacherAccountName(SARA), { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: preset, version } });
  if (mode) mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  const prefix = directPrefix("s01"), id = sequencedMessageId(prefix, 1);
  mem.setJson(prefix + id + ".json", { schemaVersion: 1, messageId: id, createdAt: NOW, kind: "direct", studentId: "s01", senderRole: "student", senderId: "s01", senderDisplayName: "طالب", body: "سؤال" });
  const token = recordedManagedToken(mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }).token;
  return { mem, token, deps: { getContainer: () => mem.container, container: mem.container, nowMs: NOW_MS, unreadMemo: createUnreadMemo(), docCache: null } };
}
const hdr = ctx => ({ get: k => (String(k).toLowerCase() === "x-builder-token" ? ctx.token : null) });
const get = (ctx, path) => ({ method: "GET", url: "https://x" + path, headers: hdr(ctx) });
const post = (ctx, path, body) => ({ method: "POST", url: "https://x" + path, json: async () => body, headers: hdr(ctx) });

describe("P7-A2 — the revision's widget entitlement", () => {
  const base = { accountId: SARA, presetId: "full-teaching", presetVersion: 2, createdBy: "owner:x" };
  it("known widget ids only, no duplicates; absent = every widget; kept by buildRevision with the courses", () => {
    expect(evaluateRevision(buildRevision({ ...base, resources: { widgets: ["insights", "grading.pending"] } }).revision).widgets).toEqual(["grading.pending", "insights"]);
    expect(evaluateRevision(buildRevision(base).revision).widgets).toBeNull();
    expect(() => buildRevision({ ...base, resources: { widgets: ["nope"] } })).toThrow(/WIDGET_UNKNOWN/);
    expect(() => buildRevision({ ...base, resources: { widgets: ["insights", "insights"] } })).toThrow(/WIDGET_DUPLICATE/);
    expect(() => buildRevision({ ...base, resources: { widgets: "insights" } })).toThrow(/REVISION_MALFORMED/);
    expect(() => buildRevision({ ...base, resources: { widgets: [], projects: [] } })).toThrow(/RESOURCES_NOT_SUPPORTED/);   // P7-B2: `games` is a known key now
    expect(buildRevision({ ...base, resources: { courses: ["791381"], widgets: [] } }).revision.resources).toEqual({ courses: ["791381"], widgets: [] });
  });
  it("a stored revision with an unknown widget is not trusted (fail closed: 503 on the dashboard)", async () => {
    const ctx = setup();
    const acc = ctx.mem.getJson(teacherAccountName(SARA));
    const rev = ctx.mem.getJson(revisionName(acc.accessRevisionId));
    ctx.mem.setJson(revisionName(acc.accessRevisionId), { ...rev, resources: { widgets: ["gone.widget"] } });
    resetRevisionCache();
    expect((await today(get(ctx, "/api/teacher-today"), ctx.deps)).status).toBe(503);
  });
});

describe("P7-A2 — «اليوم» sends only the chosen widgets", () => {
  it("grading + messages only: pending grading and the unread count; every other assignment block empty; no project block", async () => {
    const ctx = setup({ widgets: ["grading.pending", "messages.unread"] });
    const r = (await today(get(ctx, "/api/teacher-today"), ctx.deps)).jsonBody;
    expect(r.widgets).toEqual(["grading.pending", "messages.unread"]);
    expect(r.attention.pendingReview.count).toBeGreaterThan(0);
    expect(r.attention.unreadMessages.total).toBe(1);
    expect(r.attention.notStarted).toEqual({ count: 0, assignments: 0, items: [] });
    expect(r.attention.activeAttempts).toEqual({ count: 0, items: [] });
    expect(r.attention.dueSoon).toEqual({ count: 0, items: [] });
    expect(r.recent).toEqual([]);
    expect(r.projectEvaluation).toBeUndefined();
  });
  it("no assignment widget chosen: the assignment sources are not read at all, even with the capability", async () => {
    const ctx = setup({ widgets: ["messages.unread", "students.count"] });
    const st = instrument(ctx.mem);
    await today(get(ctx, "/api/teacher-today"), ctx.deps);
    expect(st.subLists()).toEqual([]);
    expect(st.downloads.filter(n => n.startsWith("platform/assignments/") || n.startsWith("platform/class-assignments/"))).toEqual([]);
  });
  it("an empty choice: nothing but the page itself; observe / legacy mode: every widget (the choice applies with enforcement)", async () => {
    const empty = setup({ widgets: [] });   // one platform: its token is recorded in its own account (P10-A)
    expect((await today(get(empty, "/api/teacher-today"), empty.deps)).jsonBody.widgets).toEqual([]);
    for (const mode of ["observe", "legacy"]) {
      const ctx = setup({ mode, widgets: ["grading.pending"] });
      expect((await today(get(ctx, "/api/teacher-today"), ctx.deps)).jsonBody.widgets).toContain("messages.unread");
    }
  });
  it("the choice never widens the capabilities: learning-only + every widget id still gets no assignment widget", async () => {
    const ctx = setup({ preset: "learning-only", version: 1, widgets: WIDGETS.map(w => w.id) });
    expect((await today(get(ctx, "/api/teacher-today"), ctx.deps)).jsonBody.widgets).toEqual(["students.count"]);
  });
});

describe("P7-A2 — analytics, AI analysis and reports follow the choice", () => {
  it("topics only: the topics; no trend, overview, comparison, improvers, follow-up or insights", async () => {
    const ctx = setup({ widgets: ["topics.performance"] });
    const r = (await analytics(get(ctx, "/api/teacher-analytics"), ctx.deps)).jsonBody;
    expect(r.widgets).toEqual(["topics.performance"]);
    expect(r.topicAnalytics.length).toBeGreaterThan(0);
    expect(r.assignmentTrend).toEqual([]);
    expect([r.kpis.submissions, r.kpis.average, r.kpis.pendingReview, r.kpis.performanceChange, r.kpis.followUpStudents]).toEqual([0, null, 0, 0, 0]);
    expect(r.submissionStatus).toEqual({ submitted: 0, missing: 0, pendingReview: 0, late: 0 });
    expect(r.gradeDistribution.every(b => b.count === 0)).toBe(true);
    expect([r.classComparison, r.topImprovers, r.followUp, r.insights]).toEqual([[], [], [], []]);
    expect(r.kpis.activeStudents).toBeGreaterThan(0);
  });
  it("insights alone never quote a hidden section (no topic, trend, follow-up or submission figure)", async () => {
    const full = setup();
    const all = (await analytics(get(full, "/api/teacher-analytics"), full.deps)).jsonBody.insights.map(i => i.title);
    expect(all.join("|")).toMatch(/موضوع|مراجعة|تسليمات|متابعة|أداء/);
    const ctx = setup({ widgets: ["insights"] });
    const r = (await analytics(get(ctx, "/api/teacher-analytics"), ctx.deps)).jsonBody;
    expect(r.insights.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.insights)).not.toMatch(/جبر|هندسة|مراجعة|تسليم|يحتاجون متابعة|متوسط الأداء/);
  });
  it("the assignments ARE read (for «ملخص العلامات») but the topics are hidden: no insight names a topic", async () => {
    const full = setup();
    expect(JSON.stringify((await analytics(get(full, "/api/teacher-analytics"), full.deps)).jsonBody.insights)).toMatch(/جبر|هندسة/);   // the fixture does produce a topic insight
    const ctx = setup({ widgets: ["scores.overview", "insights"] });
    const r = (await analytics(get(ctx, "/api/teacher-analytics"), ctx.deps)).jsonBody;
    expect(r.kpis.submissions).toBeGreaterThan(0);
    expect(r.insights.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.insights)).not.toMatch(/جبر|هندسة/);
  });
  it("follow-up / insights only: no assignment document or submission is read", async () => {
    const ctx = setup({ widgets: ["students.followUp", "insights"] });
    const st = instrument(ctx.mem);
    await analytics(get(ctx, "/api/teacher-analytics"), ctx.deps);
    expect(st.lists.filter(p => p.startsWith("platform/assignments/") || p.startsWith(SUB))).toEqual([]);
  });
  it("AI analysis without «ملخص العلامات» → 403 WIDGET_NOT_AVAILABLE, the model is never called", async () => {
    const ctx = setup({ widgets: ["topics.performance", "insights"] });
    let calls = 0;
    ctx.deps.createAiClient = async () => ({ chat: { completions: { create: async () => { calls++; return { choices: [{ message: { content: "x" } }] }; } } } });
    const r = await analyticsAi({ ...post(ctx, "/api/teacher-analytics-ai", {}) }, ctx.deps);
    expect([r.status, r.jsonBody.code, r.jsonBody.widget]).toEqual([403, "WIDGET_NOT_AVAILABLE", "scores.overview"]);
    expect(calls).toBe(0);
  });
  it("AI analysis with «ملخص العلامات» but not the topics: the prompt holds no topic", async () => {
    const ctx = setup({ widgets: ["scores.overview"] });
    let prompt = "";
    ctx.deps.createAiClient = async () => ({ chat: { completions: { create: async req => { prompt = req.messages.map(m => m.content).join("\n"); return { choices: [{ message: { content: "نصيحة" } }] }; } } } });
    const r = await analyticsAi(post(ctx, "/api/teacher-analytics-ai", {}), ctx.deps);
    expect(r.status).toBe(200);
    expect(prompt).not.toMatch(/جبر|هندسة/);
  });
  it("reports: without «ملخص العلامات» the academic part is withheld and the assessments report refused; without «تقييم المشاريع» the project reports", async () => {
    const ctx = setup({ widgets: ["grading.pending", "insights"] });
    const a = await reports(get(ctx, "/api/reports?type=assignments&classId=c1"), ctx.deps);
    expect([a.status, a.jsonBody.code, a.jsonBody.widget]).toEqual([403, "WIDGET_NOT_AVAILABLE", "scores.overview"]);
    const c = await reports(get(ctx, "/api/reports?type=class&classId=c1"), ctx.deps);
    expect([c.status, c.jsonBody.kpis, c.jsonBody.withheld]).toEqual([200, null, ["academic", "projects"]]);
    const p = await reports(get(ctx, "/api/reports?type=project&classId=c1&projectCode=x"), ctx.deps);
    expect([p.status, p.jsonBody.code, p.jsonBody.widget]).toEqual([403, "WIDGET_NOT_AVAILABLE", "projects.evaluation"]);
    const ok = setup({ widgets: ["scores.overview"] });
    expect((await reports(get(ok, "/api/reports?type=assignments&classId=c1"), ok.deps)).status).toBe(200);
  });
});

describe("P7-A2 — the teacher's arrangement of the «اليوم» cards", () => {
  const layout = { order: ["messages.unread", "grading.pending"], hidden: ["activity.recent"] };
  it("saved, read back, and audited; GET says whether it can be changed", async () => {
    const ctx = setup();
    expect((await profile(get(ctx, "/api/teacher-profile"), ctx.deps)).jsonBody).toMatchObject({ dashboardLayout: null, layoutChoosable: true });
    const r = await profile(post(ctx, "/api/teacher-profile", { action: "setDashboardLayout", layout }), ctx.deps);
    expect([r.status, r.jsonBody.dashboardLayout]).toEqual([200, layout]);
    expect((await profile(get(ctx, "/api/teacher-profile"), ctx.deps)).jsonBody.dashboardLayout).toEqual(layout);
  });
  it("refused: an unknown or analytics widget id, a duplicate, a malformed body", async () => {
    const ctx = setup();
    for (const bad of [{ order: ["nope"] }, { order: ["insights"] }, { order: ["grading.pending", "grading.pending"] }, { hidden: "x" }, null]) {
      const r = await profile(post(ctx, "/api/teacher-profile", { action: "setDashboardLayout", layout: bad }), ctx.deps);
      expect([r.status, r.jsonBody.code]).toEqual([400, "LAYOUT_INVALID"]);
    }
  });
  it("without appearance.layout.choose (enforce) → 403 and nothing stored; GET says it cannot be changed", async () => {
    const ctx = setup({ denies: ["appearance.layout.choose"] });
    const r = await profile(post(ctx, "/api/teacher-profile", { action: "setDashboardLayout", layout }), ctx.deps);
    expect([r.status, r.jsonBody.code]).toEqual([403, "CAPABILITY_DENIED"]);
    expect((await profile(get(ctx, "/api/teacher-profile"), ctx.deps)).jsonBody).toMatchObject({ dashboardLayout: null, layoutChoosable: false });
  });
  it("the arrangement never widens what is served (a hidden card stays a presentation choice; a withheld widget stays withheld)", async () => {
    const ctx = setup({ widgets: ["messages.unread"] });
    await profile(post(ctx, "/api/teacher-profile", { action: "setDashboardLayout", layout }), ctx.deps);
    const r = (await today(get(ctx, "/api/teacher-today"), ctx.deps)).jsonBody;
    expect(r.widgets).toEqual(["messages.unread"]);
    expect(r.attention.pendingReview.count).toBe(0);
  });
});

describe("P7-A2 — the owner's API carries the widgets", () => {
  const OWNER = "own_0011223344556677";
  function withOwner(ctx) {
    const now = Date.now();
    ctx.mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER, completedAtMs: now });
    ctx.mem.setJson(ownerAccountName(OWNER), { schemaVersion: 1, accountId: OWNER, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
    const sid = "c".repeat(32);
    ctx.mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now });
    return { "x-owner-token": createOwnerToken({ accountId: OWNER, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  const oa = (ctx, h, method, action, body = {}, query = null) => ownerAccess({ method, params: { action }, ...(query ? { query: new URLSearchParams(query) } : {}), headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body }, ctx.deps);

  it("the catalog lists every widget; assign validates and stores them; effective, history and rollback follow; the courses stay", async () => {
    const ctx = setup();
    const owner = withOwner(ctx);
    expect((await oa(ctx, owner, "GET", "")).jsonBody.widgets.map(w => w.id)).toEqual(WIDGETS.map(w => w.id));
    const acc = () => ctx.mem.getJson(teacherAccountName(SARA));
    const assign = body => oa(ctx, owner, "POST", "assign", { accountId: SARA, presetId: "full-teaching", presetVersion: 2, baseRevisionId: acc().accessRevisionId, ...body });
    expect((await assign({ widgets: ["nope"] })).jsonBody.code).toBe("WIDGET_UNKNOWN");
    expect((await assign({ widgets: ["insights", "insights"] })).jsonBody.code).toBe("WIDGET_DUPLICATE");
    const first = acc().accessRevisionId;
    const r = await assign({ widgets: ["insights"], courses: ["791381"] });
    expect([r.status, r.jsonBody.widgets, r.jsonBody.courses]).toEqual([200, ["insights"], ["791381"]]);
    expect(ctx.mem.getJson(revisionName(r.jsonBody.access.revisionId)).resources).toEqual({ courses: ["791381"], widgets: ["insights"] });
    expect((await oa(ctx, owner, "GET", "effective", {}, { accountId: SARA })).jsonBody.access.widgets).toEqual(["insights"]);
    expect((await today(get(ctx, "/api/teacher-today"), ctx.deps)).jsonBody.widgets).toEqual([]);
    expect((await oa(ctx, owner, "GET", "history", {}, { accountId: SARA })).jsonBody.entries.map(e => e.widgets)).toEqual([["insights"], null]);
    const back = await oa(ctx, owner, "POST", "rollback", { accountId: SARA, revisionId: first, baseRevisionId: r.jsonBody.access.revisionId });
    expect([back.status, back.jsonBody.widgets]).toEqual([200, null]);
    const again = await oa(ctx, owner, "POST", "rollback", { accountId: SARA, revisionId: r.jsonBody.access.revisionId, baseRevisionId: back.jsonBody.access.revisionId });
    expect([again.status, again.jsonBody.widgets, again.jsonBody.courses]).toEqual([200, ["insights"], ["791381"]]);
  });
});
