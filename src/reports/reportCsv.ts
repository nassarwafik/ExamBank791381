// Pure CSV ROW BUILDERS for every report — the exact expressions that used to live inline in ReportViews,
// moved here unchanged so the exported bytes stay identical (columns, order, values, filenames). Encoding
// (BOM, CRLF, quoting, formula-injection guard) stays in csv.ts. Nothing here reads the network.
import type { ReactNode } from "react";
import type { TrackMeta } from "../projects/types";

export type Kpi = { label: string; value: ReactNode; hint?: string };
type Cell = string | number;

export type ClassReportData = { class: { name: string }; projects: { title: string; tracks: TrackMeta[]; avgOverall: number; trackAverages: Record<string, number>; completedCount: number }[] };
export function classReportRows(kpis: Kpi[], data: ClassReportData): Cell[][] {
  const csv: Cell[][] = [["القسم", "المؤشر", "القيمة"], ...kpis.map(k => ["أكاديمي", k.label, String(k.value)])];
  for (const p of data.projects) {
    csv.push([p.title, "التقدم العام", String(p.avgOverall)]);
    for (const t of p.tracks) csv.push([p.title, t.title, String(p.trackAverages[t.trackId] || 0)]);
    csv.push([p.title, "مكتملون", String(p.completedCount)]);
  }
  return csv;
}
export const classReportFilename = (data: ClassReportData) => "class-" + data.class.name;

export type StudentReportData = { student: { displayName: string }; projects: { title: string; tracks: TrackMeta[]; summary: { overallProgress: number; trackProgress: Record<string, number> } }[] };
export function studentReportRows(kpis: Kpi[], data: StudentReportData): Cell[][] {
  const csv: Cell[][] = [["القسم", "المؤشر", "القيمة"], ...kpis.map(k => ["أكاديمي", k.label, String(k.value)])];
  for (const p of data.projects) {
    csv.push([p.title, "التقدم العام", String(p.summary.overallProgress)]);
    for (const t of p.tracks) csv.push([p.title, t.title, String(p.summary.trackProgress[t.trackId] || 0)]);
  }
  return csv;
}
export const studentReportFilename = (data: StudentReportData) => "student-" + data.student.displayName;

export type AssignmentRow = { title: string; students: number; submitted: number; missing: number; zeroScores: number; submissionRate: number; average: number | null; avgAttempts: number };
export function assignmentsReportRows(perAssignment: AssignmentRow[]): Cell[][] {
  return [["التقييم", "الطلاب", "مُسلَّم", "غير مسلَّم", "صفر", "نسبة التسليم", "المتوسط", "متوسط المحاولات"], ...perAssignment.map(r => [r.title, r.students, r.submitted, r.missing, r.zeroScores, r.submissionRate, r.average ?? "", r.avgAttempts])];
}
export const assignmentsReportFilename = (className: string) => "assessments-" + className;

export function projectReportRows(kpis: Kpi[]): Cell[][] {
  return [["المؤشر", "القيمة"], ...kpis.map(k => [k.label, String(k.value)])];
}
export const projectReportFilename = (projectCode: string, className: string) => "project-" + projectCode + "-" + className;

export type TrackRow = { stageId: string; title: string; approved: number; ready_for_review: number; in_progress: number; not_started: number; approvedPct: number };
export function trackReportRows(rows: TrackRow[]): Cell[][] {
  return [["المرحلة", "العنوان", "معتمد", "جاهز", "قيد التنفيذ", "لم يبدأ", "نسبة الاعتماد"], ...rows.map(r => [r.stageId, r.title, r.approved, r.ready_for_review, r.in_progress, r.not_started, r.approvedPct])];
}
export const trackReportFilename = (track: string, className: string) => "track-" + track + "-" + className;

export type ReadyStudent = { displayName: string; stages: { stageId: string; title: string }[] };
export function readyReportRows(students: ReadyStudent[]): Cell[][] {
  return [["الطالب", "المرحلة", "العنوان"], ...students.flatMap(s => s.stages.map(st => [s.displayName, st.stageId, st.title]))];
}
export const readyReportFilename = (projectCode: string, className: string) => "ready-" + projectCode + "-" + className;

export type DelayedRow = { displayName: string; overall: number; trackProgress: Record<string, number>; updatedAt: string; reasons: string[] };
export function delayedReportRows(tracks: TrackMeta[], students: DelayedRow[]): Cell[][] {
  return [["الطالب", "التقدم العام", ...tracks.map(t => t.title), "آخر تحديث", "السبب"], ...students.map(r => [r.displayName, r.overall, ...tracks.map(t => r.trackProgress[t.trackId] || 0), r.updatedAt, r.reasons.join("؛ ")])];
}
export const delayedReportFilename = (projectCode: string, className: string) => "delayed-" + projectCode + "-" + className;

export function timelineReportRows(trend: { weekStart: string; avgOverall: number }[]): Cell[][] {
  return [["الأسبوع", "متوسط التقدّم"], ...trend.map(t => [t.weekStart, t.avgOverall])];
}
export const timelineReportFilename = (projectCode: string, className: string) => "timeline-" + projectCode + "-" + className;
