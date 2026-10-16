import { describe, it, expect } from "vitest";
import { handler as manageHandler } from "../src/functions/manage-assignments.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { handler as dashboardHandler } from "../src/functions/student-dashboard.js";
import { handler as feedHandler } from "../src/functions/achievement-feed.js";
import { handler as notificationsHandler } from "../src/functions/student-notifications.js";
import { recordAchievementIfEligible } from "../src/lib/achievement-feed.js";
import { recordEvent } from "../src/lib/notification-events.js";
import { releaseMode, resultsReleased, releaseInfo, withholdResult, normalizeReleaseMode, withheldAssignmentIds } from "../src/lib/results-release.js";
import { ensurePublishedAssignmentIndexed } from "../src/lib/class-assignment-index.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 21G.5 (owner decision D2) — the results release is a per-assignment setting ("immediate" by default, "afterDue",
// "manual"). Until release the SERVER withholds the mark on every student surface: the submission state (latest result and
// every attempt), the dashboard (its result, its averages, Strength and medals), the medal post (for its owner and the class)
// and the review notification. Released → exactly today's payloads. Unknown mode / unreadable date → withheld (fail closed).

const S1 = "11111111-1111-1111-1111-111111111111", CA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NOW = Date.now(), DAY = 864e5, iso = ms => new Date(ms).toISOString();
const final = { attemptNumber: 1, submittedAt: iso(NOW - DAY), score: 95, totalMarks: 100, percentage: 95, manualReviewMarks: 0, finalized: true, teacherFeedback: "ممتاز", questionGrades: [] };
const assignment = (id, extra = {}) => ({ schemaVersion: 2, attemptModelVersion: 2, attemptPolicy: "continuous", assignmentId: id, classId: CA, className: "أ", status: "published", title: "واجب " + id, instructions: "", openAt: iso(NOW - 3 * DAY), dueAt: iso(NOW + DAY), maxAttempts: 1, durationMinutes: 0, questionCount: 1, totalMarks: 100, examSnapshot: { questions: [] }, createdAt: iso(NOW - 3 * DAY), ...extra });
function seed(extra = {}) {
  return createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "أحمد", code: "11", classId: CA, active: true, archived: false, authVersion: 1, shareAchievements: true },
    ["platform/classes/" + CA + ".json"]: { classId: CA, name: "أ", active: true, status: "active", studentIds: [S1], ownerId: "teacher-1" },
    ...extra
  });
}
const withAssignment = (a, attempt = final) => seed({ ["platform/assignments/" + a.assignmentId + ".json"]: a, ["platform/submissions/" + a.assignmentId + "/" + S1 + ".json"]: { assignmentId: a.assignmentId, studentId: S1, classId: CA, attempts: [attempt], activeAttempt: null } });
const ST = ctx => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }) });
const T = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ctx.container, container: ctx.container, recordAuditEvent: async () => {} });
const subGet = (ctx, id) => submissionHandler({ method: "GET", url: "https://x/api/student-submission/" + id, params: { assignmentId: id }, headers: { get: () => null } }, ST(ctx));
const dash = ctx => dashboardHandler({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, ST(ctx));
const feed = ctx => feedHandler({ method: "GET", url: "https://x/api/achievement-feed", headers: { get: () => null } }, ST(ctx));
const notes = async ctx => (await notificationsHandler({ method: "GET", url: "https://x/api/student-notifications", headers: { get: () => null } }, ST(ctx))).jsonBody.items.filter(i => i.type === "assignment_reviewed");
const manage = (ctx, body) => manageHandler({ method: "POST", url: "https://x/api/assignments", json: async () => body }, T(ctx));
const MARKS = ["score", "percentage", "manualReviewMarks", "teacherFeedback"];
const noMarks = r => { for (const k of MARKS) expect(r, k).not.toHaveProperty(k); };

describe("the release rule", () => {
  it("immediate by default; afterDue from the due date; manual once published; an unknown mode or bad date withholds", () => {
    expect(releaseMode({})).toBe("immediate");
    expect(resultsReleased({}, NOW)).toBe(true);
    expect(resultsReleased({ resultsRelease: "afterDue", dueAt: iso(NOW + 1) }, NOW)).toBe(false);
    expect(resultsReleased({ resultsRelease: "afterDue", dueAt: iso(NOW) }, NOW)).toBe(true);
    expect(resultsReleased({ resultsRelease: "afterDue", dueAt: "" }, NOW)).toBe(false);
    expect(resultsReleased({ resultsRelease: "manual" }, NOW)).toBe(false);
    expect(resultsReleased({ resultsRelease: "manual", resultsReleasedAt: iso(NOW) }, NOW)).toBe(true);
    expect(resultsReleased({ resultsRelease: "manual", resultsReleasedAt: "garbage" }, NOW)).toBe(false);
    expect(resultsReleased({ resultsRelease: "sometimes", resultsReleasedAt: iso(NOW) }, NOW)).toBe(false);
    expect(releaseInfo({ resultsRelease: "afterDue", dueAt: iso(NOW + DAY) }, NOW)).toEqual({ resultsVisible: false, resultsVisibility: "afterDue", resultsVisibleAt: iso(NOW + DAY) });
    expect(releaseInfo({ resultsRelease: "sometimes" }, NOW)).toEqual({ resultsVisible: false, resultsVisibility: "manual" });
    expect(withholdResult({ attemptNumber: 1, score: 1, percentage: 2, manualReviewMarks: 3, teacherFeedback: "x", latestScore: 1, latestPercentage: 2, totalMarks: 10 })).toEqual({ attemptNumber: 1, totalMarks: 10 });
    expect([undefined, "", "immediate", "afterDue", "manual", "x"].map(normalizeReleaseMode)).toEqual(["immediate", "immediate", "immediate", "afterDue", "manual", null]);
  });
  it("withheldAssignmentIds reads each assignment once; a read failure withholds, a missing assignment does not", async () => {
    const reads = [];
    const docs = { a: { resultsRelease: "manual" }, b: {}, gone: null };
    const out = await withheldAssignmentIds(["a", "a", "b", "gone", "boom", ""], async id => { reads.push(id); if (id === "boom") throw new Error("x"); return docs[id]; }, NOW);
    expect([...out].sort()).toEqual(["a", "boom"]);
    expect(reads.sort()).toEqual(["a", "b", "boom", "gone"]);
  });
});

describe("the teacher's setting", () => {
  it("create stores the mode (default immediate, an unknown one rejected); the list summary carries it", async () => {
    const ctx = seed();
    const exam = { title: "امتحان", questions: [{ id: "q1", text: "س", presentationType: "trueFalse", marks: 1, answer: { correct: true } }] };
    const ok = await manage(ctx, { classId: CA, title: "و", examSnapshot: exam, dueAt: iso(NOW + DAY), resultsRelease: "manual" });
    expect(ok.status).toBe(200);
    expect(ok.jsonBody.assignment).toMatchObject({ resultsRelease: "manual", resultsReleasedAt: "" });
    expect(ctx.getJson("platform/assignments/" + ok.jsonBody.assignment.assignmentId + ".json").resultsRelease).toBe("manual");
    expect((await manage(ctx, { classId: CA, title: "و", examSnapshot: exam, dueAt: iso(NOW + DAY) })).jsonBody.assignment.resultsRelease).toBe("immediate");
    expect((await manage(ctx, { classId: CA, title: "و", examSnapshot: exam, dueAt: iso(NOW + DAY), resultsRelease: "never" })).status).toBe(400);
  });
  it("setResultsRelease changes the mode and clears a manual publication; releaseResults works in manual mode only; archived is read-only", async () => {
    const ctx = withAssignment(assignment("A1", { resultsRelease: "manual" }));
    expect((await manage(ctx, { action: "releaseResults", assignmentId: "A1", released: true })).jsonBody.assignment.resultsReleasedAt).not.toBe("");
    expect((await manage(ctx, { action: "setResultsRelease", assignmentId: "A1", resultsRelease: "afterDue" })).jsonBody.assignment).toMatchObject({ resultsRelease: "afterDue", resultsReleasedAt: "" });
    expect((await manage(ctx, { action: "releaseResults", assignmentId: "A1", released: true })).status).toBe(409);
    const back = await manage(ctx, { action: "setResultsRelease", assignmentId: "A1", resultsRelease: "manual" });
    expect(back.jsonBody.assignment).toMatchObject({ resultsRelease: "manual", resultsReleasedAt: "" });       // never a surprise release
    expect((await manage(ctx, { action: "setResultsRelease", assignmentId: "A1", resultsRelease: "bogus" })).status).toBe(400);
    expect((await manage(ctx, { action: "releaseResults", assignmentId: "A1", released: "yes" })).status).toBe(400);
    const arch = withAssignment(assignment("A2", { status: "archived", resultsRelease: "manual" }));
    expect((await manage(arch, { action: "releaseResults", assignmentId: "A2", released: true })).status).toBe(409);
  });
});

describe("every student surface withholds the mark until release", () => {
  it("the submission state: the latest result and every attempt carry no mark, only the release state", async () => {
    const ctx = withAssignment(assignment("A1", { resultsRelease: "afterDue" }));
    const st = (await subGet(ctx, "A1")).jsonBody.state;
    noMarks(st.latestResult); noMarks(st.attempts[0]);
    expect(st.latestResult).toMatchObject({ attemptNumber: 1, totalMarks: 100, gradingStatus: "final", resultsVisible: false, resultsVisibility: "afterDue", resultsVisibleAt: assignment("A1").dueAt });
  });
  it("released (immediate, after the due date, or published) → today's payload plus resultsVisible:true", async () => {
    for (const a of [assignment("A1"), assignment("A1", { resultsRelease: "afterDue", dueAt: iso(NOW - 1000) }), assignment("A1", { resultsRelease: "manual", resultsReleasedAt: iso(NOW - 1000) })]) {
      const lr = (await subGet(withAssignment(a), "A1")).jsonBody.state.latestResult;
      expect(lr).toMatchObject({ score: 95, percentage: 95, teacherFeedback: "ممتاز", resultsVisible: true });
    }
  });
  it("the dashboard: no mark on the assignment, and none in the averages, Strength or medals", async () => {
    const hidden = (await dash(withAssignment(assignment("A1", { resultsRelease: "manual" })))).jsonBody;
    const shown = (await dash(withAssignment(assignment("A1")))).jsonBody;
    const [h] = hidden.assignments, [s] = shown.assignments;
    expect([h.latestScore, h.latestPercentage]).toEqual([null, null]);
    noMarks(h.latestResult);
    expect(h.latestResult.resultsVisible).toBe(false);
    expect([s.latestScore, s.latestResult.percentage, s.latestResult.resultsVisible]).toEqual([95, 95, true]);
    expect([hidden.stats.average, hidden.stats.averageFinalized]).toEqual([null, null]);
    expect([shown.stats.average, shown.stats.averageFinalized]).toEqual([95, 95]);
    expect(hidden.stats.finalized).toBe(1);                                                      // a count, never a mark
    expect(hidden.strength.examPoints ?? 0).toBe(0);
    expect(shown.strength.examPoints).toBeGreaterThan(0);
    expect(hidden.recognition.medals.total).toBe(0);
    expect(shown.recognition.medals.gold).toBe(1);
  });
  it("the medal post is hidden from the feed until release", async () => {
    const ctx = withAssignment(assignment("A1", { resultsRelease: "manual" }));
    await ensurePublishedAssignmentIndexed(ctx.container, CA, "A1");
    expect(await recordAchievementIfEligible(ctx.container, { classId: CA, studentId: S1, studentDisplayName: "أحمد", assignmentId: "A1", assignmentTitle: "واجب", percentage: 95, shareAchievements: true })).toBe(true);
    expect((await feed(ctx)).jsonBody.posts).toEqual([]);
    await manage(ctx, { action: "releaseResults", assignmentId: "A1", released: true });
    expect((await feed(ctx)).jsonBody.posts.map(p => p.medal && p.medal.assignmentId)).toEqual(["A1"]);
  });
  it("the review notification appears only once the results are released", async () => {
    const ctx = withAssignment(assignment("A1", { resultsRelease: "manual" }));
    await recordEvent(ctx.container, { scope: "student", studentId: S1, type: "assignment_reviewed", dedupeKey: "rev:A1:1", data: { assignmentId: "A1", becameFinal: true, finalized: true, percentage: 95, score: 95, totalMarks: 100 } });
    expect(await notes(ctx)).toEqual([]);
    await manage(ctx, { action: "releaseResults", assignmentId: "A1", released: true });
    expect((await notes(ctx)).map(n => [n.assignmentId, n.percentage])).toEqual([["A1", 95]]);
  });
});
