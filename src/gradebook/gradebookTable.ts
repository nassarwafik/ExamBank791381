// Class gradebook GB4 — the table of marks (docs/enterprise-class-gradebook-gb.md §4.6). PURE: what each cell says, the column groups,
// the filters and the export rows. Every value comes from the server (GET /api/class-gradebook); nothing here computes a mark — it only
// writes the server's `display` (one decimal, D6) and states in words, so the table, the Excel file and the print say the same thing.
import type { GbCell, GbCategoryValue, GbColumn, GbFinal, GbGradebook, GbRow } from "./types";

/** The words of every cell state (never colour alone). */
export const CELL_TEXT: Record<GbCell["state"], string> = {
  graded: "",                       // the mark itself
  zero: "0",
  excused: "معفى",
  pending: "بانتظار التصحيح",
  missing: "—",
  missingSource: "مصدر مفقود",
  unclassified: "غير محدد",
  withheld: "محجوب"
};
/** The legend under the table, in the order the states matter to a teacher. */
export const LEGEND: { state: GbCell["state"]; text: string }[] = [
  { state: "pending", text: "بانتظار التصحيح: لا تُحسب حتى تُصحَّح، والعلامة النهائية مؤقتة." },
  { state: "missing", text: "—: لم يُسلِّم بعد. لا تُحسب صفرًا." },
  { state: "zero", text: "0 (قرار): صفر سجّله المعلم." },
  { state: "excused", text: "معفى: يُوزَّع وزنه على باقي عناصر القسم." },
  { state: "missingSource", text: "مصدر مفقود: الواجب لم يعد متاحًا. لا يُحسب صفرًا." }
];

export const FINAL_STATUS_TEXT: Record<GbFinal["status"], string> = {
  complete: "",
  provisional: "مؤقتة",
  incomplete: "ناقصة",
  draft: "المخطط مسودة"
};

const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

/** What one cell shows. */
export function cellText(cell: GbCell | undefined): string {
  if (!cell) return CELL_TEXT.unclassified;
  if (cell.state === "graded") return num(cell.display);
  if (cell.state === "zero") return "0 (قرار)";
  return CELL_TEXT[cell.state];
}
/** A category's total for one student: its value, or «—» when nothing counted (or «معفى» when every item was excused). */
export function categoryText(value: GbCategoryValue | undefined): string {
  if (!value) return CELL_TEXT.unclassified;
  if (value.display !== null && value.display !== undefined) return String(value.display);
  return value.allExcused ? "معفى" : "—";
}
/** The final mark's number (empty when there is none). */
export const finalNumber = (f: GbFinal) => (f.display === null || f.display === undefined ? "—" : String(f.display));
/** The final mark's status in words («مؤقتة», «ناقصة · معدَّلة» …); empty when complete. */
export function finalStatus(f: GbFinal): string {
  const parts = [FINAL_STATUS_TEXT[f.status]].filter(Boolean);
  if (f.adjusted) parts.push("معدَّلة");
  return parts.join(" · ");
}

export type ColumnGroup = { categoryId: string; title: string; weight: number; columns: GbColumn[] };

/** The table's column groups, in the scheme's order: each category with its columns. */
export function columnGroups(gb: GbGradebook): ColumnGroup[] {
  if (!gb.scheme) return [];
  return gb.scheme.categories.map(c => ({ categoryId: c.categoryId, title: c.title, weight: c.weight, columns: gb.columns.filter(col => col.categoryId === c.categoryId) }));
}

export type RowFilter = "all" | "incomplete" | "provisional";
export const FILTER_LABEL: Record<RowFilter, string> = { all: "الكل", incomplete: "ناقصة", provisional: "بانتظار التصحيح" };

/** The rows a filter keeps, in the roster's order (the server's). */
export function filterRows(rows: GbRow[], filter: RowFilter): GbRow[] {
  if (filter === "all") return rows;
  return rows.filter(r => r.final.status === filter);
}
export function filterCounts(rows: GbRow[]): Record<RowFilter, number> {
  return { all: rows.length, incomplete: filterRows(rows, "incomplete").length, provisional: filterRows(rows, "provisional").length };
}

const weightText = (n: number) => String(Math.round(n * 100) / 100) + "%";
const columnTitle = (col: GbColumn) => (col.title || (col.source.kind === "manual" ? col.source.title : "عنصر غير متاح")) + " (" + weightText(col.weight) + ")";

/** The export: one header row then one row per student, the same words as the table. Used by Excel, CSV and print alike. */
export function exportTable(gb: GbGradebook): { columns: string[]; rows: (string | number)[][] } {
  const groups = columnGroups(gb);
  const columns = ["الطالب", "الرقم", ...groups.flatMap(g => [...g.columns.map(columnTitle), g.title + " (" + weightText(g.weight) + ")"]), "العلامة النهائية", "حالة العلامة"];
  const names = new Map(gb.students.map(s => [s.studentId, s]));
  const rows = gb.rows.map(r => {
    const s = names.get(r.studentId);
    const asNumberOrText = (text: string) => (/^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text);
    return [
      s ? s.displayName : r.studentId, s ? s.code : "",
      ...groups.flatMap(g => [...g.columns.map(col => asNumberOrText(cellText(r.cells[col.itemId]))), asNumberOrText(categoryText(r.categories[g.categoryId]))]),
      asNumberOrText(finalNumber(r.final)), finalStatus(r.final) || "مكتملة"
    ];
  });
  return { columns, rows };
}
