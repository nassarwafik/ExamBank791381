import { describe, it, expect } from "vitest";
import { handler as resultsHandler } from "../src/functions/assignment-results.js";
import { handler as notificationsHandler } from "../src/functions/student-notifications.js";
import { recordEvent } from "../src/lib/notification-events.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 21G.7 — «تذكير»: a personal reminder to the class members who have NOT submitted and can still submit (published, open,
// not closed for them — the same timerState as their own page). At most one per student per assignment per day; a teacher of
// another class gets the assignment's «not found»; the reminder reaches the student's notification center with the deadline.

const T1 = "teacher-1", CA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const S = n => "1111111" + n + "-1111-1111-1111-111111111111";
const NOW = Date.now(), DAY = 864e5, iso = ms => new Date(ms).toISOString();
const student = (id, name, extra = {}) => ({ schemaVersion: 3, role: "student", userId: id, displayName: name, code: id.slice(0, 4), classId: CA, active: true, archived: false, authVersion: 1, ...extra });
const assignment = (extra = {}) => ({ schemaVersion: 2, attemptModelVersion: 2, attemptPolicy: "continuous", assignmentId: "A1", classId: CA, className: "أ", status: "published", title: "واجب الكسور", instructions: "", openAt: iso(NOW - DAY), dueAt: iso(NOW + 2 * DAY), maxAttempts: 1, durationMinutes: 0, questionCount: 1, totalMarks: 10, examSnapshot: { questions: [] }, createdAt: iso(NOW - 2 * DAY), ...extra });
const done = { attemptNumber: 1, submittedAt: iso(NOW - 3600e3), score: 5, totalMarks: 10, percentage: 50, manualReviewMarks: 0, finalized: true };
function seed(a = assignment()) {
  return createMemoryContainer({
    ["platform/classes/" + CA + ".json"]: { classId: CA, name: "أ", active: true, status: "active", studentIds: [S(1), S(2), S(3), S(4)], ownerId: T1 },
    ["platform/users/" + S(1) + ".json"]: student(S(1), "سارة"),            // not submitted → reminded
    ["platform/users/" + S(2) + ".json"]: student(S(2), "أحمد"),            // submitted → not needed
    ["platform/users/" + S(3) + ".json"]: student(S(3), "باسل"),            // not submitted (an override never shortens the deadline) → reminded
    ["platform/users/" + S(4) + ".json"]: student(S(4), "دانة", { classId: "other" }),   // another class → never reached
    ["platform/assignments/A1.json"]: a,
    ["platform/submissions/A1/" + S(2) + ".json"]: { assignmentId: "A1", studentId: S(2), classId: CA, attempts: [done], activeAttempt: null },
    ["platform/submissions/A1/" + S(3) + ".json"]: { assignmentId: "A1", studentId: S(3), classId: CA, attempts: [], activeAttempt: null, dueAtOverride: iso(NOW - 1000) }
  });
}
const T = (ctx, sub = T1, multi = true) => ({ requireBuilderAuth: () => ({ ok: true, user: { sub, ...(multi ? { am: "multi-user" } : {}) } }), getContainer: () => ctx.container, container: ctx.container, recordAuditEvent: async () => {} });
const remind = (ctx, body = {}, sub = T1) => resultsHandler({ method: "POST", url: "https://x/api/assignment-results", json: async () => ({ action: "remindStudents", assignmentId: "A1", ...body }) }, T(ctx, sub));
const ST = (ctx, id) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: id, sv: 1, role: "student" } }) });
const reminders = async (ctx, id) => (await notificationsHandler({ method: "GET", url: "https://x/api/student-notifications", headers: { get: () => null } }, ST(ctx, id))).jsonBody.items.filter(i => i.type === "assignment_reminder");

describe("21G.7 remindStudents", () => {
  it("reminds only class members who have not submitted and can still submit; once per student per day", async () => {
    const ctx = seed();
    const r = await remind(ctx);
    expect(r.status).toBe(200);
    expect(r.jsonBody).toEqual({ ok: true, reminded: 2, alreadyToday: 0, notNeeded: 1, failed: 0 });
    const [n] = await reminders(ctx, S(1));
    expect(n).toMatchObject({ type: "assignment_reminder", assignmentId: "A1", assignmentTitle: "واجب الكسور", dueAt: assignment().dueAt, unread: true });
    expect(await reminders(ctx, S(2))).toEqual([]);
    expect(await reminders(ctx, S(3))).toHaveLength(1);
    expect((await remind(ctx)).jsonBody).toEqual({ ok: true, reminded: 0, alreadyToday: 2, notNeeded: 1, failed: 0 });   // the same day
    expect(await reminders(ctx, S(1))).toHaveLength(1);
  });

  it("studentIds limits the reminder to the chosen students; a malformed list is rejected", async () => {
    const ctx = seed();
    expect((await remind(ctx, { studentIds: [S(2), S(4)] })).jsonBody).toEqual({ ok: true, reminded: 0, alreadyToday: 0, notNeeded: 1, failed: 0 });   // S(4) is not a member
    expect((await remind(ctx, { studentIds: ["../x"] })).status).toBe(400);
    expect((await remind(ctx, { studentIds: "all" })).status).toBe(400);
    expect((await remind(ctx, { studentIds: [S(1)] })).jsonBody.reminded).toBe(1);
  });

  it("a draft, archived, not-yet-open or closed assignment reminds nobody; another teacher gets «not found»", async () => {
    expect((await remind(seed(assignment({ status: "draft" })))).status).toBe(409);
    expect((await remind(seed(assignment({ status: "archived" })))).status).toBe(409);
    expect((await remind(seed(assignment({ openAt: iso(NOW + DAY) })))).jsonBody).toMatchObject({ reminded: 0, notNeeded: 3 });
    expect((await remind(seed(assignment({ openAt: iso(NOW - 3 * DAY), dueAt: iso(NOW - DAY) })))).jsonBody).toMatchObject({ reminded: 0, notNeeded: 3 });   // closed
    const r = await remind(seed(), {}, "teacher-2");
    expect(r.status).toBe(404);
  });

  it("the event type is personal only and carries the assignment and its deadline", async () => {
    const ctx = seed();
    await expect(recordEvent(ctx.container, { scope: "class", classId: CA, type: "assignment_reminder", dedupeKey: "k", data: { assignmentId: "A1", assignmentTitle: "x" } })).rejects.toThrow(/type\/scope/);
    expect((await recordEvent(ctx.container, { scope: "student", studentId: S(1), type: "assignment_reminder", dedupeKey: "k2", data: { assignmentId: "A1", assignmentTitle: "x", dueAt: "garbage" } })).recorded).toBe(true);
  });
});
