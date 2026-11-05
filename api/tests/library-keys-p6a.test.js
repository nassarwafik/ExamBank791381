import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

import { recordedManagedToken } from "./fixtures/managed-session.js";
// Tadris+ P6-A + P6-C (risks S2 / S5, owner decision D8). TEST data only.
//   the exam library carries ANSWER KEYS: one item needs preview (or viewKeys); the keys go only with examLibrary.item.viewKeys —
//   otherwise the item is sanitized like a student's view (answerKeys: false, its own ETag);
//   a library assignment is built BY THE SERVER from `libraryRef` (its frozen copy, keys included) so grading is unchanged and the
//   browser never needs the keys; a teacher who may only assign READY assignments cannot send a snapshot of their own;
//   all of it evaluated like every capability (a managed session while enforcing; legacy-full identities unchanged).
// The first block is the FAIL-FIRST proof: before P6, a preview-only teacher received the keys, and `libraryRef` did not exist.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p6a-library-keys-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: library } = await import("../src/functions/exam-library.js");
const { handler: assignments } = await import("../src/functions/manage-assignments.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { createManagedTeacherToken, newTeacherSessionId } = await import("../src/lib/identity/teacher-token.js");
const { createBuilderToken } = await import("../src/lib/builder-auth.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { libraryItemEntry } = await import("../src/lib/exam-library-store.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");

const SARA = "t_00112233445566aa";
const ITEM = "F01";
const KEY_FIELDS = /"correctOptionIndex"|"correctOptionIndexes"|"correctAnswer"|"answerKey"|"acceptedAnswers"|"correctOrder"|"expected"/;

function setup({ mode = "enforce", preset = "learning-ready-assignments", denies = [] } = {}) {
  resetRevisionCache(); resetOperatorGateCache();
  const mem = createMemoryContainer();
  const { revision } = buildRevision({ accountId: SARA, presetId: preset, presetVersion: 1, denies, createdBy: "owner:x" });
  mem.setJson(revisionName(revision.revisionId), revision);
  mem.setJson(teacherAccountName(SARA), { schemaVersion: 1, accountId: SARA, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: preset, version: 1 } });
  if (mode) mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode });
  mem.setJson("platform/classes/c1.json", { classId: "c1", name: "صف سارة", active: true, status: "active", ownerId: SARA });
  let clock = Date.parse("2026-11-03T10:00:00.000Z");
  const deps = { getContainer: () => mem.container, now: () => new Date((clock += 1000)).toISOString(), ensurePublishedAssignmentIndexed: async () => {}, recordAuditEvent: async () => {}, recordEventSafely: async () => {} };
  const token = recordedManagedToken(mem, { accountId: SARA, sid: newTeacherSessionId(), authVersion: 1 }, { nowMs: clock }).token;
  return { mem, deps, headers: { "x-builder-token": token } };
}
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const getItem = (ctx, id = ITEM, headers = ctx.headers) => library({ method: "GET", url: "https://x", params: { id }, headers: hdr(headers) }, ctx.deps);
const getCatalog = (ctx, headers = ctx.headers) => library({ method: "GET", url: "https://x", params: {}, headers: hdr(headers) }, ctx.deps);
const create = (ctx, body, headers = ctx.headers) => assignments({ method: "POST", url: "http://x/assignments", params: {}, headers: hdr(headers), json: async () => ({ action: "create", classId: "c1", title: "واجب", publish: true, ...body }) }, ctx.deps);
const full = () => JSON.parse(JSON.stringify(libraryItemEntry(ITEM).value.examSnapshot));
const stored = (ctx, r) => ctx.mem.getJson("platform/assignments/" + r.jsonBody.assignment.assignmentId + ".json");

describe("P6 fail-first", () => {
  it("a preview-only teacher (no examLibrary.item.viewKeys) does NOT receive the answer keys", async () => {
    const ctx = setup();
    expect(KEY_FIELDS.test(JSON.stringify(full()))).toBe(true);                 // the library item does carry keys
    const r = await getItem(ctx);
    expect(r.status).toBe(200);
    expect(KEY_FIELDS.test(JSON.stringify(r.jsonBody.item))).toBe(false);
    expect(r.jsonBody.item.answerKeys).toBe(false);
  });
  it("a library assignment is built by the server from `libraryRef` — with the keys, so grading is unchanged", async () => {
    const ctx = setup();
    const r = await create(ctx, { libraryRef: { itemId: ITEM } });
    expect(r.status).toBe(200);
    expect(KEY_FIELDS.test(JSON.stringify(stored(ctx, r).examSnapshot))).toBe(true);
  });
});

describe("P6-A the library's answer keys", () => {
  it("a teacher with viewKeys (full-teaching) receives the keys; the two variants have different ETags", async () => {
    const withKeys = await getItem(setup({ preset: "full-teaching" }));
    const without = await getItem(setup());
    expect(KEY_FIELDS.test(JSON.stringify(withKeys.jsonBody.item))).toBe(true);
    expect(withKeys.jsonBody.item.answerKeys).toBeUndefined();
    expect(without.headers.ETag).not.toBe(withKeys.headers.ETag);
    expect(without.jsonBody.item.examSnapshot.questions.length).toBe(withKeys.jsonBody.item.examSnapshot.questions.length);   // same exam, no keys
  });
  it("a teacher without preview / viewKeys gets no item (the catalog follows `view`)", async () => {
    const ctx = setup({ preset: "learning-only" });
    expect((await getItem(ctx)).jsonBody.code).toBe("CAPABILITY_DENIED");
    expect((await getCatalog(ctx)).jsonBody.code).toBe("CAPABILITY_DENIED");
  });
  it("a teacher with the catalog (view) but neither preview nor viewKeys sees the list, not an item", async () => {
    const ctx = setup({ denies: ["examLibrary.item.preview"] });
    expect((await getCatalog(ctx)).status).toBe(200);
    const r = await getItem(ctx);
    expect([r.status, r.jsonBody.code]).toEqual([403, "CAPABILITY_DENIED"]);
    expect(JSON.stringify(r.jsonBody)).not.toMatch(KEY_FIELDS);
  });
  it("before enforcement nothing changes: a preview-only teacher still gets the keys (legacy / observe)", async () => {
    for (const mode of ["legacy", "observe"]) {
      const r = await getItem(setup({ mode }));
      expect(KEY_FIELDS.test(JSON.stringify(r.jsonBody.item))).toBe(true);
    }
  });
  it("an identity that predates the console (the shared password) is unchanged", async () => {
    const ctx = setup();
    const shared = { "x-builder-token": createBuilderToken("teacher") };
    expect(KEY_FIELDS.test(JSON.stringify((await getItem(ctx, ITEM, shared)).jsonBody.item))).toBe(true);
  });
  it("a revalidation never turns the keyless variant into the keyed one", async () => {
    const ctx = setup();
    const a = await getItem(ctx);
    const b = await library({ method: "GET", url: "https://x", params: { id: ITEM }, headers: hdr({ ...ctx.headers, "if-none-match": a.headers.ETag }) }, ctx.deps);
    expect(b.status).toBe(304);
    const keyed = await getItem(setup({ preset: "full-teaching" }));
    const c = await library({ method: "GET", url: "https://x", params: { id: ITEM }, headers: hdr({ ...ctx.headers, "if-none-match": keyed.headers.ETag }) }, ctx.deps);
    expect(c.status).toBe(200);
    expect(KEY_FIELDS.test(JSON.stringify(c.jsonBody.item))).toBe(false);
  });
});

describe("P6-C library assignments are built by the server (owner decision D8)", () => {
  it("the stored snapshot is exactly the library's (cleaned like any snapshot); a browser snapshot sent alongside is ignored", async () => {
    const ctx = setup({ preset: "full-teaching" });
    const viaRef = await create(ctx, { libraryRef: { itemId: ITEM }, examSnapshot: { title: "tampered", questions: [{ id: "x", type: "mcq", text: "؟", options: ["أ"], correctOptionIndex: 0, marks: 100 }] } });
    const viaSnapshot = await create(ctx, { examSnapshot: full() });                       // the old way, with the keys
    const a = stored(ctx, viaRef), b = stored(ctx, viaSnapshot);
    expect(a.examSnapshot).toEqual(b.examSnapshot);
    expect([a.questionCount, a.totalMarks]).toEqual([b.questionCount, b.totalMarks]);
    expect(a.source).toMatchObject({ kind: "library", itemId: ITEM });
    expect(JSON.stringify(a)).not.toContain("tampered");
  });
  it("an unknown or malformed library item → 404; nothing written", async () => {
    const ctx = setup({ preset: "full-teaching" });
    for (const itemId of ["NOPE99", "../../x", ""]) {
      const r = await create(ctx, { libraryRef: { itemId } });
      expect([r.status, r.jsonBody.code]).toEqual([404, "LIBRARY_ITEM_NOT_FOUND"]);
    }
    expect(ctx.mem.names("platform/assignments/")).toEqual([]);
  });
  it("a READY-assignments-only teacher cannot send a snapshot of their own (enforce); with libraryRef they can", async () => {
    const ctx = setup();
    const own = await create(ctx, { examSnapshot: full() });
    expect([own.status, own.jsonBody.code]).toEqual([403, "READY_ASSIGNMENTS_ONLY"]);
    expect((await create(ctx, { libraryRef: { itemId: ITEM } })).status).toBe(200);
    const legacy = setup({ mode: "legacy" });
    expect((await create(legacy, { examSnapshot: full() })).status).toBe(200);                  // before enforcement: unchanged
  });
});

// Tadris+ P9-B1 — acceptance test #5: the library TEMPLATE is never changed by using it. The library ships with the deployment
// (read-only, cached deep-frozen); assigning it, editing the assignment, and changing the copy a teacher received (what the builder
// does with it) leave the file's bytes, its ETag and what the next teacher receives exactly as they were.
describe("P9-B1 acceptance test #5 — the library template stays unchanged", () => {
  const { readFileSync, readdirSync } = cjs("node:fs");
  const { createHash } = cjs("node:crypto");
  const { join } = cjs("node:path");
  const DATA = join(import.meta.dirname, "..", "src", "data", "exam-library");
  const fileHash = () => createHash("sha256").update(readFileSync(join(DATA, "items", ITEM + ".json"))).digest("hex");

  it("assign by reference, edit the assignment, change the received copy: the item, its ETag and the next assignment are unchanged", async () => {
    const ctx = setup({ preset: "full-teaching" });
    const hash = fileHash();
    const first = await getItem(ctx);
    const original = JSON.stringify(first.jsonBody.item);
    const a1 = await create(ctx, { libraryRef: { itemId: ITEM } });
    const snapshot1 = JSON.stringify(stored(ctx, a1).examSnapshot);
    const upd = await assignments({ method: "POST", url: "http://x/assignments", params: {}, headers: hdr(ctx.headers), json: async () => ({ action: "updateDetails", assignmentId: a1.jsonBody.assignment.assignmentId, title: "عنوان معدّل", instructions: "تعليمات معدّلة" }) }, ctx.deps);
    expect(upd.status).toBe(200);
    // the builder edits what it received: try every way an in-process caller could change it
    const copy = first.jsonBody.item;
    try { copy.title = "معدّل"; copy.sections[0].questions[0].text = "معدّل"; copy.sections[0].questions.push({ id: "x" }); } catch { /* frozen: refused */ }
    const again = await getItem(ctx);
    expect(JSON.stringify(again.jsonBody.item)).toBe(original);
    expect(again.headers.ETag).toBe(first.headers.ETag);
    const a2 = await create(ctx, { libraryRef: { itemId: ITEM } });
    expect(JSON.stringify(stored(ctx, a2).examSnapshot)).toBe(snapshot1);                          // the next assignment: the same template
    expect(stored(ctx, a1).title).toBe("عنوان معدّل");
    expect(fileHash()).toBe(hash);                                                                 // the shipped file, byte for byte
  });

  it("no API module can write the library: no route or library module writes files, and the one asset writer is a build-script helper", () => {
    const SRC = join(import.meta.dirname, "..", "src");
    const files = [...readdirSync(join(SRC, "functions")).map(f => join(SRC, "functions", f)), ...readdirSync(join(SRC, "lib"), { recursive: true }).map(f => join(SRC, "lib", f))]
      .filter(f => f.endsWith(".js") && !f.endsWith(".test.js"));
    const writers = files.filter(f => /\bfs\.(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|rename|renameSync|rm|rmSync|unlink|unlinkSync)\b/.test(readFileSync(f, "utf8")));
    expect(writers.map(f => f.slice(SRC.length + 1))).toEqual(["lib/library-assets.js"]);
    expect(files.filter(f => /require\([^)]*library-assets/.test(readFileSync(f, "utf8")))).toEqual([]);
  });
});
