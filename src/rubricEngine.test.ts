import { describe, expect, it } from "vitest";
import {
  RUBRIC_LIMITS, bindRubricAwards, defaultRubric, projectRubricForStudent, rubricTotalPoints, scoreRubric, validateRubric
} from "./rubricEngine";

// Phase 19E — the domain-neutral RUBRIC engine (pure: no React, no DOM, no network, no AI). A rubric is ordered criteria, each with
// 2..8 levels; the teacher awards one level (or, where the criterion explicitly allows it, bounded custom points) per criterion and the
// SERVER computes: awarded = Σ criterion awards, score = round2(questionMarks × awarded / Σ criterion maxPoints). Malformed authority is
// never repaired. Fail-first on ef679cc (no module).
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const lv = (id: string, points: number, label = id, description = "") => ({ id, label, points, description });
const RUBRIC = {
  v: 1,
  criteria: [
    { id: "accuracy", title: "الدقة العلمية", description: "صحة المفاهيم", maxPoints: 4, allowCustomPoints: false, guidance: "يذكر الطبقات السبع بالترتيب", levels: [lv("excellent", 4, "ممتاز"), lv("good", 3, "جيد"), lv("weak", 1, "ضعيف"), lv("none", 0, "لا يوجد")] },
    { id: "reasoning", title: "التعليل", description: "", maxPoints: 3, allowCustomPoints: true, guidance: "", levels: [lv("good", 3), lv("partial", 1.5), lv("none", 0)] },
    { id: "clarity", title: "الوضوح والتنظيم", description: "", maxPoints: 3, allowCustomPoints: false, guidance: "", levels: [lv("good", 3), lv("ok", 2), lv("none", 0)] }
  ]
};
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const withCrit = (i: number, over: Record<string, unknown>) => { const r = clone(RUBRIC) as { v: number; criteria: Record<string, unknown>[] }; r.criteria[i] = { ...r.criteria[i], ...over }; return r; };

describe("19E rubric engine — validation (strict, never repaired)", () => {
  it("a valid rubric is returned canonically (optional fields filled explicitly, order kept)", () => {
    const r = validateRubric(RUBRIC);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.rubric).toEqual(RUBRIC); expect(rubricTotalPoints(r.rubric)).toBe(10); }
    const minimal = { v: 1, criteria: [{ id: "c1", title: "المحتوى", maxPoints: 2, levels: [{ id: "a", label: "كامل", points: 2 }, { id: "b", label: "لا شيء", points: 0 }] }] };
    const m = validateRubric(minimal);
    expect(m.ok && m.rubric).toEqual({ v: 1, criteria: [{ id: "c1", title: "المحتوى", description: "", maxPoints: 2, allowCustomPoints: false, guidance: "", levels: [{ id: "a", label: "كامل", points: 2, description: "" }, { id: "b", label: "لا شيء", points: 0, description: "" }] }] });
  });
  it("the default rubric is valid and immediately useful (four criteria, 10 points)", () => {
    const d = validateRubric(defaultRubric());
    expect(d.ok).toBe(true);
    if (d.ok) { expect(d.rubric.criteria).toHaveLength(4); expect(rubricTotalPoints(d.rubric)).toBe(10); }
  });
  it("root: exact keys, version, criteria count; prototype-sensitive keys refused", () => {
    expect(codes(validateRubric(null))).toEqual(["RUBRIC_INVALID"]);
    expect(codes(validateRubric([]))).toEqual(["RUBRIC_INVALID"]);
    expect(codes(validateRubric({ ...RUBRIC, extra: 1 }))).toContain("RUBRIC_INVALID");
    expect(codes(validateRubric(JSON.parse('{"v":1,"criteria":[],"__proto__":{"x":1}}')))).toContain("RUBRIC_INVALID");
    expect(codes(validateRubric({ ...RUBRIC, v: 2 }))).toContain("RUBRIC_VERSION_UNSUPPORTED");
    expect(codes(validateRubric({ ...RUBRIC, v: "1" }))).toContain("RUBRIC_VERSION_UNSUPPORTED");
    expect(codes(validateRubric({ v: 1, criteria: [] }))).toContain("RUBRIC_CRITERIA_COUNT");
    const many = { v: 1, criteria: Array.from({ length: RUBRIC_LIMITS.criteria + 1 }, (_, i) => ({ id: "c" + i, title: "t", maxPoints: 1, levels: [lv("a", 1), lv("b", 0)] })) };
    expect(codes(validateRubric(many))).toContain("RUBRIC_CRITERIA_COUNT");
  });
  it("criterion ids: grammar, uniqueness, prototype-sensitive names", () => {
    for (const id of ["", "1abc", "a b", "__proto__", "constructor", "prototype", "x".repeat(33), 7, null])
      expect(codes(validateRubric(withCrit(0, { id }))), String(id)).toContain("RUBRIC_ID_INVALID");
    expect(codes(validateRubric(withCrit(1, { id: "accuracy" })))).toContain("RUBRIC_ID_DUPLICATE");
  });
  it("criterion fields: unknown keys, bounded texts, maxPoints finite / positive / ≤ limit / ≤ 2 decimals, boolean flag", () => {
    expect(codes(validateRubric(withCrit(0, { weight: 2 })))).toContain("RUBRIC_CRITERION_INVALID");
    expect(codes(validateRubric(withCrit(0, { title: "  " })))).toContain("RUBRIC_TEXT_INVALID");
    expect(codes(validateRubric(withCrit(0, { title: "t".repeat(RUBRIC_LIMITS.titleChars + 1) })))).toContain("RUBRIC_TEXT_INVALID");
    expect(codes(validateRubric(withCrit(0, { description: "d".repeat(RUBRIC_LIMITS.descriptionChars + 1) })))).toContain("RUBRIC_TEXT_INVALID");
    expect(codes(validateRubric(withCrit(0, { guidance: "g".repeat(RUBRIC_LIMITS.guidanceChars + 1) })))).toContain("RUBRIC_TEXT_INVALID");
    for (const maxPoints of [0, -4, NaN, Infinity, -Infinity, "4", null, RUBRIC_LIMITS.maxPoints + 1, 4.125])
      expect(codes(validateRubric(withCrit(0, { maxPoints }))), String(maxPoints)).toContain("RUBRIC_POINTS_INVALID");
    expect(codes(validateRubric(withCrit(0, { allowCustomPoints: "yes" })))).toContain("RUBRIC_CRITERION_INVALID");
  });
  it("levels: 2..8, exact keys, unique ids, points finite / ≥ 0 / ≤ criterion max / ≤ 2 decimals / unique; a max level and a zero level", () => {
    expect(codes(validateRubric(withCrit(0, { levels: [lv("a", 4)] })))).toContain("RUBRIC_LEVELS_COUNT");
    expect(codes(validateRubric(withCrit(0, { levels: Array.from({ length: RUBRIC_LIMITS.levels + 1 }, (_, i) => lv("l" + i, i === 0 ? 4 : i === 1 ? 0 : 4 - i / 4)) })))).toContain("RUBRIC_LEVELS_COUNT");
    expect(codes(validateRubric(withCrit(0, { levels: [{ ...lv("a", 4), secret: 1 }, lv("b", 0)] })))).toContain("RUBRIC_LEVEL_INVALID");
    expect(codes(validateRubric(withCrit(0, { levels: [lv("a", 4), lv("a", 0)] })))).toContain("RUBRIC_LEVEL_ID_DUPLICATE");
    expect(codes(validateRubric(withCrit(0, { levels: [lv("__proto__", 4), lv("b", 0)] })))).toContain("RUBRIC_ID_INVALID");
    for (const points of [-1, NaN, Infinity, 5, "4", 1.005])
      expect(codes(validateRubric(withCrit(0, { levels: [lv("a", 4), lv("b", 0), lv("c", points as number)] }))), String(points)).toContain("RUBRIC_LEVEL_POINTS_INVALID");
    expect(codes(validateRubric(withCrit(0, { levels: [lv("a", 4), lv("b", 2), lv("c", 2), lv("d", 0)] })))).toContain("RUBRIC_LEVEL_POINTS_DUPLICATE");
    expect(codes(validateRubric(withCrit(0, { levels: [lv("a", 3), lv("b", 0)] })))).toContain("RUBRIC_LEVEL_MAX_MISSING");
    expect(codes(validateRubric(withCrit(0, { levels: [lv("a", 4), lv("b", 1)] })))).toContain("RUBRIC_LEVEL_ZERO_MISSING");
    expect(codes(validateRubric(withCrit(0, { levels: [lv("a", 4, ""), lv("b", 0)] })))).toContain("RUBRIC_TEXT_INVALID");
    expect(codes(validateRubric(withCrit(0, { levels: [lv("a", 4, "ممتاز", "d".repeat(RUBRIC_LIMITS.descriptionChars + 1)), lv("b", 0)] })))).toContain("RUBRIC_TEXT_INVALID");
  });
  it("the rubric total is bounded", () => {
    const big = { v: 1, criteria: Array.from({ length: RUBRIC_LIMITS.criteria }, (_, i) => ({ id: "c" + i, title: "t", maxPoints: RUBRIC_LIMITS.maxPoints, levels: [lv("a", RUBRIC_LIMITS.maxPoints), lv("b", 0)] })) };
    expect(codes(validateRubric(big))).toContain("RUBRIC_TOTAL_TOO_LARGE");
  });
});

describe("19E rubric engine — student projection (no private guidance, no ids, no flags)", () => {
  it("public projection carries only titles, descriptions, max points and level labels / points / descriptions", () => {
    const r = validateRubric(RUBRIC);
    if (!r.ok) throw new Error("fixture");
    const p = projectRubricForStudent(r.rubric);
    expect(p).toEqual({
      totalPoints: 10,
      criteria: [
        { title: "الدقة العلمية", description: "صحة المفاهيم", maxPoints: 4, levels: [{ label: "ممتاز", points: 4, description: "" }, { label: "جيد", points: 3, description: "" }, { label: "ضعيف", points: 1, description: "" }, { label: "لا يوجد", points: 0, description: "" }] },
        { title: "التعليل", description: "", maxPoints: 3, levels: [{ label: "good", points: 3, description: "" }, { label: "partial", points: 1.5, description: "" }, { label: "none", points: 0, description: "" }] },
        { title: "الوضوح والتنظيم", description: "", maxPoints: 3, levels: [{ label: "good", points: 3, description: "" }, { label: "ok", points: 2, description: "" }, { label: "none", points: 0, description: "" }] }
      ]
    });
    expect(JSON.stringify(p)).not.toMatch(/guidance|يذكر الطبقات|allowCustomPoints|"id"/);
  });
});

describe("19E rubric engine — teacher award binding (server authority)", () => {
  const rub = () => { const r = validateRubric(RUBRIC); if (!r.ok) throw new Error("fixture"); return r.rubric; };
  const ALL = { accuracy: { levelId: "good" }, reasoning: { levelId: "partial" }, clarity: { levelId: "good" } };
  it("level awards bind to the criterion's OWN level points; canonical order; awarded total", () => {
    expect(bindRubricAwards(rub(), ALL)).toEqual({ ok: true, awards: { accuracy: { levelId: "good", points: 3 }, reasoning: { levelId: "partial", points: 1.5 }, clarity: { levelId: "good", points: 3 } }, awarded: 7.5 });
  });
  it("custom points only where the criterion allows them: finite, 0..max, ≤ 2 decimals", () => {
    expect(bindRubricAwards(rub(), { ...ALL, reasoning: { points: 2.25 } })).toMatchObject({ ok: true, awards: { reasoning: { levelId: null, points: 2.25 } }, awarded: 8.25 });
    expect(bindRubricAwards(rub(), { ...ALL, accuracy: { points: 2 } })).toEqual({ ok: false, code: "RUBRIC_AWARD_CUSTOM_NOT_ALLOWED", criterionId: "accuracy" });
    for (const points of [-0.5, 3.5, NaN, Infinity, "2", 1.125, null])
      expect(bindRubricAwards(rub(), { ...ALL, reasoning: { points } }), String(points)).toMatchObject({ ok: false, code: "RUBRIC_AWARD_POINTS_INVALID", criterionId: "reasoning" });
  });
  it("every criterion must be awarded exactly once; unknown criteria / levels and forged fields are refused", () => {
    expect(bindRubricAwards(rub(), { accuracy: { levelId: "good" }, reasoning: { levelId: "partial" } })).toEqual({ ok: false, code: "RUBRIC_AWARD_INCOMPLETE", criterionId: "clarity" });
    expect(bindRubricAwards(rub(), { ...ALL, ghost: { levelId: "good" } })).toEqual({ ok: false, code: "RUBRIC_AWARD_UNKNOWN_CRITERION", criterionId: "ghost" });
    expect(bindRubricAwards(rub(), { ...ALL, accuracy: { levelId: "legendary" } })).toEqual({ ok: false, code: "RUBRIC_AWARD_UNKNOWN_LEVEL", criterionId: "accuracy" });
    // "partial" exists only in `reasoning`: another criterion cannot borrow it.
    expect(bindRubricAwards(rub(), { ...ALL, clarity: { levelId: "partial" } })).toEqual({ ok: false, code: "RUBRIC_AWARD_UNKNOWN_LEVEL", criterionId: "clarity" });
    for (const forged of [{ levelId: "good", points: 99 }, { levelId: "good", maxPoints: 100 }, { levelId: "good", score: 4 }, {}, { levelId: 3 }, "good", null])
      expect(bindRubricAwards(rub(), { ...ALL, accuracy: forged }).ok, JSON.stringify(forged)).toBe(false);
    for (const raw of [null, [], "x", JSON.parse('{"__proto__":{"levelId":"good"}}'), Object.assign(Object.create({ inherited: 1 }), ALL)])
      expect(bindRubricAwards(rub(), raw).ok).toBe(false);
  });
});

describe("19E rubric engine — official score (server computes; client arithmetic never counts)", () => {
  const ALL = { accuracy: { levelId: "good" }, reasoning: { levelId: "partial" }, clarity: { levelId: "good" } };
  it("score = round2(questionMarks × awarded / rubricTotal); every criterion counts", () => {
    expect(scoreRubric({ rubric: RUBRIC, awards: ALL, maxMarks: 10 })).toEqual({ ok: true, score: 7.5, awarded: 7.5, total: 10, awards: { accuracy: { levelId: "good", points: 3 }, reasoning: { levelId: "partial", points: 1.5 }, clarity: { levelId: "good", points: 3 } } });
    expect(scoreRubric({ rubric: RUBRIC, awards: ALL, maxMarks: 20 })).toMatchObject({ ok: true, score: 15 });
    expect(scoreRubric({ rubric: RUBRIC, awards: ALL, maxMarks: 6 })).toMatchObject({ ok: true, score: 4.5 });
    expect(scoreRubric({ rubric: RUBRIC, awards: ALL, maxMarks: 7 })).toMatchObject({ ok: true, score: 5.25 });
    expect(scoreRubric({ rubric: RUBRIC, awards: { accuracy: { levelId: "none" }, reasoning: { levelId: "none" }, clarity: { levelId: "ok" } }, maxMarks: 3 })).toMatchObject({ ok: true, awarded: 2, score: 0.6 });
    expect(scoreRubric({ rubric: RUBRIC, awards: { accuracy: { levelId: "excellent" }, reasoning: { levelId: "good" }, clarity: { levelId: "good" } }, maxMarks: 10 })).toMatchObject({ ok: true, score: 10 });
    expect(scoreRubric({ rubric: RUBRIC, awards: { accuracy: { levelId: "excellent" }, reasoning: { levelId: "good" }, clarity: { levelId: "none" } }, maxMarks: 10 })).toMatchObject({ ok: true, awarded: 7, score: 7 });
  });
  it("forged totals / scores / maxima on the request never change the official result", () => {
    const forged = { ...ALL, score: 10, awarded: 10, total: 1, maxMarks: 100 } as Record<string, unknown>;
    expect(scoreRubric({ rubric: RUBRIC, awards: forged, maxMarks: 10 })).toEqual({ ok: false, code: "RUBRIC_AWARD_UNKNOWN_CRITERION", criterionId: "score" });
  });
  it("malformed PUBLISHED rubric or invalid marks ⇒ no official score (never repaired)", () => {
    for (const [rubric, maxMarks] of [[{ ...RUBRIC, v: 2 }, 10], [withCrit(0, { maxPoints: -1 }), 10], [null, 10], [RUBRIC, 0], [RUBRIC, -5], [RUBRIC, NaN], [RUBRIC, Infinity]] as [unknown, number][])
      expect(scoreRubric({ rubric, awards: ALL, maxMarks }).ok, JSON.stringify([rubric, maxMarks]).slice(0, 80)).toBe(false);
    expect(scoreRubric({ rubric: { ...RUBRIC, v: 2 }, awards: ALL, maxMarks: 10 })).toEqual({ ok: false, code: "RUBRIC_AUTHORITY_INVALID" });
  });
  it("stale awards against a CHANGED published rubric are refused (no silent remap)", () => {
    const changed = withCrit(0, { levels: [lv("top", 4), lv("mid", 2), lv("none", 0)] });
    expect(scoreRubric({ rubric: changed, awards: ALL, maxMarks: 10 })).toEqual({ ok: false, code: "RUBRIC_AWARD_UNKNOWN_LEVEL", criterionId: "accuracy" });
  });
  it("deterministic: same inputs ⇒ identical output; the input objects are not mutated", () => {
    const rubric = clone(RUBRIC), awards = clone(ALL);
    const a = scoreRubric({ rubric, awards, maxMarks: 9 }), b = scoreRubric({ rubric, awards, maxMarks: 9 });
    expect(a).toEqual(b); expect(rubric).toEqual(RUBRIC); expect(awards).toEqual(ALL);
    expect(a).toMatchObject({ ok: true, score: 6.75 });
  });
});
