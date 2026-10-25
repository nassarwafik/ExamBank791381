import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// QA-14 … QA-18 — access and retry edges on the student side.
//
// Fail-first (QA on main c244cbab; fail-first run on 46ba9297):
//   QA-14  legacy untimed assignment: a network retry of the same submit recorded a SECOND attempt (double count);
//   QA-15  an archived class's achievement feed still took reactions (a write into a read-only class);
//   QA-16  an archived class's project was shown with self-report controls the server then refused (no read-only signal);
//   QA-17  an UNPUBLISHED assignment's timing (due date, duration) reached any student of the class who knew its id;
//   QA-18  a student and an assignment that BOTH lacked a classId matched ("undefined" === "undefined") on three routes.
//
// Every test runs the REAL handlers on the in-memory store.

const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const { createMemoryContainer } = require_("./fixtures/memory-container.js");
const submission = require_("../src/functions/student-submission.js");
const studentAssignment = require_("../src/functions/student-assignment.js");
const codingRun = require_("../src/functions/coding-run.js");
const feed = require_("../src/functions/achievement-feed.js");
const projects = require_("../src/functions/student-project-tracker.js");
const { feedBlobName } = require_("../src/lib/achievement-feed.js");
const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const auth = (sub = F.S1) => () => ({ ok: true, user: { sub, sv: 1, role: "student" } });
const ANSWERS = { auto1: F.code("print(1)\n"), sa1: { kind: "text", value: "x" } };

describe("QA-14 a retried submit (same submit key) is the same submit, never a second attempt", () => {
  const legacy = () => F.seed({ a: F.assignment({ attemptModelVersion: 1, durationMinutes: 0, attemptPolicy: undefined, maxAttempts: 3 }), doc: F.activeDoc({}, { activeAttempt: null }) });
  const submit = (ctx, extra = {}) => submission.handler(F.studentRequest({ action: "submit", answers: ANSWERS, ...extra }), { container: ctx.container, requireStudentAuth: auth(), env: F.ENV, fetch: F.runnerFetch() }, quiet);
  it("legacy untimed: the retry returns the first submit's result (200, replay) and records nothing", async () => {
    const ctx = legacy();
    const r1 = await submit(ctx, { submitKey: "key-0000000001" });
    expect(r1.status).toBe(200);
    const before = JSON.stringify(ctx.getJson(F.SUB));
    const r2 = await submit(ctx, { submitKey: "key-0000000001" });
    expect(r2.status).toBe(200);
    expect(r2.jsonBody.replay).toBe(true);
    expect(r2.jsonBody.result.attemptNumber).toBe(1);
    expect(ctx.getJson(F.SUB).attempts).toHaveLength(1);
    expect(JSON.stringify(ctx.getJson(F.SUB))).toBe(before);
  });
  it("two submits with the same key IN FLIGHT at once (both past the early check) still record one attempt", async () => {
    const ctx = legacy();
    const [a, b] = await Promise.all([submit(ctx, { submitKey: "key-0000000003" }), submit(ctx, { submitKey: "key-0000000003" })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(ctx.getJson(F.SUB).attempts).toHaveLength(1);
    expect([a.jsonBody.replay, b.jsonBody.replay].filter(Boolean)).toHaveLength(1);
  });
  it("a NEW submit (new key) is a new attempt, as before; a malformed key is ignored", async () => {
    const ctx = legacy();
    await submit(ctx, { submitKey: "key-0000000001" });
    expect((await submit(ctx, { submitKey: "key-0000000002" })).status).toBe(200);
    expect(ctx.getJson(F.SUB).attempts).toHaveLength(2);
    expect((await submit(ctx, { submitKey: "bad key!" })).status).toBe(200);
    expect(ctx.getJson(F.SUB).attempts).toHaveLength(3);
  });
  it("modern attempt: a retry after success replays the result instead of a 409", async () => {
    const ctx = F.seed();
    const id = { expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 };
    expect((await submit(ctx, { ...id, submitKey: "key-0000000009" })).status).toBe(200);
    const r2 = await submit(ctx, { ...id, submitKey: "key-0000000009" });
    expect(r2.status).toBe(200);
    expect(r2.jsonBody.replay).toBe(true);
    expect(ctx.getJson(F.SUB).attempts).toHaveLength(1);
  });
});

describe("QA-15 / QA-16 an archived class is read-only for the student", () => {
  const seedFeed = status => {
    const ctx = createMemoryContainer({
      "platform/classes/c1.json": { classId: "c1", name: "صف", active: status === "active", status, studentIds: [] },
      "platform/users/s1.json": { userId: "s1", role: "student", classId: "c1", active: true, archived: false, displayName: "أ", code: "S1", authVersion: 1 },
      "platform/users/s2.json": { userId: "s2", role: "student", classId: "c1", active: true, archived: false, displayName: "ب", code: "S2", authVersion: 1 }
    });
    ctx.setJson(feedBlobName("c1", "p1"), { postId: "p1", classId: "c1", studentId: "s2", studentDisplayName: "ب", type: "assignment", title: "واجب", shareWithClass: true, visibility: "class", createdAt: "2026-01-01T00:00:00.000Z", reactions: {} });
    const deps = { requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) };
    return { ctx, get: () => feed.handler({ method: "GET", url: "https://x/api/achievement-feed", headers: { get: () => null } }, deps), react: () => feed.handler({ method: "POST", url: "https://x/api/achievement-feed", headers: { get: () => null }, json: async () => ({ action: "react", postId: "p1", reaction: "clap" }) }, deps) };
  };
  it("QA-15 archived: the feed reads (readOnly) but a reaction is refused 403 and nothing is written", async () => {
    const f = seedFeed("archived");
    expect((await f.get()).jsonBody.readOnly).toBe(true);
    const before = JSON.stringify(f.ctx.getJson(feedBlobName("c1", "p1")));
    const r = await f.react();
    expect(r.status).toBe(403);
    expect(JSON.stringify(f.ctx.getJson(feedBlobName("c1", "p1")))).toBe(before);
  });
  it("unchanged: an active class reacts as before (no readOnly flag)", async () => {
    const f = seedFeed("active");
    expect((await f.get()).jsonBody.readOnly).toBeUndefined();
    expect((await f.react()).status).toBe(200);
  });
  it("QA-16 archived: the student's project stays readable as a record and is flagged readOnly; active: no flag", async () => {
    for (const [status, flag] of [["archived", true], ["active", undefined]]) {
      const ctx = createMemoryContainer({
        "platform/classes/c1.json": { classId: "c1", name: "صف", active: status === "active", status, studentIds: [], programCodes: ["899373"], schoolYear: "2026", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        "platform/users/s1.json": { userId: "s1", role: "student", classId: "c1", active: true, archived: false, displayName: "أ", code: "S1", authVersion: 1 }
      });
      const r = await projects.handler({ method: "GET", url: "https://x/api/student-project-tracker", headers: { get: () => null } }, { requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) });
      expect(r.status, status).toBe(200);
      expect(r.jsonBody.enrolled, status).toBe(true);
      expect(r.jsonBody.readOnly, status).toBe(flag);
    }
  });
});

describe("QA-16 (server) a write into an archived class's project is still refused", () => {
  it("POST self-report → 403 with the archived message; nothing is written", async () => {
    const ctx = createMemoryContainer({
      "platform/classes/c1.json": { classId: "c1", name: "صف", active: false, status: "archived", studentIds: [], programCodes: ["899373"], schoolYear: "2026", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      "platform/users/s1.json": { userId: "s1", role: "student", classId: "c1", active: true, archived: false, displayName: "أ", code: "S1", authVersion: 1 }
    });
    const before = JSON.stringify(ctx.names("platform/").sort());
    const { getProjectDefinition } = require_("../src/lib/project-tracker/registry.js");
    const stageId = getProjectDefinition("899373").stages.find(s => s.active !== false).stageId;
    const r = await projects.handler({ method: "POST", url: "https://x/api/student-project-tracker", headers: { get: () => null }, json: async () => ({ projectCode: "899373", stageIds: [stageId], mark: true }) }, { requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }), recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} });
    expect(r.status).toBe(403);
    expect(r.jsonBody.error).toBe("الصف مؤرشف — لا يمكن تعديل المشروع.");
    expect(JSON.stringify(ctx.names("platform/").sort())).toBe(before);
  });
});

describe("QA-17 an unpublished assignment's timing never reaches a student who knows its id", () => {
  const get = ctx => submission.handler(F.studentRequest({}, "GET"), { container: ctx.container, requireStudentAuth: auth(), env: F.ENV, fetch: F.runnerFetch() }, quiet);
  it("a draft (never published) assignment → 404, no state", async () => {
    const ctx = F.seed({ a: F.assignment({ status: "draft" }), doc: null });
    const r = await get(ctx);
    expect(r.status).toBe(404);
    expect(r.jsonBody.state).toBeUndefined();
  });
  it("an archived assignment WITH the student's submission stays readable as history; without one → 404", async () => {
    const withDoc = F.seed({ a: F.assignment({ status: "archived" }), doc: F.activeDoc({}, { activeAttempt: null, attempts: [{ attemptNumber: 1, submittedAt: F.STARTED, score: 1, totalMarks: 12, percentage: 8, manualReviewMarks: 0, finalized: true }] }) });
    expect((await get(withDoc)).status).toBe(200);
    expect((await get(F.seed({ a: F.assignment({ status: "archived" }), doc: null }))).status).toBe(404);
  });
});

describe("QA-18 a missing classId on both sides never counts as the same class", () => {
  const seedNoClass = () => {
    const ctx = F.seed({ a: F.assignment({ classId: undefined }) });
    const u = ctx.getJson("platform/users/" + F.S1 + ".json"); delete u.classId; ctx.setJson("platform/users/" + F.S1 + ".json", u);
    return ctx;
  };
  it("student-submission, student-assignment and coding-run all refuse (404)", async () => {
    const ctx = seedNoClass();
    const deps = { container: ctx.container, requireStudentAuth: auth(), env: F.ENV, fetch: F.runnerFetch() };
    expect((await submission.handler(F.studentRequest({}, "GET"), deps, quiet)).status).toBe(404);
    expect((await studentAssignment.handler({ method: "GET", url: "https://x/api/student-assignment/" + F.AID, params: { assignmentId: F.AID }, headers: new Headers() }, deps, quiet)).status).toBe(404);
    const body = { assignmentId: F.AID, questionId: "auto1", language: "python", languageVersion: 1, source: "print(1)\n", stdin: "" };
    const run = await codingRun.runHandler({ method: "POST", url: "https://x/api/coding/run", params: {}, headers: new Headers({ "content-type": "application/json" }), query: new URLSearchParams(), text: async () => JSON.stringify(body), json: async () => body }, { ...deps, codingExecutionProvider: { run: async () => { throw new Error("must not run"); }, capabilities: () => ({}) } }, quiet);
    expect(run.status).toBe(404);
  });
});
