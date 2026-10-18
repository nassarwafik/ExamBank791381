import { describe, it, expect } from "vitest";
import { handler as studentsHandler } from "../src/functions/manage-students.js";
import { handler as messagesHandler } from "../src/functions/messages.js";
import { studentCodeHash } from "../src/lib/student-auth.js";
import { directPrefix, announcementPrefix, sequencedMessageId } from "../src/lib/message-store.js";
import { teacherDirectStateName, studentDirectStateName, studentAnnouncementStateName } from "../src/lib/message-read-state.js";
import { bucketName } from "../src/lib/message-rate-limit.js";
import { studentEventPrefix, eventReadStateName } from "../src/lib/notification-events.js";
import { studentDocName, endpointDocName } from "../src/lib/push-subscriptions.js";
import { PURGE_STEP_BUDGET } from "../src/lib/student-messaging-purge.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Messages M.4 — deleting a student also removes that student's messaging data: the direct conversation, every read
// marker for it (the student's own and every teacher's), the send-rate bucket, the student's notification events and
// read state, and the student's Web Push registrations. Nothing of another student or of the class is touched. A
// purge interrupted by a failure is finished later from a durable purge record. Fail-first: run against 1b8db6b3.

const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const OLD = "2020-01-01T00:00:00.000Z";
const authName = code => "platform/auth/" + studentCodeHash(code) + ".json";
const user = (userId, code) => ({ userId, role: "student", active: true, archived: false, classId: "c1", displayName: "طالب " + userId, firstName: "طالب", familyName: userId, code, identityNumber: code, authVersion: 1 });
const ENDPOINT_ID = "a".repeat(64);

function seed() {
  const out = {
    "platform/classes/c1.json": { classId: "c1", name: "صف 1", active: true, status: "active", studentIds: ["s1", "s2"] },
    "platform/users/s1.json": user("s1", "100000001"),
    "platform/users/s2.json": user("s2", "100000002"),
    [authName("100000001")]: { userId: "s1", codeHash: studentCodeHash("100000001"), salt: "x", passwordHash: "y", active: true, authVersion: 1, createdAt: OLD },
    [authName("100000002")]: { userId: "s2", codeHash: studentCodeHash("100000002"), salt: "x", passwordHash: "y", active: true, authVersion: 1, createdAt: OLD },
    // messaging data of s1 …
    [teacherDirectStateName("teacher-1", "s1")]: { schemaVersion: 2, legacy: null, sequenced: null },
    [teacherDirectStateName("teacher-2", "s1")]: { schemaVersion: 2, legacy: null, sequenced: null },
    [studentDirectStateName("s1")]: { schemaVersion: 2, legacy: null, sequenced: null },
    [studentAnnouncementStateName("s1", "c1")]: { schemaVersion: 2, legacy: null, sequenced: null },
    [bucketName("student", "s1")]: { schemaVersion: 1, burstTokens: 3, dailyTokens: 100, updatedAt: 1 },
    [studentEventPrefix("s1") + "9000000000001-aaaaaaaaaaaaaaaa.json"]: { schemaVersion: 1, type: "grade_changed" },
    [eventReadStateName("s1")]: { schemaVersion: 1 },
    [studentDocName("s1")]: { schemaVersion: 2, studentId: "s1", subscriptions: [{ id: ENDPOINT_ID, endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "a", auth: "b" }, claim: "c1" }] },
    [endpointDocName(ENDPOINT_ID)]: { schemaVersion: 2, id: ENDPOINT_ID, studentId: "s1", claim: "c1" },
    // … and of s2 / the class, which must survive
    [teacherDirectStateName("teacher-1", "s2")]: { schemaVersion: 2, legacy: null, sequenced: null },
    [studentDirectStateName("s2")]: { schemaVersion: 2, legacy: null, sequenced: null },
    [bucketName("student", "s2")]: { schemaVersion: 1, burstTokens: 3, dailyTokens: 100, updatedAt: 1 },
    [eventReadStateName("s2")]: { schemaVersion: 1 }
  };
  const put = (prefix, p, doc) => { const id = sequencedMessageId(prefix, p); out[prefix + id + ".json"] = { schemaVersion: 1, messageId: id, createdAt: OLD, ...doc }; };
  for (let p = 1; p <= 3; p++) put(directPrefix("s1"), p, { kind: "direct", studentId: "s1", senderRole: p % 2 ? "student" : "teacher", senderId: "x", senderDisplayName: "x", body: "رسالة " + p });
  put(directPrefix("s2"), 1, { kind: "direct", studentId: "s2", senderRole: "student", senderId: "s2", senderDisplayName: "x", body: "باقية" });
  put(announcementPrefix("c1"), 1, { kind: "announcement", classId: "c1", senderRole: "teacher", senderId: "teacher-1", senderDisplayName: "x", body: "إعلان" });
  return out;
}

function ctxOf(hooks = {}) {
  const ctx = createMemoryContainer(seed(), hooks);
  ctx.audit = [];
  ctx.deps = { ...AUTH, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { ctx.audit.push(ev); }, resolveTeacherDisplayName: async () => "أ" };
  return ctx;
}
const students = (ctx, body, extra = {}) => studentsHandler({ method: "POST", url: "https://x/api/students", json: async () => body }, { ...ctx.deps, ...extra });
const badge = ctx => messagesHandler({ method: "GET", url: "https://x/api/messages?kind=unread-summary", headers: { get: () => null } }, ctx.deps);

/** Every stored blob that belongs to s1's messaging data. */
const s1Messaging = ctx => [
  ...ctx.names(directPrefix("s1")),
  ...ctx.names("platform/messages/read-state/").filter(n => n.endsWith("/direct/s1.json") || n.includes("/student/s1/")),
  ...[bucketName("student", "s1"), eventReadStateName("s1"), studentDocName("s1")].filter(n => ctx.has(n)),
  ...ctx.names(studentEventPrefix("s1"))
];
const s2AndClassIntact = ctx => {
  expect(ctx.names(directPrefix("s2"))).toHaveLength(1);
  expect(ctx.names(announcementPrefix("c1"))).toHaveLength(1);
  for (const n of [teacherDirectStateName("teacher-1", "s2"), studentDirectStateName("s2"), bucketName("student", "s2"), eventReadStateName("s2"), "platform/users/s2.json"]) expect(ctx.has(n), n).toBe(true);
};

describe("M.4 — deleting a student removes that student's messaging data", () => {
  it("single delete: conversation, all markers, rate bucket, notification events and push registrations are gone; s2 and the class are untouched", async () => {
    const ctx = ctxOf();
    expect(s1Messaging(ctx).length).toBeGreaterThan(8);
    const r = await students(ctx, { action: "delete", userId: "s1" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.deleted).toBe(true);
    expect(r.jsonBody.messagingPurged).toBe(true);
    expect(s1Messaging(ctx)).toEqual([]);
    expect(ctx.getJson(endpointDocName(ENDPOINT_ID)).studentId).toBe("");      // device released (CAS), never re-owned
    expect(ctx.names("platform/messages/purge/")).toEqual([]);                  // nothing left to finish
    s2AndClassIntact(ctx);
  });

  it("bulk delete purges each deleted student the same way", async () => {
    const ctx = ctxOf();
    const r = await students(ctx, { action: "bulkAction", operation: "delete", userIds: ["s1"] });
    expect(r.status).toBe(200);
    expect(s1Messaging(ctx)).toEqual([]);
    s2AndClassIntact(ctx);
  });

  it("a purge interrupted by a storage failure never fails the delete; the purge record finishes it on a later badge poll", async () => {
    let failing = true;
    const ctx = ctxOf();
    const orig = ctx.container.getBlobClient.bind(ctx.container);
    ctx.container.getBlobClient = name => {
      const c = orig(name);
      if (name.startsWith(directPrefix("s1"))) {
        const del = c.deleteIfExists.bind(c);
        c.deleteIfExists = async (...a) => { if (failing) { const e = new Error("storage unavailable"); e.statusCode = 503; throw e; } return del(...a); };
      }
      return c;
    };
    const r = await students(ctx, { action: "delete", userId: "s1" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.deleted).toBe(true);
    expect(r.jsonBody.messagingPurged).toBe(false);
    expect(ctx.has("platform/users/s1.json")).toBe(false);                      // the core delete happened
    expect(ctx.names("platform/messages/purge/")).toHaveLength(1);              // durable: to be finished
    failing = false;
    expect((await badge(ctx)).status).toBe(200);
    expect(s1Messaging(ctx)).toEqual([]);
    expect(ctx.names("platform/messages/purge/")).toEqual([]);
    s2AndClassIntact(ctx);
  });

  it("a purge record never removes the data of a student who still exists (an aborted delete); a stale one is dropped", async () => {
    const ctx = ctxOf();
    ctx.setJson("platform/messages/purge/s2.json", { schemaVersion: 1, studentId: "s2", requestedAt: new Date().toISOString() });
    await badge(ctx);
    s2AndClassIntact(ctx);
    expect(ctx.has("platform/messages/purge/s2.json")).toBe(true);              // recent: the delete may still be running
    ctx.setJson("platform/messages/purge/s2.json", { schemaVersion: 1, studentId: "s2", requestedAt: OLD });
    await badge(ctx);
    s2AndClassIntact(ctx);
    expect(ctx.has("platform/messages/purge/s2.json")).toBe(false);             // stale and the student exists → dropped
  });

  it("a long conversation is purged in bounded steps across polls, never in one unbounded request", async () => {
    const ctx = ctxOf();
    for (let p = 4; p <= 260; p++) {
      const id = sequencedMessageId(directPrefix("s1"), p);
      ctx.setJson(directPrefix("s1") + id + ".json", { schemaVersion: 1, messageId: id, kind: "direct", studentId: "s1", senderRole: "student", senderId: "s1", senderDisplayName: "x", body: "x", createdAt: OLD });
    }
    const r = await students(ctx, { action: "delete", userId: "s1" });
    expect(r.jsonBody.messagingPurged).toBe(false);                             // more than one step's budget
    expect(ctx.names(directPrefix("s1"))).toHaveLength(260 - PURGE_STEP_BUDGET);  // exactly one step's budget removed
    for (let i = 0; i < 5 && ctx.names("platform/messages/purge/").length; i++) await badge(ctx);
    expect(s1Messaging(ctx)).toEqual([]);
    expect(ctx.names("platform/messages/purge/")).toEqual([]);
  });

  it("the delete is audited with what was purged (counts only, never content)", async () => {
    const ctx = ctxOf();
    await students(ctx, { action: "delete", userId: "s1" });
    const ev = ctx.audit.find(e => e.action === "student.delete");
    expect(ev.details).toMatchObject({ messagingPurged: true });
    expect(JSON.stringify(ctx.audit)).not.toContain("رسالة");
  });
});
