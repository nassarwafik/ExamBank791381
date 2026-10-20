// Phase R-4 — FORMAT PINS for the Reports Center's export model (owner decision D-4). These replace the UX-6b «CSV hard parity»
// pins, which froze the legacy bytes D-4 retired (KPI values as «71%» text, «—» for a missing value, emoji labels, no identity).
// Every builder is pinned against a hand-written expectation: identity block, section headings, column order, REAL numbers, an
// empty cell for a missing number, words for pending / missing matrix cells. The encoding rules are unchanged and re-pinned on the
// new rows: all cells quoted, CRLF, the formula-injection guard, Western digits, the «TadrisPlus-…» file names.
import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";
import * as ex from "./reportExport";

const TRACKS = [{ trackId: "book", title: "الكتاب" }, { trackId: "packetTracer", title: "Packet Tracer" }];
const CTX: ex.ExportContext = { periodLabel: "كل الفترة", periodTag: "كل الفترة", projectTitle: "مشروع الشبكات" };
const AT = "2026-10-20 09:05";
const rowsOf = (ds: ex.ReportExport) => ex.exportRows(ds, AT).rows;
const head = (title: string, meta: [string, string][]) => [[title], ...meta, ["تاريخ الإنشاء", AT]];

describe("R-4 — every report's export rows", () => {
  it("class report: identity, academic indicators as numbers (missing average = empty), one section per project", () => {
    const ds = ex.classExport({ class: { name: "الحادي عشر", schoolYear: "2025-2026", status: "active", studentCount: 24 }, kpis: { assignments: 3, averageScore: null, submissionRate: 83, pendingReview: 2 },
      projects: [{ title: "مشروع الشبكات", tracks: TRACKS, avgOverall: 55, trackAverages: { book: 70 }, completedCount: 2, notStartedCount: 0 }] }, CTX);
    expect(rowsOf(ds)).toEqual([
      ...head("تقرير الصف — الحادي عشر", [["الصف", "الحادي عشر"], ["السنة الدراسية", "2025-2026"], ["حالة الصف", "نشط"], ["الفترة", "كل الفترة"]]),
      [], ["المؤشرات الأكاديمية"], ["المؤشر", "القيمة"], ["عدد الطلاب", 24], ["عدد التقييمات", 3], ["متوسط النتائج (%)", ""], ["نسبة التسليم (%)", 83], ["بانتظار التصحيح", 2],
      [], ["مشروع الشبكات"], ["المؤشر", "القيمة"], ["التقدم العام (%)", 55], ["الكتاب (%)", 70], ["Packet Tracer (%)", 0], ["مكتملون", 2]
    ]);
  });
  it("student report: academic indicators and per-project progress, counts and last activity", () => {
    const ds = ex.studentExport({ student: { displayName: "زيد صالح", className: "", schoolYear: "2025-2026" }, academic: { average: 64.5, submittedCount: 2, assessmentCount: 3, submissionRate: 67 },
      projects: [{ title: "مشروع الشبكات", tracks: [TRACKS[0]], summary: { overallProgress: 40, trackProgress: { book: 40 }, counts: { approved: 3, ready_for_review: 1 } }, lastActivity: "2026-03-01T10:00:00.000Z" }] }, CTX);
    expect(rowsOf(ds)).toEqual([
      ...head("تقرير الطالب — زيد صالح", [["الطالب", "زيد صالح"], ["الصف", ""], ["السنة الدراسية", "2025-2026"], ["الفترة", "كل الفترة"]]),
      [], ["التقييمات"], ["المؤشر", "القيمة"], ["متوسط التقييمات (%)", 64.5], ["التقييمات المسلَّمة", 2], ["عدد التقييمات", 3], ["نسبة التسليم (%)", 67],
      [], ["مشروع الشبكات"], ["المؤشر", "القيمة"], ["التقدم العام (%)", 40], ["الكتاب (%)", 40], ["مراحل معتمدة", 3], ["مراحل جاهزة للفحص", 1], ["آخر نشاط", "2026-03-01"]
    ]);
  });
  it("assignments report: indicators, per-assessment table, distribution, and the student × assessment matrix in words where there is no mark", () => {
    const ds = ex.assignmentsExport({ class: { name: "الحادي عشر" }, students: [{ studentId: "s1", displayName: "زيد" }, { studentId: "s2", displayName: "خالد" }, { studentId: "s3", displayName: "سعد" }],
      overall: { assessmentCount: 2, participants: 3, pendingReview: 1, average: 50, submissionRate: 50, distribution: { "0-49": 1, "50-59": 0 } },
      perAssignment: [{ title: "=SUM(A1)", students: 3, submitted: 2, missing: 1, pendingReview: 1, zeroScores: 1, submissionRate: 67, average: 0, avgAttempts: 1.5 }, { title: "اختبار \"الكسور\"", students: 3, submitted: 1, missing: 2, zeroScores: 0, submissionRate: 33, average: null, avgAttempts: 1 }],
      matrix: [
        { assignmentId: "a1", title: "=SUM(A1)", cells: [{ studentId: "s1", state: "submitted", percentage: 0 }, { studentId: "s2", state: "pending", percentage: null }, { studentId: "s3", state: "missing", percentage: null }] },
        { assignmentId: "a2", title: "اختبار \"الكسور\"", cells: [{ studentId: "s1", state: "submitted", percentage: 100 }, { studentId: "s2", state: "weird", percentage: 40 }] }
      ] }, CTX);
    expect(rowsOf(ds)).toEqual([
      ...head("التقييمات والواجبات — الحادي عشر", [["الصف", "الحادي عشر"], ["الفترة", "كل الفترة"], ["معنى النتائج", "نتيجة آخر محاولة مسلّمة؛ ما زال «بانتظار التصحيح» لا يدخل في المتوسط"]]),
      [], ["المؤشرات"], ["المؤشر", "القيمة"], ["التقييمات", 2], ["التسليمات (طالب × تقييم)", 3], ["بانتظار التصحيح", 1], ["متوسط النتائج (%)", 50], ["نسبة التسليم (%)", 50],
      [], ["ملخص كل تقييم"], ["التقييم", "الطلاب", "مُسلَّم", "لم يسلّم", "بانتظار التصحيح", "سلّم بعلامة صفر", "نسبة التسليم (%)", "المتوسط (%)", "متوسط المحاولات"],
      ["=SUM(A1)", 3, 2, 1, 1, 1, 67, 0, 1.5], ["اختبار \"الكسور\"", 3, 1, 2, 0, 0, 33, "", 1],
      [], ["توزيع النتائج"], ["النطاق (%)", "عدد التسليمات"], ["0-49", 1], ["50-59", 0],
      [], ["مصفوفة الطالب × التقييم"], ["الطالب", "=SUM(A1)", "اختبار \"الكسور\""],
      ["زيد", 0, 100], ["خالد", "بانتظار التصحيح", "بانتظار التصحيح"], ["سعد", "لم يسلّم", "لم يسلّم"]     // an unknown state is never a number (fail closed)
    ]);
  });
  it("project report: the project's title, numbers, no emoji labels; «لم يبدأوا» only when reported", () => {
    const summary = { studentCount: 24, avgOverall: 55.5, trackAverages: { book: 70, packetTracer: 41 }, completedCount: 2, studentsReadyForReview: 3, staleCount: 1 };
    const ds = ex.projectExport({ class: { name: "الحادي عشر" }, tracks: TRACKS, summary }, "794589", CTX);
    expect(rowsOf(ds)).toEqual([
      ...head("تقرير المشروع — الحادي عشر", [["الصف", "الحادي عشر"], ["المشروع", "مشروع الشبكات"], ["البيانات", "الوضع الحالي"]]),
      [], ["المؤشرات"], ["المؤشر", "القيمة"], ["عدد الطلاب", 24], ["التقدم العام (%)", 55.5], ["الكتاب (%)", 70], ["Packet Tracer (%)", 41], ["مكتملون", 2], ["ينتظرون الفحص", 3], ["بلا تحديث (متأخرون)", 1]
    ]);
    expect(rowsOf(ex.projectExport({ class: { name: "ص" }, tracks: [], summary: { ...summary, notStartedCount: 5 } }, "794589", { ...CTX, projectTitle: undefined }))).toEqual(expect.arrayContaining([["المشروع", "794589"], ["لم يبدأوا", 5]]));
  });
  it("track, ready, delayed and timeline reports", () => {
    expect(rowsOf(ex.trackExport({ class: { name: "الحادي عشر" }, rows: [{ stageId: "B01", title: "مقدمة", approved: 10, ready_for_review: 2, in_progress: 5, not_started: 7, approvedPct: 42 }] }, "794589", "الكتاب", "", CTX)).slice(-3))
      .toEqual([["حالة المراحل"], ["المرحلة", "العنوان", "معتمد", "جاهز للفحص", "قيد التنفيذ", "لم يبدأ", "نسبة الاعتماد (%)"], ["B01", "مقدمة", 10, 2, 5, 7, 42]]);
    const ready = rowsOf(ex.readyExport({ class: { name: "الحادي عشر" }, tracks: TRACKS, totalReady: 2, students: [{ displayName: "-خالد", stages: [{ stageId: "B02", title: "OSI", track: "book" }, { stageId: "P01", title: "طوبولوجيا", track: "packetTracer" }] }] }, "794589", CTX));
    expect(ready).toEqual(expect.arrayContaining([["مراحل بانتظار الفحص", "2"], ["الطالب", "المرحلة", "العنوان", "المسار"], ["-خالد", "B02", "OSI", "الكتاب"], ["-خالد", "P01", "طوبولوجيا", "Packet Tracer"]]));
    const delayed = rowsOf(ex.delayedExport({ class: { name: "الحادي عشر" }, tracks: [TRACKS[0]], lateThreshold: 40, students: [{ displayName: "سعد", overall: 12, trackProgress: {}, updatedAt: "2026-02-01T10:00:00.000Z", reasons: ["بلا تحديث 7+ أيام", "تقدّم أقل من 40%"] }] }, "794589", CTX));
    expect(delayed.slice(-2)).toEqual([["الطالب", "التقدم العام (%)", "الكتاب (%)", "آخر تحديث", "السبب"], ["سعد", 12, 0, "2026-02-01", "بلا تحديث 7+ أيام؛ تقدّم أقل من 40%"]]);
    const timeline = rowsOf(ex.timelineExport({ class: { name: "الحادي عشر" }, scope: "class", trend: [{ weekStart: "2026-02-22", avgOverall: 40 }] }, "794589", CTX));
    expect(timeline).toEqual(expect.arrayContaining([["النطاق", "الصف كامل"], ["بداية الأسبوع", "متوسط التقدّم (%)"], ["2026-02-22", 40]]));
  });
});

describe("R-4 — encoding, bold rows, file names, period words", () => {
  const ds = ex.assignmentsExport({ class: { name: "الحادي/عشر" }, students: [{ studentId: "s1", displayName: "-خالد" }], overall: { assessmentCount: 1, participants: 1, average: 71.3, submissionRate: 100, distribution: {} },
    perAssignment: [{ title: "=SUM(A1)", students: 1, submitted: 1, missing: 0, zeroScores: 0, submissionRate: 100, average: 71.3, avgAttempts: 1.2 }], matrix: [] }, { periodLabel: "من 2026-01-01 إلى 2026-01-31", periodTag: "2026-01-01_2026-01-31" });
  it("all cells quoted, CRLF, the formula guard on every exported cell, Western digits only", () => {
    const text = toCsv(rowsOf(ds));
    expect(text.split("\r\n")).toContain('"\'=SUM(A1)","1","1","0","0","0","100","71.3","1.2"');
    expect(/[٠-٩]/.test(text)).toBe(false);
  });
  it("bold rows are the title, each section heading and each header row", () => {
    const { rows, boldRows } = ex.exportRows(ds, AT);
    expect(boldRows.map(i => rows[i][0])).toEqual(["التقييمات والواجبات — الحادي/عشر", "المؤشرات", "المؤشر", "ملخص كل تقييم", "التقييم", "توزيع النتائج", "النطاق (%)"]);
  });
  it("file name: TadrisPlus-<report>-<context>-<period>-<date>, unsafe characters removed", () => {
    expect(ex.exportFileBase(ds, new Date(2026, 9, 20, 9, 5))).toBe("TadrisPlus-التقييمات-والواجبات-الحادي-عشر-2026-01-01_2026-01-31-2026-10-20");
  });
  it("period words: preset with its dates, custom forms, all", () => {
    const L = { all: "كل الفترة", "7": "آخر 7 أيام", "30": "آخر 30 يومًا", custom: "مخصص" };
    expect(ex.periodContext("all", "", "", L)).toEqual({ periodLabel: "كل الفترة", periodTag: "كل الفترة" });
    expect(ex.periodContext("7", "2026-10-14", "2026-10-20", L)).toEqual({ periodLabel: "آخر 7 أيام (2026-10-14 – 2026-10-20)", periodTag: "2026-10-14_2026-10-20" });
    expect(ex.periodContext("custom", "2026-01-01", "", L)).toEqual({ periodLabel: "من 2026-01-01", periodTag: "2026-01-01_…" });
    expect(ex.periodContext("custom", "", "2026-01-31", L).periodLabel).toBe("حتى 2026-01-31");
    expect(ex.periodContext("custom", "", "", L).periodLabel).toBe("كل الفترة");
  });
});
