// @vitest-environment happy-dom
// UX-6b pinned the Reports Center's CSV byte for byte to the builders that lived inline in ReportViews.tsx. Reports R-4 CHANGES
// those bytes on purpose — owner decision D-4 (docs/reports-center-audit.md §6; docs/enterprise-reports-export-r4.md): one export
// for CSV / Excel / PDF, figures as numbers, the report's identity at the top, the matrix exported.
// So this file is now the BEFORE / AFTER record of that change:
//   BEFORE — `legacy` below is the verbatim transcription of the pre-UX-6b inline builders (frozen since UX-6b; the module that
//            mirrored them, reportCsv.ts, is removed in R-4), and its output is pinned as explicit text;
//   AFTER  — the same fixtures through reportExport.ts, pinned as explicit text.
// The ENCODER (csv.ts: BOM, CRLF, every cell quoted, the formula-injection guard) is unchanged and still pinned here.
import { describe, it, expect, vi, afterEach } from "vitest";
import { toCsv, csvCell, downloadCsv } from "./csv";
import { classExport, assignmentsExport, readyExport, timelineExport, exportRows } from "./reportExport";

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Math.round(Number(n)) + "%");
const TRACKS = [{ trackId: "book", title: "الكتاب", icon: "" }, { trackId: "packetTracer", title: "Packet Tracer", icon: "" }];
const AT = "2026-11-11 10:00";
const lines = (rows: (string | number)[][]) => toCsv(rows).split("\r\n");
const after = (r: Parameters<typeof exportRows>[0]) => lines(exportRows(r, AT).rows);

/* ---------- BEFORE: frozen legacy builders (pre-UX-6b ReportViews.tsx), verbatim ---------- */
type LegacyProject = { title: string; tracks: { trackId: string; title: string }[]; avgOverall: number; trackAverages: Record<string, number>; completedCount: number };
type LegacyAssignment = { title: string; students: number; submitted: number; missing: number; zeroScores: number; submissionRate: number; average: number | null; avgAttempts: number };
const legacy = {
  classReport(data: { class: { name: string; status: string; studentCount: number }; kpis: { assignments: number; averageScore: number | null; submissionRate: number }; projects: LegacyProject[] }) {
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
  assignments(className: string, perAssignment: LegacyAssignment[]) {
    return { filename: "assessments-" + className, csv: [["التقييم", "الطلاب", "مُسلَّم", "غير مسلَّم", "صفر", "نسبة التسليم", "المتوسط", "متوسط المحاولات"], ...perAssignment.map(r => [r.title, r.students, r.submitted, r.missing, r.zeroScores, r.submissionRate, r.average ?? "", r.avgAttempts])] as (string | number)[][] };
  },
  ready(projectCode: string, className: string, students: { displayName: string; stages: { stageId: string; title: string }[] }[]) {
    return { filename: "ready-" + projectCode + "-" + className, csv: [["الطالب", "المرحلة", "العنوان"], ...students.flatMap(s => s.stages.map(st => [s.displayName, st.stageId, st.title]))] as (string | number)[][] };
  }
};

/* ---------- fixtures (tricky values: null average, a formula-looking title, a quote, a leading minus) ---------- */
const CLASS = { class: { name: "الحادي عشر", schoolYear: "2025-2026", status: "active", studentCount: 24 }, kpis: { assignments: 3, averageScore: 71.26, submissionRate: 83 }, projects: [{ title: "مشروع 794589", tracks: TRACKS, avgOverall: 55, trackAverages: { book: 70 }, completedCount: 2 }] };
const CLASS_ARCHIVED = { ...CLASS, class: { ...CLASS.class, status: "archived" }, kpis: { assignments: 0, averageScore: null, submissionRate: 0 }, projects: [] };
const PER_ASSIGNMENT = [
  { assignmentId: "a1", title: "=SUM(A1)", students: 24, submitted: 20, missing: 4, zeroScores: 1, submissionRate: 83, average: 71.3, avgAttempts: 1.2 },
  { assignmentId: "a2", title: "اختبار \"الكسور\"", students: 24, submitted: 0, missing: 24, zeroScores: 0, submissionRate: 0, average: null, avgAttempts: 0 }
];
const READY = [{ displayName: "زيد", stages: [{ stageId: "B01", title: "مقدمة", track: "book" }, { stageId: "P01", title: "طوبولوجيا", track: "packetTracer" }] }, { displayName: "-خالد", stages: [{ stageId: "B02", title: "OSI", track: "book" }] }];
const TREND = [{ weekStart: "2026-02-22", avgOverall: 40 }, { weekStart: "2026-03-01", avgOverall: 72 }];

afterEach(() => vi.restoreAllMocks());

describe("D-4 before / after — class report", () => {
  it("BEFORE: a flat «القسم / المؤشر / القيمة» table, figures as TEXT («71%»), no identity", () => {
    const b = legacy.classReport(CLASS);
    expect(b.filename).toBe("class-الحادي عشر");
    expect(lines(b.csv)).toEqual(['"القسم","المؤشر","القيمة"', '"أكاديمي","الحالة","نشط"', '"أكاديمي","عدد الطلاب","24"', '"أكاديمي","عدد الواجبات","3"', '"أكاديمي","متوسط العلامات","71%"', '"أكاديمي","نسبة التسليم","83%"',
      '"مشروع 794589","التقدم العام","55"', '"مشروع 794589","الكتاب","70"', '"مشروع 794589","Packet Tracer","0"', '"مشروع 794589","مكتملون","2"']);
  });
  it("AFTER: the report's identity, then sections; the average is the NUMBER the server sent (71.26), not «71%»", () => {
    expect(after(classExport(CLASS, {}))).toEqual(['"تقرير الصف — الحادي عشر"', '"الصف","الحادي عشر"', '"السنة الدراسية","2025-2026"', '"الفترة","كل الفترة"', '"أُنشئ في","2026-11-11 10:00"', '',
      '"المؤشرات"', '"المؤشر","القيمة"', '"الحالة","نشط"', '"عدد الطلاب","24"', '"عدد التقييمات","3"', '"متوسط النتائج %","71.26"', '"نسبة التسليم %","83"', '"بانتظار التصحيح","0"', '',
      '"المشاريع"', '"المشروع","المؤشر","القيمة"', '"مشروع 794589","التقدم العام %","55"', '"مشروع 794589","الكتاب %","70"', '"مشروع 794589","Packet Tracer %","0"', '"مشروع 794589","مكتملون","2"']);
  });
  it("a missing average: BEFORE the dash «—», AFTER an EMPTY cell — never 0", () => {
    expect(lines(legacy.classReport(CLASS_ARCHIVED).csv)).toContain('"أكاديمي","متوسط العلامات","—"');
    const a = after(classExport(CLASS_ARCHIVED, {}));
    expect(a).toContain('"متوسط النتائج %",""');
    expect(a).toContain('"الحالة","مؤرشف"');
    expect(a).not.toContain('"المشاريع"');                         // no project → no empty section
  });
});

describe("D-4 before / after — assessments report", () => {
  it("BEFORE: one table; no pending column, no matrix", () => {
    const b = legacy.assignments("الحادي عشر", PER_ASSIGNMENT);
    expect(b.filename).toBe("assessments-الحادي عشر");
    expect(lines(b.csv)).toEqual(['"التقييم","الطلاب","مُسلَّم","غير مسلَّم","صفر","نسبة التسليم","المتوسط","متوسط المحاولات"', '"\'=SUM(A1)","24","20","4","1","83","71.3","1.2"', '"اختبار ""الكسور""","24","0","24","0","0","","0"']);
  });
  it("AFTER: indicators, the per-assessment table WITH «بانتظار التصحيح», the distribution, and the student × assessment matrix", () => {
    const a = after(assignmentsExport({
      class: { name: "الحادي عشر" }, students: [{ studentId: "s1", displayName: "زيد" }, { studentId: "s2", displayName: "خالد" }, { studentId: "s3", displayName: "سعد" }],
      overall: { assessmentCount: 2, participants: 3, pendingReview: 1, average: 45, submissionRate: 50, distribution: { "0-49": 1, "90-100": 1 } },
      perAssignment: PER_ASSIGNMENT.map((r, i) => ({ ...r, pendingReview: i === 0 ? 1 : 0 })),
      matrix: [
        { assignmentId: "a1", title: "=SUM(A1)", cells: [{ studentId: "s1", state: "submitted", percentage: 90.4 }, { studentId: "s2", state: "pending", percentage: 0 }, { studentId: "s3", state: "submitted", percentage: 0, zero: true }] },
        { assignmentId: "a2", title: "اختبار \"الكسور\"", cells: [{ studentId: "s1", state: "missing", percentage: null }, { studentId: "s2", state: "held-new", percentage: 55 }] }
      ]
    }, { from: "2026-01-01", to: "2026-01-31" }));
    expect(a.slice(0, 5)).toEqual(['"التقييمات والواجبات — الحادي عشر"', '"الصف","الحادي عشر"', '"الفترة","من 2026-01-01 إلى 2026-01-31"', '"معنى الأرقام","نتيجة آخر محاولة مسلّمة؛ ليست درجات نهائية معتمدة"', '"أُنشئ في","2026-11-11 10:00"']);
    const at = (title: string) => a.indexOf('"' + title + '"');
    expect(a.slice(at("ملخص كل تقييم") + 1, at("ملخص كل تقييم") + 4)).toEqual(['"التقييم","الطلاب","مُسلَّم","لم يسلّم","بانتظار التصحيح","سلّم بعلامة صفر","نسبة التسليم %","المتوسط %","متوسط المحاولات"',
      '"\'=SUM(A1)","24","20","4","1","1","83","71.3","1.2"', '"اختبار ""الكسور""","24","0","24","0","0","0","","0"']);
    // the matrix: a final result is a number (a REAL zero is 0); awaiting the teacher, an unknown state and not handed in are WORDS
    expect(a.slice(at("مصفوفة الطالب × التقييم (%)") + 1)).toEqual(['"الطالب","\'=SUM(A1)","اختبار ""الكسور"""', '"زيد","90","لم يسلّم"', '"خالد","بانتظار التصحيح","بانتظار التصحيح"', '"سعد","0","لم يسلّم"']);
  });
});

describe("D-4 before / after — ready report and the encoder", () => {
  it("BEFORE three columns; AFTER the track is a column too; a leading «-» is still quote-prefixed by the encoder", () => {
    expect(lines(legacy.ready("794589", "الحادي عشر", READY).csv)).toEqual(['"الطالب","المرحلة","العنوان"', '"زيد","B01","مقدمة"', '"زيد","P01","طوبولوجيا"', '"\'-خالد","B02","OSI"']);
    const a = after(readyExport({ class: { name: "الحادي عشر" }, tracks: TRACKS, students: READY }, "794589"));
    expect(a.slice(a.indexOf('"مراحل بانتظار الفحص"') + 1)).toEqual(['"الطالب","المرحلة","العنوان","المسار"', '"زيد","B01","مقدمة","الكتاب"', '"زيد","P01","طوبولوجيا","Packet Tracer"', '"\'-خالد","B02","OSI","الكتاب"']);
  });
  it("the encoder is unchanged: every cell quoted, CRLF rows, the formula guard, Western digits", () => {
    const text = toCsv(exportRows(classExport(CLASS, {}), AT).rows);
    expect(text.includes("\r\n")).toBe(true);
    // every cell quoted: a row starts and ends with a quote and its cells are joined by «","» (an odd count of quotes never occurs)
    expect(text.split("\r\n").every(l => l === "" || (l.startsWith('"') && l.endsWith('"') && (l.split('"').length - 1) % 2 === 0))).toBe(true);
    expect(/[٠-٩]/.test(text)).toBe(false);
    expect(csvCell("+1")).toBe("\"'+1\"");
    expect(csvCell(71.26)).toBe('"71.26"');
  });
  it("downloadCsv still prefixes the UTF-8 BOM, uses text/csv and the .csv suffix (no network)", async () => {
    let captured: Blob | null = null;
    const anchorClick = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(anchorClick);
    const create = vi.fn((b: Blob) => { captured = b; return "blob:x"; });
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = create;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    const rows = exportRows(timelineExport({ class: { name: "الحادي عشر" }, scope: "class", trend: TREND }, "794589", {}), AT).rows;
    downloadCsv("TadrisPlus-التقدم-الزمني", rows);
    expect(create).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    const blob = captured as unknown as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8;");
    const bytes = new Uint8Array(await new Response(blob).arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);                              // UTF-8 BOM bytes
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1).split("\r\n");
    // BEFORE: "الأسبوع","متوسط التقدّم" / "2026-02-22","40" / "2026-03-01","72".  AFTER: the same two figures, plus the change.
    expect(body.slice(-3)).toEqual(['"الأسبوع","متوسط التقدّم %","التغيّر عن الأسبوع السابق (نقطة)"', '"2026-02-22","40",""', '"2026-03-01","72","32"']);
  });
});
