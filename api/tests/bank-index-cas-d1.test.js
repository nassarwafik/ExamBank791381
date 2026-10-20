import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Data-integrity fix (batch 4, D1) — four routes wrote the shared bank index (and the classification routes the source
// document) by reading the whole document, working (the AI call takes seconds), then uploading the whole document back.
// Whatever another request saved in between was silently erased: another source's index entries (its questions can no
// longer be selected) or a teacher's edit of a question. Each test injects that concurrent write at the exact moment the
// route works, over the in-memory container with real ETag semantics, and checks it survives next to the route's own
// change (applied through one CAS round per document, lib/bank-index-writes).
// Fail-first: run against 791f8118 (whole-document overwrites).
const require_ = createRequire(import.meta.url);
const SAVED = { ...process.env };
process.env.BANK_SETUP_KEY = "d1-test-secret";
delete process.env.BUILDER_SESSION_SECRET; delete process.env.BUILDER_USERS; delete process.env.BUILDER_USER_CODE; delete process.env.BUILDER_SESSION_VERSION;
process.env.BUILDER_PASSWORD = "d1-legacy-pw";
process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
process.env.OPENAI_API_KEY = "d1-not-a-real-key";

// The AI client: each test sets `ai.during` (the concurrent writer) and `ai.answer(input)` (the model's reply).
const ai = { during: null, answer: null };
vi.mock("openai", () => ({
  default: class {
    constructor() {
      this.responses = { create: async args => { if (ai.during) { const w = ai.during; ai.during = null; w(); } return { output_text: JSON.stringify(ai.answer(args)) }; } };
    }
  }
}));

const { createBuilderToken } = await import("../src/lib/builder-auth.js");
const INDEX = "index/questions-index.json";
const stores = {};
const handlers = {};
let restore;

/** Containers for this test (bank / raw / assets) plus the legacy routes' SDK helpers the memory container lacks. */
function freshStores(bankSeed = {}, rawSeed = {}) {
  for (const [name, seed] of [["bank", bankSeed], ["raw", rawSeed], ["assets", {}]]) {
    const s = createMemoryContainer(seed);
    const c = s.container;
    c.exists = async () => true; c.createIfNotExists = async () => ({});
    const block = c.getBlockBlobClient, plain = c.getBlobClient;
    const withHelpers = (b, n) => ({ ...b, exists: async () => s.has(n), uploadData: (data, opts) => b.upload(data, Buffer.byteLength(data), opts) });
    c.getBlockBlobClient = n => withHelpers(block(n), n);
    c.getBlobClient = n => withHelpers({ ...plain(n), ...block(n) }, n);
    stores[name] = s;
  }
  return stores;
}
/** Runs `write` once, right after the route has READ `name` (another request saving in the route's window). */
function afterFirstRead(name, write) {
  const c = stores.bank.container;
  const get = c.getBlobClient;
  let done = false;
  c.getBlobClient = n => {
    const b = get(n);
    if (n !== name || done) return b;
    return { ...b, download: async (...a) => { const r = await b.download(...a); if (!done) { done = true; write(); } return r; } };
  };
}

beforeAll(async () => {
  const blob = require_("@azure/storage-blob");
  const real = blob.BlobServiceClient.fromConnectionString;
  blob.BlobServiceClient.fromConnectionString = () => ({ getContainerClient: name => stores[name].container });
  const fnMod = require_("@azure/functions");
  const original = fnMod.app.http;
  fnMod.app.http = (name, opts) => { handlers[name] = opts.handler; };
  try {
    for (const f of ["import-html-exam", "classify-bank-batch", "classify-question-preview", "build-bank-2025"]) await import("../src/functions/" + f + ".js");
  } finally { fnMod.app.http = original; }
  restore = () => { blob.BlobServiceClient.fromConnectionString = real; };
});
afterAll(() => { if (restore) restore(); for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k]; Object.assign(process.env, SAVED); });

const headers = () => ({ get: h => (h.toLowerCase() === "authorization" ? "Bearer " + createBuilderToken("teacher-d1") : null) });
const OTHER = { id: "other-1", sourceId: "other-source", reviewStatus: "classified", topic: "T1" };
const entryIds = () => stores.bank.getJson(INDEX).questions.map(q => q.id).sort();

describe("D1 — HTML exam import replaces only its own index entries", () => {
  const HTML = `<!doctype html><html><body><div class="q-card" data-qid="1"><div class="q-text">ما ناتج 2 + 2 ؟ سؤال تجريبي لاختبار الاستيراد</div>
    <ul><li class="opt">3</li><li class="opt correct">4</li></ul></div></body></html>`;
  it("an index entry another request saved after the import read the index is kept next to the imported entries", async () => {
    freshStores({ [INDEX]: { schemaVersion: 1, questions: [] } });
    afterFirstRead(INDEX, () => stores.bank.setJson(INDEX, { schemaVersion: 1, questions: [OTHER] }));
    const r = await handlers.importHtmlExam({ method: "POST", url: "https://x/api/import-html-exam?examCode=791381&year=2025&variant=d1&save=true", headers: headers(), text: async () => HTML });
    expect(r.status).toBe(200);
    const ids = entryIds();
    expect(ids).toContain("other-1");                                            // the concurrent entry survives
    expect(ids.some(id => id.startsWith("791381-2025-d1-"))).toBe(true);           // and the import's own entries are there
    expect(stores.bank.getJson(INDEX).questionCount).toBe(ids.length);
  });

  it("re-importing the same source still replaces its own old entries (pin)", async () => {
    freshStores({ [INDEX]: { schemaVersion: 1, questions: [OTHER, { id: "791381-2025-d1-OLD", sourceId: "791381-2025-d1" }] } });
    const r = await handlers.importHtmlExam({ method: "POST", url: "https://x/api/import-html-exam?examCode=791381&year=2025&variant=d1&save=true", headers: headers(), text: async () => HTML });
    expect(r.status).toBe(200);
    expect(entryIds()).not.toContain("791381-2025-d1-OLD");
    expect(entryIds()).toContain("other-1");
  });
});

describe("D1 — batch classification (the AI call is the window)", () => {
  const SRC = "src-a";
  const q = (id, extra = {}) => ({ id, sourceId: SRC, section: "LEGACY", text: "نص السؤال " + id, reviewStatus: "pending", flags: {}, assets: [], ...extra });
  const seed = () => ({
    [INDEX]: { schemaVersion: 1, questions: [{ id: "q1", sourceId: SRC, reviewStatus: "pending" }, { id: "q2", sourceId: SRC, reviewStatus: "classified" }] },
    ["sources/" + SRC + ".json"]: { sourceId: SRC, questions: [q("q1"), q("q2", { reviewStatus: "classified", text: "النص الأصلي" })] }
  });
  const answer = ids => ({ classifications: ids.map(id => ({ questionId: id, section: "LEGACY", primaryTopic: "T1", secondaryTopics: [], difficulty: 2, difficultyReason: "r", difficultyConfidence: 0.9, familyKey: "fam", hasCLI: false, requiresCalculation: false, needsReview: false })) });
  const run = () => handlers.classifyBankBatch({ method: "POST", url: "https://x/api/classify-bank-batch", headers: headers(), json: async () => ({ save: true, sourceId: SRC, batchSize: 1 }) });

  it("a teacher's edit of another question and another source's index entry, saved while the AI answered, are both kept; q1 is classified", async () => {
    freshStores(seed());
    ai.answer = () => answer(["q1"]);
    ai.during = () => {
      const src = stores.bank.getJson("sources/" + SRC + ".json");
      src.questions.find(x => x.id === "q2").text = "نص عدّله المعلّم";
      stores.bank.setJson("sources/" + SRC + ".json", src);
      const idx = stores.bank.getJson(INDEX);
      idx.questions.push(OTHER);
      stores.bank.setJson(INDEX, idx);
    };
    const r = await run();
    expect(r.status).toBe(200);
    const src = stores.bank.getJson("sources/" + SRC + ".json");
    expect(src.questions.find(x => x.id === "q2").text).toBe("نص عدّله المعلّم");       // the edit survives
    expect(src.questions.find(x => x.id === "q1")).toMatchObject({ topic: "T1", reviewStatus: "classified" });
    expect(entryIds()).toContain("other-1");                                           // the other source's entry survives
    expect(stores.bank.getJson(INDEX).questions.find(x => x.id === "q1")).toMatchObject({ topic: "T1", reviewStatus: "classified", difficulty: 2 });
  });
});

describe("D1 — batch classification: the index repair pass", () => {
  // An index entry still marked pending while its source question is already classified is repaired from the source
  // (no AI call). That write too must keep what another request saved after the index was read.
  it("a repaired entry is synced and an index entry saved meanwhile is kept", async () => {
    const SRC = "src-r";
    freshStores({
      [INDEX]: { schemaVersion: 1, questions: [{ id: "r1", sourceId: SRC, reviewStatus: "pending" }] },
      ["sources/" + SRC + ".json"]: { sourceId: SRC, questions: [{ id: "r1", sourceId: SRC, section: "LEGACY", text: "س", reviewStatus: "classified",
        classification: { topic: "T2", secondaryTopics: [], difficulty: 3, difficultyLabel: "", difficultyConfidence: 0.7, familyKey: "f", needsReview: false, status: "classified" }, flags: {}, assets: [] }] }
    });
    afterFirstRead(INDEX, () => { const idx = stores.bank.getJson(INDEX); idx.questions.push(OTHER); stores.bank.setJson(INDEX, idx); });
    ai.during = null; ai.answer = () => ({ classifications: [] });
    const r = await handlers.classifyBankBatch({ method: "POST", url: "https://x/api/classify-bank-batch", headers: headers(), json: async () => ({ save: true, sourceId: SRC, batchSize: 1 }) });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(entryIds()).toContain("other-1");
    expect(stores.bank.getJson(INDEX).questions.find(x => x.id === "r1")).toMatchObject({ topic: "T2", reviewStatus: "classified", difficulty: 3 });
  });
});

describe("D1 — single-question classification", () => {
  const SOURCE = "sources/791381-2025.json";
  const seed = () => ({
    [INDEX]: { schemaVersion: 1, questions: [{ id: "p1", sourceId: "791381-2025", reviewStatus: "pending" }] },
    [SOURCE]: { sourceId: "791381-2025", questions: [{ id: "p1", section: "LEGACY", text: "س1", reviewStatus: "pending", flags: {}, assets: [] }, { id: "p2", section: "LEGACY", text: "النص الأصلي", reviewStatus: "classified", flags: {}, assets: [] }] }
  });
  it("an edit and an index entry saved while the AI answered are kept; p1 is classified", async () => {
    freshStores(seed());
    ai.answer = () => ({ primaryTopic: "T1", secondaryTopics: [], difficulty: 2, difficultyReason: "r", difficultyConfidence: 0.8, familyKey: "fam", hasCLI: false, requiresCalculation: false, needsReview: false, section: "LEGACY" });
    ai.during = () => {
      const src = stores.bank.getJson(SOURCE);
      src.questions.find(x => x.id === "p2").text = "نص عدّله المعلّم";
      stores.bank.setJson(SOURCE, src);
      const idx = stores.bank.getJson(INDEX);
      idx.questions.push(OTHER);
      stores.bank.setJson(INDEX, idx);
    };
    const r = await handlers.classifyQuestionPreview({ method: "POST", url: "https://x/api/classify-question-preview", headers: headers(), json: async () => ({ questionId: "p1", save: true }) });
    expect(r.status).toBe(200);
    const src = stores.bank.getJson(SOURCE);
    expect(src.questions.find(x => x.id === "p2").text).toBe("نص عدّله المعلّم");
    expect(src.questions.find(x => x.id === "p1").classification).toMatchObject({ topic: "T1", status: "classified" });
    expect(entryIds()).toContain("other-1");
    expect(stores.bank.getJson(INDEX).questions.find(x => x.id === "p1")).toMatchObject({ topic: "T1", reviewStatus: "classified" });
  });
});

describe("D1 — the 2025 bank rebuild replaces only its own index entries", () => {
  // The rebuild reads the official file's embedded data: `const images`, 22 BASIC (`baseQ`) and 12 INFRASTRUCTURE (`infraQ`).
  const qs = (prefix, n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: prefix + (i + 1), n: i + 1, q: "سؤال " + prefix + (i + 1), options: ["أ", "ب"], answer: 0 })));
  const HTML = `<!doctype html><html><body><script>const images = {}; const baseQ = ${qs("b", 22)}; const infraQ = ${qs("i", 12)};</script></body></html>`;
  it("an index entry another request saved after the rebuild read the index is kept", async () => {
    freshStores({ [INDEX]: { schemaVersion: 1, questions: [] } }, { "791381 - 2025.html": HTML });
    stores.raw.store.set("791381 - 2025.html", { content: Buffer.from(HTML, "utf8"), etag: "raw-1", contentType: "text/html" });
    afterFirstRead(INDEX, () => stores.bank.setJson(INDEX, { schemaVersion: 1, questions: [OTHER] }));
    const r = await handlers.buildBank2025({ method: "POST", url: "https://x/api/build-bank-2025", headers: headers(), json: async () => ({}) });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(entryIds()).toContain("other-1");
    expect(stores.bank.getJson(INDEX).questions.some(q => q.sourceId === "791381-2025")).toBe(true);
  });
});

describe("D1 — the shared helpers (lib/bank-index-writes)", () => {
  it("replaceSourceInIndex keeps every other source and replaces this one; updateSourceQuestions refuses a missing source", async () => {
    const lib = require_("../src/lib/bank-index-writes.js");
    freshStores({ [INDEX]: { schemaVersion: 1, extra: "kept", questions: [OTHER, { id: "a-old", sourceId: "a" }] } });
    await lib.replaceSourceInIndex(stores.bank.container, "a", [{ id: "a-new", sourceId: "a" }], "2026-10-20T00:00:00.000Z");
    expect(stores.bank.getJson(INDEX)).toEqual({ schemaVersion: 1, extra: "kept", updatedAt: "2026-10-20T00:00:00.000Z", questionCount: 2, questions: [OTHER, { id: "a-new", sourceId: "a" }] });
    await expect(lib.updateSourceQuestions(stores.bank.container, "sources/missing.json", ["x"], () => {}, "t")).rejects.toThrow(/missing/);
    expect(stores.bank.has("sources/missing.json")).toBe(false);
  });
});
