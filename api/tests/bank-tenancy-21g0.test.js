// Phase 21G.0 — the question bank in multi-user mode: the OFFICIAL bank (791381 / 791367) is the shared library every teacher reads;
// every other question belongs to the teacher who added it. Drives the REAL bank handlers over the shared in-memory blob container
// (real platform-storage reads and ETag mutations). Teacher B never lists, selects, draws, changes or deletes teacher A's question, and
// is answered exactly as if it did not exist. Pre-tenancy questions stay shared until LEGACY_DATA_OWNER; legacy mode is unchanged.
import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const bankQuestions = require("../src/functions/bank-questions.js");
const bankSelect = require("../src/functions/bank-question-select.js");
const bankAction = require("../src/functions/question-bank-action.js");
const bankImport = require("../src/functions/bank-import-action.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const INDEX = "index/questions-index.json";
const OFFICIAL = "791381-2025-exam";
const IMPORT = "import-quiz-20260301-abc123";
const multi = sub => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } });
const legacy = () => ({ ok: true, user: { ver: 2, role: "teacher", sub: "builder", am: "legacy" } });
const mc = (text, topic) => ({ section: "BASIC", topic, difficulty: 2, presentationType: "multipleChoice", text, options: [{ value: "a", text: "نعم" }, { value: "b", text: "لا" }], answer: { correctOptionValue: "a" } });
afterEach(() => { delete process.env.LEGACY_DATA_OWNER; });

function bank() {
  const mem = createMemoryContainer({
    ["sources/" + OFFICIAL + ".json"]: { questions: [{ id: OFFICIAL + "-q1", sourceId: OFFICIAL, questionNumber: "1", section: "BASIC", type: "multipleChoice", text: "ما هو IP؟", options: [{ value: "A", text: "بروتوكول" }, { value: "B", text: "كابل" }], answer: { mode: "singleChoice", correctOptionValue: "A", values: ["A"] }, assets: [], classification: { topic: "OFFICIAL_TOPIC", difficulty: 2 }, reviewStatus: "classified" }] },
    // A question imported before tenancy existed: no owner stamp anywhere.
    ["sources/" + IMPORT + ".json"]: { questions: [{ id: IMPORT + "-1", sourceId: IMPORT, questionNumber: "1", section: "BASIC", type: "multipleChoice", text: "سؤال قديم", options: [{ value: "a", text: "نعم" }, { value: "b", text: "لا" }], answer: { mode: "singleChoice", correctOptionValue: "a", values: ["a"] }, assets: [], classification: { topic: "LEGACY_TOPIC", difficulty: 2 }, reviewStatus: "classified" }] },
    [INDEX]: { questions: [
      { id: OFFICIAL + "-q1", sourceId: OFFICIAL, section: "BASIC", type: "multipleChoice", topic: "OFFICIAL_TOPIC", difficulty: 2, reviewStatus: "classified" },
      { id: IMPORT + "-1", sourceId: IMPORT, section: "BASIC", type: "multipleChoice", topic: "LEGACY_TOPIC", difficulty: 2, reviewStatus: "classified" }
    ] }
  });
  const download = async (_c, name) => { const v = mem.getJson(name); if (v === null) throw Object.assign(new Error("The specified blob does not exist."), { statusCode: 404, code: "BlobNotFound" }); return v; };
  const deps = auth => ({ requireBuilderAuth: () => auth, getBankContainer: () => mem.container, getPlatformContainer: () => mem.container, recordAuditEvent: async () => {}, downloadJson: download });
  const call = (auth, body) => bankQuestions.handler({ method: "POST", url: "http://x/api/bank-questions", json: async () => body }, deps(auth));
  return {
    mem,
    list: async auth => (await bankQuestions.handler({ method: "GET", url: "http://x/api/bank-questions" }, deps(auth))).jsonBody.questions.map(q => q.id).sort(),
    create: async (auth, requestKey, question) => (await call(auth, { action: "create", requestKey, question })),
    call,
    select: (auth, ids) => bankSelect.handler({ method: "POST", url: "http://x/api/bank-question-select", json: async () => ({ ids }) }, deps(auth)),
    replace: (auth, topic) => bankAction.handler({ json: async () => ({ question: { examQuestionId: "x1", marks: 2, section: "BASIC", topic, difficulty: 2, presentationType: "multipleChoice" }, presentationType: "multipleChoice", topic }) }, deps(auth))
  };
}

describe("21G.0 the question bank: official is shared, a teacher's own questions are theirs", () => {
  it("a teacher lists the official bank and their own questions only", async () => {
    const b = bank();
    const qa = (await b.create(multi("teacher-a"), "key-aaaa-0001", mc("سؤال المعلم أ", "PRIVATE_A"))).jsonBody.question.id;
    const qb = (await b.create(multi("teacher-b"), "key-bbbb-0001", mc("سؤال المعلم ب", "PRIVATE_B"))).jsonBody.question.id;
    expect(await b.list(multi("teacher-a"))).toEqual([OFFICIAL + "-q1", IMPORT + "-1", qa].sort());
    expect(await b.list(multi("teacher-b"))).toEqual([OFFICIAL + "-q1", IMPORT + "-1", qb].sort());
    // Stored with its owner on both halves (source question + index entry).
    expect(b.mem.getJson("sources/manual.json").questions.find(q => q.id === qa).ownerId).toBe("teacher-a");
    expect(b.mem.getJson(INDEX).questions.find(e => e.id === qa).ownerId).toBe("teacher-a");
    // Legacy single-password mode: one shared space, nothing filtered.
    expect(await b.list(legacy())).toEqual([OFFICIAL + "-q1", IMPORT + "-1", qa, qb].sort());
  });

  it("another teacher's question cannot be updated or deleted and answers exactly like a missing one", async () => {
    const b = bank();
    const qa = (await b.create(multi("teacher-a"), "key-aaaa-0002", mc("سؤال المعلم أ", "PRIVATE_A"))).jsonBody.question.id;
    const before = JSON.stringify([b.mem.getJson("sources/manual.json"), b.mem.getJson(INDEX)]);
    for (const body of [{ action: "update", id: qa, question: mc("تغيير", "PRIVATE_A") }, { action: "delete", id: qa }]) {
      const res = await b.call(multi("teacher-b"), body);
      const missing = await b.call(multi("teacher-b"), { ...body, id: "manual-key-none-0000" });
      expect(res.status).toBe(404);
      expect(res.jsonBody).toEqual(missing.jsonBody);
    }
    expect(JSON.stringify([b.mem.getJson("sources/manual.json"), b.mem.getJson(INDEX)])).toBe(before);
    expect((await b.call(multi("teacher-a"), { action: "delete", id: qa })).status).toBe(200);
  });

  it("a dangling index entry of another teacher is not healed (removed) by the other teacher", async () => {
    const b = bank();
    const qa = (await b.create(multi("teacher-a"), "key-aaaa-0003", mc("سؤال المعلم أ", "PRIVATE_A"))).jsonBody.question.id;
    b.mem.setJson("sources/manual.json", { sourceId: "manual", questions: [] });       // a delete whose index write failed
    expect((await b.call(multi("teacher-b"), { action: "delete", id: qa })).status).toBe(404);
    expect(b.mem.getJson(INDEX).questions.some(e => e.id === qa)).toBe(true);
  });

  it("re-using another teacher's create key never hands their question over", async () => {
    const b = bank();
    await b.create(multi("teacher-a"), "key-same-0004", mc("نص واحد", "PRIVATE_A"));
    const res = await b.create(multi("teacher-b"), "key-same-0004", mc("نص واحد", "PRIVATE_A"));
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.jsonBody)).not.toContain("نص واحد");
    expect(b.mem.getJson(INDEX).questions.find(e => e.id === "manual-key-same-0004").ownerId).toBe("teacher-a");
  });

  it("inserting from the bank: another teacher's question is reported missing; the official one is served to both", async () => {
    const b = bank();
    const qa = (await b.create(multi("teacher-a"), "key-aaaa-0005", mc("سؤال المعلم أ", "PRIVATE_A"))).jsonBody.question.id;
    const res = await b.select(multi("teacher-b"), [qa]);
    expect(res.status).toBe(404);
    expect(res.jsonBody.missingIds).toEqual([qa]);
    expect(JSON.stringify(res.jsonBody)).not.toContain("سؤال المعلم أ");
    expect((await b.select(multi("teacher-a"), [qa])).status).toBe(200);
    expect((await b.select(multi("teacher-b"), [OFFICIAL + "-q1"])).status).toBe(200);
  });

  it("replace-from-bank never draws another teacher's question", async () => {
    const b = bank();
    await b.create(multi("teacher-a"), "key-aaaa-0006", mc("سؤال المعلم أ", "PRIVATE_A"));
    expect((await b.replace(multi("teacher-b"), "PRIVATE_A")).status).toBe(500);           // no candidate for B
    const own = await b.replace(multi("teacher-a"), "PRIVATE_A");
    expect(own.status).toBe(200);
    expect(own.jsonBody.question.text).toBe("سؤال المعلم أ");
  });

  it("pre-tenancy questions stay shared until LEGACY_DATA_OWNER names their owner; the official bank always stays shared", async () => {
    const b = bank();
    expect(await b.list(multi("teacher-b"))).toContain(IMPORT + "-1");
    process.env.LEGACY_DATA_OWNER = "teacher-a";
    expect(await b.list(multi("teacher-a"))).toEqual([OFFICIAL + "-q1", IMPORT + "-1"].sort());
    expect(await b.list(multi("teacher-b"))).toEqual([OFFICIAL + "-q1"]);
    expect((await b.call(multi("teacher-b"), { action: "delete", id: IMPORT + "-1" })).status).toBe(404);
  });

  it("file import: the duplicate check never offers another teacher's text, and committed questions carry the owner", async () => {
    const b = bank();
    await b.create(multi("teacher-a"), "key-aaaa-0007", mc("سؤال المعلم أ", "PRIVATE_A"));
    const texts = async tenant => (await bankImport.loadAllBankQuestionTexts(b.mem.container, tenant)).map(t => t.text).sort();
    expect(await texts("teacher-b")).toEqual(["سؤال قديم", "ما هو IP؟"].sort());
    expect(await texts("teacher-a")).toContain("سؤال المعلم أ");
    expect(await texts(null)).toContain("سؤال المعلم أ");
    expect(bankImport.toIndexEntry({ id: "i1", questionNumber: "1", section: "BASIC", type: "shortAnswer", classification: { topic: "T", difficulty: 1 }, flags: { hasImage: false, requiresManualReview: true }, assets: [], reviewStatus: "classified", ownerId: "teacher-a" }, "import-x").ownerId).toBe("teacher-a");
  });
});
