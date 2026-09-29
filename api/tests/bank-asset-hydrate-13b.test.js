import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildExamQuestion } from "../src/lib/bank-question-exam.js";
import { createSignedAssetParams, verifySignedAssetParams } from "../src/lib/builder-auth.js";
import { cleanExam as cleanSavedExam } from "../src/functions/save-exam-artifact.js";
import { studentExam, handler as studentAssignmentHandler } from "../src/functions/student-assignment.js";
import { handler as manageAssignmentsHandler } from "../src/functions/manage-assignments.js";
import * as savedExams from "../src/functions/manage-saved-exams.js";
import * as questionImage from "../src/functions/question-image.js";

// Phase 13B review fix 3 — bank question images must never depend on the lifetime of the signature minted while the
// teacher was authoring. `blobName` is the durable identity; `exp` / `sig` / the signed /api/question-image URL are
// transient delivery data minted when a payload is SERVED (teacher reopening a saved exam, student receiving an
// assignment). Uploaded / AI-generated embedded rasters are untouched.

process.env.BUILDER_SESSION_SECRET = process.env.BUILDER_SESSION_SECRET || "test-signing-secret-13b";
const T0 = Date.parse("2026-03-01T08:00:00.000Z");
const HOURS = 60 * 60 * 1000;
const BLOB = "bank/official/q2.png";
const PNG = "data:image/png;base64," + Buffer.from("UPLOADED-BYTES").toString("base64");
const AI_PNG = "data:image/png;base64," + Buffer.from("AI-BYTES").toString("base64");

const params = url => { const u = new URL(url, "http://x"); return { blob: u.searchParams.get("blob"), exp: u.searchParams.get("exp"), sig: u.searchParams.get("sig") }; };
const valid = url => { const p = params(url); return verifySignedAssetParams(p.blob, p.exp, p.sig); };
const canonicalWithImage = () => buildExamQuestion(
  { id: "BANK-2", sourceId: "official", sourceQuestionId: "2", questionNumber: "2", section: "INFRASTRUCTURE", type: "multiField", text: "أكمل: قناع الشبكة ____", fields: [{ id: "f1", label: "الفراغ", kind: "text", correct: "255.255.255.0", order: 1 }], answer: { mode: "exactSequence", values: ["255.255.255.0"] }, assets: [{ id: "img-2", blobName: BLOB, contentType: "image/png" }] },
  { id: "BANK-2", sourceId: "official", section: "INFRASTRUCTURE", type: "multiField", topic: "SUBNETTING", difficulty: 4 },
  { examQuestionId: "q-bank-2", marks: 2 }
);
const uploaded = () => ({ examQuestionId: "q-up", presentationType: "shortAnswer", text: "مرفوع", marks: 1, answer: { text: "SECRET-UP" }, image: { exists: true, visible: true, assets: [{ id: "up-1", origin: "uploaded", contentType: "image/png", dataUrl: PNG }] } });
const aiGenerated = () => ({ examQuestionId: "q-ai", presentationType: "shortAnswer", text: "مولّد", marks: 1, answer: { text: "SECRET-AI" }, image: { exists: true, visible: true, assets: [{ id: "ai-1", origin: "ai-generated", contentType: "image/png", dataUrl: AI_PNG }] } });
const structuredExam = (bankQ, extra = []) => ({ examId: "EX-1", title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T08:00:00.000Z", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", stimuli: {}, questions: [bankQ, ...extra] }] });
const firstAsset = exam => exam.sections[0].questions[0].image.assets[0];

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); });

describe("A — the authoring-time signature is transient: on the current HEAD it is persisted and expires", () => {
  it("a canonical bank asset carries an 8h signed URL that verifySignedAssetParams rejects once expired", () => {
    const q = canonicalWithImage();
    const url = q.image.assets[0].dataUrl;
    expect(q.image.assets[0]).toMatchObject({ origin: "bank", blobName: BLOB, contentType: "image/png" });
    expect(valid(url)).toBe(true);
    vi.setSystemTime(T0 + 9 * HOURS);
    expect(valid(url)).toBe(false);                                     // the persisted credential is dead after 8h
  });

  it("durable storage contract: a saved structured exam keeps origin/blobName/id/contentType of a bank asset but NOT the transient signed dataUrl; uploaded / AI rasters are unchanged", () => {
    const saved = cleanSavedExam(structuredExam(canonicalWithImage(), [uploaded(), aiGenerated()]));
    const bank = firstAsset(saved);
    expect(bank).toMatchObject({ id: "img-2", origin: "bank", blobName: BLOB, contentType: "image/png" });
    expect(bank).not.toHaveProperty("dataUrl");
    expect(JSON.stringify(saved)).not.toContain("&sig=");
    expect(saved.sections[0].questions[1].image.assets[0]).toEqual({ id: "up-1", origin: "uploaded", contentType: "image/png", dataUrl: PNG });
    expect(saved.sections[0].questions[2].image.assets[0]).toEqual({ id: "ai-1", origin: "ai-generated", contentType: "image/png", dataUrl: AI_PNG });
    // question content is untouched by the normalization
    expect(saved.sections[0].questions[0]).toMatchObject({ bankQuestionId: "BANK-2", text: "أكمل: قناع الشبكة ____", marks: 2, topic: "SUBNETTING", difficulty: 4, answer: { mode: "exactSequence", values: ["255.255.255.0"] } });
  });
});

describe("B — teacher reopens a saved structured exam days later", () => {
  const storeWithSavedExam = () => {
    const saved = cleanSavedExam(structuredExam(canonicalWithImage(), [uploaded()]));
    const document = { schemaVersion: 1, kind: "exam", savedAt: "2026-03-01T08:00:00.000Z", exam: saved };
    const store = new Map([["exams/EX-1.json", document]]);
    const reads = [], writes = [];
    const deps = {
      requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }),
      getContainer: () => ({}),
      downloadJson: async (_c, key) => { reads.push(key); if (!store.has(key)) throw new Error("missing " + key); return structuredClone(store.get(key)); },
      uploadJson: async (_c, key, value) => { writes.push({ key, value }); }
    };
    return { store, document, reads, writes, deps };
  };
  const loadReq = blobName => ({ method: "POST", url: "http://x/api/saved-exams", json: async () => ({ action: "load", blobName }) });

  it("the delivered bank asset has a FRESH exp/sig valid at load time (T0 + 9 days), keeps its durable identity, and the stored document is not rewritten", async () => {
    const ctx = storeWithSavedExam();
    const before = JSON.stringify(ctx.document);
    vi.setSystemTime(T0 + 9 * 24 * HOURS);
    const r = await savedExams.handler(loadReq("exams/EX-1.json"), ctx.deps);
    expect(r.status).toBe(200);
    const asset = firstAsset(r.jsonBody.exam);
    expect(asset).toMatchObject({ id: "img-2", origin: "bank", blobName: BLOB, contentType: "image/png" });
    expect(asset.dataUrl).toMatch(/^\/api\/question-image\?blob=/);
    expect(valid(asset.dataUrl)).toBe(true);
    expect(Number(params(asset.dataUrl).exp)).toBeGreaterThan(Math.floor((T0 + 9 * 24 * HOURS) / 1000));
    expect(r.jsonBody.exam.sections[0].questions[1].image.assets[0]).toEqual({ id: "up-1", origin: "uploaded", contentType: "image/png", dataUrl: PNG });
    expect(JSON.stringify(ctx.document)).toBe(before);                  // read never mutates the stored document
    expect(ctx.writes).toEqual([]);                                     // no storage write just to refresh a URL
  });

  it("a legacy saved exam that still holds an authoring-time signed URL is re-signed on read (never the stale URL)", async () => {
    const ctx = storeWithSavedExam();
    const stale = canonicalWithImage().image.assets[0].dataUrl;         // minted at T0
    ctx.document.exam.sections[0].questions[0].image.assets[0].dataUrl = stale;
    vi.setSystemTime(T0 + 9 * HOURS);
    expect(valid(stale)).toBe(false);
    const r = await savedExams.handler(loadReq("exams/EX-1.json"), ctx.deps);
    const url = firstAsset(r.jsonBody.exam).dataUrl;
    expect(url).not.toBe(stale);
    expect(valid(url)).toBe(true);
  });
});

describe("C — student receives a published assignment containing the bank image", () => {
  const makeAssignmentStore = examSnapshot => {
    const store = new Map();
    store.set("platform/classes/c1.json", { classId: "c1", name: "الصف", active: true });
    store.set("platform/assignments/a1.json", { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", instructions: "", openAt: "", dueAt: "", maxAttempts: 1, durationMinutes: 0, attemptModelVersion: 1, questionCount: 1, totalMarks: 2, examSnapshot });
    const writes = [];
    const deps = {
      requireActiveStudentSession: async () => ({ ok: true, container: {}, student: { studentId: "st1", classId: "c1" } }),
      downloadJsonOrNull: async (_c, key) => (store.has(key) ? structuredClone(store.get(key)) : null),
      uploadJson: async (_c, key, value) => { writes.push({ key, value }); }
    };
    return { store, writes, deps };
  };
  const getReq = { method: "GET", url: "http://x/api/student-assignment/a1", params: { assignmentId: "a1" }, headers: new Map() };

  it("author at T0, student opens at T0 + 9h: the bank image URL is minted at DELIVERY time and valid; answer keys stay stripped; no writes", async () => {
    // author: canonical (T0) → saved exam → assignment snapshot (created at T0 + 1h)
    const saved = cleanSavedExam(structuredExam(canonicalWithImage(), [uploaded(), aiGenerated()]));
    vi.setSystemTime(T0 + 1 * HOURS);
    const ctx = makeAssignmentStore(saved);
    const stored = JSON.stringify(ctx.store.get("platform/assignments/a1.json"));
    vi.setSystemTime(T0 + 9 * HOURS);
    const r = await studentAssignmentHandler(getReq, ctx.deps);
    expect(r.status).toBe(200);
    const exam = r.jsonBody.assignment.exam;
    const asset = exam.sections[0].questions[0].image.assets[0];
    expect(asset).toMatchObject({ id: "img-2", origin: "bank", blobName: BLOB, contentType: "image/png" });
    expect(valid(asset.dataUrl)).toBe(true);
    expect(Number(params(asset.dataUrl).exp)).toBeGreaterThan(Math.floor((T0 + 9 * HOURS) / 1000));
    const payload = JSON.stringify(exam);
    expect(payload).not.toContain("255.255.255.0"); expect(payload).not.toContain("SECRET-UP"); expect(payload).not.toContain("SECRET-AI");
    expect(exam.sections[0].questions[0].fields[0]).not.toHaveProperty("correct");
    expect(exam.sections[0].questions[1].image.assets[0]).toEqual({ id: "up-1", origin: "uploaded", contentType: "image/png", dataUrl: PNG });
    expect(exam.sections[0].questions[2].image.assets[0]).toEqual({ id: "ai-1", origin: "ai-generated", contentType: "image/png", dataUrl: AI_PNG });
    expect(JSON.stringify(ctx.store.get("platform/assignments/a1.json"))).toBe(stored);
    expect(ctx.writes).toEqual([]);
  });

  it("an assignment snapshot that still holds the authoring-time signed URL (legacy data) is re-signed at delivery — the stale URL never reaches the student", async () => {
    const snapshot = structuredExam(canonicalWithImage());                // NOT normalized: stale signed URL persisted
    const stale = firstAsset(snapshot).dataUrl;
    const ctx = makeAssignmentStore(snapshot);
    vi.setSystemTime(T0 + 9 * HOURS);
    expect(valid(stale)).toBe(false);
    const r = await studentAssignmentHandler(getReq, ctx.deps);
    const url = r.jsonBody.assignment.exam.sections[0].questions[0].image.assets[0].dataUrl;
    expect(url).not.toBe(stale);
    expect(valid(url)).toBe(true);
    expect(JSON.stringify(r.jsonBody)).not.toContain(params(stale).sig);
  });

  it("the delivered-URL contract is also true for studentExam() alone (the unit the sanitizer tests use)", () => {
    const saved = cleanSavedExam(structuredExam(canonicalWithImage()));
    vi.setSystemTime(T0 + 9 * HOURS);
    const url = firstAsset(studentExam(saved)).dataUrl;
    expect(typeof url).toBe("string");
    expect(valid(url)).toBe(true);
  });

  it("a HIDDEN bank image is never delivered to the student: no assets, no blobName, no signed URL", async () => {
    const q = canonicalWithImage();
    q.image.visible = false;
    const saved = cleanSavedExam(structuredExam(q));
    const ctx = makeAssignmentStore(saved);
    vi.setSystemTime(T0 + 9 * HOURS);
    const r = await studentAssignmentHandler(getReq, ctx.deps);
    const sq = r.jsonBody.assignment.exam.sections[0].questions[0];
    expect(sq.image).toEqual({ exists: true, visible: false });
    const payload = JSON.stringify(r.jsonBody);
    expect(payload).not.toContain(BLOB); expect(payload).not.toContain("question-image"); expect(payload).not.toContain("&sig=");
  });

  it("assignment creation (manage-assignments) persists the durable bank asset, never the authoring-time signature", async () => {
    const store = new Map([["platform/classes/c1.json", { classId: "c1", name: "الصف", active: true }]]);
    const uploads = [];
    const deps = {
      requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ({}),
      downloadJsonOrNull: async (_c, key) => (store.has(key) ? structuredClone(store.get(key)) : null),
      uploadJson: async (_c, key, value) => { store.set(key, value); uploads.push({ key, value }); },
      listJson: async () => [], mutateJsonWithRetry: async () => { throw new Error("not used"); }, recordAuditEvent: async () => {}, ensurePublishedAssignmentIndexed: async () => {}
    };
    const examSnapshot = structuredExam(canonicalWithImage(), [uploaded()]);     // straight from the builder: transient URL present
    const r = await manageAssignmentsHandler({ method: "POST", url: "http://x/assignments", params: {}, json: async () => ({ action: "create", classId: "c1", title: "واجب", examSnapshot, status: "draft" }) }, deps);
    expect(r.status).toBe(200);
    const persisted = uploads.find(u => u.key.startsWith("platform/assignments/"));
    expect(persisted).toBeTruthy();
    const bank = persisted.value.examSnapshot.sections[0].questions[0].image.assets[0];
    expect(bank).toMatchObject({ id: "img-2", origin: "bank", blobName: BLOB, contentType: "image/png" });
    expect(bank).not.toHaveProperty("dataUrl");
    expect(persisted.value.examSnapshot.sections[0].questions[1].image.assets[0].dataUrl).toBe(PNG);
  });
});

describe("D — /api/question-image keeps enforcing the signature", () => {
  it("an expired signature is rejected (401) before any storage access; a freshly minted one verifies", async () => {
    const { exp, sig } = createSignedAssetParams(BLOB, 8 * 60 * 60);
    expect(verifySignedAssetParams(BLOB, exp, sig)).toBe(true);
    vi.setSystemTime(T0 + 9 * HOURS);
    expect(verifySignedAssetParams(BLOB, exp, sig)).toBe(false);
    let downloads = 0;
    const r = await questionImage.handler({ url: "http://x/api/question-image?blob=" + encodeURIComponent(BLOB) + "&exp=" + exp + "&sig=" + encodeURIComponent(sig) }, { downloadAsset: async () => { downloads += 1; return { buffer: Buffer.from("x"), contentType: "image/png" }; } });
    expect(r.status).toBe(401);
    expect(downloads).toBe(0);
    const fresh = createSignedAssetParams(BLOB, 8 * 60 * 60);
    const ok = await questionImage.handler({ url: "http://x/api/question-image?blob=" + encodeURIComponent(BLOB) + "&exp=" + fresh.exp + "&sig=" + encodeURIComponent(fresh.sig) }, { downloadAsset: async () => ({ buffer: Buffer.from("img"), contentType: "image/png" }) });
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toBe("image/png");
  });
});

describe("E — the shared hydration helper", () => {
  const loadHelper = () => import("../src/lib/bank-asset-hydrate.js");
  it("re-signs ONLY bank assets with a safe blobName (structured sections, legacy questions[], compound parts); non-bank assets keep the same reference; input is never mutated; no secret in the output", async () => {
    const hydrate = await loadHelper();
    const up = uploaded();
    const part = { id: "p1", type: "shortAnswer", text: "جزء", image: { exists: true, visible: true, assets: [{ id: "pa", origin: "bank", blobName: "bank/p.png", contentType: "image/png" }] } };
    const compound = { examQuestionId: "q-c", presentationType: "compound", text: "مركب", marks: 3, parts: [part] };
    const unsafe = { examQuestionId: "q-x", presentationType: "shortAnswer", text: "x", marks: 1, image: { exists: true, visible: true, assets: [{ id: "bad", origin: "bank", blobName: "../../etc/passwd", contentType: "image/png" }] } };
    const exam = { ...structuredExam(cleanSavedExam(structuredExam(canonicalWithImage())).sections[0].questions[0], [up, compound, unsafe]), questions: [{ examQuestionId: "legacy-1", image: { exists: true, visible: true, assets: [{ id: "l1", origin: "bank", blobName: "bank/legacy.png" }] } }] };
    const before = JSON.stringify(exam);
    const out = hydrate.hydrateBankAssets(exam);
    expect(JSON.stringify(exam)).toBe(before);
    expect(out).not.toBe(exam);
    expect(valid(out.sections[0].questions[0].image.assets[0].dataUrl)).toBe(true);
    expect(out.sections[0].questions[1]).toBe(up);                                                  // untouched question: same reference
    expect(out.sections[0].questions[1].image.assets[0]).toBe(up.image.assets[0]);
    expect(valid(out.sections[0].questions[2].parts[0].image.assets[0].dataUrl)).toBe(true);
    expect(out.sections[0].questions[3].image.assets[0]).toEqual({ id: "bad", origin: "bank", blobName: "../../etc/passwd", contentType: "image/png" });   // never signed
    expect(valid(out.questions[0].image.assets[0].dataUrl)).toBe(true);
    expect(JSON.stringify(out)).not.toContain(process.env.BUILDER_SESSION_SECRET);
    expect(hydrate.isSafeBlobName("bank/official/q2.png")).toBe(true);
    expect(hydrate.isSafeBlobName("../x")).toBe(false);
    expect(hydrate.isSafeBlobName("a//b")).toBe(false);
  });

  it("normalizeBankAssetsForStorage strips transient keys from bank assets only and returns the same reference when nothing changes", async () => {
    const hydrate = await loadHelper();
    const up = uploaded();
    const q = canonicalWithImage();
    const exam = structuredExam(q, [up]);
    const out = hydrate.normalizeBankAssetsForStorage(exam);
    expect(out.sections[0].questions[0].image.assets[0]).toEqual({ id: "img-2", origin: "bank", blobName: BLOB, contentType: "image/png" });
    expect(out.sections[0].questions[1]).toBe(up);
    expect(hydrate.normalizeBankAssetsForStorage(out)).toBe(out);                                     // already durable → no-op
    expect(exam.sections[0].questions[0].image.assets[0].dataUrl).toContain("&sig=");                 // input untouched
  });

  it("buildExamQuestion mints its authoring-time URL through the same helper (one signing implementation)", async () => {
    const hydrate = await loadHelper();
    const q = canonicalWithImage();
    const again = hydrate.hydrateBankAssets({ questions: [{ image: { exists: true, visible: true, assets: [{ id: "img-2", origin: "bank", blobName: BLOB, contentType: "image/png" }] } }] }).questions[0].image.assets[0];
    expect(params(q.image.assets[0].dataUrl)).toEqual(params(again.dataUrl));                          // same blob/exp/sig at the same instant
  });
});
