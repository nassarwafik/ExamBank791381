// @vitest-environment happy-dom
//
// Class gradebook GB4 — the table of marks (docs/enterprise-class-gradebook-gb.md §4.6) and its pure model: the category bands with their
// weights, every state in words (never colour alone), each category's total and the final mark with its status, the filters, the drill
// from an assignment cell to that student's review, and an export that carries exactly the table's words. Values are the server's
// (`display`, one decimal): nothing here computes a mark. The fixture is the owner's example shape, one part. TEST data only.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";

vi.mock("../reports/xlsx", () => ({ downloadXlsx: vi.fn() }));
vi.mock("../reports/csv", () => ({ downloadCsv: vi.fn() }));
vi.mock("../reports/printReport", () => ({ printReport: vi.fn(() => true) }));
import { downloadXlsx } from "../reports/xlsx";
import { downloadCsv } from "../reports/csv";
import { printReport } from "../reports/printReport";
import GradebookTable from "./GradebookTable";
import { cellText, categoryText, finalStatus, exportTable, filterRows, columnGroups } from "./gradebookTable";
import type { GbGradebook, GbRow } from "./types";

const a = (assignmentId: string) => ({ kind: "assignment" as const, assignmentId });
const GB = (rows: GbRow[], over: Partial<GbGradebook> = {}): GbGradebook => ({
  ok: true, classId: "c1", className: "العاشر أ", readOnly: false, withheld: [], warnings: [], schemeStatus: "active",
  etags: { scheme: "e1", entries: null },
  students: [{ studentId: "s1", displayName: "سارة", code: "P-1" }, { studentId: "s2", displayName: "أحمد", code: "P-2" }, { studentId: "s3", displayName: "باسل", code: "P-3" }],
  scheme: { revision: 1, updatedAt: "", categories: [
    { categoryId: "m", title: "علامة الشهري", weight: 20, items: [{ itemId: "i1", weight: 40, source: a("a1") }, { itemId: "i2", weight: 60, source: { kind: "manual", title: "امتحان ورقي", maxScore: 20 } }] },
    { categoryId: "t", title: "علامة الفصل 1", weight: 80, items: [{ itemId: "i3", weight: 100, source: a("a3") }] }
  ] },
  columns: [
    { itemId: "i1", categoryId: "m", weight: 40, source: a("a1"), title: "الوظيفة 1" },
    { itemId: "i2", categoryId: "m", weight: 60, source: { kind: "manual", title: "امتحان ورقي", maxScore: 20 }, title: "امتحان ورقي" },
    { itemId: "i3", categoryId: "t", weight: 100, source: a("a3"), title: "امتحان 1" }
  ],
  rows, ...over
});
const ROWS: GbRow[] = [
  { studentId: "s1", cells: { i1: { state: "graded", percent: 80, display: 80 }, i2: { state: "graded", percent: 85, display: 85 }, i3: { state: "graded", percent: 90.25, display: 90.3 } },
    categories: { m: { value: 83, display: 83 }, t: { value: 90.25, display: 90.3 } }, final: { value: 88.8, display: 88.8, status: "complete" } },
  { studentId: "s2", cells: { i1: { state: "pending" }, i2: { state: "zero", percent: 0, display: 0 }, i3: { state: "graded", percent: 70, display: 70 } },
    categories: { m: { value: 0, display: 0 }, t: { value: 70, display: 70 } }, final: { value: 56, display: 56, status: "provisional" } },
  { studentId: "s3", cells: { i1: { state: "excused" }, i2: { state: "excused" }, i3: { state: "missing" } },
    categories: { m: { value: null, display: null, allExcused: true }, t: { value: null, display: null } }, final: { value: null, display: null, status: "incomplete", adjusted: true } }
];
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("GB4 — the pure model", () => {
  it("every state in words; a category without a counted item is «—», or «معفى» when all were excused", () => {
    expect(ROWS.flatMap(r => Object.values(r.cells).map(cellText))).toEqual(["80", "85", "90.3", "بانتظار التصحيح", "0 (قرار)", "70", "معفى", "معفى", "—"]);
    expect(cellText({ state: "missingSource" })).toBe("مصدر مفقود");
    expect(cellText({ state: "withheld" })).toBe("محجوب");
    expect(cellText(undefined)).toBe("غير محدد");
    expect(categoryText(ROWS[2].categories.m)).toBe("معفى");
    expect(categoryText(ROWS[2].categories.t)).toBe("—");
  });
  it("the final's status: complete says nothing; provisional / incomplete / adjusted / draft are written", () => {
    expect(ROWS.map(r => finalStatus(r.final))).toEqual(["", "مؤقتة", "ناقصة · معدَّلة"]);
    expect(finalStatus({ value: null, display: null, status: "draft" })).toBe("المخطط مسودة");
  });
  it("column groups follow the scheme; filters keep the roster order", () => {
    expect(columnGroups(GB(ROWS)).map(g => [g.title, g.weight, g.columns.map(c => c.itemId)])).toEqual([["علامة الشهري", 20, ["i1", "i2"]], ["علامة الفصل 1", 80, ["i3"]]]);
    expect(filterRows(ROWS, "provisional").map(r => r.studentId)).toEqual(["s2"]);
    expect(filterRows(ROWS, "incomplete").map(r => r.studentId)).toEqual(["s3"]);
  });
  it("the export carries the table's words: numbers as numbers, states as text, weights in the headers", () => {
    const t = exportTable(GB(ROWS));
    expect(t.columns).toEqual(["الطالب", "الرقم", "الوظيفة 1 (40%)", "امتحان ورقي (60%)", "علامة الشهري (20%)", "امتحان 1 (100%)", "علامة الفصل 1 (80%)", "العلامة النهائية", "حالة العلامة"]);
    expect(t.rows[0]).toEqual(["سارة", "P-1", 80, 85, 83, 90.3, 90.3, 88.8, "مكتملة"]);
    expect(t.rows[1]).toEqual(["أحمد", "P-2", "بانتظار التصحيح", "0 (قرار)", 0, 70, 70, 56, "مؤقتة"]);
    expect(t.rows[2]).toEqual(["باسل", "P-3", "معفى", "معفى", "معفى", "—", "—", "—", "ناقصة · معدَّلة"]);
  });
});

describe("GB4 — the table", () => {
  it("bands per category with their weight, the items with theirs, a total per category and the final mark", () => {
    render(<GradebookTable gradebook={GB(ROWS)} />);
    const table = screen.getByRole("table");
    const head = within(table).getAllByRole("columnheader").map(h => h.textContent);
    expect(head).toEqual(["الطالب", "علامة الشهري 20%", "علامة الفصل 1 80%", "العلامة النهائية", "الوظيفة 1 40%", "امتحان ورقي 60%", "مجموع القسم", "امتحان 1 100%", "مجموع القسم"]);
    const row = (name: string) => within(table).getByRole("rowheader", { name }).closest("tr")!;
    expect([...row("سارة").querySelectorAll("td")].map(td => td.textContent)).toEqual(["80", "85", "83", "90.3", "90.3", "88.8"]);
    expect([...row("أحمد").querySelectorAll("td")].map(td => td.textContent)).toEqual(["بانتظار التصحيح", "0 (قرار)", "0", "70", "70", "56مؤقتة"]);
    expect([...row("باسل").querySelectorAll("td")].map(td => td.textContent)).toEqual(["معفى", "معفى", "معفى", "—", "—", "—ناقصة · معدَّلة"]);
  });
  it("filters: «ناقصة» and «بانتظار التصحيح» keep only those students, with their counts on the buttons", () => {
    render(<GradebookTable gradebook={GB(ROWS)} />);
    fireEvent.click(screen.getByRole("button", { name: "بانتظار التصحيح (1)" }));
    expect(screen.getAllByRole("rowheader").map(h => h.textContent)).toEqual(["أحمد"]);
    fireEvent.click(screen.getByRole("button", { name: "ناقصة (1)" }));
    expect(screen.getAllByRole("rowheader").map(h => h.textContent)).toEqual(["باسل"]);
    fireEvent.click(screen.getByRole("button", { name: "الكل (3)" }));
    expect(screen.getAllByRole("rowheader")).toHaveLength(3);
  });
  it("an assignment cell opens that student's review (the existing drill target); a manual column is plain text", () => {
    const open = vi.fn();
    render(<GradebookTable gradebook={GB(ROWS)} onOpenAssignment={open} />);
    fireEvent.click(screen.getByRole("button", { name: "بانتظار التصحيح — افتح «الوظيفة 1» للطالب أحمد" }));
    expect(open).toHaveBeenCalledWith({ assignmentId: "a1", mode: "student", studentId: "s2" });
    expect(screen.queryByRole("button", { name: /امتحان ورقي/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "— — افتح «امتحان 1» للطالب باسل" }));
    expect(open).toHaveBeenLastCalledWith({ assignmentId: "a3", mode: "student", studentId: "s3" });
  });
  it("Excel, CSV and print receive the export rows", () => {
    render(<GradebookTable gradebook={GB(ROWS)} />);
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    fireEvent.click(screen.getByRole("button", { name: "CSV" }));
    fireEvent.click(screen.getByRole("button", { name: "طباعة" }));
    const t = exportTable(GB(ROWS));
    expect(vi.mocked(downloadXlsx).mock.calls[0][1]).toEqual([t.columns, ...t.rows]);
    expect(vi.mocked(downloadXlsx).mock.calls[0][2]).toMatchObject({ rtl: true, boldRows: [0] });
    expect(vi.mocked(downloadCsv).mock.calls[0][1]).toEqual([t.columns, ...t.rows]);
    expect(vi.mocked(printReport).mock.calls[0][0]).toMatchObject({ title: "سجل العلامات — العاشر أ", columns: t.columns, rows: t.rows });
  });
  it("a draft scheme says no final mark is computed; no scheme or no students renders nothing / a note", () => {
    render(<GradebookTable gradebook={GB(ROWS.map(r => ({ ...r, final: { value: null, display: null, status: "draft" } })), { schemeStatus: "draft" })} />);
    expect(screen.getByText(/المخطط مسودة: تظهر علامات الأقسام المكتملة/)).toBeTruthy();
    cleanup();
    const { container } = render(<GradebookTable gradebook={GB([], { scheme: null })} />);
    expect(container.innerHTML).toBe("");
    cleanup();
    render(<GradebookTable gradebook={GB([])} />);
    expect(screen.getByText("لا يوجد طلاب في هذا الصف بعد.")).toBeTruthy();
  });
  it("the table scrolls in its own named region (the page never overflows) and explains its states", () => {
    render(<GradebookTable gradebook={GB(ROWS)} />);
    expect(screen.getByRole("region", { name: "جدول علامات العاشر أ" }).querySelector("table")).toBeTruthy();
    expect(screen.getByText("معاني الخانات")).toBeTruthy();
  });
});
