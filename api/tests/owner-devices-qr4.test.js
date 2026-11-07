import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ QR-4 — «الأجهزة المرتبطة» for the platform owner (design docs/enterprise-qr-login-qr4.md). TEST data only.
//   devices: this owner's LIVE sessions only (same account, current authVersion, unexpired), newest first, ids are hashes (never
//   the session id), the current one marked; end-device: needs a recent step-up, recorded strictly BEFORE the session document is
//   deleted, refused from the next request, 404 for anything that is not one of this owner's live sessions; the QR sign-in and
//   the password sign-in keep the device words.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "qr4-root-secret-for-tests-only";
delete process.env.OWNER_SESSION_SECRET;

const { handler: ownerSession } = await import("../src/functions/owner-session.js");
const { handler: ownerQrLogin, OWNER_QR_PREFIX } = await import("../src/functions/owner-qr-login.js");
const { handler: ownerQrApprove } = await import("../src/functions/owner-qr-login-approve.js");
const { createOwnerToken, requireOwnerSession, verifyOwnerToken } = cjs("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = cjs("../src/lib/identity/owner-store.js");
const { OWNER_AUDIT_PREFIX } = cjs("../src/lib/audit-log.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");
const crypto = cjs("crypto");

const OWNER_ID = "own_0011223344556677", OTHER_OWNER = "own_00112233445566ff";
const hashOf = sid => crypto.createHash("sha256").update("tadris-owner-session|" + sid, "utf8").digest("hex");
const UA_LAPTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0";

let mem, clock, deps;
const headersOf = h => { const m = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v])); return { get: k => m[String(k).toLowerCase()] ?? null }; };
function seedSession(ch, { accountId = OWNER_ID, ago = 0, stepUpAgo = 0, expiresIn = 7200e3, authVersion = 1, device = null, factor = "totp" } = {}) {
  const sid = ch.repeat(32);
  mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId, authVersion, createdAtMs: clock.now - ago, expiresAtMs: clock.now + expiresIn, stepUpAtMs: clock.now - stepUpAgo, factor, ...(device ? { device } : {}) });
  return { sid, headers: headersOf({ "x-owner-token": createOwnerToken({ accountId, sid, authVersion }, { nowMs: clock.now }).token }) };
}
beforeEach(() => {
  resetOperatorGateCache();
  mem = createMemoryContainer();
  clock = { now: Date.now() };
  deps = { getContainer: () => mem.container, now: () => clock.now };
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: clock.now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
});
const call = (action, who, body = {}) => ownerSession({ method: "POST", params: { action }, headers: who.headers, json: async () => body }, deps);
const ownerOk = async who => (await requireOwnerSession({ headers: who.headers }, deps)).ok;

describe("QR-4 the owner's devices", () => {
  it("lists only this owner's live sessions, newest first; ids are hashes; the current one is marked", async () => {
    const phone = seedSession("a", { ago: 3600e3, device: { browser: "Chrome", os: "Android" } });
    const laptop = seedSession("b", { ago: 60e3, device: { browser: "Edge", os: "Windows" }, factor: "qr" });
    seedSession("c", { expiresIn: -1 });                       // expired
    seedSession("d", { authVersion: 2 });                      // not the account's current authVersion (as after «إنهاء كل الجلسات»)
    seedSession("e", { accountId: OTHER_OWNER });              // another account
    const r = await call("devices", phone);
    expect(r.status).toBe(200);
    expect(r.jsonBody.devices.map(d => [d.id, d.via, d.device, d.current])).toEqual([
      [hashOf(laptop.sid), "qr", { browser: "Edge", os: "Windows" }, false],
      [hashOf(phone.sid), "login", { browser: "Chrome", os: "Android" }, true]
    ]);
    expect(JSON.stringify(r.jsonBody)).not.toContain(laptop.sid);
  });

  it("ending another device needs a recent step-up; nothing is deleted without it", async () => {
    const phone = seedSession("a", { stepUpAgo: 11 * 60e3 });
    const laptop = seedSession("b");
    const r = await call("end-device", phone, { id: hashOf(laptop.sid) });
    expect(r.status).toBe(403);
    expect(r.jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect(await ownerOk(laptop)).toBe(true);
  });

  it("with a step-up: that device is signed out at once, recorded first; the caller stays", async () => {
    const phone = seedSession("a");
    const laptop = seedSession("b");
    const r = await call("end-device", phone, { id: hashOf(laptop.sid) });
    expect(r.jsonBody).toEqual({ ok: true, ended: true, current: false });
    expect(await ownerOk(laptop)).toBe(false);
    expect(await ownerOk(phone)).toBe(true);
    expect(mem.names(OWNER_AUDIT_PREFIX).map(n => mem.getJson(n).action)).toContain("owner.session.device-ended");
  });

  it("a failed audit write refuses the change (503) and the session stays", async () => {
    const phone = seedSession("a");
    const laptop = seedSession("b");
    const r = await ownerSession({ method: "POST", params: { action: "end-device" }, headers: phone.headers, json: async () => ({ id: hashOf(laptop.sid) }) }, { ...deps, recordOwnerAuditEvent: async () => { throw new Error("audit down"); } });
    expect(r.status).toBe(503);
    expect(await ownerOk(laptop)).toBe(true);
  });

  it("only this owner's live sessions can be ended: another account's, an expired one, a malformed id → 404", async () => {
    const phone = seedSession("a");
    const other = seedSession("e", { accountId: OTHER_OWNER });
    const expired = seedSession("c", { expiresIn: -1 });
    for (const id of [hashOf(other.sid), hashOf(expired.sid), other.sid, "../x", ""]) {
      expect((await call("end-device", phone, { id })).status).toBe(404);
    }
    expect(mem.has(ownerSessionName(other.sid))).toBe(true);
  });

  it("ending this very device is a sign-out (current: true)", async () => {
    const phone = seedSession("a");
    expect((await call("end-device", phone, { id: hashOf(phone.sid) })).jsonBody).toEqual({ ok: true, ended: true, current: true });
    expect(await ownerOk(phone)).toBe(false);
  });

  it("an anonymous or teacher token never reaches the list", async () => {
    expect((await ownerSession({ method: "POST", params: { action: "devices" }, headers: headersOf({}), json: async () => ({}) }, deps)).status).toBe(401);
    expect((await ownerSession({ method: "POST", params: { action: "devices" }, headers: headersOf({ authorization: "Bearer some.teacher" }), json: async () => ({}) }, deps)).status).toBe(401);
  });

  it("a QR owner sign-in keeps the new device's words", async () => {
    const phone = seedSession("a");
    const start = (await ownerQrLogin({ method: "POST", params: { action: "start" }, headers: headersOf({ "user-agent": UA_LAPTOP, "x-forwarded-for": "10.1.0.1" }), json: async () => ({}) }, deps)).jsonBody;
    expect(mem.names(OWNER_QR_PREFIX)).toHaveLength(1);
    expect((await ownerQrApprove({ method: "POST", params: { action: "approve" }, headers: phone.headers, json: async () => ({ pairingToken: start.pairingToken, matchCode: start.matchCode }) }, deps)).status).toBe(200);
    const r = await ownerQrLogin({ method: "POST", params: { action: "poll" }, headers: headersOf({}), json: async () => ({ pairingToken: start.pairingToken, pollSecret: start.pollSecret }) }, deps);
    const sid = verifyOwnerToken(r.jsonBody.token, { nowMs: clock.now }).sid;
    expect(mem.getJson(ownerSessionName(sid)).device).toEqual({ browser: "Edge", os: "Windows" });
    const listed = (await call("devices", phone)).jsonBody.devices;
    expect(listed.find(d => d.id === hashOf(sid))).toMatchObject({ via: "qr", device: { browser: "Edge", os: "Windows" }, current: false });
  });
});
