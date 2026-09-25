import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handler as manageHandler } from "../src/functions/manage-assignments.js";
import { handler as resultsHandler } from "../src/functions/assignment-results.js";
import { handler as reviewHandler } from "../src/functions/assignment-review.js";
import { handler as classroomsHandler } from "../src/functions/manage-classrooms.js";
import { handler as teacherFeedHandler } from "../src/functions/teacher-achievement-feed.js";
import { handler as teacherMessages } from "../src/functions/messages.js";
import { handler as studentMessages } from "../src/functions/student-messages.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { handler as notificationsHandler } from "../src/functions/student-notifications.js";
import { EVENT_PREFIX, recordEvent, recordEventSafely, acknowledgePosition, normalizeEventReadState, classEventPrefix, studentEventPrefix } from "../src/lib/notification-events.js";
import { READ_STATE_PREFIX } from "../src/lib/message-read-state.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 6D — the unified student notification center through the REAL handlers on the in-memory blob store (real ETag
// CAS, real create-only publication): producers record an event only on a real committed transition, the projection
// re-validates visibility at read time, message unread stays the Phase 5D authority, and event read state is per event.

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const S3 = "33333333-3333-3333-3333-333333333333";
const CA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const MIN = 60000;
const EXAM = { questions: [{ examQuestionId: "q1", presentationType: "trueFalse", marks: 10, answer: { correct: true } }] };
const iso = ms => new Date(ms).toISOString();
const user = (userId, classId, name) => ({ schemaVersion: 3, role: "student", userId, displayName: name, code: userId.slice(0, 2), classId, active: true, archived: false, authVersion: 1 });

let ctx, warnings, clock;
// A controlled server clock that moves forward between teacher actions (distinct commit times, like real requests).
const tick = (ms = 1000) => { clock += ms; vi.setSystemTime(clock); };
afterEach(() => { vi.useRealTimers(); });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  clock = Date.UTC(2026, 8, 1, 8, 0, 0); vi.setSystemTime(clock);
  warnings = [];
  ctx = createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: user(S1, CA, "أحمد"),
    ["platform/users/" + S2 + ".json"]: user(S2, CA, "سارة"),
    ["platform/users/" + S3 + ".json"]: user(S3, CB, "ليلى"),
    ["platform/classes/" + CA + ".json"]: { classId: CA, name: "أ", active: true, status: "active", studentIds: [S1, S2] },
    ["platform/classes/" + CB + ".json"]: { classId: CB, name: "ب", active: true, status: "active", studentIds: [S3] }
  });
});

const OBS = { logWarn: (name, props) => warnings.push({ name, props }), logInfo: () => {}, logError: () => {} };
const T = (extra = {}) => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ctx.container, container: ctx.container, recordAuditEvent: async () => {}, resolveTeacherDisplayName: async () => "أ. خالد", ...extra });
// The token's classId claim is deliberately WRONG: the server must use the persisted student document only.
const ST = sub => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub, sv: 1, role: "student", classId: CB } }), recordAchievementIfEligible: async () => {} });
const manage = (body, extra) => (tick(), manageHandler)({ method: "POST", url: "https://x/api/assignments", json: async () => body }, T(extra), OBS);
const results = (aid, body, sid = S1) => (tick(), resultsHandler)({ method: "POST", url: "https://x/api/assignment-results", json: async () => ({ assignmentId: aid, studentId: sid, ...body }) }, T(), OBS);
const classrooms = body => (tick(), classroomsHandler)({ method: "POST", url: "https://x/api/classrooms", json: async () => body }, T(), OBS);
const feed = body => (tick(), teacherFeedHandler)({ method: "POST", url: "https://x/api/teacher-achievement-feed", json: async () => body }, T(), OBS);
const review = body => (tick(), reviewHandler)({ method: "POST", url: "https://x/api/assignment-review", json: async () => ({ action: "saveReview", ...body }) }, T(), OBS);
const tMsg = body => teacherMessages({ method: "POST", url: "https://x/api/messages", headers: { get: () => null }, json: async () => body }, T());
const sMsg = (sid, body) => studentMessages({ method: "POST", url: "https://x/api/student-messages", headers: { get: () => null }, json: async () => body }, ST(sid));
const sMsgGet = (sid, q = "") => studentMessages({ method: "GET", url: "https://x/api/student-messages" + q, headers: { get: () => null } }, ST(sid));
const nGet = (sid, q = "") => notificationsHandler({ method: "GET", url: "https://x/api/student-notifications" + q, headers: { get: () => null } }, ST(sid));
const nPost = (sid, body) => notificationsHandler({ method: "POST", url: "https://x/api/student-notifications", headers: { get: () => null }, json: async () => body }, ST(sid));
const items = async sid => (await nGet(sid)).jsonBody.items;
const eventItems = async sid => (await items(sid)).filter(i => i.type !== "direct" && i.type !== "announcement");
const types = async sid => (await eventItems(sid)).map(i => i.type);
const eventBlobs = (prefix = EVENT_PREFIX) => ctx.names(prefix).filter(n => !n.includes("/read-state/"));
const everything = () => JSON.stringify(ctx.names("").map(n => [n, ctx.store.get(n).etag]));

const sub = (aid, sid, body) => submissionHandler({ method: "POST", params: { assignmentId: aid }, headers: { get: () => null }, json: async () => body }, ST(sid));
/** The student starts and submits one attempt (so a retry grant is a REAL new attempt). Returns nothing. */
async function useAttempt(aid, sid = S1) {
  const st = (await sub(aid, sid, { action: "startAttempt" })).jsonBody.state;
  expect((await sub(aid, sid, { action: "submit", answers: {}, expectedAttemptNumber: st.activeAttempt.attemptNumber, expectedStartedAt: st.activeAttempt.startedAt })).status).toBe(200);
}
async function create(extra = {}) {
  const r = await manage({ action: "create", classId: CA, title: "واجب الشبكات", examSnapshot: EXAM, publish: true, maxAttempts: 1, openAt: iso(Date.now() - MIN), dueAt: iso(Date.now() + 24 * 60 * MIN), ...extra });
  expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
  return r.jsonBody.assignment.assignmentId;
}

describe("existing messages stay the message authority", () => {
  it("direct + announcement appear; student replies never do; the ✉️ count is EXACTLY Phase 5D's; GET marks nothing", async () => {
    expect((await tMsg({ action: "sendDirect", studentId: S1, body: "راجع الواجب" })).status).toBe(200);
    expect((await tMsg({ action: "sendAnnouncement", classId: CA, body: "لا حصة غدًا" })).status).toBe(200);
    expect((await sMsg(S1, { action: "sendDirect", body: "حاضر" })).status).toBe(200);          // own reply
    const before = everything();
    const r = await nGet(S1);
    expect(r.status).toBe(200);
    expect(r.jsonBody.items.map(i => i.type).sort()).toEqual(["announcement", "direct"]);
    expect(JSON.stringify(r.jsonBody.items)).not.toContain("حاضر");
    const phase5d = (await sMsgGet(S1, "?view=unread")).jsonBody;
    expect(r.jsonBody.messages).toEqual({ directUnread: phase5d.directUnread, announcementUnread: phase5d.announcementUnread, totalUnread: phase5d.totalUnread, totalCapped: phase5d.totalCapped });
    expect(r.jsonBody.messages.totalUnread).toBe(2);
    expect(r.jsonBody.bell).toEqual({ unread: 2, capped: false });
    expect((await nGet(S1, "?view=unread")).jsonBody.bell).toEqual({ unread: 2, capped: false });
    expect(everything()).toBe(before);                                                          // GETs wrote nothing
    // Messages are never copied into the event store.
    expect(eventBlobs()).toEqual([]);
    // Acknowledging a message still happens ONLY through /api/student-messages (Phase 5D): an event POST cannot.
    const msgId = r.jsonBody.items.find(i => i.type === "direct").id;
    expect((await nPost(S1, { action: "markEventRead", eventId: msgId })).status).toBe(400);
    expect((await nPost(S1, { action: "markRead", stream: "direct", throughMessageId: msgId, seenIdsAtBoundary: [msgId] })).status).toBe(400);
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([]);
  });
});

describe("assignment published", () => {
  it("create published → exactly one class event; a draft notifies nothing until a real draft→published transition", async () => {
    const aid = await create();
    expect(eventBlobs(classEventPrefix(CA))).toHaveLength(1);
    expect(await types(S1)).toEqual(["assignment_published"]);
    expect((await eventItems(S1))[0]).toMatchObject({ assignmentId: aid, assignmentTitle: "واجب الشبكات", unread: true });

    const draft = await create({ publish: false, title: "مسودة" });
    expect(eventBlobs(classEventPrefix(CA))).toHaveLength(1);
    expect((await manage({ action: "setStatus", assignmentId: draft, status: "published" })).status).toBe(200);
    expect(eventBlobs(classEventPrefix(CA))).toHaveLength(2);
    for (let i = 0; i < 3; i++) expect((await manage({ action: "setStatus", assignmentId: draft, status: "published" })).status).toBe(200);   // retries
    expect(eventBlobs(classEventPrefix(CA))).toHaveLength(2);
  });

  it("a genuine unpublish → publish again is a new publication; classmates in another class see nothing", async () => {
    const aid = await create();
    await manage({ action: "setStatus", assignmentId: aid, status: "draft" });
    await manage({ action: "setStatus", assignmentId: aid, status: "published" });
    expect(eventBlobs(classEventPrefix(CA))).toHaveLength(2);
    expect(await types(S3)).toEqual([]);                                                        // class B
    expect((await nGet(S3, "?view=unread")).jsonBody.events).toEqual({ unread: 0, capped: false });
  });

  it("a draft / archived assignment never surfaces through an old publication event (no title, no count)", async () => {
    const aid = await create({ title: "سرّي" });
    await manage({ action: "setStatus", assignmentId: aid, status: "draft" });
    let r = await nGet(S1);
    expect(r.jsonBody.events).toEqual({ unread: 0, capped: false });
    expect(JSON.stringify(r.jsonBody)).not.toContain("سرّي");
    await manage({ action: "setStatus", assignmentId: aid, status: "published" });
    expect((await nGet(S1)).jsonBody.events.unread).toBe(2);
    expect((await manage({ action: "archive", assignmentId: aid })).status).toBe(200);
    r = await nGet(S1);
    expect(r.jsonBody.events).toEqual({ unread: 0, capped: false });
    expect(JSON.stringify(r.jsonBody)).not.toContain("سرّي");
    // The event documents never hold exam content.
    for (const n of eventBlobs()) expect(JSON.stringify(ctx.getJson(n))).not.toMatch(/examSnapshot|questions|answer|trueFalse/);
  });

  it("a notification storage failure never fails the publication", async () => {
    const r = await manage({ action: "create", classId: CA, title: "واجب", examSnapshot: EXAM, publish: true }, { recordNotificationEvent: async () => { throw new Error("storage down"); } });
    expect(r.status).toBe(200);
    expect(ctx.names("platform/assignments/")).toHaveLength(1);
    expect(warnings.map(w => w.name)).toContain("notification.event.failed");
    expect(JSON.stringify(warnings)).not.toMatch(/واجب|assignmentId|storage down/);
  });
});

describe("deadline / reopen", () => {
  it("class-wide updateTiming: a later due notifies once; equal due / duration-only edit notify nothing", async () => {
    const aid = await create();
    const due = Date.now() + 48 * 60 * MIN;
    expect((await manage({ action: "updateTiming", assignmentId: aid, dueAt: iso(due) })).status).toBe(200);
    expect(await types(S1)).toEqual(["assignment_deadline_extended", "assignment_published"]);
    expect((await manage({ action: "updateTiming", assignmentId: aid, dueAt: iso(due) })).status).toBe(200);            // equal
    expect((await manage({ action: "updateTiming", assignmentId: aid, dueAt: iso(due), durationMinutes: 30 })).status).toBe(200);   // duration only
    expect(eventBlobs(classEventPrefix(CA))).toHaveLength(2);
    expect((await eventItems(S1))[0]).toMatchObject({ type: "assignment_deadline_extended", dueAt: iso(due) });
    expect((await manage({ action: "updateTiming", assignmentId: aid, dueAt: iso(Date.now() + MIN) })).status).toBe(400);   // shorten → rejected
    expect(eventBlobs(classEventPrefix(CA))).toHaveLength(2);
  });

  it("per-student extension / retry / attempt-time: only the TARGET student is notified, each once", async () => {
    const aid = await create({ durationMinutes: 30 });
    // retry: while an attempt is still unused, a grant changes nothing → no event
    expect((await results(aid, { action: "allowRetry" })).status).toBe(200);
    expect(eventBlobs(studentEventPrefix(S1))).toEqual([]);
    // after using the attempt: a real grant → one event; repeating it (nothing new) → none
    await useAttempt(aid);
    expect((await results(aid, { action: "allowRetry" })).status).toBe(200);
    expect((await results(aid, { action: "allowRetry" })).status).toBe(200);
    // deadline override: a genuine later date → event; same again → none; clearing → none
    const ov = iso(Date.now() + 72 * 60 * MIN);
    expect((await results(aid, { action: "setDueAtOverride", dueAtOverride: ov })).status).toBe(200);
    expect((await results(aid, { action: "setDueAtOverride", dueAtOverride: ov })).status).toBe(200);
    expect((await results(aid, { action: "setDueAtOverride", dueAtOverride: null })).status).toBe(200);
    // attempt-time extension on a live attempt
    const st = (await sub(aid, S1, { action: "startAttempt" })).jsonBody.state;
    expect((await results(aid, { action: "extendActiveAttempt", newEndsAt: iso(Date.parse(st.activeAttempt.endsAt) + 20 * MIN) })).status).toBe(200);
    const mine = await types(S1);
    expect(mine.filter(t => t === "assignment_retry_granted")).toHaveLength(1);
    expect(mine.filter(t => t === "assignment_deadline_extended")).toHaveLength(1);
    expect(mine.filter(t => t === "attempt_time_extended")).toHaveLength(1);
    expect(eventBlobs(studentEventPrefix(S1))).toHaveLength(3);
    expect(eventBlobs(studentEventPrefix(S2))).toEqual([]);
    expect(await types(S2)).toEqual(["assignment_published"]);                                  // classmate: class event only
  });

  it("reopenStudent notifies the target once; a reopen that changes nothing does not", async () => {
    const aid = await create();
    await useAttempt(aid);
    expect((await results(aid, { action: "reopenStudent" })).status).toBe(200);
    expect((await results(aid, { action: "reopenStudent" })).status).toBe(200);                 // nothing new
    expect((await types(S1)).filter(t => t === "assignment_reopened")).toHaveLength(1);
    expect(eventBlobs(studentEventPrefix(S2))).toEqual([]);
  });
});

describe("learning materials", () => {
  const set = ids => classrooms({ action: "setLearningCourseModules", classId: CA, courseId: "791381", moduleIds: ids });
  it("one event per NEWLY published module; unchanged / hidden → none; titles from the registry", async () => {
    expect((await set(["791381-m01"])).status).toBe(200);
    expect(eventBlobs(classEventPrefix(CA))).toHaveLength(1);
    expect((await set(["791381-m01", "791381-m02", "791381-m07"])).status).toBe(200);
    expect(eventBlobs(classEventPrefix(CA))).toHaveLength(3);
    expect((await set(["791381-m01", "791381-m02", "791381-m07"])).status).toBe(200);            // unchanged
    expect((await set(["791381-m01", "791381-m07"])).status).toBe(200);                          // hide m02
    expect(eventBlobs(classEventPrefix(CA))).toHaveLength(3);
    const got = (await eventItems(S1)).filter(i => i.type === "learning_module_published");
    expect(got.map(i => i.moduleId).sort()).toEqual(["791381-m01", "791381-m07"]);              // hidden m02 dropped out
    expect(got.find(i => i.moduleId === "791381-m01")).toMatchObject({ courseId: "791381", moduleTitle: "أساسيات الشبكات", courseTitle: "شبكات الاتصال" });
    const r = await nGet(S1);
    expect(JSON.stringify(r.jsonBody)).not.toContain("الأعداد والموازين");                      // m02's title never leaks
    expect(r.jsonBody.events.unread).toBe(2);
    // Stored event docs hold ids only (titles are resolved at read time).
    for (const n of eventBlobs(classEventPrefix(CA))) expect(JSON.stringify(ctx.getJson(n))).not.toMatch(/أساسيات|الأعداد|title/i);
    // Re-publishing m02 is a new publication (it was genuinely hidden in between).
    expect((await set(["791381-m01", "791381-m02", "791381-m07"])).status).toBe(200);
    expect(eventBlobs(classEventPrefix(CA))).toHaveLength(4);
  });
});

describe("grading / review", () => {
  async function pendingSubmission(aid) {
    ctx.setJson("platform/submissions/" + aid + "/" + S1 + ".json", {
      schemaVersion: 1, assignmentId: aid, studentId: S1, classId: CA, attempts: [{ attemptNumber: 1, submittedAt: iso(Date.now()), score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false, questionGrades: [{ questionId: "q1", score: 0, maxMarks: 10, manualReview: true }], answers: { q1: "secret answer" }, manualOverrides: {}, teacherFeedback: "" }]
    });
    ctx.setJson("platform/submissions/" + aid + "/" + S2 + ".json", {
      schemaVersion: 1, assignmentId: aid, studentId: S2, classId: CA, attempts: [{ attemptNumber: 1, submittedAt: iso(Date.now()), score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false, questionGrades: [{ questionId: "q1", score: 0, maxMarks: 10, manualReview: true }], answers: {}, manualOverrides: {}, teacherFeedback: "" }]
    });
  }
  it("pending → final with feedback in ONE save → ONE coalesced event; an identical re-save → none", async () => {
    const aid = await create();
    await pendingSubmission(aid);
    const body = { assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 8, comment: "" } }, teacherFeedback: "عمل ممتاز" };
    expect((await review(body)).status).toBe(200);
    expect((await review(body)).status).toBe(200);                                             // identical
    const reviewed = (await eventItems(S1)).filter(i => i.type === "assignment_reviewed");
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0]).toMatchObject({ assignmentId: aid, becameFinal: true, scoreChanged: true, feedbackChanged: true, finalized: true, percentage: 80 });
    // A later meaningful feedback change → one more; a score-only change → one more.
    expect((await review({ ...body, teacherFeedback: "راجع السؤال الأول" })).status).toBe(200);
    expect((await review({ ...body, overrides: { q1: { score: 9, comment: "" } }, teacherFeedback: "راجع السؤال الأول" })).status).toBe(200);
    expect((await eventItems(S1)).filter(i => i.type === "assignment_reviewed")).toHaveLength(3);
    // Student A's review never reaches student B; no answers / other scores in any event.
    expect((await eventItems(S2)).filter(i => i.type === "assignment_reviewed")).toEqual([]);
    for (const n of eventBlobs()) expect(JSON.stringify(ctx.getJson(n))).not.toContain("secret answer");
  });

  it("a save that only restates an already-final grade (no change) notifies nothing", async () => {
    const aid = await create();
    await pendingSubmission(aid);
    await review({ assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 5, comment: "جيد" } }, teacherFeedback: "" });
    await review({ assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 5, comment: "جيد" } }, teacherFeedback: "" });
    expect((await eventItems(S1)).filter(i => i.type === "assignment_reviewed")).toHaveLength(1);
  });
});

describe("teacher reaction (رغش) and note", () => {
  const POST = "p-11111111";
  beforeEach(() => {
    ctx.setJson("platform/feed/" + CA + "/" + POST + ".json", { postId: POST, classId: CA, studentId: S1, studentDisplayName: "أحمد", eventType: "medal", tier: "gold", createdAt: iso(Date.now()), reactions: {} });
  });
  it("added → owner notified; changed → notified again; removed → nothing; classmates → nothing", async () => {
    expect((await feed({ action: "react", classId: CA, postId: POST, reaction: "clap" })).status).toBe(200);
    expect((await feed({ action: "react", classId: CA, postId: POST, reaction: "fire" })).status).toBe(200);   // change
    expect((await feed({ action: "react", classId: CA, postId: POST, reaction: "fire" })).status).toBe(200);   // toggle off
    const got = (await eventItems(S1)).filter(i => i.type === "teacher_reaction");
    expect(got.map(i => i.reaction)).toEqual(["fire", "clap"]);
    expect(got[0]).toMatchObject({ postId: POST });
    expect(eventBlobs(studentEventPrefix(S2))).toEqual([]);
    expect((await eventItems(S2)).filter(i => i.type === "teacher_reaction")).toEqual([]);
  });
  it("note: new/changed non-empty → event; identical → none; cleared → none", async () => {
    await feed({ action: "setNote", classId: CA, postId: POST, note: "أحسنت يا بطل" });
    await feed({ action: "setNote", classId: CA, postId: POST, note: "أحسنت يا بطل" });
    await feed({ action: "setNote", classId: CA, postId: POST, note: "" });
    await feed({ action: "setNote", classId: CA, postId: POST, note: "استمر" });
    const got = (await eventItems(S1)).filter(i => i.type === "teacher_note");
    expect(got.map(i => i.notePreview)).toEqual(["استمر", "أحسنت يا بطل"]);
    expect(eventBlobs(studentEventPrefix(S2))).toEqual([]);
  });
});

describe("event read state", () => {
  it("GET writes nothing; marking an authorized event reads it; a newer event stays unread; counts are fresh", async () => {
    await create({ title: "أول" });
    const before = everything();
    await nGet(S1); await nGet(S1, "?view=unread");
    expect(everything()).toBe(before);
    const first = (await eventItems(S1))[0];
    await create({ title: "ثانٍ" });                                                             // arrives "during" the acknowledgement
    const r = await nPost(S1, { action: "markEventRead", eventId: first.id });
    expect(r.status).toBe(200);
    expect(r.jsonBody.events).toEqual({ unread: 1, capped: false });
    expect(r.jsonBody.bell).toEqual({ unread: 1, capped: false });
    const now = await eventItems(S1);
    expect(now.find(i => i.id === first.id).unread).toBe(false);
    expect(now.find(i => i.assignmentTitle === "ثانٍ").unread).toBe(true);
    // Another student's view is untouched by S1's acknowledgement.
    expect((await nGet(S2, "?view=unread")).jsonBody.events.unread).toBe(2);
    // Idempotent re-acknowledgement.
    expect((await nPost(S1, { action: "markEventRead", eventId: first.id })).jsonBody.events.unread).toBe(1);
  });

  it("forged ids (another student's / another class's / malformed / message ids) are rejected with no write", async () => {
    const aid = await create();
    await useAttempt(aid, S2);
    await results(aid, { action: "allowRetry" }, S2);                                          // S2 personal event
    ctx.setJson(classEventPrefix(CB) + "x.json", {});                                        // noise
    const s2Event = (await eventItems(S2)).find(i => i.type === "assignment_retry_granted");
    const classEvent = (await eventItems(S1))[0];
    const before = everything();
    for (const eventId of [s2Event.id, "c-" + s2Event.id.slice(2), "s-" + classEvent.id.slice(2), "c-" + "9000000000001-0000000000000000", "x", "", null, { id: 1 }, "../../platform/users/" + S1]) {
      const r = await nPost(S1, { action: "markEventRead", eventId, studentId: S2, classId: CB });
      expect(r.status, String(eventId)).toBe(400);
    }
    expect(everything()).toBe(before);
    // A class-B student cannot acknowledge class A's event either.
    expect((await nPost(S3, { action: "markEventRead", eventId: classEvent.id })).status).toBe(400);
  });

  it("GET never takes a studentId / classId from the query: only the session's own + current-class events", async () => {
    const aid = await create();
    await useAttempt(aid, S2);
    await results(aid, { action: "allowRetry" }, S2);                                          // S2's personal event
    await recordEvent(ctx.container, { scope: "class", classId: CB, type: "assignment_published", dedupeKey: "cb", data: { assignmentId: "zz", assignmentTitle: "صف ب" } });
    for (const q of ["?studentId=" + S2, "?classId=" + CB, "?studentId=" + S2 + "&classId=" + CB + "&view=notifications"]) {
      const r = await nGet(S1, q);
      expect(r.status).toBe(200);
      expect(r.jsonBody.items.filter(i => i.type === "assignment_retry_granted")).toEqual([]);
      expect(JSON.stringify(r.jsonBody)).not.toContain("صف ب");
      expect(r.jsonBody.events.unread).toBe(1);                                                 // only class A's publication
    }
  });

  it("a hidden module's stale event can neither be listed nor acknowledged", async () => {
    await classrooms({ action: "setLearningCourseModules", classId: CA, courseId: "791381", moduleIds: ["791381-m02"] });
    const ev = (await eventItems(S1))[0];
    await classrooms({ action: "setLearningCourseModules", classId: CA, courseId: "791381", moduleIds: [] });
    expect(await eventItems(S1)).toEqual([]);
    expect((await nPost(S1, { action: "markEventRead", eventId: ev.id })).status).toBe(400);
  });

  it("acknowledgePosition: exact position only, compacts contiguous runs, never covers newer/older unread", () => {
    let s = normalizeEventReadState(null).personal;
    s = acknowledgePosition(s, 3).state;
    expect(s).toEqual({ through: 0, read: [3] });
    s = acknowledgePosition(s, 1).state;
    expect(s).toEqual({ through: 1, read: [3] });                                              // 2 still unread
    s = acknowledgePosition(s, 2).state;
    expect(s).toEqual({ through: 3, read: [] });
    expect(acknowledgePosition(s, 2).changed).toBe(false);
  });
});

describe("aggregation", () => {
  it("messages + events sum into the bell; ✉️ stays message-only; newest first; 99+ capping", async () => {
    await tMsg({ action: "sendDirect", studentId: S1, body: "مرحبا" });
    await create();
    const r = await nGet(S1);
    expect(r.jsonBody.messages.totalUnread).toBe(1);
    expect(r.jsonBody.events).toEqual({ unread: 1, capped: false });
    expect(r.jsonBody.bell).toEqual({ unread: 2, capped: false });
    const times = r.jsonBody.items.map(i => Date.parse(i.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    // 120 personal events → events capped at 99+, bell capped too; the preview stays bounded.
    for (let i = 0; i < 120; i++) {
      ctx.setJson("platform/assignments/bulk" + i + ".json", { assignmentId: "bulk" + i, classId: CA, status: "published", title: "واجب " + i });
      await recordEvent(ctx.container, { scope: "student", studentId: S1, type: "assignment_retry_granted", dedupeKey: "bulk-" + i, data: { assignmentId: "bulk" + i, assignmentTitle: "واجب " + i } });
    }
    const big = await nGet(S1);
    expect(big.jsonBody.events).toEqual({ unread: 99, capped: true });
    expect(big.jsonBody.bell).toEqual({ unread: 99, capped: true });
    expect(big.jsonBody.messages.totalUnread).toBe(1);
    expect(big.jsonBody.items.length).toBe(10);                                                 // the bounded preview
  }, 30000);

  it("dedupe: re-recording the same transition publishes nothing new; recordEventSafely never throws", async () => {
    const ev = { scope: "student", studentId: S1, type: "teacher_note", dedupeKey: "same", data: { postId: "p1", notePreview: "x" } };
    expect((await recordEvent(ctx.container, ev)).recorded).toBe(true);
    expect((await recordEvent(ctx.container, ev)).duplicate).toBe(true);
    expect(eventBlobs(studentEventPrefix(S1))).toHaveLength(1);
    const bad = await recordEventSafely(ctx.container, { ...ev, type: "nope" }, {}, OBS);
    expect(bad.failed).toBe(true);
  });

  it("an archived class exposes no class events (personal ones remain)", async () => {
    await create();
    const other = await create({ title: "آخر" });
    await useAttempt(other);
    await results(other, { action: "allowRetry" });
    ctx.setJson("platform/classes/" + CA + ".json", { ...ctx.getJson("platform/classes/" + CA + ".json"), status: "archived", active: false });
    expect(await types(S1)).toEqual(["assignment_retry_granted"]);
  });

  it("unauthenticated → 401 with nothing read or written", async () => {
    const r = await notificationsHandler({ method: "GET", url: "https://x/api/student-notifications", headers: { get: () => null } }, { container: ctx.container, requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }) });
    expect(r.status).toBe(401);
  });
});

// ── Review fix (PR #186) — personal assignment events are re-validated; hidden events never starve the scan. ──
describe("personal assignment events are re-validated against the CURRENT assignment", () => {
  const A = "rev-assignment";
  const seedAssignment = (over = {}) => ctx.setJson("platform/assignments/" + A + ".json", { assignmentId: A, classId: CA, status: "published", title: "العنوان الحالي", ...over });
  const recordReview = () => recordEvent(ctx.container, { scope: "student", studentId: S1, type: "assignment_reviewed", dedupeKey: "rv-" + Math.random(), data: { assignmentId: A, assignmentTitle: "عنوان قديم مخزّن", attemptNumber: 1, becameFinal: true, scoreChanged: true, feedbackChanged: false, finalized: true, percentage: 70 } });
  const reviewed = async () => (await eventItems(S1)).filter(i => i.type === "assignment_reviewed");

  it("5. the title shown is the CURRENT assignment title, never the stored one", async () => {
    seedAssignment();
    await recordReview();
    const got = await reviewed();
    expect(got).toHaveLength(1);
    expect(got[0].assignmentTitle).toBe("العنوان الحالي");
    expect(JSON.stringify(await nGet(S1))).not.toContain("عنوان قديم مخزّن");
    seedAssignment({ title: "عنوان معدّل" });
    expect((await reviewed())[0].assignmentTitle).toBe("عنوان معدّل");
  });

  for (const [label, change] of [
    ["1. draft", () => seedAssignment({ status: "draft" })],
    ["2. archived", () => seedAssignment({ status: "archived" })],
    ["3. deleted", () => ctx.store.delete("platform/assignments/" + A + ".json")],
    ["4. the student moved to another class", () => ctx.setJson("platform/users/" + S1 + ".json", { ...ctx.getJson("platform/users/" + S1 + ".json"), classId: CB })]
  ]) {
    it(label + " → the personal review disappears: not shown, not counted, not acknowledgeable", async () => {
      seedAssignment();
      await recordReview();
      const before = await reviewed();
      expect(before).toHaveLength(1);
      expect((await nGet(S1, "?view=unread")).jsonBody.events.unread).toBe(1);
      change();
      expect(await reviewed()).toEqual([]);
      const counts = (await nGet(S1, "?view=unread")).jsonBody;
      expect(counts.events).toEqual({ unread: 0, capped: false });
      expect(counts.bell).toEqual({ unread: 0, capped: false });
      // 6. an old / forged acknowledgement of the no-longer-valid event is refused with no write
      const tag = everything();
      expect((await nPost(S1, { action: "markEventRead", eventId: before[0].id })).status).toBe(400);
      expect(everything()).toBe(tag);
    });
  }

  it("every personal assignment type is re-validated (deadline / reopen / retry / attempt time); recognition is not", async () => {
    seedAssignment({ status: "draft" });
    for (const [type, extra] of [["assignment_deadline_extended", { dueAt: iso(Date.now() + MIN) }], ["assignment_reopened", {}], ["assignment_retry_granted", {}], ["attempt_time_extended", { attemptNumber: 1 }]]) {
      await recordEvent(ctx.container, { scope: "student", studentId: S1, type, dedupeKey: "t-" + type, data: { assignmentId: A, assignmentTitle: "قديم", ...extra } });
    }
    await recordEvent(ctx.container, { scope: "student", studentId: S1, type: "teacher_note", dedupeKey: "note", data: { postId: "p1", notePreview: "ملاحظة" } });
    expect(await types(S1)).toEqual(["teacher_note"]);
    seedAssignment();
    expect((await types(S1)).sort()).toEqual(["assignment_deadline_extended", "assignment_reopened", "assignment_retry_granted", "attempt_time_extended", "teacher_note"]);
  });
});

describe("hidden events never starve the visible scan / preview limit", () => {
  it("7/10. more than 150 newer hidden events do not hide an older valid unread one, and never count", async () => {
    ctx.setJson("platform/assignments/valid.json", { assignmentId: "valid", classId: CA, status: "published", title: "الواجب الصالح" });
    ctx.setJson("platform/assignments/hidden.json", { assignmentId: "hidden", classId: CA, status: "draft", title: "مخفي" });
    await recordEvent(ctx.container, { scope: "student", studentId: S1, type: "assignment_retry_granted", dedupeKey: "old-valid", data: { assignmentId: "valid", assignmentTitle: "x" } });
    for (let i = 0; i < 200; i++) await recordEvent(ctx.container, { scope: "student", studentId: S1, type: "assignment_retry_granted", dedupeKey: "hidden-" + i, data: { assignmentId: "hidden", assignmentTitle: "مخفي" } });
    const r = await nGet(S1);
    expect(r.jsonBody.items.map(i => i.assignmentTitle)).toEqual(["الواجب الصالح"]);
    expect(r.jsonBody.events).toEqual({ unread: 1, capped: false });
    expect(r.jsonBody.bell).toEqual({ unread: 1, capped: false });
    expect((await nGet(S1, "?view=unread")).jsonBody.events).toEqual({ unread: 1, capped: false });
    expect(JSON.stringify(r.jsonBody)).not.toContain("مخفي");
    // …and it can still be acknowledged.
    expect((await nPost(S1, { action: "markEventRead", eventId: r.jsonBody.items[0].id })).jsonBody.events).toEqual({ unread: 0, capped: false });
  }, 60000);

  it("8/9. 30 valid notifications: the preview shows the newest 10, the bell still reports all 30", async () => {
    for (let i = 0; i < 30; i++) {
      tick();
      ctx.setJson("platform/assignments/v" + i + ".json", { assignmentId: "v" + i, classId: CA, status: "published", title: "واجب " + i });
      await recordEvent(ctx.container, { scope: "student", studentId: S1, type: "assignment_retry_granted", dedupeKey: "v-" + i, data: { assignmentId: "v" + i, assignmentTitle: "x" } });
    }
    const r = await nGet(S1);
    expect(r.jsonBody.items).toHaveLength(10);
    expect(r.jsonBody.items.map(i => i.assignmentTitle)).toEqual(Array.from({ length: 10 }, (_, k) => "واجب " + (29 - k)));
    expect(r.jsonBody.events).toEqual({ unread: 30, capped: false });
    expect(r.jsonBody.bell).toEqual({ unread: 30, capped: false });
    expect((await nGet(S1, "?view=unread")).jsonBody.bell).toEqual({ unread: 30, capped: false });
  }, 30000);
});
