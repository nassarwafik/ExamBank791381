import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { posix } from "node:path";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Security fix (batch 1) — the storage SDK resolves "." / ".." segments in a blob name before the request
// ("platform/feed/c1/../../users/u1.json" is sent as "platform/users/u1.json"; "../../raw/x.json" reaches another
// container). Three routes put an unvalidated request id into a blob name: the student's feed reaction (postId), the
// teacher's feed reaction / note (postId) and the HTML exam import (sourceId). Each now accepts only one safe segment
// (400 otherwise, nothing read or written), and the SDK itself refuses any dot segment for the whole API process.
// The in-memory container below resolves dot segments exactly like the SDK (sdkLike), so the attacks are real here.
// Fail-first: run against 18d66eff (no validation, no SDK guard).
const require_ = createRequire(import.meta.url);
const SAVED = { ...process.env };
process.env.BANK_SETUP_KEY = "b1-test-secret";
delete process.env.BUILDER_SESSION_SECRET; delete process.env.BUILDER_USERS; delete process.env.BUILDER_USER_CODE; delete process.env.BUILDER_SESSION_VERSION;
process.env.BUILDER_PASSWORD = "b1-legacy-pw";
afterAll(() => { for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k]; Object.assign(process.env, SAVED); });

const { handler: studentFeed } = await import("../src/functions/achievement-feed.js");
const { handler: teacherFeed } = await import("../src/functions/teacher-achievement-feed.js");
const { feedBlobName } = await import("../src/lib/achievement-feed.js");
const { createBuilderToken } = await import("../src/lib/builder-auth.js");

/** The memory container with the SDK's name resolution: "." / ".." segments are resolved before the blob is addressed. */
function sdkLike(ctx) {
  const resolve = name => posix.normalize("/" + String(name)).replace(/^\/+/, "");
  const c = ctx.container;
  const blob = c.getBlobClient.bind(c), block = c.getBlockBlobClient.bind(c);
  c.getBlobClient = name => blob(resolve(name));
  c.getBlockBlobClient = name => block(resolve(name));
  return ctx;
}
const NOW = "2026-10-01T08:00:00.000Z";
const user = (id, classId) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "طالب " + id });
const room = (id, ownerId) => ({ classId: id, name: "صف " + id, grade: "11", active: true, status: "active", ownerId });
const post = (classId, studentId, key) => ({ schemaVersion: 2, eventType: "medal", postId: key + "_" + studentId, classId, studentId, studentDisplayName: "طالب " + studentId,
  shareWithClass: true, createdAt: NOW, reactions: {}, teacherReaction: null, teacherNote: "" });
function school() {
  const seed = {
    "platform/classes/A.json": room("A", "teacher-a"), "platform/classes/B.json": room("B", "teacher-b"),
    "platform/users/A1.json": user("A1", "A"), "platform/users/A2.json": user("A2", "A"), "platform/users/B1.json": user("B1", "B")
  };
  for (const p of [post("A", "A1", "x"), post("A", "A2", "y"), post("B", "B1", "z")]) seed[feedBlobName(p.classId, p.postId)] = p;
  return sdkLike(createMemoryContainer(seed));
}
const snapshot = ctx => JSON.stringify(ctx.names("").sort().map(n => [n, ctx.getJson(n)]));

describe("B1 — the student's feed reaction", () => {
  const react = (ctx, studentId, postId, reaction = "heart") => studentFeed({ method: "POST", url: "https://x/api/achievement-feed", json: async () => ({ action: "react", postId, reaction }) },
    { requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, student: ctx.getJson("platform/users/" + studentId + ".json") }) });

  it("a «../» post id is refused (400) and NOTHING is written: not another student's user document, not another class's post", async () => {
    const ctx = school();
    const before = snapshot(ctx);
    for (const postId of ["../../users/A2", "../B/z_B1", "../../classes/B", "x_A1/../../B/z_B1", "..", "a\\b"]) {
      const r = await react(ctx, "A1", postId);
      expect(r.status, postId).toBe(400);
      expect(r.jsonBody.error, postId).toBe("معرّف المنشور غير صالح.");
    }
    expect(snapshot(ctx)).toBe(before);
  });

  it("a normal reaction on a classmate's post still works (pin)", async () => {
    const ctx = school();
    const r = await react(ctx, "A1", "y_A2");
    expect(r.status).toBe(200);
    expect(ctx.getJson(feedBlobName("A", "y_A2")).reactions.heart).toEqual(["A1"]);
  });
});

describe("B1 — the teacher's feed reaction and note (multi-user tenancy)", () => {
  const deps = (ctx, sub) => ({ requireBuilderAuth: () => ({ ok: true, user: { sub, am: "multi-user" } }), container: ctx.container, getContainer: () => ctx.container });
  const call = (ctx, sub, body) => teacherFeed({ method: "POST", url: "https://x/api/teacher-achievement-feed", json: async () => body }, deps(ctx, sub));

  it("teacher B cannot reach teacher A's class through a «../» post id: 400, no note, no reaction, no notification to A's student", async () => {
    const ctx = school();
    const before = snapshot(ctx);
    for (const body of [
      { action: "setNote", classId: "B", postId: "../A/x_A1", note: "ملاحظة من معلّم آخر" },
      { action: "react", classId: "B", postId: "../A/x_A1", reaction: "fire" },
      { action: "setNote", classId: "B", postId: "../../users/A1", note: "x" },
      { action: "setNote", classId: "../classes/A", postId: "x_A1", note: "x" }
    ]) {
      const r = await call(ctx, "teacher-b", body);
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    expect(snapshot(ctx)).toBe(before);
    expect(ctx.names("platform/notifications/")).toEqual([]);
  });

  it("a post whose stored class differs from the class asked for is never changed (404), even under a safe id", async () => {
    const stray = { ...post("A", "A1", "moved"), postId: "moved_A1" };
    const ctx = sdkLike(createMemoryContainer({ "platform/classes/B.json": room("B", "teacher-b"), [feedBlobName("B", "moved_A1")]: stray }));
    const r = await call(ctx, "teacher-b", { action: "setNote", classId: "B", postId: "moved_A1", note: "x" });
    expect(r.status).toBe(404);
    expect(ctx.getJson(feedBlobName("B", "moved_A1")).teacherNote).toBe("");
  });

  it("a teacher's note and reaction on their own class's post still work (pin)", async () => {
    const ctx = school();
    expect((await call(ctx, "teacher-a", { action: "setNote", classId: "A", postId: "x_A1", note: "أحسنت" })).status).toBe(200);
    expect((await call(ctx, "teacher-a", { action: "react", classId: "A", postId: "x_A1", reaction: "clap" })).status).toBe(200);
    expect(ctx.getJson(feedBlobName("A", "x_A1"))).toMatchObject({ teacherNote: "أحسنت", teacherReaction: "clap" });
  });
});

describe("B1 — the HTML exam import (sourceId / examCode / variant)", () => {
  let importHandler, stores, restore;
  const HTML = `<!doctype html><html><body><div class="q-card" data-qid="1"><div class="q-text">ما ناتج 2 + 2 ؟ سؤال تجريبي لاختبار الاستيراد</div>
    <ul><li class="opt">3</li><li class="opt correct">4</li></ul></div></body></html>`;
  beforeAll(() => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
    stores = { raw: sdkLike(createMemoryContainer()), bank: sdkLike(createMemoryContainer({ "platform/classes/A.json": room("A", "teacher-a"), "sources/791381-2025.json": { sourceId: "791381-2025", official: true } })), assets: sdkLike(createMemoryContainer()) };
    for (const s of Object.values(stores)) {
      const c = s.container;
      c.exists = async () => true; c.createIfNotExists = async () => ({});
      const block = c.getBlockBlobClient, plain = c.getBlobClient;
      const withHelpers = (b, name) => ({ ...b, exists: async () => s.has(posix.normalize("/" + name).replace(/^\/+/, "")),
        uploadData: (data, opts) => b.upload(data, Buffer.byteLength(data), opts) });
      c.getBlockBlobClient = name => withHelpers(block(name), name);
      c.getBlobClient = name => withHelpers({ ...plain(name), ...block(name) }, name);
    }
    const blob = require_("@azure/storage-blob");
    const real = blob.BlobServiceClient.fromConnectionString;
    blob.BlobServiceClient.fromConnectionString = () => ({ getContainerClient: name => stores[name].container });
    const fnMod = require_("@azure/functions");
    const original = fnMod.app.http;
    fnMod.app.http = (name, opts) => { if (name === "importHtmlExam") importHandler = opts.handler; };
    try { delete require_.cache[require_.resolve("../src/functions/import-html-exam.js")]; require_("../src/functions/import-html-exam.js"); }
    finally { fnMod.app.http = original; }
    restore = () => { blob.BlobServiceClient.fromConnectionString = real; delete process.env.AZURE_STORAGE_CONNECTION_STRING; };
  });
  afterAll(() => restore && restore());
  const token = () => createBuilderToken("teacher-b");
  const importWith = query => importHandler({ method: "POST", url: "https://x/api/import-html-exam?" + new URLSearchParams({ examCode: "791381", year: "2025", save: "true", ...query }),
    headers: { get: h => (h.toLowerCase() === "authorization" ? "Bearer " + token() : null) }, text: async () => HTML });

  it("a «../» sourceId / examCode / variant is refused with 400 before any storage access: the class and the official source stay untouched", async () => {
    const before = JSON.stringify(Object.fromEntries(Object.entries(stores).map(([k, s]) => [k, snapshot(s)])));
    for (const query of [{ sourceId: "../platform/classes/A" }, { sourceId: "../../raw/x" }, { examCode: "../platform/classes/A" }, { variant: "../../x" }, { sourceId: "a/b" },
      // a safe sourceId does not cover examCode / variant: they name the embedded images (<examCode>/<year>/<variant>/…)
      { sourceId: "safe-source", examCode: "../../bank/platform/classes/A" }, { sourceId: "safe-source", variant: "../../bank/x" }]) {
      const r = await importWith(query);
      expect(r.status, JSON.stringify(query)).toBe(400);
      expect(r.jsonBody.error, JSON.stringify(query)).toBe("معرّف المصدر غير صالح.");
    }
    expect(JSON.stringify(Object.fromEntries(Object.entries(stores).map(([k, s]) => [k, snapshot(s)])))).toBe(before);
    expect(stores.bank.getJson("platform/classes/A.json")).toEqual(room("A", "teacher-a"));
  });
});

describe("B1 — the SDK guard (every route, whole process)", () => {
  const { BlobServiceClient, StorageSharedKeyCredential } = require_("@azure/storage-blob");
  const container = () => new BlobServiceClient("https://acct.blob.core.windows.net", new StorageSharedKeyCredential("acct", Buffer.from("k").toString("base64"))).getContainerClient("bank");

  it("refuses dot segments, backslashes and control characters on every name-taking factory; ordinary names pass", async () => {
    const c = container();
    for (const name of ["platform/feed/A/../../users/A1.json", "../../raw/x.json", "a/./b.json", "a/..", "a\\b.json", "a/\u0000b.json"]) {
      for (const method of ["getBlobClient", "getBlockBlobClient", "getAppendBlobClient", "getPageBlobClient"]) {
        expect(() => c[method](name), method + " " + name).toThrow(expect.objectContaining({ code: "UNSAFE_BLOB_NAME", httpStatus: 400 }));
      }
    }
    await expect(c.deleteBlob("x/../y.json")).rejects.toMatchObject({ code: "UNSAFE_BLOB_NAME" });
    for (const name of ["platform/users/A1.json", "sources/791381-2025.json", "a/..b/c...json", "platform/feed/A/x_A1.json"]) {
      expect(c.getBlockBlobClient(name).name).toBe(name);
    }
  });

  it("is installed by the storage layer and by the import route on their own (each loads lib/blob-names)", () => {
    const { readFileSync } = require_("node:fs");
    for (const file of ["../src/lib/platform-storage.js", "../src/functions/import-html-exam.js", "../src/functions/achievement-feed.js", "../src/functions/teacher-achievement-feed.js"]) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8"), file).toMatch(/require\("\.\.?\/(lib\/)?blob-names"\)/);
    }
  });
});
