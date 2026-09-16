// @vitest-environment happy-dom
// UX-6b — CSV HARD PARITY. The row builders in reportCsv.ts must produce byte-identical CSV to the legacy
// inline builders that lived in ReportViews.tsx before UX-6b. `legacy` below is a verbatim transcription of
// those inline expressions (frozen), fed with the same fixtures; every report type is compared through the
// unchanged csv.ts encoder (BOM handled by downloadCsv, CRLF, all cells quoted, formula-injection guard).
import { describe, it, expect, vi, afterEach } from "vitest";
import { toCsv, csvCell, downloadCsv } from "./csv";
import * as rows from "./reportCsv";

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Math.round(Number(n)) + "%");
const TRACKS = [{ trackId: "book", title: "الكتاب" }, { trackId: "packetTracer", title: "Packet Tracer" }];

/* ---------- frozen legacy builders (pre-UX-6b ReportViews.tsx) ---------- */
const legacy = {
  classReport(data: { class: { name: string; status: string; studentCount: number }; kpis: { assignments: number; averageScore: number | null; submissionRate: number }; projects: rows.ClassReportData["projects"] }) {
    const kpis = [
      { label: "الحالة", value: data.class.status === "archived" ? "مؤرشف" : "نشط" },
      { label: "عدد الطلاب", value: data.class.studentCount },
      { label: "عدد الواجبات", value: data.kpis.assignments },
      { label: "متوسط العلامات", value: pct(data.kpis.averageScore) },
      { label: "نسبة التسليم", value: pct(data.kpis.submissionRate) }
    ];
    const csv: (string | number)[][] = [["القسم", "المؤشر", "القيمة"], ...kpis.map(k => ["أكاديمي", k.label, String(k.value)])];
    for (const p of data.projects) {
      csv.push([p.title, "التقدم العام", String(p.avgOverall)]);
      for (const t of p.tracks) csv.push([p.title, t.title, String(p.trackAverages[t.trackId] || 0)]);
      csv.push([p.title, "مكتملون", String(p.completedCount)]);
    }
    return { filename: "class-" + data.class.name, csv };
  },
  studentReport(data: { student: { displayName: string; className: string }; academic: { average: number | null; submittedCount: number; assessmentCount: number; submissionRate: number }; projects: rows.StudentReportData["projects"] }) {
    const kpis = [
      { label: "الصف", value: data.student.className || "—" },
      { label: "متوسط التقييمات", value: pct(data.academic.average) },
      { label: "المسلَّمة", value: data.academic.submittedCount + " / " + data.academic.assessmentCount },
      { label: "نسبة التسليم", value: pct(data.academic.submissionRate) }
    ];
    const csv: (string | number)[][] = [["القسم", "المؤشر", "القيمة"], ...kpis.map(k => ["أكاديمي", k.label, String(k.value)])];
    for (const p of data.projects) {
      csv.push([p.title, "التقدم العام", String(p.summary.overallProgress)]);
      for (const t of p.tracks) csv.push([p.title, t.title, String(p.summary.trackProgress[t.trackId] || 0)]);
    }
    return { filename: "student-" + data.student.displayName, csv };
  },
  assignments(className: string, perAssignment: rows.AssignmentRow[]) {
    return { filename: "assessments-" + className, csv: [["التقييم", "الطلاب", "مُسلَّم", "غير مسلَّم", "صفر", "نسبة التسليم", "المتوسط", "متوسط المحاولات"], ...perAssignment.map(r => [r.title, r.students, r.submitted, r.missing, r.zeroScores, r.submissionRate, r.average ?? "", r.avgAttempts])] };
  },
  project(projectCode: string, className: string, summary: { studentCount: number; avgOverall: number; trackAverages: Record<string, number>; completedCount: number; studentsReadyForReview: number; staleCount: number }, tracks: typeof TRACKS) {
    const kpis = [
      { label: "عدد الطلاب", value: summary.studentCount },
      { label: "التقدم العام", value: pct(summary.avgOverall) },
      ...tracks.map(t => ({ label: t.title, value: pct(summary.trackAverages[t.trackId] || 0) })),
      { label: "✅ مكتملون", value: summary.completedCount },
      { label: "🔵 ينتظرون الفحص", value: summary.studentsReadyForReview },
      { label: "⚠ متأخرون", value: summary.staleCount }
    ];
    return { filename: "project-" + projectCode + "-" + className, csv: [["المؤشر", "القيمة"], ...kpis.map(k => [k.label, String(k.value)])] };
  },
  track(track: string, className: string, r: rows.TrackRow[]) {
    return { filename: "track-" + track + "-" + className, csv: [["المرحلة", "العنوان", "معتمد", "جاهز", "قيد التنفيذ", "لم يبدأ", "نسبة الاعتماد"], ...r.map(x => [x.stageId, x.title, x.approved, x.ready_for_review, x.in_progress, x.not_started, x.approvedPct])] };
  },
  ready(projectCode: string, className: string, students: rows.ReadyStudent[]) {
    return { filename: "ready-" + projectCode + "-" + className, csv: [["الطالب", "المرحلة", "العنوان"], ...students.flatMap(s => s.stages.map(st => [s.displayName, st.stageId, st.title]))] };
  },
  delayed(projectCode: string, className: string, tracks: typeof TRACKS, students: rows.DelayedRow[]) {
    return { filename: "delayed-" + projectCode + "-" + className, csv: [["الطالب", "التقدم العام", ...tracks.map(t => t.title), "آخر تحديث", "السبب"], ...students.map(r => [r.displayName, r.overall, ...tracks.map(t => r.trackProgress[t.trackId] || 0), r.updatedAt, r.reasons.join("؛ ")])] };
  },
  timeline(projectCode: string, className: string, trend: { weekStart: string; avgOverall: number }[]) {
    return { filename: "timeline-" + projectCode + "-" + className, csv: [["الأسبوع", "متوسط التقدّم"], ...trend.map(t => [t.weekStart, t.avgOverall])] };
  }
};

/* ---------- fixtures (include tricky values: null average, zero, empty track, formula-looking title) ---------- */
type ClassFixture = { class: { name: string; status: string; studentCount: number }; kpis: { assignments: number; averageScore: number | null; submissionRate: number }; projects: rows.ClassReportData["projects"] };
const CLASS: ClassFixture = { class: { name: "الحادي عشر", status: "active", studentCount: 24 }, kpis: { assignments: 3, averageScore: 71.26, submissionRate: 83 }, projects: [{ title: "مشروع 794589", tracks: TRACKS, avgOverall: 55, trackAverages: { book: 70 }, completedCount: 2 }] };
const CLASS_ARCHIVED: ClassFixture = { ...CLASS, class: { ...CLASS.class, status: "archived" }, kpis: { assignments: 0, averageScore: null, submissionRate: 0 }, projects: [] };
const STUDENT: { student: { displayName: string; className: string }; academic: { average: number | null; submittedCount: number; assessmentCount: number; submissionRate: number }; projects: rows.StudentReportData["projects"] } = { student: { displayName: "زيد صالح", className: "" }, academic: { average: null, submittedCount: 2, assessmentCount: 5, submissionRate: 40 }, projects: [{ title: "مشروع 794589", tracks: TRACKS, summary: { overallProgress: 45, trackProgress: { packetTracer: 30 } } }] };
const PER_ASSIGNMENT: rows.AssignmentRow[] = [
  { title: "=SUM(A1)", students: 24, submitted: 20, missing: 4, zeroScores: 1, submissionRate: 83, average: 71.3, avgAttempts: 1.2 },
  { title: "اختبار \"الكسور\"", students: 24, submitted: 0, missing: 24, zeroScores: 0, submissionRate: 0, average: null, avgAttempts: 0 }
];
const SUMMARY: { studentCount: number; avgOverall: number; trackAverages: Record<string, number>; completedCount: number; studentsReadyForReview: number; staleCount: number } = { studentCount: 24, avgOverall: 55.5, trackAverages: { book: 70, packetTracer: 41 }, completedCount: 2, studentsReadyForReview: 3, staleCount: 1 };
const TRACK_ROWS: rows.TrackRow[] = [{ stageId: "B01", title: "مقدمة", approved: 10, ready_for_review: 2, in_progress: 5, not_started: 7, approvedPct: 42 }];
const READY: rows.ReadyStudent[] = [{ displayName: "زيد", stages: [{ stageId: "B01", title: "مقدمة" }, { stageId: "P01", title: "طوبولوجيا" }] }, { displayName: "-خالد", stages: [{ stageId: "B02", title: "OSI" }] }];
const DELAYED: rows.DelayedRow[] = [{ displayName: "سعد", overall: 12, trackProgress: { book: 20 }, updatedAt: "2026-02-01T10:00:00.000Z", reasons: ["بلا تحديث 7+ أيام", "تقدّم أقل من 40%"] }];
const TREND = [{ weekStart: "2026-02-22", avgOverall: 40 }, { weekStart: "2026-03-01", avgOverall: 72 }];

const kpisClass = (d: typeof CLASS) => [
  { label: "الحالة", value: d.class.status === "archived" ? "مؤرشف" : "نشط" }, { label: "عدد الطلاب", value: d.class.studentCount }, { label: "عدد الواجبات", value: d.kpis.assignments },
  { label: "متوسط العلامات", value: pct(d.kpis.averageScore) }, { label: "نسبة التسليم", value: pct(d.kpis.submissionRate) }
];
const kpisStudent = (d: typeof STUDENT) => [
  { label: "الصف", value: d.student.className || "—" }, { label: "متوسط التقييمات", value: pct(d.academic.average) },
  { label: "المسلَّمة", value: d.academic.submittedCount + " / " + d.academic.assessmentCount }, { label: "نسبة التسليم", value: pct(d.academic.submissionRate) }
];
const kpisProject = () => [
  { label: "عدد الطلاب", value: SUMMARY.studentCount }, { label: "التقدم العام", value: pct(SUMMARY.avgOverall) },
  ...TRACKS.map(t => ({ label: t.title, value: pct(SUMMARY.trackAverages[t.trackId] || 0) })),
  { label: "✅ مكتملون", value: SUMMARY.completedCount }, { label: "🔵 ينتظرون الفحص", value: SUMMARY.studentsReadyForReview }, { label: "⚠ متأخرون", value: SUMMARY.staleCount }
];

afterEach(() => vi.restoreAllMocks());

describe("UX-6b CSV parity — every report's rows and filename are byte-identical to the legacy inline builders", () => {
  const cases: [string, { filename: string; csv: (string | number)[][] }, { filename: string; csv: (string | number)[][] }][] = [
    ["class", legacy.classReport(CLASS), { filename: rows.classReportFilename(CLASS), csv: rows.classReportRows(kpisClass(CLASS), CLASS) }],
    ["class (archived, null average, no projects)", legacy.classReport(CLASS_ARCHIVED), { filename: rows.classReportFilename(CLASS_ARCHIVED), csv: rows.classReportRows(kpisClass(CLASS_ARCHIVED), CLASS_ARCHIVED) }],
    ["student", legacy.studentReport(STUDENT), { filename: rows.studentReportFilename(STUDENT), csv: rows.studentReportRows(kpisStudent(STUDENT), STUDENT) }],
    ["assignments", legacy.assignments("الحادي عشر", PER_ASSIGNMENT), { filename: rows.assignmentsReportFilename("الحادي عشر"), csv: rows.assignmentsReportRows(PER_ASSIGNMENT) }],
    ["project", legacy.project("794589", "الحادي عشر", SUMMARY, TRACKS), { filename: rows.projectReportFilename("794589", "الحادي عشر"), csv: rows.projectReportRows(kpisProject()) }],
    ["track", legacy.track("book", "الحادي عشر", TRACK_ROWS), { filename: rows.trackReportFilename("book", "الحادي عشر"), csv: rows.trackReportRows(TRACK_ROWS) }],
    ["ready", legacy.ready("794589", "الحادي عشر", READY), { filename: rows.readyReportFilename("794589", "الحادي عشر"), csv: rows.readyReportRows(READY) }],
    ["delayed", legacy.delayed("794589", "الحادي عشر", TRACKS, DELAYED), { filename: rows.delayedReportFilename("794589", "الحادي عشر"), csv: rows.delayedReportRows(TRACKS, DELAYED) }],
    ["timeline", legacy.timeline("794589", "الحادي عشر", TREND), { filename: rows.timelineReportFilename("794589", "الحادي عشر"), csv: rows.timelineReportRows(TREND) }]
  ];
  for (const [name, expected, actual] of cases) {
    it(name, () => {
      expect(actual.filename).toBe(expected.filename);
      expect(actual.csv).toEqual(expected.csv);
      expect(toCsv(actual.csv)).toBe(toCsv(expected.csv));
    });
  }
  it("encoding is unchanged: all cells quoted, CRLF rows, formula-injection guard, Western digits, missing average as empty cell", () => {
    const text = toCsv(rows.assignmentsReportRows(PER_ASSIGNMENT));
    expect(text.split("\r\n")).toHaveLength(3);
    expect(text.split("\r\n")[1].startsWith('"\'=SUM(A1)","24","20","4","1","83","71.3","1.2"')).toBe(true);
    expect(text.split("\r\n")[2]).toBe('"اختبار ""الكسور""","24","0","24","0","0","","0"');
    expect(/[٠-٩]/.test(text)).toBe(false);
    expect(csvCell("+1")).toBe("\"'+1\"");
    expect(toCsv(rows.readyReportRows(READY)).split("\r\n")[3]).toBe('"\'-خالد","B02","OSI"');
  });
  it("downloadCsv still prefixes the UTF-8 BOM, uses text/csv and the .csv suffix (no network)", async () => {
    let captured: Blob | null = null;
    const anchorClick = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(anchorClick);
    const create = vi.fn((b: Blob) => { captured = b; return "blob:x"; });
    const revoke = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = create;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revoke;
    downloadCsv("class-الحادي عشر", rows.timelineReportRows(TREND));
    expect(create).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    const blob = captured as unknown as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8;");
    const bytes = new Uint8Array(await new Response(blob).arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);                              // UTF-8 BOM bytes
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1)).toBe('"الأسبوع","متوسط التقدّم"\r\n"2026-02-22","40"\r\n"2026-03-01","72"');
  });
});
