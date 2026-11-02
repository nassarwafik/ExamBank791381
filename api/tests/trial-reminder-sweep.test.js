import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import fs from "node:fs";
import path from "node:path";

// Trial accounts — the reminder EMAILS before a trial ends (owner decisions: Azure Communication Services; teacher AND owner; 3 days
// before, then on the end): who is written to, exactly once per recipient / stage / end date, a separately keyed signed trigger,
// nothing sent (and nothing reserved) until email is configured, and the scheduler script. TEST data only; no email leaves the test.

const require_ = createRequire(import.meta.url);
const { resolveTrialReminderKey, signTrialReminderRequest, verifyTrialReminderRequest, TRIAL_HEADERS } = require_("../src/lib/trial-reminder-protocol.js");
const { signReminderRequest } = require_("../src/lib/reminder-sweep-protocol.js");
const { runTrialReminderSweep, reminderStage, composeEmail, markerName, MARKER_PREFIX, MAX_EMAILS_PER_RUN } = require_("../src/lib/trial-reminder-sweep.js");
const { emailConfig, sendEmail, emailTimeZone } = require_("../src/lib/email/acs-email.js");
const { handler } = require_("../src/functions/trial-reminder-sweep.js");
const { createMemoryContainer } = require_("./fixtures/memory-container.js");
const scriptUrl = new URL("../../scripts/trial-reminder-sweep.mjs", import.meta.url).href;
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

const KEY = "t".repeat(40);
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-02T08:00:00.000Z");
const EMAIL_ENV = { ACS_EMAIL_CONNECTION_STRING: "endpoint=https://acs-test.communication.azure.com/;accesskey=dGVzdA==", TRIAL_EMAIL_SENDER: "DoNotReply@test.example", OWNER_NOTIFICATION_EMAIL: "owner@test.example" };
const accountPath = id => "platform/accounts/teachers/" + id + ".json";
const T = (id, over = {}) => ({
  schemaVersion: 1, accountId: id, role: "teacher", username: "t." + id.slice(-4), displayName: "معلمة " + id.slice(-4), email: id.slice(-4) + "@teacher.example",
  status: "active", credential: { h: 1 }, authVersion: 1, trial: { days: 14, startedAtMs: NOW - 12 * DAY, endsAtMs: NOW + 2 * DAY }, ...over
});
function world(accounts) { return createMemoryContainer(Object.fromEntries(accounts.map(a => [accountPath(a.accountId), a]))); }
function outbox() {
  const sent = [];
  return { sent, sendEmail: async (cfg, msg) => { sent.push({ from: cfg.sender, ...msg }); return { accepted: true }; } };
}
const ID = n => "t_" + String(n).padStart(16, "0");

describe("the signed trigger (SA-TRIAL-REMINDER-1)", () => {
  it("sign → verify round trip; a changed body, a wrong key or a stale timestamp is refused", () => {
    const ts = Math.floor(NOW / 1000), rid = "req_" + "x".repeat(24), body = '{"version":1}';
    const headers = signTrialReminderRequest({ key: KEY, timestamp: ts, requestId: rid, body });
    expect(verifyTrialReminderRequest({ key: KEY, headers, body, nowMs: NOW })).toEqual({ ok: true, requestId: rid });
    expect(verifyTrialReminderRequest({ key: KEY, headers, body: '{"version":2}', nowMs: NOW }).reason).toBe("signature");
    expect(verifyTrialReminderRequest({ key: "z".repeat(40), headers, body, nowMs: NOW }).reason).toBe("signature");
    expect(verifyTrialReminderRequest({ key: KEY, headers, body, nowMs: NOW + 301e3 }).reason).toBe("stale");
  });
  it("a FIFTH key: refused when it equals any of the four other keys, or is too short", () => {
    expect(resolveTrialReminderKey({ TRIAL_REMINDER_SWEEP_HMAC_KEY: KEY })).toBe(KEY);
    for (const other of ["CODING_RUNNER_HMAC_KEY", "CODING_GRADING_CALLBACK_HMAC_KEY", "CODING_GRADING_SWEEP_HMAC_KEY", "ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY"]) {
      expect(resolveTrialReminderKey({ TRIAL_REMINDER_SWEEP_HMAC_KEY: KEY, [other]: KEY })).toBeNull();
    }
    expect(resolveTrialReminderKey({ TRIAL_REMINDER_SWEEP_HMAC_KEY: "short" })).toBeNull();
  });
  it("an assignment-reminder signature (another protocol) is never accepted here, even under the same key value", () => {
    const ts = Math.floor(NOW / 1000), rid = "req_" + "x".repeat(24), body = '{"version":1}';
    const other = signReminderRequest({ key: KEY, timestamp: ts, requestId: rid, body });
    const asTrial = { [TRIAL_HEADERS.protocol]: "1", [TRIAL_HEADERS.timestamp]: String(ts), [TRIAL_HEADERS.requestId]: rid, [TRIAL_HEADERS.signature]: other["x-sa-reminder-signature"] };
    expect(verifyTrialReminderRequest({ key: KEY, headers: asTrial, body, nowMs: NOW }).reason).toBe("signature");
  });
  it("the scheduler script is an independent implementation that produces exactly the same signature", async () => {
    const { buildTrialReminderRequest, readTrialReminderConfig } = await import(scriptUrl);
    const rid = "gh_" + "y".repeat(30);
    const req = buildTrialReminderRequest({ url: "https://h/api/trial-reminder-sweep", key: KEY, nowMs: NOW, requestId: rid });
    expect(req.init.headers[TRIAL_HEADERS.signature]).toBe(signTrialReminderRequest({ key: KEY, timestamp: Math.floor(NOW / 1000), requestId: rid, body: '{"version":1}' })[TRIAL_HEADERS.signature]);
    expect(verifyTrialReminderRequest({ key: KEY, headers: req.init.headers, body: req.init.body, nowMs: NOW }).ok).toBe(true);
    expect(readTrialReminderConfig({})).toMatchObject({ ok: false, missing: true });
    expect(readTrialReminderConfig({ TRIAL_REMINDER_SWEEP_URL: "http://h/api/trial-reminder-sweep", TRIAL_REMINDER_SWEEP_HMAC_KEY: KEY }).ok).toBe(false);
    expect(readTrialReminderConfig({ TRIAL_REMINDER_SWEEP_URL: "https://h/api/assignment-reminder-sweep", TRIAL_REMINDER_SWEEP_HMAC_KEY: KEY }).ok).toBe(false);
    expect(readTrialReminderConfig({ TRIAL_REMINDER_SWEEP_URL: "https://h/api/trial-reminder-sweep", TRIAL_REMINDER_SWEEP_HMAC_KEY: KEY })).toEqual({ ok: true, url: "https://h/api/trial-reminder-sweep", key: KEY });
  });
  it("the workflow runs the script hourly with its own variable and secret only", () => {
    const wf = fs.readFileSync(path.join(repo, ".github/workflows/trial-reminders.yml"), "utf8");
    expect(wf).toMatch(/cron: "\d{1,2} \* \* \* \*"/);
    expect(wf).toContain("run: node scripts/trial-reminder-sweep.mjs");
    expect(wf).toContain("${{ vars.TRIAL_REMINDER_SWEEP_URL }}");
    expect(wf).toContain("${{ secrets.TRIAL_REMINDER_SWEEP_HMAC_KEY }}");
    expect(wf.match(/secrets\./g)).toHaveLength(1);
    expect(wf).toMatch(/permissions:\s*\n\s*contents: read/);
  });
});

describe("the route — every check before any storage", () => {
  const req = (headers, body = '{"version":1}') => ({ method: "POST", headers: new Headers(headers), text: async () => body });
  const signed = (body = '{"version":1}', nowMs = NOW) => signTrialReminderRequest({ key: KEY, timestamp: Math.floor(nowMs / 1000), requestId: "req_" + "z".repeat(24), body });
  const deps = (over = {}) => ({ env: { TRIAL_REMINDER_SWEEP_HMAC_KEY: KEY, ...EMAIL_ENV }, now: () => NOW, getContainer: () => { throw new Error("storage must not be touched"); }, ...over });
  it("unsigned → 401; unconfigured key → 503; bad signature → 401; wrong body → 400 — none of them touches storage", async () => {
    expect((await handler(req({}), {}, null, deps())).status).toBe(401);
    expect((await handler(req(signed()), {}, null, deps({ env: {} }))).status).toBe(503);
    expect((await handler(req({ ...signed(), [TRIAL_HEADERS.signature]: "v1=" + "0".repeat(64) }), {}, null, deps())).status).toBe(401);
    expect((await handler(req(signed('{"version":2}'), '{"version":2}'), {}, null, deps())).status).toBe(400);
  });
  it("a valid trigger runs one sweep and answers aggregate counts only (no name, no address)", async () => {
    const mem = world([T(ID(1))]);
    const box = outbox();
    const r = await handler(req(signed()), {}, null, deps({ getContainer: () => mem.container, sendEmail: box.sendEmail }));
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, emailConfigured: true, trials: 1, due: 2, sent: 2, alreadySent: 0, failed: 0, truncated: false });
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/@|معلمة|t_0/);
  });
  it("a listing failure → 503 (the next run retries)", async () => {
    const r = await handler(req(signed()), {}, null, deps({ getContainer: () => ({}), listTeacherAccounts: async () => { throw new Error("down"); } }));
    expect(r.status).toBe(503);
  });
});

describe("who is written to, and only once", () => {
  it("3 days before the end: the teacher (at the account's email) and the owner; the email says when and what happens", async () => {
    const mem = world([T(ID(1))]);
    const box = outbox();
    const out = await runTrialReminderSweep(mem.container, { nowMs: NOW, env: EMAIL_ENV, deps: box });
    expect(out).toMatchObject({ emailConfigured: true, due: 2, sent: 2 });
    expect(box.sent.map(m => m.to).sort()).toEqual(["0001@teacher.example", "owner@test.example"]);
    const teacher = box.sent.find(m => m.to === "0001@teacher.example");
    expect(teacher.from).toBe("DoNotReply@test.example");
    expect(teacher.subject).toBe("تنبيه: تنتهي فترتك التجريبية خلال يومين");
    expect(teacher.plainText).toContain("يتوقف دخولك");
    expect(teacher.plainText).toContain("محفوظة");
    expect(teacher.html).toContain('dir="rtl"');
    const owner = box.sent.find(m => m.to === "owner@test.example");
    expect(owner.subject).toContain("حساب تجريبي ينتهي خلال يومين");
    expect(owner.plainText).toContain("لوحة المالك");
    expect(mem.names(MARKER_PREFIX)).toHaveLength(2);
  });

  it("exactly once: a second (or replayed) sweep sends nothing new", async () => {
    const mem = world([T(ID(1))]);
    const box = outbox();
    await runTrialReminderSweep(mem.container, { nowMs: NOW, env: EMAIL_ENV, deps: box });
    const again = await runTrialReminderSweep(mem.container, { nowMs: NOW + 3600e3, env: EMAIL_ENV, deps: box });
    expect(again).toMatchObject({ sent: 0, alreadySent: 2 });
    expect(box.sent).toHaveLength(2);
  });

  it("on the end: an «ended» email to both, once; an extended trial has a new end and gets its own reminders", async () => {
    const id = ID(1);
    const mem = world([T(id)]);
    const box = outbox();
    await runTrialReminderSweep(mem.container, { nowMs: NOW, env: EMAIL_ENV, deps: box });                // before
    const ended = await runTrialReminderSweep(mem.container, { nowMs: NOW + 2 * DAY + 60_000, env: EMAIL_ENV, deps: box });
    expect(ended).toMatchObject({ sent: 2 });
    expect(box.sent.slice(2).map(m => m.subject)).toEqual(expect.arrayContaining(["انتهت الفترة التجريبية لحسابك", "انتهت تجربة معلمة 0001"]));
    expect((await runTrialReminderSweep(mem.container, { nowMs: NOW + 2 * DAY + 2 * 3600e3, env: EMAIL_ENV, deps: box })).sent).toBe(0);
    mem.setJson(accountPath(id), T(id, { trial: { days: 21, startedAtMs: NOW - 12 * DAY, endsAtMs: NOW + 9 * DAY } }));    // extended by 7 days
    expect((await runTrialReminderSweep(mem.container, { nowMs: NOW + 3 * DAY, env: EMAIL_ENV, deps: box })).sent).toBe(0);      // 6 days left: not yet
    expect((await runTrialReminderSweep(mem.container, { nowMs: NOW + 6 * DAY + 3600e3, env: EMAIL_ENV, deps: box })).sent).toBe(2);
  });

  it("stages: running & > 3 days → none; last 3 days → before; ended ≤ 2 days ago → ended; older, permanent or suspended → none", () => {
    const a = endsAtMs => T(ID(1), { trial: { days: 7, startedAtMs: 0, endsAtMs } });
    expect(reminderStage(a(NOW + 3 * DAY + 1), NOW)).toBe("");
    expect(reminderStage(a(NOW + 3 * DAY), NOW)).toBe("before");
    expect(reminderStage(a(NOW + 1), NOW)).toBe("before");
    expect(reminderStage(a(NOW), NOW)).toBe("ended");
    expect(reminderStage(a(NOW - 2 * DAY), NOW)).toBe("ended");
    expect(reminderStage(a(NOW - 2 * DAY - 1), NOW)).toBe("");
    expect(reminderStage(T(ID(1), { trial: null }), NOW)).toBe("");
    expect(reminderStage(T(ID(1), { status: "suspended" }), NOW)).toBe("");
    expect(reminderStage(T(ID(1), { trial: "corrupted" }), NOW)).toBe("");
  });

  it("a teacher without a (valid) email: only the owner is written to; without OWNER_NOTIFICATION_EMAIL only the teacher", async () => {
    const box = outbox();
    await runTrialReminderSweep(world([T(ID(1), { email: "" }), T(ID(2), { email: "not-an-address" })]).container, { nowMs: NOW, env: EMAIL_ENV, deps: box });
    expect(box.sent.map(m => m.to)).toEqual(["owner@test.example", "owner@test.example"]);
    const box2 = outbox();
    await runTrialReminderSweep(world([T(ID(1))]).container, { nowMs: NOW, env: { ...EMAIL_ENV, OWNER_NOTIFICATION_EMAIL: "" }, deps: box2 });
    expect(box2.sent.map(m => m.to)).toEqual(["0001@teacher.example"]);
  });

  it("email not configured: nothing is sent and NOTHING is reserved (so the emails go out once it is configured)", async () => {
    const mem = world([T(ID(1))]);
    const box = outbox();
    const out = await runTrialReminderSweep(mem.container, { nowMs: NOW, env: {}, deps: box });
    expect(out).toMatchObject({ emailConfigured: false, code: "EMAIL_NOT_CONFIGURED", due: 2, sent: 0 });
    expect(box.sent).toEqual([]);
    expect(mem.names(MARKER_PREFIX)).toEqual([]);
    expect((await runTrialReminderSweep(mem.container, { nowMs: NOW + 3600e3, env: EMAIL_ENV, deps: box })).sent).toBe(2);
  });

  it("a send ACS refuses releases its marker: the next run tries that email again (the other one is not repeated)", async () => {
    const mem = world([T(ID(1))]);
    const sent = [];
    let refuseTeacher = true;
    const deps = { sendEmail: async (_cfg, msg) => { if (refuseTeacher && msg.to.endsWith("@teacher.example")) { const e = new Error("x"); e.code = "EMAIL_REFUSED"; throw e; } sent.push(msg.to); } };
    expect(await runTrialReminderSweep(mem.container, { nowMs: NOW, env: EMAIL_ENV, deps })).toMatchObject({ sent: 1, failed: 1 });
    expect(mem.names(MARKER_PREFIX)).toHaveLength(1);
    refuseTeacher = false;
    expect(await runTrialReminderSweep(mem.container, { nowMs: NOW + 3600e3, env: EMAIL_ENV, deps })).toMatchObject({ sent: 1, alreadySent: 1, failed: 0 });
    expect(sent.sort()).toEqual(["0001@teacher.example", "owner@test.example"]);
  });

  it("bounded: at most MAX_EMAILS_PER_RUN per run; the next run continues", async () => {
    const accounts = Array.from({ length: 15 }, (_, i) => T(ID(i + 1)));
    const mem = world(accounts);
    const box = outbox();
    const first = await runTrialReminderSweep(mem.container, { nowMs: NOW, env: EMAIL_ENV, deps: box });
    expect(first).toMatchObject({ sent: MAX_EMAILS_PER_RUN, truncated: true });
    const second = await runTrialReminderSweep(mem.container, { nowMs: NOW + 3600e3, env: EMAIL_ENV, deps: box });
    expect(second).toMatchObject({ sent: 30 - MAX_EMAILS_PER_RUN, truncated: false });
    expect(new Set(box.sent.map(m => m.to + m.subject)).size).toBe(30);
  });

  it("markers are per account, end, stage and recipient kind", () => {
    const names = new Set([markerName(ID(1), 5, "before", "teacher"), markerName(ID(1), 5, "before", "owner"), markerName(ID(1), 6, "before", "teacher"), markerName(ID(1), 5, "ended", "teacher"), markerName(ID(2), 5, "before", "teacher")]);
    expect(names.size).toBe(5);
  });

  it("names are escaped in the HTML email", () => {
    const m = composeEmail({ account: T(ID(1), { displayName: '<img src=x onerror="a">' }), stage: "before", kind: "owner", nowMs: NOW, timeZone: "UTC" });
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;img");
  });
});

describe("the ACS email channel", () => {
  it("configuration: nothing set → not-configured; malformed connection string or sender → refused; owner address optional", () => {
    expect(emailConfig({})).toEqual({ ok: false, reason: "not-configured" });
    expect(emailConfig({ ...EMAIL_ENV, ACS_EMAIL_CONNECTION_STRING: "nope" })).toEqual({ ok: false, reason: "connection-string-invalid" });
    expect(emailConfig({ ...EMAIL_ENV, TRIAL_EMAIL_SENDER: "nope" })).toEqual({ ok: false, reason: "sender-invalid" });
    expect(emailConfig({ ...EMAIL_ENV, OWNER_NOTIFICATION_EMAIL: "" })).toMatchObject({ ok: true, ownerEmail: "" });
    expect(emailConfig(EMAIL_ENV)).toMatchObject({ ok: true, sender: "DoNotReply@test.example", ownerEmail: "owner@test.example", timeZone: "UTC" });
  });
  it("time zone: a known IANA zone is used; an unknown one falls back to UTC", () => {
    expect(emailTimeZone({ PLATFORM_TIME_ZONE: "Asia/Amman" })).toBe("Asia/Amman");
    expect(emailTimeZone({ PLATFORM_TIME_ZONE: "Mars/Olympus" })).toBe("UTC");
  });
  it("sendEmail hands ACS one message from the configured sender to one recipient; an ACS refusal throws", async () => {
    const calls = [];
    const emailClient = { beginSend: async msg => { calls.push(msg); return { getOperationState: () => ({ status: "running" }) }; } };
    await sendEmail(emailConfig(EMAIL_ENV), { to: "a@b.example", subject: "s", plainText: "p", html: "<p>h</p>" }, { emailClient });
    expect(calls).toEqual([{ senderAddress: "DoNotReply@test.example", recipients: { to: [{ address: "a@b.example" }] }, content: { subject: "s", plainText: "p", html: "<p>h</p>" } }]);
    const refusing = { beginSend: async () => { throw Object.assign(new Error("400"), { statusCode: 400 }); } };
    await expect(sendEmail(emailConfig(EMAIL_ENV), { to: "a@b.example", subject: "s", plainText: "p", html: "h" }, { emailClient: refusing })).rejects.toThrow();
    await expect(sendEmail(emailConfig(EMAIL_ENV), { to: "bad", subject: "s", plainText: "p", html: "h" }, { emailClient })).rejects.toMatchObject({ code: "RECIPIENT_INVALID" });
  });
});
