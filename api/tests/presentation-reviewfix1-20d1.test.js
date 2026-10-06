import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";

// Phase 20D.1 — Independent Review Fix 1, server side (fail-first on 1eb2c21).
const require_ = createRequire(import.meta.url);
process.env.BUILDER_SESSION_SECRET = process.env.BUILDER_SESSION_SECRET || "test-signing-secret-20d1";   // bank delivery URLs are HMAC-signed (test-only value)
const { validateRichContent } = require_("../src/lib/shared-finalization/richContent/richContentModel.js");
const doc = (...blocks) => ({ schemaVersion: 1, blocks });
const p = text => ({ type: "paragraph", runs: [{ text }] });
const mcq = (id, extra = {}) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "اختر", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...extra });
const exam = questions => ({ title: "امتحان", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions }] });

describe("RF1-M1 (server copy) raw-HTML detection is linear on student delivery", () => {
  it("the generated shared validator handles five 20 000-char '<'+spaces runs quickly and accepts them", () => {
    const run = "<" + " ".repeat(19998) + "x";
    const t = performance.now();
    expect(validateRichContent(doc(...Array.from({ length: 5 }, () => p(run)))).ok).toBe(true);
    expect(performance.now() - t).toBeLessThan(400);
  });
  it("sanitizing an exam of ten such questions stays fast (was ≈2 s per question of synchronous CPU)", () => {
    const run = "<" + " ".repeat(19998) + "x";
    const qs = Array.from({ length: 10 }, (_, i) => mcq("q" + i, { richContent: doc(p(run), p(run)) }));
    const t = performance.now();
    const out = sanitizeExamForStudent(exam(qs));
    expect(performance.now() - t).toBeLessThan(1500);
    expect(out.sections[0].questions[0].richContent.blocks).toHaveLength(2);
  });
});

describe("RF1-m3 one parametric predicate: any node carrying a parametric config drops its rich stem", () => {
  it("a shortAnswer node with a stray parametric config never delivers its richContent", () => {
    const q = { examQuestionId: "q1", presentationType: "shortAnswer", text: "x", marks: 1, parametric: { v: 1 }, richContent: doc(p("القالب {{a}}")) };
    const out = sanitizeExamForStudent(exam([q]));
    expect(JSON.stringify(out)).not.toContain("{{a}}");
  });
});

describe("RF1-m7 the pre-start cover's rich bank images are hydrated for delivery", () => {
  it("a bank-identity image in cover.instructionsRichContent reaches the start screen with a signed delivery URL", () => {
    const { preStartAssignment } = require_("../src/functions/student-assignment.js");
    const BANK = { id: "img1", origin: "bank", blobName: "bank/questions/img1.png", contentType: "image/png" };
    const a = { assignmentId: "a", title: "t", examSnapshot: { title: "t", coverPage: { enabled: true, instructionsRichContent: doc({ type: "image", asset: BANK, alt: "شعار" }) }, sections: [] } };
    const cover = preStartAssignment(a, false, "continuous").exam.coverPage;
    expect(JSON.stringify(cover)).toMatch(/\/api\/question-image\?blob=/);
  });
});
