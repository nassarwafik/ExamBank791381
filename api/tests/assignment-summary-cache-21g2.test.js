// Phase 21G.2 — the light assignment list. Drives the REAL manage-assignments handler over the in-memory container (whose listing
// reports each blob's ETag, as Azure does). A repeated list downloads NO assignment document; any change by any writer — including
// one that bypasses this code — is seen at once, because a cached summary is used only for the exact ETag it was computed from.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const classrooms = require("../src/functions/manage-classrooms.js");
const assignments = require("../src/functions/manage-assignments.js");
const { loadAssignmentSummaries, CACHE_NAME } = require("../src/lib/assignment-summary-cache.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const multi = sub => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } });
const req = (method, body, url = "http://x/api/assignments") => ({ method, url, headers: { get: () => "" }, json: async () => body });
const EXAM = { examId: "", title: "امتحان", questions: [{ id: "q1", type: "trueFalse", text: "عبارة", marks: 1, answer: true }] };
const AP = "platform/assignments/";

async function setup(extraDeps = {}) {
  const mem = createMemoryContainer();
  const downloads = [];
  // Count every download of an assignment DOCUMENT (the heavy blobs the light list avoids).
  const container = { ...mem.container, getBlobClient: name => { const b = mem.container.getBlobClient(name); return { ...b, download: async (...a) => { if (name.startsWith(AP)) downloads.push(name); return b.download(...a); } }; } };
  const deps = auth => ({ requireBuilderAuth: () => auth, container, getContainer: () => container, recordAuditEvent: async () => {}, ensurePublishedAssignmentIndexed: async () => {}, removePublishedAssignmentFromIndex: async () => {}, ...extraDeps });
  const A = multi("teacher-a");
  const classId = (await classrooms.handler(req("POST", { action: "create", name: "صف أ", grade: "11", schoolYear: "2026-2027" }), deps(A))).jsonBody.classroom.classId;
  const create = async title => (await assignments.handler(req("POST", { action: "create", classId, title, examSnapshot: EXAM }), deps(A))).jsonBody.assignment.assignmentId;
  const list = async () => (await assignments.handler(req("GET"), deps(A))).jsonBody.assignments;
  return { mem, downloads, create, list, A, deps, classId };
}
const titles = l => l.map(x => x.title).sort();

describe("21G.2 light assignment list", () => {
  it("a repeated list downloads no assignment document and returns the same summaries", async () => {
    const s = await setup();
    await s.create("واجب 1"); await s.create("واجب 2"); await s.create("واجب 3");
    s.downloads.length = 0;
    const first = await s.list();
    expect(titles(first)).toEqual(["واجب 1", "واجب 2", "واجب 3"]);
    expect(s.mem.getJson(CACHE_NAME).entries).toBeTruthy();
    const firstDownloads = s.downloads.length;
    s.downloads.length = 0;
    const second = await s.list();
    expect(second).toEqual(first);
    expect(s.downloads).toEqual([]);
    expect(firstDownloads).toBe(3);
    // The list never carries an exam snapshot.
    expect(JSON.stringify(second)).not.toContain("examSnapshot");
  });

  it("a change by ANY writer is seen at once, and only that document is downloaded", async () => {
    const s = await setup();
    const id1 = await s.create("واجب 1"); await s.create("واجب 2");
    await s.list();
    // A writer that knows nothing about the cache (an older build, a script) rewrites the document directly.
    const doc = s.mem.getJson(AP + id1 + ".json");
    s.mem.setJson(AP + id1 + ".json", { ...doc, title: "عنوان غيّره كاتب آخر", status: "published" });
    s.downloads.length = 0;
    const after = await s.list();
    expect(after.find(x => x.assignmentId === id1)).toMatchObject({ title: "عنوان غيّره كاتب آخر", status: "published" });
    expect(s.downloads).toEqual([AP + id1 + ".json"]);
  });

  it("the handler's own edits, new assignments and removed ones are all reflected", async () => {
    const s = await setup();
    const id1 = await s.create("واجب 1");
    const id2 = await s.create("واجب 2");
    await s.list();
    expect((await assignments.handler(req("POST", { action: "updateDetails", assignmentId: id1, title: "واجب معدّل" }), s.deps(s.A))).status).toBe(200);
    await s.create("واجب 3");
    s.mem.store.delete(AP + id2 + ".json");
    expect(titles(await s.list())).toEqual(["واجب 3", "واجب معدّل"]);
    expect(Object.keys(s.mem.getJson(CACHE_NAME).entries)).not.toContain(id2);              // pruned
  });

  it("a malformed, outdated or unreadable cache is ignored and rebuilt", async () => {
    const s = await setup();
    await s.create("واجب 1");
    for (const bad of [{ schemaVersion: 1, summaryVersion: 999, entries: {} }, { nonsense: true }, "garbage"]) {
      s.mem.setJson(CACHE_NAME, bad);
      expect(titles(await s.list())).toEqual(["واجب 1"]);
      expect(s.mem.getJson(CACHE_NAME)).toMatchObject({ schemaVersion: 1, summaryVersion: 3 });   // the handler's SUMMARY_VERSION (2 since 21G.5, 3 since D5: + latePolicy)
    }
  });

  it("summaries cached by an older summary version are recomputed even when their ETags still match", async () => {
    const s = await setup();
    const id = await s.create("واجب 1");
    await s.list();
    const cache = s.mem.getJson(CACHE_NAME);
    cache.summaryVersion = 0;
    cache.entries[id] = { ...cache.entries[id], summary: { assignmentId: id, title: "شكل قديم" } };    // same ETag, old shape
    s.mem.setJson(CACHE_NAME, cache);
    const [row] = await s.list();
    expect(row).toMatchObject({ assignmentId: id, title: "واجب 1", status: "draft", questionCount: 1 });
  });

  it("a forged cache entry for an ETag the document does not have is never served", async () => {
    const s = await setup();
    const id = await s.create("واجب 1");
    await s.list();
    const cache = s.mem.getJson(CACHE_NAME);
    cache.entries[id] = { etag: "etag-forged", summary: { ...cache.entries[id].summary, title: "مزيّف" } };
    s.mem.setJson(CACHE_NAME, cache);
    expect(titles(await s.list())).toEqual(["واجب 1"]);
  });

  it("a failed cache write never fails or changes the list", async () => {
    const s = await setup({ summaryCacheDeps: { uploadJsonConditional: async () => { throw Object.assign(new Error("boom"), { statusCode: 500 }); } } });
    await s.create("واجب 1"); await s.create("واجب 2");
    expect(titles(await s.list())).toEqual(["واجب 1", "واجب 2"]);
    s.downloads.length = 0;
    expect(titles(await s.list())).toEqual(["واجب 1", "واجب 2"]);
    expect(s.downloads.length).toBe(2);                                                       // no cache: everything is read again
  });

  it("a listing without ETags always downloads (never trusts the cache)", async () => {
    const mem = createMemoryContainer({ [AP + "a1.json"]: { assignmentId: "a1", title: "أ" } });
    const summarize = d => ({ assignmentId: d.assignmentId, title: d.title });
    const noEtags = { listBlobEntries: async () => [{ name: AP + "a1.json", etag: null }] };
    await loadAssignmentSummaries(mem.container, { prefix: AP, summarize, summaryVersion: 1 }, noEtags);
    mem.setJson(AP + "a1.json", { assignmentId: "a1", title: "ب" });
    const r = await loadAssignmentSummaries(mem.container, { prefix: AP, summarize, summaryVersion: 1 }, noEtags);
    expect(r.summaries).toEqual([{ assignmentId: "a1", title: "ب" }]);
    expect(r.stats).toMatchObject({ listed: 1, cached: 0, downloaded: 1 });
  });
});
