import type { ReactNode } from "react";

/**
 * StatCard — one KPI tile. Presentation only: the caller passes already-formatted
 * values (the dashboard keeps every number derived from the /api/teacher-analytics
 * payload exactly as before). `primary` marks the four headline tiles; `tone`
 * only changes the accent colour.
 */
export type StatCardTone = "neutral" | "attention" | "success" | "danger" | "info";

export type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatCardTone;
  primary?: boolean;
};

export default function StatCard({ label, value, hint, tone = "neutral", primary = false }: StatCardProps) {
  const cls = ["eb-stat-card", "tone-" + tone, primary ? "is-primary" : ""].filter(Boolean).join(" ");
  return (
    <article className={cls}>
      <span className="eb-stat-label">{label}</span>
      <strong className="eb-stat-value">{value}</strong>
      {hint !== undefined && hint !== null && hint !== "" && <small className="eb-stat-hint">{hint}</small>}
    </article>
  );
}
