import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import { EventEmitter } from "events";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { handler as studentPush } from "../src/functions/student-push.js";
import { canonicalEndpoint, normalizeSubscription, endpointId, studentDocName, endpointDocName, isAllowedPushHost } from "../src/lib/push-subscriptions.js";
import { notifyStudentOfNewMessage, pushConfig } from "../src/lib/push-notify.js";

// Phase 6B follow-up — ONE canonical endpoint: what is validated is exactly what is stored, hashed, owned and sent.
// The last block drives the REAL web-push@3.6.7 sender (real VAPID signing + aes128gcm encryption, disposable keys
// generated in-process, nothing written to disk). Its HTTPS request is captured at `https.request` and answered locally,
// so no external push service is ever contacted — and we can see exactly which host/port/path it tried to reach.

const require_ = createRequire(import.meta.url);
const https = require_("https");
const crypto = require_("crypto");
const webpush = require_("web-push");

const b64 = buf => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const dummyKeys = { p256dh: b64(Buffer.alloc(65, 1)), auth: b64(Buffer.alloc(16, 1)) };

describe("canonicalEndpoint — accepted endpoints", () => {
  it.each([
    ["FCM", "https://fcm.googleapis.com/fcm/send/abc:APA91b-x_y", "https://fcm.googleapis.com/fcm/send/abc:APA91b-x_y"],
    ["Mozilla", "https://updates.push.services.mozilla.com/wpush/v2/gAAAA", "https://updates.push.services.mozilla.com/wpush/v2/gAAAA"],
    ["Apple", "https://web.push.apple.com/QK-abc", "https://web.push.apple.com/QK-abc"],
    ["WNS", "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA", "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA"],
    ["uppercase host is normalized", "https://FCM.GoogleAPIs.com/fcm/send/x", "https://fcm.googleapis.com/fcm/send/x"],
    ["dot segments are resolved", "https://fcm.googleapis.com/fcm/send/./x", "https://fcm.googleapis.com/fcm/send/x"],
    ["surrounding whitespace trimmed", "  https://fcm.googleapis.com/fcm/send/x \n", "https://fcm.googleapis.com/fcm/send/x"]
  ])("%s", (_label, input, canonical) => {
    expect(canonicalEndpoint(input)).toBe(canonical);
    expect(normalizeSubscription({ endpoint: input, keys: dummyKeys }).endpoint).toBe(canonical);   // stored form
  });
});

describe("canonicalEndpoint — rejected endpoints (parser confusion, SSRF)", () => {
  it.each([
    ["scheme without slashes (legacy parser → no host → localhost)", "https:fcm.googleapis.com/fcm/send/x"],
    ["backslash authority", "https:\\\\fcm.googleapis.com/fcm/send/x"],
    ["backslash inside authority", "https://fcm.googleapis.com\\@evil.com/x"],
    ["%2e-encoded dots in host", "https://fcm%2egoogleapis%2ecom/fcm/send/x"],
    ["percent-encoded letter in host", "https://%66cm.googleapis.com/fcm/send/x"],
    ["explicit non-default port", "https://fcm.googleapis.com:8443/fcm/send/x"],
    ["explicit default port", "https://fcm.googleapis.com:443/fcm/send/x"],
    ["userinfo", "https://user:pw@fcm.googleapis.com/fcm/send/x"],
    ["userinfo pointing elsewhere", "https://fcm.googleapis.com@evil.com/x"],
    ["lookalike prefix", "https://evilfcm.googleapis.com/x"],
    ["allowed name as a subdomain of an attacker", "https://fcm.googleapis.com.evil.com/x"],
    ["trailing-dot host", "https://fcm.googleapis.com./fcm/send/x"],
    ["localhost", "https://localhost/x"],
    ["IPv4", "https://127.0.0.1/x"],
    ["metadata IP", "https://169.254.169.254/latest"],
    ["IPv6", "https://[::1]/x"],
    ["http", "http://fcm.googleapis.com/fcm/send/x"],
    ["wss", "wss://fcm.googleapis.com/fcm/send/x"],
    ["fragment", "https://fcm.googleapis.com/fcm/send/x#@evil.com"],
    ["tab inside host", "https://fcm.googleapis.com\t.evil.com/x"],
    ["space inside", "https://fcm.googleapis.com/fcm/send/a b"],
    ["unicode lookalike host", "https://fcm.googleapis.cοm/x"],
    ["too long", "https://fcm.googleapis.com/" + "a".repeat(2100)],
    ["not a string", 42]
  ])("%s", (_label, input) => {
    expect(canonicalEndpoint(input)).toBeNull();
    expect(normalizeSubscription({ endpoint: input, keys: dummyKeys })).toBeNull();
  });
});

describe("the canonical endpoint is what is stored, hashed, owned and unsubscribed", () => {
  const S1 = "11111111-1111-1111-1111-111111111111";
  const C1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const seed = () => ({
    ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, classId: C1, active: true, archived: false, authVersion: 1 },
    ["platform/classes/" + C1 + ".json"]: { classId: C1, name: "ص", active: true, studentIds: [S1] }
  });
  const deps = ctx => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }), pushConfig: () => ({ available: true, publicKey: "x", privateKey: "y", subject: "mailto:a@b.c" }) });
  const post = (ctx, body) => studentPush({ method: "POST", url: "https://x/api/student-push", headers: { get: () => null }, json: async () => body }, deps(ctx));

  it("a non-canonical but valid spelling is stored canonically; the same device in another spelling is ONE device", async () => {
    const ctx = createMemoryContainer(seed());
    const canonical = "https://fcm.googleapis.com/fcm/send/x";
    expect((await post(ctx, { action: "subscribe", subscription: { endpoint: "https://FCM.googleapis.com/fcm/send/./x", keys: dummyKeys } })).status).toBe(200);
    expect((await post(ctx, { action: "subscribe", subscription: { endpoint: canonical, keys: dummyKeys } })).jsonBody.created).toBe(false);
    const list = ctx.getJson(studentDocName(S1)).subscriptions;
    expect(list.map(s => s.endpoint)).toEqual([canonical]);
    expect(list[0].id).toBe(endpointId(canonical));
    expect(ctx.getJson(endpointDocName(endpointId(canonical))).studentId).toBe(S1);
    expect((await post(ctx, { action: "unsubscribe", endpoint: "https://fcm.googleapis.com/fcm/send/./x" })).jsonBody).toEqual({ ok: true, removed: 1 });
    expect(ctx.getJson(endpointDocName(endpointId(canonical))).studentId).toBe("");
  });
  it("parser-confusion endpoints are refused at subscribe (400) and nothing is written", async () => {
    const ctx = createMemoryContainer(seed());
    for (const endpoint of ["https:fcm.googleapis.com/fcm/send/x", "https://fcm%2egoogleapis%2ecom/x", "https://fcm.googleapis.com:8443/x"]) {
      expect((await post(ctx, { action: "subscribe", subscription: { endpoint, keys: dummyKeys } })).status).toBe(400);
    }
    expect(ctx.names("platform/push/")).toEqual([]);
  });
  it("a stored entry that is NOT canonical (legacy/tampered) is never sent to", async () => {
    const ctx = createMemoryContainer(seed());
    const raw = "https:fcm.googleapis.com/fcm/send/x";
    ctx.setJson(studentDocName(S1), { schemaVersion: 2, studentId: S1, subscriptions: [{ id: endpointId(raw), endpoint: raw, keys: dummyKeys, claim: "c" }] });
    ctx.setJson(endpointDocName(endpointId(raw)), { schemaVersion: 2, id: endpointId(raw), studentId: S1, claim: "c" });
    const send = vi.fn(async () => ({}));
    const r = await notifyStudentOfNewMessage(ctx.container, S1, { pushConfig: () => ({ available: true, publicKey: "x", privateKey: "y", subject: "mailto:a@b.c" }), sendNotification: send });
    expect(send).not.toHaveBeenCalled();
    expect(r.attempted).toBe(0);
  });
});

describe("REAL web-push@3.6.7 sender — the host it contacts is exactly the host that was validated", () => {
  let requests;
  beforeEach(() => {
    requests = [];
    // Capture every outgoing HTTPS request made by web-push and answer it locally (201). Nothing leaves the process.
    vi.spyOn(https, "request").mockImplementation((options, onResponse) => {
      const req = new EventEmitter();
      const body = [];
      req.write = chunk => { body.push(Buffer.from(chunk)); return true; };
      req.destroy = () => {};
      req.setTimeout = () => req;
      req.end = () => {
        requests.push({ hostname: options.hostname, port: options.port, path: options.path, method: options.method, headers: options.headers, bytes: Buffer.concat(body).length });
        const res = new EventEmitter();
        res.statusCode = 201; res.headers = {};
        queueMicrotask(() => { onResponse(res); res.emit("end"); });
      };
      return req;
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const vapid = () => webpush.generateVAPIDKeys();                            // disposable, in memory only
  const browserKeys = () => { const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys(); return { p256dh: b64(ecdh.getPublicKey()), auth: b64(crypto.randomBytes(16)) }; };
  const config = keys => pushConfig({ WEB_PUSH_VAPID_PUBLIC_KEY: keys.publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: keys.privateKey, WEB_PUSH_VAPID_SUBJECT: "mailto:review@example.com" });

  it("the harness is real: sending a RAW parser-confusion string would reach a different host (why canonicalization matters)", async () => {
    const keys = vapid();
    await webpush.sendNotification({ endpoint: "https:fcm.googleapis.com/fcm/send/x", keys: browserKeys() }, "x", { vapidDetails: { subject: "mailto:a@b.c", ...keys } });
    expect(requests[0].hostname).not.toBe("fcm.googleapis.com");               // legacy url.parse → no host (= localhost)
  });

  it("for every validator-accepted spelling, the real sender contacts the validated host on the default port and path", async () => {
    const keys = vapid();
    const inputs = [
      "https://fcm.googleapis.com/fcm/send/abc", "https://FCM.GoogleAPIs.com/fcm/send/abc", "https://fcm.googleapis.com/fcm/send/./abc",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA", "https://web.push.apple.com/QK-1", "https://wns2-par02p.notify.windows.com/w/?token=BQ",
      "  https://fcm.googleapis.com/fcm/send/abc?x=1  "
    ];
    for (const input of inputs) {
      const endpoint = canonicalEndpoint(input);
      expect(endpoint, input).not.toBeNull();
      const validated = new URL(endpoint);
      await webpush.sendNotification({ endpoint, keys: browserKeys() }, "payload", { vapidDetails: { subject: "mailto:a@b.c", ...keys }, TTL: 60 });
      const sent = requests[requests.length - 1];
      expect(sent.hostname, input).toBe(validated.hostname);
      expect(isAllowedPushHost(sent.hostname)).toBe(true);
      expect(sent.port ?? null).toBeNull();                                   // no explicit port → 443
      expect(sent.path).toBe(validated.pathname + validated.search);
      expect(sent.method).toBe("POST");
    }
  });

  it("end to end: subscribe → notify with the real default sender (no sendNotification dep) → the canonical host is contacted", async () => {
    const S1 = "11111111-1111-1111-1111-111111111111";
    const ctx = createMemoryContainer({ ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, active: true, archived: false, authVersion: 1 } });
    const keys = vapid();
    const cfg = config(keys);
    expect(cfg.available).toBe(true);
    const deps = { container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }), pushConfig: () => cfg };
    const r = await studentPush({ method: "POST", url: "https://x/api/student-push", headers: { get: () => null }, json: async () => ({ action: "subscribe", subscription: { endpoint: "https://FCM.googleapis.com/fcm/send/./device", keys: browserKeys() } }) }, deps);
    expect(r.status).toBe(200);
    const summary = await notifyStudentOfNewMessage(ctx.container, S1, { pushConfig: () => cfg });
    expect(summary).toMatchObject({ status: "sent", attempted: 1, delivered: 1 });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ hostname: "fcm.googleapis.com", path: "/fcm/send/device", method: "POST" });
    expect(requests[0].headers).toMatchObject({ TTL: 86400, Urgency: "normal", Topic: "eb-message", "Content-Encoding": "aes128gcm" });
    expect(String(requests[0].headers.Authorization)).toMatch(/^vapid t=.+, k=/);
    expect(requests[0].bytes).toBeGreaterThan(0);                            // encrypted payload, never plaintext
  });
});
