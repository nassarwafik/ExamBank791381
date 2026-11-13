// Phase R-4 — the ONE export model (reportExport.ts): every report is described once and CSV, Excel and the print document are
// encodings of that description. Pinned: figures are numbers, a value that does not exist is an EMPTY cell (never 0), a result
// awaiting the teacher / not handed in / of an unknown state is its state in WORDS, the academic part withheld exports nothing of
// it, and the file name carries the report, its subject, the period and the day.
import { describe, it, expect } from "vitest";
import * as ex from "./reportExport";
import { reportHtml } from "./printReport";
import { xlsxParts } from "./xlsx";

const TRACKS = [{ trackId: "book", title: "الكتاب", icon: "" }, { trackId: "pt", title: "Packet Tracer", icon: "" }];
const section = (r: ex.ReportExport, title: string) => r.sections.find(s => s.title === title)!;
const INSIGHTS = {
  assessments: [
    { assignmentId: "a1", title: "اختبار", date: "2026-02-05", students: 3, submitted: 2, missing: 1, pendingReview: 1, submissionRate: 67, average: 80, highest: 80, lowest: 80, median: 80 },
    { assignmentId: "a2", title: "واجب", date: "", students: 3, submitted: 1, missing: 2, pendingReview: 1, submissionRate: 33, average: null, highest: null, lowest: null, median: null }
  ],
  students: [{ studentId: "s1", displayName: "زيد", average: 80, graded: 1, pending: 0, missing: 1 }, { studentId: "s2", displayName: "خالد", average: null, graded: 0, pending: 2, missing: 0 }],
  submission: { graded: 1, pending: 2, missing: 3 },
  followUp: { criteria: { missingAtLeast: 2, belowClassBy: 15 }, classAverage: 80, students: [
    { studentId: "s3", displayName: "سعد", average: null, missing: 2, pending: 0, reasons: [{ code: "missing" as const, count: 2 }, { code: "project" as const, projectCode: "P", title: "مشروع", reasons: ["لم يبدأ بعد"] }] },
    { studentId: "s9", displayName: "مجهول", average: 10, missing: 0, pending: 0, reasons: [{ code: "something-new" } as never] }
  ] }
};
const CLASS: ex.ClassExportData = { class: { name: "الحادي عشر", schoolYear: "2025-2026", status: "active", studentCount: 3 }, kpis: { assignments: 2, averageScore: 80, submissionRate: 50, pendingReview: 2 }, insights: INSIGHTS,
  projects: [{ title: "مشروع", tracks: TRACKS, avgOverall: 55, trackAverages: { book: 70 }, completedCount: 1, notStartedCount: 1, studentCount: 3 }] };

describe("R-4 class export", () => {
  it("identity, then indicators, assessments, students, follow-up and projects — figures as numbers, nothing as «%» text", () => {
    const r = ex.classExport(CLASS, { from: "2026-02-01", to: "2026-02-28" });
    expect([r.kind, r.title, r.subject]).toEqual(["تقرير-الصف", "تقرير الصف — الحادي عشر", "الحادي عشر"]);
    expect(r.meta).toEqual([["الصف", "الحادي عشر"], ["السنة الدراسية", "2025-2026"], ["الفترة", "من 2026-02-01 إلى 2026-02-28"]]);
    expect(r.sections.map(s => s.title)).toEqual(["المؤشرات", "التقييمات", "الطلاب", "طلاب يحتاجون متابعة", "المشاريع"]);
    expect(section(r, "المؤشرات").rows).toEqual([["الحالة", "نشط"], ["عدد الطلاب", 3], ["عدد التقييمات", 2], ["متوسط النتائج %", 80], ["نسبة التسليم %", 50], ["بانتظار التصحيح", 2]]);
    expect(section(r, "التقييمات").columns).toEqual(["التقييم", "تاريخ النشر", "الطلاب", "مُسلَّم", "بانتظار التصحيح", "لم يسلّم", "نسبة التسليم %", "المتوسط %", "الأعلى %", "الوسيط %", "الأدنى %"]);
    // the assessment nobody has a final result in: EMPTY cells for its average and spread — never 0
    expect(section(r, "التقييمات").rows).toEqual([["اختبار", "2026-02-05", 3, 2, 1, 1, 67, 80, 80, 80, 80], ["واجب", "", 3, 1, 1, 2, 33, "", "", "", ""]]);
    expect(section(r, "الطلاب").rows).toEqual([["زيد", 80, 1, 0, 1], ["خالد", "", 0, 2, 0]]);
    // follow-up: the server's reasons in words; a student left with no reason this client knows is not exported
    expect(section(r, "طلاب يحتاجون متابعة").rows).toEqual([["سعد", "لم يسلّم تقييمين؛ مشروع: لم يبدأ بعد", "", 2]]);
    expect(section(r, "المشاريع").rows).toEqual([["مشروع", "التقدم العام %", 55], ["مشروع", "الكتاب %", 70], ["مشروع", "Packet Tracer %", 0], ["مشروع", "عدد الطلاب", 3], ["مشروع", "مكتملون", 1], ["مشروع", "لم يبدأوا", 1]]);
    expect(JSON.stringify(r)).not.toMatch(/\d%"/);                  // no «80%» text anywhere
  });
  it("the academic part withheld (kpis: null): nothing of it is exported even if a series were present", () => {
    const r = ex.classExport({ ...CLASS, kpis: null }, {});
    expect(r.sections.map(s => s.title)).toEqual(["المؤشرات", "المشاريع"]);
    expect(section(r, "المؤشرات").rows).toEqual([["الحالة", "نشط"], ["عدد الطلاب", 3]]);
    expect(r.meta.at(-1)).toEqual(["الفترة", "كل الفترة"]);
  });
});

describe("R-4 student export", () => {
  const STUDENT: ex.StudentExportData = { student: { displayName: "زيد صالح", className: "الحادي عشر", schoolYear: "2025-2026" }, academic: { average: 60, submittedCount: 3, assessmentCount: 4, submissionRate: 75, pendingCount: 1 },
    insights: { assessments: [
      { assignmentId: "a1", title: "اختبار", date: "2026-02-05", state: "submitted", percentage: 80, attempts: 1, classAverage: 72 },
      { assignmentId: "a2", title: "واجب", date: "2026-03-05", state: "pending", percentage: 0, attempts: 2, classAverage: 61 },
      { assignmentId: "a3", title: "مشروع قصير", date: "", state: "missing", percentage: null, attempts: 0, classAverage: null },
      { assignmentId: "a4", title: "جديد", date: "", state: "held-new", percentage: 95, attempts: 1, classAverage: 50 },
      { assignmentId: "a5", title: "صفر", date: "", state: "submitted", percentage: 0, attempts: 1, classAverage: 40 }
    ], submission: { graded: 2, pending: 2, missing: 1 } },
    projects: [{ title: "مشروع", tracks: TRACKS, summary: { overallProgress: 45, trackProgress: { book: 60, pt: 30 }, counts: { approved: 3, ready_for_review: 1, in_progress: 2, not_started: 4 }, complete: false } }] };
  it("each assessment: the state in words, a number ONLY for a final result (a real 0 is 0), the gap only where both sides exist", () => {
    const r = ex.studentExport(STUDENT, {});
    expect(section(r, "تقييمات الطالب").rows).toEqual([
      ["اختبار", "2026-02-05", "مصحَّح", 80, 72, 8, 1],
      ["واجب", "2026-03-05", "بانتظار التصحيح", "", 61, "", 2],            // the provisional 0 riding along is not exported
      ["مشروع قصير", "", "لم يسلّم", "", "", "", 0],
      ["جديد", "", "بانتظار التصحيح", "", 50, "", 1],                       // an unknown state, with a 95 beside it: words and an empty cell
      ["صفر", "", "مصحَّح", 0, 40, -40, 1]
    ]);
    expect(section(r, "المؤشرات").rows).toEqual([["متوسط التقييمات %", 60], ["التقييمات المسلَّمة", 3], ["عدد التقييمات", 4], ["نسبة التسليم %", 75], ["بانتظار التصحيح", 1]]);
    expect(section(r, "المشاريع").rows.slice(0, 3)).toEqual([["مشروع", "التقدم العام %", 45], ["مشروع", "الكتاب %", 60], ["مشروع", "Packet Tracer %", 30]]);
    expect(r.meta[0]).toEqual(["الطالب", "زيد صالح"]);
  });
  it("the academic part withheld: only the projects", () => {
    expect(ex.studentExport({ ...STUDENT, academic: null }, {}).sections.map(s => s.title)).toEqual(["المشاريع"]);
  });
});

describe("R-4 matrix and the other reports", () => {
  it("matrixCellValue: final → rounded number; pending, unknown and a final without a number → «بانتظار التصحيح»; missing or absent → «لم يسلّم»", () => {
    expect([
      ex.matrixCellValue({ studentId: "s", state: "submitted", percentage: 90.4 }), ex.matrixCellValue({ studentId: "s", state: "submitted", percentage: 0 }),
      ex.matrixCellValue({ studentId: "s", state: "pending", percentage: 70 }), ex.matrixCellValue({ studentId: "s", state: "weird", percentage: 70 }),
      ex.matrixCellValue({ studentId: "s", state: "submitted", percentage: null }), ex.matrixCellValue({ studentId: "s", state: "missing", percentage: 50 }), ex.matrixCellValue(undefined)
    ]).toEqual([90, 0, "بانتظار التصحيح", "بانتظار التصحيح", "بانتظار التصحيح", "لم يسلّم", "لم يسلّم"]);
  });
  it("project, track, ready, delayed and timeline: one identity and one table each", () => {
    const project = ex.projectExport({ tracks: TRACKS, class: { name: "ص" }, summary: { avgOverall: 55, trackAverages: { book: 70 }, completedCount: 2, studentsReadyForReview: 3, staleCount: 1, studentCount: 24 }, analytics: { perStudent: [{ name: "زيد", overall: 45, trackProgress: { book: 60 } }] } }, "794589");
    expect(section(project, "المؤشرات").rows).toEqual([["عدد الطلاب", 24], ["التقدم العام %", 55], ["الكتاب %", 70], ["Packet Tracer %", 0], ["مكتملون", 2], ["ينتظرون الفحص", 3], ["بلا تحديث", 1]]);
    expect(section(project, "تقدّم الطلاب").rows).toEqual([["زيد", 45, 60, 0]]);
    const track = ex.trackExport({ class: { name: "ص" }, rows: [{ stageId: "B01", title: "مقدمة", approved: 10, ready_for_review: 2, in_progress: 5, not_started: 7, approvedPct: 42 }] }, "794589", "الكتاب");
    expect(track.sections[0].rows).toEqual([["B01", "مقدمة", 10, 2, 5, 7, 42]]);
    expect(track.meta).toEqual([["المشروع", "794589"], ["المسار", "الكتاب"], ["الصف", "ص"]]);
    const delayed = ex.delayedExport({ class: { name: "ص" }, tracks: TRACKS, lateThreshold: 40, students: [{ displayName: "سعد", overall: 12, trackProgress: { book: 20 }, updatedAt: "2026-02-01T10:00:00.000Z", reasons: ["بلا تحديث 7+ أيام", "تقدّم أقل من 40%"] }] }, "794589");
    expect(delayed.sections[0].rows).toEqual([["سعد", 12, 20, 0, "2026-02-01", "بلا تحديث 7+ أيام؛ تقدّم أقل من 40%"]]);
    const timeline = ex.timelineExport({ class: { name: "ص" }, scope: "class", trend: [{ weekStart: "w1", avgOverall: 40 }, { weekStart: "w2", avgOverall: 72 }, { weekStart: "w3", avgOverall: 65.5 }] }, "794589", {});
    expect(timeline.sections[0].rows).toEqual([["w1", 40, ""], ["w2", 72, 32], ["w3", 65.5, -6.5]]);
  });
});

describe("R-4 the three encodings and the file name", () => {
  const r = ex.classExport(CLASS, {});
  it("exportRows: title, identity, the day, then each section after an empty row; bold = the title, the section titles and the headers", () => {
    const { rows, bold } = ex.exportRows(r, "2026-11-11 10:00");
    expect(rows.slice(0, 7)).toEqual([["تقرير الصف — الحادي عشر"], ["الصف", "الحادي عشر"], ["السنة الدراسية", "2025-2026"], ["الفترة", "كل الفترة"], ["أُنشئ في", "2026-11-11 10:00"], [], ["المؤشرات"]]);
    expect(bold.map(i => rows[i][0])).toEqual(["تقرير الصف — الحادي عشر", "المؤشرات", "المؤشر", "التقييمات", "التقييم", "الطلاب", "الطالب", "طلاب يحتاجون متابعة", "الطالب", "المشاريع", "المشروع"]);
    expect(rows.filter(x => x.length === 0)).toHaveLength(r.sections.length);
  });
  it("Excel: a number is a number cell, text an inline string — no formula element, even for a title that looks like one", () => {
    const danger = ex.assignmentsExport({ class: { name: "ص" }, students: [], overall: { assessmentCount: 1, participants: 0, average: null, submissionRate: 0, distribution: {} }, perAssignment: [{ title: "=SUM(A1)", students: 2, submitted: 0, missing: 2, zeroScores: 0, submissionRate: 0, average: 71.3, avgAttempts: 0 }], matrix: [] }, {});
    const sheet = xlsxParts(ex.exportRows(danger, "x").rows)["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain("<v>71.3</v>");
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain("=SUM(A1)");
    expect(sheet).not.toMatch(/<f[ >]/);
  });
  it("print: the identity, every section as its own titled table, every cell escaped; without a main table", () => {
    const html = reportHtml(ex.exportPrint({ ...r, title: "تقرير <الصف>", sections: [{ title: "قسم <1>", columns: ["أ"], rows: [["<img src=x onerror=alert(1)>"], [42]] }] }, "2026-11-11 10:00"));
    expect(html).toContain("<h1>تقرير &lt;الصف&gt;</h1>");
    expect(html).toContain("<h2>قسم &lt;1&gt;</h2>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img");
    expect(html).toContain('<td class="num">42</td>');
    expect(html.match(/<table>/g)).toHaveLength(1);
    expect(html).toContain("<footer>أُنشئ في 2026-11-11 10:00</footer>");
  });
  it("print figures: only a PNG data URL becomes a picture — a remote or scripted source is dropped", () => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const html = reportHtml(ex.exportPrint(r, "x", [{ title: "رسم <أول>", src: png }, { title: "خارجي", src: "https://evil.example/x.png" }, { title: "سكربت", src: "javascript:alert(1)" }, { title: "svg", src: "data:image/svg+xml;base64,PHN2Zz4=" }]));
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain('<figcaption>رسم &lt;أول&gt;</figcaption><img alt="رسم &lt;أول&gt;" src="' + png + '">');
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("svg+xml");
  });
  it("the file name: the report, its subject, the period and the day — safe characters only", () => {
    expect(ex.exportFilename(r, {}, "2026-11-11")).toBe("TadrisPlus-تقرير-الصف-الحادي-عشر-2026-11-11");
    expect(ex.exportFilename(r, { from: "2026-01-01", to: "2026-01-31" }, "2026-11-11")).toBe("TadrisPlus-تقرير-الصف-الحادي-عشر-2026-01-01_2026-01-31-2026-11-11");
    expect(ex.exportFilename(r, { from: "2026-01-01" }, "2026-11-11")).toBe("TadrisPlus-تقرير-الصف-الحادي-عشر-2026-01-01_اليوم-2026-11-11");
    expect(ex.exportFilename({ ...r, subject: "a/b\\c:d*e?\"f<g>h|i\u0000j" }, {}, "2026-11-11")).toBe("TadrisPlus-تقرير-الصف-a-b-c-d-e-f-g-h-i-j-2026-11-11");
    expect(ex.periodText({ to: "2026-01-31" })).toBe("إلى 2026-01-31");
  });
});
