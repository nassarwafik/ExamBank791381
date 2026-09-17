import { describe, it, expect, beforeEach } from "vitest";
import { handler, isBlobNotFound } from "../src/functions/question-bank-action.js";

// UX-6c — the Builder's real "replace from bank" handler (DI seam) against a stale index entry whose source blob is
// gone. ONLY a genuine missing blob (statusCode 404 / code BlobNotFound — the repository's Azure convention) is
// treated as an empty source and skipped; every other read failure (5xx, auth, timeout, plain Error) is NOT
// swallowed: the handler returns its generic 500 and never silently continues to another candidate.

const INDEX_BLOB = "index/questions-index.json";
const GONE = "import-gone-20260101-ffff";
const VALID = "manual";
let store, reads;

// The stale candidate scores higher than the valid one (it matches the current question's difficulty), so the
// selection tries the stale source FIRST — the order the defence must survive.
function seed() {
  store = new Map();
  store.set(INDEX_BLOB, { questions: [
    { id: GONE + "-1", sourceId: GONE, section: "BASIC", type: "multiField", topic: "T", difficulty: 2, reviewStatus: "classified" },
    { id: VALID + "-k1", sourceId: VALID, section: "BASIC", type: "multiField", topic: "T", difficulty: 4, reviewStatus: "classified" }
  ] });
  store.set("sources/" + VALID + ".json", { questions: [
    { id: VALID + "-k1", sourceId: VALID, type: "multiField", text: "أكمل ____", fields: [{ id: "f1", label: "الفراغ", kind: "text", correct: "x" }], answer: { mode: "exactSequence", values: ["x"] }, assets: [] }
  ] });
}
function select(missingError) {
  reads = [];
  return handler({ json: async () => ({ question: { examQuestionId: "x1", marks: 2, section: "BASIC", topic: "T", difficulty: 2, presentationType: "fillBlank" }, presentationType: "fillBlank", topic: "T" }) }, {
    requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), getBankContainer: () => ({}),
    downloadJson: async (_c, k) => { reads.push(k); if (store.has(k)) return structuredClone(store.get(k)); throw missingError(k); }
  });
}
const sourceReads = () => reads.filter(k => k.startsWith("sources/"));

beforeEach(seed);

describe("isBlobNotFound", () => {
  it("recognises only the Azure not-found shapes", () => {
    expect(isBlobNotFound({ statusCode: 404 })).toBe(true);
    expect(isBlobNotFound({ code: "BlobNotFound" })).toBe(true);
    expect(isBlobNotFound(Object.assign(new Error("x"), { statusCode: 404 }))).toBe(true);
    expect(isBlobNotFound({ statusCode: 503, code: "ServerBusy" })).toBe(false);
    expect(isBlobNotFound({ statusCode: 403, code: "AuthenticationFailed" })).toBe(false);
    expect(isBlobNotFound(new Error("ETIMEDOUT"))).toBe(false);
    expect(isBlobNotFound(undefined)).toBe(false);
  });
});

describe("question-bank-action — stale index entry whose source blob is missing", () => {
  it("statusCode 404: the stale candidate is skipped and the next valid candidate is selected (never the stale question)", async () => {
    const r = await select(() => Object.assign(new Error("The specified blob does not exist."), { statusCode: 404 }));
    expect(r.status).toBe(200);
    expect(r.jsonBody.question.bankQuestionId).toBe(VALID + "-k1");
    expect(r.jsonBody.question.fields).toHaveLength(1);
    expect(sourceReads()).toEqual(["sources/" + GONE + ".json", "sources/" + VALID + ".json"]);   // stale source tried first, then the valid one
  });
  it("code BlobNotFound: same — skipped, the valid candidate is returned", async () => {
    const r = await select(() => Object.assign(new Error("not found"), { code: "BlobNotFound" }));
    expect(r.status).toBe(200);
    expect(r.jsonBody.question.bankQuestionId).toBe(VALID + "-k1");
  });
  it("a missing blob with no other valid candidate → the existing generic no-match 500 (no crash, no stale question)", async () => {
    store.get(INDEX_BLOB).questions = store.get(INDEX_BLOB).questions.filter(q => q.sourceId === GONE);
    const r = await select(() => Object.assign(new Error("x"), { statusCode: 404 }));
    expect(r.status).toBe(500);
    expect(r.jsonBody).toEqual({ ok: false, error: "تعذر تنفيذ إجراء بنك الأسئلة حاليًا." });
  });
  it("a REAL storage error (503 ServerBusy) is NOT swallowed: generic 500, no raw details, and the handler does not move on to another candidate", async () => {
    const r = await select(() => Object.assign(new Error("Server busy, retry later; account=secret-account"), { statusCode: 503, code: "ServerBusy" }));
    expect(r.status).toBe(500);
    expect(r.jsonBody).toEqual({ ok: false, error: "تعذر تنفيذ إجراء بنك الأسئلة حاليًا." });
    expect(JSON.stringify(r.jsonBody)).not.toContain("secret-account");
    expect(sourceReads()).toEqual(["sources/" + GONE + ".json"]);                                    // stopped at the failure; the valid source was never read
  });
  it("an authentication failure (403) and a plain Error (timeout) are NOT swallowed either", async () => {
    let r = await select(() => Object.assign(new Error("auth"), { statusCode: 403, code: "AuthenticationFailed" }));
    expect(r.status).toBe(500); expect(sourceReads()).toHaveLength(1);
    r = await select(() => new Error("ETIMEDOUT"));
    expect(r.status).toBe(500); expect(sourceReads()).toHaveLength(1);
  });
  it("a valid source whose read fails must not make it disappear: with the stale entry removed, a 503 on the only candidate is a 500, not a no-match", async () => {
    store.get(INDEX_BLOB).questions = store.get(INDEX_BLOB).questions.filter(q => q.sourceId === VALID);
    store.delete("sources/" + VALID + ".json");
    const r = await select(() => Object.assign(new Error("busy"), { statusCode: 503 }));
    expect(r.status).toBe(500);
    expect(sourceReads()).toEqual(["sources/" + VALID + ".json"]);
  });
});
