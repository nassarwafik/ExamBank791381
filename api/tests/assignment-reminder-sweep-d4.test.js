import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import fs from "node:fs";
import path from "node:path";

// D4 (item 8) — the automatic reminder 24 hours before the deadline (owner decision): who gets one (the teacher's «تذكير» rule),
// exactly once per deadline, a separately keyed signed trigger, and the scheduler script.

const require_ = createRequire(import.meta.url);
const { resolveReminderKey, signReminderRequest, verifyReminderRequest, REMINDER_HEADERS } = require_("../src/lib/reminder-sweep-protocol.js");
const { runReminderSweep, reminderDue, markerName, MAX_REMINDERS_PER_RUN } = require_("../src/lib/assignment-reminder-sweep.js");
const { handler } = require_("../src/functions/assignment-reminder-sweep.js");
const { createMemoryContainer } = require_("./fixtures/memory-container.js");
const scriptUrl = new URL("../../scripts/assignment-reminder-sweep.mjs", import.meta.url).href;
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

const KEY = "r".repeat(40);
const NOW = Date.parse("2026-10-27T08:00:00.000Z"), H = 3600e3;
const iso = ms => new Date(ms).toISOString();
const A = (id, over = {}) => ({ assignmentId: id, classId: "c1", title: "واجب " + id, status: "published", openAt: iso(NOW - 48 * H), dueAt: iso(NOW + 20 * H), maxAttempts: 1, durationMinutes: 0, examSnapshot: { questions: [] }, ...over });
const S = (id, over = {}) => ({ userId: id, role: "student", classId: "c1", archived: false, active: true, displayName: "x", ...over });
function world(extra = {}) {
  return createMemoryContainer({
    "platform/assignments/a1.json": A("a1"),
    "platform/users/s1.json": S("s1"), "platform/users/s2.json": S("s2"), "platform/users/s3.json": S("s3", { archived: true }),
    "platform/users/s4.json": S("s4", { classId: "c2" }), "platform/users/s5.json": S("s5", { active: false }),
    "platform/submissions/a1/s2.json": { assignmentId: "a1", studentId: "s2", attempts: [{ attemptNumber: 1, submittedAt: iso(NOW - H) }] },
    ...extra
  });
}
const noPush = { pushForEvent: async () => ({ status: "skipped" }) };

describe("the signed trigger (SA-REMINDER-SWEEP-1)", () => {
  it("sign → verify round trip; a changed body, a wrong key or a stale timestamp is refused", () => {
    const ts = Math.floor(NOW / 1000), rid = "req_" + "x".repeat(24), body = '{"version":1}';
    const headers = signReminderRequest({ key: KEY, timestamp: ts, requestId: rid, body });
    expect(verifyReminderRequest({ key: KEY, headers, body, nowMs: NOW })).toEqual({ ok: true, requestId: rid });
    expect(verifyReminderRequest({ key: KEY, headers, body: '{"version":2}', nowMs: NOW }).reason).toBe("signature");
    expect(verifyReminderRequest({ key: "z".repeat(40), headers, body, nowMs: NOW }).reason).toBe("signature");
    expect(verifyReminderRequest({ key: KEY, headers, body, nowMs: NOW + 301e3 }).reason).toBe("stale");
  });
  it("a FOURTH key: refused when it equals the runner, callback or recovery-sweep key, or is too short", () => {
    expect(resolveReminderKey({ ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY: KEY })).toBe(KEY);
    for (const other of ["CODING_RUNNER_HMAC_KEY", "CODING_GRADING_CALLBACK_HMAC_KEY", "CODING_GRADING_SWEEP_HMAC_KEY"]) expect(resolveReminderKey({ ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY: KEY, [other]: KEY })).toBeNull();
    expect(resolveReminderKey({ ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY: "short" })).toBeNull();
  });
  it("the scheduler script is an independent implementation that produces exactly the same signature", async () => {
    const { buildReminderRequest } = await import(scriptUrl);
    const rid = "gh_" + "y".repeat(30);
    const req = buildReminderRequest({ url: "https://h/api/assignment-reminder-sweep", key: KEY, nowMs: NOW, requestId: rid });
    expect(req.init.headers[REMINDER_HEADERS.signature]).toBe(signReminderRequest({ key: KEY, timestamp: Math.floor(NOW / 1000), requestId: rid, body: '{"version":1}' })[REMINDER_HEADERS.signature]);
    expect(verifyReminderRequest({ key: KEY, headers: req.init.headers, body: req.init.body, nowMs: NOW }).ok).toBe(true);
  });
});

describe("the route — every check before any storage", () => {
  const req = (headers, body = '{"version":1}') => ({ method: "POST", headers: new Headers(headers), text: async () => body });
  const signed = (body = '{"version":1}', nowMs = NOW) => signReminderRequest({ key: KEY, timestamp: Math.floor(nowMs / 1000), requestId: "req_" + "z".repeat(24), body });
  const deps = (over = {}) => ({ env: { ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY: KEY }, now: () => NOW, getContainer: () => { throw new Error("storage must not be touched"); }, ...over });
  it("unsigned → 401; unconfigured → 503; bad signature → 401; wrong body → 400 — none of them touches storage", async () => {
    expect((await handler(req({}), {}, null, deps())).status).toBe(401);
    expect((await handler(req(signed()), {}, null, deps({ env: {} }))).status).toBe(503);
    expect((await handler(req({ ...signed(), [REMINDER_HEADERS.signature]: "v1=" + "0".repeat(64) }), {}, null, deps())).status).toBe(401);
    expect((await handler(req(signed('{"version":2}'), '{"version":2}'), {}, null, deps())).status).toBe(400);
  });
  it("a valid trigger runs one sweep and answers aggregate counts only", async () => {
    const mem = world();
    const r = await handler(req(signed()), {}, null, deps({ getContainer: () => mem.container, ...noPush }));
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, assignments: 1, reminded: 1, alreadySent: 0, failed: 0, truncated: false });
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/s1|واجب/);
  });
});

describe("who is reminded, and only once", () => {
  it("a class member with no attempt, due within 24 h — not one who submitted, an archived, moved or login-disabled student", async () => {
    const mem = world();
    const out = await runReminderSweep(mem.container, { nowMs: NOW, deps: noPush });
    expect(out).toMatchObject({ assignments: 1, considered: 1, reminded: 1 });
    expect(mem.names("platform/reminders/auto/")).toEqual([markerName("a1", "s1", iso(NOW + 20 * H))]);
    const events = mem.names("platform/").map(n => mem.getJson(n)).filter(d => d && d.type === "assignment_reminder");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ scope: "student", assignmentId: "a1", dueAt: iso(NOW + 20 * H) });
  });
  it("exactly once: a second (or replayed) sweep sends nothing new", async () => {
    const mem = world();
    await runReminderSweep(mem.container, { nowMs: NOW, deps: noPush });
    const again = await runReminderSweep(mem.container, { nowMs: NOW + H, deps: noPush });
    expect(again).toMatchObject({ reminded: 0, alreadySent: 1 });
    expect(mem.names("platform/").map(n => mem.getJson(n)).filter(d => d && d.type === "assignment_reminder")).toHaveLength(1);
  });
  it("an extended deadline is a new deadline: one more reminder 24 h before it", async () => {
    const mem = world();
    await runReminderSweep(mem.container, { nowMs: NOW, deps: noPush });
    mem.setJson("platform/assignments/a1.json", A("a1", { dueAt: iso(NOW + 50 * H) }));
    expect((await runReminderSweep(mem.container, { nowMs: NOW + H, deps: noPush })).reminded).toBe(0);      // 49 h away: not yet
    expect((await runReminderSweep(mem.container, { nowMs: NOW + 30 * H, deps: noPush })).reminded).toBe(1);  // 20 h away: reminded
  });
  it("not reminded: more than 24 h away, already past, a draft, not open yet, or a per-student extension beyond 24 h", () => {
    const sub = { attempts: [] };
    expect(reminderDue(A("x", { dueAt: iso(NOW + 30 * H) }), sub, NOW)).toBe("");
    expect(reminderDue(A("x", { dueAt: iso(NOW - H) }), sub, NOW)).toBe("");
    expect(reminderDue(A("x", { openAt: iso(NOW + H) }), sub, NOW)).toBe("");
    expect(reminderDue(A("x"), { attempts: [], dueAtOverride: iso(NOW + 40 * H) }, NOW)).toBe("");
    expect(reminderDue(A("x"), { attempts: [{ attemptNumber: 1 }] }, NOW)).toBe("");
    expect(reminderDue(A("x"), sub, NOW)).toBe(iso(NOW + 20 * H));
  });
  it("a draft or archived assignment is never considered; a deadline more than 14 days past is not even read", async () => {
    const mem = world({ "platform/assignments/a1.json": A("a1", { status: "draft" }), "platform/assignments/a2.json": A("a2", { status: "archived" }), "platform/assignments/a3.json": A("a3", { dueAt: iso(NOW - 15 * 24 * H) }) });
    expect(await runReminderSweep(mem.container, { nowMs: NOW, deps: noPush })).toMatchObject({ assignments: 0, reminded: 0 });
  });
  it("bounded: at most MAX_REMINDERS_PER_RUN (500) per run — the rest wait for the next hourly run", async () => {
    expect(MAX_REMINDERS_PER_RUN).toBe(500);
    const mem = world({ "platform/users/s6.json": S("s6") });
    const first = await runReminderSweep(mem.container, { nowMs: NOW, deps: noPush, maxReminders: 1 });
    expect(first).toMatchObject({ considered: 2, reminded: 1, truncated: true });
    const next = await runReminderSweep(mem.container, { nowMs: NOW + H, deps: noPush, maxReminders: 1 });
    expect(next).toMatchObject({ reminded: 1, alreadySent: 1 });
    expect(mem.names("platform/reminders/auto/")).toHaveLength(2);
  });
  it("the reminder event is pushed through the normal event path (bell + device)", async () => {
    const mem = world(), pushed = [];
    await runReminderSweep(mem.container, { nowMs: NOW, deps: { pushForEvent: async (_c, ev) => { pushed.push([ev.type, ev.studentId]); return { status: "sent" }; } } });
    expect(pushed).toEqual([["assignment_reminder", "s1"]]);
  });
});

describe("the scheduler", () => {
  it("not configured → succeeds with a notice (no failure spam); a malformed setting or a non-2xx reply fails", async () => {
    const { runReminderTrigger } = await import(scriptUrl);
    const logs = [];
    expect(await runReminderTrigger({ env: {}, log: l => logs.push(l) })).toBe(0);
    expect(logs[0]).toMatch(/^::notice::/);
    expect(await runReminderTrigger({ env: { ASSIGNMENT_REMINDER_SWEEP_URL: "http://h/api/assignment-reminder-sweep", ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY: KEY }, log: () => {} })).toBe(1);
    const reply = status => async () => ({ status, json: async () => ({ ok: status === 200, reminded: 2 }) });
    const env = { ASSIGNMENT_REMINDER_SWEEP_URL: "https://h/api/assignment-reminder-sweep", ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY: KEY };
    expect(await runReminderTrigger({ env, fetch: reply(200), log: () => {} })).toBe(0);
    expect(await runReminderTrigger({ env, fetch: reply(401), log: () => {} })).toBe(1);
  });
  it("the workflow: hourly, read-only permissions, only its own key", () => {
    const yml = fs.readFileSync(path.join(repo, ".github/workflows/assignment-reminders.yml"), "utf8");
    expect(yml).toMatch(/- cron: "23 \* \* \* \*"/);
    expect(yml).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(yml.match(/secrets\.[A-Z_]+/g)).toEqual(["secrets.ASSIGNMENT_REMINDER_SWEEP_HMAC_KEY"]);
    expect(yml).toContain("run: node scripts/assignment-reminder-sweep.mjs");
  });
});
