import { useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import SectionHeader from "../ui/SectionHeader";
import SharedEmptyState from "../ui/EmptyState";
import { IconDownload, IconPrint, IconArrowUp, IconArrowDown, IconSort } from "../icons";
import { sortRows, ariaSort, matchesQuery, type SortState, type SortValue } from "./tableTools";
import { useTableSort } from "./useTableSort";

/* Reports Center presentation helpers (UX-6b). State/data stay in ReportsCenter / ReportViews. */

export function LoadingState({ text = "جارٍ تجهيز التقرير..." }: { text?: string }) { return <p className="eb-muted" role="status">{text}</p>; }
export function EmptyState({ text, description }: { text?: string; description?: string }) { return <SharedEmptyState compact title={text || "لا توجد بيانات لعرضها."} description={description} />; }
export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return <div className="platform-error assignment-inline-message" role="alert">{text} {onRetry && <button type="button" className="eb-button is-small" onClick={onRetry}>إعادة المحاولة</button>}</div>;
}

/**
 * ReportHeader — the result's context row: title (h3 under the workspace h2), optional description/hint and the
 * CSV / print actions (marked .eb-report-noprint). Export uses the already-loaded data only — no request.
 */
export function ReportHeader({ title, description, onExportCsv, children }: { title: ReactNode; description?: ReactNode; onExportCsv?: () => void; children?: ReactNode }) {
  return (
    <SectionHeader level={3} className="eb-report-result-head" title={title} description={description}
      actions={<div className="eb-report-actions eb-report-noprint">
        {children}
        {onExportCsv && <button type="button" className="eb-button is-small" onClick={onExportCsv}><IconDownload size={16} />تصدير CSV</button>}
        <button type="button" className="eb-button is-small" onClick={() => window.print()}><IconPrint size={16} />طباعة</button>
      </div>} />
  );
}

/** ReportNote — a short truthful explanation of what a value means (e.g. latest submitted attempt, not a final grade). */
export function ReportNote({ children }: { children: ReactNode }) { return <p className="eb-report-note">{children}</p>; }

/* ---------------- Phase R-5b — interactive tables: sort by a column, find a row, keep the header in view ---------------- */

/** A column header that sorts: a real button inside the <th>, whose `aria-sort` says the current order. The header's text is
 *  the label alone (the arrow is decorative), so a header reads exactly as it did before it could sort. */
export function SortHeader({ label, sortKey, numeric = false, sort, onToggle, title }: { label: string; sortKey: string; numeric?: boolean; sort: SortState; onToggle: (key: string, numeric: boolean) => void; title?: string }) {
  const state = ariaSort(sort, sortKey);
  const Icon = state === "ascending" ? IconArrowUp : state === "descending" ? IconArrowDown : IconSort;
  return (
    <th scope="col" aria-sort={state} title={title} className={"is-sortable" + (state !== "none" ? " is-sorted" : "")}>
      <button type="button" className="eb-report-sort" onClick={() => onToggle(sortKey, numeric)}>{label}<span className="eb-report-sort-icon" aria-hidden="true"><Icon size={14} /></span></button>
    </th>
  );
}

/** The search box above a table, with a live count of the rows shown. Not printed. */
export function TableSearch({ label, value, onChange, shown, total }: { label: string; value: string; onChange: (value: string) => void; shown: number; total: number }) {
  const id = "eb-report-search-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <div className="eb-report-table-tools eb-report-noprint">
      <label className="eb-field-inline" htmlFor={id}>{label}</label>
      <input id={id} type="search" value={value} onChange={e => onChange(e.target.value)} autoComplete="off" />
      {value.trim() !== "" && <span className="eb-muted" role="status">{shown} من {total}</span>}
    </div>
  );
}

type Col<T> = { key: string; label: string; render?: (row: T) => ReactNode; numeric?: boolean; /** R-5b — makes the column sortable; an empty value (null / undefined / "") always sorts last. */ sortValue?: (row: T) => SortValue };
/** Semantic table with a caption, column scope headers and (optionally) the first column as row headers.
 *  Phase R-5b (all optional; without them the markup is exactly the earlier one): a column with `sortValue` sorts on its header;
 *  `search` adds a find-a-row box; `capped` limits the height so the header stays in view while the rows scroll. */
export function ReportTable<T extends Record<string, unknown>>({ columns, rows, caption, empty, rowHeader = true, className, search, capped = false }: { columns: Col<T>[]; rows: T[]; caption: string; empty?: string; rowHeader?: boolean; className?: string; search?: { label: string; text: (row: T) => string }; capped?: boolean }) {
  const { sort, toggle } = useTableSort();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const found = search && query.trim() ? rows.filter(r => matchesQuery(search.text(r), query)) : rows;
    const col = sort ? columns.find(c => c.key === sort.key && c.sortValue) : null;
    return col && sort ? sortRows(found, col.sortValue!, sort.dir) : found;
  }, [rows, columns, search, query, sort]);
  if (!rows.length) return <EmptyState text={empty} />;
  const table = (
    <div className={"eb-report-table-scroll" + (capped ? " is-capped" : "") + (className ? " " + className : "")} role="region" aria-label={caption} tabIndex={0}>
      <table className="eb-report-table">
        <caption className="eb-visually-hidden">{caption}</caption>
        <thead><tr>{columns.map(c => c.sortValue
          ? <SortHeader key={c.key} label={c.label} sortKey={c.key} numeric={c.numeric} sort={sort} onToggle={toggle} />
          : <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>
          {shown.map((row, ri) => (
            <tr key={ri}>{columns.map((c, ci) => {
              const content = c.render ? c.render(row) : String(row[c.key] ?? "—");
              return ci === 0 && rowHeader ? <th key={c.key} scope="row">{content}</th> : <td key={c.key} className={c.numeric ? "is-numeric" : undefined}>{content}</td>;
            })}</tr>
          ))}
          {!shown.length && <tr><td colSpan={columns.length} className="eb-report-table-none">لا نتائج مطابقة للبحث.</td></tr>}
        </tbody>
      </table>
    </div>
  );
  if (!search) return table;
  return <div className="eb-report-table-block"><TableSearch label={search.label} value={query} onChange={setQuery} shown={shown.length} total={rows.length} />{table}</div>;
}
