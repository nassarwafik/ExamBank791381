/**
 * ProgressRing — a circular percentage meter (UX-7). Semantic progressbar (min 0 / max 100 / now = clamped
 * value) named by its visible label; presentation only — the caller passes the already-computed value.
 * `value === null` renders an explicit "no value yet" figure (role="img") instead of a fake 0%.
 * The fill animates through CSS only (`.eb-ring-fill`), which is disabled under prefers-reduced-motion.
 */
export type ProgressRingProps = {
  value: number | null;
  /** Visible caption, also the accessible name. */
  label: string;
  /** Accessible description of the empty state (value === null). */
  emptyText?: string;
  size?: number;
  tone?: "primary" | "success";
  className?: string;
};

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function clampPercent(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export default function ProgressRing({ value, label, emptyText = "لا توجد قيمة بعد", size = 96, tone = "primary", className }: ProgressRingProps) {
  const empty = value === null || value === undefined;
  const pct = empty ? 0 : clampPercent(value as number);
  const cls = ["eb-ring", "tone-" + tone, empty ? "is-empty" : "", className || ""].filter(Boolean).join(" ");
  const figureProps = empty
    ? { role: "img", "aria-label": label + ": " + emptyText }
    : { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": pct, "aria-valuetext": pct + "%", "aria-label": label };
  return (
    <div className={cls}>
      <div className="eb-ring-figure" style={{ width: size, height: size }} {...figureProps}>
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
          <circle className="eb-ring-track" cx="50" cy="50" r={RADIUS} strokeWidth="10" />
          <circle className="eb-ring-fill" cx="50" cy="50" r={RADIUS} strokeWidth="10" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - pct / 100)} />
        </svg>
        <strong className="eb-ring-value" aria-hidden="true">{empty ? "—" : pct + "%"}</strong>
      </div>
      <span className="eb-ring-label">{label}</span>
    </div>
  );
}
