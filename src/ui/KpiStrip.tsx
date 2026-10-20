import type { ReactNode } from "react";

/**
 * UX-R3 — KpiStrip: the reference's headline numbers — ONE hairline card split into cells by vertical hairlines (stacked on
 * phones), each a muted label, a large tabular value and an optional delta / hint line. A description list (dl → div → dt /
 * dd), so each value is read with its label. Presentation only: values arrive formatted; `trend` only picks the delta tone.
 */
export type KpiItem = { label: string; value: ReactNode; hint?: ReactNode; trend?: "up" | "down" | "flat"; icon?: ReactNode };

export default function KpiStrip({ items, label, className }: { items: KpiItem[]; label?: string; className?: string }) {
  return (
    <dl className={"eb-kpis" + (className ? " " + className : "")} aria-label={label}>
      {items.map(item => (
        <div key={item.label} className="eb-kpi">
          <dt className="eb-kpi-label">{item.icon && <span className="eb-kpi-icon" aria-hidden="true">{item.icon}</span>}{item.label}</dt>
          <dd className="eb-kpi-value">{item.value}</dd>
          {item.hint !== undefined && item.hint !== null && item.hint !== "" && (
            <dd className={"eb-kpi-hint" + (item.trend ? " is-" + item.trend : "")}>{item.hint}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
