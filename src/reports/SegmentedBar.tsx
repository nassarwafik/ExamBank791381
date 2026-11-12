import { usePrefersReducedMotion } from "../ui/usePrefersReducedMotion";

/**
 * SegmentedBar (Phase R-5a) — one whole split into a few named parts: a thin bar whose segments are sized by their counts, and a
 * legend that carries every name, count and share as TEXT (the bar itself is decorative, so nothing is read from colour alone).
 * Presentation only: the caller passes counts it already has. Nothing is drawn when the whole is 0.
 */
export type SegmentTone = "success" | "info" | "warn" | "neutral" | "primary";
export type Segment = { key: string; label: string; value: number; tone: SegmentTone };

export default function SegmentedBar({ label, segments, unit }: { label: string; segments: Segment[]; unit?: string }) {
  const reduced = usePrefersReducedMotion();
  const parts = segments.map(s => ({ ...s, value: Number.isFinite(s.value) && s.value > 0 ? s.value : 0 }));
  const total = parts.reduce((n, s) => n + s.value, 0);
  if (!total) return null;
  return (
    <div className="eb-seg" data-motion={reduced ? "off" : "on"}>
      <p className="eb-seg-label">{label}{unit ? <span className="eb-muted"> · {total} {unit}</span> : null}</p>
      <div className="eb-seg-track" aria-hidden="true">
        <div className="eb-seg-bar">
          {parts.filter(s => s.value > 0).map(s => <span key={s.key} className={"eb-seg-part tone-" + s.tone} style={{ flexGrow: s.value }} />)}
        </div>
      </div>
      <ul className="eb-seg-legend" aria-label={label}>
        {parts.map(s => (
          <li key={s.key}><span className={"eb-seg-swatch tone-" + s.tone} aria-hidden="true" />{s.label} <b>{s.value}</b> <span className="eb-muted">({Math.round((s.value / total) * 100)}%)</span></li>
        ))}
      </ul>
    </div>
  );
}
