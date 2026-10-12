// Phase 21E.2 (G) — gradebook / assignment-results CSV row builders: stable columns, stable rows, empty (never «0») cells for a
// missing value, the one trusted encoder (BOM, quoting, formula-injection guard) and no field beyond what the teacher sees.
import { describe, it, expect } from "vitest";
import { gradebookCsvRows, assignmentResultsCsvRows, csvDateTime, exportFilename, maskedStudentCode, GRADEBOOK_COLUMNS, RESULTS_COLUMNS } from "./teacherExports";
import { toCsv } from "../reports/csv";
import { resolveGradingStatus } from "../gradingStatus";
import type { StudentResult } from "../assignments/types";

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString();
const result = (over: Record<string, unknown> = {}) => ({ attemptNumber: 1, score: 62, totalMarks: 100, percentage: 62, submittedAt: at(2026, 3, 1, 9, 5), finalized: false, manualReviewMarks: 18, gradingStatus: "pendingReview", teacherFeedback: "سري للمعلم", ...over });
const student = (id: string, name: string, code: string, over: Record<string, unknown> = {}) => ({ studentId: id, studentName: name, studentCode: code, attemptsUsed: 1, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "submitted", gradingStatus: "pendingReview", activeAttempt: { attemptNumber: 2, startedAt: "", endsAt: "", attemptEpoch: 777, runEndsAt: "x" }, attempts: [result()], latestResult: result(), ...over }) as unknown as StudentResult;
const grading = (s: StudentResult) => s.gradingStatus || resolveGradingStatus(s.latestResult);

describe("gradebookCsvRows", () => {
  const rows = [
    student("s2", "خالد", "012345678", { gradingStatus: "final", latestResult: result({ score: 90, percentage: 90, finalized: true, gradingStatus: "final" }) }),
    student("s1", "زيد", "987654321"),
    student("s3", "سعد", "000004321", { attemptsUsed: 0, attemptStatus: "notStarted", gradingStatus: "notSubmitted", attempts: [], latestResult: null })
  ];
  const out = gradebookCsvRows({ title: "واجب الشبكات", className: "الحادي عشر" }, rows, grading);

  it("has a title block, then the fixed column header", () => {
    expect(out.slice(0, 4)).toEqual([["الواجب", "واجب الشبكات"], ["الصف", "الحادي عشر"], [], [...GRADEBOOK_COLUMNS]]);
    expect(GRADEBOOK_COLUMNS).toEqual(["الطالب", "رقم الهوية (آخر 4 خانات)", "حالة التصحيح", "حالة المحاولة", "المحاولات المستخدمة", "المحاولات المسموحة", "آخر علامة", "العلامة الكاملة", "النسبة المئوية", "تاريخ آخر تسليم"]);
  });
  it("orders students by Arabic name independently of the input order, every row as wide as the header", () => {
    const body = out.slice(4);
    expect(body.map(r => r[0])).toEqual(["خالد", "زيد", "سعد"]);
    for (const r of body) expect(r).toHaveLength(GRADEBOOK_COLUMNS.length);
    expect(gradebookCsvRows({ title: "x" }, [...rows].reverse(), grading).slice(4)).toEqual(body);
  });
  it("maps statuses, numbers and the local timestamp; a missing submission leaves empty cells, never 0", () => {
    const [khaled, zaid, saad] = out.slice(4);
    expect(khaled).toEqual(["خالد", "•••••5678", "نهائي", "تم التسليم", 1, 3, 90, 100, 90, "2026-03-01 09:05"]);
    expect(zaid.slice(2, 4)).toEqual(["بانتظار التصحيح", "تم التسليم"]);
    expect(saad).toEqual(["سعد", "•••••4321", "لم يسلّم", "لم يبدأ", 0, 3, "", "", "", ""]);
  });
  it("a non-finite value inside an existing result is an empty cell, never 0 or «NaN»", () => {
    const odd = student("s9", "ياسر", "Y1", { latestResult: result({ score: Number.NaN, totalMarks: undefined, percentage: Infinity }) });
    const [row] = gradebookCsvRows({ title: "x" }, [odd], grading).slice(4);
    expect(row.slice(6, 9)).toEqual(["", "", ""]);
    expect(toCsv([row])).not.toMatch(/NaN|Infinity|"0"/);
  });
  it("never exports teacher feedback, attempt epochs, internal ids or a full identity / login number", () => {
    const csv = toCsv(out);
    for (const secret of ["سري للمعلم", "777", "runEndsAt", "attemptEpoch", "s1", "s2", "012345678", "987654321", "000004321", "12345678"]) expect(csv).not.toContain(secret);
  });
  it("the masked code is a text cell (a spreadsheet keeps it as written: no leading-zero loss, no formula)", () => {
    expect(maskedStudentCode("000004321")).toBe("•••••4321");
    expect(maskedStudentCode(" P1 ")).toBe("•••••P1");
    expect(maskedStudentCode("")).toBe("");
    expect(maskedStudentCode(undefined)).toBe("");
    expect(toCsv([[maskedStudentCode("=1+1")]])).toBe('"•••••=1+1"');               // the bullet is the first character
  });
  it("neutralises formula-shaped names and codes through the shared encoder", () => {
    const evil = gradebookCsvRows({ title: "=cmd|' /C calc'!A0" }, [student("e", "=HYPERLINK(\"http://x\")", "+1", {})], grading);
    const csv = toCsv(evil);
    expect(csv).toContain("\"'=cmd|' /C calc'!A0\"");
    expect(csv).toContain("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csv).toContain("\"•••••+1\"");
  });
});

describe("assignmentResultsCsvRows", () => {
  it("exports the drill's results with the resolver's status and stable columns — and no student code (the drill shows none)", () => {
    const out = assignmentResultsCsvRows({ assignment: { title: "واجب 1", totalMarks: 20 }, students: [
      { studentId: "b", studentName: "ب", studentCode: "000000222", attemptsUsed: 0, allowedAttempts: 2, latestResult: null },
      { studentId: "a", studentName: "أ", studentCode: "000000111", attemptsUsed: 2, allowedAttempts: 2, latestResult: { attemptNumber: 2, score: 13, totalMarks: 20, percentage: 65, submittedAt: at(2026, 9, 1, 14, 30), gradingStatus: "final", finalized: true } }
    ] });
    expect(out[2]).toEqual([...RESULTS_COLUMNS]);
    expect(out.slice(3)).toEqual([
      ["أ", "نهائي", 2, 2, 2, 13, 20, 65, "2026-09-01 14:30"],
      ["ب", "لم يسلّم", 0, 2, "", "", "", "", ""]
    ]);
    expect(toCsv(out)).not.toMatch(/000000111|000000222|111|222/);
  });
});

describe("helpers", () => {
  it("csvDateTime keeps empty / invalid values empty", () => {
    expect(csvDateTime("")).toBe("");
    expect(csvDateTime(null)).toBe("");
    expect(csvDateTime("not a date")).toBe("");
  });
  it("exportFilename strips path, reserved and control characters and bounds the length", () => {
    expect(exportFilename("TadrisPlus-سجل-العلامات", "واجب ../../ «1»: <x>?")).toBe("TadrisPlus-سجل-العلامات-واجب-..-..-«1»-x.csv");
    expect(exportFilename("P", "")).toBe("P.csv");
    expect(exportFilename("P", "a\u0000b\nc")).toBe("P-a-b-c.csv");
    expect(exportFilename("P", "x".repeat(200)).length).toBe("P-".length + 80 + ".csv".length);
  });
});
