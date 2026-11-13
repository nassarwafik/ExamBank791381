// Tadris+ P6-G — the teacher's agreement to the platform's use of a sent exam, and the owner's edits before publishing
// (docs/enterprise-library-consent-owner-edit-p6g.md; owner direction: «موافق، ابدأ بالبندين عاليي الأولوية»). TEST data only.
//   a teacher sends only after agreeing to the CURRENT text the server holds; the version and the moment are stored; an exam sent
//   without it is never published or copied (the owner declines it);
//   the owner copies a sent exam into their own teacher workspace (P4-D), edits it with the builder, and publishes THAT copy for the
//   submission: the teacher's frozen exam is unchanged, copying again never overwrites the owner's edits, the server reads the copy itself.
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { recordedManagedToken } from "./fixtures/managed-session.js";

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p6g-library-consent-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: ownerLibrary } = await import("../src/functions/owner-library.js");
const { handler: submissionsRoute } = await import("../src/functions/library-submissions.js");
const { createOwnerToken } = await import("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");
const IMP = cjs("../src/lib/exam-library-imported.js");
const LS = cjs("../src/lib/library-submissions.js");
const { canonicalizeExamContent } = cjs("../src/lib/exam-canonical.js");
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
const ownerRead = (ctx, action, query = "", headers = ctx.owner) => ownerLibrary({ method: "GET", url: "https://x/api/owner-library/" + action + query, params: { action }, headers: hdr(headers), json: async () => ({}) }, odeps(ctx));
const agreed = body => (body && body.action === "submit" && !("consentVersion" in body) ? { ...body, consentVersion: LS.CONSENT.version } : body);   // a teacher who agreed (unless the test says otherwise)
const send = (ctx, headers, body) => submissionsRoute({ method: "POST", url: "https://x/api/library-submissions", params: {}, headers: hdr(headers), json: async () => agreed(body) }, { ...ctx.deps, recordAuditEvent: undefined, ...(ctx.extra || {}) });
const mine = async (ctx, headers) => (await submissionsRoute({ method: "GET", url: "https://x/api/library-submissions", params: {}, headers: hdr(headers) }, { ...ctx.deps, ...(ctx.extra || {}) })).jsonBody.submissions;
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
// a submission written before P6-G: listed and frozen exactly like one, without the agreement
function legacySubmission(ctx, { id = "sub_" + "a".repeat(20), teacherId = SARA, blob } = {}) {
  const e = exam(); e.examId = "EXAM-old"; e.title = "امتحان قديم";
  const prepared = { snapshot: e, contentHash: "b".repeat(64) };
  ctx.mem.setJson(LS.submissionName(id), { schemaVersion: 1, submissionId: id, teacherId, savedExamBlob: blob, lineage: LS.lineageOf(teacherId, blob), contentHash: prepared.contentHash, governed: false, sentBy: "teacher", submittedAt: "2026-11-13T09:00:00.000Z", examSnapshot: e });
  ctx.mem.setJson(LS.INDEX_DOC, { schemaVersion: 1, items: [{ submissionId: id, teacherId, teacherName: "t.sara", savedExamBlob: blob, lineage: LS.lineageOf(teacherId, blob), title: "امتحان قديم", questionCount: 5, totalMarks: 10, contentHash: prepared.contentHash, governed: false, sentBy: "teacher", submittedAt: "2026-11-13T09:00:00.000Z", status: "pending" }] });
  return id;
}
const sendNow = async (ctx, id = "EXAM-sara-1", change) => (await send(ctx, ctx.sara, { action: "submit", blobName: saved(ctx, id, SARA, change) })).jsonBody.submission.submissionId;
const copyAudits = ctx => ownerAudits(ctx).filter(a => a.action === "owner.library.submission-copied");

describe("P6-G the teacher agrees to the platform's use of the exam before sending it", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("the teacher's page receives the agreement's text and version from the server", async () => {
    const r = await submissionsRoute({ method: "GET", url: "https://x/api/library-submissions", params: {}, headers: hdr(ctx.sara) }, ctx.deps);
    expect(r.jsonBody.consent).toEqual({ version: LS.CONSENT.version, text: LS.CONSENT.text });
    expect(LS.CONSENT.text).toContain("أُقرّ");
    expect(Object.isFrozen(LS.CONSENT)).toBe(true);
  });

  it("without the agreement — or with any version but the current one — nothing is read, written or recorded", async () => {
    const blob = saved(ctx, "EXAM-nc", SARA);
    for (const consentVersion of [undefined, "", "library-use-v0", true, LS.CONSENT.version + " "]) {
      const r = await send(ctx, ctx.sara, { action: "submit", blobName: blob, consentVersion });
      expect([r.status, r.jsonBody.code]).toEqual([400, "CONSENT_REQUIRED"]);
      expect(r.jsonBody.consent).toEqual({ version: LS.CONSENT.version, text: LS.CONSENT.text });
    }
    expect(ctx.mem.names(LS.SUBMISSION_PREFIX)).toEqual([]);
    expect(ctx.mem.getJson(LS.INDEX_DOC)).toBeNull();
    expect(teacherAudits(ctx)).toEqual([]);
  });

  it("with it: the version and the moment are stored with the frozen exam and its row, recorded in the teacher's log, shown to the owner", async () => {
    const id = await sendNow(ctx);
    const doc = ctx.mem.getJson(LS.submissionName(id)), row = ctx.mem.getJson(LS.INDEX_DOC).items[0];
    expect(doc.consent).toEqual({ version: LS.CONSENT.version, at: row.submittedAt });
    expect(row.consent).toEqual(doc.consent);
    expect(teacherAudits(ctx)[0].details.consentVersion).toBe(LS.CONSENT.version);
    expect((await ownerRead(ctx, "submissions")).jsonBody.submissions[0]).toMatchObject({ consented: true, consentVersion: LS.CONSENT.version, consentedAt: row.submittedAt });
    expect((await ownerRead(ctx, "submission", "?id=" + id)).jsonBody.consentText).toBe(LS.CONSENT.text);
  });

  it("an exam sent before the agreement existed is never published or copied — the owner declines it; the owner's own exam needs none", async () => {
    const c2 = setup({ linked: OMAR });
    const id = legacySubmission(c2, { blob: saved(c2, "EXAM-old", SARA) });
    expect((await ownerRead(c2, "submissions")).jsonBody.submissions[0]).toMatchObject({ submissionId: id, consented: false });
    expect((await ownerRead(c2, "submission", "?id=" + id)).jsonBody.consentText).toBeUndefined();
    const p = await owner(c2, "publish-submission", publishBody(id));
    expect([p.status, p.jsonBody.code]).toEqual([409, "CONSENT_MISSING"]);
    expect((await owner(c2, "copy-submission", { submissionId: id })).jsonBody.code).toBe("CONSENT_MISSING");
    expect(c2.mem.names(IMP.ITEM_PREFIX)).toEqual([]);
    expect(c2.bank.names("exams/EXAM-lib-")).toEqual([]);
    expect(ownerAudits(c2)).toEqual([]);                                                  // refused before anything is recorded
    expect((await owner(c2, "decline-submission", { submissionId: id, reason: "أعد إرساله مع الإقرار" })).status).toBe(200);
    // the owner's own exam (their workspace, take-own): published without a teacher's agreement
    saved(c2, "EXAM-mine", OMAR);
    const t = await owner(c2, "take-own", { blobName: "exams/EXAM-mine.json" });
    expect(t.jsonBody.submission).toMatchObject({ sentBy: "owner", consented: true });
    expect((await owner(c2, "publish-submission", publishBody(t.jsonBody.submission.submissionId))).status).toBe(200);
  });
});

describe("P6-G the owner edits a sent exam in their own workspace, then publishes that copy for the submission", () => {
  let ctx;
  beforeEach(() => { ctx = setup({ linked: OMAR }); });   // the owner's workspace is OMAR's teacher account (P4-D)

  it("copy: a draft in the owner's workspace, owned by it, at a place fixed by the submission; the teacher's frozen exam unchanged; recorded first", async () => {
    const id = await sendNow(ctx);
    const frozen = JSON.stringify(ctx.mem.getJson(LS.submissionName(id)));
    expect((await owner(ctx, "copy-submission", { submissionId: id }, ctx.ownerStale)).jsonBody.code).toBe("STEP_UP_REQUIRED");
    const c = await owner(ctx, "copy-submission", { submissionId: id });
    expect([c.status, c.jsonBody.code]).toEqual([200, undefined]);
    const blob = LS.ownerCopyBlobOf(id);
    expect(c.jsonBody).toMatchObject({ ok: true, created: true, ownerCopy: { blobName: blob, title: "امتحان EXAM-sara-1" } });
    expect(blob).toBe("exams/EXAM-lib-" + id.slice(4) + ".json");
    const copy = ctx.bank.getJson(blob);
    expect(copy).toMatchObject({ kind: "saved-exam", ownerId: OMAR, exam: { examId: "EXAM-lib-" + id.slice(4), status: "draft", title: "امتحان EXAM-sara-1" } });
    expect(copy.exam.sections).toEqual(canonicalizeExamContent(JSON.parse(frozen).examSnapshot).sections);   // the builder's canonical form of the same exam
    expect(JSON.stringify(ctx.mem.getJson(LS.submissionName(id)))).toBe(frozen);
    expect(ctx.mem.getJson(LS.INDEX_DOC).items[0]).toMatchObject({ status: "pending", ownerCopy: { blobName: blob } });
    expect(copyAudits(ctx).map(a => [a.targetId, a.details.teacherId, a.details.workspace, a.details.blobName])).toEqual([[id, SARA, OMAR, blob]]);
    // it is the owner's workspace's exam: listed there, marked as a copy; never taken as a new exam of the owner
    const own = (await ownerRead(ctx, "own-exams")).jsonBody.exams.find(e => e.blobName === blob);
    expect(own).toMatchObject({ ownerCopyOf: id });
    expect((await owner(ctx, "take-own", { blobName: blob })).jsonBody.code).toBe("OWNER_COPY_OF_SUBMISSION");
  });

  it("copying again returns the same copy and NEVER overwrites the owner's edits", async () => {
    const id = await sendNow(ctx);
    await owner(ctx, "copy-submission", { submissionId: id });
    const blob = LS.ownerCopyBlobOf(id), edited = ctx.bank.getJson(blob);
    edited.exam.sections[0].questions[0].text = "نص صحّحه المالك";
    ctx.bank.setJson(blob, edited);
    const again = await owner(ctx, "copy-submission", { submissionId: id });
    expect([again.status, again.jsonBody.created]).toEqual([200, false]);
    expect(ctx.bank.getJson(blob).exam.sections[0].questions[0].text).toBe("نص صحّحه المالك");
    expect(ctx.bank.names("exams/EXAM-lib-")).toEqual([blob]);
  });

  it("the review shows the copy as it is now; publishing it: the edited exam is published FOR the submission, the teacher sees «بتعديلات من المالك»", async () => {
    const id = await sendNow(ctx);
    await owner(ctx, "copy-submission", { submissionId: id });
    const blob = LS.ownerCopyBlobOf(id), edited = ctx.bank.getJson(blob);
    edited.exam.sections[0].questions[0].text = "نص صحّحه المالك";
    ctx.bank.setJson(blob, edited);
    const one = (await ownerRead(ctx, "submission", "?id=" + id)).jsonBody;
    expect(one.exam.sections[0].questions[0].text).toBe(TEMPLATE.sections[0].questions[0].text);   // what the teacher sent
    expect(one.ownerCopy).toMatchObject({ blobName: blob, linked: true, exists: true, finalization: { canFinalize: true } });
    expect(one.ownerCopy.exam.sections[0].questions[0].text).toBe("نص صحّحه المالك");

    const p = await owner(ctx, "publish-submission", publishBody(id, { fromOwnerCopy: true }));
    expect(p.status).toBe(200);
    const item = ctx.mem.getJson(IMP.itemName(p.jsonBody.item.libraryItemId));
    expect(item.examSnapshot.sections[0].questions[0].text).toBe("نص صحّحه المالك");
    expect(item.source).toEqual({ kind: "teacher-submission", submissionId: id, editedByOwner: true });
    expect(JSON.stringify(item)).not.toContain(SARA);
    expect(JSON.stringify(item)).not.toContain(OMAR);
    expect((await mine(ctx, ctx.sara))[0]).toMatchObject({ submissionId: id, status: "published", editedByOwner: true });
    const audit = ownerAudits(ctx).find(a => a.action === "owner.library.submission-published");
    expect(audit.details).toMatchObject({ submissionId: id, editedByOwner: true });
    // the teacher's own publication of what they sent says nothing of the owner
    const c2 = setup({ linked: OMAR });
    const id2 = await sendNow(c2, "EXAM-plain");
    await owner(c2, "publish-submission", publishBody(id2));
    expect((await mine(c2, c2.sara))[0].editedByOwner).toBeUndefined();
  });

  it("the edited copy must be ready too (the same server authority): one the owner's edit broke is refused, then published once fixed", async () => {
    const ok = await sendNow(ctx, "EXAM-fix");
    await owner(ctx, "copy-submission", { submissionId: ok });
    const blob = LS.ownerCopyBlobOf(ok), broken = ctx.bank.getJson(blob);
    delete broken.exam.sections[0].questions[0].answer;                                // the owner's edit breaks it
    ctx.bank.setJson(blob, broken);
    expect((await ownerRead(ctx, "submission", "?id=" + ok)).jsonBody.ownerCopy.finalization.canFinalize).toBe(false);
    const r = await owner(ctx, "publish-submission", publishBody(ok, { fromOwnerCopy: true }));
    expect([r.status, r.jsonBody.code]).toEqual([422, "EXAM_NOT_READY"]);
    expect(r.jsonBody.blockers.length).toBeGreaterThan(0);
    expect(ctx.mem.names(IMP.ITEM_PREFIX)).toEqual([]);
    expect(ctx.mem.getJson(LS.INDEX_DOC).items.find(s => s.submissionId === ok).status).toBe("pending");
    broken.exam.sections[0].questions[0].answer = TEMPLATE.sections[0].questions[0].answer;   // fixed in the builder
    ctx.bank.setJson(blob, broken);
    expect((await owner(ctx, "publish-submission", publishBody(ok, { fromOwnerCopy: true }))).status).toBe(200);
  });

  it("the server reads the copy itself from the owner's workspace: no copy, a removed copy, another owner's file or no workspace are refused", async () => {
    const id = await sendNow(ctx);
    expect((await owner(ctx, "publish-submission", publishBody(id, { fromOwnerCopy: true }))).jsonBody.code).toBe("OWNER_COPY_MISSING");
    await owner(ctx, "copy-submission", { submissionId: id });
    const blob = LS.ownerCopyBlobOf(id), copy = ctx.bank.getJson(blob);
    ctx.bank.setJson(blob, { ...copy, ownerId: SARA });                                // not the owner's workspace's any more
    expect((await owner(ctx, "publish-submission", publishBody(id, { fromOwnerCopy: true }))).jsonBody.code).toBe("EXAM_NOT_FOUND");
    expect((await ownerRead(ctx, "submission", "?id=" + id)).jsonBody.ownerCopy).toEqual({ blobName: blob, linked: true, exists: false });
    expect((await owner(ctx, "copy-submission", { submissionId: id })).jsonBody.code).toBe("OWNER_COPY_CONFLICT");   // never written over
    expect(ctx.bank.getJson(blob).ownerId).toBe(SARA);
    // no linked workspace
    const c2 = setup();
    const id2 = await sendNow(c2);
    expect((await owner(c2, "copy-submission", { submissionId: id2 })).jsonBody.code).toBe("NO_LINKED_WORKSPACE");
    expect((await owner(c2, "publish-submission", publishBody(id2, { fromOwnerCopy: true }))).jsonBody.code).toBe("NO_LINKED_WORKSPACE");
    expect(c2.bank.names("exams/EXAM-lib-")).toEqual([]);
  });

  it("a submission no longer pending (withdrawn while the owner edits) is not published from the copy; the copy stays in the owner's workspace", async () => {
    const id = await sendNow(ctx);
    await owner(ctx, "copy-submission", { submissionId: id });
    await send(ctx, ctx.sara, { action: "withdraw", submissionId: id });
    expect((await owner(ctx, "publish-submission", publishBody(id, { fromOwnerCopy: true }))).jsonBody.code).toBe("SUBMISSION_NOT_PENDING");
    expect((await owner(ctx, "copy-submission", { submissionId: id })).jsonBody.code).toBe("SUBMISSION_NOT_PENDING");
    expect(ctx.mem.names(IMP.ITEM_PREFIX)).toEqual([]);
    expect(ctx.bank.getJson(LS.ownerCopyBlobOf(id)).ownerId).toBe(OMAR);
  });

  it("an updated version the owner edited replaces the published one with the same audience (decision (أ) unchanged)", async () => {
    const first = await sendNow(ctx, "EXAM-series");
    const p1 = await owner(ctx, "publish-submission", publishBody(first));
    await owner(ctx, "set-audience", { itemId: p1.jsonBody.item.libraryItemId, audience: "selected", teachers: [SARA] });
    const second = await sendNow(ctx, "EXAM-series", e => { e.sections[0].questions[0].text = "نسخة ثانية"; return e; });
    await owner(ctx, "copy-submission", { submissionId: second });
    const blob = LS.ownerCopyBlobOf(second), copy = ctx.bank.getJson(blob);
    copy.exam.sections[0].questions[0].text = "نسخة ثانية بتعديل المالك";
    ctx.bank.setJson(blob, copy);
    const p2 = await owner(ctx, "publish-submission", publishBody(second, { fromOwnerCopy: true }));
    expect(p2.jsonBody).toMatchObject({ replaces: p1.jsonBody.item.libraryItemId, replacementPending: false });
    const doc = ctx.mem.getJson("platform/catalog/exam-library-audience.json");
    expect(doc.items[p2.jsonBody.item.libraryItemId]).toMatchObject({ audience: "selected", teachers: [SARA] });
    expect(doc.items[p1.jsonBody.item.libraryItemId]).toMatchObject({ audience: "selected", teachers: [] });
  });

  it("the owner's own exam is edited in the workspace directly: copying it is refused", async () => {
    saved(ctx, "EXAM-mine", OMAR);
    const t = await owner(ctx, "take-own", { blobName: "exams/EXAM-mine.json" });
    expect((await owner(ctx, "copy-submission", { submissionId: t.jsonBody.submission.submissionId })).jsonBody.code).toBe("OWN_EXAM");
  });
});

describe("P6-G fails closed", () => {
  it("a row whose agreement or copy cannot be understood makes the index unreadable: 503, nothing overwritten", async () => {
    for (const bad of [{ consent: { version: "library-use-v0", at: "2026-11-13T09:00:00.000Z" } }, { consent: { version: LS.CONSENT.version, at: "x" } }, { consent: "yes" },
      { ownerCopy: { blobName: "../x.json", copiedAt: "2026-11-13T09:00:00.000Z" } }, { ownerCopy: null }]) {
      const ctx = setup({ linked: OMAR });
      const id = legacySubmission(ctx, { blob: saved(ctx, "EXAM-old", SARA) });
      const index = ctx.mem.getJson(LS.INDEX_DOC);
      Object.assign(index.items[0], bad);
      ctx.mem.setJson(LS.INDEX_DOC, index);
      expect((await ownerRead(ctx, "submissions")).status).toBe(503);
      expect((await owner(ctx, "copy-submission", { submissionId: id })).status).toBe(503);
      expect((await owner(ctx, "publish-submission", publishBody(id))).status).toBe(503);
      expect(ctx.mem.getJson(LS.INDEX_DOC)).toEqual(index);
      expect(ctx.bank.names("exams/EXAM-lib-")).toEqual([]);
    }
  });
});
