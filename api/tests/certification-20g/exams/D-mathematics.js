// Phase 20G — certification exam D: MATHEMATICS (100 marks). numericResponse, parametricNumeric (v2 decimal-capable language, deterministic per
// attempt), structured types (matrix, categorization, matching), a functionStudy2d@1 study of a curriculum-valid rational function, a composite
// sharing ONE function-study context (linked parts + a parametric child + rubric) and open responses.
// The function, analysed BY HAND (never by the implementation):  f(x) = (2x − 4) / ((x − 1)(x + 2))
//   domain ℝ \ {−2, 1} · x-intercept (2, 0) · y-intercept f(0) = −4 / (−2) = 2 · vertical asymptotes x = −2, x = 1 · horizontal asymptote y = 0
//   f′(x) = −2x(x − 4) / ((x − 1)²(x + 2)²) ⇒ local min (0, 2), local max (4, 4/18 = 0.2222)
//   decreasing on (−∞, −2), (−2, 0), (4, +∞); increasing on (0, 1), (1, 4).
import { rationalCertificationConfig, rationalCertificationChecks } from "../../../../src/functionStudy/functionStudyTemplates.ts";
import * as K from "../kit.js";

const { A } = K;
const checkOf = id => ({ ...rationalCertificationChecks().find(c => c.id === id) });
const P2 = (variables, response = { unit: "none" }, derivedVariables = []) => ({ v: 2, generatorVersion: 2, variables, derivedVariables, constraints: [], response });

export function examD() {
  return K.exam("CERT20G-D-MATH", "شهادة 20G — امتحان الرياضيات: الدوال والتفاضل", [
    K.section("d-s1", "القسم الأول: أساسيات", [
      K.numeric("d1-1", "حلّ المعادلة 2x + 3 = 11.", 3, 4, 0),
      K.numeric("d1-2", "إذا كان f(x) = x²، فما قيمة f′(3)؟", 3, 6, 0),
      K.matrix("d1-3", "صنّف كل دالة:", 4, [["r1", "f(x) = x²"], ["r2", "f(x) = x³"], ["r3", "f(x) = x + 1"], ["r4", "f(x) = |x|"]], [["even", "زوجية"], ["odd", "فردية"], ["none", "ليست زوجية ولا فردية"]], { r1: "even", r2: "odd", r3: "none", r4: "even" }),
      K.categorization("d1-4", "صنّف الدوال الآتية:", 4, [["poly", "كثيرة حدود"], ["rat", "نسبية"]], [["i1", "x³ − 2x"], ["i2", "1 / (x − 1)"], ["i3", "(x + 1) / (x² + 1)"], ["i4", "5x + 2"]], { i1: "poly", i2: "rat", i3: "rat", i4: "poly" }),
      K.matching("d1-5", "صِل كل دالة بمشتقتها:", 4, [["m1", "x²", "2x"], ["m2", "x³", "3x²"]], ["2x", "3x²", "x"]),
      K.parametric("d1-6", "حلّ المعادلة {{a}}x + {{b}} = {{c}}.", 7, P2([{ id: "a", kind: "integer", min: 2, max: 9, step: 1 }, { id: "b", kind: "integer", min: 1, max: 20, step: 1 }, { id: "c", kind: "integer", min: 30, max: 60, step: 1 }]),
        { expression: "(c-b)/a", mode: "tolerance", tolerance: 0.01 })
    ]),
    K.section("d-s2", "القسم الثاني: مسائل بمعطيات متغيرة", [
      K.parametric("d2-1", "إذا كان f(x) = {{a}}x² + {{b}}x، فاحسب f′({{c}}).", 8, P2([{ id: "a", kind: "integer", min: 1, max: 6, step: 1 }, { id: "b", kind: "integer", min: -5, max: 5, step: 1 }, { id: "c", kind: "integer", min: 1, max: 5, step: 1 }]),
        { expression: "2*a*c+b", mode: "tolerance", tolerance: 0 }),
      K.parametric("d2-2", "حلّ المعادلة log₁₀(x) = {{k}}.", 7, P2([{ id: "k", kind: "integer", min: 1, max: 4, step: 1 }]), { expression: "10^k", mode: "range", below: 0, above: 0 })
    ]),
    K.section("d-s3", "القسم الثالث: دراسة دالة بالمحاكاة", [
      K.smartSim("d3-1", "ادرس الدالة f(x) = (2x − 4) / ((x − 1)(x + 2)) في نافذة الرسم وسجّل خصائصها.", 26, "functionStudy2d", 1, rationalCertificationConfig(), rationalCertificationChecks())
    ]),
    K.section("d-s4", "القسم الرابع: سؤال مركّب", [
      K.composite("d4-1", "استخدم دراسة الدالة المشتركة للإجابة عن البنود.", 34,
        [K.simContext("ctxFn", "الدالة f(x) = (2x − 4) / ((x − 1)(x + 2))", "functionStudy2d", 1, rationalCertificationConfig())],
        [K.group("gStudy", "الدراسة", [
          K.linkedSim("f1", "أ", "حدّد مجال الدالة (القيم المستثناة).", 4, "ctxFn", [checkOf("domain")]),
          K.linkedSim("f2", "ب", "حدّد خطوط التقارب الرأسية.", 4, "ctxFn", [checkOf("vertical-asymptotes")]),
          K.linkedSim("f3", "ج", "حدّد القيم القصوى المحلية.", 6, "ctxFn", [checkOf("extrema")])
        ]), K.group("gReason", "الاستنتاج", [
          K.part("q1", "د", K.mcq("x", "ما خط التقارب الأفقي للدالة؟", 4, ["y = 0", "y = 2", "لا يوجد"], 0), { contextId: "ctxFn" }),
          K.part("q2", "هـ", K.numeric("x", "ما قيمة f(0)؟", 4, 2, 0), { contextId: "ctxFn" }),
          K.part("q3", "و", K.parametric("x", "احسب f({{t}}) للدالة g(x) = x² − {{t}}.", 6, P2([{ id: "t", kind: "integer", min: 2, max: 9, step: 1 }]), { expression: "t^2-t", mode: "tolerance", tolerance: 0 })),
          K.part("o1", "ز", K.openResponse("x", "برّر لماذا تكون x = 1 خط تقارب رأسيًا وليست نقطة مستثناة فقط.", 6, "D41", [["limit", "النهايات", 4, [["full", 4], ["half", 2], ["none", 0]]], ["notation", "الرموز", 2, [["full", 2], ["none", 0]]]]), { contextId: "ctxFn" })
        ])])
    ])
  ], {
    coverPage: K.cover("الصف الثاني عشر — الرياضيات", "قرّب الإجابات العشرية إلى منزلتين. تُولَّد معطيات بعض الأسئلة لكل طالب."),
    presentation: { schemaVersion: 1, preset: "modernAcademic" }
  });
}

// ── answers ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const fnStudy = actions => A.sim("functionStudy2d", 1, actions);
export const FN = {
  domain: { type: "domain.setExclusions", values: [-2, 1] },
  xInt: { type: "intercepts.setX", points: [{ x: 2, y: 0 }] },
  yInt: { type: "intercept.setY", y: 2 },
  va: { type: "asymptotes.setVertical", values: [-2, 1] },
  ha: { type: "asymptotes.setHorizontal", values: [0] },
  extrema: { type: "extrema.set", points: [{ kind: "min", x: 0, y: 2 }, { kind: "max", x: 4, y: 0.2222 }] },
  intervals: { type: "intervals.set", intervals: [{ kind: "decreasing", from: "-inf", to: -2 }, { kind: "decreasing", from: -2, to: 0 }, { kind: "increasing", from: 0, to: 1 }, { kind: "increasing", from: 1, to: 4 }, { kind: "decreasing", from: 4, to: "+inf" }] }
};
const val = (d, qid, id, part) => {
  const q = d.sections.flatMap(s => s.questions).find(x => x.examQuestionId === qid);
  const node = part ? q.composite.groups.flatMap(g => g.parts).find(p => p.id === part) : q;
  return Number(node.parametric.values[id]);
};
const perfect = d => ({
  "d1-1": A.numeric(4), "d1-2": A.numeric(6), "d1-3": A.fields({ r1: "even", r2: "odd", r3: "none", r4: "even" }), "d1-4": A.fields({ i1: "poly", i2: "rat", i3: "rat", i4: "poly" }), "d1-5": A.fields({ m1: "2x", m2: "3x²" }),
  "d1-6": A.numeric(((val(d, "d1-6", "c") - val(d, "d1-6", "b")) / val(d, "d1-6", "a")).toFixed(4)),
  "d2-1": A.numeric(2 * val(d, "d2-1", "a") * val(d, "d2-1", "c") + val(d, "d2-1", "b")), "d2-2": A.numeric(10 ** val(d, "d2-2", "k")),
  "d3-1": fnStudy([FN.domain, FN.xInt, FN.yInt, FN.va, FN.ha, FN.extrema, FN.intervals]),
  "d4-1": A.composite({ q1: A.choice(0), q2: A.numeric(2), q3: A.numeric(val(d, "d4-1", "t", "q3") ** 2 - val(d, "d4-1", "t", "q3")), o1: A.text("لأن النهاية عند x → 1 من اليمين واليسار لا نهائية، بينما البسط لا ينعدم عند 1.") }, { ctxFn: fnStudy([FN.domain, FN.va, FN.extrema]) })
});
const RUB = awards => ({ rubricAwards: awards });
const PERFECT_AUTO = { "d1-1": [3, 0], "d1-2": [3, 0], "d1-3": [4, 0], "d1-4": [4, 0], "d1-5": [4, 0], "d1-6": [7, 0], "d2-1": [8, 0], "d2-2": [7, 0], "d3-1": [26, 0], "d4-1": [28, 6] };
export const PERSONAS = {
  PERFECT: {
    answers: perfect, auto: PERFECT_AUTO, parts: { "d4-1": { f1: [4, 0], f2: [4, 0], f3: [6, 0], q1: [4, 0], q2: [4, 0], q3: [6, 0], o1: [0, 6] } },
    review: { "d4-1::part::o1": RUB({ limit: { levelId: "full" }, notation: { levelId: "full" } }) }, final: 100
  },
  PARTIAL: {
    // function study: forgets the intervals and the y-intercept, records ONE extremum ⇒ extrema set mismatch; d1-3 two rows wrong; d2-1 answers f(c)
    // instead of f′(c); composite: extrema wrong (max only) and the parametric child copied from a neighbour's instance (value + 1).
    answers: d => ({ ...perfect(d), "d1-3": A.fields({ r1: "even", r2: "even", r3: "odd", r4: "even" }), "d2-1": A.numeric(val(d, "d2-1", "a") * val(d, "d2-1", "c") ** 2 + val(d, "d2-1", "b") * val(d, "d2-1", "c") + 1000),
      "d3-1": fnStudy([FN.domain, FN.xInt, FN.va, FN.ha, { type: "extrema.set", points: [{ kind: "max", x: 4, y: 0.2222 }] }]),
      "d4-1": A.composite({ q1: A.choice(2), q2: A.numeric(2), q3: A.numeric(val(d, "d4-1", "t", "q3") ** 2 - val(d, "d4-1", "t", "q3") + 1), o1: A.text("لأن المقام صفر.") }, { ctxFn: fnStudy([FN.domain, FN.va, { type: "extrema.set", points: [{ kind: "max", x: 4, y: 0.2222 }] }]) }) }),
    // d1-3 2 of 4 rows ⇒ 2 · d2-1 0 · d3-1 passes domain (2) + x-int (1) + VA (2) + HA (1) = 6 of 13 weight ⇒ 26·6/13 = 12 ·
    // composite: f1 4 + f2 4 + f3 0 + q1 0 + q2 4 + q3 0 = 12 automatic, o1 pending 6 · automatic total 3+3+2+4+4+7+0+7+12+12 = 54.
    auto: { ...PERFECT_AUTO, "d1-3": [2, 0], "d2-1": [0, 0], "d3-1": [12, 0], "d4-1": [12, 6] },
    parts: { "d4-1": { f1: [4, 0], f2: [4, 0], f3: [0, 0], q1: [0, 0], q2: [4, 0], q3: [0, 0], o1: [0, 6] } },
    review: { "d4-1::part::o1": RUB({ limit: { levelId: "half" }, notation: { levelId: "none" } }) }, final: 56
  }
};
