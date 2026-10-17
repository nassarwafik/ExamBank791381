import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import { createRequire } from "module";
import { handler as training } from "../src/functions/learning-training.js";
import * as store from "../src/lib/exam-library-store.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { hydrateBankAssets } from "../src/lib/bank-asset-hydrate.js";

// Loaded with require: the observed handler reaches observability (and the store) through Node's CommonJS cache, a DIFFERENT
// instance from a vitest `import` of the same file; sharing it is what makes setSink() reach the code under test.
const require = createRequire(import.meta.url);
const observability = require("../src/lib/observability.js");
const { handler, observed } = require("../src/functions/exam-library.js");

// Phase L.7 — operations of the bundled Exam Library and of Learning Practice: the library is read from disk ONCE per process and
// shared frozen; an unknown id never touches the disk; the teacher endpoint answers with a strong ETag, `private, no-cache` and a
// 304 only after the builder check, under the shared observability wrapper; the student form of a training is computed once.

const BUILDER_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }) };
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const get = (deps, id, headers = {}) => handler({ method: "GET", headers: { get: k => headers[k.toLowerCase()] ?? null }, params: id ? { id } : {} }, deps);
const reads = () => {
  const spy = vi.spyOn(fs, "readFileSync");
  return { spy, library: () => spy.mock.calls.filter(([p]) => String(p).includes("exam-library")).map(([p]) => String(p).split(/[\\/]/).pop()) };
};
beforeEach(() => { store.resetLibraryCacheForTests?.(); require("../src/lib/exam-library-store.js").resetLibraryCacheForTests?.(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); observability.resetSink(); });

describe("L.7 — the library store reads each file once per process", () => {
  it("the catalog and every item are read from disk once, however often they are asked for", () => {
    const r = reads();
    const ids = store.readLibraryCatalog().map(e => e.libraryItemId);
    expect(ids).toHaveLength(36);
    for (let round = 0; round < 3; round++) { store.readLibraryCatalog(); for (const id of ids) expect(store.readLibraryItem(id).examSnapshot).toBeTruthy(); }
    const files = r.library();
    expect(files.filter(f => f === "catalog.json")).toHaveLength(1);
    expect(files.filter(f => f !== "catalog.json").sort()).toEqual(ids.map(id => id + ".json").sort());
  });

  it("an unknown or invalid id never reads the disk and is never cached", () => {
    store.readLibraryItem("T01");                                   // the directory listing is taken once
    const r = reads();
    for (const id of ["T99", "nope", "../catalog", "T01/../x", "", "a b"]) expect(store.readLibraryItem(id)).toBeNull();
    expect(r.library()).toEqual([]);
    expect(store.libraryItemEntry("T99")).toBeNull();
  });

  it("what is shared is frozen: a caller cannot change what the next request reads", () => {
    const item = store.readLibraryItem("T01");
    expect(Object.isFrozen(item)).toBe(true);
    expect(Object.isFrozen(item.examSnapshot.questions[0])).toBe(true);
    expect(() => { item.examSnapshot.questions[0].answer = null; }).toThrow(TypeError);
    expect(() => { store.readLibraryCatalog().push({}); }).toThrow(TypeError);
    expect(store.readLibraryItem("T01").examSnapshot.questions[0].answer).toBeTruthy();
    expect(store.readLibraryItem("T01")).toBe(item);
  });

  it("the cached item is exactly the file", () => {
    const raw = JSON.parse(fs.readFileSync(store.dataDir() + "/items/F06.json", "utf8"));
    expect(store.readLibraryItem("F06")).toEqual(raw);
  });
});

describe("L.7 — GET /api/exam-library: ETag, private revalidation, 304 after the builder check", () => {
  it("the catalog: 200 with a strong ETag, `private, no-cache` and Vary; a matching If-None-Match is a 304 with no body", async () => {
    const r = await get(BUILDER_OK);
    expect(r.status).toBe(200);
    expect(r.jsonBody.catalog).toHaveLength(36);
    expect(r.headers).toMatchObject({ "Cache-Control": "private, no-cache", Vary: "Authorization, x-builder-token" });
    expect(r.headers.ETag).toMatch(/^"[A-Za-z0-9_-]{22}"$/);
    const again = await get(BUILDER_OK, undefined, { "if-none-match": 'W/"x", ' + r.headers.ETag });
    expect(again.status).toBe(304);
    expect(again.jsonBody).toBeUndefined();
    expect(again.headers.ETag).toBe(r.headers.ETag);
    expect((await get(BUILDER_OK, undefined, { "if-none-match": '"stale"' })).status).toBe(200);
  });

  it("an item: its own ETag; another item's ETag is not a match", async () => {
    const t01 = await get(BUILDER_OK, "T01"), f06 = await get(BUILDER_OK, "F06");
    expect(t01.status).toBe(200);
    expect(t01.jsonBody.item.examSnapshot.questions.length).toBeGreaterThan(0);
    expect(t01.headers.ETag).not.toBe(f06.headers.ETag);
    expect((await get(BUILDER_OK, "T01", { "if-none-match": t01.headers.ETag })).status).toBe(304);
    expect((await get(BUILDER_OK, "T01", { "if-none-match": f06.headers.ETag })).status).toBe(200);
  });

  it("no builder token → 401, even with a matching ETag (nothing is confirmed to an unauthenticated caller)", async () => {
    const etag = (await get(BUILDER_OK, "T01")).headers.ETag;
    const r = await get(BUILDER_NO, "T01", { "if-none-match": etag });
    expect(r.status).toBe(401);
    expect(r.headers?.ETag).toBeUndefined();
    expect((await get(BUILDER_NO)).status).toBe(401);
  });

  it("invalid id → 400; unknown id → 404 without a disk read", async () => {
    await get(BUILDER_OK, "T01");
    const r = reads();
    expect((await get(BUILDER_OK, "a.b")).status).toBe(400);
    expect((await get(BUILDER_OK, "T99")).status).toBe(404);
    expect(r.library()).toEqual([]);
  });

  it("the observed handler: a request id on every answer, and a failure is a redacted error event plus a generic 500", async () => {
    const records = [];
    observability.setSink(rec => records.push(rec));
    const ok = await observed({ method: "GET", url: "https://x/api/exam-library", headers: { get: () => null }, params: {} }, BUILDER_OK);
    expect(ok.headers["X-Request-ID"]).toBeTruthy();
    expect(records.some(r => r.event === "http.request.completed" && r.route === "exam-library" && r.status === 200 && r.requestId === ok.headers["X-Request-ID"])).toBe(true);
    const boom = await observed({ method: "GET", url: "https://x/api/exam-library", headers: { get: () => null }, params: {} }, { requireBuilderAuth: () => { throw new Error("secret-token-xyz"); } });
    expect(boom.status).toBe(500);
    expect(boom.jsonBody.error).toBe("تعذر تحميل مكتبة الامتحانات حاليًا.");
    const err = records.find(r => r.event === "exam.library.error");
    expect(err).toBeTruthy();
    expect(JSON.stringify(records)).not.toContain("secret-token-xyz");
  });
});

describe("L.7 — Learning Practice computes the student form of a training once", () => {
  const tdeps = { ...BUILDER_OK, container: {}, getContainer: () => ({}) };
  const getTraining = (id, deps = tdeps) => training({ method: "GET", headers: { get: () => null }, params: { trainingId: id } }, deps);
  it("the same frozen exam for every request, equal to sanitizing the item afresh, with no answer key", async () => {
    const a = await getTraining("T15"), b = await getTraining("T15");
    expect(a.status).toBe(200);
    expect(b.jsonBody.exam).toBe(a.jsonBody.exam);
    expect(Object.isFrozen(a.jsonBody.exam)).toBe(true);
    const fresh = sanitizeExamForStudent(hydrateBankAssets(JSON.parse(fs.readFileSync(store.dataDir() + "/items/T15.json", "utf8")).examSnapshot));
    expect(a.jsonBody.exam).toEqual(fresh);
    expect(JSON.stringify(a.jsonBody.exam)).not.toMatch(/"correctOptionIndex"|"hint":"[^"]/);
  });
  it("an item WITH a bank image is hydrated on every request (its signed URL is a fresh credential), never cached", async () => {
    vi.stubEnv("BUILDER_SESSION_SECRET", "test-signing-secret-l7");             // a test-only signing value for the image URL
    const snapshot = { title: "x", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "?", marks: 1, answer: { text: "k" }, image: { exists: true, visible: true, assets: [{ id: "a1", origin: "bank", blobName: "bank/a1.png", contentType: "image/png" }] } }] };
    const deps = { ...tdeps, readLibraryItem: () => ({ examSnapshot: snapshot }) };
    const a = await getTraining("T01", deps), b = await getTraining("T01", deps);
    expect(a.status).toBe(200);
    expect(b.jsonBody.exam).not.toBe(a.jsonBody.exam);
    expect(Object.isFrozen(a.jsonBody.exam)).toBe(false);
    expect(a.jsonBody.exam.questions[0].image.assets[0].dataUrl).toMatch(/^\/api\/question-image\?blob=bank%2Fa1\.png&exp=\d+&sig=/);
  });
});
