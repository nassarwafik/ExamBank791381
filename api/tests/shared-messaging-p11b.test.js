import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P11-B — a student in a class of ANOTHER teacher (P11-A: student.sharedClasses) has a SEPARATE conversation with that teacher
// (owner decision: «محادثة منفصلة لكل معلم»), sees that class's announcements, and gets its assignment notifications. TEST data only.
//   the home conversation (teacher A) is untouched; the conversation of the shared class (teacher B) is another stream;
//   neither teacher ever reads the other's conversation; a student selects only a class of their own;
//   unread counts, the bell, reminders and pushes reach the shared class; leaving the class closes its conversation (nothing deleted);
//   deleting the account purges it; the owner reads it under the D14 rules.
// The first block (a shared student, state seeded directly as P11-A stores it) is the FAIL-FIRST evidence: it runs on main.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p11b-shared-messaging-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: messages } = await import("../src/functions/messages.js");
const { handler: studentMessages } = await import("../src/functions/student-messages.js");
const { handler: studentNotifications } = await import("../src/functions/student-notifications.js");
const { handler: results } = await import("../src/functions/assignment-results.js");
const { handler: students } = await import("../src/functions/manage-students.js");
const { handler: ownerClasses } = await import("../src/functions/owner-classes.js");
const { handler: ownerConversations } = await import("../src/functions/owner-conversations.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { directPrefix, sequencedMessageId } = await import("../src/lib/message-store.js");
const { createUnreadMemo } = await import("../src/lib/message-unread-memo.js");
const { recordEvent } = cjs("../src/lib/notification-events.js");
const { pushForEvent } = cjs("../src/lib/event-push.js");
const { runReminderSweep } = cjs("../src/lib/assignment-reminder-sweep.js");
const { purgeStudentStep } = cjs("../src/lib/student-messaging-purge.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");
const { studentCodeHash, hashPassword } = cjs("../src/lib/student-auth.js");

const OWNER_ID = "own_0011223344556677";
const A = "t_00112233445566aa", B = "t_00112233445566bb", C = "t_00112233445566cc";
const S = "11111111-1111-1111-1111-111111111111";      // home: cA (teacher A); shares cB (teacher B)
const S2 = "22222222-2222-2222-2222-222222222222";     // teacher B's own student (cB)
const USER = id => "platform/users/" + id + ".json";
const SHARED = "platform/messages/shared/cB/" + S + "/";
const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const future = (days = 7) => new Date(Date.now() + days * 86400000).toISOString();
const cls = (classId, ownerId, over = {}) => ({ schemaVersion: 1, classId, name: "صف " + classId, grade: "12", schoolYear: "2026-2027", active: true, status: "active", studentIds: [], ownerId, createdAt: "2026-09-01T00:00:00.000Z", ...over });
const assignment = (assignmentId, classId, over = {}) => ({
  schemaVersion: 2, attemptModelVersion: 2, assignmentId, classId, title: "واجب " + assignmentId, instructions: "", status: "published", openAt: "", dueAt: future(),
  maxAttempts: 2, durationMinutes: 0, questionCount: 1, totalMarks: 10,
  examSnapshot: { title: "امتحان", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "اشرح", marks: 10, answer: { text: "SECRET" } }] },
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...over
});

function setup({ shared = true } = {}) {
  resetOperatorGateCache();
  const student = (userId, classId, ownerId, displayName, identityNumber, over = {}) => ({
    schemaVersion: 3, role: "student", userId, classId, ownerId, displayName, firstName: displayName.split(" ")[0], familyName: displayName.split(" ")[1],
    code: identityNumber, identityNumber, active: true, archived: false, authVersion: 1, profileRevision: 0, createdAt: "2026-09-02T00:00:00.000Z", ...over
  });
  const mem = createMemoryContainer({
    "platform/classes/cA.json": cls("cA", A, { studentIds: [S] }), "platform/classes/cB.json": cls("cB", B, { studentIds: shared ? [S, S2] : [S2] }),
    "platform/classes/cB2.json": cls("cB2", B), "platform/classes/cC.json": cls("cC", C),
    [USER(S)]: student(S, "cA", A, "ليان سعيد", "300000001", shared ? { sharedClasses: [{ classId: "cB", addedAt: "2026-10-01T00:00:00.000Z", addedBy: "owner:" + OWNER_ID }] } : {}),
    [USER(S2)]: student(S2, "cB", B, "كريم ناصر", "300000002"),
    "platform/assignments/a1.json": assignment("a1", "cA"), "platform/assignments/b1.json": assignment("b1", "cB"), "platform/assignments/c1.json": assignment("c1", "cC")
  });
  for (const [userId, code] of [[S, "300000001"], [S2, "300000002"]]) mem.setJson("platform/auth/" + studentCodeHash(code) + ".json", { schemaVersion: 3, userId, codeHash: studentCodeHash(code), ...hashPassword("initial-pass-1"), active: true, authVersion: 1, createdAt: "2026-09-02T00:00:00.000Z" });
  // the HOME conversation: one message of the student to teacher A
  const prefix = directPrefix(S), homeId = sequencedMessageId(prefix, 1);
  mem.setJson(prefix + homeId + ".json", { schemaVersion: 1, messageId: homeId, createdAt: "2026-10-03T08:00:00.000Z", kind: "direct", studentId: S, senderRole: "student", senderId: S, senderDisplayName: "ليان", body: "سؤال خاص لمعلمتي", classIdAtSend: "cA" });
  const now = Date.now();
  for (const [id, username] of [[A, "t.sara"], [B, "t.omar"], [C, "t.huda"]]) mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName: username, status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [] });
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const sid = "c".repeat(32);
  mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now });
  const owner = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  const audits = [];
  const base = { getContainer: () => mem.container, container: mem.container, recordAuditEvent: async (_c, ev) => { audits.push(ev); } };
  const as = sub => ({ ...base, requireBuilderAuth: () => ({ ok: true, user: { sub, am: "multi-user" } }), unreadMemo: createUnreadMemo(), resolveTeacherDisplayName: async (_c, id) => "أ. " + id.slice(-2), notifyStudentOfNewMessage: async () => {} });
  const asStudent = (id = S) => ({ container: mem.container, getContainer: () => mem.container, requireStudentAuth: () => ({ ok: true, user: { sub: id, sv: 1, role: "student" } }), unreadMemo: createUnreadMemo(), resolveTeacherDisplayName: async (_c, tid) => "أ. " + String(tid).slice(-2) });
  return { mem, homeId, owner, ownerDeps: base, as, asStudent, audits };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const tGet = (ctx, sub, query) => messages({ method: "GET", url: "https://x/api/messages?" + query, headers: hdr({}) }, ctx.as(sub), quiet);
const tPost = (ctx, sub, body) => messages({ method: "POST", url: "https://x/api/messages", headers: hdr({}), json: async () => body }, ctx.as(sub), quiet);
const sGet = (ctx, query = "", id = S) => studentMessages({ method: "GET", url: "https://x/api/student-messages" + (query ? "?" + query : ""), headers: hdr({}) }, ctx.asStudent(id), quiet);
const sPost = (ctx, body, id = S) => studentMessages({ method: "POST", url: "https://x/api/student-messages", headers: hdr({}), json: async () => body }, ctx.asStudent(id), quiet);
const bell = (ctx, view = "notifications", id = S) => studentNotifications({ method: "GET", url: "https://x/api/student-notifications?view=" + view, headers: hdr({}) }, ctx.asStudent(id), quiet);
const ownerPost = (ctx, handler, action, body) => handler({ method: "POST", url: "https://x/api/o/" + action, params: { action }, headers: hdr(ctx.owner), json: async () => body }, ctx.ownerDeps);
const bodies = r => r.jsonBody.messages.map(m => m.body);
const sharedDocs = ctx => ctx.mem.names(SHARED).map(n => ctx.mem.getJson(n));
const tSend = (ctx, text = "مرحبًا من معلم الصف الثاني") => tPost(ctx, B, { action: "sendDirect", studentId: S, conversation: "cB", body: text });
const snapshot = ctx => JSON.stringify([...ctx.mem.store.entries()].map(([name, e]) => [name, e.content.toString("utf8")]).sort());
// every stored MESSAGE (both conversations) — a reader's own read marker may move, a message never may
const stored = ctx => JSON.stringify([...ctx.mem.store.entries()].filter(([name]) => name.startsWith("platform/messages/direct/") || name.startsWith("platform/messages/shared/")).map(([name, e]) => [name, e.content.toString("utf8")]).sort());

describe("P11-B fail-first — the conversation of a shared class (state seeded directly)", () => {
  it("teacher B opens a conversation with the shared student and writes; it is a SEPARATE stream that names its class", async () => {
    const ctx = setup();
    const open = await tGet(ctx, B, "studentId=" + S + "&conversation=cB");
    expect(open.status, JSON.stringify(open.jsonBody)).toBe(200);
    expect(open.jsonBody).toMatchObject({ canSend: true, messages: [], student: { userId: S, classId: "cB", shared: true } });
    const sent = await tSend(ctx);
    expect(sent.status, JSON.stringify(sent.jsonBody)).toBe(200);
    expect(sharedDocs(ctx)).toEqual([expect.objectContaining({ kind: "direct", studentId: S, sharedClassId: "cB", senderRole: "teacher", senderId: B, classIdAtSend: "cB" })]);
    expect(ctx.mem.names(directPrefix(S))).toHaveLength(1);                                      // the home conversation got nothing
    expect(bodies(await tGet(ctx, B, "studentId=" + S + "&conversation=cB"))).toEqual(["مرحبًا من معلم الصف الثاني"]);
    expect(bodies(await tGet(ctx, B, "studentId=" + S))).toEqual(["مرحبًا من معلم الصف الثاني"]);   // without the class: B's only conversation with S
  });
  it("the student sees one conversation per teacher, reads teacher B's message in ITS conversation and replies there", async () => {
    const ctx = setup();
    await tSend(ctx);
    const home = await sGet(ctx);
    expect(home.status, JSON.stringify(home.jsonBody)).toBe(200);
    expect(home.jsonBody.direct.map(m => m.body)).toEqual(["سؤال خاص لمعلمتي"]);
    expect(home.jsonBody.conversations).toEqual([
      expect.objectContaining({ id: "", home: true, selected: true, name: "صف cA", unread: 0, teacherName: "أ. aa" }),
      expect.objectContaining({ id: "cB", home: false, selected: false, name: "صف cB", unread: 1, teacherName: "أ. bb" })
    ]);
    const other = await sGet(ctx, "conversation=cB");
    expect(other.status, JSON.stringify(other.jsonBody)).toBe(200);
    expect(other.jsonBody).toMatchObject({ conversation: "cB", canSend: true, classroom: { classId: "cB", name: "صف cB" } });
    expect(other.jsonBody.direct.map(m => m.body)).toEqual(["مرحبًا من معلم الصف الثاني"]);
    const reply = await sPost(ctx, { action: "sendDirect", conversation: "cB", body: "شكرًا أستاذ" });
    expect(reply.status, JSON.stringify(reply.jsonBody)).toBe(200);
    expect(sharedDocs(ctx).map(d => [d.senderRole, d.sharedClassId])).toEqual([["teacher", "cB"], ["student", "cB"]]);
    expect(ctx.mem.names(directPrefix(S))).toHaveLength(1);
    expect(bodies(await tGet(ctx, B, "studentId=" + S + "&conversation=cB"))).toEqual(["مرحبًا من معلم الصف الثاني", "شكرًا أستاذ"]);
  });
  it("unread counts follow each conversation: the student's total, teacher B's badge and class summary, and marking read", async () => {
    const ctx = setup();
    await tSend(ctx);
    // the total covers every conversation (the portal's badge); the two stream counts are the SELECTED conversation's own
    expect((await sGet(ctx, "view=unread")).jsonBody).toMatchObject({ totalUnread: 1, directUnread: { unread: 0 }, conversations: [expect.objectContaining({ id: "", unread: 0 }), expect.objectContaining({ id: "cB", unread: 1 })] });
    expect((await sGet(ctx, "view=unread&conversation=cB")).jsonBody).toMatchObject({ totalUnread: 1, directUnread: { unread: 1 } });
    const page = await sGet(ctx, "conversation=cB");
    const last = page.jsonBody.direct[0].messageId;
    const marked = await sPost(ctx, { action: "markRead", conversation: "cB", stream: "direct", throughMessageId: last, seenIdsAtBoundary: [last] });
    expect(marked.status, JSON.stringify(marked.jsonBody)).toBe(200);
    expect(marked.jsonBody.totalUnread).toBe(0);
    await sPost(ctx, { action: "sendDirect", conversation: "cB", body: "سؤال عن الواجب" });
    expect((await tGet(ctx, B, "kind=unread-summary")).jsonBody.totalUnread).toBe(1);
    expect((await tGet(ctx, B, "kind=unread-summary&classId=cB")).jsonBody).toMatchObject({ totalUnread: 1, byStudent: { [S]: { unread: 1 } } });
    expect((await tGet(ctx, A, "kind=unread-summary")).jsonBody.totalUnread).toBe(1);            // A's own: the home message only
    const thread = await tGet(ctx, B, "studentId=" + S + "&conversation=cB");
    const studentMsg = thread.jsonBody.messages.find(m => m.senderRole === "student").messageId;
    const read = await tPost(ctx, B, { action: "markDirectRead", studentId: S, conversation: "cB", throughMessageId: studentMsg, seenIdsAtBoundary: [studentMsg] });
    expect(read.status, JSON.stringify(read.jsonBody)).toBe(200);
    expect((await tGet(ctx, B, "kind=unread-summary")).jsonBody.totalUnread).toBe(0);
    expect((await tGet(ctx, A, "kind=unread-summary")).jsonBody.totalUnread).toBe(1);            // untouched by B's acknowledgement
  });
  it("the shared class's announcements reach the student in that conversation only", async () => {
    const ctx = setup();
    expect((await tPost(ctx, B, { action: "sendAnnouncement", classId: "cB", body: "اختبار يوم الأحد" })).status).toBe(200);
    expect((await sGet(ctx)).jsonBody.announcements).toEqual([]);
    expect((await sGet(ctx, "conversation=cB")).jsonBody.announcements.map(m => m.body)).toEqual(["اختبار يوم الأحد"]);
    expect((await sGet(ctx, "view=unread")).jsonBody).toMatchObject({ totalUnread: 1, announcementUnread: { unread: 0 } });
    expect((await sGet(ctx, "view=unread&conversation=cB")).jsonBody).toMatchObject({ totalUnread: 1, announcementUnread: { unread: 1 } });
  });
  it("the bell shows the shared class's assignment events and messages; one of its events can be marked read", async () => {
    const ctx = setup();
    await recordEvent(ctx.mem.container, { scope: "class", classId: "cB", type: "assignment_published", dedupeKey: "pub:b1", data: { assignmentId: "b1", assignmentTitle: "واجب b1" } });
    await recordEvent(ctx.mem.container, { scope: "student", studentId: S, type: "assignment_reminder", dedupeKey: "rem:b1", data: { assignmentId: "b1", assignmentTitle: "واجب b1", dueAt: future() } });
    // an event about an assignment of a class that is NOT the student's stays hidden (and uncounted), as before
    await recordEvent(ctx.mem.container, { scope: "student", studentId: S, type: "assignment_reminder", dedupeKey: "rem:c1", data: { assignmentId: "c1", assignmentTitle: "واجب c1", dueAt: future() } });
    await tSend(ctx);
    const r = await bell(ctx);
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(r.jsonBody.items.map(i => i.type).sort()).toEqual(["assignment_published", "assignment_reminder", "direct"]);
    expect(r.jsonBody).toMatchObject({ events: { unread: 2 }, messages: { totalUnread: 1 }, bell: { unread: 3 }, services: { messages: true } });
    const classEvent = r.jsonBody.items.find(i => i.type === "assignment_published");
    expect(classEvent).toMatchObject({ assignmentId: "b1", id: expect.stringMatching(/^c-/) });
    const mark = await studentNotifications({ method: "POST", url: "https://x/api/student-notifications", headers: hdr({}), json: async () => ({ action: "markEventRead", eventId: classEvent.id }) }, ctx.asStudent(), quiet);
    expect(mark.status, JSON.stringify(mark.jsonBody)).toBe(200);
    expect(mark.jsonBody.events.unread).toBe(1);
  });
  it("«تذكير», the automatic reminder and the push reach the shared student", async () => {
    const ctx = setup();
    const r = await results({ method: "POST", url: "https://x/api/assignment-results", headers: hdr({}), json: async () => ({ action: "remindStudents", assignmentId: "b1", studentIds: [S] }) }, ctx.as(B), quiet);
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(r.jsonBody.reminded).toBe(1);
    expect((await bell(ctx)).jsonBody.items.map(i => i.type)).toEqual(["assignment_reminder"]);
    const pushed = [];
    const push = await pushForEvent(ctx.mem.container, { scope: "class", classId: "cB", type: "assignment_published", data: { assignmentId: "b1" } }, { pushConfig: () => ({ available: true }), notifyStudentOfAssignmentEvent: async (_c, id) => { pushed.push(id); return { delivered: 1 }; } });
    expect(push.status).toBe("sent");
    expect(pushed.sort()).toEqual([S, S2].sort());
    ctx.mem.setJson("platform/assignments/b1.json", assignment("b1", "cB", { dueAt: new Date(Date.now() + 3600e3).toISOString() }));
    const sweep = await runReminderSweep(ctx.mem.container, {});
    expect(sweep.reminded).toBe(2);                                                              // S (shared) and S2
  });
});

describe("P11-B isolation — each teacher's conversation is theirs alone", () => {
  let ctx;
  beforeEach(async () => { ctx = setup(); await tSend(ctx); });
  it("teacher A never reaches the conversation of teacher B's class: read, send, acknowledge, edit, delete — 404, nothing written", async () => {
    const id = sharedDocs(ctx)[0].messageId;
    const before = snapshot(ctx);
    expect((await tGet(ctx, A, "studentId=" + S + "&conversation=cB")).status).toBe(404);
    for (const body of [
      { action: "sendDirect", studentId: S, conversation: "cB", body: "تجربة" }, { action: "markDirectRead", studentId: S, conversation: "cB", throughMessageId: id, seenIdsAtBoundary: [id] },
      { action: "editMessage", studentId: S, conversation: "cB", messageId: id, body: "تعديل" }, { action: "deleteMessage", studentId: S, conversation: "cB", messageId: id }
    ]) expect([body.action, (await tPost(ctx, A, body)).status]).toEqual([body.action, 404]);
    expect(snapshot(ctx)).toBe(before);
    const home = await tGet(ctx, A, "studentId=" + S);
    expect(bodies(home)).toEqual(["سؤال خاص لمعلمتي"]);                                           // A's own conversation: without B's message
    expect(JSON.stringify((await tGet(ctx, A, "kind=unread-summary&classId=cA")).jsonBody)).not.toContain("معلم الصف الثاني");
  });
  it("teacher B never reaches the student's conversation with teacher A — whatever the request names", async () => {
    const before = stored(ctx);
    for (const q of ["studentId=" + S, "studentId=" + S + "&conversation=cB", "studentId=" + S + "&conversation=cB2"]) {
      const r = await tGet(ctx, B, q);
      expect(JSON.stringify(r.jsonBody)).not.toContain("سؤال خاص");
    }
    expect((await tGet(ctx, B, "studentId=" + S + "&conversation=cA")).status).toBe(404);
    expect((await tGet(ctx, B, "studentId=" + S + "&conversation=cB2")).status).toBe(404);            // B's other class: the student is not in it
    const del = await tPost(ctx, B, { action: "deleteMessage", studentId: S, messageId: ctx.homeId });
    expect(del.status).toBeGreaterThanOrEqual(400);                                              // the home message is not in B's conversation
    const del2 = await tPost(ctx, B, { action: "deleteMessage", studentId: S, conversation: "cA", messageId: ctx.homeId });
    expect(del2.status).toBe(404);
    expect(ctx.mem.getJson(directPrefix(S) + ctx.homeId + ".json").body).toBe("سؤال خاص لمعلمتي");
    expect(stored(ctx)).toBe(before);
    expect((await tGet(ctx, B, "kind=unread-summary")).jsonBody.totalUnread).toBe(0);            // A's unread reply is not B's
  });
  it("a teacher who shares nothing with the student reaches neither conversation", async () => {
    for (const q of ["studentId=" + S, "studentId=" + S + "&conversation=cB", "studentId=" + S + "&conversation=cC"]) expect((await tGet(ctx, C, q)).status).toBe(404);
    expect((await tPost(ctx, C, { action: "sendDirect", studentId: S, body: "تجربة" })).status).toBe(404);
    expect((await tGet(ctx, C, "kind=unread-summary")).jsonBody.totalUnread).toBe(0);
  });
  it("the student selects only a class they share; the old `classId` body field is still ignored", async () => {
    for (const id of ["cC", "cB2", "nope", "../x"]) expect((await sGet(ctx, "conversation=" + encodeURIComponent(id))).status).toBe(404);
    expect((await sPost(ctx, { action: "sendDirect", conversation: "cC", body: "تجربة" })).status).toBe(404);
    const before = ctx.mem.names(SHARED).length;
    const r = await sPost(ctx, { action: "sendDirect", classId: "cB", studentId: S2, body: "إلى معلمتي الأولى" });
    expect(r.status).toBe(200);
    expect(ctx.mem.names(SHARED)).toHaveLength(before);                                          // went to the HOME conversation
    expect(ctx.mem.names(directPrefix(S))).toHaveLength(2);
    expect((await sGet(ctx, "conversation=cB", S2)).status).toBe(404);                            // cB is S2's HOME class, not a shared one
  });
  it("a message of one conversation is never valid in the other, even at the same stream position", async () => {
    // a document of the home conversation copied under the shared prefix (and the reverse) is rejected by the stream's own shape
    const shared = sharedDocs(ctx)[0];
    ctx.mem.setJson(directPrefix(S) + sequencedMessageId(directPrefix(S), 2) + ".json", { ...shared, messageId: sequencedMessageId(directPrefix(S), 2) });
    expect(bodies(await tGet(ctx, A, "studentId=" + S))).toEqual(["سؤال خاص لمعلمتي"]);
    const home = ctx.mem.getJson(directPrefix(S) + ctx.homeId + ".json");
    ctx.mem.setJson(SHARED + sequencedMessageId(SHARED, 2) + ".json", { ...home, messageId: sequencedMessageId(SHARED, 2) });
    expect(bodies(await tGet(ctx, B, "studentId=" + S + "&conversation=cB"))).toEqual(["مرحبًا من معلم الصف الثاني"]);
  });
});

describe("P11-B the conversation's life", () => {
  let ctx;
  beforeEach(async () => { ctx = setup(); await tSend(ctx); });
  it("edit and delete stay inside the conversation: teacher B's own message, the student's own reply", async () => {
    const id = sharedDocs(ctx)[0].messageId;
    const edited = await tPost(ctx, B, { action: "editMessage", studentId: S, conversation: "cB", messageId: id, body: "مرحبًا (معدّلة)" });
    expect(edited.status, JSON.stringify(edited.jsonBody)).toBe(200);
    expect(ctx.mem.getJson(SHARED + id + ".json").body).toBe("مرحبًا (معدّلة)");
    const reply = await sPost(ctx, { action: "sendDirect", conversation: "cB", body: "رد سأحذفه" });
    const del = await sPost(ctx, { action: "deleteMessage", conversation: "cB", messageId: reply.jsonBody.message.messageId });
    expect(del.status, JSON.stringify(del.jsonBody)).toBe(200);
    expect(del.jsonBody.message.deleted).toBe(true);
    expect((await sPost(ctx, { action: "deleteMessage", messageId: reply.jsonBody.message.messageId })).status).toBeGreaterThanOrEqual(400);   // not in the home conversation
  });
  it("an archived shared class is read-only for both sides; the home conversation keeps working", async () => {
    ctx.mem.setJson("platform/classes/cB.json", cls("cB", B, { active: false, status: "archived", studentIds: [S, S2] }));
    expect((await tGet(ctx, B, "studentId=" + S + "&conversation=cB")).jsonBody).toMatchObject({ canSend: false, readOnlyCode: "classArchived" });
    expect((await tSend(ctx, "بعد الأرشفة")).status).toBe(403);
    const view = await sGet(ctx, "conversation=cB");
    expect(view.jsonBody).toMatchObject({ canSend: false, readOnlyCode: "classArchived" });
    expect(view.jsonBody.direct).toHaveLength(1);                                                // still readable
    expect((await sPost(ctx, { action: "sendDirect", conversation: "cB", body: "رد" })).status).toBe(403);
    expect((await sPost(ctx, { action: "sendDirect", body: "إلى معلمتي الأولى" })).status).toBe(200);
  });
  it("leaving the shared class closes its conversation for both sides — nothing is deleted, the home one is untouched", async () => {
    await sPost(ctx, { action: "sendDirect", conversation: "cB", body: "سؤال قبل المغادرة" });
    expect((await tGet(ctx, B, "kind=unread-summary")).jsonBody.totalUnread).toBe(1);
    const left = await students({ method: "POST", url: "https://x/api/students", headers: hdr({}), json: async () => ({ action: "unenroll", userId: S, classId: "cB" }) }, ctx.as(B), quiet);
    expect(left.status, JSON.stringify(left.jsonBody)).toBe(200);
    expect((await tGet(ctx, B, "studentId=" + S + "&conversation=cB")).status).toBe(404);
    expect((await tGet(ctx, B, "studentId=" + S)).status).toBe(404);
    expect((await tSend(ctx, "بعد المغادرة")).status).toBe(404);
    expect((await tGet(ctx, B, "kind=unread-summary")).jsonBody.totalUnread).toBe(0);
    expect((await sGet(ctx, "conversation=cB")).status).toBe(404);
    const home = await sGet(ctx);
    expect(home.jsonBody.conversations).toBeUndefined();                                         // one conversation again
    expect(home.jsonBody.direct.map(m => m.body)).toEqual(["سؤال خاص لمعلمتي"]);
    expect(ctx.mem.names(SHARED)).toHaveLength(2);                                               // stored history kept
  });
  it("deleting the account purges the shared conversation and every marker of it", async () => {
    const page = await sGet(ctx, "conversation=cB");
    const last = page.jsonBody.direct[0].messageId;
    await sPost(ctx, { action: "markRead", conversation: "cB", stream: "direct", throughMessageId: last, seenIdsAtBoundary: [last] });
    const reply = await sPost(ctx, { action: "sendDirect", conversation: "cB", body: "رد" });
    await tPost(ctx, B, { action: "markDirectRead", studentId: S, conversation: "cB", throughMessageId: reply.jsonBody.message.messageId, seenIdsAtBoundary: [reply.jsonBody.message.messageId] });
    expect(ctx.mem.names("platform/messages/read-state/").filter(n => n.includes("/shared/")).length).toBe(2);
    const step = await purgeStudentStep(ctx.mem.container, S, { purgeStudentPush: async () => {} }, 1000);
    expect(step.complete).toBe(true);
    expect(ctx.mem.names("platform/messages/").filter(n => n.includes(S))).toEqual([]);
  });
  it("the owner reads the shared conversation under the D14 rules: named class, written reason, recorded for THAT class's teacher", async () => {
    const reason = "شكوى من ولي الأمر عن ردّ المعلم";
    const open = await ownerPost(ctx, ownerConversations, "open", { studentId: S, conversation: "cB", reason });
    expect(open.status, JSON.stringify(open.jsonBody)).toBe(200);
    expect(open.jsonBody.messages.map(m => m.body)).toEqual(["مرحبًا من معلم الصف الثاني"]);
    expect(ctx.audits.filter(e => e.action === "owner.conversation.opened").map(e => e.forTeacher)).toEqual([B]);
    const home = await ownerPost(ctx, ownerConversations, "open", { studentId: S, reason });
    expect(home.jsonBody.messages.map(m => m.body)).toEqual(["سؤال خاص لمعلمتي"]);
    expect(ctx.audits.filter(e => e.action === "owner.conversation.opened").map(e => e.forTeacher)).toEqual([B, A]);
    expect((await ownerPost(ctx, ownerConversations, "open", { studentId: S, conversation: "cC", reason })).status).toBe(404);
    expect((await ownerPost(ctx, ownerConversations, "open", { studentId: S2, conversation: "cB", reason })).status).toBe(404);   // cB is S2's home class
  });
  it("a student of ONE class gets exactly the answer it always got (no conversation list, same summary keys)", async () => {
    const one = setup({ shared: false });
    const r = await sGet(one);
    expect(Object.keys(r.jsonBody).sort()).toEqual(["announcements", "announcementsHasMore", "announcementsHasNewer", "canSend", "classroom", "direct", "directHasMore", "directHasNewer", "ok", "readOnlyCode", "readOnlyReason"]);
    expect(Object.keys((await sGet(one, "view=unread")).jsonBody).sort()).toEqual(["announcementUnread", "directUnread", "ok", "totalCapped", "totalUnread"]);
    expect((await tGet(one, B, "studentId=" + S)).status).toBe(404);                              // not shared: B has no conversation with S
    expect((await sGet(one, "conversation=cB")).status).toBe(404);
  });
});

describe("P11-B the owner's enrollment opens the conversation end to end", () => {
  it("after enroll-students, both sides can write; the transfer's conversation rules stay on the home conversation", async () => {
    const ctx = setup({ shared: false });
    const r = await ownerPost(ctx, ownerClasses, "enroll-students", { classId: "cB", userIds: [S] });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect((await tSend(ctx)).status).toBe(200);
    expect((await sPost(ctx, { action: "sendDirect", conversation: "cB", body: "وصلت" })).status).toBe(200);
    expect(sharedDocs(ctx)).toHaveLength(2);
  });
});
