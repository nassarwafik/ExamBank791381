import { useMemo, useState } from "react";
import { IconDownload } from "../icons";
import { downloadXlsx } from "../reports/xlsx";
import { downloadCsv } from "../reports/csv";
import { printReport } from "../reports/printReport";
import { exportFilename } from "../teacher/teacherExports";
import type { AssignmentDrillTarget } from "../assignments/drillTarget";
import type { GbGradebook } from "./types";
import { CELL_TEXT, LEGEND, FILTER_LABEL, type RowFilter, cellText, categoryText, columnGroups, exportTable, filterCounts, filterRows, finalNumber, finalStatus } from "./gradebookTable";

/**
 * Class gradebook GB4 — the table of marks (docs/enterprise-class-gradebook-gb.md §4.6): the class's students as rows; the scheme's items as
 * columns under a band per category (its title and weight), each category's total after its items, and the final mark last with its
 * status in words. Every number is the server's (one decimal, D6); every state is written, never colour alone. An assignment cell opens
 * that student's review in the assignment page (the existing drill target). Excel, CSV and print carry the same words as the table.
 */
export default function GradebookTable({ gradebook: gb, onOpenAssignment }: { gradebook: GbGradebook; onOpenAssignment?: (target: AssignmentDrillTarget) => void }) {
  const [filter, setFilter] = useState<RowFilter>("all");
  const groups = useMemo(() => columnGroups(gb), [gb]);
  const counts = useMemo(() => filterCounts(gb.rows), [gb.rows]);
  const rows = filterRows(gb.rows, filter);
  const names = useMemo(() => new Map(gb.students.map(s => [s.studentId, s])), [gb.students]);
  const exported = () => exportTable(gb);
  const file = exportFilename("TadrisPlus-سجل-العلامات", gb.className);
  const [notice, setNotice] = useState("");

  if (!gb.scheme || !groups.length) return null;
  if (!gb.rows.length) return <p className="eb-muted">لا يوجد طلاب في هذا الصف بعد.</p>;

  return (
    <div className="eb-gb-table-wrap">
      <div className="eb-gb-table-tools">
        <div className="eb-gb-filters" role="group" aria-label="تصفية الطلاب">
          {(Object.keys(FILTER_LABEL) as RowFilter[]).map(f => (
            <button key={f} type="button" className={"eb-button is-small" + (filter === f ? " is-primary" : " is-quiet")} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABEL[f]} ({counts[f]})
            </button>
          ))}
        </div>
        <div className="eb-gb-exports">
          <button type="button" className="eb-button is-small" onClick={() => { const t = exported(); downloadXlsx(file.replace(/\.csv$/, ""), [t.columns, ...t.rows], { sheetName: "سجل العلامات", rtl: true, boldRows: [0] }); }}>
            <IconDownload size={16} aria-hidden="true" />Excel
          </button>
          <button type="button" className="eb-button is-small" onClick={() => { const t = exported(); downloadCsv(file, [t.columns, ...t.rows]); }}>
            <IconDownload size={16} aria-hidden="true" />CSV
          </button>
          <button type="button" className="eb-button is-small" onClick={() => {
            const t = exported();
            const ok = printReport({ title: "سجل العلامات — " + gb.className, meta: [["الطلاب", String(gb.rows.length)], ["حالة المخطط", gb.schemeStatus === "active" ? "مكتمل" : "مسودة"]], columns: t.columns, rows: t.rows, generatedAt: new Date().toLocaleString("ar") });
            if (!ok) setNotice("تعذر فتح نافذة الطباعة في هذا المتصفح.");
          }}>طباعة</button>
        </div>
      </div>
      {notice && <p className="platform-error" role="alert">{notice}</p>}
      {gb.schemeStatus !== "active" && <p className="eb-gb-draft-note" role="status">المخطط مسودة: تظهر علامات الأقسام المكتملة، ولا تُحسب علامة نهائية حتى يصبح مجموع النسب 100.</p>}

      <div className="eb-gb-scroll" tabIndex={0} role="region" aria-label={"جدول علامات " + gb.className}>
        <table className="eb-gb-table">
          <caption className="eb-visually-hidden">{"سجل العلامات — " + gb.className + " (" + rows.length + " من " + gb.rows.length + " طالبًا)"}</caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className="eb-gb-sticky">الطالب</th>
              {groups.map(g => <th key={g.categoryId} scope="colgroup" colSpan={g.columns.length + 1} className="eb-gb-band">{g.title} <span className="eb-gb-weight-tag">{g.weight}%</span></th>)}
              <th scope="col" rowSpan={2} className="eb-gb-final-head">العلامة النهائية</th>
            </tr>
            <tr>
              {groups.flatMap(g => [
                ...g.columns.map(col => <th key={col.itemId} scope="col">{col.title || (col.source.kind === "manual" ? col.source.title : "عنصر غير متاح")} <span className="eb-gb-weight-tag">{col.weight}%</span></th>),
                <th key={g.categoryId + "-total"} scope="col" className="eb-gb-total-head">مجموع القسم</th>
              ])}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const student = names.get(r.studentId);
              const name = student ? student.displayName : r.studentId;
              const status = finalStatus(r.final);
              return (
                <tr key={r.studentId}>
                  <th scope="row" className="eb-gb-sticky">{name}</th>
                  {groups.flatMap(g => [
                    ...g.columns.map(col => {
                      const cell = r.cells[col.itemId];
                      const text = cellText(cell);
                      const canOpen = onOpenAssignment && col.source.kind === "assignment" && cell && cell.state !== "missingSource" && cell.state !== "unclassified";
                      return (
                        <td key={col.itemId} className={"eb-gb-cell is-" + (cell ? cell.state : "unclassified")}>
                          {canOpen && col.source.kind === "assignment"
                            ? <button type="button" className="eb-link-button" aria-label={text + " — افتح «" + (col.title || "الواجب") + "» للطالب " + name} onClick={() => onOpenAssignment!({ assignmentId: (col.source as { assignmentId: string }).assignmentId, mode: "student", studentId: r.studentId })}>{text}</button>
                            : text}
                        </td>
                      );
                    }),
                    <td key={g.categoryId + "-total"} className="eb-gb-cell is-total">{categoryText(r.categories[g.categoryId])}</td>
                  ])}
                  <td className={"eb-gb-cell is-final" + (status ? " is-partial" : "")}>
                    <strong>{finalNumber(r.final)}</strong>{status && <span className="eb-gb-final-status">{status}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="eb-muted" role="status">لا يوجد طلاب في هذا التصنيف.</p>}
      <details className="eb-gb-legend">
        <summary>معاني الخانات</summary>
        <ul>{LEGEND.map(l => <li key={l.state}>{l.text}</li>)}</ul>
        <p className="eb-muted">العلامة «{CELL_TEXT.pending}» أو «—» لا تُحسب، فتكون العلامة النهائية «مؤقتة» أو «ناقصة» حتى تكتمل.</p>
      </details>
    </div>
  );
}
