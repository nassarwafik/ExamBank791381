import { describe, it, expect, beforeEach } from "vitest";
import { handler, validateQuestionInput, normalizeInput, contentKey, questionIdForRequestKey, isOfficialSource, presentationTypeFromBankQuestion, INDEX_BLOB, SOURCES_PREFIX, MANUAL_SOURCE_ID } from "../src/functions/bank-questions.js";
import { handler as bankActionHandler, presentationTypeFromFullQuestion, buildExamQuestion } from "../src/functions/question-bank-action.js";
import { gradeQuestion } from "../src/lib/assignment-grading.js";
import { sanitizeQuestionForStudent } from "../src/lib/student-exam-sanitize.js";

// UX-6c — Question Bank management over the EXISTING store (index + sources/*.json) through the handler's DI seam,
// on an in-memory blob map. Official sources stay read-only; every write is a mutateJsonWithRetry mutation.
// Blocker coverage: (1) fillBlank / wordBank questions are stored in the canonical shape the Builder converts
// (question-bank-action's real handler), the student card renders and the grader grades; (2) the two-blob write is
// idempotent reconciliation — a failure injected by blob name + mutation ordinal converges on retry.

const OFFICIAL = "791381-2025-exam";
const IMPORT = "import-quiz-20260301-abc123";
let store, audits, conflictsToInject, failures, mutationCounts, mutationLog;

function seed() {
  store.set(SOURCES_PREFIX + OFFICIAL + ".json", { questions: [
    { id: OFFICIAL + "-q1", sourceId: OFFICIAL, questionNumber: "1", section: "BASIC", type: "multipleChoice", text: "ما هو IP؟", options: [{ value: "A", text: "بروتوكول", order: 0 }, { value: "B", text: "كابل", order: 1 }], answer: { mode: "singleChoice", correctOptionValue: "A", values: ["A"] }, assets: [], classification: { topic: "NETWORK_BASICS", difficulty: 2 }, reviewStatus: "classified" },
    { id: OFFICIAL + "-q2", sourceId: OFFICIAL, questionNumber: "2", section: "INFRASTRUCTURE", type: "multiField", fields: [{ id: "f1", label: "الفراغ" }], text: "أكمل: قناع الشبكة ____", answer: { mode: "exactSequence", values: ["255.255.255.0"] }, assets: [{ blobName: "x.png" }], classification: { topic: "SUBNETTING", difficulty: 4 }, reviewStatus: "classified" }
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
// Storage seam: `failures` injects an error for the N-th mutation (1-based ordinal, counted per blob name across the
// test) of a given blob — `{ blob, ordinal, error }` — BEFORE anything is written, exactly like a failed upload.
function deps(extra = {}) {
  return {
    requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }),
    getBankContainer: () => ({}),
    getPlatformContainer: () => ({}),
    downloadJsonOrNull: async (_c, k) => (store.has(k) ? structuredClone(store.get(k)) : null),
    listJson: async (_c, prefix) => [...store.entries()].filter(([k]) => k.startsWith(prefix) && k.endsWith(".json")).map(([, v]) => structuredClone(v)),
    mutateJsonWithRetry: async (_c, k, fn) => {
      if (conflictsToInject > 0) { conflictsToInject -= 1; throw new StorageConflictError(); }
      mutationCounts.set(k, (mutationCounts.get(k) || 0) + 1);
      const hit = failures.find(f => f.blob === k && f.ordinal === mutationCounts.get(k));
      if (hit) throw hit.error || new Error("injected storage failure");
      const cur = store.has(k) ? structuredClone(store.get(k)) : null; const next = await fn(cur); store.set(k, structuredClone(next)); mutationLog.push(k); return next;
    },
    isConcurrencyConflict: e => e instanceof StorageConflictError,
    recordAuditEvent: async (_c, ev) => { audits.push(ev); },
    now: () => "2026-09-17T12:00:00.000Z",
    ...extra
  };
}
const get = (d = deps()) => handler({ method: "GET", url: "http://x/bank-questions", params: {} }, d);
// A create ALWAYS needs a requestKey (operation-level idempotency); the helper adds the fixed one unless the test sets its own.
const KEY1 = "fixed-00001";
const post = (body, d = deps()) => handler({ method: "POST", url: "http://x/bank-questions", params: {}, json: async () => (body?.action === "create" && !("requestKey" in body) ? { ...body, requestKey: KEY1 } : body) }, d);
const postRaw = (body, d = deps()) => handler({ method: "POST", url: "http://x/bank-questions", params: {}, json: async () => body }, d);
const validMC = () => ({ section: "BASIC", topic: "NETWORK_BASICS", difficulty: 2, presentationType: "multipleChoice", text: "ما هو الراوتر؟", options: [{ value: "a", text: "جهاز توجيه" }, { value: "b", text: "كابل" }], answer: { correctOptionValue: "a" } });
const validFill = () => ({ section: "INFRASTRUCTURE", topic: "SUBNETTING_MANUAL", difficulty: 3, presentationType: "fillBlank", text: "أكمل: قناع الفئة C هو ____ وعنوان البث ____", fields: [{ label: "القناع", correct: "255.255.255.0" }, { label: "عنوان البث", correct: "192.168.1.255" }] });
const validWord = () => ({ section: "BASIC", topic: "ROUTING_MANUAL", difficulty: 2, presentationType: "wordBank", text: "اختر البروتوكول: ____ يعتمد الحالة، ____ يعتمد المسافة", fields: [{ label: "الأول", correct: "OSPF" }, { label: "الثاني", correct: "RIP" }], wordBank: ["OSPF", "RIP", "BGP", "EIGRP"] });
const validOpen = () => ({ section: "BASIC", topic: "T", difficulty: 1, presentationType: "open", text: "اشرح", answer: { values: [] } });
const sourceQuestions = id => (store.get(SOURCES_PREFIX + id + ".json")?.questions) || [];
const indexIds = () => store.get(INDEX_BLOB).questions.map(q => q.id);
const indexEntry = id => store.get(INDEX_BLOB).questions.find(q => q.id === id);
const storedManual = id => sourceQuestions(MANUAL_SOURCE_ID).find(q => q.id === id);
// The Builder's REAL "replace from bank" handler over the same in-memory store (its DI seam): what a teacher gets
// when they pick a question of this type / topic in the Builder. Missing blobs throw exactly like a 404 download.
const builderSelect = (presentationType, topic) => bankActionHandler({ json: async () => ({ question: { examQuestionId: "x1", marks: 2, section: "BASIC", topic, difficulty: 2, presentationType }, presentationType, topic }) }, {
  requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), getBankContainer: () => ({}),
  downloadJson: async (_c, k) => { if (!store.has(k)) throw Object.assign(new Error("The specified blob does not exist."), { statusCode: 404, code: "BlobNotFound" }); return structuredClone(store.get(k)); }
});

beforeEach(() => { store = new Map(); audits = []; conflictsToInject = 0; failures = []; mutationCounts = new Map(); mutationLog = []; seed(); });

describe("pure helpers", () => {
  it("official sources are recognised by id prefix or exam code; imports and manual are not", () => {
    expect(isOfficialSource("791381-2025-exam")).toBe(true); expect(isOfficialSource("791367-2024")).toBe(true); expect(isOfficialSource("x", "791381")).toBe(true);
    expect(isOfficialSource(IMPORT)).toBe(false); expect(isOfficialSource(MANUAL_SOURCE_ID)).toBe(false);
  });
  it("presentation type derives from the bank type exactly like question-bank-action (the SAME shared function)", () => {
    expect(presentationTypeFromBankQuestion).toBe(presentationTypeFromFullQuestion);
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
  it("fill-blank / word-bank validation: at least one blank, every blank has an expected value, a word bank has ≥ 2 distinct words and offers every expected value", () => {
    expect(validateQuestionInput(validFill()).ok).toBe(true);
    expect(validateQuestionInput(validWord()).ok).toBe(true);
    expect(validateQuestionInput({ ...validFill(), fields: [] }).errors).toContain("أضف فراغًا واحدًا على الأقل.");
    expect(validateQuestionInput({ ...validFill(), fields: undefined }).errors).toContain("أضف فراغًا واحدًا على الأقل.");
    expect(validateQuestionInput({ ...validFill(), fields: [{ label: "x", correct: " " }] }).errors).toContain("الفراغ 1 بلا إجابة صحيحة.");
    expect(validateQuestionInput({ ...validWord(), wordBank: ["OSPF"] }).errors).toContain("بنك الكلمات يحتاج كلمتين مختلفتين على الأقل.");
    expect(validateQuestionInput({ ...validWord(), wordBank: ["OSPF", "OSPF", " "] }).errors).toContain("بنك الكلمات يحتاج كلمتين مختلفتين على الأقل.");
    expect(validateQuestionInput({ ...validWord(), wordBank: ["OSPF", "BGP"] }).errors).toEqual(["الإجابة الصحيحة للفراغ 2 غير موجودة في بنك الكلمات."]);
    expect(validateQuestionInput({ ...validWord(), wordBank: undefined }).errors).toContain("بنك الكلمات يحتاج كلمتين مختلفتين على الأقل.");
  });
  it("an open question needs no options; empty accepted values mean manual grading, non-empty mean anyAccepted", () => {
    expect(validateQuestionInput(validOpen()).ok).toBe(true);
    expect(normalizeInput(validOpen())).toMatchObject({ type: "shortAnswer", options: [], fields: [], wordBank: [], answer: { mode: "manual", values: [] } });
    expect(normalizeInput({ ...validOpen(), answer: { values: [" 10 ", "", "0x0A"] } }).answer).toEqual({ mode: "anyAccepted", values: ["10", "0x0A"] });
  });
  it("normalize builds canonical MC options and a singleChoice answer carrying value, index, text and values[]", () => {
    const n = normalizeInput(validMC());
    expect(n.type).toBe("multipleChoice");
    expect(n.options).toEqual([{ value: "a", label: "جهاز توجيه", text: "جهاز توجيه", textHtml: "", order: 0 }, { value: "b", label: "كابل", text: "كابل", textHtml: "", order: 1 }]);
    expect(n.answer).toEqual({ mode: "singleChoice", correctOptionValue: "a", correctOptionIndex: 0, correctText: "جهاز توجيه", values: ["a"] });
    expect(n.fields).toEqual([]); expect(n.wordBank).toEqual([]);
  });
  it("normalize builds canonical fill-blank fields (text kind, expected value on the field) with an exactSequence answer aligned to the fields", () => {
    const n = normalizeInput(validFill());
    expect(n.type).toBe("multiField");
    expect(n.fields).toEqual([
      { id: "f1", label: "القناع", labelHtml: "", order: 1, kind: "text", correct: "255.255.255.0" },
      { id: "f2", label: "عنوان البث", labelHtml: "", order: 2, kind: "text", correct: "192.168.1.255" }
    ]);
    expect(n.answer).toEqual({ mode: "exactSequence", values: ["255.255.255.0", "192.168.1.255"] });
    expect(n.options).toEqual([]); expect(n.wordBank).toEqual([]);
    expect(presentationTypeFromBankQuestion(n)).toBe("fillBlank");                                   // no type drift
    expect(normalizeInput({ ...validFill(), fields: [{ id: "custom-1", label: "x", correct: "1" }, { id: "custom-1", label: "y", correct: "2" }, { id: "bad id!", label: "z", correct: "3" }] }).fields.map(f => f.id)).toEqual(["custom-1", "f2", "f3"]);
  });
  it("normalize builds canonical word-bank fields (select kind, the choices on EVERY field) + wordBank[] with an exactSequence answer", () => {
    const n = normalizeInput({ ...validWord(), wordBank: ["OSPF", " RIP ", "BGP", "OSPF", ""] });
    expect(n.type).toBe("multiField");
    expect(n.wordBank).toEqual(["OSPF", "RIP", "BGP"]);
    const choices = [{ value: "OSPF", label: "OSPF", text: "OSPF", textHtml: "", order: 0 }, { value: "RIP", label: "RIP", text: "RIP", textHtml: "", order: 1 }, { value: "BGP", label: "BGP", text: "BGP", textHtml: "", order: 2 }];
    expect(n.fields).toEqual([
      { id: "f1", label: "الأول", labelHtml: "", order: 1, kind: "select", correct: "OSPF", options: choices },
      { id: "f2", label: "الثاني", labelHtml: "", order: 2, kind: "select", correct: "RIP", options: choices }
    ]);
    expect(n.answer).toEqual({ mode: "exactSequence", values: ["OSPF", "RIP"] });
    expect(presentationTypeFromBankQuestion(n)).toBe("wordBank");                                    // no type drift
  });
  it("round-trip invariant: for every type, the normalized question classifies back to the SAME presentation type through the Builder's function", () => {
    for (const input of [validMC(), validFill(), validWord(), validOpen()]) expect(presentationTypeFromBankQuestion(normalizeInput(input))).toBe(input.presentationType);
  });
  it("requestKey → deterministic manual id; malformed keys yield no id (and the create path has no fallback id generator)", () => {
    expect(questionIdForRequestKey("mfy1abc-x9k2")).toBe("manual-mfy1abc-x9k2");
    expect(questionIdForRequestKey("short")).toBeNull(); expect(questionIdForRequestKey("../etc")).toBeNull(); expect(questionIdForRequestKey(undefined)).toBeNull();
    expect(questionIdForRequestKey("a".repeat(65))).toBeNull(); expect(questionIdForRequestKey("has space1")).toBeNull(); expect(questionIdForRequestKey("-leading1")).toBeNull();
    expect(contentKey({ ...normalizeInput(validFill()), classification: { topic: "SUBNETTING_MANUAL", difficulty: 3 } })).toBe(contentKey({ ...normalizeInput(validFill()), classification: { topic: "SUBNETTING_MANUAL", difficulty: 3 } }));
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
    expect(rows.find(x => x.id === OFFICIAL + "-q2")).toMatchObject({ presentationType: "fillBlank", hasImage: true, difficulty: 4, fields: [{ id: "f1", label: "الفراغ", correct: "" }], wordBank: [] });
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
    expect(r.jsonBody.question).toMatchObject({ id: "manual-fixed-00001", sourceId: "manual", sourceKind: "manual", official: false, section: "BASIC", topic: "NETWORK_BASICS", difficulty: 2, presentationType: "multipleChoice", text: "ما هو الراوتر؟", reviewStatus: "classified", createdAt: "2026-09-17T12:00:00.000Z" });
    const stored = sourceQuestions(MANUAL_SOURCE_ID);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: "manual-fixed-00001", sourceId: "manual", type: "multipleChoice", section: "BASIC", createdBy: "t1", reviewStatus: "classified", classification: { topic: "NETWORK_BASICS", difficulty: 2, status: "classified" }, flags: { hasImage: false, hasOptions: true, requiresManualReview: false } });
    expect(stored[0].answer).toEqual({ mode: "singleChoice", correctOptionValue: "a", correctOptionIndex: 0, correctText: "جهاز توجيه", values: ["a"] });
    const entry = indexEntry("manual-fixed-00001");
    expect(entry).toMatchObject({ sourceId: "manual", section: "BASIC", type: "multipleChoice", topic: "NETWORK_BASICS", difficulty: 2, reviewStatus: "classified", hasImage: false });
    expect(indexIds()).toHaveLength(4);
    expect(audits).toEqual([{ actor: "t1", action: "bank.question.create", targetType: "bankQuestion", targetId: "manual-fixed-00001", details: { sourceId: "manual", section: "BASIC" } }]);
    expect(mutationLog).toEqual([SOURCES_PREFIX + "manual.json", INDEX_BLOB]);                     // source first, then index
  });
  it("a second create appends (existing manual questions preserved) and never reuses an id", async () => {
    await post({ action: "create", question: validMC() });
    const r = await post({ action: "create", question: { ...validMC(), text: "ثانٍ" }, requestKey: "fixed-00002" });
    expect(r.status).toBe(200);
    expect(sourceQuestions(MANUAL_SOURCE_ID).map(q => q.id)).toEqual(["manual-fixed-00001", "manual-fixed-00002"]);
  });
  it("an id collision inside the manual source with DIFFERENT content is rejected as a conflict, never overwritten", async () => {
    await post({ action: "create", question: validMC() });
    const r = await post({ action: "create", question: { ...validMC(), text: "آخر" } });
    expect(r.status).toBe(409);
    expect(sourceQuestions(MANUAL_SOURCE_ID)).toHaveLength(1);
    expect(sourceQuestions(MANUAL_SOURCE_ID)[0].text).toBe("ما هو الراوتر؟");
  });
  it("create WITHOUT a requestKey → 400 with an Arabic message; nothing is written to the source or the index (no fallback id)", async () => {
    const r = await postRaw({ action: "create", question: validMC() });
    expect(r.status).toBe(400); expect(r.jsonBody.error).toContain("requestKey");
    expect(store.has(SOURCES_PREFIX + MANUAL_SOURCE_ID + ".json")).toBe(false);
    expect(indexIds()).toHaveLength(3); expect(mutationLog).toEqual([]); expect(audits).toEqual([]);
  });
  it("create with a MALFORMED requestKey (too short / bad characters / too long / non-string) → 400, nothing written", async () => {
    for (const requestKey of ["short", "bad key!", "../../x", "a".repeat(65), 12345678, null, "", { key: "x" }]) {
      const r = await postRaw({ action: "create", question: validMC(), requestKey });
      expect(r.status, String(requestKey)).toBe(400); expect(r.jsonBody.error).toContain("requestKey");
    }
    expect(store.has(SOURCES_PREFIX + MANUAL_SOURCE_ID + ".json")).toBe(false);
    expect(indexIds()).toHaveLength(3); expect(mutationLog).toEqual([]);
  });
  it("the id is ALWAYS manual-<requestKey>: no deps hook and no generator can substitute another id", async () => {
    const r = await postRaw({ action: "create", question: validMC(), requestKey: "Key_9-abc" }, deps({ newQuestionId: () => "manual-other" }));
    expect(r.status).toBe(200); expect(r.jsonBody.question.id).toBe("manual-Key_9-abc");
    expect(sourceQuestions(MANUAL_SOURCE_ID).map(q => q.id)).toEqual(["manual-Key_9-abc"]);
    expect(indexIds()).toContain("manual-Key_9-abc"); expect(indexIds()).not.toContain("manual-other");
  });
  it("a storage concurrency conflict surfaces as 409 with an Arabic retry message (no partial fake success)", async () => {
    conflictsToInject = 1;
    const r = await post({ action: "create", question: validMC() });
    expect(r.status).toBe(409); expect(r.jsonBody.error).toContain("تعديل متزامن");
    expect(store.has(SOURCES_PREFIX + MANUAL_SOURCE_ID + ".json")).toBe(false);
  });
});

// ── BLOCKER 1: fillBlank / wordBank end-to-end (stored shape → index → GET → Builder conversion → student → grading)
describe("fill-blank and word-bank questions are usable end-to-end", () => {
  it("create fillBlank: stored source question carries real fields + exactSequence answer; index says multiField; GET row keeps presentationType fillBlank with editable fields", async () => {
    const r = await post({ action: "create", question: validFill() });
    expect(r.status).toBe(200);
    const stored = storedManual("manual-fixed-00001");
    expect(stored.type).toBe("multiField");
    expect(stored.fields).toHaveLength(2);
    expect(stored.fields[0]).toEqual({ id: "f1", label: "القناع", labelHtml: "", order: 1, kind: "text", correct: "255.255.255.0" });
    expect(stored.answer).toEqual({ mode: "exactSequence", values: ["255.255.255.0", "192.168.1.255"] });
    expect(stored.wordBank).toEqual([]); expect(stored.options).toEqual([]);
    expect(indexEntry("manual-fixed-00001")).toMatchObject({ sourceId: "manual", type: "multiField", section: "INFRASTRUCTURE", topic: "SUBNETTING_MANUAL", difficulty: 3, needsReview: false, reviewStatus: "classified" });
    const row = (await get()).jsonBody.questions.find(x => x.id === "manual-fixed-00001");
    expect(row).toMatchObject({ presentationType: "fillBlank", type: "multiField", fields: [{ id: "f1", label: "القناع", correct: "255.255.255.0" }, { id: "f2", label: "عنوان البث", correct: "192.168.1.255" }], wordBank: [] });
    expect(r.jsonBody.question).toEqual(row);
  });
  it("create wordBank: stored fields are select-kind with the choices, wordBank[] persisted, presentationType stays wordBank on GET (not reclassified as fillBlank)", async () => {
    const r = await post({ action: "create", question: validWord() });
    expect(r.status).toBe(200);
    const stored = storedManual("manual-fixed-00001");
    expect(stored.type).toBe("multiField");
    expect(stored.fields.map(f => f.kind)).toEqual(["select", "select"]);
    expect(stored.fields[0].options.map(o => o.text)).toEqual(["OSPF", "RIP", "BGP", "EIGRP"]);
    expect(stored.wordBank).toEqual(["OSPF", "RIP", "BGP", "EIGRP"]);
    expect(stored.answer).toEqual({ mode: "exactSequence", values: ["OSPF", "RIP"] });
    expect(presentationTypeFromBankQuestion(stored)).toBe("wordBank");
    const row = (await get()).jsonBody.questions.find(x => x.id === "manual-fixed-00001");
    expect(row).toMatchObject({ presentationType: "wordBank", wordBank: ["OSPF", "RIP", "BGP", "EIGRP"], fields: [{ id: "f1", label: "الأول", correct: "OSPF" }, { id: "f2", label: "الثاني", correct: "RIP" }] });
  });
  it("the Builder's real replace handler selects the created fillBlank question and converts it with non-empty fields; the sequence answer grades full / partial marks; the student copy has no keys", async () => {
    await post({ action: "create", question: validFill() });
    const r = await builderSelect("fillBlank", "SUBNETTING_MANUAL");
    expect(r.status).toBe(200);
    const q = r.jsonBody.question;
    expect(q).toMatchObject({ bankQuestionId: "manual-fixed-00001", origin: "bank", presentationType: "fillBlank", bankType: "multiField", section: "INFRASTRUCTURE", topic: "SUBNETTING_MANUAL", difficulty: 3, marks: 2 });
    expect(q.fields).toHaveLength(2); expect(q.fields[0].label).toBe("القناع"); expect(q.fields[0].kind).toBe("text");
    expect(q.wordBank).toBeUndefined();
    expect(q).toEqual(buildExamQuestion(storedManual("manual-fixed-00001"), indexEntry("manual-fixed-00001"), { examQuestionId: "x1", marks: 2 }));   // the shared helper, byte for byte
    expect(gradeQuestion(q, { kind: "sequence", values: ["255.255.255.0", "192.168.1.255"] })).toMatchObject({ score: 2, maxMarks: 2, correct: true, manualReview: false });
    expect(gradeQuestion(q, { kind: "sequence", values: ["255.255.255.0", "x"] })).toMatchObject({ score: 1, correct: false, manualReview: false });
    const student = sanitizeQuestionForStudent(q);
    expect(student.answer).toEqual({}); expect(student.fields.map(f => f.correct)).toEqual([undefined, undefined]);
    expect(student.fields.map(f => f.label)).toEqual(["القناع", "عنوان البث"]);
  });
  it("the Builder's real replace handler selects the created wordBank question AS a wordBank (never fillBlank): fields carry the choices, wordBank[] travels, grading works, the student copy keeps the choices without keys", async () => {
    await post({ action: "create", question: validWord() });
    expect((await builderSelect("fillBlank", "ROUTING_MANUAL")).status).toBe(500);                 // not offered as a fill-blank
    const r = await builderSelect("wordBank", "ROUTING_MANUAL");
    expect(r.status).toBe(200);
    const q = r.jsonBody.question;
    expect(q).toMatchObject({ bankQuestionId: "manual-fixed-00001", presentationType: "wordBank", wordBank: ["OSPF", "RIP", "BGP", "EIGRP"] });
    expect(q.fields.map(f => f.kind)).toEqual(["select", "select"]);
    expect(q.fields[1].options.map(o => o.text)).toEqual(["OSPF", "RIP", "BGP", "EIGRP"]);
    expect(gradeQuestion(q, { kind: "sequence", values: ["OSPF", "RIP"] })).toMatchObject({ score: 2, correct: true });
    expect(gradeQuestion(q, { kind: "sequence", values: ["RIP", "OSPF"] })).toMatchObject({ score: 0, correct: false, manualReview: false });
    const student = sanitizeQuestionForStudent(q);
    expect(student.fields.every(f => f.correct === undefined)).toBe(true);
    expect(student.fields[0].options.map(o => o.text)).toEqual(["OSPF", "RIP", "BGP", "EIGRP"]);
    expect(student.wordBank).toEqual(["OSPF", "RIP", "BGP", "EIGRP"]);
  });
  it("editing round-trip: the GET row's editable projection sent back as an update stores the identical content and the type never drifts (fillBlank and wordBank)", async () => {
    for (const [input, key] of [[validFill(), "k-fill-0001"], [validWord(), "k-word-0001"]]) {
      const created = await post({ action: "create", question: input, requestKey: key });
      const row = created.jsonBody.question;
      const before = storedManual(row.id);
      const back = { section: row.section, topic: row.topic, difficulty: row.difficulty, presentationType: row.presentationType, text: row.text, options: row.options, fields: row.fields, wordBank: row.wordBank, answer: {} };
      const r = await post({ action: "update", id: row.id, question: back }, deps({ now: () => "2026-09-17T13:00:00.000Z" }));
      expect(r.status).toBe(200);
      const after = storedManual(row.id);
      expect({ ...after, updatedAt: before.updatedAt, updatedBy: undefined }).toEqual({ ...before, updatedBy: undefined });
      expect(r.jsonBody.question.presentationType).toBe(input.presentationType);
      expect(presentationTypeFromBankQuestion(after)).toBe(input.presentationType);
    }
  });
  it("type switching rebuilds the structure — every transition leaves only the target type's structure and reclassifies exactly", async () => {
    const inputs = { multipleChoice: validMC, fillBlank: validFill, wordBank: validWord, open: () => ({ ...validOpen(), answer: { values: ["قبول"] } }) };
    const transitions = [["multipleChoice", "fillBlank"], ["multipleChoice", "wordBank"], ["fillBlank", "wordBank"], ["wordBank", "fillBlank"], ["fillBlank", "multipleChoice"], ["wordBank", "multipleChoice"], ["multipleChoice", "open"], ["fillBlank", "open"], ["wordBank", "open"], ["open", "fillBlank"], ["open", "wordBank"], ["open", "multipleChoice"]];
    let n = 0;
    for (const [from, to] of transitions) {
      const key = "fixed-000" + String(++n).padStart(2, "0"), id = "manual-" + key;
      expect((await post({ action: "create", question: inputs[from](), requestKey: key })).status).toBe(200);
      const r = await post({ action: "update", id, question: inputs[to]() });
      expect(r.status, from + "→" + to).toBe(200);
      const stored = storedManual(id);
      expect(presentationTypeFromBankQuestion(stored), from + "→" + to).toBe(to);
      expect(r.jsonBody.question.presentationType).toBe(to);
      expect(indexEntry(id).type).toBe(stored.type);
      if (to === "multipleChoice") { expect(stored.options).toHaveLength(2); expect(stored.fields).toEqual([]); expect(stored.wordBank).toEqual([]); expect(stored.answer.mode).toBe("singleChoice"); }
      if (to === "fillBlank") { expect(stored.options).toEqual([]); expect(stored.fields.map(f => f.kind)).toEqual(["text", "text"]); expect(stored.fields.every(f => !("options" in f))).toBe(true); expect(stored.wordBank).toEqual([]); expect(stored.answer).toEqual({ mode: "exactSequence", values: ["255.255.255.0", "192.168.1.255"] }); }
      if (to === "wordBank") { expect(stored.options).toEqual([]); expect(stored.fields.map(f => f.kind)).toEqual(["select", "select"]); expect(stored.wordBank).toHaveLength(4); expect(stored.answer).toEqual({ mode: "exactSequence", values: ["OSPF", "RIP"] }); }
      if (to === "open") { expect(stored.options).toEqual([]); expect(stored.fields).toEqual([]); expect(stored.wordBank).toEqual([]); expect(stored.answer).toEqual({ mode: "anyAccepted", values: ["قبول"] }); }
    }
  });
  it("an imported multiField question with no fields (pre-existing import shape) is healed on edit: the update must supply blanks, and afterwards the Builder can use it", async () => {
    store.get(SOURCES_PREFIX + IMPORT + ".json").questions[0] = { ...sourceQuestions(IMPORT)[0], type: "multiField", fields: [], answer: { mode: "anyAccepted", values: ["x"] } };
    expect((await get()).jsonBody.questions.find(x => x.id === IMPORT + "-1")).toMatchObject({ presentationType: "fillBlank", fields: [] });
    const r = await post({ action: "update", id: IMPORT + "-1", question: { ...validFill(), topic: "SWITCHING" } });
    expect(r.status).toBe(200);
    expect(sourceQuestions(IMPORT)[0].fields).toHaveLength(2);
    expect(sourceQuestions(IMPORT)[0].answer.mode).toBe("exactSequence");
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
    const r = await post({ action: "update", id: IMPORT + "-1", question: { section: "INFRASTRUCTURE", topic: "VLAN", difficulty: 4, presentationType: "fillBlank", text: "أكمل: VLAN هي ____", fields: [{ label: "التعريف", correct: "شبكة افتراضية" }] } });
    expect(r.status).toBe(200);
    expect(r.jsonBody.question).toMatchObject({ id: IMPORT + "-1", section: "INFRASTRUCTURE", topic: "VLAN", difficulty: 4, presentationType: "fillBlank", text: "أكمل: VLAN هي ____", updatedAt: "2026-09-17T12:00:00.000Z", official: false, fields: [{ id: "f1", label: "التعريف", correct: "شبكة افتراضية" }] });
    const stored = sourceQuestions(IMPORT)[0];
    expect(stored).toMatchObject({ id: IMPORT + "-1", sourceId: IMPORT, type: "multiField", text: "أكمل: VLAN هي ____", updatedBy: "t1", answer: { mode: "exactSequence", values: ["شبكة افتراضية"] }, classification: { topic: "VLAN", difficulty: 4, status: "classified" } });
    expect(store.get(SOURCES_PREFIX + IMPORT + ".json").original).toEqual({ importJobId: "j1", fileName: "quiz.docx" });
    expect(indexEntry(IMPORT + "-1")).toMatchObject({ section: "INFRASTRUCTURE", type: "multiField", topic: "VLAN", difficulty: 4, reviewStatus: "classified" });
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
    expect(indexIds().sort()).toEqual([OFFICIAL + "-q1", OFFICIAL + "-q2", "manual-fixed-00001"].sort());
    expect(sourceQuestions(OFFICIAL)).toHaveLength(2);
    expect(audits.at(-1)).toMatchObject({ action: "bank.question.delete", targetId: IMPORT + "-1" });
  });
  it("unknown action → 400", async () => {
    expect((await post({ action: "purge", id: IMPORT + "-1" })).status).toBe(400);
  });
});

// ── BLOCKER 2: two-blob partial success → idempotent reconciliation
describe("partial-write safety (source written, index write fails) converges on retry", () => {
  const KEY = "mfy1abc-x9k2";
  const ID = "manual-" + KEY;
  const invariantsAfterCreate = async id => {
    expect(sourceQuestions(MANUAL_SOURCE_ID).filter(q => q.id === id)).toHaveLength(1);              // exactly one source question
    expect(store.get(INDEX_BLOB).questions.filter(q => q.id === id)).toHaveLength(1);                // exactly one index entry
    expect((await get()).jsonBody.questions.filter(q => q.id === id)).toHaveLength(1);              // GET returns it once
  };
  it("create: the index write fails after the source write → error (not a fake success), the retry with the same requestKey converges without a second copy; the Builder can then select it", async () => {
    failures = [{ blob: INDEX_BLOB, ordinal: 1 }];
    const first = await post({ action: "create", question: validWord(), requestKey: KEY });
    expect(first.status).toBe(500); expect(first.jsonBody.error).toContain("أعد المحاولة");
    expect(sourceQuestions(MANUAL_SOURCE_ID).map(q => q.id)).toEqual([ID]);                          // source half landed
    expect(indexEntry(ID)).toBeUndefined();                                                          // index half did not
    expect((await builderSelect("wordBank", "ROUTING_MANUAL")).status).toBe(500);                    // not selectable yet (index is what the Builder reads)
    const retry = await post({ action: "create", question: validWord(), requestKey: KEY });
    expect(retry.status).toBe(200);
    expect(retry.jsonBody.question.id).toBe(ID);
    await invariantsAfterCreate(ID);
    expect(mutationLog).toEqual([SOURCES_PREFIX + "manual.json", INDEX_BLOB]);                       // the retry did NOT rewrite the source
    expect(audits.map(a => a.action)).toEqual(["bank.question.reindex"]);
    const r = await builderSelect("wordBank", "ROUTING_MANUAL");
    expect(r.status).toBe(200); expect(r.jsonBody.question.bankQuestionId).toBe(ID); expect(r.jsonBody.question.fields).toHaveLength(2);
  });
  it("create: a client retry after a FULL success (response lost) is idempotent — same row back, still one question", async () => {
    expect((await post({ action: "create", question: validFill(), requestKey: KEY })).status).toBe(200);
    const again = await post({ action: "create", question: validFill(), requestKey: KEY });
    expect(again.status).toBe(200); expect(again.jsonBody.question.id).toBe(ID);
    await invariantsAfterCreate(ID);
    expect(mutationLog).toEqual([SOURCES_PREFIX + "manual.json", INDEX_BLOB]);                       // nothing rewritten
  });
  it("create: the same requestKey with different content is refused (409) and nothing is overwritten", async () => {
    expect((await post({ action: "create", question: validFill(), requestKey: KEY })).status).toBe(200);
    const r = await post({ action: "create", question: { ...validFill(), text: "نص مختلف" }, requestKey: KEY });
    expect(r.status).toBe(409);
    expect(storedManual(ID).text).toBe(validFill().text);
    await invariantsAfterCreate(ID);
  });
  it("create: a concurrency conflict on the index write → 409 retry message; the retry converges", async () => {
    failures = [{ blob: INDEX_BLOB, ordinal: 1, error: new StorageConflictError() }];
    const first = await post({ action: "create", question: validMC(), requestKey: KEY });
    expect(first.status).toBe(409); expect(first.jsonBody.error).toContain("تعديل متزامن");
    expect((await post({ action: "create", question: validMC(), requestKey: KEY })).status).toBe(200);
    await invariantsAfterCreate(ID);
  });
  it("update: the index write fails after the source write → error; the retry converges and source + index agree on section / type / topic / difficulty / review state", async () => {
    expect((await post({ action: "create", question: validMC(), requestKey: KEY })).status).toBe(200);
    failures = [{ blob: INDEX_BLOB, ordinal: 2 }];
    const first = await post({ action: "update", id: ID, question: { ...validWord(), section: "INFRASTRUCTURE", difficulty: 5, topic: "ROUTING_MANUAL" } });
    expect(first.status).toBe(500);
    expect(storedManual(ID).type).toBe("multiField");                                                // source updated
    expect(indexEntry(ID)).toMatchObject({ type: "multipleChoice", section: "BASIC", difficulty: 2 });   // index stale
    const retry = await post({ action: "update", id: ID, question: { ...validWord(), section: "INFRASTRUCTURE", difficulty: 5, topic: "ROUTING_MANUAL" } });
    expect(retry.status).toBe(200);
    const stored = storedManual(ID), entry = indexEntry(ID);
    expect(entry).toMatchObject({ sourceId: "manual", section: stored.section, type: stored.type, topic: stored.classification.topic, difficulty: stored.classification.difficulty, reviewStatus: stored.reviewStatus });
    expect(entry).toMatchObject({ section: "INFRASTRUCTURE", type: "multiField", topic: "ROUTING_MANUAL", difficulty: 5, reviewStatus: "classified" });
    expect(store.get(INDEX_BLOB).questions.filter(q => q.id === ID)).toHaveLength(1);
    expect((await get()).jsonBody.questions.find(q => q.id === ID)).toMatchObject({ presentationType: "wordBank", section: "INFRASTRUCTURE", difficulty: 5 });
  });
  it("delete: the index write fails after the source write → error; a stale index entry is not a usable Builder candidate; the retry converges to no source / no index / no GET row / no candidate (no unrecoverable 404)", async () => {
    expect((await post({ action: "create", question: validFill(), requestKey: KEY })).status).toBe(200);
    expect((await builderSelect("fillBlank", "SUBNETTING_MANUAL")).jsonBody.question?.bankQuestionId).toBe(ID);
    failures = [{ blob: INDEX_BLOB, ordinal: 2 }];
    const first = await post({ action: "delete", id: ID });
    expect(first.status).toBe(500);
    expect(storedManual(ID)).toBeUndefined();                                                        // source half gone
    expect(indexEntry(ID)).toBeDefined();                                                            // index half stale
    expect((await builderSelect("fillBlank", "SUBNETTING_MANUAL")).status).toBe(500);                // the stale entry is skipped, never returned
    const retry = await post({ action: "delete", id: ID });
    expect(retry.status).toBe(200); expect(retry.jsonBody).toEqual({ ok: true, deleted: true, id: ID });
    expect(storedManual(ID)).toBeUndefined();
    expect(indexEntry(ID)).toBeUndefined();
    expect((await get()).jsonBody.questions.some(q => q.id === ID)).toBe(false);
    expect((await builderSelect("fillBlank", "SUBNETTING_MANUAL")).status).toBe(500);
    expect((await post({ action: "delete", id: ID })).status).toBe(404);                             // only now: neither half exists
  });
  it("delete: the index entry points at a source blob that no longer exists → the stale entry is removed, the Builder never selects it", async () => {
    store.get(INDEX_BLOB).questions.push({ id: "ghost-1", sourceId: "import-gone-20260101-ffff", section: "BASIC", type: "multiField", topic: "GHOST", difficulty: 2, reviewStatus: "classified" });
    expect((await builderSelect("fillBlank", "GHOST")).status).toBe(500);
    const r = await post({ action: "delete", id: "ghost-1" });
    expect(r.status).toBe(200);
    expect(indexEntry("ghost-1")).toBeUndefined();
  });
  it("update: a stale index entry (source no longer holds the question) is healed and answered 404", async () => {
    store.get(INDEX_BLOB).questions.push({ id: "ghost-2", sourceId: IMPORT, section: "BASIC", type: "shortAnswer", topic: "GHOST", difficulty: 2, reviewStatus: "classified" });
    const r = await post({ action: "update", id: "ghost-2", question: validMC() });
    expect(r.status).toBe(404);
    expect(indexEntry("ghost-2")).toBeUndefined();
    expect(indexIds()).toHaveLength(3);
  });
  it("a source-write failure leaves both halves untouched (no index entry for a question that was never stored)", async () => {
    failures = [{ blob: SOURCES_PREFIX + "manual.json", ordinal: 1 }];
    const r = await post({ action: "create", question: validMC(), requestKey: KEY });
    expect(r.status).toBe(500); expect(r.jsonBody.error).not.toContain("فهرس");
    expect(store.has(SOURCES_PREFIX + "manual.json")).toBe(false);
    expect(indexEntry(ID)).toBeUndefined();
  });
});
