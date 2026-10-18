import { describe, it, expect, beforeEach } from "vitest";
import { handler as teacherMessages } from "../src/functions/messages.js";
import { handler as studentMessages } from "../src/functions/student-messages.js";
import { directPrefix, announcementPrefix, sequencedMessageId } from "../src/lib/message-store.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Messages M.5 — editing and deleting a published message, and the teacher's moderation delete:
//   • the sender edits their own message within 15 minutes (never someone else's, never a deleted one);
//   • a student deletes their own reply within 15 minutes; a teacher deletes their own messages and ANY student message
//     of a conversation they may open, at any time (an abusive message); never another teacher's message;
//   • a deleted message is a tombstone whose text is erased from storage; ids, order, counts and acknowledgements are
//     unchanged; every change is one compare-and-set on the freshest version.
// Fail-first: run against c6b21e3b (no edit / delete actions existed).

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const C1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const T1 = "teacher-1";
const T2 = "teacher-2";
const student = (userId, over = {}) => ({ schemaVersion: 3, role: "student", userId, displayName: "سارة", classId: C1, active: true, archived: false, authVersion: 1, identityNumber: "987654321", ...over });
const seed = (over = {}) => ({
  ["platform/users/" + S1 + ".json"]: student(S1),
  ["platform/users/" + S2 + ".json"]: student(S2, { displayName: "ليلى", identityNumber: "123456789" }),
  ["platform/classes/" + C1 + ".json"]: { classId: C1, name: "الصف الأول", active: true, ownerId: T1, studentIds: [S1, S2] },
  ...over
});

let clock;
let audit;
const TEACHER = (ctx, extra = {}) => ({
  requireBuilderAuth: () => ({ ok: true, user: { sub: T1, am: "multi-user" } }),
  container: ctx.container,
  resolveTeacherDisplayName: async () => "أ. أحمد",
  recordAuditEvent: async (_c, ev) => { audit.push(ev); },
  notifyStudentOfNewMessage: async () => {},
  reserveMessageSend: async () => ({ allowed: true, retryAfterSeconds: 0, scope: "" }),
  now: () => clock,
  ...extra
});
const STUDENT = (ctx, sub = S1, extra = {}) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub, sv: 1, role: "student" } }), reserveMessageSend: async () => ({ allowed: true, retryAfterSeconds: 0, scope: "" }), now: () => clock, ...extra });
const tGet = (deps, q) => teacherMessages({ method: "GET", url: "https://x/api/messages" + q, headers: { get: () => null } }, deps);
const tPost = (deps, body) => teacherMessages({ method: "POST", url: "https://x/api/messages", headers: { get: () => null }, json: async () => body }, deps);
const sGet = (deps, q = "") => studentMessages({ method: "GET", url: "https://x/api/student-messages" + q, headers: { get: () => null } }, deps);
const sPost = (deps, body) => studentMessages({ method: "POST", url: "https://x/api/student-messages", headers: { get: () => null }, json: async () => body }, deps);

/** The product window (lib/message-edit.js EDIT_WINDOW_MS) — local, so the file also runs against the baseline. */
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const DP = directPrefix(S1);
const AP = announcementPrefix(C1);
const stored = (ctx, prefix, id) => ctx.getJson(prefix + id + ".json");
const later = ms => { clock += ms; };

async function studentReply(ctx, body = "رد الطالب") {
  const r = await sPost(STUDENT(ctx), { action: "sendDirect", body });
  expect(r.status).toBe(200);
  return r.jsonBody.message;
}
async function teacherMessage(ctx, body = "رسالة المعلم") {
  const r = await tPost(TEACHER(ctx), { action: "sendDirect", studentId: S1, body });
  expect(r.status).toBe(200);
  return r.jsonBody.message;
}

beforeEach(() => { clock = Date.parse("2026-10-18T08:00:00.000Z"); audit = []; });

describe("M.5 — the sender edits their own message within 15 minutes", () => {
  it("a student edits their reply: the stored text changes in place (same id), editedAt is set, the teacher sees it", async () => {
    const ctx = createMemoryContainer(seed());
    const m = await studentReply(ctx, "نص أول");
    expect(m.editableUntil).toBe(new Date(clock + EDIT_WINDOW_MS).toISOString());
    expect(m.canDelete).toBe(true);
    later(60_000);
    const r = await sPost(STUDENT(ctx), { action: "editMessage", messageId: m.messageId, body: "  نص مُصحَّح  " });
    expect(r.status).toBe(200);
    expect(r.jsonBody.message).toMatchObject({ messageId: m.messageId, body: "نص مُصحَّح", editedAt: new Date(clock).toISOString() });
    expect(ctx.names(DP)).toHaveLength(1);                                       // rewritten in place, never a new blob
    expect(stored(ctx, DP, m.messageId)).toMatchObject({ body: "نص مُصحَّح", createdAt: m.createdAt, senderRole: "student" });
    const t = await tGet(TEACHER(ctx), "?studentId=" + S1);
    expect(t.jsonBody.messages[0]).toMatchObject({ body: "نص مُصحَّح", editedAt: new Date(clock).toISOString() });
    expect(t.jsonBody.messages[0].editableUntil).toBeUndefined();                 // the teacher can never edit it…
    expect(t.jsonBody.messages[0].canDelete).toBe(true);                          // …but may delete it (moderation)
  });

  it("after 15 minutes the edit is refused (403 EDIT_WINDOW_CLOSED) and nothing changes; the hint disappears", async () => {
    const ctx = createMemoryContainer(seed());
    const m = await studentReply(ctx, "نص أول");
    later(EDIT_WINDOW_MS + 1);
    const r = await sPost(STUDENT(ctx), { action: "editMessage", messageId: m.messageId, body: "متأخر" });
    expect(r.status).toBe(403);
    expect(r.jsonBody.code).toBe("EDIT_WINDOW_CLOSED");
    expect(stored(ctx, DP, m.messageId).body).toBe("نص أول");
    const g = await sGet(STUDENT(ctx));
    expect(g.jsonBody.direct[0].editableUntil).toBeUndefined();
    expect(g.jsonBody.direct[0].canDelete).toBeUndefined();
  });

  it("the window edge itself is still open (now === createdAt + 15 min)", async () => {
    const ctx = createMemoryContainer(seed());
    const m = await studentReply(ctx, "نص أول");
    later(EDIT_WINDOW_MS);
    expect((await sPost(STUDENT(ctx), { action: "editMessage", messageId: m.messageId, body: "على الحد" })).status).toBe(200);
  });

  it("a teacher edits their own direct message; never a student's (403) — and a student never a teacher's (403)", async () => {
    const ctx = createMemoryContainer(seed());
    const t = await teacherMessage(ctx, "موعد الاختبار الأحد");
    const s = await studentReply(ctx, "حسنًا");
    expect(t.editableUntil).toBeTruthy();
    expect((await tPost(TEACHER(ctx), { action: "editMessage", studentId: S1, messageId: t.messageId, body: "موعد الاختبار الاثنين" })).status).toBe(200);
    expect(stored(ctx, DP, t.messageId).body).toBe("موعد الاختبار الاثنين");
    const a = await tPost(TEACHER(ctx), { action: "editMessage", studentId: S1, messageId: s.messageId, body: "تغيير" });
    expect(a.status).toBe(403);
    expect(a.jsonBody.code).toBe("NOT_OWN_MESSAGE");
    const b = await sPost(STUDENT(ctx), { action: "editMessage", messageId: t.messageId, body: "تغيير" });
    expect(b.status).toBe(403);
    expect(stored(ctx, DP, s.messageId).body).toBe("حسنًا");
    expect(audit.filter(e => e.action === "message.edit")).toEqual([expect.objectContaining({ targetId: S1, details: { messageId: t.messageId, kind: "direct", senderRole: "teacher", moderation: false } })]);
    expect(JSON.stringify(audit)).not.toContain("الاثنين");                       // ids only, never text
  });

  it("a teacher never edits another teacher's message in the same conversation", async () => {
    const ctx = createMemoryContainer(seed());
    const t = await teacherMessage(ctx, "من المعلم الأول");
    const r = await tPost(TEACHER(ctx, { requireBuilderAuth: () => ({ ok: true, user: { sub: T2 } }) }), { action: "editMessage", studentId: S1, messageId: t.messageId, body: "تغيير" });
    expect(r.status).toBe(403);
    expect(stored(ctx, DP, t.messageId).body).toBe("من المعلم الأول");
  });

  it("an identical text is a no-op: no write, no rate-limit token, no audit", async () => {
    const ctx = createMemoryContainer(seed());
    const t = await teacherMessage(ctx, "نفس النص");
    const before = ctx.store.get(DP + t.messageId + ".json").etag;
    let tokens = 0;
    const r = await tPost(TEACHER(ctx, { reserveMessageSend: async () => { tokens++; return { allowed: true }; } }), { action: "editMessage", studentId: S1, messageId: t.messageId, body: "نفس النص" });
    expect(r.status).toBe(200);
    expect(r.jsonBody.unchanged).toBe(true);
    expect(tokens).toBe(0);
    expect(ctx.store.get(DP + t.messageId + ".json").etag).toBe(before);
    expect(audit.filter(e => e.action === "message.edit")).toEqual([]);
  });

  it("an edit costs one rate-limit token; a refused token is a 429 and nothing changes", async () => {
    const ctx = createMemoryContainer(seed());
    const m = await studentReply(ctx, "نص أول");
    const r = await sPost(STUDENT(ctx, S1, { reserveMessageSend: async () => ({ allowed: false, retryAfterSeconds: 7, scope: "burst" }) }), { action: "editMessage", messageId: m.messageId, body: "نص ثان" });
    expect(r.status).toBe(429);
    expect(r.headers["Retry-After"]).toBe("7");
    expect(stored(ctx, DP, m.messageId).body).toBe("نص أول");
  });

  it("the new text follows the send contract: empty / invisible-only / too long → 400", async () => {
    const ctx = createMemoryContainer(seed());
    const m = await studentReply(ctx, "نص أول");
    for (const body of ["", "   ", "\u200b\u202e", "x".repeat(2001), 42]) {
      const r = await sPost(STUDENT(ctx), { action: "editMessage", messageId: m.messageId, body });
      expect(r.status).toBe(400);
    }
    expect(stored(ctx, DP, m.messageId).body).toBe("نص أول");
  });

  it("a read-only conversation (archived class) refuses the student's edit and delete", async () => {
    const ctx = createMemoryContainer(seed());
    const m = await studentReply(ctx, "نص أول");
    ctx.setJson("platform/classes/" + C1 + ".json", { classId: C1, name: "الصف الأول", active: true, status: "archived", ownerId: T1, studentIds: [S1] });
    expect((await sPost(STUDENT(ctx), { action: "editMessage", messageId: m.messageId, body: "تغيير" })).status).toBe(403);
    expect((await sPost(STUDENT(ctx), { action: "deleteMessage", messageId: m.messageId })).status).toBe(403);
    expect(stored(ctx, DP, m.messageId).body).toBe("نص أول");
  });
});

describe("M.5 — deleting a message, and the teacher's moderation delete", () => {
  it("a student deletes their own reply within 15 minutes: a tombstone, the text erased from storage", async () => {
    const ctx = createMemoryContainer(seed());
    const m = await studentReply(ctx, "أرسلتها بالخطأ");
    later(5 * 60_000);
    const r = await sPost(STUDENT(ctx), { action: "deleteMessage", messageId: m.messageId });
    expect(r.status).toBe(200);
    expect(r.jsonBody.message).toMatchObject({ messageId: m.messageId, deleted: true, deletedBy: "student", body: "" });
    const doc = stored(ctx, DP, m.messageId);
    expect(doc).toMatchObject({ deleted: true, deletedByRole: "student", body: "", messageId: m.messageId, createdAt: m.createdAt });
    expect(JSON.stringify(doc)).not.toContain("بالخطأ");
    const t = await tGet(TEACHER(ctx), "?studentId=" + S1);
    expect(t.jsonBody.messages).toEqual([expect.objectContaining({ messageId: m.messageId, deleted: true, deletedBy: "student", body: "" })]);
  });

  it("a student cannot delete after 15 minutes, nor a teacher's message", async () => {
    const ctx = createMemoryContainer(seed());
    const s = await studentReply(ctx, "رد");
    const t = await teacherMessage(ctx, "من المعلم");
    later(EDIT_WINDOW_MS + 1);
    const a = await sPost(STUDENT(ctx), { action: "deleteMessage", messageId: s.messageId });
    expect(a.status).toBe(403);
    expect(a.jsonBody.code).toBe("DELETE_WINDOW_CLOSED");
    clock -= EDIT_WINDOW_MS;
    expect((await sPost(STUDENT(ctx), { action: "deleteMessage", messageId: t.messageId })).status).toBe(403);
    expect(stored(ctx, DP, s.messageId).body).toBe("رد");
    expect(stored(ctx, DP, t.messageId).body).toBe("من المعلم");
  });

  it("MODERATION: the teacher deletes an abusive student message at any time, even once the student is archived", async () => {
    const ctx = createMemoryContainer(seed());
    const bad = await studentReply(ctx, "كلام بذيء");
    later(30 * 24 * 3600_000);                                                   // a month later
    ctx.setJson("platform/users/" + S1 + ".json", student(S1, { archived: true }));
    const r = await tPost(TEACHER(ctx), { action: "deleteMessage", studentId: S1, messageId: bad.messageId });
    expect(r.status).toBe(200);
    expect(r.jsonBody.message).toMatchObject({ deleted: true, deletedBy: "teacher", body: "" });
    expect(JSON.stringify(stored(ctx, DP, bad.messageId))).not.toContain("بذيء");
    expect(audit.filter(e => e.action === "message.delete")).toEqual([expect.objectContaining({ actor: T1, targetType: "student", targetId: S1, details: { messageId: bad.messageId, kind: "direct", senderRole: "student", moderation: true } })]);
    expect(JSON.stringify(audit)).not.toContain("بذيء");
  });

  it("the student then sees «deleted by the teacher», and their notification preview carries no text", async () => {
    const ctx = createMemoryContainer(seed());
    const t = await teacherMessage(ctx, "نص سيُحذف");
    expect((await tPost(TEACHER(ctx), { action: "deleteMessage", studentId: S1, messageId: t.messageId })).status).toBe(200);
    const g = await sGet(STUDENT(ctx));
    expect(g.jsonBody.direct).toEqual([expect.objectContaining({ messageId: t.messageId, deleted: true, deletedBy: "teacher", body: "" })]);
    const n = await sGet(STUDENT(ctx), "?view=notifications");
    expect(n.jsonBody.items).toEqual([expect.objectContaining({ id: t.messageId, preview: "تم حذف هذه الرسالة" })]);
    expect(JSON.stringify(n.jsonBody)).not.toContain("سيُحذف");
  });

  it("a teacher never deletes another teacher's message (403)", async () => {
    const ctx = createMemoryContainer(seed());
    const t = await teacherMessage(ctx, "من المعلم الأول");
    const r = await tPost(TEACHER(ctx, { requireBuilderAuth: () => ({ ok: true, user: { sub: T2 } }) }), { action: "deleteMessage", studentId: S1, messageId: t.messageId });
    expect(r.status).toBe(403);
    expect(stored(ctx, DP, t.messageId).deleted).toBeUndefined();
  });

  it("another tenant's teacher cannot reach the conversation at all (404); nothing changes", async () => {
    const ctx = createMemoryContainer(seed());
    const s = await studentReply(ctx, "رد");
    const r = await tPost(TEACHER(ctx, { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-x", am: "multi-user" } }) }), { action: "deleteMessage", studentId: S1, messageId: s.messageId });
    expect(r.status).toBe(404);
    expect(stored(ctx, DP, s.messageId).body).toBe("رد");
  });

  it("deleting twice is idempotent (one audit); a deleted message can never be edited back (409)", async () => {
    const ctx = createMemoryContainer(seed());
    const t = await teacherMessage(ctx, "نص");
    expect((await tPost(TEACHER(ctx), { action: "deleteMessage", studentId: S1, messageId: t.messageId })).status).toBe(200);
    const again = await tPost(TEACHER(ctx), { action: "deleteMessage", studentId: S1, messageId: t.messageId });
    expect(again.status).toBe(200);
    expect(again.jsonBody.unchanged).toBe(true);
    expect(audit.filter(e => e.action === "message.delete")).toHaveLength(1);
    const e = await tPost(TEACHER(ctx), { action: "editMessage", studentId: S1, messageId: t.messageId, body: "عودة" });
    expect(e.status).toBe(409);
    expect(e.jsonBody.code).toBe("MESSAGE_DELETED");
    expect(stored(ctx, DP, t.messageId).body).toBe("");
  });

  it("a delete that lands between an edit's read and write wins: the edit retries on the fresh version and is refused", async () => {
    let fired = false;
    const ctx = createMemoryContainer(seed(), {
      beforeConditionalUpload(name, api) {
        if (fired || !name.startsWith(DP)) return;
        fired = true;
        const doc = api.getJson(name);
        api.setJson(name, { ...doc, body: "", deleted: true, deletedAt: new Date(clock).toISOString(), deletedByRole: "teacher" });
      }
    });
    const m = await studentReply(ctx, "نص أول");
    const r = await sPost(STUDENT(ctx), { action: "editMessage", messageId: m.messageId, body: "نص ثان" });
    expect(fired).toBe(true);
    expect(r.status).toBe(409);
    expect(stored(ctx, DP, m.messageId)).toMatchObject({ deleted: true, body: "" });
  });

  it("an id that is not a message of THAT stream is 404: another student's message, a forged id, a missing position", async () => {
    const ctx = createMemoryContainer(seed());
    const other = await sPost(STUDENT(ctx, S2), { action: "sendDirect", body: "رسالة ليلى" });
    const otherId = other.jsonBody.message.messageId;
    expect((await sPost(STUDENT(ctx), { action: "deleteMessage", messageId: otherId })).status).toBe(404);
    expect((await sPost(STUDENT(ctx), { action: "deleteMessage", messageId: "../x" })).status).toBe(404);
    expect((await sPost(STUDENT(ctx), { action: "deleteMessage", messageId: sequencedMessageId(DP, 7) })).status).toBe(404);
    expect((await tPost(TEACHER(ctx), { action: "deleteMessage", studentId: S1, messageId: otherId })).status).toBe(404);
    expect(ctx.getJson(directPrefix(S2) + otherId + ".json").body).toBe("رسالة ليلى");
    expect(ctx.names(DP)).toEqual([]);                                           // nothing was ever created
  });
});

describe("M.5 — announcements", () => {
  it("the teacher edits a fresh announcement, cannot edit an old one, and deletes any of their own at any time", async () => {
    const ctx = createMemoryContainer(seed());
    const a = await tPost(TEACHER(ctx), { action: "sendAnnouncement", classId: C1, body: "الاختبار غدًا" });
    const id = a.jsonBody.message.messageId;
    expect(a.jsonBody.message.editableUntil).toBeTruthy();
    expect((await tPost(TEACHER(ctx), { action: "editMessage", classId: C1, messageId: id, body: "الاختبار بعد غد" })).status).toBe(200);
    later(EDIT_WINDOW_MS + 1);
    expect((await tPost(TEACHER(ctx), { action: "editMessage", classId: C1, messageId: id, body: "تغيير متأخر" })).status).toBe(403);
    const d = await tPost(TEACHER(ctx), { action: "deleteMessage", classId: C1, messageId: id });
    expect(d.status).toBe(200);
    expect(stored(ctx, AP, id)).toMatchObject({ deleted: true, body: "" });
    const g = await sGet(STUDENT(ctx));
    expect(g.jsonBody.announcements).toEqual([expect.objectContaining({ messageId: id, deleted: true, body: "" })]);
    expect(g.jsonBody.announcements[0].canDelete).toBeUndefined();               // a student never gets an action on announcements
  });
});

describe("M.5 — order, counts and acknowledgements are unchanged by a delete", () => {
  it("messages after a deleted one stay visible; the deleted reply still counts until acknowledged, and can be acknowledged", async () => {
    const ctx = createMemoryContainer(seed());
    const first = await studentReply(ctx, "١");
    later(1000);
    await studentReply(ctx, "٢");
    later(1000);
    const third = await studentReply(ctx, "٣");
    expect((await tPost(TEACHER(ctx), { action: "deleteMessage", studentId: S1, messageId: first.messageId })).status).toBe(200);
    const t = await tGet(TEACHER(ctx), "?studentId=" + S1);
    expect(t.jsonBody.messages.map(m => m.body)).toEqual(["", "٢", "٣"]);
    const summary = await tGet(TEACHER(ctx), "?kind=unread-summary&classId=" + C1);
    expect(summary.jsonBody.byStudent[S1]).toEqual({ unread: 3, capped: false });
    const mark = await tPost(TEACHER(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: third.messageId, seenIdsAtBoundary: [third.messageId] });
    expect(mark.status).toBe(200);
    expect(mark.jsonBody).toMatchObject({ unread: 0 });
    const mark2 = await tPost(TEACHER(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: first.messageId, seenIdsAtBoundary: [first.messageId] });
    expect(mark2.status).toBe(200);                                              // a tombstone is still a valid acknowledgement target
  });

  it("the badge memo sees an edit at once (the blob's ETag changed): a deleted-then-polled stream is recounted", async () => {
    const ctx = createMemoryContainer(seed());
    const s = await studentReply(ctx, "رد");
    const before = await tGet(TEACHER(ctx), "?kind=unread-summary");
    expect(before.jsonBody.totalUnread).toBe(1);
    const etag = ctx.store.get(DP + s.messageId + ".json").etag;
    await tPost(TEACHER(ctx), { action: "deleteMessage", studentId: S1, messageId: s.messageId });
    expect(ctx.store.get(DP + s.messageId + ".json").etag).not.toBe(etag);
    const after = await tGet(TEACHER(ctx), "?kind=unread-summary");
    expect(after.jsonBody.totalUnread).toBe(1);                                  // same count (relevance unchanged), recomputed
  });
});
