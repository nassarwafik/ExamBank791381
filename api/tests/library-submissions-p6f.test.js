// Tadris+ P6-F — teachers send exams to the platform bank; the owner reviews, publishes or declines (docs/enterprise-library-submissions-p6f.md;
// owner decisions (2) and (أ)). TEST data only; real owner and managed sessions.
//   a teacher sends THEIR OWN saved exam (the server reads it; governed → its published revision), frozen at that moment; it must be ready;
//   the owner sees it, previews it, publishes it (IMP-nnn, «لم يُحدَّد بعد») or declines it with a reason the teacher sees;
//   an updated version of an exam already published REPLACES it: same audience, the old one shown to nobody, old assignments unchanged;
//   the owner's own workspace (P4-D) is a source too; anything not understood fails closed; every decision is in the owner audit first.
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { recordedManagedToken } from "./fixtures/managed-session.js";

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p6f-library-submissions-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: ownerLibrary } = await import("../src/functions/owner-library.js");
const { handler: submissionsRoute } = await import("../src/functions/library-submissions.js");
const { handler: library } = await import("../src/functions/exam-library.js");
const { handler: assignments } = await import("../src/functions/manage-assignments.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const { createBuilderToken } = await import("../src/lib/builder-auth.js");
const IMP = cjs("../src/lib/exam-library-imported.js");
const LS = cjs("../src/lib/library-submissions.js");
const { GovernanceError } = cjs("../src/lib/exam-governance.js");
const LA = cjs("../src/lib/access/library-access.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");
const TEMPLATE = cjs("../../public/templates/structured-exam-template.json");

const OWNER_ID = "own_0011223344556677";
const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb";

function setup({ mode = "enforce", linked = null } = {}) {
  resetRevisionCache(); resetOperatorGateCache(); IMP.resetImportedLibraryCacheForTests();
  const mem = createMemoryContainer({ "platform/classes/cA.json": { classId: "cA", name: "صف سارة", active: true, status: "active", ownerId: SARA }, "platform/classes/cB.json": { classId: "cB", name: "صف عمر", active: true, status: "active", ownerId: OMAR } });
  const now = Date.now();
  for (const [id, username] of [[SARA, "t.sara"], [OMAR, "t.omar"]]) {
    const { revision } = buildRevision({ accountId: id, presetId: "full-teaching", presetVersion: 1, createdBy: "owner:x" });
    mem.setJson(revisionName(revision.revisionId), revision);
    mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName: username, status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: "full-teaching", version: 1 } });
  }
  if (mode) mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {}, ...(linked ? { linkedTeacherAccountId: linked } : {}) });
  const heads = {};
  for (const [name, ago] of [["owner", 0], ["ownerStale", 11 * 60 * 1000]]) {
    const sid = (ago ? "d" : "c").repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - ago });
    heads[name] = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  let clock = Date.parse("2026-11-12T10:00:00.000Z");
  const bank = createMemoryContainer();
  const deps = { getContainer: () => mem.container, container: mem.container, bankContainer: bank.container, now: () => new Date((clock += 1000)).toISOString(), ensurePublishedAssignmentIndexed: async () => {}, recordAuditEvent: async () => {}, recordEventSafely: async () => {} };
  const tok = id => ({ "x-builder-token": recordedManagedToken(mem, { accountId: id, sid: newTeacherSessionId(), authVersion: 1 }, { nowMs: clock }).token });
  return { mem, bank, deps, ...heads, sara: tok(SARA), omar: tok(OMAR) };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const oreq = (method, action, headers, body = {}) => ({ method, url: "https://x/api/owner-library", params: { action }, headers: hdr(headers), json: async () => body });
const odeps = ctx => ({ getContainer: () => ctx.mem.container, bankContainer: ctx.bank.container, ...(ctx.extra || {}) });
const owner = (ctx, action, body, headers = ctx.owner) => ownerLibrary(oreq("POST", action, headers, body), odeps(ctx));
const ownerGet = (ctx, headers = ctx.owner) => ownerLibrary(oreq("GET", "", headers), odeps(ctx));
const ownerRead = (ctx, action, query = "", headers = ctx.owner) => ownerLibrary({ method: "GET", url: "https://x/api/owner-library/" + action + query, params: { action }, headers: hdr(headers), json: async () => ({}) }, odeps(ctx));
// the teacher's activity log is written for real here (the shared harness silences it for the assignment routes)
// P6-G — a teacher sends after agreeing to the platform's use of the exam (the current consent version); P6-G's own tests prove the refusal without it
const agreed = body => (body && body.action === "submit" && !("consentVersion" in body) ? { ...body, consentVersion: LS.CONSENT.version } : body);
const send = (ctx, headers, body) => submissionsRoute({ method: "POST", url: "https://x/api/library-submissions", params: {}, headers: hdr(headers), json: async () => agreed(body) }, { ...ctx.deps, recordAuditEvent: undefined, ...(ctx.extra || {}) });
const mine = async (ctx, headers) => (await submissionsRoute({ method: "GET", url: "https://x/api/library-submissions", params: {}, headers: hdr(headers) }, { ...ctx.deps, ...(ctx.extra || {}) })).jsonBody.submissions;
const catalog = (ctx, headers) => library({ method: "GET", url: "https://x", params: {}, headers: hdr(headers) }, ctx.deps);
const bankOf = async (ctx, headers) => (await catalog(ctx, headers)).jsonBody.catalog.map(i => i.libraryItemId);
const assign = (ctx, headers, classId, itemId) => assignments({ method: "POST", url: "http://x/assignments", params: {}, headers: hdr(headers), json: async () => ({ action: "create", classId, title: "واجب", publish: true, libraryRef: { itemId } }) }, ctx.deps);
const exam = (change = e => e) => change(JSON.parse(JSON.stringify(TEMPLATE)));

const saved = (ctx, id, ownerId, change = e => e) => {
  const e = exam(change);
  e.examId = id; e.title = "امتحان " + id;
  ctx.bank.setJson("exams/" + id + ".json", { exam: e, savedAt: "2026-11-13T09:00:00.000Z", ...(ownerId ? { ownerId } : {}) });
  return "exams/" + id + ".json";
};
const publishBody = (submissionId, over = {}) => ({ submissionId, title: "امتحان الشبكات", category: "final", activityType: "exam", ...over });
const ownerAudits = ctx => ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n)).filter(a => String(a.action).startsWith("owner.library.submission") || String(a.action).startsWith("owner.library.own") || String(a.action).startsWith("owner.library.replacement"));
const teacherAudits = ctx => ctx.mem.names("platform/audit/").map(n => ctx.mem.getJson(n)).filter(a => a && String(a.action || "").startsWith("library.submission"));

describe("P6-F a teacher sends their own exam; the owner reviews and publishes it", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("sent → «قيد مراجعة المالك» for the teacher and in the owner's list; previewed, published as IMP-001 for nobody; then «نُشر»", async () => {
    const blob = saved(ctx, "EXAM-sara-1", SARA);
    const r = await send(ctx, ctx.sara, { action: "submit", blobName: blob });
    expect(r.status).toBe(200);
    expect(r.jsonBody.submission).toMatchObject({ savedExamBlob: blob, title: "امتحان EXAM-sara-1", status: "pending", questionCount: 5 });
    const id = r.jsonBody.submission.submissionId;
    expect(id).toMatch(LS.SUBMISSION_ID);
    expect((await mine(ctx, ctx.sara)).map(s => [s.submissionId, s.status])).toEqual([[id, "pending"]]);
    expect(await mine(ctx, ctx.omar)).toEqual([]);                                      // nobody else's

    const list = await ownerRead(ctx, "submissions");
    expect(list.jsonBody.pending).toBe(1);
    expect(list.jsonBody.submissions[0]).toMatchObject({ submissionId: id, teacherId: SARA, teacherName: "t.sara", status: "pending", sentBy: "teacher" });
    const one = await ownerRead(ctx, "submission", "?id=" + id);
    expect(one.status).toBe(200);
    expect(one.jsonBody.finalization.canFinalize).toBe(true);
    expect(one.jsonBody.exam.sections[0].questions[0].answer).toEqual({ correctOptionIndex: 1 });   // the owner sees the keys
    expect(one.jsonBody.replaces).toBeNull();

    const p = await owner(ctx, "publish-submission", publishBody(id));
    expect(p.status).toBe(200);
    expect(p.jsonBody.item).toMatchObject({ libraryItemId: "IMP-001", title: "امتحان الشبكات", audience: "selected", teachers: [], decided: false });
    expect((await mine(ctx, ctx.sara))[0]).toMatchObject({ submissionId: id, status: "published", published: true });
    const item = ctx.mem.getJson(IMP.itemName("IMP-001"));
    expect(item.source).toEqual({ kind: "teacher-submission", submissionId: id });
    expect(JSON.stringify(item)).not.toContain(SARA);                                    // who wrote it stays with the owner (س1)
    expect(await bankOf(ctx, ctx.sara)).not.toContain("IMP-001");                        // it follows the audience the owner chooses (س3)
    expect((await ownerGet(ctx)).jsonBody.items.find(i => i.libraryItemId === "IMP-001")).toMatchObject({ fromTeacher: true });
    expect(teacherAudits(ctx).map(a => [a.actor, a.action])).toEqual([[SARA, "library.submission.sent"]]);
    expect(ownerAudits(ctx).map(a => [a.action, a.targetId, a.details.submissionId])).toEqual([["owner.library.submission-published", "IMP-001", id]]);
  });

  it("the exam is FROZEN when sent: a later edit of the saved exam does not change what the owner publishes", async () => {
    const blob = saved(ctx, "EXAM-frozen", SARA);
    const id = (await send(ctx, ctx.sara, { action: "submit", blobName: blob })).jsonBody.submission.submissionId;
    saved(ctx, "EXAM-frozen", SARA, e => { e.sections[0].questions[0].text = "نص عدّلته المعلمة لاحقًا"; return e; });
    await owner(ctx, "publish-submission", publishBody(id));
    expect(ctx.mem.getJson(IMP.itemName("IMP-001")).examSnapshot.sections[0].questions[0].text).toBe(TEMPLATE.sections[0].questions[0].text);
  });

  it("declined with a reason the teacher sees; a reason is required; deciding needs a recent second-factor check", async () => {
    const id = (await send(ctx, ctx.sara, { action: "submit", blobName: saved(ctx, "EXAM-d", SARA) })).jsonBody.submission.submissionId;
    expect((await owner(ctx, "decline-submission", { submissionId: id, reason: "  " })).jsonBody.code).toBe("REASON_REQUIRED");
    expect((await owner(ctx, "decline-submission", { submissionId: id, reason: "أضف أسئلة على الوحدة 3" }, ctx.ownerStale)).jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect((await owner(ctx, "publish-submission", publishBody(id), ctx.ownerStale)).jsonBody.code).toBe("STEP_UP_REQUIRED");
    const d = await owner(ctx, "decline-submission", { submissionId: id, reason: "أضف أسئلة على الوحدة 3" });
    expect([d.status, d.jsonBody.submission.status]).toEqual([200, "declined"]);
    expect((await mine(ctx, ctx.sara))[0]).toMatchObject({ status: "declined", reason: "أضف أسئلة على الوحدة 3" });
    // recorded in the owner audit before it happens (P10-L) — the length of the reason, never its text
    expect(ownerAudits(ctx).map(a => [a.action, a.targetId, a.details.teacherId, a.details.reasonLength])).toEqual([["owner.library.submission-declined", id, SARA, "أضف أسئلة على الوحدة 3".length]]);
    expect((await owner(ctx, "publish-submission", publishBody(id))).jsonBody.code).toBe("SUBMISSION_NOT_PENDING");
    expect(IMP.parseIndex(ctx.mem.getJson(IMP.INDEX_DOC)).items).toEqual([]);
  });

  it("the teacher withdraws a pending submission (not another teacher's); a withdrawn one cannot be published", async () => {
    const id = (await send(ctx, ctx.sara, { action: "submit", blobName: saved(ctx, "EXAM-w", SARA) })).jsonBody.submission.submissionId;
    expect((await send(ctx, ctx.omar, { action: "withdraw", submissionId: id })).jsonBody.code).toBe("SUBMISSION_NOT_FOUND");
    expect((await send(ctx, ctx.sara, { action: "withdraw", submissionId: id })).jsonBody.submission.status).toBe("withdrawn");
    expect((await owner(ctx, "publish-submission", publishBody(id))).jsonBody.code).toBe("SUBMISSION_NOT_PENDING");
    expect(teacherAudits(ctx).map(a => a.action)).toEqual(["library.submission.sent", "library.submission.withdrawn"]);
  });

  it("sending the same exam again before the owner decides supersedes the pending one", async () => {
    const blob = saved(ctx, "EXAM-s", SARA);
    const first = (await send(ctx, ctx.sara, { action: "submit", blobName: blob })).jsonBody.submission.submissionId;
    saved(ctx, "EXAM-s", SARA, e => { e.sections[0].questions[0].text = "نسخة أحدث"; return e; });
    const second = (await send(ctx, ctx.sara, { action: "submit", blobName: blob })).jsonBody.submission.submissionId;
    const rows = Object.fromEntries((await mine(ctx, ctx.sara)).map(s => [s.submissionId, s.status]));
    expect(rows).toEqual({ [first]: "superseded", [second]: "pending" });
  });
});

describe("P6-F what may be sent — the server reads the exam itself", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });
  const refused = async (headers, body, status, code) => {
    const r = await send(ctx, headers, body);
    expect([r.status, r.jsonBody.code]).toEqual([status, code]);
    expect(ctx.mem.names(LS.SUBMISSION_PREFIX)).toEqual([]);
    return r;
  };

  it("another teacher's exam, or an exam without an owner, is answered like a missing one", async () => {
    await refused(ctx.omar, { action: "submit", blobName: saved(ctx, "EXAM-x", SARA) }, 404, "EXAM_NOT_FOUND");
    await refused(ctx.sara, { action: "submit", blobName: saved(ctx, "EXAM-unowned", null) }, 404, "EXAM_NOT_FOUND");
    await refused(ctx.sara, { action: "submit", blobName: "exams/../platform/x.json" }, 400, "SAVED_EXAM_INVALID");
  });
  it("an exam that is not ready is refused with the reasons; a flat (legacy) exam is refused", async () => {
    const r = await refused(ctx.sara, { action: "submit", blobName: saved(ctx, "EXAM-nr", SARA, e => { delete e.sections[0].questions[0].answer; return e; }) }, 422, "EXAM_NOT_READY");
    expect(r.jsonBody.blockers.length).toBeGreaterThan(0);
    ctx.bank.setJson("exams/EXAM-flat.json", { exam: { examId: "EXAM-flat", title: "قديم", questions: [] }, ownerId: SARA });
    await refused(ctx.sara, { action: "submit", blobName: "exams/EXAM-flat.json" }, 400, "EXAM_NOT_STRUCTURED");
  });
  it("only an account-based session: an identity that predates the console cannot send", async () => {
    ctx.mem.store.delete(BOOTSTRAP_MARKER); resetOperatorGateCache();
    await refused({ "x-builder-token": createBuilderToken("teacher") }, { action: "submit", blobName: saved(ctx, "EXAM-l", SARA) }, 403, "ACCOUNT_REQUIRED");
  });
  it("a governed exam: its PUBLISHED revision is sent, never the draft; without one the send is refused", async () => {
    const blob = saved(ctx, "EXAM-gov", SARA, e => { e.sections[0].questions[0].text = "مسودة لم تُنشر"; return e; });
    const published = exam(e => { e.examId = "EXAM-gov"; e.title = "المنشورة"; return e; });
    ctx.extra = { resolveGovernedExamSource: async () => ({ governed: true, revision: { exam: published } }) };
    const id = (await send(ctx, ctx.sara, { action: "submit", blobName: blob })).jsonBody.submission.submissionId;
    const one = await ownerRead(ctx, "submission", "?id=" + id);
    expect(one.jsonBody.exam.sections[0].questions[0].text).toBe(TEMPLATE.sections[0].questions[0].text);
    expect(one.jsonBody.submission.governed).toBe(true);
    ctx.extra = { resolveGovernedExamSource: async () => { throw new GovernanceError(409, "NO_PUBLISHED_REVISION", "x"); } };
    const r = await send(ctx, ctx.sara, { action: "submit", blobName: saved(ctx, "EXAM-gov2", SARA) });
    expect([r.status, r.jsonBody.code]).toEqual([409, "NO_PUBLISHED_REVISION"]);
  });
  it("at most 20 pending submissions per teacher", async () => {
    for (let i = 1; i <= 20; i++) expect((await send(ctx, ctx.sara, { action: "submit", blobName: saved(ctx, "EXAM-n" + i, SARA, e => { e.sections[0].questions[0].text = "س" + i; return e; }) })).status).toBe(200);
    const r = await send(ctx, ctx.sara, { action: "submit", blobName: saved(ctx, "EXAM-n21", SARA, e => { e.sections[0].questions[0].text = "س21"; return e; }) });
    expect([r.status, r.jsonBody.code]).toEqual([429, "TOO_MANY_PENDING"]);
  });
});

describe("P6-F an updated version replaces the published one (owner decision (أ))", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });
  const sendAndPublish = async (text) => {
    const blob = saved(ctx, "EXAM-v", SARA, e => { e.sections[0].questions[0].text = text; return e; });
    const id = (await send(ctx, ctx.sara, { action: "submit", blobName: blob })).jsonBody.submission.submissionId;
    return { id, r: await owner(ctx, "publish-submission", publishBody(id, { title: "امتحان " + text })) };
  };

  it("the new version takes the old one's audience; the old one is shown to nobody; an assignment made from the old one is unchanged", async () => {
    await sendAndPublish("v1");
    await owner(ctx, "set-audience", { itemId: "IMP-001", audience: "selected", teachers: [SARA, OMAR] });
    const old = await assign(ctx, ctx.omar, "cB", "IMP-001");
    expect(old.status).toBe(200);
    const before = ctx.mem.names("platform/assignments/").map(n => ctx.mem.getJson(n)).find(a => a && a.source && a.source.itemId === "IMP-001");

    const v2 = await send(ctx, ctx.sara, { action: "submit", blobName: saved(ctx, "EXAM-v", SARA, e => { e.sections[0].questions[0].text = "v2"; return e; }) });
    const id2 = v2.jsonBody.submission.submissionId;
    expect((await ownerRead(ctx, "submission", "?id=" + id2)).jsonBody.replaces).toEqual({ libraryItemId: "IMP-001", title: "امتحان v1" });
    const r = await owner(ctx, "publish-submission", publishBody(id2, { title: "امتحان v2" }));
    expect(r.jsonBody).toMatchObject({ ok: true, replaces: "IMP-001", replacementPending: false, item: { libraryItemId: "IMP-002", replaces: "IMP-001" } });
    const aud = LA.parseAudienceDoc(ctx.mem.getJson(LA.AUDIENCE_DOC)).items;
    expect(aud["IMP-002"]).toMatchObject({ audience: "selected", teachers: [SARA, OMAR].sort() });
    expect(aud["IMP-001"]).toMatchObject({ audience: "selected", teachers: [] });
    expect(await bankOf(ctx, ctx.omar)).toContain("IMP-002");
    expect(await bankOf(ctx, ctx.omar)).not.toContain("IMP-001");
    const idx = IMP.parseIndex(ctx.mem.getJson(IMP.INDEX_DOC)).items;
    expect(idx.find(m => m.libraryItemId === "IMP-001").replacedBy).toBe("IMP-002");
    expect(idx.find(m => m.libraryItemId === "IMP-002").replaces).toBe("IMP-001");
    const after = ctx.mem.getJson("platform/assignments/" + before.assignmentId + ".json");
    expect(after).toEqual(before);                                                     // the published assignment is untouched
    expect((await ownerGet(ctx)).jsonBody.items.filter(i => i.imported).map(i => [i.libraryItemId, i.replaces || "", i.replacedBy || ""])).toEqual([["IMP-001", "", "IMP-002"], ["IMP-002", "IMP-001", ""]]);
    expect(ownerAudits(ctx).map(a => [a.action, a.targetId, a.details.replaces || ""])).toEqual([["owner.library.submission-published", "IMP-001", ""], ["owner.library.submission-published", "IMP-002", "IMP-001"]]);
  });

  it("if the audience cannot be moved, the new version stays «لم يُحدَّد بعد» and the old one stays visible; «إكمال الاستبدال» finishes it", async () => {
    await sendAndPublish("v1");
    await owner(ctx, "set-audience", { itemId: "IMP-001", audience: "all" });
    const good = ctx.mem.getJson(LA.AUDIENCE_DOC);
    const v2 = await send(ctx, ctx.sara, { action: "submit", blobName: saved(ctx, "EXAM-v", SARA, e => { e.sections[0].questions[0].text = "v2"; return e; }) });
    ctx.mem.setJson(LA.AUDIENCE_DOC, { schemaVersion: 2 });                              // the audience record cannot be understood
    const r = await owner(ctx, "publish-submission", publishBody(v2.jsonBody.submission.submissionId, { title: "امتحان v2" }));
    expect(r.jsonBody).toMatchObject({ ok: true, replaces: "IMP-001", replacementPending: true });
    expect(ctx.mem.getJson(LA.AUDIENCE_DOC)).toEqual({ schemaVersion: 2 });               // never overwritten
    ctx.mem.setJson(LA.AUDIENCE_DOC, good);
    expect(await bankOf(ctx, ctx.sara)).toEqual(expect.arrayContaining(["IMP-001"]));
    expect(await bankOf(ctx, ctx.sara)).not.toContain("IMP-002");
    const done = await owner(ctx, "complete-replacement", { libraryItemId: "IMP-002" });
    expect(done.jsonBody).toMatchObject({ ok: true, libraryItemId: "IMP-002", replaces: "IMP-001" });
    expect(await bankOf(ctx, ctx.sara)).toContain("IMP-002");
    expect(await bankOf(ctx, ctx.sara)).not.toContain("IMP-001");
    expect((await owner(ctx, "complete-replacement", { libraryItemId: "IMP-002" })).jsonBody.alreadyComplete).toBe(true);
  });

  it("«إكمال الاستبدال» never overwrites an audience the owner already chose for the new version", async () => {
    await sendAndPublish("v1");
    await owner(ctx, "set-audience", { itemId: "IMP-001", audience: "all" });
    const good = ctx.mem.getJson(LA.AUDIENCE_DOC);
    const v2 = await send(ctx, ctx.sara, { action: "submit", blobName: saved(ctx, "EXAM-v", SARA, e => { e.sections[0].questions[0].text = "v2"; return e; }) });
    ctx.mem.setJson(LA.AUDIENCE_DOC, { schemaVersion: 2 });
    await owner(ctx, "publish-submission", publishBody(v2.jsonBody.submission.submissionId, { title: "امتحان v2" }));
    ctx.mem.setJson(LA.AUDIENCE_DOC, good);
    await owner(ctx, "set-audience", { itemId: "IMP-002", audience: "selected", teachers: [OMAR] });
    await owner(ctx, "complete-replacement", { libraryItemId: "IMP-002" });
    const aud = LA.parseAudienceDoc(ctx.mem.getJson(LA.AUDIENCE_DOC)).items;
    expect(aud["IMP-002"]).toMatchObject({ audience: "selected", teachers: [OMAR] });
    expect(aud["IMP-001"]).toMatchObject({ audience: "selected", teachers: [] });
  });
});

describe("P6-F the owner's own workspace (P4-D) is a source", () => {
  it("own-exams lists the linked account's structured saved exams; take-own makes a submission the owner then publishes", async () => {
    const ctx = setup({ linked: SARA });
    saved(ctx, "EXAM-own", SARA);
    saved(ctx, "EXAM-omar", OMAR);
    ctx.bank.setJson("exams/EXAM-flat.json", { exam: { examId: "EXAM-flat", title: "قديم", questions: [] }, ownerId: SARA });
    const list = await ownerRead(ctx, "own-exams");
    expect(list.jsonBody).toMatchObject({ ok: true, linked: true });
    expect(list.jsonBody.exams.map(e => e.blobName)).toEqual(["exams/EXAM-own.json"]);
    expect((await owner(ctx, "take-own", { blobName: "exams/EXAM-omar.json" })).jsonBody.code).toBe("EXAM_NOT_FOUND");
    const t = await owner(ctx, "take-own", { blobName: "exams/EXAM-own.json" });
    expect(t.jsonBody.submission).toMatchObject({ teacherId: SARA, sentBy: "owner", status: "pending" });
    expect((await owner(ctx, "publish-submission", publishBody(t.jsonBody.submission.submissionId))).status).toBe(200);
    expect(ownerAudits(ctx).map(a => a.action)).toEqual(["owner.library.own-exam-taken", "owner.library.submission-published"]);
  });
  it("without a linked workspace: nothing listed, and taking is refused", async () => {
    const ctx = setup();
    expect((await ownerRead(ctx, "own-exams")).jsonBody).toEqual({ ok: true, linked: false, exams: [] });
    expect((await owner(ctx, "take-own", { blobName: "exams/x.json" })).jsonBody.code).toBe("NO_LINKED_WORKSPACE");
  });
});

describe("P6-F fails closed", () => {
  it("a submissions index that cannot be understood: the teacher and the owner get 503, nothing is overwritten", async () => {
    const ctx = setup();
    ctx.mem.setJson(LS.INDEX_DOC, { schemaVersion: 1, items: [{ submissionId: "nope" }] });
    expect((await submissionsRoute({ method: "GET", url: "https://x", params: {}, headers: hdr(ctx.sara) }, ctx.deps)).status).toBe(503);
    expect((await send(ctx, ctx.sara, { action: "submit", blobName: saved(ctx, "EXAM-f", SARA) })).status).toBe(503);
    expect((await ownerRead(ctx, "submissions")).status).toBe(503);
    expect(ctx.mem.getJson(LS.INDEX_DOC).items[0].submissionId).toBe("nope");
  });
  it("a listed submission whose frozen exam is missing or not the one listed: 503, never a different exam", async () => {
    const ctx = setup();
    const id = (await send(ctx, ctx.sara, { action: "submit", blobName: saved(ctx, "EXAM-m", SARA) })).jsonBody.submission.submissionId;
    ctx.mem.setJson(LS.submissionName(id), { ...ctx.mem.getJson(LS.submissionName(id)), contentHash: "0".repeat(64) });
    expect((await ownerRead(ctx, "submission", "?id=" + id)).status).toBe(503);
    expect((await owner(ctx, "publish-submission", publishBody(id))).status).toBe(503);
  });
});
