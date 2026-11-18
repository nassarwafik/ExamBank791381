import { useMemo, useState } from "react";
import { IconDownload } from "../icons";
import ActionMenu from "../ui/ActionMenu";
import { downloadXlsx } from "../reports/xlsx";
import { downloadCsv } from "../reports/csv";
import { printReport } from "../reports/printReport";
import { exportFilename } from "../teacher/teacherExports";
import type { AssignmentDrillTarget } from "../assignments/drillTarget";
import type { GbCell, GbColumn, GbGradebook } from "./types";
import { type ColumnAction, type Decision, type EntriesDraft, COLUMN_ACTION_LABEL, cellKey, currentEdit, valueText } from "./entriesDraft";
import { CELL_TEXT, LEGEND, FILTER_LABEL, type RowFilter, cellText, categoryText, columnGroups, exportTable, filterCounts, filterRows, finalNumber, finalStatus } from "./gradebookTable";

/**
 * Class gradebook GB4 — the table of marks (docs/enterprise-class-gradebook-gb.md §4.6): the class's students as rows; the scheme's items as
 * columns under a band per category (its title and weight), each category's total after its items, and the final mark last with its
 * status in words. Every number is the server's (one decimal, D6); every state is written, never colour alone. An assignment cell opens
 * that student's review in the assignment page (the existing drill target). Excel, CSV and print carry the same words as the table.
 *
 * GB5 — with `edit`, the table is in «تعديل العلامات»: each cell offers a decision (بلا قرار / معفى / صفر), a manual column a score field
 * (out of its maximum), and each column a menu whose actions touch only the shown students who have nothing (entriesDraft.ts). Unsaved
 * cells are marked in words; a cell changed elsewhere since it was shown keeps the teacher's value and shows the server's.
 */
export type TableEdit = {
  draft: EntriesDraft;
  invalid: Set<string>;
  onDecision: (itemId: string, studentId: string, decision: Decision | null) => void;
  onScore: (itemId: string, studentId: string, text: string) => void;
  onColumnAction: (itemId: string, studentIds: string[], action: ColumnAction) => void;
};
const editableColumn = (gb: GbGradebook, col: GbColumn) => !(col.source.kind === "project" && gb.withheld.includes("projects"));
const columnName = (col: GbColumn) => col.title || (col.source.kind === "manual" ? col.source.title : "عنصر غير متاح");
/** View text with the evidence under a zero decision (the result that arrived after it), so the conflict is visible. */
function viewText(cell: GbCell | undefined): string {
  const t = cellText(cell);
  return cell && cell.state === "zero" && cell.evidence ? t + " · " + (cell.evidence.kind === "final" ? "تسليم " + Math.round(cell.evidence.percent * 10) / 10 : "تسليم بانتظار التصحيح") : t;
}

export default function GradebookTable({ gradebook: gb, onOpenAssignment, edit }: { gradebook: GbGradebook; onOpenAssignment?: (target: AssignmentDrillTarget) => void; edit?: TableEdit }) {
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
                ...g.columns.map(col => (
                  <th key={col.itemId} scope="col">
                    {columnName(col)} <span className="eb-gb-weight-tag">{col.weight}%</span>
                    {edit && editableColumn(gb, col) && (
                      <ActionMenu label={"إجراءات العمود " + columnName(col)}>
                        {(Object.keys(COLUMN_ACTION_LABEL) as ColumnAction[]).map(a => (
                          <button key={a} type="button" className="eb-menu-item" onClick={() => edit.onColumnAction(col.itemId, rows.map(r => r.studentId), a)}>{COLUMN_ACTION_LABEL[a]}</button>
                        ))}
                      </ActionMenu>
                    )}
                  </th>
                )),
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
                      const text = viewText(cell);
                      if (edit && editableColumn(gb, col)) return <EditCell key={col.itemId} gb={gb} col={col} cell={cell} studentId={r.studentId} name={name} edit={edit} />;
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

function EditCell({ gb, col, cell, studentId, name, edit }: { gb: GbGradebook; col: GbColumn; cell: GbCell | undefined; studentId: string; name: string; edit: TableEdit }) {
  const key = cellKey(col.itemId, studentId);
  const e = currentEdit(edit.draft, gb, col.itemId, studentId);
  const dirty = Boolean(edit.draft[key]);
  const invalid = edit.invalid.has(key);
  const manual = col.source.kind === "manual" ? col.source : null;
  const title = columnName(col);
  return (
    <td className={"eb-gb-cell is-edit" + (dirty ? " is-dirty" : "") + (invalid ? " is-invalid" : "")}>
      {!manual && <span className="eb-gb-edit-now">{cellText(cell)}</span>}
      {manual && (
        <input type="text" inputMode="decimal" className="eb-gb-score-input" value={e.scoreText} disabled={Boolean(e.decision)}
          aria-label={"علامة " + name + " في «" + title + "» (من " + manual.maxScore + ")"} aria-invalid={invalid || undefined}
          onChange={ev => edit.onScore(col.itemId, studentId, ev.target.value)} />
      )}
      <select className="eb-gb-decision" value={e.decision || ""} aria-label={"قرار «" + title + "» للطالب " + name}
        onChange={ev => edit.onDecision(col.itemId, studentId, (ev.target.value || null) as Decision | null)}>
        <option value="">بلا قرار</option>
        <option value="excused">معفى</option>
        <option value="zero">صفر</option>
      </select>
      {invalid && <span className="eb-gb-edit-note is-error">{"العلامة من 0 إلى " + (manual ? manual.maxScore : 0)}</span>}
      {dirty && !invalid && <span className="eb-gb-edit-note">غير محفوظ</span>}
      {e.stale !== undefined && <span className="eb-gb-edit-note is-stale">{"تغيّر في مكان آخر: " + valueText(e.stale, manual ? manual.maxScore : 0)}</span>}
    </td>
  );
}
