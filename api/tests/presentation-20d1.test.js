import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { rebuildAttemptGrades } from "../src/lib/attempt-grade-rebuild.js";
import { hydrateBankAssets, normalizeBankAssetsForStorage } from "../src/lib/bank-asset-hydrate.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { validateStructuredExam } from "../../src/examQuality";
import { compositeArabicExam, compositePhysicsExam, compositeCsExam, compositeNetworkExam } from "../../src/composite/compositeFixtures";

// Phase 20D.1 — the presentation / rich-content SERVER authorities: strict student projection (never a spread), finalization blockers,
// bank-asset hydration of rich images, the pre-start payload, and GRADING INERTNESS. Fail-first on 0b22080: rich content and presentation
// are unknown keys (spread through or refused by strict composite / scenario contracts), finalization ignores them.
const require_ = createRequire(import.meta.url);
process.env.BUILDER_SESSION_SECRET = process.env.BUILDER_SESSION_SECRET || "test-signing-secret-20d1";   // bank delivery URLs are HMAC-signed (test-only value)
const clone = x => JSON.parse(JSON.stringify(x));
const errors = e => validateStructuredExam(e).filter(i => i.severity === "error").map(i => i.code);
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const BANK = { id: "img1", origin: "bank", blobName: "bank/questions/img1.png", contentType: "image/png" };
const RICH = (extra = []) => ({ schemaVersion: 1, blocks: [
  { type: "heading", level: 3, runs: [{ text: "معطيات" }] },
  { type: "table", caption: "الأجهزة", columnHeaders: ["الجهاز", "IP"], rows: [["PC1", "192.168.10.10"]] },
  { type: "image", asset: { dataUrl: PNG, origin: "uploaded" }, alt: "مخطط" }, ...extra
] });
const PRES = { schemaVersion: 1, preset: "networkLab", components: { questionCard: { variant: "elevated" } }, questionTypeVariants: { smartSim: "networkWorkspace" } };
const mcq = (id, extra = {}) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "اختر", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, ...extra });
const exam = (questions, extra = {}, section = {}) => ({ title: "امتحان", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions, ...section }], ...extra });
const qOf = e => e.sections[0].questions[0];

describe("20D1-S1 strict student projection", () => {
  it("exam.presentation is rebuilt canonically; a smuggled teacher key or CSS string drops the WHOLE object (fallback, never a partial spread)", () => {
    expect(sanitizeExamForStudent(exam([mcq("q1")], { presentation: PRES })).presentation).toEqual(PRES);
    for (const bad of [{ ...PRES, teacherNote: "SECRET-1" }, { ...PRES, css: "body{display:none}" }, { ...PRES, tokens: { colors: { text: "url(https://x)" } } }]) {
      const out = sanitizeExamForStudent(exam([mcq("q1")], { presentation: bad }));
      expect(out.presentation).toBeUndefined();
      expect(JSON.stringify(out)).not.toMatch(/SECRET-1|display:none|https:\/\/x/);
    }
  });
  it("question richContent is a strict rebuild (never through the deep secret stripper); malformed rich content is dropped (plain text fallback)", () => {
    const out = sanitizeExamForStudent(exam([mcq("q1", { richContent: RICH() })]));
    expect(qOf(out).richContent).toEqual(RICH());
    const bad = sanitizeExamForStudent(exam([mcq("q1", { richContent: { ...RICH(), answerKey: "SECRET-2" } })]));
    expect(qOf(bad).richContent).toBeUndefined();
    expect(JSON.stringify(bad)).not.toContain("SECRET-2");
    expect(qOf(bad).text).toBe("اختر");
    const blockSecret = sanitizeExamForStudent(exam([mcq("q1", { richContent: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "x" }], teacherNote: "SECRET-3" }] } })]));
    expect(JSON.stringify(blockSecret)).not.toContain("SECRET-3");
  });
  it("question / section presentation overrides, section rich instructions and cover rich instructions are projected strictly", () => {
    const e = exam([mcq("q1", { presentation: { schemaVersion: 1, width: "wide" } })], { coverPage: { enabled: true, instructions: "اقرأ", instructionsRichContent: RICH() } }, { presentation: { schemaVersion: 1, components: { sectionHeader: { variant: "band" } } }, instructionsRichContent: RICH() });
    const out = sanitizeExamForStudent(e);
    expect(qOf(out).presentation).toEqual({ schemaVersion: 1, width: "wide" });
    expect(out.sections[0].presentation).toEqual({ schemaVersion: 1, components: { sectionHeader: { variant: "band" } } });
    expect(out.sections[0].instructionsRichContent).toEqual(RICH());
    expect(out.coverPage.instructionsRichContent).toEqual(RICH());
    const bad = sanitizeExamForStudent(exam([mcq("q1", { presentation: { schemaVersion: 1, width: "wide", hint: "SECRET-4" } })], { coverPage: { enabled: true, instructionsRichContent: { schemaVersion: 1, blocks: [], x: "SECRET-5" } } }, { presentation: { schemaVersion: 1, secret: "SECRET-6" }, instructionsRichContent: { teacher: "SECRET-7" } }));
    expect(JSON.stringify(bad)).not.toMatch(/SECRET-[4-7]/);
  });
  it("composite parts carry rich prompts (strictly projected, child identity untouched); parametric stems never carry rich content (the template would leak)", () => {
    const e = compositeArabicExam(); const part = qOf(e).composite.groups[0].parts[0];
    part.richContent = RICH();
    expect(errors(e)).toEqual([]);
    const out = sanitizeExamForStudent(e);
    expect(qOf(out).composite.groups[0].parts[0].richContent).toEqual(RICH());
    expect(qOf(out).composite.groups[0].parts[0].id).toBe(part.id);
    const p = compositeArabicExam(); qOf(p).richContent = RICH(); qOf(p).presentation = { schemaVersion: 1, width: "full" };
    expect(errors(p)).toEqual([]);
    const param = { examQuestionId: "pn1", presentationType: "parametricNumeric", text: "x", marks: 1, richContent: RICH() };
    expect(errors(exam([param]))).toContain("PARAMETRIC_RICH_CONTENT_FORBIDDEN");
  });
  it("a scenario rich source (new additive kind) is validated and projected; existing source kinds are unchanged", () => {
    const sec = { scenarios: [{ id: "scn1", version: 1, title: "شبكة", questionIds: ["q1"], sources: [{ id: "r1", version: 1, kind: "rich", title: "المعطيات", richContent: RICH() }, { id: "t1", version: 1, kind: "text", text: "نص" }] }] };
    const e = exam([mcq("q1")], {}, sec);
    expect(errors(e)).toEqual([]);
    expect(sanitizeExamForStudent(e).sections[0].scenarios[0].sources[0].richContent).toEqual(RICH());
    const bad = exam([mcq("q1")], {}, { scenarios: [{ ...sec.scenarios[0], sources: [{ id: "r1", version: 1, kind: "rich", richContent: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "<script>x</script>" }] }] } }] }] });
    expect(errors(bad)).toContain("SOURCE_RICH_INVALID");
  });
  it("the pre-start payload carries the (strictly projected) presentation so the cover / start screen is themed", () => {
    const { preStartAssignment } = require_("../src/functions/student-assignment.js");
    const a = { assignmentId: "a", title: "t", examSnapshot: { title: "t", presentation: PRES, coverPage: { enabled: true, instructionsRichContent: RICH() }, sections: [] } };
    const out = preStartAssignment(a, false, "continuous");
    expect(out.exam.presentation).toEqual(PRES);
    expect(preStartAssignment({ ...a, examSnapshot: { ...a.examSnapshot, presentation: { ...PRES, x: "SECRET-8" } } }, false).exam.presentation).toBeUndefined();
  });
});

describe("20D1-S2 finalization blockers", () => {
  const cases = [
    ["malformed exam presentation", exam([mcq("q1")], { presentation: { schemaVersion: 1, preset: "neon" } }), "PRESENTATION_PRESET"],
    ["raw CSS in the presentation", exam([mcq("q1")], { presentation: { ...PRES, css: "body{}" } }), "PRESENTATION_UNKNOWN_KEY"],
    ["unreadable palette", exam([mcq("q1")], { presentation: { schemaVersion: 1, preset: "default", tokens: { colors: { text: "#FEFEFE" } } } }), "PRESENTATION_CONTRAST"],
    ["malformed section override", exam([mcq("q1")], {}, { presentation: { schemaVersion: 1, components: { sectionHeader: { variant: "neon" } } } }), "PRESENTATION_SECTION_OVERRIDE"],
    ["malformed question override", exam([mcq("q1", { presentation: { schemaVersion: 1, width: "200vw" } })]), "PRESENTATION_QUESTION_OVERRIDE"],
    ["raw HTML in rich content", exam([mcq("q1", { richContent: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "<iframe src=x>" }] }] } })]), "RICH_CONTENT_RAW_HTML"],
    ["future rich-content version", exam([mcq("q1", { richContent: { schemaVersion: 2, blocks: [] } })]), "RICH_CONTENT_VERSION"],
    ["malformed rich section instructions", exam([mcq("q1")], {}, { instructionsRichContent: { schemaVersion: 1, blocks: [{ type: "embed" }] } }), "RICH_CONTENT_BLOCK_TYPE"],
    ["malformed rich cover instructions", exam([mcq("q1")], { coverPage: { enabled: true, instructionsRichContent: { schemaVersion: 1, blocks: [{ type: "image", asset: { dataUrl: "https://x/y.png" }, alt: "x" }] } } }), "RICH_CONTENT_IMAGE"]
  ];
  for (const [name, e, code] of cases) it(name + " → " + code, () => expect(errors(e)).toContain(code));
  it("a question with valid rich content and empty plain text is not EMPTY_TEXT (the rich stem is its content)", () => {
    expect(errors(exam([mcq("q1", { text: "", richContent: RICH() })]))).not.toContain("EMPTY_TEXT");
  });
});

describe("20D1-S3 bank-asset hydration and storage normalization reach rich images", () => {
  it("question, composite part, section instructions, cover and scenario rich images are signed for delivery and stored durably", () => {
    const rich = { schemaVersion: 1, blocks: [{ type: "figure", asset: { ...BANK }, alt: "x", caption: [] }, { type: "columns", columns: [{ blocks: [{ type: "image", asset: { ...BANK }, alt: "y" }] }, { blocks: [] }] }] };
    const e = compositeArabicExam();
    qOf(e).richContent = clone(rich);
    qOf(e).composite.groups[0].parts[0].richContent = clone(rich);
    e.sections[0].instructionsRichContent = clone(rich);
    e.coverPage = { enabled: true, instructionsRichContent: clone(rich) };
    e.sections[0].scenarios = [{ id: "scn1", version: 1, questionIds: ["q4"], sources: [{ id: "r1", version: 1, kind: "rich", richContent: clone(rich) }] }];
    const h = JSON.stringify(hydrateBankAssets(e));
    expect((h.match(/\/api\/question-image\?blob=/g) || []).length).toBe(10);
    const signed = hydrateBankAssets(e);
    expect(JSON.stringify(normalizeBankAssetsForStorage(signed))).not.toContain("/api/question-image");
  });
});

describe("20D1-S4 GRADING INERTNESS — presentation and rich content never change any academic result", () => {
  const dress = (e, preset) => { const d = clone(e); d.presentation = { schemaVersion: 1, preset }; for (const s of d.sections) { s.presentation = { schemaVersion: 1, components: { questionCard: { variant: "paper" } } }; s.instructionsRichContent = RICH(); for (const q of s.questions) { if (q.presentationType !== "parametricNumeric") q.richContent = RICH(); q.presentation = { schemaVersion: 1, width: "wide" }; if (q.composite) for (const g of q.composite.groups) for (const p of g.parts) if (p.type !== "parametricNumeric") p.richContent = RICH(); } } return d; };
  const ANSWERS = {
    arabic: { q4: { kind: "composite", parts: { pA1: { kind: "choice", index: 0 }, pB1: { kind: "fields", values: { t1: "k1", t2: "k2" } }, pB2: { kind: "fields", values: { x1: "c1", x2: "c2" } }, pB3: { kind: "numeric", value: "70" }, pC1: { kind: "text", value: "x" } }, contexts: {} } },
    physics: {}, cs: { cs1: { kind: "composite", parts: { c1: { kind: "code", language: "python", languageVersion: 1, source: "print(1)\n" } }, contexts: {} } }, network: {}
  };
  const FIX = { arabic: compositeArabicExam, physics: compositePhysicsExam, cs: compositeCsExam, network: compositeNetworkExam };
  for (const [name, f] of Object.entries(FIX)) it(name + ": ids, order, marks, totals, first-N, part selection, grades, manualReviewMarks and rebuild are identical under every preset", () => {
    const plain = gradeExam(f(), ANSWERS[name]);
    for (const preset of ["classicPaper", "networkLab", "highContrast"]) {
      const dressed = dress(f(), preset);
      expect(errors(dressed), preset).toEqual([]);
      const g = gradeExam(dressed, ANSWERS[name]);
      expect(g).toEqual(plain);
      const a1 = { questionGrades: clone(plain.questions), sections: clone(plain.sections), manualOverrides: {}, totalMarks: plain.totalMarks };
      const a2 = { questionGrades: clone(g.questions), sections: clone(g.sections), manualOverrides: {}, totalMarks: g.totalMarks };
      rebuildAttemptGrades(a1); rebuildAttemptGrades(a2);
      expect(a2).toEqual(a1);
      expect(normalizeDraftAnswers(ANSWERS[name], dressed)).toEqual(normalizeDraftAnswers(ANSWERS[name], f()));
    }
  });
  it("coding identities (job id, target ref, fingerprint, grading key) and the parametric child key are unchanged by presentation / rich content", () => {
    const official = require_("../src/lib/coding/official-grading.js");
    const at = e => { const g = gradeExam(e, ANSWERS.cs); return { attemptNumber: 1, submittedAt: "2026-01-01T00:00:00.000Z", answers: ANSWERS.cs, questionGrades: g.questions, sections: g.sections, manualOverrides: {}, totalMarks: g.totalMarks }; };
    const ids = e => { const a = official.targetAuthority(e, at(e), "cs1::part::c1", { assignmentId: "asg", studentId: "stu", revision: 1 }); return [a.jobId, a.targetRef, a.questionFingerprint, a.gradingKey, a.answerHash]; };
    expect(ids(dress(compositeCsExam(), "developerWorkspace"))).toEqual(ids(compositeCsExam()));
    const gen = { parametric: { assignmentId: "a", studentId: "s", attemptNumber: 1 } };
    const net = sanitizeExamForStudent(compositeNetworkExam(), gen), netD = sanitizeExamForStudent(dress(compositeNetworkExam(), "networkLab"), gen);
    const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k === "richContent" || k === "presentation" || k === "instructionsRichContent" ? undefined : v)));
    expect(strip(netD)).toEqual(strip(net));
  });
});
