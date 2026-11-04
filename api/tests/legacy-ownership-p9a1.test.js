import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P9-A1 — the owner's explicit decision for every class WITHOUT an owner (blueprint §11.2 M7; owner decisions §19.33; the
// approved design docs/enterprise-legacy-ownership-p9a.md). TEST data only. Pinned here:
//   inventory (read only) · preview = a dry run (NOTHING written) with the exact changes and a digest · apply only on a matching
//   digest (stale → nothing written), the LEDGER first with the previous values, compare-and-set, resumable by the request key, never
//   twice · «assign» stamps the class and its students without an owner (never another owner's student) · «shared» writes no data ·
//   «archive» keeps every result (and is refused while work awaits grading) · assignments / submissions / results are byte-identical ·
//   undo only when nothing changed since (all checked before any write) · step-up, reason, owner session, audit (owner + teacher).
// A feature (no fail-first): today no owner tool can decide for an unowned class (owner-classes refuses it).

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p9a1-legacy-ownership-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler } = await import("../src/functions/owner-legacy-classes.js");
const { handler: classrooms } = await import("../src/functions/manage-classrooms.js");
const { handler: students } = await import("../src/functions/manage-students.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { OWNER_AUDIT_PREFIX, AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { LEDGER_PREFIX } = await import("../src/lib/migrations/legacy-ownership.js");
const { mutateJsonWithRetry } = cjs("../src/lib/platform-storage.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const OWNER_ID = "own_0011223344556677";
const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb", SUSP = "t_00112233445566cc", INV = "t_00112233445566dd", LEGACY = "t_legacy";
const stu = (userId, classId, over = {}) => ({ schemaVersion: 3, role: "student", userId, classId, displayName: "طالب " + userId, firstName: "طالب", familyName: userId, code: "C" + userId, identityNumber: "C" + userId, active: true, archived: false, authVersion: 1, ...over });

function setup({ pending = false } = {}) {
  resetOperatorGateCache();
  const mem = createMemoryContainer({
    "platform/classes/old.json": { schemaVersion: 1, classId: "old", name: "العاشر القديم", grade: "10", schoolYear: "2024-2025", active: true, status: "active", studentIds: ["s1", "s2", "s3", "s4"] },
    "platform/classes/old2.json": { schemaVersion: 1, classId: "old2", name: "التاسع القديم", grade: "9", active: true, status: "active", studentIds: [] },
    "platform/classes/own.json": { schemaVersion: 1, classId: "own", name: "صف سارة", active: true, status: "active", studentIds: ["s9"], ownerId: SARA },
    "platform/users/s1.json": stu("s1", "old"),
    "platform/users/s2.json": stu("s2", "old", { archived: true, active: false }),
    "platform/users/s3.json": stu("s3", "old"),
    "platform/users/s4.json": stu("s4", "old", { ownerId: SARA }),
    "platform/users/s9.json": stu("s9", "own", { ownerId: SARA }),
    "platform/assignments/a1.json": { assignmentId: "a1", classId: "old", status: "published", title: "واجب قديم", className: "العاشر القديم", maxAttempts: 1, questionCount: 1, totalMarks: 10 },
    "platform/submissions/a1/s1.json": { assignmentId: "a1", studentId: "s1", classId: "old", attempts: [{ attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, finalized: !pending, ...(pending ? { manualReviewMarks: 5 } : {}) }] }
  });
  const now = Date.now();
  for (const [id, username, status] of [[SARA, "t.sara", "active"], [OMAR, "t.omar", "active"], [SUSP, "t.susp", "suspended"], [INV, "t.inv", "invited"], [LEGACY, "legacy", "active"]]) mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName: username, status, credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [] });
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const heads = {};
  for (const [name, ago] of [["owner", 0], ["ownerStale", 11 * 60 * 1000]]) {
    const sid = (ago ? "d" : "c").repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - ago });
    heads[name] = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  const deps = { getContainer: () => mem.container, container: mem.container, tenancyEnv: {} };
  const tok = id => ({ "x-builder-token": createManagedTeacherToken({ accountId: id, sid: newTeacherSessionId(), authVersion: 1 }).token });
  return { mem, deps, ...heads, omar: tok(OMAR), sara: tok(SARA), legacy: tok(LEGACY) };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const get = (ctx, action = "", headers = ctx.owner) => handler({ method: "GET", url: "https://x/api/owner-legacy-classes/" + action, params: { action }, headers: hdr(headers) }, ctx.deps);
const post = (ctx, action, body, headers = ctx.owner, deps = ctx.deps) => handler({ method: "POST", url: "https://x/api/owner-legacy-classes/" + action, params: { action }, headers: hdr(headers), json: async () => body }, deps);
const preview = async (ctx, body) => (await post(ctx, "preview", body)).jsonBody.plan;
const decide = async (ctx, body, key = "req-" + body.decision + "-0001") => { const p = await preview(ctx, body); return post(ctx, "apply", { ...body, reason: "قرار المالك الموثّق", previewDigest: p.digest, requestKey: key }); };
/** Every data document (not the ledgers, the audit or the sessions), serialised — to prove what did or did not change. */
const dataSnapshot = (ctx, prefixes = ["platform/classes/", "platform/users/", "platform/assignments/", "platform/submissions/"]) => JSON.stringify(ctx.mem.names().filter(n => prefixes.some(p => n.startsWith(p))).sort().map(n => [n, ctx.mem.getJson(n)]));
const owners = ctx => ["s1", "s2", "s3", "s4"].map(id => ctx.mem.getJson("platform/users/" + id + ".json").ownerId ?? null);
const classDoc = (ctx, id = "old") => ctx.mem.getJson("platform/classes/" + id + ".json");
const ledgers = ctx => ctx.mem.names(LEDGER_PREFIX).map(n => ctx.mem.getJson(n));
const ownerEvents = ctx => ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
const teacherEvents = ctx => ctx.mem.names(AUDIT_PREFIX).map(n => ctx.mem.getJson(n)).filter(e => e.forTeacher);
const teacherClasses = async (ctx, h) => (await classrooms({ method: "GET", url: "https://x/api/classrooms", headers: hdr(h) }, ctx.deps)).jsonBody.classes.map(c => c.classId).sort();
const teacherStudents = async (ctx, h) => (await students({ method: "GET", url: "https://x/api/students?includeArchived=1", headers: hdr(h) }, ctx.deps)).jsonBody.students.map(s => s.userId).sort();

describe("P9-A1 — the inventory (read only)", () => {
  it("only the classes without an owner, with their counts; who sees them today", async () => {
    const ctx = setup();
    const before = dataSnapshot(ctx);
    const r = (await get(ctx)).jsonBody;
    expect(r.visibilityToday).toEqual({ kind: "shared" });
    expect(r.classes.map(c => c.classId)).toEqual(["old2", "old"]);   // by name (ar): «التاسع» before «العاشر»
    expect(r.classes[1]).toMatchObject({ students: { total: 4, archived: 1, withOwner: 1 }, assignments: { total: 1, byStatus: { published: 1 } }, decision: null });
    expect(dataSnapshot(ctx)).toBe(before);
    const ld = { ...ctx.deps, tenancyEnv: { LEGACY_DATA_OWNER: SARA } };
    expect((await handler({ method: "GET", url: "https://x/api/owner-legacy-classes", params: {}, headers: hdr(ctx.owner) }, ld)).jsonBody.visibilityToday).toEqual({ kind: "legacy-owner", accountId: SARA });
  });
  it("an owner session only: a teacher is refused", async () => {
    const ctx = setup();
    expect((await get(ctx, "", ctx.sara)).status).toBeGreaterThanOrEqual(401);
  });
});

describe("P9-A1 — the preview is a dry run", () => {
  it("«assign»: the class and its students without an owner (the archived one too); an owned student untouched; nothing written", async () => {
    const ctx = setup();
    const before = JSON.stringify([...ctx.mem.store.keys()].sort()) + dataSnapshot(ctx);
    const p = await preview(ctx, { classId: "old", decision: "assign", toAccountId: OMAR });
    expect(p.changes.map(c => [c.type, c.userId || "", c.before, c.after])).toEqual([["class", "", null, OMAR], ["student", "s1", null, OMAR], ["student", "s2", null, OMAR], ["student", "s3", null, OMAR]]);
    expect(p.untouched).toEqual([{ userId: "s4", ownerId: SARA, reason: "owned" }]);
    expect(p.visibility).toEqual({ before: { kind: "shared" }, after: { kind: "teacher", accountId: OMAR }, studentServicesFollow: OMAR });
    expect(p.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify([...ctx.mem.store.keys()].sort()) + dataSnapshot(ctx)).toBe(before);
  });
  it("refused: an owned class, an unknown class, an unknown decision, «assign» without / with a bad / a suspended teacher; step-up", async () => {
    const ctx = setup();
    const code = async body => { const r = await post(ctx, "preview", body); return [r.status, r.jsonBody.code]; };
    expect(await code({ classId: "own", decision: "assign", toAccountId: OMAR })).toEqual([409, "CLASS_ALREADY_OWNED"]);
    expect(await code({ classId: "nope", decision: "shared" })).toEqual([404, "CLASS_NOT_FOUND"]);
    expect(await code({ classId: "old", decision: "give" })).toEqual([400, "DECISION_INVALID"]);
    expect(await code({ classId: "old", decision: "assign" })).toEqual([400, "TARGET_INVALID"]);
    expect(await code({ classId: "old", decision: "assign", toAccountId: "t_ffffffffffffffff" })).toEqual([400, "TARGET_INVALID"]);
    expect(await code({ classId: "old", decision: "assign", toAccountId: OWNER_ID })).toEqual([400, "TARGET_INVALID"]);
    expect(await code({ classId: "old", decision: "assign", toAccountId: SUSP })).toEqual([400, "TARGET_SUSPENDED"]);
    expect((await post(ctx, "preview", { classId: "old", decision: "assign", toAccountId: INV })).status).toBe(200);   // invited, not signed in yet: allowed
    const stale = await post(ctx, "preview", { classId: "old", decision: "shared" }, ctx.ownerStale);
    expect(stale.status).toBe(403);
  });
});

describe("P9-A1 — «assign» (a teacher)", () => {
  it("applied: the class and its unowned students stamped; results byte-identical; the ledger keeps the previous values; audited twice", async () => {
    const ctx = setup();
    const results = dataSnapshot(ctx, ["platform/assignments/", "platform/submissions/"]);
    const r = await decide(ctx, { classId: "old", decision: "assign", toAccountId: OMAR });
    expect([r.status, r.jsonBody.ledger.status]).toEqual([200, "applied"]);
    expect(classDoc(ctx).ownerId).toBe(OMAR);
    expect(classDoc(ctx).ownerHistory.at(-1)).toMatchObject({ from: null, to: OMAR, reason: "قرار المالك الموثّق", migrationId: r.jsonBody.ledger.migrationId });
    expect(owners(ctx)).toEqual([OMAR, OMAR, OMAR, SARA]);
    expect(dataSnapshot(ctx, ["platform/assignments/", "platform/submissions/"])).toBe(results);
    const [l] = ledgers(ctx);
    expect(l).toMatchObject({ kind: "legacy-class-ownership", classId: "old", decision: "assign", to: OMAR, reason: "قرار المالك الموثّق", by: "owner:" + OWNER_ID, status: "applied" });
    expect(l.changes.every(c => c.before === null && c.after === OMAR && c.outcome === "changed")).toBe(true);
    expect(ownerEvents(ctx).filter(e => e.action === "owner.legacy.class.decided").map(e => e.details)).toEqual([expect.objectContaining({ decision: "assign", to: OMAR, changed: 4, failed: 0, untouched: 1 })]);
    expect(teacherEvents(ctx).map(e => [e.action, e.forTeacher])).toEqual([["owner.legacy.class.assigned", OMAR]]);
    expect((await get(ctx)).jsonBody.classes.map(c => c.classId)).toEqual(["old2"]);
  });
  it("who sees it: before — shared (the imported workspace), not a console teacher; after — the chosen teacher only", async () => {
    const ctx = setup();
    expect(await teacherClasses(ctx, ctx.legacy)).toContain("old");
    expect(await teacherClasses(ctx, ctx.omar)).not.toContain("old");
    await decide(ctx, { classId: "old", decision: "assign", toAccountId: OMAR });
    expect(await teacherClasses(ctx, ctx.omar)).toContain("old");
    expect(await teacherStudents(ctx, ctx.omar)).toEqual(["s1", "s2", "s3"]);
    expect(await teacherClasses(ctx, ctx.legacy)).not.toContain("old");
  });
  it("a stale preview (the class or a student changed since) → PREVIEW_STALE, nothing written", async () => {
    const ctx = setup();
    const p = await preview(ctx, { classId: "old", decision: "assign", toAccountId: OMAR });
    ctx.mem.setJson("platform/users/s3.json", { ...ctx.mem.getJson("platform/users/s3.json"), displayName: "تغيّر" });
    const before = dataSnapshot(ctx);
    const r = await post(ctx, "apply", { classId: "old", decision: "assign", toAccountId: OMAR, reason: "قرار المالك", previewDigest: p.digest, requestKey: "req-stale-0001" });
    expect([r.status, r.jsonBody.code]).toEqual([409, "PREVIEW_STALE"]);
    expect(dataSnapshot(ctx)).toBe(before);
    expect(ledgers(ctx)).toEqual([]);
  });
  it("refused without a reason, a request key or a step-up — nothing written", async () => {
    const ctx = setup();
    const p = await preview(ctx, { classId: "old", decision: "assign", toAccountId: OMAR });
    const base = { classId: "old", decision: "assign", toAccountId: OMAR, previewDigest: p.digest };
    const before = dataSnapshot(ctx);
    expect((await post(ctx, "apply", { ...base, reason: "لا", requestKey: "req-a-00001" })).jsonBody.code).toBe("REASON_REQUIRED");
    expect((await post(ctx, "apply", { ...base, reason: "قرار المالك", requestKey: "x" })).jsonBody.code).toBe("REQUEST_KEY_INVALID");
    expect((await post(ctx, "apply", { ...base, reason: "قرار المالك", requestKey: "req-a-00001" }, ctx.ownerStale)).status).toBe(403);
    expect([dataSnapshot(ctx), ledgers(ctx).length]).toEqual([before, 0]);
  });
  it("the same request again is never applied twice; the same key for another decision is refused", async () => {
    const ctx = setup();
    const first = await decide(ctx, { classId: "old", decision: "assign", toAccountId: OMAR }, "req-same-0001");
    const after = dataSnapshot(ctx);
    const again = await post(ctx, "apply", { classId: "old", decision: "assign", toAccountId: OMAR, reason: "قرار المالك", previewDigest: "x", requestKey: "req-same-0001" });
    expect([again.status, again.jsonBody.duplicate, again.jsonBody.ledger.migrationId]).toEqual([200, true, first.jsonBody.ledger.migrationId]);
    expect(dataSnapshot(ctx)).toBe(after);
    expect((await post(ctx, "apply", { classId: "old", decision: "shared", reason: "قرار المالك", previewDigest: "x", requestKey: "req-same-0001" })).jsonBody.code).toBe("REQUEST_KEY_REUSED");
  });
  it("a run that stopped half-way (a student write failed) stays pending and is completed by the same request — never twice", async () => {
    const ctx = setup();
    let failOnce = true;
    const flaky = { ...ctx.deps, mutateJsonWithRetry: (c, name, fn, o) => { if (failOnce && name === "platform/users/s3.json") { failOnce = false; throw new Error("storage hiccup"); } return mutateJsonWithRetry(c, name, fn, o); } };
    const p = await preview(ctx, { classId: "old", decision: "assign", toAccountId: OMAR });
    const body = { classId: "old", decision: "assign", toAccountId: OMAR, reason: "قرار المالك الموثّق", previewDigest: p.digest, requestKey: "req-resume-01" };
    const r1 = await post(ctx, "apply", body, ctx.owner, flaky);
    expect(r1.jsonBody.ledger.status).toBe("pending");
    expect(owners(ctx)).toEqual([OMAR, OMAR, null, SARA]);
    expect(teacherEvents(ctx)).toEqual([]);                          // the teacher is told once the decision is complete
    const r2 = await post(ctx, "apply", body);
    expect([r2.jsonBody.ledger.status, owners(ctx)]).toEqual(["applied", [OMAR, OMAR, OMAR, SARA]]);
    expect(classDoc(ctx).ownerHistory.length).toBe(1);
    expect(ledgers(ctx).length).toBe(1);
  });
});

describe("P9-A1 — «shared» and «archive»", () => {
  it("«shared»: no data document changes; the decision is recorded and shown; undo removes the record", async () => {
    const ctx = setup();
    const before = dataSnapshot(ctx);
    const r = await decide(ctx, { classId: "old", decision: "shared" });
    expect([r.status, r.jsonBody.ledger.status, r.jsonBody.ledger.changes]).toEqual([200, "applied", []]);
    expect(dataSnapshot(ctx)).toBe(before);
    expect((await get(ctx)).jsonBody.classes.find(c => c.classId === "old").decision).toMatchObject({ decision: "shared" });
    const u = await post(ctx, "undo", { migrationId: r.jsonBody.ledger.migrationId, reason: "تراجع المالك" });
    expect([u.status, u.jsonBody.ledger.status]).toEqual([200, "undone"]);
    expect((await get(ctx)).jsonBody.classes.find(c => c.classId === "old").decision).toBeNull();
  });
  it("«archive»: archived with the teachers' own rule, results kept; undo makes it active again", async () => {
    const ctx = setup();
    const results = dataSnapshot(ctx, ["platform/assignments/", "platform/submissions/", "platform/users/"]);
    const r = await decide(ctx, { classId: "old", decision: "archive" });
    expect([r.status, r.jsonBody.ledger.status]).toEqual([200, "applied"]);
    expect([classDoc(ctx).status, classDoc(ctx).ownerId]).toEqual(["archived", undefined]);
    expect(dataSnapshot(ctx, ["platform/assignments/", "platform/submissions/", "platform/users/"])).toBe(results);
    expect((await post(ctx, "preview", { classId: "old", decision: "archive" })).jsonBody.code).toBe("CLASS_ALREADY_ARCHIVED");
    const u = await post(ctx, "undo", { migrationId: r.jsonBody.ledger.migrationId, reason: "تراجع المالك" });
    expect([u.status, classDoc(ctx).status]).toEqual([200, "active"]);
  });
  it("«archive» is refused while work awaits grading (the teachers' rule); the ledger says so; nothing archived", async () => {
    const ctx = setup({ pending: true });
    const r = await decide(ctx, { classId: "old", decision: "archive" });
    expect([r.status, r.jsonBody.code]).toEqual([409, "PENDING_GRADING"]);
    expect(classDoc(ctx).status).toBe("active");
    expect(ledgers(ctx).map(l => l.status)).toEqual(["refused"]);
  });
});

describe("P9-A1 — undo", () => {
  it("back to the previous values (no owner on the class and its students); recorded in the history, the ledger and both logs", async () => {
    const ctx = setup();
    const before = JSON.parse(dataSnapshot(ctx, ["platform/users/"]));
    const r = await decide(ctx, { classId: "old", decision: "assign", toAccountId: OMAR });
    const u = await post(ctx, "undo", { migrationId: r.jsonBody.ledger.migrationId, reason: "أُسند خطأً" });
    expect([u.status, u.jsonBody.ledger.status, u.jsonBody.ledger.undoReason]).toEqual([200, "undone", "أُسند خطأً"]);
    expect([classDoc(ctx).ownerId, owners(ctx)]).toEqual([undefined, [null, null, null, SARA]]);
    expect(classDoc(ctx).ownerHistory.at(-1)).toMatchObject({ from: OMAR, to: null, undo: true });
    const now = JSON.parse(dataSnapshot(ctx, ["platform/users/"]));
    const strip = ({ updatedAt, profileRevision, ...rest }) => rest;   // eslint-disable-line no-unused-vars
    expect(now.map(([n, d]) => [n, strip(d)])).toEqual(before.map(([n, d]) => [n, strip(d)]));
    expect(teacherEvents(ctx).map(e => e.action)).toEqual(["owner.legacy.class.assigned", "owner.legacy.class.undone"]);
    expect((await get(ctx)).jsonBody.classes.map(c => c.classId)).toContain("old");
    expect((await post(ctx, "undo", { migrationId: r.jsonBody.ledger.migrationId, reason: "مرة ثانية" })).jsonBody.code).toBe("UNDO_NOT_APPLICABLE");
  });
  it("refused when anything changed since (a student moved to another teacher, the class transferred) — and nothing is written", async () => {
    for (const change of [
      ctx => ctx.mem.setJson("platform/users/s3.json", { ...ctx.mem.getJson("platform/users/s3.json"), ownerId: SARA }),
      ctx => { const c = classDoc(ctx); ctx.mem.setJson("platform/classes/old.json", { ...c, ownerId: SARA, ownerHistory: [...c.ownerHistory, { from: OMAR, to: SARA }] }); }
    ]) {
      const ctx = setup();
      const r = await decide(ctx, { classId: "old", decision: "assign", toAccountId: OMAR });
      change(ctx);
      const before = dataSnapshot(ctx);
      const u = await post(ctx, "undo", { migrationId: r.jsonBody.ledger.migrationId, reason: "تراجع المالك" });
      expect([u.status, u.jsonBody.code, u.jsonBody.conflicts.length]).toEqual([409, "UNDO_CONFLICT", 1]);
      expect(dataSnapshot(ctx)).toBe(before);
      expect(ledgers(ctx)[0].status).toBe("applied");
    }
  });
  it("refused: no reason, an unknown ledger, a stale step-up", async () => {
    const ctx = setup();
    const r = await decide(ctx, { classId: "old", decision: "assign", toAccountId: OMAR });
    const id = r.jsonBody.ledger.migrationId;
    expect((await post(ctx, "undo", { migrationId: id, reason: "" })).jsonBody.code).toBe("REASON_REQUIRED");
    expect((await post(ctx, "undo", { migrationId: "mig-000000000000000000000000", reason: "تراجع المالك" })).jsonBody.code).toBe("MIGRATION_NOT_FOUND");
    expect((await post(ctx, "undo", { migrationId: id, reason: "تراجع المالك" }, ctx.ownerStale)).status).toBe(403);
    expect(classDoc(ctx).ownerId).toBe(OMAR);
  });
  it("the ledger list: newest first", async () => {
    const ctx = setup();
    await decide(ctx, { classId: "old2", decision: "shared" }, "req-l-000001");
    const r = (await get(ctx, "ledger")).jsonBody.ledgers;
    expect(r.map(l => [l.classId, l.decision, l.status])).toEqual([["old2", "shared", "applied"]]);
  });
});
