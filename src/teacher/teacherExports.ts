// Phase 21E.2 (G) — teacher result exports: the gradebook of one assignment and the per-assignment results of the dashboard
// drill. Pure row builders (stable column order, stable row order) encoded and downloaded by the ONE trusted CSV module
// (reports/csv.ts: UTF-8 BOM, CRLF, quoted cells, formula-injection guard). Only fields the teacher already sees on screen are
// exported: names, student codes, statuses, attempt counts, scores, percentages and submission times — never answers,
// answer keys, teacher feedback, identity numbers, attempt epochs or any other internal field of the payload.
import { gradingLabel, resolveGradingStatus, type GradingStatus } from "../gradingStatus";
import { LIFECYCLE_LABEL, type StudentResult } from "../assignments/types";

export type CsvCellValue = string | number;

/** Local, spreadsheet-friendly timestamp «YYYY-MM-DD HH:mm»; an empty or invalid value stays an empty cell. */
export function csvDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

/** A finite number stays a number (so a spreadsheet can compute with it); anything else is an empty cell, never «0». */
const num = (value: unknown): CsvCellValue => (typeof value === "number" && Number.isFinite(value) ? value : "");

/** Deterministic row order independent of the on-screen sort: student name (Arabic collation), then student code, then id. */
function byStudent(a: StudentResult, b: StudentResult): number {
  return String(a.studentName || "").localeCompare(String(b.studentName || ""), "ar")
    || String(a.studentCode || "").localeCompare(String(b.studentCode || ""), "ar")
    || String(a.studentId).localeCompare(String(b.studentId));
}

export const GRADEBOOK_COLUMNS = ["الطالب", "كود الطالب", "حالة التصحيح", "حالة المحاولة", "المحاولات المستخدمة", "المحاولات المسموحة", "آخر علامة", "العلامة الكاملة", "النسبة المئوية", "تاريخ آخر تسليم"] as const;

/**
 * The gradebook of ONE assignment: every student of the authoritative results (never the searched / filtered subset), one row
 * each, with the grading status from the panel's own resolver. A student without a submission keeps empty score cells.
 */
export function gradebookCsvRows(assignment: { title: string; className?: string }, rows: StudentResult[], gradingOf: (s: StudentResult) => GradingStatus): CsvCellValue[][] {
  const out: CsvCellValue[][] = [
    ["الواجب", assignment.title || ""],
    ["الصف", assignment.className || ""],
    [],
    [...GRADEBOOK_COLUMNS]
  ];
  for (const s of [...rows].sort(byStudent)) {
    const r = s.latestResult;
    out.push([
      s.studentName || "",
      s.studentCode || "",
      gradingLabel(gradingOf(s)),
      s.attemptStatus ? LIFECYCLE_LABEL[s.attemptStatus] || s.attemptStatus : "",
      num(s.attemptsUsed),
      num(s.allowedAttempts),
      r ? num(r.score) : "",
      r ? num(r.totalMarks) : "",
      r ? num(r.percentage) : "",
      r ? csvDateTime(r.submittedAt) : ""
    ]);
  }
  return out;
}

/** The subset of /api/assignment-results the dashboard drill holds (structural, so both result shapes fit). */
export type ResultsForExport = {
  assignment: { title: string; totalMarks: number };
  students: Array<{ studentId: string; studentName: string; studentCode: string; attemptsUsed: number; allowedAttempts: number;
    latestResult: { attemptNumber: number; score: number; totalMarks: number; percentage: number; submittedAt: string; gradingStatus?: GradingStatus; finalized?: boolean; manualReviewMarks?: number } | null }>;
};

export const RESULTS_COLUMNS = ["الطالب", "كود الطالب", "الحالة", "المحاولات المستخدمة", "المحاولات المسموحة", "رقم آخر محاولة", "آخر علامة", "العلامة الكاملة", "النسبة المئوية", "تاريخ التسليم"] as const;

export function assignmentResultsCsvRows(results: ResultsForExport): CsvCellValue[][] {
  const out: CsvCellValue[][] = [["الواجب", results.assignment.title || ""], [], [...RESULTS_COLUMNS]];
  const students = [...results.students].sort((a, b) => byStudent(a as StudentResult, b as StudentResult));
  for (const s of students) {
    const r = s.latestResult;
    out.push([
      s.studentName || "",
      s.studentCode || "",
      gradingLabel(resolveGradingStatus(r)),
      num(s.attemptsUsed),
      num(s.allowedAttempts),
      r ? num(r.attemptNumber) : "",
      r ? num(r.score) : "",
      r ? num(r.totalMarks) : "",
      r ? num(r.percentage) : "",
      r ? csvDateTime(r.submittedAt) : ""
    ]);
  }
  return out;
}

/** A safe download name: the title without path / reserved / control characters, collapsed, bounded. */
export function exportFilename(prefix: string, title: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = String(title || "").replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80).replace(/\s/g, "-");
  return prefix + (clean ? "-" + clean : "") + ".csv";
}
