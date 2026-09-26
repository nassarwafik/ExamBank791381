import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { school, assignment, user, SUB, NOW } from "./fixtures/analytics-school.js";
import { handler as todayHandler, deriveTeacherToday } from "../src/functions/teacher-today.js";
import { handler as dashboardHandler } from "../src/functions/student-dashboard.js";

// Phase 9A — Today Hub read models.
//   Teacher: GET /api/teacher-today derives attention counts (live attempts, not-started, pending review, unread
//   messages) + recent activity from the canonical documents; scope = published assignments of ACTIVE classes and
//   their current members only (no archived class / student / draft leaks); messages are an optional source.
//   Student: /api/student-dashboard carries the additive `study.lastActivity` from the SAME study document it
//   already reads for Strength (zero extra reads).
const require = createRequire(import.meta.url);
const { latestStudyActivity } = require("../src/lib/learning-study.js");

const AUTH_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const AUTH_NONE = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const NOW_MS = Date.parse(NOW);
const req = () => ({ method: "GET", url: "https://x/api/teacher-today", headers: { get: () => null } });
const unreadOk = { teacherDirectUnread: async () => ({ totalUnread: 3, capped: false }) };

/** The shared school + Phase 9A cases: a live attempt, a paused attempt, a not-started member, an archived-class attempt. */
function seed() {
  const s = school();
  // s02 of c1 is LIVE on P2 (started 5 minutes ago); s03 (login-disabled but still a member) has a PAUSED attempt on P1
  // after its submitted one; s04 has nothing on P1 (not started). P1/P2 are open (dueAt in the past is only "closed"
  // when no override... give them a future dueAt so they are OPEN for the not-started rule).
  s["platform/assignments/P1.json"] = assignment("P1", "c1", "published", NOW, { dueAt: "2026-03-20T10:00:00.000Z", maxAttempts: 2 });
  s["platform/assignments/P2.json"] = assignment("P2", "c1", "published", NOW, { dueAt: "2026-03-15T10:00:00.000Z" });
  s[SUB + "P2/s02.json"] = { assignmentId: "P2", studentId: "s02", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-03-10T09:55:00.000Z", endsAt: "", status: "started" } };
  s[SUB + "P1/s03.json"] = { ...s[SUB + "P1/s03.json"], activeAttempt: { attemptNumber: 2, startedAt: "2026-03-10T08:00:00.000Z", endsAt: "", status: "paused", pausedAt: "2026-03-10T08:10:00.000Z" } };
  // An archived class (c3) with a live attempt and an archived student (s05) with a live attempt: never counted.
  s[SUB + "P4/s21.json"] = { assignmentId: "P4", studentId: "s21", classId: "c3", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-03-10T09:59:00.000Z", status: "started" } };
  s[SUB + "P1/s05.json"] = { assignmentId: "P1", studentId: "s05", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-03-10T09:58:00.000Z", status: "started" } };
  // A draft assignment with a live attempt: never counted either.
  s[SUB + "D/s04.json"] = { assignmentId: "D", studentId: "s04", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-03-10T09:57:00.000Z", status: "started" } };
  return s;
}

describe("9A teacher-today — scope, attention counts and recent activity", () => {
  it("A: unauthenticated → 401 and nothing is read", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await todayHandler(req(), { ...AUTH_NONE, container: ctx.container, nowMs: NOW_MS });
    expect(r.status).toBe(401);
  });

  it("B: live attempts = current members of active classes on published assignments only (archived class/student and draft excluded), newest first, with status", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await todayHandler(req(), { ...AUTH_OK, ...unreadOk, container: ctx.container, nowMs: NOW_MS });
    expect(r.status).toBe(200);
    const a = r.jsonBody.attention.activeAttempts;
    expect(a.count).toBe(2);
    expect(a.items.map(i => [i.studentId, i.assignmentId, i.status])).toEqual([["s02", "P2", "started"], ["s03", "P1", "paused"]]);
    expect(a.items[0]).toMatchObject({ title: "واجب P2", className: "صف 1", studentName: "طالب s02", startedAt: "2026-03-10T09:55:00.000Z" });
    expect(JSON.stringify(r.jsonBody)).not.toContain("s21");                          // archived class never appears
    expect(JSON.stringify(r.jsonBody)).not.toContain("s05");                          // archived student never appears
    expect(JSON.stringify(r.jsonBody.attention)).not.toContain('"D"');                 // draft never appears
  });

  it("C: not-started = OPEN assignments × members with no attempt and no live attempt; nearest deadline first; expected = class members", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await todayHandler(req(), { ...AUTH_OK, ...unreadOk, container: ctx.container, nowMs: NOW_MS });
    const n = r.jsonBody.attention.notStarted;
    // c1 members: s01 s02 s03 s04 (s05 archived). P1: s01 s02 s03 have attempts, s04 nothing → 1. P2: s01 submitted,
    // s02 live, s04 pending → s03 nothing → 1. P3 (c2): s11 s12 submitted → 0. P_old is closed (past due) → excluded.
    expect(n.count).toBe(2);
    expect(n.items.map(i => [i.assignmentId, i.notStarted, i.expected])).toEqual([["P2", 1, 4], ["P1", 1, 4]]);
    expect(n.items[0].dueAt).toBe("2026-03-15T10:00:00.000Z");
  });

  it("D: pending review counts the gradebook's rule (latest attempt needs manual review) per assignment and in total", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await todayHandler(req(), { ...AUTH_OK, ...unreadOk, container: ctx.container, nowMs: NOW_MS });
    const p = r.jsonBody.attention.pendingReview;
    // P1: s02 pending (s03's latest is its submitted attempt, not pending); P2: s04 pending; P3: s12 pending.
    expect(p.count).toBe(3);
    expect(p.items.map(i => [i.assignmentId, i.pendingReview]).sort()).toEqual([["P1", 1], ["P2", 1], ["P3", 1]]);
  });

  it("E: recent activity lists canonical attempt timestamps (submitted + started), newest first, capped at 10, scope-only", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await todayHandler(req(), { ...AUTH_OK, ...unreadOk, container: ctx.container, nowMs: NOW_MS });
    const recent = r.jsonBody.recent;
    expect(recent.length).toBeLessThanOrEqual(10);
    expect(recent[0].kind).toBe("submitted");                                          // the fixture's submissions are stamped NOW
    expect(recent[0].at).toBe(NOW);
    expect(recent.some(x => x.kind === "started" && x.studentId === "s02" && x.assignmentId === "P2" && x.at === "2026-03-10T09:55:00.000Z")).toBe(true);
    const ats = recent.map(x => Date.parse(x.at));
    expect([...ats].sort((x, y) => y - x)).toEqual(ats);
    expect(recent.some(x => x.kind === "submitted" && x.percentage === 92 && x.studentId === "s01")).toBe(true);
    expect(recent.every(x => ["s01", "s02", "s03", "s04", "s11", "s12"].includes(x.studentId))).toBe(true);
  });

  it("F: unread messages come from the shared teacher summary; a messages failure degrades ONLY that card (partial), never the hub", async () => {
    const ctx = createMemoryContainer(seed());
    const ok = await todayHandler(req(), { ...AUTH_OK, ...unreadOk, container: ctx.container, nowMs: NOW_MS });
    expect(ok.jsonBody.attention.unreadMessages).toEqual({ total: 3, capped: false });
    expect(ok.jsonBody.partial).toEqual([]);
    const bad = await todayHandler(req(), { ...AUTH_OK, teacherDirectUnread: async () => { throw new Error("boom"); }, container: ctx.container, nowMs: NOW_MS });
    expect(bad.status).toBe(200);
    expect(bad.jsonBody.attention.unreadMessages).toBeNull();
    expect(bad.jsonBody.partial).toEqual(["messages"]);
    expect(bad.jsonBody.attention.activeAttempts.count).toBe(2);                       // the rest is intact
  });

  it("G: reads only the published/active-class assignment folders (never draft, archived or archived-class folders)", async () => {
    const ctx = createMemoryContainer(seed());
    const listed = [];
    const deps = { ...AUTH_OK, ...unreadOk, container: ctx.container, nowMs: NOW_MS, listBlobNames: async (_c, prefix) => { listed.push(prefix); return ctx.names(prefix); } };
    await todayHandler(req(), deps);
    expect(listed.sort()).toEqual([SUB + "P1/", SUB + "P2/", SUB + "P3/", SUB + "P_old/"]);
  });

  it("H: empty platform → zero counts, empty lists, still ok (the hub shows its empty state)", async () => {
    const ctx = createMemoryContainer({});
    const r = await todayHandler(req(), { ...AUTH_OK, ...unreadOk, container: ctx.container, nowMs: NOW_MS });
    expect(r.status).toBe(200);
    expect(r.jsonBody.attention.activeAttempts).toEqual({ count: 0, items: [] });
    expect(r.jsonBody.attention.notStarted.count).toBe(0);
    expect(r.jsonBody.attention.pendingReview.count).toBe(0);
    expect(r.jsonBody.recent).toEqual([]);
  });

  it("I: deriveTeacherToday is pure — the same inputs give the same output, and a member of ANOTHER class never counts toward this class's assignment", () => {
    const input = {
      assignments: [assignment("A1", "c1", "published", NOW, { dueAt: "2026-03-20T10:00:00.000Z" })],
      classes: [{ classId: "c1", name: "صف 1", status: "active" }, { classId: "c2", name: "صف 2", status: "active" }],
      users: [user("s01", "c1"), user("s11", "c2")],
      submissionsByAssignment: new Map([["A1", new Map([["s11", { assignmentId: "A1", studentId: "s11", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: NOW, status: "started" } }]])]]),
      nowMs: NOW_MS
    };
    const a = deriveTeacherToday(input), b = deriveTeacherToday(input);
    expect(a).toEqual(b);
    expect(a.attention.activeAttempts.count).toBe(0);                                  // s11 is not a member of c1
    expect(a.attention.notStarted.items).toEqual([{ assignmentId: "A1", title: "واجب A1", className: "صف 1", dueAt: "2026-03-20T10:00:00.000Z", notStarted: 1, expected: 1 }]);
  });
});

describe("9A student-dashboard — additive study.lastActivity (same study read, zero extra reads)", () => {
  const AP = "platform/assignments/", LP = "platform/learning-study/";
  const student = { userId: "u1", classId: "c1", code: "S1", displayName: "علي", active: true, shareAchievements: true };
  const deps = store => ({
    requireActiveStudentSession: async () => ({ ok: true, container: {}, student }),
    downloadJsonOrNull: async (_c, key) => (store.has(key) ? structuredClone(store.get(key)) : null),
    listJson: async (_c, prefix) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v))
  });
  const dreq = () => ({ method: "GET", url: "http://x/student-dashboard", headers: { get: () => null } });

  it("J: latestStudyActivity picks the newest completion across pages; malformed timestamps never win; empty → null", () => {
    expect(latestStudyActivity(null)).toBeNull();
    expect(latestStudyActivity({ pages: { p1: { courseId: "791381", moduleId: "m03", completed: { a1: "not-a-date" } } } })).toBeNull();
    const doc = { pages: {
      "791381-m03-p2": { courseId: "791381", moduleId: "m03", completed: { a1: "2026-03-01T10:00:00.000Z", a2: "2026-03-05T10:00:00.000Z" } },
      "791381-m04-p1": { courseId: "791381", moduleId: "m04", completed: { a1: "2026-03-04T10:00:00.000Z" } }
    } };
    expect(latestStudyActivity(doc)).toEqual({ courseId: "791381", moduleId: "m03", pageId: "791381-m03-p2", completedAt: "2026-03-05T10:00:00.000Z" });
  });

  it("K: the dashboard carries study.lastActivity from the study document and null when there is none; nothing else changes", async () => {
    const store = new Map();
    store.set(AP + "a1.json", { assignmentId: "a1", classId: "c1", status: "published", title: "a1", maxAttempts: 1, questionCount: 1, totalMarks: 10 });
    let r = await dashboardHandler(dreq(), deps(store));
    expect(r.status).toBe(200);
    expect(r.jsonBody.study).toEqual({ lastActivity: null });
    store.set(LP + "u1.json", { schemaVersion: 1, pages: { "791381-m03-p2": { courseId: "791381", moduleId: "m03", completed: { a1: "2026-03-05T10:00:00.000Z" } } } });
    r = await dashboardHandler(dreq(), deps(store));
    expect(r.jsonBody.study.lastActivity).toEqual({ courseId: "791381", moduleId: "m03", pageId: "791381-m03-p2", completedAt: "2026-03-05T10:00:00.000Z" });
    expect(r.jsonBody.assignments.length).toBe(1);
  });
});
