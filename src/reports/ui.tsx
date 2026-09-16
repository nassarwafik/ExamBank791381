import type { ReactNode } from "react";
import SectionHeader from "../ui/SectionHeader";
import SharedEmptyState from "../ui/EmptyState";
import { IconDownload, IconPrint } from "../icons";

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

type Col<T> = { key: string; label: string; render?: (row: T) => ReactNode; numeric?: boolean };
/** Semantic table with a caption, column scope headers and (optionally) the first column as row headers. */
export function ReportTable<T extends Record<string, unknown>>({ columns, rows, caption, empty, rowHeader = true, className }: { columns: Col<T>[]; rows: T[]; caption: string; empty?: string; rowHeader?: boolean; className?: string }) {
  if (!rows.length) return <EmptyState text={empty} />;
  return (
    <div className={"eb-report-table-scroll" + (className ? " " + className : "")}>
      <table className="eb-report-table">
        <caption className="eb-visually-hidden">{caption}</caption>
        <thead><tr>{columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>{columns.map((c, ci) => {
              const content = c.render ? c.render(row) : String(row[c.key] ?? "—");
              return ci === 0 && rowHeader ? <th key={c.key} scope="row">{content}</th> : <td key={c.key} className={c.numeric ? "is-numeric" : undefined}>{content}</td>;
            })}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
