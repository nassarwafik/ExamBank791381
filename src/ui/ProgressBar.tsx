import { useId } from "react";

/**
 * ProgressBar — a semantic progress meter (role="progressbar", min 0 / max 100 / now = clamped value).
 * Presentation only: the caller passes the already-computed percentage; the bar never derives it.
 * The visible percentage text mirrors what the old project bars showed; `tone` picks the token fill.
 */
export type ProgressTone = "primary" | "series-1" | "series-2" | "series-3" | "series-4" | "success";

export type ProgressBarProps = {
  value: number;
  /** Visible label rendered above the bar and used as the accessible name. */
  label?: string;
  /** Accessible name when no visible label is rendered (or to override it). */
  ariaLabel?: string;
  showValue?: boolean;
  tone?: ProgressTone;
  size?: "md" | "sm";
  className?: string;
};

function clampPercent(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export default function ProgressBar({ value, label, ariaLabel, showValue = true, tone = "primary", size = "md", className }: ProgressBarProps) {
  const pct = clampPercent(value);
  const reactId = useId();
  const labelId = "eb-progress-" + reactId.replace(/[^a-zA-Z0-9_-]/g, "") + "-label";
  const name = ariaLabel || label || "التقدم";
  const cls = ["eb-progress", "size-" + size, className || ""].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      {(label || showValue) && (
        <div className="eb-progress-head">
          {label ? <span id={labelId} className="eb-progress-label">{label}</span> : <span />}
          {showValue && <strong className="eb-progress-value">{pct}%</strong>}
        </div>
      )}
      <div
        className="eb-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={pct + "%"}
        {...(label && !ariaLabel ? { "aria-labelledby": labelId } : { "aria-label": name })}
      >
        <span className={"eb-progress-fill tone-" + tone} style={{ width: pct + "%" }} />
      </div>
    </div>
  );
}
