import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { recordedManagedToken } from "./fixtures/managed-session.js";

// Tadris+ P6-E — the owner adds an exam to the library by importing it (owner direction: «لا أريد محررًا، فقط إضافة امتحان جديد للبنك
// عن طريق استيراد الامتحان … وبعد أن يمر مراحل الإعداد ويمر النشر أختار من يراه»). TEST data only; real owner and managed sessions.
//   POST /api/owner-library/import publishes one prepared structured exam as IMP-nnn — the SERVER decides it is ready (the shared
//   finalization authority), embedded raster images only, never twice; it starts in NOBODY's bank («لم يُحدَّد بعد») and reaches
//   teachers only through the owner's audience; it is then listed, opened and assigned by reference exactly like a bundled exam.
//   An imported index or item that cannot be understood fails closed (503); the index is the authority (an unlisted document does
//   not exist); every import is recorded in the owner audit before it happens.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p6e-owner-library-import-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
for (const k of ["BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET", "BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER"]) delete process.env[k];

const { handler: ownerLibrary } = await import("../src/functions/owner-library.js");
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
const LA = cjs("../src/lib/access/library-access.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");
const TEMPLATE = cjs("../../public/templates/structured-exam-template.json");

const OWNER_ID = "own_0011223344556677";
const SARA = "t_00112233445566aa", OMAR = "t_00112233445566bb";

function setup({ mode = "enforce" } = {}) {
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
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const heads = {};
  for (const [name, ago] of [["owner", 0], ["ownerStale", 11 * 60 * 1000]]) {
    const sid = (ago ? "d" : "c").repeat(32);
    mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now, expiresAtMs: now + 7200e3, stepUpAtMs: now - ago });
    heads[name] = { "x-owner-token": createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }, { nowMs: now }).token };
  }
  let clock = Date.parse("2026-11-12T10:00:00.000Z");
  const deps = { getContainer: () => mem.container, container: mem.container, now: () => new Date((clock += 1000)).toISOString(), ensurePublishedAssignmentIndexed: async () => {}, recordAuditEvent: async () => {}, recordEventSafely: async () => {} };
  const tok = id => ({ "x-builder-token": recordedManagedToken(mem, { accountId: id, sid: newTeacherSessionId(), authVersion: 1 }, { nowMs: clock }).token });
  return { mem, deps, ...heads, sara: tok(SARA), omar: tok(OMAR) };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const oreq = (method, action, headers, body = {}) => ({ method, url: "https://x/api/owner-library", params: { action }, headers: hdr(headers), json: async () => body });
const owner = (ctx, action, body, headers = ctx.owner) => ownerLibrary(oreq("POST", action, headers, body), { getContainer: () => ctx.mem.container });
const ownerGet = (ctx, headers = ctx.owner) => ownerLibrary(oreq("GET", "", headers), { getContainer: () => ctx.mem.container });
const catalog = (ctx, headers) => library({ method: "GET", url: "https://x", params: {}, headers: hdr(headers) }, ctx.deps);
const item = (ctx, headers, id) => library({ method: "GET", url: "https://x", params: { id }, headers: hdr(headers) }, ctx.deps);
const bankOf = async (ctx, headers) => (await catalog(ctx, headers)).jsonBody.catalog.map(i => i.libraryItemId);
const assign = (ctx, headers, classId, itemId) => assignments({ method: "POST", url: "http://x/assignments", params: {}, headers: hdr(headers), json: async () => ({ action: "create", classId, title: "واجب", publish: true, libraryRef: { itemId } }) }, ctx.deps);
const audits = ctx => ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
const exam = (change = e => e) => change(JSON.parse(JSON.stringify(TEMPLATE)));
const importBody = (over = {}) => ({ exam: exam(), title: "امتحان مستورد", category: "final", activityType: "exam", description: "وصف", sourceFileName: "exam.json", ...over });
const written = ctx => [...ctx.mem.names("platform/catalog/exam-library-i")];

describe("P6-E import → nobody sees it → the owner chooses who does", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("publishes IMP-001 «لم يُحدَّد بعد»: listed for the owner, in no teacher's bank; once chosen for Sara she lists, opens and assigns it", async () => {
    const r = await owner(ctx, "import", importBody());
    expect(r.status).toBe(200);
    expect(r.jsonBody.item).toEqual({ libraryItemId: "IMP-001", title: "امتحان مستورد", category: "final", activityType: "exam", questionCount: 5, totalMarks: 100, audience: "selected", teachers: [], decided: false, imported: true });
    const listed = (await ownerGet(ctx)).jsonBody.items.find(i => i.libraryItemId === "IMP-001");
    expect(listed).toMatchObject({ title: "امتحان مستورد", audience: "selected", teachers: [], decided: false, imported: true, activityType: "exam", questionCount: 5 });
    expect(await bankOf(ctx, ctx.sara)).not.toContain("IMP-001");
    expect((await item(ctx, ctx.sara, "IMP-001")).status).toBe(404);
    expect((await assign(ctx, ctx.sara, "cA", "IMP-001")).jsonBody.code).toBe("LIBRARY_ITEM_NOT_FOUND");

    expect((await owner(ctx, "set-audience", { itemId: "IMP-001", audience: "selected", teachers: [SARA] })).status).toBe(200);
    expect(await bankOf(ctx, ctx.sara)).toContain("IMP-001");
    expect(await bankOf(ctx, ctx.omar)).not.toContain("IMP-001");
    const opened = await item(ctx, ctx.sara, "IMP-001");
    expect(opened.status).toBe(200);
    expect(opened.jsonBody.item.examSnapshot).toMatchObject({ examId: "LIB-IMP-001", title: "امتحان مستورد", status: "final", totalMarks: 100 });
    expect(opened.jsonBody.item.examSnapshot.sections.map(s => s.id)).toEqual(["core", "infra"]);
    expect((await item(ctx, ctx.omar, "IMP-001")).status).toBe(404);
    const a = await assign(ctx, ctx.sara, "cA", "IMP-001");
    expect(a.status).toBe(200);
    const stored = ctx.mem.names("platform/assignments/").map(n => ctx.mem.getJson(n)).find(x => x && x.source);
    expect(stored.source).toMatchObject({ kind: "library", itemId: "IMP-001" });
    expect(stored.examSnapshot.sections[0].questions[0].answer).toEqual({ correctOptionIndex: 1 });   // the server's own copy, keys included
    expect(stored.totalMarks).toBe(100);
  });

  it("the audit records the import before it happens (no exam body), and the next import is IMP-002 with a new catalog ETag", async () => {
    const before = (await catalog(ctx, { ...ctx.sara })).headers.ETag;
    await owner(ctx, "import", importBody());
    await owner(ctx, "set-audience", { itemId: "IMP-001", audience: "all" });
    const mid = (await catalog(ctx, ctx.sara)).headers.ETag;
    expect(mid).not.toBe(before);
    const r2 = await owner(ctx, "import", importBody({ exam: exam(e => { e.sections[0].questions[0].text = "سؤال آخر"; return e; }), title: "الثاني", activityType: "training" }));
    expect([r2.status, r2.jsonBody.item.libraryItemId, r2.jsonBody.item.activityType]).toEqual([200, "IMP-002", "training"]);
    const rec = audits(ctx).filter(x => x.action === "owner.library.item-imported");
    expect(rec.map(x => [x.targetId, x.targetLabel, x.details.questionCount, x.details.activityType])).toEqual([["IMP-001", "امتحان مستورد", 5, "exam"], ["IMP-002", "الثاني", 5, "training"]]);
    expect(JSON.stringify(rec)).not.toContain("correctOptionIndex");
  });
});

describe("P6-E an imported exam follows its audience for EVERY session — also where the bundled library is not narrowed", () => {
  it("before enforcement (legacy / observe): the whole bundled library as today, but an imported exam only for its audience", async () => {
    for (const mode of ["legacy", "observe"]) {
      const ctx = setup({ mode });
      await owner(ctx, "import", importBody());
      const sara = await bankOf(ctx, ctx.sara);
      expect(sara).toContain("T05");
      expect(sara).not.toContain("IMP-001");
      expect((await item(ctx, ctx.sara, "IMP-001")).status).toBe(404);
      expect((await assign(ctx, ctx.sara, "cA", "IMP-001")).jsonBody.code).toBe("LIBRARY_ITEM_NOT_FOUND");
      await owner(ctx, "set-audience", { itemId: "IMP-001", audience: "selected", teachers: [SARA] });
      expect(await bankOf(ctx, ctx.sara)).toContain("IMP-001");
      expect(await bankOf(ctx, ctx.omar)).not.toContain("IMP-001");
      expect((await assign(ctx, ctx.sara, "cA", "IMP-001")).status).toBe(200);
      expect((await assign(ctx, ctx.omar, "cB", "IMP-001")).status).toBe(404);
    }
  });
  it("an identity that predates the console (no account) sees an imported exam only when it is «for all teachers»", async () => {
    const ctx = setup();
    await owner(ctx, "import", importBody());
    await owner(ctx, "set-audience", { itemId: "IMP-001", audience: "selected", teachers: [SARA] });
    // the shared-password identity exists only while no owner does (P2-B): the records stay, the owner marker is removed
    ctx.mem.store.delete(BOOTSTRAP_MARKER);
    resetOperatorGateCache();
    const legacy = { "x-builder-token": createBuilderToken("teacher") };
    expect(await bankOf(ctx, legacy)).not.toContain("IMP-001");
    expect((await item(ctx, legacy, "IMP-001")).status).toBe(404);
    await LA.mutateAudience(ctx.mem.container, doc => { doc.items["IMP-001"] = { audience: "all", teachers: [], updatedAt: "x", updatedBy: "owner:x" }; });
    expect(await bankOf(ctx, legacy)).toContain("IMP-001");
    expect((await item(ctx, legacy, "IMP-001")).status).toBe(200);
  });
  it("an audience that cannot be read: an imported exam is refused (503) even before enforcement; the bundled library is unaffected", async () => {
    const ctx = setup({ mode: "observe" });
    await owner(ctx, "import", importBody());
    ctx.mem.setJson(LA.AUDIENCE_DOC, { schemaVersion: 2 });
    expect((await catalog(ctx, ctx.sara)).status).toBe(503);
    expect((await item(ctx, ctx.sara, "IMP-001")).status).toBe(503);
    expect((await assign(ctx, ctx.sara, "cA", "IMP-001")).status).toBe(503);
    expect((await item(ctx, ctx.sara, "T05")).status).toBe(200);
  });
});

describe("P6-E the server decides the exam is ready — refusals write nothing", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });
  const refused = async (body, status, code, headers) => {
    const r = await owner(ctx, "import", body, headers);
    expect([r.status, r.jsonBody.code]).toEqual([status, code]);
    expect(written(ctx)).toEqual([]);
    return r;
  };

  it("needs a recent second-factor check", async () => { await refused(importBody(), 403, "STEP_UP_REQUIRED", ctx.ownerStale); });
  it("an exam the finalization authority would not finalize (a missing answer key) → 422 with counts only", async () => {
    const r = await refused(importBody({ exam: exam(e => { delete e.sections[0].questions[0].answer; return e; }) }), 422, "EXAM_NOT_READY");
    expect(r.jsonBody.finalization.canFinalize).toBe(false);
  });
  it("a linked or SVG image is refused; an embedded raster image is accepted", async () => {
    const withImage = url => importBody({ exam: exam(e => { e.sections[0].questions[0].image = { exists: true, visible: true, assets: [{ dataUrl: url }] }; return e; }) });
    await refused(withImage("https://evil.example/x.png"), 400, "IMAGE_UNSAFE");
    await refused(withImage("data:image/svg+xml;base64,PHN2Zz4="), 400, "IMAGE_UNSAFE");
    expect((await owner(ctx, "import", withImage("data:image/png;base64,iVBORw0KGgo="))).status).toBe(200);
  });
  it("not a structured exam, no title, no category, no activity type", async () => {
    await refused(importBody({ exam: { title: "x", questions: [] } }), 400, "EXAM_INVALID");
    await refused(importBody({ exam: null }), 400, "EXAM_INVALID");
    await refused(importBody({ title: "  " }), 400, "TITLE_REQUIRED");
    await refused(importBody({ category: "Bad Category!" }), 400, "CATEGORY_INVALID");
    await refused(importBody({ activityType: "quiz" }), 400, "ACTIVITY_TYPE_INVALID");
  });
  it("the same exam twice → 409 naming the exam already in the bank", async () => {
    expect((await owner(ctx, "import", importBody())).status).toBe(200);
    const again = await owner(ctx, "import", importBody({ title: "عنوان آخر" }));
    expect([again.status, again.jsonBody.code, again.jsonBody.libraryItemId]).toEqual([409, "LIBRARY_ITEM_DUPLICATE", "IMP-001"]);
    expect(ctx.mem.getJson(IMP.INDEX_DOC).items.length).toBe(1);
  });
  it("only the owner: a teacher token is not an owner session", async () => {
    const r = await ownerLibrary(oreq("POST", "import", ctx.sara, importBody()), { getContainer: () => ctx.mem.container });
    expect(r.status).toBe(401);
    expect(written(ctx)).toEqual([]);
  });
});

describe("P6-E the index is the authority, and what cannot be understood fails closed", () => {
  let ctx;
  beforeEach(async () => { ctx = setup(); await owner(ctx, "import", importBody()); await owner(ctx, "set-audience", { itemId: "IMP-001", audience: "all" }); });

  it("an index that cannot be understood: catalog, imported item, owner list and audience change 503 — a bundled item still opens", async () => {
    ctx.mem.setJson(IMP.INDEX_DOC, { schemaVersion: 1, items: [{ libraryItemId: "../x" }] });
    expect((await catalog(ctx, ctx.sara)).status).toBe(503);
    expect((await item(ctx, ctx.sara, "IMP-001")).status).toBe(503);
    expect((await assign(ctx, ctx.sara, "cA", "IMP-001")).status).toBe(503);
    expect((await ownerGet(ctx)).status).toBe(503);
    expect((await owner(ctx, "set-audience", { itemId: "IMP-001", audience: "all" })).status).toBe(503);
    expect((await owner(ctx, "import", importBody({ exam: exam(e => { e.title = "x"; e.sections[0].title = "y"; return e; }) }))).status).toBe(503);
    expect((await item(ctx, ctx.sara, "F01")).status).toBe(200);
    expect(ctx.mem.getJson(IMP.INDEX_DOC).items[0].libraryItemId).toBe("../x");   // never overwritten
  });
  it("a listed item whose document is missing or not the one listed fails closed; an unlisted document does not exist", async () => {
    ctx.mem.setJson(IMP.itemName("IMP-009"), { ...ctx.mem.getJson(IMP.itemName("IMP-001")), libraryItemId: "IMP-009" });
    // even with an audience «for all teachers» (written directly: the owner's route refuses an unknown exam), it does not exist
    expect((await owner(ctx, "set-audience", { itemId: "IMP-009", audience: "all" })).jsonBody.code).toBe("LIBRARY_ITEM_NOT_FOUND");
    await LA.mutateAudience(ctx.mem.container, doc => { doc.items["IMP-009"] = { audience: "all", teachers: [], updatedAt: "x", updatedBy: "owner:x" }; });
    expect((await item(ctx, ctx.sara, "IMP-009")).status).toBe(404);
    expect((await assign(ctx, ctx.sara, "cA", "IMP-009")).jsonBody.code).toBe("LIBRARY_ITEM_NOT_FOUND");
    expect(await bankOf(ctx, ctx.sara)).not.toContain("IMP-009");
    expect((await ownerGet(ctx)).jsonBody.items.map(i => i.libraryItemId)).not.toContain("IMP-009");
    IMP.resetImportedLibraryCacheForTests();
    ctx.mem.setJson(IMP.itemName("IMP-001"), { ...ctx.mem.getJson(IMP.itemName("IMP-001")), contentHash: "0".repeat(64) });
    expect((await item(ctx, ctx.sara, "IMP-001")).status).toBe(503);
    ctx.mem.store.delete(IMP.itemName("IMP-001"));
    expect((await item(ctx, ctx.sara, "IMP-001")).status).toBe(503);
  });
  it("an id already held by an unlisted document is skipped (recorded as not applied); the exam is published under the next id", async () => {
    ctx.mem.setJson(IMP.itemName("IMP-002"), { orphan: true });
    const r = await owner(ctx, "import", importBody({ exam: exam(e => { e.sections[0].questions[0].text = "جديد"; return e; }) }));
    expect([r.status, r.jsonBody.item.libraryItemId]).toEqual([200, "IMP-003"]);
    expect(ctx.mem.getJson(IMP.itemName("IMP-002"))).toEqual({ orphan: true });
    const actions = audits(ctx).map(a => [a.action, a.targetId]).filter(([a]) => a.startsWith("owner.library.item-imported"));
    expect(actions).toEqual([["owner.library.item-imported", "IMP-001"], ["owner.library.item-imported", "IMP-002"], ["owner.library.item-imported.not-applied", "IMP-002"], ["owner.library.item-imported", "IMP-003"]]);
  });
});
