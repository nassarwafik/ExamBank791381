// Phase R-4 — ONE export model for every report of the Reports Center (owner decision D-4, docs/enterprise-reports-export-r4.md).
// A report is described once — its identity (meta) and its sections (a title, columns, rows) — and CSV, Excel and the print /
// PDF document are three encodings of that SAME description, so the formats can never disagree. Pure: no network, no DOM.
//
// Values: a figure is exported as a NUMBER (71.3, never the text «71%») so a spreadsheet can sort and compute it; a value that
// does not exist is an EMPTY cell — never 0. Grading safety (AGENTS.md §10): a result awaiting the teacher and a student who did
// not hand in are exported as their state in words («بانتظار التصحيح», «لم يسلّم»), exactly as the screen shows them; an
// outcome this client does not know is «بانتظار التصحيح» (fail closed), never a number.
// Injection: text reaches a spreadsheet only through csv.ts (formula guard) or xlsx.ts (inline strings, no formula element), and
// the print document escapes every cell — nothing here builds markup.
import type { TrackMeta } from "../projects/types";
import type { PrintReport } from "./printReport";
import type { XlsxCell } from "./xlsx";
import { GRADED_LABEL, PENDING_LABEL, MISSING_LABEL, finiteOrNull, gradedValue, gapToClass, type ClassInsights, type StudentInsights } from "./insights";
import { reasonText } from "./followUp";
import { STAGE_STATUS_ORDER, stageStatusLabel } from "../projects/teacherPresentation";

export type ExportCell = string | number;
export type ExportSection = { title: string; columns: string[]; rows: ExportCell[][] };
export type ReportExport = { kind: string; title: string; subject: string; meta: [string, string][]; sections: ExportSection[] };
export type ExportContext = { schoolYear?: string; from?: string; to?: string };

/** A number, or an empty cell when the value does not exist — never 0 for "nothing". */
const num = (v: unknown): ExportCell => { const n = finiteOrNull(v); return n === null ? "" : n; };
const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** «كل الفترة», or the range as the filters hold it («من 2026-01-01 إلى 2026-01-31»). */
export function periodText(ctx: ExportContext): string {
  if (!ctx.from && !ctx.to) return "كل الفترة";
  return [ctx.from ? "من " + ctx.from : "", ctx.to ? "إلى " + ctx.to : ""].filter(Boolean).join(" ");
}
const identity = (pairs: [string, string | undefined | null][]): [string, string][] => pairs.filter((p): p is [string, string] => !!p[1]);

/* ---------------- class ---------------- */

export type ClassExportData = {
  class: { name: string; schoolYear: string; status: string; studentCount: number };
  kpis: { assignments: number; averageScore: number | null; submissionRate: number; pendingReview?: number } | null;
  insights?: ClassInsights | null;
  projects: { title: string; tracks: TrackMeta[]; avgOverall: number; trackAverages: Record<string, number>; completedCount: number; notStartedCount?: number; studentCount?: number }[];
};
export function classExport(data: ClassExportData, ctx: ExportContext): ReportExport {
  const insights = data.kpis ? data.insights || null : null;
  const sections: ExportSection[] = [{
    title: "المؤشرات", columns: ["المؤشر", "القيمة"], rows: [
      ["الحالة", data.class.status === "archived" ? "مؤرشف" : "نشط"], ["عدد الطلاب", data.class.studentCount],
      ...(data.kpis ? [["عدد التقييمات", data.kpis.assignments], ["متوسط النتائج %", num(data.kpis.averageScore)], ["نسبة التسليم %", data.kpis.submissionRate], [PENDING_LABEL, data.kpis.pendingReview ?? 0]] as ExportCell[][] : [])
    ]
  }];
  if (insights && insights.assessments.length) {
    const spread = insights.assessments.some(a => a.highest !== undefined);
    sections.push({
      title: "التقييمات", columns: ["التقييم", "التاريخ", "الطلاب", "مُسلَّم", PENDING_LABEL, MISSING_LABEL, "نسبة التسليم %", "المتوسط %", ...(spread ? ["الأعلى %", "الوسيط %", "الأدنى %"] : [])],
      rows: insights.assessments.map(a => [a.title, text(a.date), a.students, a.submitted, a.pendingReview ?? 0, a.missing, a.submissionRate, num(a.average), ...(spread ? [num(a.highest), num(a.median), num(a.lowest)] : [])])
    });
  }
  if (insights && insights.students.length) sections.push({
    title: "الطلاب", columns: ["الطالب", "المتوسط %", GRADED_LABEL, PENDING_LABEL, MISSING_LABEL],
    rows: insights.students.map(s => [s.displayName, num(s.average), s.graded, s.pending, s.missing])
  });
  if (insights && insights.followUp && insights.followUp.students.length) sections.push({
    title: "طلاب يحتاجون متابعة", columns: ["الطالب", "الأسباب", "المتوسط %", MISSING_LABEL],
    rows: insights.followUp.students.map(s => [s.displayName, s.reasons.map(reasonText).filter((t): t is string => t !== null).join("؛ "), num(s.average), s.missing]).filter(r => r[1] !== "")
  });
  if (data.projects.length) sections.push({
    title: "المشاريع", columns: ["المشروع", "المؤشر", "القيمة"],
    rows: data.projects.flatMap(p => [
      [p.title, "التقدم العام %", p.avgOverall], ...p.tracks.map(t => [p.title, t.title + " %", p.trackAverages[t.trackId] || 0] as ExportCell[]),
      ...(finiteOrNull(p.studentCount) !== null ? [[p.title, "عدد الطلاب", p.studentCount as number] as ExportCell[]] : []),
      [p.title, "مكتملون", p.completedCount], ...(p.notStartedCount ? [[p.title, "لم يبدأوا", p.notStartedCount] as ExportCell[]] : [])
    ])
  });
  return { kind: "تقرير-الصف", title: "تقرير الصف — " + data.class.name, subject: data.class.name,
    meta: identity([["الصف", data.class.name], ["السنة الدراسية", data.class.schoolYear], ["الفترة", periodText(ctx)]]), sections };
}

/* ---------------- student ---------------- */

export type StudentExportData = {
  student: { displayName: string; className: string; schoolYear: string };
  academic: { average: number | null; submittedCount: number; assessmentCount: number; submissionRate: number; pendingCount?: number } | null;
  insights?: StudentInsights | null;
  projects: { title: string; tracks: TrackMeta[]; summary: { overallProgress: number; trackProgress: Record<string, number>; counts: Record<string, number>; complete: boolean } }[];
};
/** The state of a student's assessment in words: graded, awaiting the teacher (also for an unknown state) or not handed in. */
const stateWord = (p: { state: string; percentage: number | null }) => (p.state === "missing" ? MISSING_LABEL : gradedValue(p) === null ? PENDING_LABEL : GRADED_LABEL);
export function studentExport(data: StudentExportData, ctx: ExportContext): ReportExport {
  const insights = data.academic ? data.insights || null : null;
  const sections: ExportSection[] = [];
  if (data.academic) sections.push({
    title: "المؤشرات", columns: ["المؤشر", "القيمة"], rows: [
      ["متوسط التقييمات %", num(data.academic.average)], ["التقييمات المسلَّمة", data.academic.submittedCount], ["عدد التقييمات", data.academic.assessmentCount],
      ["نسبة التسليم %", data.academic.submissionRate], [PENDING_LABEL, data.academic.pendingCount ?? 0]
    ]
  });
  if (insights && insights.assessments.length) {
    const gaps = gapToClass(insights.assessments);
    sections.push({
      title: "تقييمات الطالب", columns: ["التقييم", "التاريخ", "الحالة", "النتيجة %", "متوسط الصف %", "الفرق عن الصف (نقطة)", "المحاولات"],
      rows: insights.assessments.map((p, i) => [p.title, text(p.date), stateWord(p), num(gradedValue(p)), num(p.classAverage), num(gaps[i]), p.attempts])
    });
  }
  if (data.projects.length) sections.push({
    title: "المشاريع", columns: ["المشروع", "المؤشر", "القيمة"],
    rows: data.projects.flatMap(p => [
      [p.title, "التقدم العام %", p.summary.overallProgress], ...p.tracks.map(t => [p.title, t.title + " %", p.summary.trackProgress[t.trackId] || 0] as ExportCell[]),
      ...STAGE_STATUS_ORDER.map(s => [p.title, "مراحل: " + stageStatusLabel(s), p.summary.counts[s] || 0] as ExportCell[]),
      [p.title, "مكتمل", p.summary.complete ? "نعم" : "لا"]
    ])
  });
  return { kind: "تقرير-الطالب", title: "تقرير الطالب — " + data.student.displayName, subject: data.student.displayName,
    meta: identity([["الطالب", data.student.displayName], ["الصف", data.student.className], ["السنة الدراسية", data.student.schoolYear], ["الفترة", periodText(ctx)]]), sections };
}

/* ---------------- assessments (with the student × assessment matrix) ---------------- */

export type AssignmentRow = { assignmentId?: string; title: string; students: number; submitted: number; missing: number; pendingReview?: number; zeroScores: number; submissionRate: number; average: number | null; avgAttempts: number; date?: string; highest?: number | null; lowest?: number | null; median?: number | null };
export type MatrixCell = { studentId: string; state: string; percentage: number | null; zero?: boolean };
export type AssignmentsExportData = {
  class: { name: string; schoolYear?: string };
  students: { studentId: string; displayName: string }[];
  overall: { assessmentCount: number; participants: number; pendingReview?: number; average: number | null; submissionRate: number; distribution: Record<string, number> };
  perAssignment: AssignmentRow[];
  matrix: { assignmentId: string; title: string; cells: MatrixCell[] }[];
};
/** One matrix cell: the final percentage as a number (a real 0 is 0), or the state in words — never a number for a non-final result. */
export function matrixCellValue(cell: MatrixCell | undefined): ExportCell {
  if (!cell || cell.state === "missing") return MISSING_LABEL;
  if (cell.state !== "submitted") return PENDING_LABEL;
  const v = finiteOrNull(cell.percentage);
  return v === null ? PENDING_LABEL : Math.round(v);
}
export function assignmentsExport(data: AssignmentsExportData, ctx: ExportContext): ReportExport {
  const withDate = data.perAssignment.some(r => !!r.date), spread = data.perAssignment.some(r => r.highest !== undefined);
  const sections: ExportSection[] = [
    { title: "المؤشرات", columns: ["المؤشر", "القيمة"], rows: [
      ["عدد التقييمات", data.overall.assessmentCount], ["التسليمات (طالب × تقييم)", data.overall.participants], ["متوسط النتائج %", num(data.overall.average)],
      ["نسبة التسليم %", data.overall.submissionRate], [PENDING_LABEL, data.overall.pendingReview ?? 0]] },
    { title: "ملخص كل تقييم",
      columns: ["التقييم", ...(withDate ? ["التاريخ"] : []), "الطلاب", "مُسلَّم", MISSING_LABEL, PENDING_LABEL, "سلّم بعلامة صفر", "نسبة التسليم %", "المتوسط %", ...(spread ? ["الأعلى %", "الوسيط %", "الأدنى %"] : []), "متوسط المحاولات"],
      rows: data.perAssignment.map(r => [r.title, ...(withDate ? [text(r.date)] : []), r.students, r.submitted, r.missing, r.pendingReview ?? 0, r.zeroScores, r.submissionRate, num(r.average), ...(spread ? [num(r.highest), num(r.median), num(r.lowest)] : []), r.avgAttempts]) },
    { title: "توزيع النتائج", columns: ["النطاق %", "عدد التسليمات"], rows: Object.keys(data.overall.distribution).map(k => [k, data.overall.distribution[k]]) }
  ];
  if (data.matrix.length && data.students.length) {
    const byAssignment = data.matrix.map(m => new Map(m.cells.map(c => [c.studentId, c])));
    sections.push({
      title: "مصفوفة الطالب × التقييم (%)", columns: ["الطالب", ...data.matrix.map(m => m.title)],
      rows: data.students.map(s => [s.displayName, ...byAssignment.map(cells => matrixCellValue(cells.get(s.studentId)))])
    });
  }
  return { kind: "تقرير-التقييمات", title: "التقييمات والواجبات — " + data.class.name, subject: data.class.name,
    meta: identity([["الصف", data.class.name], ["السنة الدراسية", data.class.schoolYear || ctx.schoolYear], ["الفترة", periodText(ctx)], ["معنى الأرقام", "نتيجة آخر محاولة مسلّمة؛ ليست درجات نهائية معتمدة"]]), sections };
}

/* ---------------- project reports ---------------- */

export type ProjectExportData = {
  tracks: TrackMeta[]; class: { name: string };
  summary: { avgOverall: number; trackAverages: Record<string, number>; completedCount: number; studentsReadyForReview: number; staleCount: number; studentCount: number; notStartedCount?: number };
  analytics?: { perStudent: { name: string; overall: number; trackProgress: Record<string, number> }[] };
};
export function projectExport(data: ProjectExportData, project: string): ReportExport {
  const sections: ExportSection[] = [{ title: "المؤشرات", columns: ["المؤشر", "القيمة"], rows: [
    ["عدد الطلاب", data.summary.studentCount], ["التقدم العام %", data.summary.avgOverall], ...data.tracks.map(t => [t.title + " %", data.summary.trackAverages[t.trackId] || 0] as ExportCell[]),
    ["مكتملون", data.summary.completedCount], ["ينتظرون الفحص", data.summary.studentsReadyForReview], ["بلا تحديث", data.summary.staleCount],
    ...(data.summary.notStartedCount ? [["لم يبدأوا", data.summary.notStartedCount] as ExportCell[]] : [])] }];
  if (data.analytics && data.analytics.perStudent.length) sections.push({
    title: "تقدّم الطلاب", columns: ["الطالب", "التقدم العام %", ...data.tracks.map(t => t.title + " %")],
    rows: data.analytics.perStudent.map(s => [s.name, s.overall, ...data.tracks.map(t => s.trackProgress[t.trackId] || 0)])
  });
  return { kind: "تقرير-المشروع", title: "تقرير المشروع " + project + " — " + data.class.name, subject: project + " " + data.class.name,
    meta: identity([["المشروع", project], ["الصف", data.class.name], ["الوضع", "الوضع الحالي"]]), sections };
}

export type TrackRow = { stageId: string; title: string; approved: number; ready_for_review: number; in_progress: number; not_started: number; approvedPct: number };
export function trackExport(data: { class: { name: string }; rows: TrackRow[] }, project: string, trackTitle: string): ReportExport {
  return { kind: "تقرير-المسار", title: "تقرير المسار " + trackTitle + " — " + data.class.name, subject: project + " " + trackTitle + " " + data.class.name,
    meta: identity([["المشروع", project], ["المسار", trackTitle], ["الصف", data.class.name]]),
    sections: [{ title: "المراحل", columns: ["المرحلة", "العنوان", "معتمد", "جاهز للفحص", "قيد التنفيذ", "لم يبدأ", "نسبة الاعتماد %"], rows: data.rows.map(r => [r.stageId, r.title, r.approved, r.ready_for_review, r.in_progress, r.not_started, r.approvedPct]) }] };
}

export type ReadyStudent = { displayName: string; stages: { stageId: string; title: string; track?: string }[] };
export function readyExport(data: { class: { name: string }; tracks: TrackMeta[]; students: ReadyStudent[] }, project: string): ReportExport {
  const trackTitle = (id: string | undefined) => data.tracks.find(t => t.trackId === id)?.title || text(id);
  return { kind: "جاهز-للفحص", title: "جاهز للفحص — " + data.class.name, subject: project + " " + data.class.name,
    meta: identity([["المشروع", project], ["الصف", data.class.name]]),
    sections: [{ title: "مراحل بانتظار الفحص", columns: ["الطالب", "المرحلة", "العنوان", "المسار"], rows: data.students.flatMap(s => s.stages.map(st => [s.displayName, st.stageId, st.title, trackTitle(st.track)])) }] };
}

export type DelayedRow = { displayName: string; overall: number; trackProgress: Record<string, number>; updatedAt: string; reasons: string[] };
export function delayedExport(data: { class: { name: string }; tracks: TrackMeta[]; lateThreshold: number; students: DelayedRow[] }, project: string): ReportExport {
  return { kind: "المتأخرون", title: "المتأخرون — " + data.class.name, subject: project + " " + data.class.name,
    meta: identity([["المشروع", project], ["الصف", data.class.name], ["عتبة التأخّر", data.lateThreshold + "%"]]),
    sections: [{ title: "الطلاب المتأخرون", columns: ["الطالب", "التقدم العام %", ...data.tracks.map(t => t.title + " %"), "آخر تحديث", "السبب"],
      rows: data.students.map(r => [r.displayName, r.overall, ...data.tracks.map(t => r.trackProgress[t.trackId] || 0), text(r.updatedAt).slice(0, 10), r.reasons.join("؛ ")]) }] };
}

export function timelineExport(data: { class: { name: string }; scope: string; trend: { weekStart: string; avgOverall: number }[] }, project: string, ctx: ExportContext, studentName?: string): ReportExport {
  return { kind: "التقدم-الزمني", title: "التقدم الزمني — " + data.class.name, subject: project + " " + data.class.name + (studentName ? " " + studentName : ""),
    meta: identity([["المشروع", project], ["الصف", data.class.name], ["النطاق", data.scope === "student" ? studentName || "طالب محدد" : "الصف كامل"], ["الفترة", periodText(ctx)]]),
    sections: [{ title: "متوسط التقدّم الأسبوعي", columns: ["الأسبوع", "متوسط التقدّم %", "التغيّر عن الأسبوع السابق (نقطة)"],
      rows: data.trend.map((t, i) => [t.weekStart, t.avgOverall, i === 0 ? "" : Math.round((t.avgOverall - data.trend[i - 1].avgOverall) * 10) / 10]) }] };
}

/* ---------------- the three encodings ---------------- */

/** The flat rows of the CSV and Excel files: the report's title, its identity, then each section (title, header, rows) with an
 *  empty row between. `bold` lists the rows a spreadsheet shows in bold (titles and headers). */
export function exportRows(r: ReportExport, generatedAt: string): { rows: XlsxCell[][]; bold: number[] } {
  const rows: XlsxCell[][] = [[r.title]];
  const bold: number[] = [0];
  for (const [k, v] of r.meta) rows.push([k, v]);
  rows.push(["أُنشئ في", generatedAt]);
  for (const s of r.sections) {
    rows.push([]);
    bold.push(rows.length); rows.push([s.title]);
    bold.push(rows.length); rows.push([...s.columns]);
    for (const row of s.rows) rows.push([...row]);
  }
  return { rows, bold };
}

/** The print / PDF document of the report: its identity as the header, every section as its own table, and the charts on screen
 *  as figures (the caller collects them; none in tests or when the page has no chart). */
export function exportPrint(r: ReportExport, generatedAt: string, figures: { title: string; src: string }[] = []): PrintReport {
  return { title: r.title, meta: r.meta, columns: [], rows: [], generatedAt, sections: r.sections.map(s => ({ title: s.title, columns: s.columns, rows: s.rows })), figures };
}

/** «TadrisPlus-تقرير-الصف-<الصف>-<من>_<إلى>-<اليوم>» — safe for a file system, never two exports of different periods alike. */
export function exportFilename(r: ReportExport, ctx: ExportContext, today: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60).replace(/\s/g, "-");
  const range = ctx.from || ctx.to ? (ctx.from || "البداية") + "_" + (ctx.to || "اليوم") : "";
  return ["TadrisPlus", r.kind, clean(r.subject), range, today].filter(Boolean).join("-");
}
