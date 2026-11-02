import type { ReactNode } from "react";
import "./console.css";

/**
 * Tadris+ P4-A — DataTable: a real <table> with a caption and column headers (scope="col"); the first column is the row
 * header (scope="row"), so a screen reader names every cell by its row and column. Scrolls horizontally on a narrow screen
 * instead of squeezing. An empty list is one row that says so. Presentation only: the caller formats the cells.
 */
export type DataColumn<Row> = { id: string; header: string; cell: (row: Row) => ReactNode };

export default function DataTable<Row>({ caption, columns, rows, rowKey, emptyText = "لا توجد بيانات." }: { caption: string; columns: DataColumn<Row>[]; rows: Row[]; rowKey: (row: Row) => string; emptyText?: string }) {
  return (
    <div className="eb-table-wrap">
      <table className="eb-table">
        <caption>{caption}</caption>
        <thead>
          <tr>{columns.map(c => <th key={c.id} scope="col">{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td className="eb-table-empty" colSpan={columns.length}>{emptyText}</td></tr>}
          {rows.map(row => (
            <tr key={rowKey(row)}>
              {columns.map((c, i) => (i === 0 ? <th key={c.id} scope="row">{c.cell(row)}</th> : <td key={c.id}>{c.cell(row)}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
