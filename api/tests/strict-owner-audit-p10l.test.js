import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P10-L — every owner change is recorded BEFORE it happens (closes security review O14; design
// docs/enterprise-strict-owner-audit-p10l.md, owner decision §19.49: «صارم لكل تغيير، لا للدخول»). Before P10-L most owner routes
// changed first and recorded afterwards, best effort: when the owner audit could not be written, the change stayed with no trace
// (switching the access mode, a teacher's permissions, suspending a teacher, the owner's password …). Now the record is written
// first; a record that cannot be written refuses the change with 503 AUDIT_UNAVAILABLE and nothing changes. Signing in and out stay
// best effort. Real handlers, a real bootstrapped owner (password + authenticator), test data only. The owner audit is made
// unavailable by a container that refuses writes under the owner-audit prefix ONLY — every other write works.

process.env.BANK_SETUP_KEY = "p10l-test-root-secret";
delete process.env.BUILDER_SESSION_SECRET;
for (const k of ["OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const totp = await import("../src/lib/identity/totp.js");
const { createBootstrapMaterial } = await import("../../scripts/owner-bootstrap-token.mjs");
const { handler: bootstrap } = await import("../src/functions/owner-bootstrap.js");
const { handler: login } = await import("../src/functions/owner-login.js");
const { handler: session } = await import("../src/functions/owner-session.js");
const { handler: access } = await import("../src/functions/owner-access.js");
const { handler: teachers } = await import("../src/functions/owner-teachers.js");
const { handler: classes } = await import("../src/functions/owner-classes.js");
const { handler: schools } = await import("../src/functions/owner-schools.js");
const { OWNER_AUDIT_PREFIX, recordOwnerChange } = await import("../src/lib/audit-log.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { REVISION_PREFIX, resetRevisionCache } = await import("../src/lib/access/revisions.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { resetOperatorGateCache } = await import("../src/lib/identity/operator-gate.js");

const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };   // test-only cost; production uses DEFAULT_PARAMS
const T0 = Date.parse("2026-11-06T09:00:00.000Z");
const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "a brand new owner passphrase";
const USERNAME = "tadris.owner";
const SARA = "t_00112233445566aa";

function request({ method = "POST", action = "", body = {}, headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: { action }, url: "https://x.invalid/api", headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}

/** A store whose owner-audit writes can be switched off (every other write goes through), with a conflict hook for one blob. */
function auditSwitchableStore() {
  const state = { auditDown: false, conflictOn: null };
  const mem = createMemoryContainer({}, { beforeConditionalUpload(name, api) { if (state.conflictOn === name) api.setJson(name, api.getJson(name)); } });
  const refuse = { upload: async () => { throw Object.assign(new Error("owner audit storage down"), { statusCode: 503 }); } };
  const container = new Proxy(mem.container, {
    get(t, k) {
      const v = t[k];
      if (k === "getBlockBlobClient") return name => (state.auditDown && String(name).startsWith(OWNER_AUDIT_PREFIX) ? refuse : v.call(t, name));
      return typeof v === "function" ? v.bind(t) : v;
    }
  });
  return { mem, container, state };
}

async function setup() {
  resetOperatorGateCache(); resetRevisionCache();
  const store = auditSwitchableStore();
  const material = createBootstrapMaterial({ hours: 2, now: T0 });
  const env = { BANK_SETUP_KEY: "p10l-test-root-secret", OWNER_BOOTSTRAP_TOKEN_SHA256: material.sha256, OWNER_BOOTSTRAP_EXPIRES_AT: material.expiresAt };
  const clock = { now: T0 };
  let ip = 1;
  const deps = { env, getContainer: () => store.container, now: () => clock.now, hashParams: FAST, clientIdFromRequest: () => "10.0.0." + ip };
  const begin = await bootstrap(request({ action: "begin", body: { token: material.token, username: USERNAME, displayName: "مالك المنصة", password: PASSWORD } }), deps);
  const secret = totp.base32Decode(begin.jsonBody.totp.secret);
  expect((await bootstrap(request({ action: "confirm", body: { token: material.token, code: totp.totpAt(secret, clock.now) } }), deps)).status).toBe(201);
  const signIn = async (password = PASSWORD) => { clock.now += 30_000; ip += 1; return login(request({ body: { username: USERNAME, password, code: totp.totpAt(secret, clock.now) } }), deps); };
  const token = (await signIn()).jsonBody.token;
  const owner = { "x-owner-token": token };
  store.mem.setJson(teacherAccountName(SARA), { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, sessions: [], revokedSessions: [] });
  const call = (handler, action, body = {}) => handler(request({ action, body, headers: owner }), deps);
  const ownerAudit = () => store.mem.names(OWNER_AUDIT_PREFIX).map(n => ({ name: n, ...store.mem.getJson(n), etag: Number(String(store.mem.store.get(n).etag).replace("etag-", "")) }));
  const etagOf = name => Number(String(store.mem.store.get(name).etag).replace("etag-", ""));
  return { ...store, deps, clock, call, signIn, token, ownerAudit, etagOf };
}
const unavailable = r => r.status === 503 && r.jsonBody && r.jsonBody.code === "AUDIT_UNAVAILABLE";

describe("P10-L fail-first: an owner change that cannot be recorded does not happen (O14)", () => {
  let ctx;
  beforeEach(async () => { ctx = await setup(); ctx.state.auditDown = true; });

  it("switching the access mode → 503 AUDIT_UNAVAILABLE and the mode is unchanged (baseline: 200, the mode changed, no record)", async () => {
    const r = await ctx.call(access, "mode", { mode: "observe" });
    expect(r.status + " " + r.jsonBody.code).toBe("503 AUDIT_UNAVAILABLE");
    expect(ctx.mem.getJson(ACCESS_CONTROL_DOC)).toBeNull();
  });

  it("assigning a teacher's permissions → 503 and no revision, the teacher's pointer unchanged (baseline: 200)", async () => {
    const r = await ctx.call(access, "assign", { accountId: SARA, presetId: "learning-only", presetVersion: 1, baseRevisionId: null });
    expect(unavailable(r)).toBe(true);
    expect(ctx.mem.names(REVISION_PREFIX)).toEqual([]);
    expect(ctx.mem.getJson(teacherAccountName(SARA)).accessRevisionId).toBeUndefined();
  });

  it("suspending a teacher → 503 and the teacher stays active (baseline: 200, suspended)", async () => {
    expect(unavailable(await ctx.call(teachers, "suspend", { accountId: SARA, reason: "test" }))).toBe(true);
    expect(ctx.mem.getJson(teacherAccountName(SARA)).status).toBe("active");
  });

  it("changing the owner's password → 503 and the old password still signs in (baseline: changed)", async () => {
    expect(unavailable(await ctx.call(session, "password", { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }))).toBe(true);
    expect((await ctx.signIn(PASSWORD)).status).toBe(200);
  });

  it("creating a class for a teacher, and a school (recorded at its first write) → 503 and nothing created", async () => {
    expect(unavailable(await ctx.call(classes, "create", { accountId: SARA, name: "الحادي عشر", grade: "11", schoolYear: "2026" }))).toBe(true);
    expect(ctx.mem.names("platform/classes/")).toEqual([]);
    expect(unavailable(await ctx.call(schools, "create", { name: "مدرسة تجريبية" }))).toBe(true);
    expect(ctx.mem.names("platform/schools/")).toEqual([]);
  });
});

describe("P10-L the order and what stays as it was", () => {
  let ctx;
  beforeEach(async () => { ctx = await setup(); });

  it("the record is written BEFORE the change, and carries an opId (store write order)", async () => {
    expect((await ctx.call(access, "mode", { mode: "observe" })).status).toBe(200);
    const rec = ctx.ownerAudit().find(e => e.action === "owner.access.mode");
    expect(rec.details).toEqual({ from: "legacy", to: "observe" });
    expect(rec.opId).toMatch(/^op_[0-9a-f]{16}$/);
    expect(rec.etag).toBeLessThan(ctx.etagOf(ACCESS_CONTROL_DOC));
  });

  it("signing in and out work while the owner audit is unavailable (owner decision: not for sign-in)", async () => {
    ctx.state.auditDown = true;
    const r = await ctx.signIn();
    expect(r.status).toBe(200);
    expect((await session(request({ action: "logout", headers: { "x-owner-token": r.jsonBody.token } }), ctx.deps)).status).toBe(200);
  });

  it("a request refused for its input, or a change that finds nothing to change, records nothing", async () => {
    const before = ctx.ownerAudit().length;
    expect((await ctx.call(access, "mode", { mode: "bogus" })).status).toBe(409);
    expect((await ctx.call(teachers, "suspend", { accountId: "not-an-id" })).status).toBe(400);
    const created = await ctx.call(classes, "create", { accountId: SARA, name: "الحادي عشر", grade: "11", schoolYear: "2026" });
    const classId = created.jsonBody.classroom.classId;
    const afterCreate = ctx.ownerAudit().length;
    expect(afterCreate).toBe(before + 1);
    const same = await ctx.call(classes, "update", { classId, name: "الحادي عشر", grade: "11", schoolYear: "2026" });
    expect([same.status, same.jsonBody.changed]).toEqual([200, false]);
    expect(ctx.ownerAudit().length).toBe(afterCreate);
  });

  it("a recorded change that then cannot be applied is marked «not applied» with the same opId", async () => {
    ctx.state.conflictOn = teacherAccountName(SARA);            // every compare-and-set on Sara's account loses the race
    const r = await ctx.call(teachers, "suspend", { accountId: SARA });
    expect(r.status).toBeGreaterThanOrEqual(400);
    ctx.state.conflictOn = null;
    expect(ctx.mem.getJson(teacherAccountName(SARA)).status).toBe("active");
    const rec = ctx.ownerAudit().find(e => e.action === "owner.teacher.suspend");
    const mark = ctx.ownerAudit().find(e => e.action === "owner.teacher.suspend.not-applied");
    expect(rec && mark).toBeTruthy();
    expect(mark.opId).toBe(rec.opId);
  });

  it("recordOwnerChange: a failed record never calls the change; a successful one passes the answer on unchanged", async () => {
    let applied = 0;
    const down = await recordOwnerChange(ctx.mem.container, { action: "owner.test" }, async () => { applied++; return { status: 200 }; }, { write: async () => { throw new Error("down"); } });
    expect([down.status, down.jsonBody.code, applied]).toEqual([503, "AUDIT_UNAVAILABLE", 0]);
    const written = [];
    const ok = await recordOwnerChange(ctx.mem.container, { action: "owner.test" }, async opId => { applied++; return { status: 201, jsonBody: { opId } }; }, { write: async (c, e) => { written.push(e); } });
    expect([ok.status, applied, written.length, written[0].opId === ok.jsonBody.opId]).toEqual([201, 1, 1, true]);
  });
});

describe("P10-L static guard: an owner change cannot be recorded best effort by accident", () => {
  const FN = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "functions");
  const STRICT_ROUTES = ["owner-access.js", "owner-teachers.js", "owner-classes.js", "owner-library.js", "owner-schools.js", "owner-handoff.js", "owner-session.js", "owner-bootstrap.js"];
  // The only owner events written best effort in those routes, each with its reason (design §3.3).
  const BEST_EFFORT = {
    "owner.logout": "signing out (owner decision: not for sign-in)",
    "owner.step-up.failed": "the recent step-up is part of signing in",
    "owner.step-up.succeeded": "the recent step-up is part of signing in",
    "owner.password.change-failed": "a failed attempt changes nothing",
    "owner.totp.reenrol-failed": "a failed attempt changes nothing",
    "owner.student.transferred": "completion detail: the move writes its own record (transferHistory) and a ledger",
    "owner.class.transferred": "completion detail: the move writes its own record (ownerHistory) and a ledger"
  };

  it("every owner-audit writer in the strict routes is strict by default, and every best-effort write is an allowed event", () => {
    const offenders = [];
    for (const f of STRICT_ROUTES) {
      const src = readFileSync(join(FN, f), "utf8");
      if (!/recordOwnerChange(AtWrite)?\(/.test(src)) offenders.push(f + ": no recordOwnerChange");
      if (/\bawait audit\(|\baudit\(container/.test(src)) offenders.push(f + ": an owner event written outside recordOwnerChange");
      if (/deps\.recordOwnerAuditEvent \|\| recordOwnerAuditEvent\)\(/.test(src)) offenders.push(f + ": an inline best-effort owner write");
      // `return change(...)` inside a try is not caught there: an error in the change would escape the route's own 503 (found in P10-L).
      if (/\breturn (change|atWrite|recordOwnerChange|recordOwnerChangeAtWrite)\(/.test(src)) offenders.push(f + ": a recorded change returned without await");
      for (const line of src.split("\n").filter(l => /\bauditBestEffort\(container/.test(l))) {
        if (/P10-L completion detail/.test(line) && /action: "owner\." \+ ev\.action/.test(line)) continue;   // a library's own result record
        const actions = [...line.matchAll(/"(owner\.[a-z.-]+)"/g)].map(m => m[1]).filter(a => !a.endsWith("."));
        for (const a of actions) if (!BEST_EFFORT[a]) offenders.push(f + ": best-effort " + a);
        if (!actions.length) offenders.push(f + ": a best-effort owner write with no named event");
      }
    }
    expect(offenders).toEqual([]);
  });
});
