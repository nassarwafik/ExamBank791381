import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Trial teacher accounts — the owner creates a TRIAL teacher account that ends after a set number of days (1–90), extends it,
// or makes it permanent. From the end on, the account is refused everywhere a suspended one is: sign-in, every request
// (lib/teacher-session.js), and the invitation link. An unreadable trial record counts as ended (fail closed). TEST data only.

process.env.BANK_SETUP_KEY = "trial-test-root-secret";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_SESSION_VERSION;

const { handler: ownerTeachers } = await import("../src/functions/owner-teachers.js");
const { handler: invitation } = await import("../src/functions/teacher-invitation.js");
const { handler: login } = await import("../src/functions/platform-login.js");
const { requireTeacherSession } = await import("../src/lib/teacher-session.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName, trialEnded, validTrialDays, extendedTrial, DAY_MS } = await import("../src/lib/identity/teacher-accounts.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");

const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };
const OWNER_ID = "own_0011223344556677";
const PASSWORD = "a long teacher passphrase";

function req({ method = "POST", action = "", body = {}, headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: { action }, headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}

function setup(hooks = {}) {
  const mem = createMemoryContainer({}, hooks);
  const clock = { now: Date.now() };
  const deps = { getContainer: () => mem.container, now: () => clock.now, hashParams: FAST, reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, clientIdFromRequest: () => "10.0.0.1" };
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: clock.now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const ownerSession = () => {
    const sid = "c".repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: clock.now, expiresAtMs: clock.now + 400 * DAY_MS, stepUpAtMs: clock.now });
    return { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: clock.now }).token };
  };
  return { mem, clock, deps, ownerSession, owner: ownerSession() };
}

const tokenOf = invitationPath => invitationPath.replace(/^#\/invite\//, "");
const teacherHeaders = token => ({ authorization: "Bearer " + token, "x-builder-token": token });
const owner = (ctx, action, body) => ownerTeachers(req({ action, headers: ctx.ownerSession(), body }), ctx.deps);
const accountOf = (ctx, id) => ctx.mem.getJson(teacherAccountName(id));
const signIn = ctx => login(req({ body: { userCode: "t.trial", password: PASSWORD } }), ctx.deps);

async function createTrial(ctx, trialDays = 14) {
  const r = await owner(ctx, "create", { username: "t.trial", displayName: "معلم تجريبي", trialDays });
  expect(r.status).toBe(201);
  return r.jsonBody;
}
async function activateTrial(ctx, trialDays = 14) {
  const created = await createTrial(ctx, trialDays);
  const a = await invitation(req({ action: "accept", body: { token: tokenOf(created.invitation.invitationPath), password: PASSWORD } }), ctx.deps);
  expect(a.status).toBe(200);
  return created.teacher.accountId;
}

describe("trial teacher accounts — the trial rules", () => {
  it("accepts only a whole number of days between 1 and 90", () => {
    for (const ok of [1, 7, 30, 90, "14"]) expect(validTrialDays(ok)).toBe(Number(ok));
    for (const bad of [0, 91, -3, 1.5, "7d", "", null, undefined, true, {}]) expect(validTrialDays(bad)).toBeNull();
  });
  it("a permanent account never ends; a trial ends at its end; an unreadable trial counts as ended (fail closed)", () => {
    const now = 1_800_000_000_000;
    expect(trialEnded({}, now)).toBe(false);
    expect(trialEnded({ trial: null }, now)).toBe(false);
    expect(trialEnded({ trial: { endsAtMs: now + 1 } }, now)).toBe(false);
    expect(trialEnded({ trial: { endsAtMs: now } }, now)).toBe(true);
    for (const broken of ["soon", 5, {}, { endsAtMs: "x" }, { endsAtMs: Infinity }]) expect(trialEnded({ trial: broken }, now)).toBe(true);
  });
  it("an extension counts from the trial's end, or from now once it has ended", () => {
    const now = 1_800_000_000_000;
    expect(extendedTrial({ days: 7, startedAtMs: now - DAY_MS, endsAtMs: now + 6 * DAY_MS }, 7, now)).toMatchObject({ days: 14, endsAtMs: now + 13 * DAY_MS });
    expect(extendedTrial({ days: 7, startedAtMs: now - 10 * DAY_MS, endsAtMs: now - 3 * DAY_MS }, 7, now)).toMatchObject({ days: 14, endsAtMs: now + 7 * DAY_MS });
  });
});

describe("trial teacher accounts — the owner API", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("create with trialDays → a trial account that ends that many days after creation; the owner view and audit say so", async () => {
    const out = await createTrial(ctx, 14);
    const endsAt = new Date(ctx.clock.now + 14 * DAY_MS).toISOString();
    expect(out.teacher.trial).toEqual({ days: 14, endsAt, ended: false });
    expect(accountOf(ctx, out.teacher.accountId).trial).toEqual({ days: 14, startedAtMs: ctx.clock.now, endsAtMs: ctx.clock.now + 14 * DAY_MS });
    const audit = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n)).find(e => e.action === "owner.teacher.created");
    expect(audit.details).toMatchObject({ trialDays: 14, trialEndsAt: endsAt });
    const list = await ownerTeachers(req({ method: "GET", headers: ctx.owner }), ctx.deps);
    expect(list.jsonBody.teachers[0].trial).toEqual({ days: 14, endsAt, ended: false });
  });

  it("a permanent account (no trialDays) has no trial; invalid trialDays are refused and nothing is created", async () => {
    const r = await owner(ctx, "create", { username: "t.perm", displayName: "دائم" });
    expect(r.status).toBe(201);
    expect(r.jsonBody.teacher.trial).toBeNull();
    expect(accountOf(ctx, r.jsonBody.teacher.accountId).trial).toBeUndefined();
    for (const trialDays of [0, 91, 2.5, "abc"]) {
      const bad = await owner(ctx, "create", { username: "t.bad", displayName: "x", trialDays });
      expect(bad.status).toBe(400);
      expect(bad.jsonBody.code).toBe("TRIAL_DAYS_INVALID");
    }
    expect(ctx.mem.names("platform/accounts/teachers/")).toHaveLength(1);
  });

  it("extend-trial adds days (audited); end-trial makes the account permanent; both refuse a permanent account", async () => {
    const id = (await createTrial(ctx, 7)).teacher.accountId;
    const ext = await owner(ctx, "extend-trial", { accountId: id, days: 30 });
    expect(ext.status).toBe(200);
    expect(ext.jsonBody.teacher.trial).toMatchObject({ days: 37, endsAt: new Date(ctx.clock.now + 37 * DAY_MS).toISOString(), ended: false });
    expect((await owner(ctx, "extend-trial", { accountId: id, days: 0 })).jsonBody.code).toBe("TRIAL_DAYS_INVALID");
    const perm = await owner(ctx, "end-trial", { accountId: id });
    expect(perm.status).toBe(200);
    expect(perm.jsonBody.teacher.trial).toBeNull();
    expect(accountOf(ctx, id).trial).toBeNull();
    for (const action of ["extend-trial", "end-trial"]) {
      const r = await owner(ctx, action, { accountId: id, days: 7 });
      expect(r.status).toBe(409);
      expect(r.jsonBody.code).toBe("NOT_A_TRIAL");
    }
    const actions = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n).action);
    expect(actions).toEqual(expect.arrayContaining(["owner.teacher.trial-extended", "owner.teacher.trial-converted"]));
  });

  it("trial changes need a recent step-up like every owner change", async () => {
    const id = (await createTrial(ctx)).teacher.accountId;
    const sid = "d".repeat(32);
    ctx.mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: ctx.clock.now, expiresAtMs: ctx.clock.now + 7200e3, stepUpAtMs: ctx.clock.now - 11 * 60 * 1000 });
    const stale = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: ctx.clock.now }).token };
    for (const action of ["extend-trial", "end-trial"]) {
      const r = await ownerTeachers(req({ action, headers: stale, body: { accountId: id, days: 7 } }), ctx.deps);
      expect(r.status).toBe(403);
      expect(r.jsonBody.code).toBe("STEP_UP_REQUIRED");
    }
    expect(accountOf(ctx, id).trial.days).toBe(14);
  });
});

describe("trial teacher accounts — the end of the trial is enforced", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("during the trial the teacher signs in; after it, the right password gets 403 TEACHER_TRIAL_ENDED and no token", async () => {
    await activateTrial(ctx, 7);
    expect((await signIn(ctx)).status).toBe(200);
    ctx.clock.now += 7 * DAY_MS;
    const r = await signIn(ctx);
    expect(r.status).toBe(403);
    expect(r.jsonBody.code).toBe("TEACHER_TRIAL_ENDED");
    expect(r.jsonBody.token).toBeUndefined();
  });

  it("a wrong password after the trial is still the generic 401 (the trial state is told only to the right password)", async () => {
    await activateTrial(ctx, 7);
    ctx.clock.now += 8 * DAY_MS;
    const r = await login(req({ body: { userCode: "t.trial", password: PASSWORD + "x" } }), ctx.deps);
    expect(r.status).toBe(401);
    expect(r.jsonBody.code).toBeUndefined();
  });

  it("an open session is refused on the very next request once the trial ends", async () => {
    const id = await activateTrial(ctx, 7);
    const { token } = (await signIn(ctx)).jsonBody;
    expect((await requireTeacherSession(req({ headers: teacherHeaders(token) }), ctx.deps)).ok).toBe(true);
    const a = accountOf(ctx, id);
    ctx.mem.setJson(teacherAccountName(id), { ...a, trial: { ...a.trial, endsAtMs: ctx.clock.now + 1000 } });
    ctx.clock.now += 2000;
    const s = await requireTeacherSession(req({ headers: teacherHeaders(token) }), ctx.deps);
    expect(s.ok).toBe(false);
    expect(s.response.status).toBe(401);
    expect(s.response.jsonBody.code).toBe("TEACHER_TRIAL_ENDED");
  });

  it("an unreadable trial record refuses the session (fail closed)", async () => {
    const id = await activateTrial(ctx, 7);
    const { token } = (await signIn(ctx)).jsonBody;
    ctx.mem.setJson(teacherAccountName(id), { ...accountOf(ctx, id), trial: "corrupted" });
    const s = await requireTeacherSession(req({ headers: teacherHeaders(token) }), ctx.deps);
    expect(s.ok).toBe(false);
    expect(s.response.jsonBody.code).toBe("TEACHER_TRIAL_ENDED");
  });

  it("the invitation link of an ended trial is unusable (inspect and accept)", async () => {
    const out = await createTrial(ctx, 1);
    const token = tokenOf(out.invitation.invitationPath);
    const a = accountOf(ctx, out.teacher.accountId);
    ctx.mem.setJson(teacherAccountName(out.teacher.accountId), { ...a, trial: { ...a.trial, endsAtMs: ctx.clock.now - 1 } });
    expect((await invitation(req({ action: "inspect", body: { token } }), ctx.deps)).status).toBe(404);
    expect((await invitation(req({ action: "accept", body: { token, password: PASSWORD } }), ctx.deps)).status).toBe(404);
    expect(accountOf(ctx, out.teacher.accountId).credential).toBeNull();
  });

  it("a trial that ends while its invitation is being accepted: the compare-and-set re-check refuses it", async () => {
    let id = "";
    let fired = false;
    const hooks = { beforeConditionalUpload: (name, api) => {
      if (fired || !id || name !== teacherAccountName(id)) return;
      fired = true;
      const a = api.getJson(name);
      api.setJson(name, { ...a, trial: { ...a.trial, endsAtMs: ctx.clock.now - 1 } });   // a concurrent writer ends the trial
    } };
    ctx = setup(hooks);
    const out = await createTrial(ctx, 7);
    id = out.teacher.accountId;
    const r = await invitation(req({ action: "accept", body: { token: tokenOf(out.invitation.invitationPath), password: PASSWORD } }), ctx.deps);
    expect(fired).toBe(true);
    expect(r.status).toBe(404);
    expect(accountOf(ctx, id).credential).toBeNull();
  });

  it("extending an ended trial, or making it permanent, restores sign-in; the owner view shows ended", async () => {
    const id = await activateTrial(ctx, 7);
    ctx.clock.now += 10 * DAY_MS;
    const list = await ownerTeachers(req({ method: "GET", headers: ctx.ownerSession() }), ctx.deps);
    expect(list.jsonBody.teachers[0].trial.ended).toBe(true);
    expect((await signIn(ctx)).status).toBe(403);
    const ext = await owner(ctx, "extend-trial", { accountId: id, days: 7 });
    expect(ext.jsonBody.teacher.trial).toMatchObject({ ended: false, endsAt: new Date(ctx.clock.now + 7 * DAY_MS).toISOString() });
    expect((await signIn(ctx)).status).toBe(200);
    ctx.clock.now += 8 * DAY_MS;
    expect((await signIn(ctx)).status).toBe(403);
    await owner(ctx, "end-trial", { accountId: id });
    ctx.clock.now += 365 * DAY_MS;
    expect((await signIn(ctx)).status).toBe(200);
  });

  it("ending a trial changes nothing but access: the account's data and status stay as they were", async () => {
    const id = await activateTrial(ctx, 7);
    const before = accountOf(ctx, id);
    ctx.clock.now += 8 * DAY_MS;
    await signIn(ctx);
    const after = accountOf(ctx, id);
    expect(after.status).toBe("active");
    expect(after.trial).toEqual(before.trial);
    expect(after.credential).toEqual(before.credential);
  });
});
