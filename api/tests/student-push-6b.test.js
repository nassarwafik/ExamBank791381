import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import { handler as studentPush } from "../src/functions/student-push.js";
import { handler as teacherMessages } from "../src/functions/messages.js";
import { handler as studentMessages } from "../src/functions/student-messages.js";
import { directPrefix } from "../src/lib/message-store.js";
import {
  endpointId, studentDocName, endpointDocName, normalizeSubscription, MAX_SUBSCRIPTIONS_PER_STUDENT
} from "../src/lib/push-subscriptions.js";
import { pushConfig, notifyStudentOfNewMessage, notifyWithTimeout, MESSAGE_NOTIFICATION } from "../src/lib/push-notify.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 6B — student Web Push: subscription API (real hardened student session; only the stateless token check is
// stubbed), the teacher sendDirect trigger, failure isolation and expired-subscription cleanup. The push service is
// ALWAYS a mock (deps.sendNotification, and the web-push module itself is spied so a real send would be caught):
// no network, no real VAPID keys (the "keys" below are fixed dummy bytes of the right length), no real students.

const webpush = createRequire(import.meta.url)("web-push");

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const C1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const student = (userId, over = {}) => ({ schemaVersion: 3, role: "student", userId, displayName: "الطالب " + userId.slice(0, 1), classId: C1, active: true, archived: false, authVersion: 1, identityNumber: "987654321", code: "CODE-" + userId.slice(0, 1), ...over });
const seed = (over = {}) => ({
  ["platform/users/" + S1 + ".json"]: student(S1),
  ["platform/users/" + S2 + ".json"]: student(S2),
  ["platform/classes/" + C1 + ".json"]: { classId: C1, name: "الصف الأول", active: true, studentIds: [S1, S2] },
  ...over
});

const b64url = buf => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const DUMMY_PUBLIC = b64url(Buffer.alloc(65, 4));       // right shape, NOT a real key pair
const DUMMY_PRIVATE = b64url(Buffer.alloc(32, 7));
const CONFIG = { available: true, publicKey: DUMMY_PUBLIC, privateKey: DUMMY_PRIVATE, subject: "mailto:admin@example.com" };
const UNCONFIGURED = { available: false, reason: "unconfigured" };

const sub = (n, host = "fcm.googleapis.com") => ({
  endpoint: "https://" + host + "/fcm/send/device-" + n,
  expirationTime: null,
  keys: { p256dh: b64url(Buffer.alloc(65, n)), auth: b64url(Buffer.alloc(16, n)) }
});

const SESSION = (ctx, sub_, extra = {}) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: sub_, sv: 1, role: "student" } }), pushConfig: () => CONFIG, ...extra });
const NO_TOKEN = ctx => ({ container: ctx.container, requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }), pushConfig: () => CONFIG });
const TEACHER = (ctx, extra = {}) => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "builder-1" } }), container: ctx.container, resolveTeacherDisplayName: async () => "أ. أحمد", recordAuditEvent: async () => {}, ...extra });

const pPost = (deps, body) => studentPush({ method: "POST", url: "https://x/api/student-push", headers: { get: () => null }, json: async () => body }, deps);
const pGet = deps => studentPush({ method: "GET", url: "https://x/api/student-push", headers: { get: () => null } }, deps);
const tPost = (deps, body) => teacherMessages({ method: "POST", url: "https://x/api/messages", headers: { get: () => null }, json: async () => body }, deps);
const tGet = (deps, q) => teacherMessages({ method: "GET", url: "https://x/api/messages" + q, headers: { get: () => null } }, deps);
const sPost = (deps, body) => studentMessages({ method: "POST", url: "https://x/api/student-messages", headers: { get: () => null }, json: async () => body }, deps);
const sGet = (deps, q = "") => studentMessages({ method: "GET", url: "https://x/api/student-messages" + q, headers: { get: () => null } }, deps);

const stored = (ctx, studentId) => (ctx.getJson(studentDocName(studentId)) || { subscriptions: [] }).subscriptions;
const owner = (ctx, endpoint) => (ctx.getJson(endpointDocName(endpointId(endpoint))) || {}).studentId;
const subscribe = (ctx, who, s) => pPost(SESSION(ctx, who), { action: "subscribe", subscription: s });

/** A push-service mock: `plan(endpoint)` returns undefined (201 delivered) or an error-like { statusCode }. */
function pushService(plan = () => undefined) {
  const calls = [];
  const send = vi.fn(async (subscription, payload, options) => {
    calls.push({ subscription, payload: JSON.parse(payload), options });
    const outcome = plan(subscription.endpoint);
    if (outcome) throw Object.assign(new Error("push failed"), outcome);
    return { statusCode: 201 };
  });
  return { send, calls };
}
const log = () => { const warns = []; return { warns, logWarn: (e, f) => warns.push({ e, f }), logError: () => {} }; };

let realSend;
beforeEach(() => {
  // Belt and braces: the real web-push sender must never run in these tests.
  realSend = vi.spyOn(webpush, "sendNotification").mockImplementation(async () => { throw new Error("REAL web-push send attempted in a test"); });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("student-push API — subscriptions belong to the authenticated student only", () => {
  it("1. an authenticated student registers THEIR subscription (identity from the session; a body studentId/userId is ignored)", async () => {
    const ctx = createMemoryContainer(seed());
    const r = await pPost(SESSION(ctx, S1), { action: "subscribe", subscription: sub(1), studentId: S2, userId: S2 });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toEqual({ ok: true, subscribed: true, created: true });
    expect(stored(ctx, S1)).toHaveLength(1);
    expect(stored(ctx, S1)[0]).toMatchObject({ id: endpointId(sub(1).endpoint), endpoint: sub(1).endpoint, keys: sub(1).keys });
    expect(Object.keys(stored(ctx, S1)[0]).sort()).toEqual(["claim", "createdAt", "endpoint", "id", "keys", "updatedAt"]);   // nothing else stored
    expect(stored(ctx, S1)[0].claim).toBe(ctx.getJson(endpointDocName(endpointId(sub(1).endpoint))).claim);             // registration claim on both
    expect(owner(ctx, sub(1).endpoint)).toBe(S1);
    expect(ctx.getJson(studentDocName(S2))).toBeNull();
  });

  it("2. no session / revoked / archived student → 401 and nothing written; a student can never register for, list or remove another student's subscriptions", async () => {
    const ctx = createMemoryContainer(seed({
      ["platform/users/dddddddd-0000-0000-0000-000000000001.json"]: student("dddddddd-0000-0000-0000-000000000001", { authVersion: 2 }),
      ["platform/users/dddddddd-0000-0000-0000-000000000002.json"]: student("dddddddd-0000-0000-0000-000000000002", { archived: true })
    }));
    expect((await pPost(NO_TOKEN(ctx), { action: "subscribe", subscription: sub(1) })).status).toBe(401);
    expect((await pGet(NO_TOKEN(ctx))).status).toBe(401);
    expect((await pPost(SESSION(ctx, "dddddddd-0000-0000-0000-000000000001"), { action: "subscribe", subscription: sub(1) })).status).toBe(401);
    expect((await pPost(SESSION(ctx, "dddddddd-0000-0000-0000-000000000002"), { action: "subscribe", subscription: sub(1) })).status).toBe(401);
    expect(ctx.names("platform/push/")).toEqual([]);

    await subscribe(ctx, S1, sub(1));
    // S2 tries to remove S1's device (knowing its endpoint): S1 keeps it, and ownership is untouched.
    const rm = await pPost(SESSION(ctx, S2), { action: "unsubscribe", endpoint: sub(1).endpoint, studentId: S1 });
    expect(rm.jsonBody).toEqual({ ok: true, removed: 0 });
    expect(stored(ctx, S1)).toHaveLength(1);
    expect(owner(ctx, sub(1).endpoint)).toBe(S1);
    // GET exposes only availability + the PUBLIC key — never any subscription or the private key.
    const g = await pGet(SESSION(ctx, S2));
    expect(g.jsonBody).toEqual({ ok: true, available: true, publicKey: DUMMY_PUBLIC });
    expect(JSON.stringify(g.jsonBody)).not.toContain(DUMMY_PRIVATE);
    expect(JSON.stringify(g.jsonBody)).not.toContain("fcm.googleapis.com");
    // The student can remove their own.
    expect((await pPost(SESSION(ctx, S1), { action: "unsubscribe", endpoint: sub(1).endpoint })).jsonBody).toEqual({ ok: true, removed: 1 });
    expect(stored(ctx, S1)).toEqual([]);
    expect(owner(ctx, sub(1).endpoint)).toBe("");                         // owner record RELEASED (CAS), never blindly deleted
  });

  it("3. the same subscription registered again (refresh / StrictMode / another tab) is stored ONCE", async () => {
    const ctx = createMemoryContainer(seed());
    expect((await subscribe(ctx, S1, sub(1))).jsonBody.created).toBe(true);
    const again = await subscribe(ctx, S1, sub(1));
    expect(again.status).toBe(200);
    expect(again.jsonBody.created).toBe(false);
    await subscribe(ctx, S1, { ...sub(1), endpoint: "  " + sub(1).endpoint + "  " });
    expect(stored(ctx, S1)).toHaveLength(1);
  });

  it("4. several devices of one student are all kept (bounded to the most recent " + MAX_SUBSCRIPTIONS_PER_STUDENT + ")", async () => {
    const ctx = createMemoryContainer(seed());
    await subscribe(ctx, S1, sub(1));
    await subscribe(ctx, S1, sub(2, "updates.push.services.mozilla.com"));
    await subscribe(ctx, S1, sub(3, "web.push.apple.com"));
    expect(stored(ctx, S1).map(s => s.endpoint)).toEqual([sub(1).endpoint, sub(2, "updates.push.services.mozilla.com").endpoint, sub(3, "web.push.apple.com").endpoint]);
    for (let n = 4; n <= MAX_SUBSCRIPTIONS_PER_STUDENT + 3; n++) await subscribe(ctx, S1, sub(n));
    expect(stored(ctx, S1)).toHaveLength(MAX_SUBSCRIPTIONS_PER_STUDENT);
  });

  it("a shared device moves to the student who subscribed it last (never delivers the previous student's notifications)", async () => {
    const ctx = createMemoryContainer(seed());
    await subscribe(ctx, S1, sub(1));
    await subscribe(ctx, S2, sub(1));
    expect(stored(ctx, S1)).toEqual([]);
    expect(stored(ctx, S2)).toHaveLength(1);
    expect(owner(ctx, sub(1).endpoint)).toBe(S2);
    // Even if S1's list still held it (e.g. a lost race), a send for S1 skips a device now owned by S2 and cleans it.
    ctx.setJson(studentDocName(S1), { schemaVersion: 1, studentId: S1, subscriptions: [{ id: endpointId(sub(1).endpoint), endpoint: sub(1).endpoint, keys: sub(1).keys }] });
    const push = pushService();
    const r = await notifyStudentOfNewMessage(ctx.container, S1, { pushConfig: () => CONFIG, sendNotification: push.send });
    expect(push.send).not.toHaveBeenCalled();
    expect(r.attempted).toBe(0);
    expect(stored(ctx, S1)).toEqual([]);
    expect(owner(ctx, sub(1).endpoint)).toBe(S2);                        // S2's ownership untouched
  });

  it("rejects anything that is not a real browser push subscription (SSRF-safe: https + known push service + P-256 keys)", async () => {
    const ctx = createMemoryContainer(seed());
    const bad = [
      null, "x", {}, { endpoint: sub(1).endpoint }, { ...sub(1), endpoint: "http://fcm.googleapis.com/fcm/send/x" },
      { ...sub(1), endpoint: "https://evil.example/fcm/send/x" }, { ...sub(1), endpoint: "https://fcm.googleapis.com.evil.example/x" },
      { ...sub(1), endpoint: "https://169.254.169.254/latest" }, { ...sub(1), endpoint: "https://user:pw@fcm.googleapis.com/x" },
      { ...sub(1), endpoint: "https://fcm.googleapis.com/" + "a".repeat(2100) },
      { ...sub(1), keys: { p256dh: "short", auth: sub(1).keys.auth } }, { ...sub(1), keys: { p256dh: sub(1).keys.p256dh, auth: "!!" } }
    ];
    for (const s of bad) expect((await pPost(SESSION(ctx, S1), { action: "subscribe", subscription: s })).status, JSON.stringify(s)?.slice(0, 60)).toBe(400);
    expect((await pPost(SESSION(ctx, S1), { action: "nope" })).status).toBe(400);
    expect((await pPost(SESSION(ctx, S1), { action: "unsubscribe" })).status).toBe(400);
    expect(ctx.names("platform/push/")).toEqual([]);
    expect(normalizeSubscription(sub(1))).toEqual({ endpoint: sub(1).endpoint, keys: sub(1).keys });   // expirationTime etc. dropped
  });

  it("no VAPID configuration on the server → GET says unavailable (no key) and subscribe answers 503 pushUnavailable; nothing written", async () => {
    const ctx = createMemoryContainer(seed());
    const deps = SESSION(ctx, S1, { pushConfig: () => UNCONFIGURED });
    expect((await pGet(deps)).jsonBody).toEqual({ ok: true, available: false, publicKey: "" });
    const r = await pPost(deps, { action: "subscribe", subscription: sub(1) });
    expect(r.status).toBe(503);
    expect(r.jsonBody.code).toBe("pushUnavailable");
    expect(ctx.names("platform/push/")).toEqual([]);
  });
});

describe("sendDirect → push (the only trigger)", () => {
  it("5/6. a teacher message is SAVED and then every subscription of THAT student gets one generic notification (no message text)", async () => {
    const ctx = createMemoryContainer(seed());
    await subscribe(ctx, S1, sub(1));
    await subscribe(ctx, S1, sub(2));
    await subscribe(ctx, S2, sub(3));
    const push = pushService();
    const r = await tPost(TEACHER(ctx, { pushConfig: () => CONFIG, sendNotification: push.send }), { action: "sendDirect", studentId: S1, body: "نص سري للرسالة" });
    expect(r.status).toBe(200);
    expect(ctx.names(directPrefix(S1))).toEqual([directPrefix(S1) + r.jsonBody.message.messageId + ".json"]);
    expect(push.send).toHaveBeenCalledTimes(2);
    expect(push.calls.map(c => c.subscription.endpoint).sort()).toEqual([sub(1).endpoint, sub(2).endpoint]);   // never S2's device
    for (const c of push.calls) {
      expect(c.payload).toEqual({ ...MESSAGE_NOTIFICATION });
      expect(JSON.stringify(c.payload)).not.toContain("نص سري");
      expect(c.options.vapidDetails).toEqual({ subject: CONFIG.subject, publicKey: DUMMY_PUBLIC, privateKey: DUMMY_PRIVATE });
      expect(c.options).toMatchObject({ TTL: 86400, urgency: "normal", timeout: 5000 });
      expect(c.subscription).toEqual({ endpoint: c.subscription.endpoint, keys: expect.any(Object) });
    }
    expect(realSend).not.toHaveBeenCalled();
  });

  it("7. push failures NEVER fail the send: the service down, a throwing notifier, a notifier that never finishes", async () => {
    const ctx = createMemoryContainer(seed());
    await subscribe(ctx, S1, sub(1));
    const down = pushService(() => ({ statusCode: 503 }));
    const a = await tPost(TEACHER(ctx, { pushConfig: () => CONFIG, sendNotification: down.send }), { action: "sendDirect", studentId: S1, body: "one" });
    expect(a.status).toBe(200);
    expect(down.send).toHaveBeenCalledTimes(1);
    const b = await tPost(TEACHER(ctx, { notifyStudentOfNewMessage: () => { throw new Error("boom"); } }), { action: "sendDirect", studentId: S1, body: "two" });
    expect(b.status).toBe(200);
    const c = await tPost(TEACHER(ctx, { notifyStudentOfNewMessage: async () => { throw new Error("async boom"); } }), { action: "sendDirect", studentId: S1, body: "three" });
    expect(c.status).toBe(200);
    const storageDown = await tPost(TEACHER(ctx, { pushConfig: () => CONFIG, sendNotification: down.send, removeExpiredSubscriptions: async () => { throw new Error("storage"); } }), { action: "sendDirect", studentId: S1, body: "four" });
    expect(storageDown.status).toBe(200);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const hanging = tPost(TEACHER(ctx, { notifyStudentOfNewMessage: () => new Promise(() => {}) }), { action: "sendDirect", studentId: S1, body: "five" });
    await vi.advanceTimersByTimeAsync(8000);
    expect((await hanging).status).toBe(200);
    vi.useRealTimers();
    expect(ctx.names(directPrefix(S1))).toHaveLength(5);                 // every message saved
    expect(await notifyWithTimeout(new Promise(() => {}), 5)).toEqual({ status: "timeout" });
    expect(await notifyWithTimeout(Promise.reject(new Error("x")), 50)).toEqual({ status: "error" });
  });

  it("8. a student without any subscription (and a server without VAPID) → the ordinary send, no push attempt", async () => {
    const ctx = createMemoryContainer(seed());
    const push = pushService();
    const r = await tPost(TEACHER(ctx, { pushConfig: () => CONFIG, sendNotification: push.send }), { action: "sendDirect", studentId: S1, body: "hi" });
    expect(r.status).toBe(200);
    expect(push.send).not.toHaveBeenCalled();
    expect(await notifyStudentOfNewMessage(ctx.container, S1, { pushConfig: () => CONFIG, sendNotification: push.send })).toMatchObject({ status: "no-subscriptions", attempted: 0 });
    await subscribe(ctx, S1, sub(1));
    const unconfigured = await tPost(TEACHER(ctx, { pushConfig: () => UNCONFIGURED, sendNotification: push.send }), { action: "sendDirect", studentId: S1, body: "hi again" });
    expect(unconfigured.status).toBe(200);
    expect(push.send).not.toHaveBeenCalled();
    // The student still reads the message in the app exactly as before.
    const inbox = await sGet(SESSION(ctx, S1));
    expect(inbox.status).toBe(200);
    expect(JSON.stringify(inbox.jsonBody)).toContain("hi again");
  });

  it("9. 404 / 410 from the push service → that subscription is removed (list + owner record); it is never tried again", async () => {
    const ctx = createMemoryContainer(seed());
    await subscribe(ctx, S1, sub(1));
    await subscribe(ctx, S1, sub(2));
    await subscribe(ctx, S1, sub(3));
    const gone = pushService(ep => (ep === sub(1).endpoint ? { statusCode: 410 } : ep === sub(2).endpoint ? { statusCode: 404 } : undefined));
    const deps = TEACHER(ctx, { pushConfig: () => CONFIG, sendNotification: gone.send });
    expect((await tPost(deps, { action: "sendDirect", studentId: S1, body: "x" })).status).toBe(200);
    expect(stored(ctx, S1).map(s => s.endpoint)).toEqual([sub(3).endpoint]);
    expect(owner(ctx, sub(1).endpoint)).toBe("");                         // released, so it can never be delivered again
    expect(owner(ctx, sub(2).endpoint)).toBe("");
    gone.send.mockClear();
    await tPost(deps, { action: "sendDirect", studentId: S1, body: "y" });
    expect(gone.send).toHaveBeenCalledTimes(1);
    expect(gone.send.mock.calls[0][0].endpoint).toBe(sub(3).endpoint);
  });

  it("10. a transient failure (5xx, 429, 413, network/timeout error) keeps the subscription and logs without secrets", async () => {
    for (const failure of [{ statusCode: 500 }, { statusCode: 503 }, { statusCode: 429 }, { statusCode: 413 }, { code: "ETIMEDOUT" }]) {
      const ctx = createMemoryContainer(seed());
      await subscribe(ctx, S1, sub(1));
      const push = pushService(() => failure);
      const obs = log();
      const r = await notifyStudentOfNewMessage(ctx.container, S1, { pushConfig: () => CONFIG, sendNotification: push.send }, obs);
      expect(r).toMatchObject({ status: "sent", attempted: 1, delivered: 0, failed: 1, expired: 0 });
      expect(stored(ctx, S1)).toHaveLength(1);
      expect(owner(ctx, sub(1).endpoint)).toBe(S1);
      expect(obs.warns.map(w => w.e)).toEqual(["push.send.failed"]);
      const line = JSON.stringify(obs.warns);
      expect(line).toContain("fcm.googleapis.com");                         // the host only
      for (const secret of [sub(1).endpoint, sub(1).keys.p256dh, sub(1).keys.auth, DUMMY_PRIVATE, S1]) expect(line).not.toContain(secret);
    }
  });

  it("11. several devices are pushed independently: one gone, one failing, one delivered", async () => {
    const ctx = createMemoryContainer(seed());
    for (const n of [1, 2, 3]) await subscribe(ctx, S1, sub(n));
    let slowResolved = false;
    const push = pushService(ep => (ep === sub(1).endpoint ? { statusCode: 410 } : ep === sub(2).endpoint ? { statusCode: 500 } : undefined));
    const send = vi.fn(async (s, p, o) => {
      if (s.endpoint === sub(3).endpoint) { await new Promise(r => setTimeout(r, 5)); slowResolved = true; }
      return push.send(s, p, o);
    });
    const r = await notifyStudentOfNewMessage(ctx.container, S1, { pushConfig: () => CONFIG, sendNotification: send });
    expect(send).toHaveBeenCalledTimes(3);
    expect(slowResolved).toBe(true);                                     // the failures did not stop the slow success
    expect(r).toEqual({ status: "sent", attempted: 3, delivered: 1, expired: 1, failed: 1 });
    expect(stored(ctx, S1).map(s => s.endpoint)).toEqual([sub(2).endpoint, sub(3).endpoint]);
  });

  it("an announcement to the class does not push (Phase 6B covers new direct messages only)", async () => {
    const ctx = createMemoryContainer(seed());
    await subscribe(ctx, S1, sub(1));
    const push = pushService();
    expect((await tPost(TEACHER(ctx, { pushConfig: () => CONFIG, sendNotification: push.send }), { action: "sendAnnouncement", classId: C1, body: "للجميع" })).status).toBe(200);
    expect(push.send).not.toHaveBeenCalled();
  });
});

describe("nothing else pushes (12–14): even with VAPID configured in the environment", () => {
  const ENV = { WEB_PUSH_VAPID_PUBLIC_KEY: DUMMY_PUBLIC, WEB_PUSH_VAPID_PRIVATE_KEY: DUMMY_PRIVATE, WEB_PUSH_VAPID_SUBJECT: "mailto:admin@example.com" };
  let saved;
  beforeEach(() => { saved = {}; for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v; } });
  afterEach(() => { for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  async function world() {
    const ctx = createMemoryContainer(seed());
    await subscribe(ctx, S1, sub(1));
    const push = pushService();
    realSend.mockImplementation(push.send);                               // the DEFAULT sender path is observed too
    expect(pushConfig().available).toBe(true);
    const first = await tPost(TEACHER(ctx), { action: "sendDirect", studentId: S1, body: "من المعلم" });
    expect(first.status).toBe(200);
    expect(push.send).toHaveBeenCalledTimes(1);                           // sanity: the canonical trigger does push
    push.send.mockClear();
    return { ctx, push, messageId: first.jsonBody.message.messageId };
  }

  it("12. a student's reply to the teacher does not push", async () => {
    const { ctx, push } = await world();
    expect((await sPost(SESSION(ctx, S1), { action: "sendDirect", body: "رد الطالب" })).status).toBe(200);
    expect(push.send).not.toHaveBeenCalled();
  });

  it("13. read-state updates (student markRead, teacher markDirectRead) do not push", async () => {
    const { ctx, push, messageId } = await world();
    const sr = await sPost(SESSION(ctx, S1), { action: "markRead", stream: "direct", throughMessageId: messageId, seenIdsAtBoundary: [messageId] });
    expect(sr.status).toBe(200);
    const reply = await sPost(SESSION(ctx, S1), { action: "sendDirect", body: "رد" });
    const rid = reply.jsonBody.message.messageId;
    const tr = await tPost(TEACHER(ctx), { action: "markDirectRead", studentId: S1, throughMessageId: rid, seenIdsAtBoundary: [rid] });
    expect(tr.status).toBe(200);
    expect(push.send).not.toHaveBeenCalled();
  });

  it("14. fetching / polling (student inbox + unread summary, teacher thread + unread summary, push config) does not push", async () => {
    const { ctx, push } = await world();
    for (let i = 0; i < 3; i++) {
      expect((await sGet(SESSION(ctx, S1))).status).toBe(200);
      expect((await sGet(SESSION(ctx, S1), "?view=unread")).status).toBe(200);
      expect((await tGet(TEACHER(ctx), "?studentId=" + S1)).status).toBe(200);
      expect((await tGet(TEACHER(ctx), "?kind=unread-summary")).status).toBe(200);
      expect((await pGet(SESSION(ctx, S1))).status).toBe(200);
      expect((await subscribe(ctx, S1, sub(1))).status).toBe(200);        // re-registration on reload
    }
    expect(push.send).not.toHaveBeenCalled();
  });
});

describe("pushConfig — environment only, fail-closed", () => {
  it("missing or malformed values → unavailable; well-formed → available; the private key never leaves it except for signing", () => {
    expect(pushConfig({})).toEqual({ available: false, reason: "unconfigured" });
    const ok = { WEB_PUSH_VAPID_PUBLIC_KEY: DUMMY_PUBLIC, WEB_PUSH_VAPID_PRIVATE_KEY: DUMMY_PRIVATE, WEB_PUSH_VAPID_SUBJECT: "mailto:admin@example.com" };
    expect(pushConfig(ok)).toEqual({ available: true, publicKey: DUMMY_PUBLIC, privateKey: DUMMY_PRIVATE, subject: "mailto:admin@example.com" });
    expect(pushConfig({ ...ok, WEB_PUSH_VAPID_SUBJECT: "https://exambank.example" }).available).toBe(true);
    expect(pushConfig({ ...ok, WEB_PUSH_VAPID_SUBJECT: "admin" }).reason).toBe("invalidSubject");
    expect(pushConfig({ ...ok, WEB_PUSH_VAPID_PUBLIC_KEY: "abc" }).reason).toBe("invalidPublicKey");
    expect(pushConfig({ ...ok, WEB_PUSH_VAPID_PRIVATE_KEY: DUMMY_PUBLIC }).reason).toBe("invalidPrivateKey");
    expect(pushConfig({ ...ok, WEB_PUSH_VAPID_PRIVATE_KEY: "" }).reason).toBe("unconfigured");
  });
});

describe("trigger order — the push can only follow a SUCCESSFUL save", () => {
  const storage = createRequire(import.meta.url)("../src/lib/platform-storage.js");

  it("the notifier runs strictly after the message blob is committed, and sees it persisted", async () => {
    const ctx = createMemoryContainer(seed());
    const events = [];
    let seenAtNotify = null;
    const deps = TEACHER(ctx, {
      uploadJsonConditional: async (c, name, value, etag) => {
        const r = await storage.uploadJsonConditional(c, name, value, etag);
        if (name.startsWith(directPrefix(S1))) events.push("saved");
        return r;
      },
      notifyStudentOfNewMessage: async (_c, studentId) => {
        events.push("notify");
        seenAtNotify = ctx.names(directPrefix(studentId)).map(n => ctx.getJson(n).body);
        return { status: "sent" };
      }
    });
    const r = await tPost(deps, { action: "sendDirect", studentId: S1, body: "محفوظة أولًا" });
    expect(r.status).toBe(200);
    expect(events).toEqual(["saved", "notify"]);
    expect(seenAtNotify).toEqual(["محفوظة أولًا"]);
  });

  it("if the save fails, the notifier is NEVER invoked (and nothing is persisted)", async () => {
    const ctx = createMemoryContainer(seed());
    const notify = vi.fn(async () => ({ status: "sent" }));
    for (const failure of [new Error("storage unavailable"), Object.assign(new Error("conflict"), { statusCode: 409 })]) {
      const deps = TEACHER(ctx, { uploadJsonConditional: async () => { throw failure; }, notifyStudentOfNewMessage: notify });
      const r = await tPost(deps, { action: "sendDirect", studentId: S1, body: "x" });
      expect(r.status).toBe(500);
    }
    expect(notify).not.toHaveBeenCalled();
    expect(ctx.names(directPrefix(S1))).toEqual([]);
  });

  it("validation / read-only failures never notify", async () => {
    const ctx = createMemoryContainer(seed({ ["platform/users/" + S2 + ".json"]: student(S2, { archived: true }) }));
    const notify = vi.fn(async () => ({ status: "sent" }));
    expect((await tPost(TEACHER(ctx, { notifyStudentOfNewMessage: notify }), { action: "sendDirect", studentId: S1, body: "" })).status).toBe(400);
    expect((await tPost(TEACHER(ctx, { notifyStudentOfNewMessage: notify }), { action: "sendDirect", studentId: S2, body: "x" })).status).toBe(403);
    expect(notify).not.toHaveBeenCalled();
  });
});
