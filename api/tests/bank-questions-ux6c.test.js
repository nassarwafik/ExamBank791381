import { describe, it, expect, beforeEach } from "vitest";
import { handler, validateQuestionInput, normalizeInput, isOfficialSource, presentationTypeFromBankQuestion, INDEX_BLOB, SOURCES_PREFIX, MANUAL_SOURCE_ID } from "../src/functions/bank-questions.js";

// UX-6c — Question Bank management over the EXISTING store (index + sources/*.json) through the handler's DI seam,
// on an in-memory blob map. Official sources stay read-only; every write is a mutateJsonWithRetry mutation.

const OFFICIAL = "791381-2025-exam";
const IMPORT = "import-quiz-20260301-abc123";
let store, audits, conflictsToInject;

function seed() {
  store.set(SOURCES_PREFIX + OFFICIAL + ".json", { questions: [
    { id: OFFICIAL + "-q1", sourceId: OFFICIAL, questionNumber: "1", section: "BASIC", type: "multipleChoice", text: "ما هو IP؟", options: [{ value: "A", text: "بروتوكول", order: 0 }, { value: "B", text: "كابل", order: 1 }], answer: { mode: "singleChoice", correctOptionValue: "A", values: ["A"] }, assets: [], classification: { topic: "NETWORK_BASICS", difficulty: 2 }, reviewStatus: "classified" },
    { id: OFFICIAL + "-q2", sourceId: OFFICIAL, questionNumber: "2", section: "INFRASTRUCTURE", type: "multiField", fields: [{ id: "f1", label: "الفراغ" }], text: "أكمل: قناع الشبكة ____", answer: { mode: "anyAccepted", values: ["255.255.255.0"] }, assets: [{ blobName: "x.png" }], classification: { topic: "SUBNETTING", difficulty: 4 }, reviewStatus: "classified" }
  ] });
  store.set(SOURCES_PREFIX + IMPORT + ".json", { questions: [
    { id: IMPORT + "-1", sourceId: IMPORT, questionNumber: "1", section: "BASIC", type: "shortAnswer", text: "عرّف VLAN", options: [], answer: { mode: "manual", values: [] }, assets: [], classification: { topic: "SWITCHING", difficulty: 3 }, reviewStatus: "pending-classification" }
  ], original: { importJobId: "j1", fileName: "quiz.docx" } });
  store.set(INDEX_BLOB, { questions: [
    { id: OFFICIAL + "-q1", sourceId: OFFICIAL, section: "BASIC", type: "multipleChoice", topic: "NETWORK_BASICS", difficulty: 2, reviewStatus: "classified", hasImage: false },
    { id: OFFICIAL + "-q2", sourceId: OFFICIAL, section: "INFRASTRUCTURE", type: "multiField", topic: "SUBNETTING", difficulty: 4, reviewStatus: "classified", hasImage: true },
    { id: IMPORT + "-1", sourceId: IMPORT, section: "BASIC", type: "shortAnswer", topic: "SWITCHING", difficulty: 3, reviewStatus: "pending-classification", hasImage: false }
  ] });
}
class StorageConflictError extends Error { constructor() { super("conflict"); this.name = "StorageConflictError"; } }
function deps(extra = {}) {
  return {
    requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }),
    getBankContainer: () => ({}),
    getPlatformContainer: () => ({}),
    downloadJsonOrNull: async (_c, k) => (store.has(k) ? structuredClone(store.get(k)) : null),
    listJson: async (_c, prefix) => [...store.entries()].filter(([k]) => k.startsWith(prefix) && k.endsWith(".json")).map(([, v]) => structuredClone(v)),
    mutateJsonWithRetry: async (_c, k, fn) => {
      if (conflictsToInject > 0) { conflictsToInject -= 1; throw new StorageConflictError(); }
      const cur = store.has(k) ? structuredClone(store.get(k)) : null; const next = await fn(cur); store.set(k, structuredClone(next)); return next;
    },
    isConcurrencyConflict: e => e instanceof StorageConflictError,
    recordAuditEvent: async (_c, ev) => { audits.push(ev); },
    now: () => "2026-09-17T12:00:00.000Z",
    newQuestionId: () => "manual-fixed-1",
    ...extra
  };
}
const get = (d = deps()) => handler({ method: "GET", url: "http://x/bank-questions", params: {} }, d);
const post = (body, d = deps()) => handler({ method: "POST", url: "http://x/bank-questions", params: {}, json: async () => body }, d);
const validMC = () => ({ section: "BASIC", topic: "NETWORK_BASICS", difficulty: 2, presentationType: "multipleChoice", text: "ما هو الراوتر؟", options: [{ value: "a", text: "جهاز توجيه" }, { value: "b", text: "كابل" }], answer: { correctOptionValue: "a" } });
const sourceQuestions = id => store.get(SOURCES_PREFIX + id + ".json").questions;
const indexIds = () => store.get(INDEX_BLOB).questions.map(q => q.id);

beforeEach(() => { store = new Map(); audits = []; conflictsToInject = 0; seed(); });

describe("pure helpers", () => {
  it("official sources are recognised by id prefix or exam code; imports and manual are not", () => {
    expect(isOfficialSource("791381-2025-exam")).toBe(true); expect(isOfficialSource("791367-2024")).toBe(true); expect(isOfficialSource("x", "791381")).toBe(true);
    expect(isOfficialSource(IMPORT)).toBe(false); expect(isOfficialSource(MANUAL_SOURCE_ID)).toBe(false);
  });
  it("presentation type derives from the bank type exactly like question-bank-action", () => {
    expect(presentationTypeFromBankQuestion({ type: "multipleChoice" })).toBe("multipleChoice");
    expect(presentationTypeFromBankQuestion({ type: "multiField", fields: [{ id: "f" }] })).toBe("fillBlank");
    expect(presentationTypeFromBankQuestion({ type: "multiField", fields: [{ kind: "select" }] })).toBe("wordBank");
    expect(presentationTypeFromBankQuestion({ type: "shortAnswer" })).toBe("open");
  });
  it("validation rejects empty text, bad section, missing topic, out-of-range difficulty, unknown type, MC without two options or a correct answer", () => {
    expect(validateQuestionInput(validMC()).ok).toBe(true);
    expect(validateQuestionInput({ ...validMC(), text: "  " }).errors).toContain("نص السؤال مطلوب.");
    expect(validateQuestionInput({ ...validMC(), section: "LEGACY" }).errors).toContain("القسم يجب أن يكون BASIC أو INFRASTRUCTURE.");
    expect(validateQuestionInput({ ...validMC(), topic: "" }).errors).toContain("الموضوع مطلوب.");
    expect(validateQuestionInput({ ...validMC(), difficulty: 0 }).errors).toContain("الصعوبة يجب أن تكون رقمًا من 1 إلى 5.");
    expect(validateQuestionInput({ ...validMC(), difficulty: 2.5 }).ok).toBe(false);
    expect(validateQuestionInput({ ...validMC(), presentationType: "essay" }).errors).toContain("نوع السؤال غير معروف.");
    expect(validateQuestionInput({ ...validMC(), options: [{ value: "a", text: "x" }] }).errors).toContain("سؤال الاختيار من متعدد يحتاج خيارين على الأقل.");
    expect(validateQuestionInput({ ...validMC(), answer: { correctOptionValue: "zz" } }).errors).toContain("حدّد الإجابة الصحيحة من بين الخيارات.");
    expect(validateQuestionInput({ ...validMC(), options: [{ value: "a", text: "" }, { value: "b", text: "y" }] }).errors).toContain("الخيار 1 بلا نص.");
    expect(validateQuestionInput(null).ok).toBe(false);
  });
  it("an open / fill-blank question needs no options; empty accepted values mean manual grading, non-empty mean anyAccepted", () => {
    const open = { section: "BASIC", topic: "T", difficulty: 1, presentationType: "open", text: "اشرح", answer: { values: [] } };
    expect(validateQuestionInput(open).ok).toBe(true);
    expect(normalizeInput(open).answer).toEqual({ mode: "manual", values: [] });
    expect(normalizeInput({ ...open, presentationType: "fillBlank", answer: { values: [" 10 ", "", "0x0A"] } }).answer).toEqual({ mode: "anyAccepted", values: ["10", "0x0A"] });
    expect(normalizeInput({ ...open, presentationType: "fillBlank" }).type).toBe("multiField");
    expect(normalizeInput(open).type).toBe("shortAnswer");
  });
  it("normalize builds canonical MC options and a singleChoice answer carrying value, index, text and values[]", () => {
    const n = normalizeInput(validMC());
    expect(n.type).toBe("multipleChoice");
    expect(n.options).toEqual([{ value: "a", label: "جهاز توجيه", text: "جهاز توجيه", textHtml: "", order: 0 }, { value: "b", label: "كابل", text: "كابل", textHtml: "", order: 1 }]);
    expect(n.answer).toEqual({ mode: "singleChoice", correctOptionValue: "a", correctOptionIndex: 0, correctText: "جهاز توجيه", values: ["a"] });
  });
});

describe("GET list", () => {
  it("requires builder auth", async () => {
    const r = await get(deps({ requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }) }));
    expect(r.status).toBe(401);
  });
  it("returns one row per bank question with content from the source document and classification from the index; official flag per source", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    const rows = r.jsonBody.questions;
    expect(rows).toHaveLength(3);
    const q1 = rows.find(x => x.id === OFFICIAL + "-q1");
    expect(q1).toMatchObject({ official: true, sourceKind: "official", section: "BASIC", topic: "NETWORK_BASICS", difficulty: 2, presentationType: "multipleChoice", text: "ما هو IP؟", hasImage: false });
    expect(q1.options).toEqual([{ value: "A", text: "بروتوكول" }, { value: "B", text: "كابل" }]);
    expect(rows.find(x => x.id === OFFICIAL + "-q2")).toMatchObject({ presentationType: "fillBlank", hasImage: true, difficulty: 4 });
    expect(rows.find(x => x.id === IMPORT + "-1")).toMatchObject({ official: false, sourceKind: "import", presentationType: "open", reviewStatus: "pending-classification" });
    expect(r.jsonBody.sections).toEqual(["BASIC", "INFRASTRUCTURE"]);
  });
  it("a question missing from the index still lists (source document is the content authority) with its own classification", async () => {
    store.get(INDEX_BLOB).questions = store.get(INDEX_BLOB).questions.filter(q => q.id !== IMPORT + "-1");
    const rows = (await get()).jsonBody.questions;
    expect(rows.find(x => x.id === IMPORT + "-1")).toMatchObject({ topic: "SWITCHING", difficulty: 3 });
  });
});

describe("create", () => {
  it("validates server-side and returns the first error plus the full list; nothing is written", async () => {
    const r = await post({ action: "create", question: { ...validMC(), text: "" } });
    expect(r.status).toBe(400); expect(r.jsonBody.error).toBe("نص السؤال مطلوب."); expect(r.jsonBody.errors).toContain("نص السؤال مطلوب.");
    expect(store.has(SOURCES_PREFIX + MANUAL_SOURCE_ID + ".json")).toBe(false);
    expect(indexIds()).toHaveLength(3);
  });
  it("writes the canonical question into sources/manual.json AND the index (both via mutate), stamps actor/time, returns the row", async () => {
    const r = await post({ action: "create", question: validMC() });
    expect(r.status).toBe(200);
    expect(r.jsonBody.question).toMatchObject({ id: "manual-fixed-1", sourceId: "manual", sourceKind: "manual", official: false, section: "BASIC", topic: "NETWORK_BASICS", difficulty: 2, presentationType: "multipleChoice", text: "ما هو الراوتر؟", reviewStatus: "classified", createdAt: "2026-09-17T12:00:00.000Z" });
    const stored = sourceQuestions(MANUAL_SOURCE_ID);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: "manual-fixed-1", sourceId: "manual", type: "multipleChoice", section: "BASIC", createdBy: "t1", reviewStatus: "classified", classification: { topic: "NETWORK_BASICS", difficulty: 2, status: "classified" }, flags: { hasImage: false, hasOptions: true, requiresManualReview: false } });
    expect(stored[0].answer).toEqual({ mode: "singleChoice", correctOptionValue: "a", correctOptionIndex: 0, correctText: "جهاز توجيه", values: ["a"] });
    const entry = store.get(INDEX_BLOB).questions.find(q => q.id === "manual-fixed-1");
    expect(entry).toMatchObject({ sourceId: "manual", section: "BASIC", type: "multipleChoice", topic: "NETWORK_BASICS", difficulty: 2, reviewStatus: "classified", hasImage: false });
    expect(indexIds()).toHaveLength(4);
    expect(audits).toEqual([{ actor: "t1", action: "bank.question.create", targetType: "bankQuestion", targetId: "manual-fixed-1", details: { sourceId: "manual", section: "BASIC" } }]);
  });
  it("a second create appends (existing manual questions preserved) and never reuses an id", async () => {
    await post({ action: "create", question: validMC() });
    const r = await post({ action: "create", question: { ...validMC(), text: "ثانٍ" } }, deps({ newQuestionId: () => "manual-fixed-2" }));
    expect(r.status).toBe(200);
    expect(sourceQuestions(MANUAL_SOURCE_ID).map(q => q.id)).toEqual(["manual-fixed-1", "manual-fixed-2"]);
  });
  it("an id collision inside the manual source is rejected as a conflict, never overwritten", async () => {
    await post({ action: "create", question: validMC() });
    const r = await post({ action: "create", question: { ...validMC(), text: "آخر" } });
    expect(r.status).toBe(409);
    expect(sourceQuestions(MANUAL_SOURCE_ID)).toHaveLength(1);
    expect(sourceQuestions(MANUAL_SOURCE_ID)[0].text).toBe("ما هو الراوتر؟");
  });
  it("a storage concurrency conflict surfaces as 409 with an Arabic retry message (no partial fake success)", async () => {
    conflictsToInject = 1;
    const r = await post({ action: "create", question: validMC() });
    expect(r.status).toBe(409); expect(r.jsonBody.error).toContain("تعديل متزامن");
    expect(store.has(SOURCES_PREFIX + MANUAL_SOURCE_ID + ".json")).toBe(false);
  });
});

describe("update", () => {
  it("rejects malformed ids and unknown ids", async () => {
    expect((await post({ action: "update", id: "../x", question: validMC() })).status).toBe(400);
    expect((await post({ action: "update", id: "", question: validMC() })).status).toBe(400);
    expect((await post({ action: "update", id: "nope-1", question: validMC() })).status).toBe(404);
  });
  it("official bank questions are read-only: 403 and untouched", async () => {
    const before = structuredClone(store.get(SOURCES_PREFIX + OFFICIAL + ".json"));
    const r = await post({ action: "update", id: OFFICIAL + "-q1", question: validMC() });
    expect(r.status).toBe(403); expect(r.jsonBody.error).toContain("للقراءة فقط");
    expect(store.get(SOURCES_PREFIX + OFFICIAL + ".json")).toEqual(before);
  });
  it("edits an imported question in place: content + classification + index entry updated, id and import metadata preserved", async () => {
    const r = await post({ action: "update", id: IMPORT + "-1", question: { section: "INFRASTRUCTURE", topic: "VLAN", difficulty: 4, presentationType: "fillBlank", text: "أكمل: VLAN هي ____", answer: { values: ["شبكة افتراضية"] } } });
    expect(r.status).toBe(200);
    expect(r.jsonBody.question).toMatchObject({ id: IMPORT + "-1", section: "INFRASTRUCTURE", topic: "VLAN", difficulty: 4, presentationType: "fillBlank", text: "أكمل: VLAN هي ____", updatedAt: "2026-09-17T12:00:00.000Z", official: false });
    const stored = sourceQuestions(IMPORT)[0];
    expect(stored).toMatchObject({ id: IMPORT + "-1", sourceId: IMPORT, type: "multiField", text: "أكمل: VLAN هي ____", updatedBy: "t1", answer: { mode: "anyAccepted", values: ["شبكة افتراضية"] }, classification: { topic: "VLAN", difficulty: 4, status: "classified" } });
    expect(store.get(SOURCES_PREFIX + IMPORT + ".json").original).toEqual({ importJobId: "j1", fileName: "quiz.docx" });
    expect(store.get(INDEX_BLOB).questions.find(q => q.id === IMPORT + "-1")).toMatchObject({ section: "INFRASTRUCTURE", type: "multiField", topic: "VLAN", difficulty: 4, reviewStatus: "classified" });
    expect(indexIds()).toHaveLength(3);
  });
  it("validation failure leaves the stored question untouched", async () => {
    const before = structuredClone(store.get(SOURCES_PREFIX + IMPORT + ".json"));
    const r = await post({ action: "update", id: IMPORT + "-1", question: { ...validMC(), options: [] } });
    expect(r.status).toBe(400);
    expect(store.get(SOURCES_PREFIX + IMPORT + ".json")).toEqual(before);
  });
  it("a question whose index entry is missing is still located through the source documents", async () => {
    store.get(INDEX_BLOB).questions = store.get(INDEX_BLOB).questions.filter(q => q.id !== IMPORT + "-1");
    const r = await post({ action: "update", id: IMPORT + "-1", question: validMC() });
    expect(r.status).toBe(200);
    expect(indexIds()).toContain(IMPORT + "-1");                                   // re-indexed by the update
  });
});

describe("delete", () => {
  it("official → 403; unknown → 404; malformed → 400", async () => {
    expect((await post({ action: "delete", id: OFFICIAL + "-q2" })).status).toBe(403);
    expect((await post({ action: "delete", id: "missing-9" })).status).toBe(404);
    expect((await post({ action: "delete", id: "bad id!" })).status).toBe(400);
    expect(sourceQuestions(OFFICIAL)).toHaveLength(2);
  });
  it("removes the question from its source document and from the index; other questions and other sources untouched; audited", async () => {
    await post({ action: "create", question: validMC() });
    const r = await post({ action: "delete", id: IMPORT + "-1" });
    expect(r.status).toBe(200); expect(r.jsonBody).toEqual({ ok: true, deleted: true, id: IMPORT + "-1" });
    expect(sourceQuestions(IMPORT)).toEqual([]);
    expect(store.get(SOURCES_PREFIX + IMPORT + ".json").original).toBeTruthy();   // the source document itself is kept
    expect(indexIds().sort()).toEqual([OFFICIAL + "-q1", OFFICIAL + "-q2", "manual-fixed-1"].sort());
    expect(sourceQuestions(OFFICIAL)).toHaveLength(2);
    expect(audits.at(-1)).toMatchObject({ action: "bank.question.delete", targetId: IMPORT + "-1" });
  });
  it("unknown action → 400", async () => {
    expect((await post({ action: "purge", id: IMPORT + "-1" })).status).toBe(400);
  });
});
