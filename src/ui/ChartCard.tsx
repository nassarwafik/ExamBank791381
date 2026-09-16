import { useId, useState, type ReactNode } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * ChartCard — presentation wrapper for one chart: a titled card, the chart itself exposed as a named
 * figure (role="img"), and a collapsible tabular equivalent so a canvas is never the only way to read
 * the values. It performs NO data transformation: the caller passes the chart node (or a render function
 * that receives `reducedMotion` so it can switch the chart's animation off) and the already-computed
 * table columns/rows. No dependency on any chart library or on Reports.
 */
export type ChartTable = { columns: string[]; rows: (string | number)[][]; caption?: string };

export type ChartCardProps = {
  title: string;
  description?: ReactNode;
  /** Accessible name of the chart figure; defaults to the title. */
  ariaLabel?: string;
  table: ChartTable;
  /** Label of the disclosure that reveals the table. */
  tableLabel?: string;
  defaultTableOpen?: boolean;
  level?: 2 | 3;
  className?: string;
  /** Extra controls rendered in the card head (e.g. a track selector). */
  actions?: ReactNode;
  children: ReactNode | ((ctx: { reducedMotion: boolean }) => ReactNode);
};

export default function ChartCard({ title, description, ariaLabel, table, tableLabel = "عرض البيانات كجدول", defaultTableOpen = false, level = 3, className, actions, children }: ChartCardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [open, setOpen] = useState(defaultTableOpen);
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = "eb-chart-" + reactId + "-title";
  const tableId = "eb-chart-" + reactId + "-table";
  const Heading = level === 2 ? "h2" : "h3";
  const content = typeof children === "function" ? children({ reducedMotion }) : children;
  return (
    <section className={["eb-chart-card", className || ""].filter(Boolean).join(" ")} aria-labelledby={titleId} data-reduced-motion={reducedMotion ? "true" : "false"}>
      <div className="eb-chart-card-head">
        <div className="eb-chart-card-text">
          <Heading id={titleId} className="eb-chart-card-title">{title}</Heading>
          {description !== undefined && description !== null && description !== "" && <p className="eb-chart-card-description">{description}</p>}
        </div>
        {actions && <div className="eb-chart-card-actions">{actions}</div>}
      </div>
      <div className="eb-chart-card-figure" role="img" aria-label={ariaLabel || title}>{content}</div>
      <div className="eb-chart-card-foot">
        <button type="button" className="eb-button is-quiet is-small" aria-expanded={open} aria-controls={tableId} onClick={() => setOpen(o => !o)}>{tableLabel}</button>
      </div>
      {/* The table is always in the DOM (hidden while collapsed) so print can show it; hidden content is not
          exposed to assistive tech, so the disclosure semantics are unchanged. */}
      <div id={tableId} className="eb-chart-card-table" hidden={!open}>
          <table className="eb-chart-table">
            <caption className="eb-visually-hidden">{table.caption || title}</caption>
            <thead><tr>{table.columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
            <tbody>
              {table.rows.length ? table.rows.map((row, ri) => (
                <tr key={ri}>{row.map((cell, ci) => ci === 0 ? <th key={ci} scope="row">{cell}</th> : <td key={ci}>{cell}</td>)}</tr>
              )) : <tr><td colSpan={Math.max(1, table.columns.length)}>لا توجد بيانات.</td></tr>}
            </tbody>
          </table>
      </div>
    </section>
  );
}
