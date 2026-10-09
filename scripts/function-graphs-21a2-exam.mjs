// Phase 21A.2 — deterministic enterprise function-graph acceptance exam (A–I).
// The SINGLE graph fixtures authority is src/functionGraphs/testing/graphFixtures.ts.
export const GRAPHS_ACCEPTANCE_PATH = "docs/fixtures/function-graphs-21a2/ExamBank_21A2_Function_Graphs_Mini_Acceptance.json";
export const serializeExam = exam => JSON.stringify(exam, null, 2) + "\n";
export function buildGraphsAcceptanceExam(G) {
  const paragraph = text => ({ type: "paragraph", runs: [{ text }] });
  const rich = (...blocks) => ({ schemaVersion: 1, blocks });
  const graphBlock = graph => ({ type: "functionGraph", graph });
  const select = (id, text, graph, target, mode, maxSelections, correct, marks = 4, extra = {}) => ({
    examQuestionId: id, presentationType: "functionGraphSelection", questionTypeVersion: 1, text, marks,
    functionGraphSelection: { v: 1, graph, target, mode, maxSelections },
    answer: { scoring: mode === "multiple" ? "partial" : "allOrNothing", correct }, ...extra
  });
  const section = (id, title, questions) => ({ id, title, gradingPolicy: "all", questions });
  // Students cannot identify the asymptotes by a unique line style: all line styles are the same.
  const rational = G.rationalGraph();
  rational.lines = rational.lines.map(l => ({ ...l, style: { line: "solid" } }));
  const quadratic = G.quadraticGraph();
  const circle = G.circleGraph();
  const composite = {
    examQuestionId: "i1", presentationType: "composite", questionTypeVersion: 1,
    text: "اقرأ رسم الدوال التالي ثم أجب عن جزأي السؤال.", marks: 6,
    composite: {
      v: 1,
      contexts: [{
        id: "ctxI", version: 1, kind: "source", title: "تمثيل بياني بارامتري",
        sources: [{ id: "srcI", version: 1, kind: "rich", title: "رسم للدراسة", richContent: rich(paragraph("قارن بين المنحنيين على المستوى."), graphBlock(circle)) }]
      }],
      groups: [{
        id: "grpI", title: "أسئلة الرسم", gradingPolicy: "all", requiredAnswers: null, maxMarks: null,
        parts: [{
          id: "part1", label: "أ", type: "functionGraphSelection", questionTypeVersion: 1,
          contextId: "ctxI", text: "حدّد المنحنى البارامتري.", marks: 3,
          functionGraphSelection: { v: 1, graph: G.circleGraph(), target: "curve", mode: "single", maxSelections: 1 },
          answer: { scoring: "allOrNothing", correct: ["curve:circ"] }
        }, {
          id: "part2", label: "ب", type: "numericResponse", questionTypeVersion: 1,
          contextId: "ctxI", text: "ما نصف قطر الدائرة المرسومة؟", marks: 3,
          numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 2, tolerance: 0 }
        }]
      }]
    },
    answer: {}
  };
  return {
    schemaVersion: 2, examId: "EXAMBANK-21A2-FUNCTION-GRAPHS-MINI",
    title: "ExamBank 21A.2 — اختبار القبول لمحرك رسوم الدوال الرياضية",
    status: "draft", metadata: {},
    coverPage: {
      enabled: true, activityType: "exam", subtitle: "قراءة الرسوم الرياضية وتحليلها",
      instructions: "اقرأ الرسم بعناية. اختر العناصر مباشرة من الرسم أو من قائمة العناصر المتاحة.",
      instructionsRichContent: rich(paragraph("الأسئلة تتناول الدوال والمشتقات والمماسات والمناطق المظلّلة.")),
      showStudentName: true, showClassName: true, showExamDate: true, showDuration: true, showTotalMarks: true, showMarksDistribution: true
    },
    presentation: { schemaVersion: 1, preset: "modernAcademic" },
    sections: [
      section("sec-a", "أ — الدالة التربيعية", [
        select("a1", "حدّد النقطتين الواقعتين على محور x (جذري الدالة).", quadratic, "point", "multiple", 2, ["point:p1", "point:p2"])
      ]),
      section("sec-b", "ب — الدالة الكسرية وخطوط التقارب", [
        select("b1", "حدّد خط التقارب الرأسي بين الخطوط الثلاثة.", rational, "line", "single", 1, ["line:l1"])
      ]),
      section("sec-c", "ج — دالة الجيب", [
        select("c1", "اختر نقطة القيمة العظمى للجيب.", G.sineGraph(), "point", "single", 1, ["point:q1"])
      ]),
      section("sec-d", "د — الدالة متعددة القطع", [
        select("d1", "اختر النقطة المفتوحة عند طرف المجال.", G.piecewiseGraph(), "point", "single", 1, ["point:m1"])
      ]),
      section("sec-e", "هـ — تقاطع منحنيين", [
        select("e1", "حدّد نقطتي تقاطع المنحنيين.", G.intersectionGraph(), "point", "multiple", 2, ["point:e1", "point:e2"])
      ]),
      section("sec-f", "و — المماس والمشتقة", [
        select("f1", "اختر المستقيم المماس المسمّى T1.", G.tangentGraph(), "tangent", "single", 1, ["tangent:t1"])
      ]),
      section("sec-g", "ز — المساحات والتكامل التمثيلي", [
        select("g1", "اختر المنطقة المظلّلة R1.", G.areaGraph(), "region", "single", 1, ["region:r1"])
      ]),
      section("sec-h", "ح — العرض باللغة العربية", [
        select("h1", "حدّد النقطة التي تقع على محور الصادات.", G.arabicGraph(), "point", "single", 1, ["point:n1"],
          4, { richContent: rich(paragraph("يحتوي الشكل على محاور ونقاط بعناوين عربية.")) })
      ]),
      section("sec-i", "ط — سؤال مركّب مع مصدر بصري", [composite])
    ]
  };
}
