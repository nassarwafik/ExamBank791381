// Phase R-4 — the Reports Center's ONE export model (owner decision D-4). Every report builds a ReportExport: a title, an
// identity block (class, project, period…) and table sections of REAL numbers — a percentage is the number 67, never the text
// «67%», and a value the report does not have is an empty cell, never 0 or «—». The same model becomes the CSV (csv.ts: BOM,
// CRLF, quoted cells, formula-injection guard), the Excel workbook (xlsx.ts: right-to-left, bold headings, numbers as numbers)
// and the print / PDF document (printReport.ts: a clean A4 page, never the app shell). Pure builders: nothing here reads the
// network, and only what the report already shows is exported.
import type { TrackMeta } from "../projects/types";
import { downloadCsv } from "./csv";
import { downloadXlsx } from "./xlsx";
import { printReport, type PrintSection } from "./printReport";
import { csvDateTime, exportFilename } from "../teacher/teacherExports";
import { isoDay } from "./format";

export type Cell = string | number;
export type ExportSection = { heading?: string; columns: string[]; rows: Cell[][] };
/** title — the report's name; context — what it is about (class, student) for the title and the file name. */
export type ReportExport = { title: string; context: string; meta: [string, string][]; sections: ExportSection[]; periodTag?: string };
/** The report's surroundings ReportsCenter knows: the period as words (+ its from/to for the file name) and the project title. */
export type ExportContext = { periodLabel: string; periodTag: string; projectTitle?: string };

export const PENDING_TEXT = "بانتظار التصحيح";
export const MISSING_TEXT = "لم يسلّم";
/** A finite number stays a number; anything else is an empty cell (never 0). */
export const num = (v: unknown): Cell => (typeof v === "number" && Number.isFinite(v) ? v : "");
const kv = (label: string, value: Cell): Cell[] => [label, value];
const INDICATORS = ["المؤشر", "القيمة"];

/* ---------- the three formats ---------- */

/** Flat rows (identity block, then each section: heading, header, rows, a blank line) + the rows to set in bold. */
export function exportRows(ds: ReportExport, generatedAt: string): { rows: Cell[][]; boldRows: number[] } {
  const rows: Cell[][] = [[fullTitle(ds)], ...ds.meta.map(([k, v]) => [k, v]), ["تاريخ الإنشاء", generatedAt]];
  const boldRows = [0];
  for (const s of ds.sections) {
    rows.push([]);
    if (s.heading) { boldRows.push(rows.length); rows.push([s.heading]); }
    boldRows.push(rows.length); rows.push(s.columns);
    rows.push(...s.rows);
  }
  return { rows, boldRows };
}
export const fullTitle = (ds: ReportExport) => ds.title + (ds.context ? " — " + ds.context : "");
/** «TadrisPlus-<report>-<context>-<period>-<YYYY-MM-DD>» (no extension), sanitized like the gradebook's export names. */
export function exportFileBase(ds: ReportExport, now: Date): string {
  const day = csvDateTime(now.toISOString()).slice(0, 10);
  return exportFilename("TadrisPlus-" + ds.title.replace(/\s+/g, "-"), [ds.context, ds.periodTag, day].filter(Boolean).join(" ")).replace(/\.csv$/, "");
}
export function exportCsv(ds: ReportExport, now = new Date()): void {
  downloadCsv(exportFileBase(ds, now) + ".csv", exportRows(ds, csvDateTime(now.toISOString())).rows);
}
export function exportXlsx(ds: ReportExport, now = new Date()): void {
  const { rows, boldRows } = exportRows(ds, csvDateTime(now.toISOString()));
  downloadXlsx(exportFileBase(ds, now), rows, { sheetName: ds.title, rtl: true, boldRows });
}
/** false when the browser offers no print document (the caller says so). */
export function printExport(ds: ReportExport, now = new Date()): boolean {
  const sections: PrintSection[] = ds.sections.map(s => ({ heading: s.heading, columns: s.columns, rows: s.rows }));
  return printReport({ title: fullTitle(ds), meta: ds.meta, sections, generatedAt: csvDateTime(now.toISOString()) });
}

/* ---------- the period, as words and as a file-name tag ---------- */

export function periodContext(period: string, from: string, to: string, labels: Record<string, string>): { periodLabel: string; periodTag: string } {
  const tag = from || to ? (from || "…") + "_" + (to || "…") : "كل الفترة";
  if (period === "custom") {
    if (from && to) return { periodLabel: "من " + from + " إلى " + to, periodTag: tag };
    if (from) return { periodLabel: "من " + from, periodTag: tag };
    if (to) return { periodLabel: "حتى " + to, periodTag: tag };
    return { periodLabel: labels.all || "كل الفترة", periodTag: tag };
  }
  const label = labels[period] || labels.all || "كل الفترة";
  return { periodLabel: from && to ? label + " (" + from + " – " + to + ")" : label, periodTag: tag };
}

/* ---------- one builder per report ---------- */

type ProjectBlock = { title: string; tracks: TrackMeta[]; overall: number; trackValues: Record<string, number>; extra: [string, Cell][] };
function projectSection(p: ProjectBlock): ExportSection {
  return { heading: p.title, columns: INDICATORS, rows: [
    kv("التقدم العام (%)", num(p.overall)),
    ...p.tracks.map(t => kv(t.title + " (%)", num(p.trackValues[t.trackId] || 0))),
    ...p.extra.map(([k, v]) => kv(k, v))
  ] };
}

export type ClassExportData = { class: { name: string; schoolYear: string; status: string; studentCount: number }; kpis: { assignments: number; averageScore: number | null; submissionRate: number; pendingReview?: number };
  projects: { title: string; tracks: TrackMeta[]; avgOverall: number; trackAverages: Record<string, number>; completedCount: number; notStartedCount?: number }[] };
export function classExport(d: ClassExportData, ctx: ExportContext): ReportExport {
  return { title: "تقرير الصف", context: d.class.name, periodTag: ctx.periodTag,
    meta: [["الصف", d.class.name], ["السنة الدراسية", d.class.schoolYear || ""], ["حالة الصف", d.class.status === "archived" ? "مؤرشف" : "نشط"], ["الفترة", ctx.periodLabel]],
    sections: [
      { heading: "المؤشرات الأكاديمية", columns: INDICATORS, rows: [
        kv("عدد الطلاب", num(d.class.studentCount)), kv("عدد التقييمات", num(d.kpis.assignments)), kv("متوسط النتائج (%)", num(d.kpis.averageScore)),
        kv("نسبة التسليم (%)", num(d.kpis.submissionRate)), ...(d.kpis.pendingReview !== undefined ? [kv(PENDING_TEXT, num(d.kpis.pendingReview))] : [])
      ] },
      ...d.projects.map(p => projectSection({ title: p.title, tracks: p.tracks, overall: p.avgOverall, trackValues: p.trackAverages,
        // Phase P-5d's rule, as on screen: «لم يبدأوا» only when the server reports students who have not started.
        extra: [["مكتملون", num(p.completedCount)], ...(p.notStartedCount ? [["لم يبدأوا", num(p.notStartedCount)] as [string, Cell]] : [])] }))
    ] };
}

export type StudentExportData = { student: { displayName: string; className: string; schoolYear: string }; academic: { average: number | null; submittedCount: number; assessmentCount: number; submissionRate: number; pendingCount?: number };
  projects: { title: string; tracks: TrackMeta[]; summary: { overallProgress: number; trackProgress: Record<string, number>; counts: Record<string, number> }; lastActivity: string }[] };
export function studentExport(d: StudentExportData, ctx: ExportContext): ReportExport {
  return { title: "تقرير الطالب", context: d.student.displayName, periodTag: ctx.periodTag,
    meta: [["الطالب", d.student.displayName], ["الصف", d.student.className || ""], ["السنة الدراسية", d.student.schoolYear || ""], ["الفترة", ctx.periodLabel]],
    sections: [
      { heading: "التقييمات", columns: INDICATORS, rows: [
        kv("متوسط التقييمات (%)", num(d.academic.average)), kv("التقييمات المسلَّمة", num(d.academic.submittedCount)), kv("عدد التقييمات", num(d.academic.assessmentCount)),
        kv("نسبة التسليم (%)", num(d.academic.submissionRate)), ...(d.academic.pendingCount !== undefined ? [kv(PENDING_TEXT, num(d.academic.pendingCount))] : [])
      ] },
      ...d.projects.map(p => projectSection({ title: p.title, tracks: p.tracks, overall: p.summary.overallProgress, trackValues: p.summary.trackProgress,
        extra: [["مراحل معتمدة", num(p.summary.counts.approved)], ["مراحل جاهزة للفحص", num(p.summary.counts.ready_for_review)], ["آخر نشاط", p.lastActivity ? isoDay(p.lastActivity) : ""]] }))
    ] };
}

export type AssignmentRow = { title: string; students: number; submitted: number; missing: number; pendingReview?: number; zeroScores: number; submissionRate: number; average: number | null; avgAttempts: number };
export type AssignmentsExportData = { class: { name: string }; students: { studentId: string; displayName: string }[];
  overall: { assessmentCount: number; participants: number; pendingReview?: number; average: number | null; submissionRate: number; distribution: Record<string, number> };
  perAssignment: AssignmentRow[]; matrix: { assignmentId: string; title: string; cells: { studentId: string; state: string; percentage: number | null }[] }[] };
export function assignmentsExport(d: AssignmentsExportData, ctx: ExportContext): ReportExport {
  const byAssignment = new Map(d.matrix.map(m => [m.assignmentId, new Map(m.cells.map(c => [c.studentId, c]))]));
  // The matrix cell as the screen states it: a final result is its number; pending / missing (or anything unknown) is words.
  const matrixCell = (assignmentId: string, studentId: string): Cell => {
    const c = byAssignment.get(assignmentId)?.get(studentId);
    if (!c || c.state === "missing") return MISSING_TEXT;
    return c.state === "submitted" && typeof c.percentage === "number" ? c.percentage : PENDING_TEXT;
  };
  return { title: "التقييمات والواجبات", context: d.class.name, periodTag: ctx.periodTag,
    meta: [["الصف", d.class.name], ["الفترة", ctx.periodLabel], ["معنى النتائج", "نتيجة آخر محاولة مسلّمة؛ ما زال «" + PENDING_TEXT + "» لا يدخل في المتوسط"]],
    sections: [
      { heading: "المؤشرات", columns: INDICATORS, rows: [
        kv("التقييمات", num(d.overall.assessmentCount)), kv("التسليمات (طالب × تقييم)", num(d.overall.participants)),
        ...(d.overall.pendingReview !== undefined ? [kv(PENDING_TEXT, num(d.overall.pendingReview))] : []),
        kv("متوسط النتائج (%)", num(d.overall.average)), kv("نسبة التسليم (%)", num(d.overall.submissionRate))
      ] },
      { heading: "ملخص كل تقييم", columns: ["التقييم", "الطلاب", "مُسلَّم", MISSING_TEXT, PENDING_TEXT, "سلّم بعلامة صفر", "نسبة التسليم (%)", "المتوسط (%)", "متوسط المحاولات"],
        rows: d.perAssignment.map(r => [r.title, num(r.students), num(r.submitted), num(r.missing), num(r.pendingReview ?? 0), num(r.zeroScores), num(r.submissionRate), num(r.average), num(r.avgAttempts)]) },
      { heading: "توزيع النتائج", columns: ["النطاق (%)", "عدد التسليمات"], rows: Object.keys(d.overall.distribution).map(k => [k, num(d.overall.distribution[k])]) },
      ...(d.matrix.length ? [{ heading: "مصفوفة الطالب × التقييم", columns: ["الطالب", ...d.matrix.map(m => m.title)],
        rows: d.students.map(s => [s.displayName, ...d.matrix.map(m => matrixCell(m.assignmentId, s.studentId))]) }] : [])
    ] };
}

const projectName = (ctx: ExportContext, code: string) => ctx.projectTitle || code;

export type ProjectExportData = { class: { name: string }; tracks: TrackMeta[]; summary: { avgOverall: number; trackAverages: Record<string, number>; completedCount: number; studentsReadyForReview: number; staleCount: number; studentCount: number; notStartedCount?: number } };
export function projectExport(d: ProjectExportData, projectCode: string, ctx: ExportContext): ReportExport {
  const s = d.summary;
  return { title: "تقرير المشروع", context: d.class.name,
    meta: [["الصف", d.class.name], ["المشروع", projectName(ctx, projectCode)], ["البيانات", "الوضع الحالي"]],
    sections: [{ heading: "المؤشرات", columns: INDICATORS, rows: [
      kv("عدد الطلاب", num(s.studentCount)), kv("التقدم العام (%)", num(s.avgOverall)), ...d.tracks.map(t => kv(t.title + " (%)", num(s.trackAverages[t.trackId] || 0))),
      kv("مكتملون", num(s.completedCount)), kv("ينتظرون الفحص", num(s.studentsReadyForReview)), kv("بلا تحديث (متأخرون)", num(s.staleCount)),
      ...(s.notStartedCount ? [kv("لم يبدأوا", num(s.notStartedCount))] : [])
    ] }] };
}

export type TrackRow = { stageId: string; title: string; approved: number; ready_for_review: number; in_progress: number; not_started: number; approvedPct: number };
export function trackExport(d: { class: { name: string }; rows: TrackRow[] }, projectCode: string, trackTitle: string, groupTitle: string, ctx: ExportContext): ReportExport {
  return { title: "تقرير المسار", context: d.class.name + " " + trackTitle,
    meta: [["الصف", d.class.name], ["المشروع", projectName(ctx, projectCode)], ["المسار", trackTitle], ["المجموعة", groupTitle || "الكل"]],
    sections: [{ heading: "حالة المراحل", columns: ["المرحلة", "العنوان", "معتمد", "جاهز للفحص", "قيد التنفيذ", "لم يبدأ", "نسبة الاعتماد (%)"],
      rows: d.rows.map(r => [r.stageId, r.title, num(r.approved), num(r.ready_for_review), num(r.in_progress), num(r.not_started), num(r.approvedPct)]) }] };
}

export type ReadyStudent = { displayName: string; stages: { stageId: string; title: string; track: string }[] };
export function readyExport(d: { class: { name: string }; tracks: TrackMeta[]; students: ReadyStudent[]; totalReady: number }, projectCode: string, ctx: ExportContext): ReportExport {
  const trackTitle = (id: string) => d.tracks.find(t => t.trackId === id)?.title || id;
  return { title: "جاهز للفحص", context: d.class.name,
    meta: [["الصف", d.class.name], ["المشروع", projectName(ctx, projectCode)], ["مراحل بانتظار الفحص", String(d.totalReady)]],
    sections: [{ heading: "المراحل الجاهزة للفحص", columns: ["الطالب", "المرحلة", "العنوان", "المسار"],
      rows: d.students.flatMap(s => s.stages.map(st => [s.displayName, st.stageId, st.title, trackTitle(st.track)])) }] };
}

export type DelayedRow = { displayName: string; overall: number; trackProgress: Record<string, number>; updatedAt: string; reasons: string[] };
export function delayedExport(d: { class: { name: string }; tracks: TrackMeta[]; lateThreshold: number; students: DelayedRow[] }, projectCode: string, ctx: ExportContext): ReportExport {
  return { title: "المتأخرون", context: d.class.name,
    meta: [["الصف", d.class.name], ["المشروع", projectName(ctx, projectCode)], ["عتبة التأخّر (%)", String(d.lateThreshold)]],
    sections: [{ heading: "الطلاب المتأخرون", columns: ["الطالب", "التقدم العام (%)", ...d.tracks.map(t => t.title + " (%)"), "آخر تحديث", "السبب"],
      rows: d.students.map(r => [r.displayName, num(r.overall), ...d.tracks.map(t => num(r.trackProgress[t.trackId] || 0)), r.updatedAt ? isoDay(r.updatedAt) : "", r.reasons.join("؛ ")]) }] };
}

export function timelineExport(d: { class: { name: string }; scope: string; trend: { weekStart: string; avgOverall: number }[] }, projectCode: string, ctx: ExportContext): ReportExport {
  return { title: "التقدم الزمني", context: d.class.name, periodTag: ctx.periodTag,
    meta: [["الصف", d.class.name], ["المشروع", projectName(ctx, projectCode)], ["النطاق", d.scope === "student" ? "طالب محدد" : "الصف كامل"], ["الفترة", ctx.periodLabel]],
    sections: [{ heading: "متوسط التقدّم الأسبوعي", columns: ["بداية الأسبوع", "متوسط التقدّم (%)"], rows: d.trend.map(t => [t.weekStart, num(t.avgOverall)]) }] };
}
