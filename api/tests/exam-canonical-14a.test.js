import { describe, it, expect } from "vitest";
import { canonicalizeExamContent, stableStringify, contentHashOf, GOVERNANCE_ROOT_KEYS } from "../src/lib/exam-canonical.js";
import { cleanExam } from "../src/functions/save-exam-artifact.js";

// Phase 14A — §7/§8: ONE canonical exam form for revisions (the same authority the artifact endpoint uses) and a
// server-side SHA-256 content hash over that canonical form. Fail-first on 6918ce1 (module absent).

const signed = "/api/question-image?blob=bank/img-1.png&exp=1900000000&sig=abc";
const bankAsset = { id: "img-1", origin: "bank", blobName: "bank/img-1.png", contentType: "image/png", dataUrl: signed };
const exam = () => ({
  examId: "EX-1", title: "امتحان", status: "final", updatedAt: "2026-09-01T00:00:00.000Z",
  questions: [{ examQuestionId: "stale", text: "stale copy" }],                                   // competing top-level copy
  sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", questions: [
    { examQuestionId: "q1", presentationType: "multipleChoice", text: "س1", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, history: [{ x: 1 }], redoStack: [{ y: 2 }], image: { exists: true, visible: true, assets: [bankAsset] } },
    { examQuestionId: "q2", presentationType: "compound", text: "س2", marks: 4, parts: [{ id: "p1", type: "shortAnswer", text: "أ", marks: 4, answer: { text: "x" }, image: { exists: true, visible: true, assets: [bankAsset] } }] }
  ] }],
  // governance-looking root fields a client might smuggle
  governance: { lifecycleState: "published" }, publishedRevisionId: "r-evil", lifecycleState: "published", approvedRevisionId: "r-evil", stateVersion: 99,
  qualityGateReport: { canFinalize: true }, finalizationDecision: { canFinalize: true }
});

describe("14A §7 — canonicalizeExamContent", () => {
  it("sections are the only question tree; history/redo cleared; bank assets keep durable identity only (no signed URL)", () => {
    const c = canonicalizeExamContent(exam());
    expect("questions" in c).toBe(false);
    const q1 = c.sections[0].questions[0];
    expect(q1.history).toEqual([]); expect(q1.redoStack).toEqual([]);
    expect(q1.image.assets[0]).toEqual({ id: "img-1", origin: "bank", blobName: "bank/img-1.png", contentType: "image/png" });
    expect(c.sections[0].questions[1].parts[0].image.assets[0]).toEqual({ id: "img-1", origin: "bank", blobName: "bank/img-1.png", contentType: "image/png" });
    expect(JSON.stringify(c)).not.toContain("sig=");
    expect(JSON.stringify(c)).not.toContain("exp=");
    // answer keys are teacher data and DO stay in the canonical (server-side) revision content
    expect(q1.answer).toEqual({ correctOptionIndex: 0 });
  });
  it("governance-looking root fields and runtime analytics are stripped from exam content; the input is never mutated", () => {
    const input = exam(); const before = JSON.stringify(input);
    const c = canonicalizeExamContent(input);
    for (const k of GOVERNANCE_ROOT_KEYS) expect(k in c, k).toBe(false);
    expect(GOVERNANCE_ROOT_KEYS).toEqual(expect.arrayContaining(["governance", "publishedRevisionId", "approvedRevisionId", "reviewRevisionId", "lifecycleState", "stateVersion", "latestRevisionId", "qualityGateReport", "finalizationDecision"]));
    expect(JSON.stringify(input)).toBe(before);
    // status stays as a compatibility / authoring hint — it is NOT authority (the manifest is)
    expect(c.status).toBe("final");
  });
  it("legacy flat exams keep their questions[] (history/redo cleared) — no structural rewrite", () => {
    const c = canonicalizeExamContent({ examId: "L", questions: [{ text: "a", history: [1] }] });
    expect(c.questions).toEqual([{ text: "a", history: [], redoStack: [] }]);
    expect("sections" in c).toBe(false);
  });
  it("the artifact endpoint's cleanExam is the SAME canonical form plus a server updatedAt (no second incompatible cleaner)", () => {
    const viaArtifact = cleanExam(exam());
    const canonical = canonicalizeExamContent(exam());
    const { updatedAt: _u1, ...a } = viaArtifact; const { updatedAt: _u2, ...b } = canonical;
    expect(a).toEqual(b);
    expect(typeof viaArtifact.updatedAt).toBe("string");
  });
});

describe("14A §8 — content hash", () => {
  it("stableStringify sorts object keys recursively and preserves array order", () => {
    expect(stableStringify({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 2 } })).toBe('{"a":{"c":2,"d":[3,{"y":2,"z":1}]},"b":1}');
    expect(stableStringify([2, 1])).toBe("[2,1]");
    expect(stableStringify("s")).toBe('"s"');
    expect(stableStringify({ u: undefined, n: null })).toBe('{"n":null}');
  });
  it("hash = SHA-256 hex over stableStringify(canonical exam); key order and transient signed URLs do not change it; content does", () => {
    const h1 = contentHashOf(canonicalizeExamContent(exam()));
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    const reordered = exam(); reordered.sections[0].questions[0] = Object.fromEntries(Object.entries(reordered.sections[0].questions[0]).reverse());
    expect(contentHashOf(canonicalizeExamContent(reordered))).toBe(h1);
    const otherUrl = exam(); otherUrl.sections[0].questions[0].image.assets[0].dataUrl = signed.replace("abc", "zzz").replace("1900000000", "1900009999");
    expect(contentHashOf(canonicalizeExamContent(otherUrl))).toBe(h1);                 // P22: a signed URL is never durable identity
    const changed = exam(); changed.sections[0].questions[0].text = "س1 معدّل";
    expect(contentHashOf(canonicalizeExamContent(changed))).not.toBe(h1);
    const keyChanged = exam(); keyChanged.sections[0].questions[0].answer = { correctOptionIndex: 1 };
    expect(contentHashOf(canonicalizeExamContent(keyChanged))).not.toBe(h1);
  });
  it("contentHashOf refuses non-canonical input carrying a signed bank URL (a hash over transient credentials is never stored)", () => {
    expect(() => contentHashOf(exam())).toThrow(/canonical/i);
  });
});
