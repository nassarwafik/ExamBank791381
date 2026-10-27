import { describe, it, expect } from "vitest";
import { createRequire } from "module";

// D4 (item 8) — assignment events reach the student's device: generic text only, visibility re-checked at send time, best effort and
// bounded, nothing at all when push is not configured.

const require_ = createRequire(import.meta.url);
const { pushForEvent, pushResultsReleased, PUSH_EVENT_TYPES } = require_("../src/lib/event-push.js");
const { notifyStudentOfAssignmentEvent, ASSIGNMENT_NOTIFICATIONS } = require_("../src/lib/push-notify.js");
const { recordEventSafely } = require_("../src/lib/notification-events.js");
const { createMemoryContainer } = require_("./fixtures/memory-container.js");
const { studentDocName, endpointDocName, endpointId } = require_("../src/lib/push-subscriptions.js");

const ON = () => ({ available: true, publicKey: "p", privateKey: "k", subject: "mailto:a@b.c" });
const OFF = () => ({ available: false, reason: "unconfigured" });
const A = (over = {}) => ({ assignmentId: "a1", classId: "c1", title: "واجب سري", status: "published", ...over });
const student = (id, over = {}) => ({ userId: id, role: "student", classId: "c1", archived: false, active: true, displayName: "x", ...over });
function world(extra = {}) {
  return createMemoryContainer({
    "platform/assignments/a1.json": A(),
    "platform/users/s1.json": student("s1"), "platform/users/s2.json": student("s2"),
    "platform/users/s3.json": student("s3", { archived: true }), "platform/users/s4.json": student("s4", { classId: "c2" }),
    "platform/users/s5.json": student("s5", { active: false }), "platform/users/t1.json": { userId: "t1", role: "teacher" },
    ...extra
  });
}
const recorder = () => { const calls = []; return { calls, notify: async (_c, id, type) => { calls.push([id, type]); return { status: "sent", delivered: 1 }; } }; };

describe("what is sent", () => {
  it("each pushable type has a fixed, generic Arabic text — never a title, a mark or a name", () => {
    expect([...PUSH_EVENT_TYPES].sort()).toEqual(["assignment_deadline_extended", "assignment_published", "assignment_reminder", "assignment_reopened", "assignment_retry_granted", "assignment_reviewed"]);
    for (const n of Object.values(ASSIGNMENT_NOTIFICATIONS)) {
      expect(Object.keys(n).sort()).toEqual(["body", "tag", "title", "type", "url"]);
      expect(n.url).toBe("./");
      expect(n.title + n.body).not.toMatch(/\{|\d/);
    }
  });
  it("the device payload is exactly the fixed notification; an unknown type sends nothing", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";
    const keys = { p256dh: Buffer.alloc(65, 1).toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") };
    const mem = createMemoryContainer();
    mem.setJson(studentDocName("s1"), { schemaVersion: 2, studentId: "s1", subscriptions: [{ id: endpointId(endpoint), endpoint, keys, claim: "c" }] });
    mem.setJson(endpointDocName(endpointId(endpoint)), { schemaVersion: 2, id: endpointId(endpoint), studentId: "s1", claim: "c" });
    const sent = [];
    const deps = { pushConfig: ON, sendNotification: async (_s, payload, options) => { sent.push({ payload: JSON.parse(payload), topic: options.topic }); } };
    const r = await notifyStudentOfAssignmentEvent(mem.container, "s1", "assignment_reminder", deps);
    expect(r).toMatchObject({ status: "sent", attempted: 1, delivered: 1 });
    expect(sent).toEqual([{ payload: ASSIGNMENT_NOTIFICATIONS.assignment_reminder, topic: "eb-reminder" }]);
    expect((await notifyStudentOfAssignmentEvent(mem.container, "s1", "teacher_reaction", deps)).status).toBe("unsupported");
  });
});

describe("who receives it", () => {
  it("push not configured → nothing is read at all", async () => {
    let reads = 0;
    const r = await pushForEvent(null, { scope: "class", classId: "c1", type: "assignment_published", data: { assignmentId: "a1" } }, { pushConfig: OFF, downloadJsonOrNull: async () => { reads++; return null; }, listJson: async () => { reads++; return []; } });
    expect(r.status).toBe("unconfigured");
    expect(reads).toBe(0);
  });
  it("a class event reaches the current, active members of that class only", async () => {
    const mem = world(), rec = recorder();
    const r = await pushForEvent(mem.container, { scope: "class", classId: "c1", type: "assignment_published", data: { assignmentId: "a1" } }, { pushConfig: ON, notifyStudentOfAssignmentEvent: rec.notify });
    expect(r).toMatchObject({ status: "sent", recipients: 2, delivered: 2 });
    expect(rec.calls.sort()).toEqual([["s1", "assignment_published"], ["s2", "assignment_published"]]);
  });
  it("a draft, archived or missing assignment, or a class event naming another class, sends nothing", async () => {
    for (const a of [A({ status: "draft" }), A({ status: "archived" })]) {
      const rec = recorder();
      const r = await pushForEvent(world({ "platform/assignments/a1.json": a }).container, { scope: "class", classId: "c1", type: "assignment_published", data: { assignmentId: "a1" } }, { pushConfig: ON, notifyStudentOfAssignmentEvent: rec.notify });
      expect(r.status).toBe("hidden"); expect(rec.calls).toEqual([]);
    }
    const rec = recorder();
    expect((await pushForEvent(world().container, { scope: "class", classId: "c2", type: "assignment_published", data: { assignmentId: "a1" } }, { pushConfig: ON, notifyStudentOfAssignmentEvent: rec.notify })).status).toBe("hidden");
    expect((await pushForEvent(world().container, { scope: "class", classId: "c1", type: "assignment_published", data: { assignmentId: "nope" } }, { pushConfig: ON, notifyStudentOfAssignmentEvent: rec.notify })).status).toBe("hidden");
    expect(rec.calls).toEqual([]);
  });
  it("a personal event reaches that student only while they are still in the assignment's class", async () => {
    const rec = recorder();
    await pushForEvent(world().container, { scope: "student", studentId: "s1", type: "assignment_reminder", data: { assignmentId: "a1" } }, { pushConfig: ON, notifyStudentOfAssignmentEvent: rec.notify });
    await pushForEvent(world().container, { scope: "student", studentId: "s4", type: "assignment_reminder", data: { assignmentId: "a1" } }, { pushConfig: ON, notifyStudentOfAssignmentEvent: rec.notify });
    expect(rec.calls).toEqual([["s1", "assignment_reminder"]]);
  });
  it("a review is pushed only when it made the mark final AND the results are released", async () => {
    const ev = finalized => ({ scope: "student", studentId: "s1", type: "assignment_reviewed", data: { assignmentId: "a1", finalized } });
    const rec = recorder();
    expect((await pushForEvent(world().container, ev(false), { pushConfig: ON, notifyStudentOfAssignmentEvent: rec.notify })).status).toBe("hidden");
    expect((await pushForEvent(world({ "platform/assignments/a1.json": A({ resultsRelease: "manual" }) }).container, ev(true), { pushConfig: ON, notifyStudentOfAssignmentEvent: rec.notify })).status).toBe("hidden");
    expect(rec.calls).toEqual([]);
    await pushForEvent(world().container, ev(true), { pushConfig: ON, notifyStudentOfAssignmentEvent: rec.notify });
    expect(rec.calls).toEqual([["s1", "assignment_reviewed"]]);
  });
  it("results released by hand: one push per member who submitted; nothing while still withheld", async () => {
    const released = A({ resultsRelease: "manual", resultsReleasedAt: "2026-01-01T00:00:00.000Z" });
    const mem = world({ "platform/assignments/a1.json": released, "platform/submissions/a1/s1.json": { attempts: [{ attemptNumber: 1 }] }, "platform/submissions/a1/s2.json": { attempts: [] } });
    const rec = recorder();
    expect(await pushResultsReleased(mem.container, released, { pushConfig: ON, notifyStudentOfAssignmentEvent: rec.notify })).toMatchObject({ status: "sent", recipients: 1 });
    expect(rec.calls).toEqual([["s1", "assignment_reviewed"]]);
    expect((await pushResultsReleased(mem.container, A({ resultsRelease: "manual" }), { pushConfig: ON, notifyStudentOfAssignmentEvent: rec.notify })).status).toBe("hidden");
  });
});

describe("wired into recording an event", () => {
  const event = { scope: "class", classId: "c1", type: "assignment_published", dedupeKey: "published:a1:1", data: { assignmentId: "a1", assignmentTitle: "واجب" } };
  it("a newly recorded pushable event is pushed once; the duplicate is not pushed again", async () => {
    const mem = world(), pushes = [];
    const deps = { pushForEvent: async (_c, ev) => { pushes.push(ev.type); return { status: "sent" }; } };
    expect((await recordEventSafely(mem.container, event, deps)).recorded).toBe(true);
    expect((await recordEventSafely(mem.container, event, deps)).duplicate).toBe(true);
    expect(pushes).toEqual(["assignment_published"]);
  });
  it("a non-assignment event (a reaction) is never pushed", async () => {
    const pushes = [];
    await recordEventSafely(world().container, { scope: "student", studentId: "s1", type: "teacher_reaction", dedupeKey: "r1", data: { postId: "p1", reaction: "clap" } }, { pushForEvent: async () => { pushes.push(1); } });
    expect(pushes).toEqual([]);
  });
  it("a failing push never fails the teacher's action: the event stays recorded", async () => {
    const r = await recordEventSafely(world().container, event, { pushForEvent: async () => { throw new Error("push service down"); } });
    expect(r.recorded).toBe(true);
  });
});

describe("manual results release", () => {
  const { handler: manageHandler } = require_("../src/functions/manage-assignments.js");
  it("the release that makes results visible pushes once; un-releasing or releasing again does not", async () => {
    const mem = world({ "platform/assignments/a1.json": A({ resultsRelease: "manual", className: "أ", createdAt: "2026-01-01T00:00:00.000Z" }), "platform/classes/c1.json": { classId: "c1", name: "أ" } });
    const pushed = [];
    const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => mem.container, recordAuditEvent: async () => {}, pushResultsReleased: async (_c, a) => { pushed.push(String(a.resultsReleasedAt || "")); return { status: "sent" }; } };
    const manage = body => manageHandler({ method: "POST", url: "https://x/api/assignments", json: async () => body }, deps);
    expect((await manage({ action: "releaseResults", assignmentId: "a1", released: true })).status).toBe(200);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).not.toBe("");
    expect((await manage({ action: "releaseResults", assignmentId: "a1", released: true })).status).toBe(200);
    expect((await manage({ action: "releaseResults", assignmentId: "a1", released: false })).status).toBe(200);
    expect(pushed).toHaveLength(1);
  });
});
