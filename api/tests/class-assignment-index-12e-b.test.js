import { describe, it, expect } from "vitest";
import {
  INDEX_PREFIX, indexName, normalizeIds, normalizeIndex, readClassIndex, ensurePublishedAssignmentIndexed,
  removePublishedAssignmentFromIndex, bootstrapClassIndex, loadPublishedAssignmentsForClasses
} from "../src/lib/class-assignment-index.js";
import { listJson } from "../src/lib/platform-storage.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { instrumentReadCost } from "./helpers/read-cost.js";

// Phase 12E-B — the per-class PUBLISHED-assignment index, on the REAL in-memory container (real ETag CAS: create-only
// If-None-Match:* and If-Match compare-and-set, with the container's beforeConditionalUpload hook to inject concurrent
// writers / persistent conflicts).

const AP = "platform/assignments/";
const pub = (id, classId, status = "published") => ({ assignmentId: id, classId, status, title: "واجب " + id });
const ready = (classId, ids) => ({ schemaVersion: 1, classId, ready: true, publishedAssignmentIds: ids, updatedAt: "2026-01-01T00:00:00.000Z" });
/** Persistent (or N-times) conflict on one blob: every CAS write observes a changed ETag. */
const conflictOn = (name, times = Infinity) => { let n = 0; return { beforeConditionalUpload: (blob, api) => { if (blob !== name || n >= times) return; n += 1; api.setJson(blob, api.getJson(blob)); } }; };
const seedAssignments = list => Object.fromEntries(list.map(a => [AP + a.assignmentId + ".json", a]));
const load = (ctx, classIds, deps = {}) => loadPublishedAssignmentsForClasses(ctx.container, classIds, deps);

describe("12E-B index — normalization", () => {
  it("(1) ids: strings only, trimmed, safe ids only, no blanks / duplicates, stable blob-name order", () => {
    expect(normalizeIds([" b ", "a", "a", "", null, 7, "../x", "a-b", "c", { id: "d" }])).toEqual(["a-b", "a", "b", "c"]);
    expect(normalizeIds("nope")).toEqual([]);
    expect(indexName("c1")).toBe(INDEX_PREFIX + "c1.json");
    expect(() => indexName("../c1")).toThrow();
  });
  it("lenient document view: parseable ids are always kept, only a well-formed ready doc of THIS class counts as bootstrapped", () => {
    expect(normalizeIndex(ready("c1", ["b", "a"]), "c1")).toMatchObject({ ready: true, publishedAssignmentIds: ["a", "b"] });
    expect(normalizeIndex({ ...ready("c2", ["a"]) }, "c1")).toMatchObject({ ready: false, publishedAssignmentIds: ["a"] });   // wrong class
    expect(normalizeIndex({ ...ready("c1", ["a"]), schemaVersion: 9 }, "c1").ready).toBe(false);
    expect(normalizeIndex({ classId: "c1", ready: true, publishedAssignmentIds: "x" }, "c1")).toMatchObject({ ready: false, publishedAssignmentIds: [] });
    expect(normalizeIndex(null, "c1")).toMatchObject({ ready: false, publishedAssignmentIds: [] });
    expect(normalizeIndex([1], "c1").ready).toBe(false);
  });
});

describe("12E-B index — strict add / best-effort remove", () => {
  it("(3) strict add to an ABSENT index creates it ready:false with the id (claims nothing about legacy assignments)", async () => {
    const ctx = createMemoryContainer();
    await ensurePublishedAssignmentIndexed(ctx.container, "c1", "a1");
    expect(ctx.getJson(indexName("c1"))).toMatchObject({ schemaVersion: 1, classId: "c1", ready: false, publishedAssignmentIds: ["a1"] });
  });
  it("(2 · 4) strict add is idempotent and preserves ready:true (and ready:false)", async () => {
    const ctx = createMemoryContainer({ [indexName("c1")]: ready("c1", ["a1"]), [indexName("c2")]: { ...ready("c2", ["x"]), ready: false } });
    await ensurePublishedAssignmentIndexed(ctx.container, "c1", "a2");
    await ensurePublishedAssignmentIndexed(ctx.container, "c1", "a2");
    await ensurePublishedAssignmentIndexed(ctx.container, "c2", "y");
    expect(ctx.getJson(indexName("c1"))).toMatchObject({ ready: true, publishedAssignmentIds: ["a1", "a2"] });
    expect(ctx.getJson(indexName("c2"))).toMatchObject({ ready: false, publishedAssignmentIds: ["x", "y"] });
  });
  it("(5) remove is idempotent, never creates an index and never writes when the id is absent", async () => {
    const ctx = createMemoryContainer({ [indexName("c1")]: ready("c1", ["a1", "a2"]) });
    const rc = instrumentReadCost(ctx.container);
    expect(await removePublishedAssignmentFromIndex(ctx.container, "c1", "a1")).toEqual({ removed: true, failed: false });
    expect(await removePublishedAssignmentFromIndex(ctx.container, "c1", "a1")).toEqual({ removed: false, failed: false });
    expect(await removePublishedAssignmentFromIndex(ctx.container, "c9", "a1")).toEqual({ removed: false, failed: false });
    expect(ctx.getJson(indexName("c1"))).toMatchObject({ ready: true, publishedAssignmentIds: ["a2"] });
    expect(ctx.has(indexName("c9"))).toBe(false);
    expect(rc.uploadsOf(INDEX_PREFIX)).toBe(1);
  });
  it("(16) a CAS conflict is retried: one concurrent writer → the strict add still lands", async () => {
    const ctx = createMemoryContainer({ [indexName("c1")]: ready("c1", ["a1"]) }, conflictOn(indexName("c1"), 1));
    await ensurePublishedAssignmentIndexed(ctx.container, "c1", "a2");
    expect(ctx.getJson(indexName("c1")).publishedAssignmentIds).toEqual(["a1", "a2"]);
  });
  it("(17) a PERSISTENT conflict makes the strict add FAIL (StorageConflictError) — the caller must not publish", async () => {
    const ctx = createMemoryContainer({ [indexName("c1")]: ready("c1", ["a1"]) }, conflictOn(indexName("c1")));
    await expect(ensurePublishedAssignmentIndexed(ctx.container, "c1", "a2")).rejects.toMatchObject({ name: "StorageConflictError" });   // (ESM test import vs CJS module: match by name)
    expect(ctx.getJson(indexName("c1")).publishedAssignmentIds).toEqual(["a1"]);
  });
  it("a persistent conflict on removal is swallowed: { failed: true }, a safe warning, the stale pointer stays", async () => {
    const warns = [];
    const ctx = createMemoryContainer({ [indexName("c1")]: ready("c1", ["a1"]) }, conflictOn(indexName("c1")));
    const r = await removePublishedAssignmentFromIndex(ctx.container, "c1", "a1", {}, { logWarn: (e, f) => warns.push({ e, f }) }, "archive");
    expect(r).toEqual({ removed: false, failed: true });
    expect(warns).toEqual([{ e: "assignment.index.cleanup_failed", f: { action: "archive", assignmentId: "a1", retryable: true } }]);
    expect(ctx.getJson(indexName("c1")).publishedAssignmentIds).toEqual(["a1"]);
  });
});

describe("12E-B index — bootstrap", () => {
  it("(6) an empty class bootstraps to ready:true with an empty list (one scan), then needs no scan", async () => {
    const ctx = createMemoryContainer(seedAssignments([pub("o1", "c2")]));
    const rc = instrumentReadCost(ctx.container);
    const r = await load(ctx, ["c1"]);
    expect(r.byClass.get("c1")).toEqual([]);
    expect(r.stats).toMatchObject({ globalScans: 1, bootstrapped: 1 });
    expect(ctx.getJson(indexName("c1"))).toMatchObject({ ready: true, publishedAssignmentIds: [] });
    rc.reset();
    const again = await load(ctx, ["c1"]);
    expect(again.stats).toMatchObject({ globalScans: 0, bootstrapped: 0, indexReads: 1, assignmentDocsLoaded: 0 });
    expect(rc.listsOf(AP)).toBe(0);
  });
  it("(7) existing published assignments are discovered (drafts / archived / other classes are not)", async () => {
    const ctx = createMemoryContainer(seedAssignments([pub("a1", "c1"), pub("a2", "c1"), pub("d1", "c1", "draft"), pub("r1", "c1", "archived"), pub("o1", "c2")]));
    const r = await load(ctx, ["c1"]);
    expect(r.byClass.get("c1").map(a => a.assignmentId)).toEqual(["a1", "a2"]);
    expect(ctx.getJson(indexName("c1"))).toMatchObject({ ready: true, publishedAssignmentIds: ["a1", "a2"] });
  });
  it("(8) bootstrap UNIONS with ids already in a not-ready index (a pre-added publish is kept)", async () => {
    const ctx = createMemoryContainer({ ...seedAssignments([pub("a1", "c1")]), [indexName("c1")]: { ...ready("c1", ["pNew"]), ready: false } });
    await load(ctx, ["c1"]);
    expect(ctx.getJson(indexName("c1"))).toMatchObject({ ready: true, publishedAssignmentIds: ["a1", "pNew"] });
  });
  it("(9 · race) a strict add that lands AFTER the legacy scan and BEFORE the bootstrap CAS is never lost; the next read sees it", async () => {
    const ctx = createMemoryContainer(seedAssignments([pub("a1", "c1")]));
    const racingList = async (c, prefix) => {
      const docs = await listJson(c, prefix);                                     // the scan did NOT see pNew
      await ensurePublishedAssignmentIndexed(c, "c1", "pNew");                   // a concurrent publish pre-adds it …
      ctx.setJson(AP + "pNew.json", pub("pNew", "c1"));                          // … then commits the published document
      return docs;
    };
    const first = await load(ctx, ["c1"], { listJson: racingList });
    expect(first.byClass.get("c1").map(a => a.assignmentId)).toEqual(["a1"]);   // this request may miss it
    expect(ctx.getJson(indexName("c1"))).toMatchObject({ ready: true, publishedAssignmentIds: ["a1", "pNew"] });
    const next = await load(ctx, ["c1"]);
    expect(next.byClass.get("c1").map(a => a.assignmentId)).toEqual(["a1", "pNew"]);
    expect(next.stats.globalScans).toBe(0);
  });
  it("(10) several missing classes share ONE global scan; (11) ready classes need none", async () => {
    const ctx = createMemoryContainer({ ...seedAssignments([pub("a1", "c1"), pub("b1", "c2"), pub("c1x", "c3"), pub("z1", "c9")]), [indexName("c3")]: ready("c3", ["c1x"]) });
    const rc = instrumentReadCost(ctx.container);
    const r = await load(ctx, ["c1", "c2", "c3"]);
    expect(rc.listsOf(AP)).toBe(1);
    expect(r.stats).toMatchObject({ indexReads: 3, globalScans: 1, bootstrapped: 2 });
    expect([...r.byClass.entries()].map(([k, v]) => [k, v.map(a => a.assignmentId)])).toEqual([["c1", ["a1"]], ["c2", ["b1"]], ["c3", ["c1x"]]]);
    rc.reset();
    const warm = await load(ctx, ["c1", "c2", "c3"]);
    expect(rc.listsOf(AP)).toBe(0);
    expect(warm.stats).toMatchObject({ indexReads: 3, globalScans: 0, bootstrapped: 0, assignmentDocsLoaded: 3 });
  });
  it("(12) a malformed / wrong-class / unready / corrupt index is re-bootstrapped (never trusted)", async () => {
    const ctx = createMemoryContainer({ ...seedAssignments([pub("a1", "c1"), pub("b1", "c2"), pub("d1", "c4")]), [indexName("c1")]: { hello: 1 }, [indexName("c2")]: ready("cX", ["b1"]), [indexName("c3")]: { ...ready("c3", []), ready: false } });
    ctx.store.set(indexName("c4"), { content: Buffer.from("{ not json"), etag: "e-bad", contentType: "" });
    const r = await load(ctx, ["c1", "c2", "c3", "c4"]);
    expect(r.stats.globalScans).toBe(1);
    expect(r.byClass.get("c1").map(a => a.assignmentId)).toEqual(["a1"]);
    expect(r.byClass.get("c2").map(a => a.assignmentId)).toEqual(["b1"]);
    expect(r.byClass.get("c4").map(a => a.assignmentId)).toEqual(["d1"]);    // served from the scan
    for (const id of ["c1", "c2", "c3"]) expect(ctx.getJson(indexName(id)).ready).toBe(true);
    expect(r.stats.bootstrapFailures).toBe(1);                                 // the corrupt one cannot be CAS-read: retried next time
  });
  it("(18) a bootstrap write failure still serves the scan result; the next request retries and succeeds", async () => {
    const hooks = conflictOn(indexName("c1"));
    const ctx = createMemoryContainer({ ...seedAssignments([pub("a1", "c1")]), [indexName("c1")]: { ...ready("c1", []), ready: false } }, hooks);
    const warns = [];
    const r = await loadPublishedAssignmentsForClasses(ctx.container, ["c1"], {}, { logWarn: (e, f) => warns.push({ e, f }) });
    expect(r.byClass.get("c1").map(a => a.assignmentId)).toEqual(["a1"]);
    expect(r.stats).toMatchObject({ globalScans: 1, bootstrapped: 0, bootstrapFailures: 1 });
    expect(warns).toEqual([{ e: "assignment.index.bootstrap_failed", f: { retryable: true } }]);
    expect(ctx.getJson(indexName("c1")).ready).toBe(false);
    hooks.beforeConditionalUpload = () => {};                                  // storage recovers
    const next = await load(ctx, ["c1"]);
    expect(next.stats).toMatchObject({ globalScans: 1, bootstrapped: 1 });
    expect(ctx.getJson(indexName("c1"))).toMatchObject({ ready: true, publishedAssignmentIds: ["a1"] });
  });
  it("bootstrapClassIndex is a pure union (never removes an id)", async () => {
    const ctx = createMemoryContainer({ [indexName("c1")]: ready("c1", ["keep"]) });
    await bootstrapClassIndex(ctx.container, "c1", ["new"]);
    expect(ctx.getJson(indexName("c1")).publishedAssignmentIds).toEqual(["keep", "new"]);
  });
});

describe("12E-B index — readers re-validate every pointer", () => {
  it("(13 · 14 · 15) missing, draft, archived and wrong-class pointers are filtered; only the real published one is returned; no fallback scan", async () => {
    const ctx = createMemoryContainer({
      ...seedAssignments([pub("real", "c1"), pub("dr", "c1", "draft"), pub("ar", "c1", "archived"), pub("other", "c2"), { title: "no id" }]),
      [AP + "bad.json"]: { assignmentId: "bad", classId: "c1" },                    // no status → legacy normalization, not published
      [indexName("c1")]: ready("c1", ["missing", "dr", "ar", "other", "real", "bad"])
    });
    const rc = instrumentReadCost(ctx.container);
    const r = await load(ctx, ["c1"]);
    expect(r.byClass.get("c1").map(a => a.assignmentId)).toEqual(["real"]);
    expect(rc.listsOf(AP)).toBe(0);
    expect(r.stats).toMatchObject({ indexReads: 1, globalScans: 0, assignmentDocsLoaded: 6 });
  });
  it("readClassIndex returns null for a missing index and the normalized doc otherwise", async () => {
    const ctx = createMemoryContainer({ [indexName("c1")]: ready("c1", ["b", "a"]) });
    expect(await readClassIndex(ctx.container, "c9")).toBeNull();
    expect(await readClassIndex(ctx.container, "c1")).toMatchObject({ ready: true, publishedAssignmentIds: ["a", "b"] });
  });
});
