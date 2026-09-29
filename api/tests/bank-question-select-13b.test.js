import { describe, it, expect, beforeEach } from "vitest";
import { handler, MAX_IDS } from "../src/functions/bank-question-select.js";
import { buildExamQuestion } from "../src/lib/bank-question-exam.js";
import { verifySignedAssetParams } from "../src/lib/builder-auth.js";

// Phase 13B — EXACT bank question retrieval for the Structured Builder's "add from Question Bank" picker. A READ path
// over the EXISTING bank store (index + sources) that converts through the unchanged canonical buildExamQuestion.

process.env.BUILDER_SESSION_SECRET = process.env.BUILDER_SESSION_SECRET || "test-signing-secret-13b";
const INDEX_BLOB = "index/questions-index.json";
const OFFICIAL = "791381-2025-exam", MANUAL = "manual", GONE = "import-gone-20260101-ffff";
let store, reads, writes;

function seed() {
  store = new Map(); reads = []; writes = 0;
  store.set(INDEX_BLOB, { questions: [
    { id: OFFICIAL + "-q1", sourceId: OFFICIAL, section: "BASIC", type: "multipleChoice", topic: "NETWORK_BASICS", difficulty: 2, difficultyLabel: "سهل", familyKey: "fam-a", reviewStatus: "classified", hasImage: false, secondaryTopics: ["OSI"] },
    { id: OFFICIAL + "-q2", sourceId: OFFICIAL, section: "INFRASTRUCTURE", type: "multiField", topic: "SUBNETTING", difficulty: 4, reviewStatus: "classified", hasImage: true, hasCLI: false, requiresCalculation: true },
    { id: MANUAL + "-k1", sourceId: MANUAL, section: "BASIC", type: "multiField", topic: "ROUTING", difficulty: 3, reviewStatus: "classified" },
    { id: MANUAL + "-open", sourceId: MANUAL, section: "BASIC", type: "shortAnswer", topic: "T", difficulty: 1, reviewStatus: "classified" },
    { id: GONE + "-1", sourceId: GONE, section: "BASIC", type: "multipleChoice", topic: "T", difficulty: 2, reviewStatus: "classified" },
    { id: OFFICIAL + "-stale", sourceId: OFFICIAL, section: "BASIC", type: "multipleChoice", topic: "T", difficulty: 2, reviewStatus: "classified" },
    { id: MANUAL + "-multi", sourceId: MANUAL, section: "BASIC", type: "multiPart", topic: "T", difficulty: 2, reviewStatus: "classified" }
  ] });
  store.set("sources/" + OFFICIAL + ".json", { questions: [
    { id: OFFICIAL + "-q1", sourceId: OFFICIAL, sourceQuestionId: "1", questionNumber: "1", section: "BASIC", type: "multipleChoice", text: "ما هو IP؟", textHtml: "<p>ما هو IP؟</p>", options: [{ value: "A", label: "A", text: "بروتوكول", order: 0 }, { value: "B", label: "B", text: "كابل", order: 1 }], answer: { mode: "singleChoice", correctOptionValue: "A", correctOptionIndex: 0, correctText: "بروتوكول", values: ["A"] }, assets: [], hint: "فكّر" },
    { id: OFFICIAL + "-q2", sourceId: OFFICIAL, sourceQuestionId: "2", questionNumber: "2", section: "INFRASTRUCTURE", type: "multiField", text: "أكمل: قناع الشبكة ____", fields: [{ id: "f1", label: "الفراغ", kind: "text", correct: "255.255.255.0", order: 1 }], answer: { mode: "exactSequence", values: ["255.255.255.0"] }, assets: [{ id: "img-2", blobName: "official/q2.png", contentType: "image/png" }] }
  ] });
  store.set("sources/" + MANUAL + ".json", { questions: [
    { id: MANUAL + "-k1", sourceId: MANUAL, type: "multiField", text: "اختر: ____", fields: [{ id: "f1", label: "الأول", kind: "select", options: [{ value: "OSPF", text: "OSPF" }, { value: "RIP", text: "RIP" }], correct: "OSPF" }], wordBank: ["OSPF", "RIP"], answer: { mode: "exactSequence", values: ["OSPF"] }, assets: [] },
    { id: MANUAL + "-open", sourceId: MANUAL, type: "shortAnswer", text: "عرّف VLAN", answer: { mode: "anyAccepted", values: ["شبكة افتراضية"] }, assets: [] },
    { id: MANUAL + "-multi", sourceId: MANUAL, type: "multiPart", text: "مركّب", parts: [{ id: "p1", text: "أ" }], answer: {}, assets: [] },
    { id: MANUAL + "-unindexed", sourceId: MANUAL, type: "shortAnswer", text: "بلا فهرس", answer: { mode: "manual", values: [] }, assets: [], classification: { topic: "ORPHAN", difficulty: 5 } }
  ] });
}
const notFound = k => Object.assign(new Error("The specified blob does not exist: " + k), { statusCode: 404, code: "BlobNotFound" });
function deps(extra = {}) {
  return {
    requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }),
    getBankContainer: () => ({}),
    downloadJson: async (_c, k) => { reads.push(k); if (store.has(k)) return structuredClone(store.get(k)); throw notFound(k); },
    listJson: async (_c, prefix) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
    uploadJson: async () => { writes += 1; }, mutateJsonWithRetry: async () => { writes += 1; },
    ...extra
  };
}
const call = (body, d = deps()) => handler({ method: "POST", url: "http://x/api/bank-question-select", json: async () => body }, d);
const snapshot = () => JSON.stringify([...store.entries()]);

beforeEach(seed);

describe("13B exact bank selection — contract", () => {
  it("builder authentication is required (the auth response is returned untouched; nothing is read)", async () => {
    const r = await call({ ids: [OFFICIAL + "-q1"] }, deps({ requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) }));
    expect(r.status).toBe(401); expect(reads).toEqual([]);
  });
  it("invalid body / ids: not an array, empty, non-string, unsafe id, too many → 400 with an Arabic error; nothing is read", async () => {
    for (const body of [{}, { ids: "x" }, { ids: [] }, { ids: [5] }, { ids: ["../etc"] }, { ids: ["a b"] }, { ids: Array.from({ length: MAX_IDS + 1 }, (_, i) => "id-" + i) }]) {
      const r = await call(body);
      expect(r.status).toBe(400); expect(r.jsonBody.ok).toBe(false); expect(typeof r.jsonBody.error).toBe("string");
    }
    expect(reads).toEqual([]);
    expect(MAX_IDS).toBe(50);
  });
  it("returns EXACTLY the requested ids, in the REQUESTED order, converted through the canonical converter; duplicates in the request collapse", async () => {
    const r = await call({ ids: [MANUAL + "-k1", OFFICIAL + "-q1", MANUAL + "-k1", OFFICIAL + "-q2"] });
    expect(r.status).toBe(200);
    expect(r.jsonBody.questions.map(q => q.bankQuestionId)).toEqual([MANUAL + "-k1", OFFICIAL + "-q1", OFFICIAL + "-q2"]);
    const expected = buildExamQuestion(store.get("sources/" + OFFICIAL + ".json").questions[0], store.get(INDEX_BLOB).questions[0], { examQuestionId: "", marks: 0 });
    const got = r.jsonBody.questions[1];
    expect({ ...got, image: undefined }).toEqual({ ...expected, image: undefined });                 // same converter, same output (assets signed per call)
    expect(got).toMatchObject({ origin: "bank", presentationType: "multipleChoice", topic: "NETWORK_BASICS", difficulty: 2, difficultyLabel: "سهل", familyKey: "fam-a", secondaryTopics: ["OSI"], questionNumber: "1", sourceQuestionId: "1", hint: "فكّر", textHtml: "<p>ما هو IP؟</p>" });
    expect(got.answer).toEqual({ mode: "singleChoice", correctOptionValue: "A", correctOptionIndex: 0, correctText: "بروتوكول", values: ["A"] });   // answer structure preserved
    expect(got.examQuestionId).toBe("");                                                             // identity is the CLIENT's to assign
    expect(r.jsonBody.questions[0]).toMatchObject({ presentationType: "wordBank", wordBank: ["OSPF", "RIP"] });
    expect(r.jsonBody.questions[0].fields[0].options).toHaveLength(2);
  });
  it("image assets are signed for /api/question-image with a signature the verifier accepts", async () => {
    const r = await call({ ids: [OFFICIAL + "-q2"] });
    const asset = r.jsonBody.questions[0].image.assets[0];
    expect(r.jsonBody.questions[0].image).toMatchObject({ exists: true, visible: true, origin: "bank" });
    const u = new URL("http://x" + asset.dataUrl);
    expect(u.pathname).toBe("/api/question-image");
    expect(u.searchParams.get("blob")).toBe("official/q2.png");
    expect(verifySignedAssetParams("official/q2.png", Number(u.searchParams.get("exp")), u.searchParams.get("sig"))).toBe(true);
    expect(asset).toMatchObject({ id: "img-2", origin: "bank", blobName: "official/q2.png", contentType: "image/png" });
  });
  it("each source document is read once per request (no per-id re-download)", async () => {
    await call({ ids: [OFFICIAL + "-q1", OFFICIAL + "-q2", MANUAL + "-k1", MANUAL + "-open"] });
    expect(reads.filter(k => k.startsWith("sources/")).sort()).toEqual(["sources/" + OFFICIAL + ".json", "sources/" + MANUAL + ".json"].sort());
  });
});

describe("13B exact bank selection — source authority, failures, read-only", () => {
  it("the source document is the authority: an index entry whose question is gone from its source → 404 with the missing id; NOTHING is returned", async () => {
    const r = await call({ ids: [OFFICIAL + "-q1", OFFICIAL + "-stale"] });
    expect(r.status).toBe(404);
    expect(r.jsonBody).toMatchObject({ ok: false, missingIds: [OFFICIAL + "-stale"] });
    expect(r.jsonBody.questions).toBeUndefined();
  });
  it("a stale index entry whose source BLOB is missing (404 / BlobNotFound) never creates a fake question → 404 missing", async () => {
    const r = await call({ ids: [GONE + "-1"] });
    expect(r.status).toBe(404);
    expect(r.jsonBody.missingIds).toEqual([GONE + "-1"]);
  });
  it("an id with no index entry is located in its source document (source is authority) and converted from the stored classification", async () => {
    const r = await call({ ids: [MANUAL + "-unindexed"] });
    expect(r.status).toBe(200);
    expect(r.jsonBody.questions[0]).toMatchObject({ bankQuestionId: MANUAL + "-unindexed", topic: "ORPHAN", difficulty: 5, presentationType: "open" });
  });
  it("an unknown id → 404 missing (never a partial 200)", async () => {
    const r = await call({ ids: [OFFICIAL + "-q1", "manual-nope"] });
    expect(r.status).toBe(404); expect(r.jsonBody.missingIds).toEqual(["manual-nope"]);
  });
  it("a REAL storage failure (503 / auth / timeout) is surfaced as 500 — never swallowed into 'missing', no partial result, no details leaked", async () => {
    for (const err of [Object.assign(new Error("busy account=secret-account"), { statusCode: 503, code: "ServerBusy" }), Object.assign(new Error("auth"), { statusCode: 403 }), new Error("ETIMEDOUT")]) {
      seed();
      const r = await call({ ids: [OFFICIAL + "-q1"] }, deps({ downloadJson: async (_c, k) => { reads.push(k); if (k === INDEX_BLOB) return structuredClone(store.get(k)); throw err; } }));
      expect(r.status).toBe(500);
      expect(r.jsonBody.ok).toBe(false);
      expect(r.jsonBody.missingIds).toBeUndefined();
      expect(JSON.stringify(r.jsonBody)).not.toContain("secret-account");
    }
  });
  it("an unsupported bank question (multiPart) is rejected clearly (422) and nothing else in the batch is returned", async () => {
    const r = await call({ ids: [OFFICIAL + "-q1", MANUAL + "-multi"] });
    expect(r.status).toBe(422);
    expect(r.jsonBody).toMatchObject({ ok: false, unsupportedIds: [MANUAL + "-multi"] });
    expect(r.jsonBody.questions).toBeUndefined();
  });
  it("never writes to the bank store", async () => {
    const before = snapshot();
    await call({ ids: [OFFICIAL + "-q1", MANUAL + "-open"] });
    await call({ ids: [GONE + "-1"] });
    expect(writes).toBe(0);
    expect(snapshot()).toBe(before);
  });
  it("GET is not accepted (POST only)", async () => {
    const r = await handler({ method: "GET", url: "http://x/api/bank-question-select", json: async () => ({}) }, deps());
    expect(r.status).toBe(405);
  });
});
