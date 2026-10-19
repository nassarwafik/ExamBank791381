import { describe, it, expect } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { instrumentReadCost } from "./helpers/read-cost.js";
import { createDocCache, loadJsonDocs, loadJsonEntries } from "../src/lib/etag-doc-cache.js";
import { handler as studentHandler } from "../src/functions/manage-students.js";
import { handler as classroomHandler } from "../src/functions/manage-classrooms.js";
import { createPendingGradingReader } from "../src/lib/pending-grading.js";

// Phase S.2 — READ COST of «الصفوف والطلاب» without a new authority. The roster, the classes list, the student profile and the
// pending-grading guard keep reading the AUTHORITATIVE documents (users, classes, assignments, submissions) — never the roster
// index or the class-assignment index — but through the ETag-verified document cache (21H.4): a document whose ETag is unchanged
// is not downloaded again, any change by any writer is. Production builds a new container client per request, so the cache is
// keyed by the container's storage URL (a fixture without a URL keeps one slot per object, as before).
//
// Every test runs each request through a FRESH container object with the same URL (what production does) and counts the
// physical storage operations on the shared in-memory store.

const T0 = "2026-03-01T10:00:00.000Z";
const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), recordAuditEvent: async () => {} };
// One storage URL per in-memory store (as one URL is one storage account container in production); a new client object for
// every request, as production builds.
const URLS = new WeakMap();
let stores = 0;
const urlOf = ctx => { if (!URLS.has(ctx)) URLS.set(ctx, "https://acct.blob.core.windows.net/bank-s2-" + (++stores) + "-" + Math.random().toString(36).slice(2)); return URLS.get(ctx); };
const perRequest = (ctx, url = urlOf(ctx)) => ({ ...ctx.container, url });
const get = (handler, ctx, path, url) => { const container = perRequest(ctx, url); return handler({ method: "GET", url: "https://x" + path, json: async () => ({}) }, { ...AUTH, container, getContainer: () => container }); };

// 2 classes × 12 students, 4 published assignments per class, every student submitted every assignment of their class.
function seed() {
  const s = {}; let n = 0;
  for (const cid of ["c1", "c2"]) {
    const ids = [];
    for (let i = 1; i <= 12; i++) {
      const uid = cid + "s" + i; ids.push(uid); n++;
      s["platform/users/" + uid + ".json"] = { userId: uid, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + uid, firstName: "ط" + i, familyName: "ع" + i, code: String(100000000 + n), identityNumber: String(100000000 + n), lastLoginAt: T0 };
    }
    s["platform/classes/" + cid + ".json"] = { classId: cid, name: "صف " + cid, active: true, status: "active", studentIds: ids, schoolYear: "2026", createdAt: T0, updatedAt: "2026-01-01T00:00:00.000Z" };
    for (let a = 1; a <= 4; a++) {
      const aid = cid + "a" + a;
      s["platform/assignments/" + aid + ".json"] = { assignmentId: aid, classId: cid, status: "published", title: aid, createdAt: T0, dueAt: T0, maxAttempts: 1, totalMarks: 10 };
      for (const uid of ids) s["platform/submissions/" + aid + "/" + uid + ".json"] = { assignmentId: aid, studentId: uid, classId: cid, attempts: [{ attemptNumber: 1, submittedAt: T0, score: a, totalMarks: 10, percentage: a * 10, finalized: true, gradingStatus: "final" }], activeAttempt: null };
    }
  }
  return s;
}

describe("S.2 — the ETag cache follows the storage, not the client object", () => {
  it("two client objects for the same storage URL share entries; another URL never does", async () => {
    const ctx = createMemoryContainer({ "platform/users/a.json": { id: "a" }, "platform/users/b.json": { id: "b" } }), rc = instrumentReadCost(ctx.container), cache = createDocCache();
    await loadJsonDocs(perRequest(ctx), "platform/users/", cache);
    rc.reset();
    const again = await loadJsonDocs(perRequest(ctx), "platform/users/", cache);
    expect(again.stats).toEqual({ listed: 2, cached: 2, downloaded: 0 });
    expect(rc.snapshot().downloads).toBe(0);
    const other = await loadJsonDocs(perRequest(ctx, urlOf(ctx) + "-other"), "platform/users/", cache);
    expect(other.stats.cached).toBe(0);
  });
});

describe("S.2 — selected entries (loadJsonEntries)", () => {
  it("a blob deleted between the listing and its download is null — never the copy cached before — and leaves the cache", async () => {
    const ctx = createMemoryContainer({ "platform/users/a.json": { id: "a" } }), cache = createDocCache(), c = perRequest(ctx);
    await loadJsonDocs(c, "platform/users/", cache);                                // a.json is now cached under its ETag
    const entry = { name: "platform/users/a.json", etag: ctx.store.get("platform/users/a.json").etag };
    await ctx.container.getBlobClient("platform/users/a.json").deleteIfExists();
    expect((await loadJsonEntries(c, [{ ...entry, etag: "listed-before-the-delete" }], cache)).docs).toEqual([null]);
    // the stale copy was dropped: even its old ETag is no longer served
    expect((await loadJsonEntries(perRequest(ctx), [entry], cache)).docs).toEqual([null]);
  });
  it("the same ETag reported quoted by the download and bare by the listing (or the reverse) is one version", async () => {
    const ctx = createMemoryContainer({}), cache = createDocCache(), c = perRequest(ctx);
    let downloads = 0;
    const deps = (listed, served) => ({ listEntries: async () => [{ name: "platform/x/a.json", etag: listed }], downloadJsonWithEtagOrNull: async () => { downloads++; return { value: { v: 1 }, etag: served }; } });
    await loadJsonDocs(c, "platform/x/", cache, deps("0x8D1", '"0x8D1"'));
    expect((await loadJsonDocs(c, "platform/x/", cache, deps("0x8D1", '"0x8D1"'))).stats).toEqual({ listed: 1, cached: 1, downloaded: 0 });
    expect((await loadJsonDocs(c, "platform/x/", cache, deps('"0x8D1"', "0x8D1"))).stats.cached).toBe(1);
    expect((await loadJsonDocs(c, "platform/x/", cache, deps("0x8D2", '"0x8D2"'))).stats.downloaded).toBe(1);   // another version
    expect(downloads).toBe(2);
  });
  it("keeps the entries' order and returns null in place for a missing one", async () => {
    const ctx = createMemoryContainer({ "platform/x/1.json": { n: 1 }, "platform/x/3.json": { n: 3 } }), cache = createDocCache();
    const r = await loadJsonEntries(perRequest(ctx), [{ name: "platform/x/3.json", etag: null }, { name: "platform/x/2.json", etag: null }, { name: "platform/x/1.json", etag: null }], cache);
    expect(r.docs).toEqual([{ n: 3 }, null, { n: 1 }]);
    expect(r.stats).toEqual({ listed: 3, cached: 0, downloaded: 3 });
  });
});

describe("S.2 — the roster read", () => {
  it("a repeated roster read downloads no user and no submission document again, and returns the identical body", async () => {
    const ctx = createMemoryContainer(seed()), rc = instrumentReadCost(ctx.container);
    const first = await get(studentHandler, ctx, "/api/students?classId=c1&includeArchived=1");
    expect(first.jsonBody.students).toHaveLength(12);
    rc.reset();
    const second = await get(studentHandler, ctx, "/api/students?classId=c1&includeArchived=1");
    expect(second.jsonBody).toEqual(first.jsonBody);
    expect(rc.downloadsOf("platform/users/")).toBe(0);                                // was: every user of the platform (24)
    expect(rc.downloadsOf("platform/submissions/")).toBe(0);                          // was: every roster submission (48)
    expect(rc.listsOf("platform/users/")).toBe(1);                                    // the listing still decides membership
  });
  it("switching to another class reuses the users already read (one platform-wide scan per change, not per class)", async () => {
    const ctx = createMemoryContainer(seed()), rc = instrumentReadCost(ctx.container);
    await get(studentHandler, ctx, "/api/students?classId=c1");
    rc.reset();
    const c2 = await get(studentHandler, ctx, "/api/students?classId=c2");
    expect(c2.jsonBody.students.map(s => s.userId).sort()).toEqual(Array.from({ length: 12 }, (_, i) => "c2s" + (i + 1)).sort());
    expect(rc.downloadsOf("platform/users/")).toBe(0);
  });
  it("a change by any writer between two reads is seen: only the changed documents are downloaded again", async () => {
    const ctx = createMemoryContainer(seed()), rc = instrumentReadCost(ctx.container);
    await get(studentHandler, ctx, "/api/students?classId=c1");
    ctx.setJson("platform/users/c1s3.json", { ...ctx.getJson("platform/users/c1s3.json"), firstName: "اسم جديد" });
    ctx.setJson("platform/users/c2s1.json", { ...ctx.getJson("platform/users/c2s1.json"), classId: "c1" });     // moved into c1 elsewhere
    ctx.setJson("platform/submissions/c1a1/c1s5.json", { ...ctx.getJson("platform/submissions/c1a1/c1s5.json"), attempts: [] });
    rc.reset();
    const r = await get(studentHandler, ctx, "/api/students?classId=c1");
    expect(rc.downloadsOf("platform/users/")).toBe(2);
    expect(r.jsonBody.students.find(s => s.userId === "c1s3").firstName).toBe("اسم جديد");
    expect(r.jsonBody.students.some(s => s.userId === "c2s1")).toBe(true);
    expect(r.jsonBody.students.find(s => s.userId === "c1s5").submittedAssignmentsCount).toBe(3);
  });
});

describe("S.2 — the classes list", () => {
  it("a repeated classes read downloads no class document again; another teacher's class stays hidden on both reads", async () => {
    const s = seed();
    s["platform/classes/c1.json"].ownerId = "teacher-1"; s["platform/classes/c2.json"].ownerId = "teacher-2";
    const ctx = createMemoryContainer(s), rc = instrumentReadCost(ctx.container);
    const tenantAuth = { ...AUTH, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1", tenantId: "teacher-1", teacherId: "teacher-1" } }) };
    const read = () => { const container = perRequest(ctx); return classroomHandler({ method: "GET", url: "https://x/api/classrooms", json: async () => ({}) }, { ...tenantAuth, container, getContainer: () => container }); };
    const first = await read();
    rc.reset();
    const second = await read();
    expect(second.jsonBody).toEqual(first.jsonBody);
    expect(rc.downloadsOf("platform/classes/")).toBe(0);
    expect(rc.listsOf("platform/classes/")).toBe(1);
  });
});

describe("S.2 — the student profile", () => {
  it("reads the student's existing submissions only (no probe per assignment of the platform), then nothing again", async () => {
    const ctx = createMemoryContainer(seed()), rc = instrumentReadCost(ctx.container);
    const first = await get(studentHandler, ctx, "/api/students?profileUserId=c1s1");
    expect(first.jsonBody.profile.stats.assigned).toBe(4);
    // each assignment carries ITS OWN submission (c1aN scored N): the selected submissions stay aligned with the assignments
    expect(Object.fromEntries(first.jsonBody.profile.assignments.map(a => [a.assignmentId, a.latestScore]))).toEqual({ c1a1: 1, c1a2: 2, c1a3: 3, c1a4: 4 });
    expect(first.jsonBody.profile.submittedAssignments.map(a => a.assignmentId).sort()).toEqual(["c1a1", "c1a2", "c1a3", "c1a4"]);
    expect(rc.downloadsOf("platform/submissions/")).toBe(4);                          // was: 8 (one probe per assignment, 4 of them 404)
    rc.reset();
    const second = await get(studentHandler, ctx, "/api/students?profileUserId=c1s1");
    expect(second.jsonBody).toEqual(first.jsonBody);
    expect(rc.downloadsOf("platform/submissions/")).toBe(0);
    expect(rc.downloadsOf("platform/assignments/")).toBe(0);
  });
});

describe("S.2 — the pending-grading guard never trusts a stale copy", () => {
  it("an unchanged submission is not downloaded twice; a submission that became «pending review» is seen at once", async () => {
    const ctx = createMemoryContainer(seed()), rc = instrumentReadCost(ctx.container);
    expect(await createPendingGradingReader(perRequest(ctx)).count("c1s2", "c1")).toBe(0);
    rc.reset();
    expect(await createPendingGradingReader(perRequest(ctx)).count("c1s2", "c1")).toBe(0);
    expect(rc.downloadsOf("platform/submissions/")).toBe(0);
    expect(rc.downloadsOf("platform/assignments/")).toBe(0);
    ctx.setJson("platform/submissions/c1a2/c1s2.json", { assignmentId: "c1a2", studentId: "c1s2", classId: "c1", attempts: [{ attemptNumber: 1, submittedAt: T0, score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 4, finalized: false }], activeAttempt: null });
    expect(await createPendingGradingReader(perRequest(ctx)).count("c1s2", "c1")).toBe(1);
  });
  it("a class archive is still refused while a current member has pending work, through the cached users read", async () => {
    const ctx = createMemoryContainer(seed());
    await get(studentHandler, ctx, "/api/students?classId=c1");                      // warms the users cache
    ctx.setJson("platform/submissions/c1a3/c1s7.json", { assignmentId: "c1a3", studentId: "c1s7", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: T0 } });
    const container = perRequest(ctx);
    const r = await classroomHandler({ method: "POST", url: "https://x/api/classrooms", json: async () => ({ action: "archive", classId: "c1" }) }, { ...AUTH, container, getContainer: () => container });
    expect(r.status).toBe(409);
    expect(ctx.getJson("platform/classes/c1.json").status).toBe("active");
  });
});
