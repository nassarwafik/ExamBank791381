import type { ReactNode } from "react";

/**
 * StatCard — one KPI tile. Presentation only: the caller passes already-formatted
 * values (the dashboard keeps every number derived from the /api/teacher-analytics
 * payload exactly as before). `primary` marks the four headline tiles; `tone`
 * only changes the accent colour. Phase 21E.2 — an optional decorative `icon` sits in a
 * tinted chip beside the label (aria-hidden: the label stays the tile's text); without it the
 * markup is exactly the pre-21E.2 one.
 */
export type StatCardTone = "neutral" | "attention" | "success" | "danger" | "info";

export type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatCardTone;
  primary?: boolean;
  icon?: ReactNode;
};

export default function StatCard({ label, value, hint, tone = "neutral", primary = false, icon }: StatCardProps) {
  const cls = ["eb-stat-card", "tone-" + tone, primary ? "is-primary" : "", icon ? "has-icon" : ""].filter(Boolean).join(" ");
  const labelEl = <span className="eb-stat-label">{label}</span>;
  return (
    <article className={cls}>
      {icon ? <span className="eb-stat-head"><span className="eb-stat-icon" aria-hidden="true">{icon}</span>{labelEl}</span> : labelEl}
      <strong className="eb-stat-value">{value}</strong>
      {hint !== undefined && hint !== null && hint !== "" && <small className="eb-stat-hint">{hint}</small>}
    </article>
  );
}
