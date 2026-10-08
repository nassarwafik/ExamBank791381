// Phase 21A.1 — writes the INTERACTIVE CHARTS MINI ACCEPTANCE EXAM (docs/fixtures/data-charts-21a1/…json) from the shared chart fixtures
// (src/charts/testing/chartFixtures.ts), so the exam, the unit suites and the certification use the SAME charts. Run with Node ≥ 22.18
// (TypeScript type stripping): `node scripts/generate-data-charts-21a1-fixture.mjs`. The certification test pins the committed file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const C = await import(pathToUrl(path.join(repo, "src/charts/testing/chartFixtures.ts")));
function pathToUrl(p) { return new URL("file://" + p).href; }

const para = text => ({ type: "paragraph", runs: [{ text }] });
const rich = (...blocks) => ({ schemaVersion: 1, blocks });
const chartBlock = chart => ({ type: "dataChart", chart });
const note = id => "CHART21A1-PRIVATE-NOTE-" + id;
const mcq = (id, text, options, correct, marks, extra = {}) => ({ examQuestionId: id, presentationType: "multipleChoice", text, marks, options: options.map(t => ({ text: t })), answer: { correctOptionIndex: correct }, teacherNote: note(id), ...extra });
const numeric = (id, text, expected, marks, extra = {}) => ({ examQuestionId: id, presentationType: "numericResponse", questionTypeVersion: 1, text, marks, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected, tolerance: 0 }, teacherNote: note(id), ...extra });
const select = (id, text, chart, target, mode, maxSelections, scoring, correct, marks, extra = {}) => ({
  examQuestionId: id, presentationType: "chartSelection", questionTypeVersion: 1, text, marks,
  chartSelection: { v: 1, chart, target, mode, maxSelections }, answer: { scoring, correct }, teacherNote: note(id), ...extra
});

const rain = C.rainfallBar();
const exam = {
  schemaVersion: 2,
  examId: "EXAMBANK-21A1-CHARTS-MINI",
  title: "ExamBank 21A.1 — اختبار القبول المصغّر للرسوم البيانية التفاعلية",
  status: "draft",
  metadata: {},
  coverPage: {
    enabled: true, activityType: "exam", subtitle: "قراءة البيانات وتحليلها — الصف العاشر",
    instructions: "أجب عن جميع الأسئلة. يمكنك الاختيار من الرسم بالنقر أو من قائمة العناصر تحت الرسم، وعرض البيانات كجدول في أي وقت.",
    instructionsRichContent: rich(para("أجب عن جميع الأسئلة."), para("يمكنك الاختيار من الرسم بالنقر أو من قائمة العناصر تحت الرسم، وعرض البيانات كجدول في أي وقت.")),
    showStudentName: true, showClassName: true, showExamDate: true, showDuration: true, showTotalMarks: true, showMarksDistribution: true
  },
  presentation: { schemaVersion: 1, preset: "modernAcademic" },
  sections: [
    {
      id: "sec-a", title: "أ — الهطول الشهري (رسم واحد لعدة أسئلة)", gradingPolicy: "all",
      instructions: "ادرس رسم الهطول الشهري ثم أجب عن الأسئلة الأربعة.",
      scenarios: [{ id: "sc-rain", version: 1, title: "الهطول الشهري في مدينة ساحلية — 2020", sources: [{ id: "src-rain", version: 1, kind: "rich", title: "رسم الهطول", richContent: rich(para("يبيّن الرسم كمية الهطول الشهرية بالملّيمتر (mm)؛ الخط المتقطع عتبة 50 mm."), chartBlock(rain)) }], questionIds: ["a1", "a2", "a3", "a4"] }],
      questions: [
        mcq("a1", "أيّ شهر سجّل أعلى هطول في عام 2020؟", ["أكتوبر", "يناير", "فبراير", "نوفمبر"], 0, 3),
        numeric("a2", "كم ملّيمترًا بلغ هطول شهر يناير؟ (أدخل العدد فقط)", 120, 3),
        select("a3", "حدّد على الرسم كل الأشهر التي تجاوز هطولها 100 mm.", C.rainfallBar(), "category", "multiple", 3, "partial", ["jan", "oct"], 3),
        select("a4", "حدّد على الرسم الفترة الجافة المتصلة التي قلّ فيها الهطول عن 20 mm في كل شهر.", C.rainfallBar(), "category", "range", 12, "allOrNothing", ["may", "jun", "jul", "aug", "sep"], 3)
      ]
    },
    {
      id: "sec-b", title: "ب — سلاسل زمنية (خطي ومساحي)", gradingPolicy: "all",
      questions: [
        mcq("b1", "في أي يوم كانت درجة الحرارة الصغرى أدنى؟", ["THU", "MON", "FRI", "TUE"], 0, 3, { richContent: rich(para("يبيّن الرسم درجتي الحرارة العظمى والصغرى (°C) خلال أسبوع؛ قيمة الأربعاء مفقودة."), chartBlock(C.temperatureLine()), para("في أي يوم كانت درجة الحرارة الصغرى أدنى؟")) }),
        select("b2", "حدّد على الرسم أعلى قيمة لدرجة الحرارة العظمى (°C).", C.temperatureLine(), "datum", "single", 1, "allOrNothing", ["tmax/tue"], 4),
        numeric("b3", "ما إجمالي إنتاج الكهرباء من المصدرين في عام 2021 بوحدة GWh؟", 29, 3, { richContent: rich(chartBlock(C.stackedArea()), para("ما إجمالي إنتاج الكهرباء من المصدرين في عام 2021 بوحدة GWh؟")) })
      ]
    },
    {
      id: "sec-c", title: "ج — الانتشار والتوزيع", gradingPolicy: "all",
      questions: [
        select("c1", "حدّد على الرسم الانتشاري النقطة الشاذّة.", C.scatterChart(), "point", "single", 1, "allOrNothing", ["out"], 4),
        select("c2", "اختر الفئة التكرارية الأكثر تكرارًا.", C.histogramChart(), "bin", "single", 1, "allOrNothing", ["b2"], 4)
      ]
    },
    {
      id: "sec-d", title: "د — رسوم مكدّسة ومركّبة", gradingPolicy: "all",
      questions: [
        {
          examQuestionId: "d1", presentationType: "composite", questionTypeVersion: 1, text: "ادرس رسم المبيعات ونسبة الربح ثم أجب عن البندين.", marks: 6,
          composite: {
            v: 1,
            contexts: [{ id: "ctxSales", version: 1, kind: "source", title: "المبيعات والهامش", sources: [{ id: "srcSales", version: 1, kind: "rich", title: "رسم مركّب", richContent: rich(para("المبيعات (أعمدة) ونسبة الربح % (خط) لأربعة أرباع."), chartBlock(C.comboChart())) }] }],
            groups: [{ id: "gSales", title: "تحليل المبيعات", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [
              { id: "p1", label: "أ", type: "chartSelection", questionTypeVersion: 1, contextId: "ctxSales", text: "حدّد على الرسم الربع الذي كانت فيه المبيعات أعلى.", marks: 3,
                chartSelection: { v: 1, chart: C.comboChart(), target: "category", mode: "single", maxSelections: 1 }, answer: { scoring: "allOrNothing", correct: ["q4"] } },
              { id: "p2", label: "ب", type: "numericResponse", questionTypeVersion: 1, contextId: "ctxSales", text: "كم بلغت مبيعات الربع الثاني؟", marks: 3, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 120, tolerance: 0 } }
            ] }]
          },
          answer: {}
        },
        mcq("d2", "في أي منطقة كان عدد المصوّتين بـ«نعم» أكبر؟", ["South", "North"], 0, 2, { richContent: rich(chartBlock(C.horizontalStackedBar()), para("في أي منطقة كان عدد المصوّتين بـ«نعم» (Yes) أكبر؟")) }),
        numeric("d3", "ما وسيط درجات الشعبة ب؟ (أدخل العدد فقط)", 60, 2, { richContent: rich(para("يلخّص الرسم الصندوقي درجات شعبتين (من 100)."), chartBlock(C.boxplotChart()), para("ما وسيط درجات الشعبة ب؟")) })
      ]
    }
  ]
};

const out = path.join(repo, "docs/fixtures/data-charts-21a1/ExamBank_21A1_Interactive_Charts_Mini_Acceptance.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(exam, null, 2) + "\n");
console.log("wrote " + path.relative(repo, out));
