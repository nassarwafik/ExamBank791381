import type { ReactNode } from "react";

export function LoadingState() { return <div className="platform-loading">⏳ جارٍ تجهيز التقرير...</div>; }
export function EmptyState({ text }: { text?: string }) { return <div className="platform-empty">{text || "لا توجد بيانات لعرضها."}</div>; }
export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return <div className="platform-error">{text} {onRetry && <button onClick={onRetry}>إعادة المحاولة</button>}</div>;
}

// Wraps a report with a title bar and optional print / CSV actions. Actions carry .report-noprint so
// they disappear when printing.
export function ReportShell({ title, subtitle, onExportCsv, children }: { title: string; subtitle?: string; onExportCsv?: () => void; children: ReactNode }) {
  return (
    <section className="report-shell">
      <header className="report-head">
        <div><span className="platform-eyebrow">تقرير</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <div className="report-actions report-noprint">
          {onExportCsv && <button onClick={onExportCsv}>⬇ CSV</button>}
          <button onClick={() => window.print()}>🖨️ طباعة</button>
        </div>
      </header>
      {children}
    </section>
  );
}

export function ReportKpiGrid({ items }: { items: { label: string; value: ReactNode; hint?: string }[] }) {
  return (
    <div className="report-kpi-grid">
      {items.map((k, i) => (
        <article key={i} className="report-kpi"><strong>{k.value}</strong><span>{k.label}</span>{k.hint && <small>{k.hint}</small>}</article>
      ))}
    </div>
  );
}

type Col<T> = { key: string; label: string; render?: (row: T) => ReactNode };
export function ReportTable<T extends Record<string, unknown>>({ columns, rows, empty }: { columns: Col<T>[]; rows: T[]; empty?: string }) {
  if (!rows.length) return <EmptyState text={empty} />;
  return (
    <div className="report-table-scroll">
      <table className="report-table">
        <thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>{columns.map(c => <td key={c.key}>{c.render ? c.render(row) : String(row[c.key] ?? "—")}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function pct(n: number | null | undefined): string { return n === null || n === undefined ? "—" : Math.round(Number(n)) + "%"; }
