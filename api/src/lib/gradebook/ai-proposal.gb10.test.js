// Class gradebook GB10 (docs/enterprise-class-gradebook-gb.md §4.11) — the AI proposal of a scheme, PURE: the references the model is
// shown, the prompt, the strict schema, the weights computed here (never by the model), and the normalizer that lets only this class's
// sources into the proposal. TEST data only.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ai = require("./ai-proposal.js");
const { validateScheme } = require("./scheme.js");

const SOURCES = {
  // newest first, as listClassSources answers
  assignments: [
    { assignmentId: "as_exam3", title: "امتحان 3", totalMarks: 30, publishedAt: "2026-10-20T08:00:00.000Z" },
    { assignmentId: "as_exam2", title: "امتحان 2", totalMarks: 30, publishedAt: "2026-10-10T08:00:00.000Z" },
    { assignmentId: "as_exam1", title: "امتحان 1", totalMarks: 30, publishedAt: "2026-10-01T08:00:00.000Z" },
    { assignmentId: "as_train2", title: "التدريب 2", totalMarks: 10, publishedAt: "2026-09-20T08:00:00.000Z" },
    { assignmentId: "as_hw1", title: "الوظيفة 1", totalMarks: 10, publishedAt: "2026-09-10T08:00:00.000Z" }
  ],
  projects: [{ projectCode: "899373", title: "مشروع الشبكات" }]
};
const refs = ai.buildSourceRefs(SOURCES);
const item = (ref, weight, extra = {}) => ({ kind: "source", ref, manualTitle: "", manualMaxScore: null, weight, weightSource: weight === null ? "equalShare" : "stated", mention: ref, ...extra });
const manual = (manualTitle, manualMaxScore, weight, extra = {}) => ({ kind: "manual", ref: "", manualTitle, manualMaxScore, weight, weightSource: "stated", mention: manualTitle, ...extra });
const cat = (title, weight, items, weightSource = "stated") => ({ title, weight, weightSource, items });
const answer = (categories, extra = {}) => ({ categories, unmatched: [], assumptions: [], ...extra });
const context = { classId: "c1", assignments: new Map(SOURCES.assignments.map(a => [a.assignmentId, { ...a, classId: "c1", status: "published" }])), projectCodes: ["899373"] };

describe("GB10 — what the model is shown", () => {
  it("opaque references, oldest assignment first (A1 is the first published), then the projects; the real ids stay on the server", () => {
    expect(refs.list.map(s => s.ref + " " + s.title)).toEqual(["A1 الوظيفة 1", "A2 التدريب 2", "A3 امتحان 1", "A4 امتحان 2", "A5 امتحان 3", "P1 مشروع الشبكات"]);
    expect(refs.byRef.get("A3").source).toEqual({ kind: "assignment", assignmentId: "as_exam1" });
    expect(refs.byRef.get("P1").source).toEqual({ kind: "project", projectCode: "899373" });
    const prompt = ai.buildAiSchemePrompt("الشهري 20% والفصل 80%", refs);
    for (const a of SOURCES.assignments) expect(prompt).not.toContain(a.assignmentId);
    expect(prompt).not.toContain("899373");
    expect(prompt).toContain("A3 | واجب أو امتحان | امتحان 1 | العلامة الكاملة 30 | نُشر 2026-10-01");
    expect(prompt).toContain("<<<\nالشهري 20% والفصل 80%\n>>>");
  });
  it("at most 150 assignments (the newest ones), and the prompt says some were left out", () => {
    const many = { assignments: Array.from({ length: 160 }, (_, i) => ({ assignmentId: "a" + i, title: "واجب " + i, totalMarks: 10, publishedAt: "2026-01-01" })), projects: [] };
    const r = ai.buildSourceRefs(many);
    expect(r.list).toHaveLength(150);
    expect(r.truncated).toBe(true);
    expect(r.byRef.get("A150").source.assignmentId).toBe("a0");          // the newest one is the last reference
    expect(ai.buildAiSchemePrompt("وصف", r)).toContain("(عُرضت أحدث 150 واجبات فقط)");
  });
  it("the schema is strict-mode ready: every object closes its properties and requires each of them", () => {
    const walk = s => {
      if (!s || typeof s !== "object") return;
      if (s.type === "object") {
        expect(s.additionalProperties).toBe(false);
        expect([...s.required].sort()).toEqual(Object.keys(s.properties).sort());
      }
      for (const v of Object.values(s)) { if (Array.isArray(v)) v.forEach(walk); else walk(v); }
    };
    walk(ai.buildAiSchemeSchema());
  });
});

describe("GB10 — the weights are computed here, never rescaled", () => {
  const W = (...entries) => ai.resolveWeights(entries.map(([weight, weightSource]) => ({ weight, weightSource })));
  it("a stated weight is kept as it is, even when the list does not reach 100", () => {
    expect(W([30, "stated"], [30, "stated"], [30, "stated"]).weights).toEqual([30, 30, 30]);
  });
  it("«بالتساوي»: hundredths that add up to exactly 100, the remainder to the first ones", () => {
    expect(W([null, "equalShare"], [null, "equalShare"], [null, "equalShare"]).weights).toEqual([33.34, 33.33, 33.33]);
  });
  it("«الباقي بالتساوي»: the equal shares divide what the stated weights leave", () => {
    const r = W([10, "stated"], [15, "stated"], [null, "equalShare"], [null, "equalShare"], [null, "equalShare"]);
    expect(r.weights).toEqual([10, 15, 25, 25, 25]);
    expect(r.equal).toBe(true);
  });
  it("nothing left for the shares → no weight (the teacher types it); an invalid stated weight → no weight, never coerced", () => {
    expect(W([60, "stated"], [40, "stated"], [null, "equalShare"])).toMatchObject({ weights: [60, 40, null], noRemainder: true });
    expect(W([33.333, "stated"], [0, "stated"], [120, "suggested"])).toMatchObject({ weights: [null, null, null], invalid: true });
  });
  it("the model's arithmetic is ignored for an equal share (it sends a weight anyway)", () => {
    expect(W([50, "equalShare"], [50, "equalShare"], [50, "equalShare"]).weights).toEqual([33.34, 33.33, 33.33]);
  });
});

describe("GB10 — the normalizer", () => {
  it("the owner's example (§1) is proposed exactly, and its scheme is active once saved", () => {
    const r = ai.normalizeAiScheme(answer([
      cat("علامة الشهري", 20, [item("A1", 10), item("A2", 15), item("A3", 25), item("A4", 25), item("A5", 25)]),
      cat("علامة الفصل 1", 40, [manual("الحضور والمشاركة", 10, 20), item("P1", 80)]),
      cat("علامة الفصل 2", 40, [manual("امتحان ورقي", 50, 100)])
    ]), refs);
    expect(r.ok).toBe(true);
    expect(r.proposal.built).toBe(8);
    expect(r.proposal.unmatched).toEqual([]);
    expect(r.proposal.categories[0]).toEqual({ title: "علامة الشهري", weight: 20, items: [
      { weight: 10, source: { kind: "assignment", assignmentId: "as_hw1" }, title: "الوظيفة 1" },
      { weight: 15, source: { kind: "assignment", assignmentId: "as_train2" }, title: "التدريب 2" },
      { weight: 25, source: { kind: "assignment", assignmentId: "as_exam1" }, title: "امتحان 1" },
      { weight: 25, source: { kind: "assignment", assignmentId: "as_exam2" }, title: "امتحان 2" },
      { weight: 25, source: { kind: "assignment", assignmentId: "as_exam3" }, title: "امتحان 3" }
    ] });
    expect(r.proposal.categories[1].items[0]).toEqual({ weight: 20, source: { kind: "manual", title: "الحضور والمشاركة", maxScore: 10 }, title: "الحضور والمشاركة" });
    expect(JSON.stringify(r.proposal)).not.toMatch(/"(categoryId|itemId)"/);   // no id travels: the page gives new ones
    expect(ai.proposalIsSaveable(r.proposal, context)).toBe(true);
  });
  it("an invented reference is refused and listed with its weight; the other weights are not redistributed", () => {
    const r = ai.normalizeAiScheme(answer([cat("الشهري", 100, [item("A1", 50), item("A9", 50, { mention: "امتحان 4" }), item("as_exam1", 0, { mention: "معرّف حقيقي" })])]), refs);
    expect(r.proposal.categories[0].items).toEqual([{ weight: 50, source: { kind: "assignment", assignmentId: "as_hw1" }, title: "الوظيفة 1" }]);
    expect(r.proposal.unmatched).toEqual([
      { category: "الشهري", title: "امتحان 4", weight: 50, code: "UNKNOWN_SOURCE", reason: ai.REASONS.UNKNOWN_SOURCE },
      { category: "الشهري", title: "معرّف حقيقي", weight: null, code: "UNKNOWN_SOURCE", reason: ai.REASONS.UNKNOWN_SOURCE }
    ]);
  });
  it("an equal share is computed over every column the model listed, so a missing one keeps its share in the list", () => {
    const r = ai.normalizeAiScheme(answer([cat("الشهري", 100, [item("A3", null), item("A4", null), item("A8", null, { mention: "امتحان 4" })])]), refs);
    expect(r.proposal.categories[0].items.map(i => i.weight)).toEqual([33.34, 33.33]);
    expect(r.proposal.unmatched[0]).toMatchObject({ title: "امتحان 4", weight: 33.33, code: "UNKNOWN_SOURCE" });
    expect(r.proposal.notes).toContain("وُزّعت أوزان «الشهري» بالتساوي.");
  });
  it("a source used twice is listed (DUPLICATE); a project reference maps to the class's project", () => {
    const r = ai.normalizeAiScheme(answer([cat("أ", 50, [item("A1", 100)]), cat("ب", 50, [item("A1", 50), item("P1", 50)])]), refs);
    expect(r.proposal.categories[1].items).toEqual([{ weight: 50, source: { kind: "project", projectCode: "899373" }, title: "مشروع الشبكات" }]);
    expect(r.proposal.unmatched).toEqual([expect.objectContaining({ category: "ب", title: "الوظيفة 1", code: "DUPLICATE", weight: 50 })]);
  });
  it("a manual column without the maximum the teacher stated is listed, never given an invented maximum", () => {
    const r = ai.normalizeAiScheme(answer([cat("الفصل", 100, [manual("الحضور", null, 100), manual("   ", 10, 0)])]), refs);
    expect(r.proposal.categories[0].items).toEqual([]);
    expect(r.proposal.unmatched.map(u => [u.title, u.code, u.weight])).toEqual([["الحضور", "MANUAL_MAX_MISSING", 100], ["", "MANUAL_TITLE", null]]);
  });
  it("what the model could not find is listed with the candidates' titles; an unknown candidate is dropped", () => {
    const r = ai.normalizeAiScheme(answer([cat("الشهري", 100, [item("A1", 100)])], { unmatched: [{ category: "الشهري", mention: "امتحان 4", candidates: ["A5", "A77", "A5"] }], assumptions: ["  افترضت أن الشهري  هو الامتحانات القصيرة "] }), refs);
    expect(r.proposal.unmatched).toEqual([{ category: "الشهري", title: "امتحان 4", weight: null, code: "NOT_FOUND", reason: ai.REASONS.NOT_FOUND, candidates: ["امتحان 3"] }]);
    expect(r.proposal.assumptions).toEqual(["افترضت أن الشهري هو الامتحانات القصيرة"]);
  });
  it("weights the model chose itself are named in the notes; a part without a title is named and said", () => {
    const r = ai.normalizeAiScheme(answer([cat("", 60, [item("A1", 100)], "suggested"), cat("ب", 40, [item("A2", 70, { weightSource: "suggested" }), item("A3", 30, { weightSource: "suggested" })])]), refs);
    expect(r.proposal.categories.map(c => [c.title, c.weight])).toEqual([["القسم 1", 60], ["ب", 40]]);
    expect(r.proposal.notes).toEqual(["نسب الأقسام مقترحة من الذكاء الاصطناعي؛ راجعها.", "قسم بلا عنوان سُمّي «القسم 1»؛ غيّر عنوانه.", "أوزان «ب» مقترحة من الذكاء الاصطناعي؛ راجعها."]);
  });
  it("more than ten parts: the first ten, and a note; no part at all → AI_NO_SCHEME; not an object → AI_RESPONSE_MALFORMED", () => {
    const r = ai.normalizeAiScheme(answer(Array.from({ length: 12 }, (_, i) => cat("ق" + i, null, [], "equalShare"))), refs);
    expect(r.proposal.categories).toHaveLength(10);
    expect(r.proposal.categories.every(c => c.weight === 10)).toBe(true);
    expect(r.proposal.notes[0]).toContain("أكثر من 10 أقسام");
    expect(ai.normalizeAiScheme(answer([]), refs)).toMatchObject({ ok: false, code: "AI_NO_SCHEME" });
    expect(ai.normalizeAiScheme("نص", refs)).toMatchObject({ ok: false, code: "AI_RESPONSE_MALFORMED" });
    expect(ai.normalizeAiScheme({ categories: "x" }, refs)).toMatchObject({ ok: false, code: "AI_RESPONSE_MALFORMED" });
  });
});

describe("GB10 — defence in depth: the proposal is what «حفظ» accepts", () => {
  it("a proposal whose source is not this class's is refused by the server's own validator", () => {
    const foreign = { categories: [{ title: "أ", weight: 100, items: [{ weight: 100, source: { kind: "assignment", assignmentId: "as_other_class" }, title: "x" }] }] };
    expect(ai.proposalIsSaveable(foreign, context)).toBe(false);
    expect(ai.proposalIsSaveable({ categories: [{ title: "أ", weight: null, items: [] }] }, context)).toBe(true);   // nothing to check yet
    // the temporary ids are only for the check: the validator's own answer for the same scheme agrees
    expect(validateScheme({ categories: [{ categoryId: "c_1", title: "أ", weight: 100, items: [{ itemId: "i_2", weight: 100, source: { kind: "assignment", assignmentId: "as_hw1" } }] }] }, context).ok).toBe(true);
  });
});
