// Tadris+ P6-F — a picture uploaded in the builder reaches the library. The builder stores it as a BANK asset (its durable identity:
// { id, origin: "bank", blobName }), and every payload that delivers it mints a fresh signed URL (bank-asset-hydrate.js). Before P6-F
// the library route signed only the bundled library's protected pictures (P5-C deliveryCopy), so an exam a teacher built with a picture
// reached the library — and every teacher opening it — without its picture. TEST data only.
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
process.env.BANK_SETUP_KEY = "p6f-library-bank-images-root-secret";
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

const bankAsset = { id: "img-1", origin: "bank", blobName: "question-images/t_00112233445566aa/img-1.png", contentType: "image/png" };
const withPicture = () => exam(e => { e.sections[0].questions[0].image = { exists: true, visible: true, assets: [bankAsset] }; return e; });

describe("P6-F a builder picture (bank asset) in a library exam is delivered with a signed URL", () => {
  it("the library item serves the picture as a fresh signed /api/question-image URL; the stored item keeps the durable identity only", async () => {
    const ctx = setup();
    const r = await owner(ctx, "import", importBody({ exam: withPicture() }));
    expect(r.status).toBe(200);
    await owner(ctx, "set-audience", { itemId: "IMP-001", audience: "all" });
    const served = await item(ctx, ctx.sara, "IMP-001");
    expect(served.status).toBe(200);
    const asset = served.jsonBody.item.examSnapshot.sections[0].questions[0].image.assets[0];
    expect(asset).toMatchObject({ id: "img-1", origin: "bank", blobName: bankAsset.blobName });
    expect(String(asset.dataUrl || "")).toMatch(/^\/api\/question-image\?blob=question-images%2Ft_00112233445566aa%2Fimg-1\.png&exp=\d+&sig=/);
    const stored = ctx.mem.getJson(IMP.itemName("IMP-001")).examSnapshot.sections[0].questions[0].image.assets[0];
    expect(stored).toEqual(bankAsset);                                            // nothing expiring is ever stored
  });
  it("the item's ETag differs from the unsigned item's, so a cached copy without a picture is never confirmed by a 304", async () => {
    const ctx = setup();
    await owner(ctx, "import", importBody({ exam: withPicture() }));
    await owner(ctx, "set-audience", { itemId: "IMP-001", audience: "all" });
    const entry = await IMP.importedItemEntry(ctx.mem.container, "IMP-001", {});
    const served = await item(ctx, ctx.sara, "IMP-001");
    expect(served.headers.ETag).not.toBe(entry.etag);
  });
});
