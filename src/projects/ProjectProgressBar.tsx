// Generic progress bar. `tone` picks a fill color; for tracks we cycle tones by track index so each
// track has a stable, distinct color without hard-coding track ids.
type Tone = "overall" | "book" | "pt";
const TRACK_TONES: Tone[] = ["book", "pt"];
export function toneForTrackIndex(i: number): Tone { return TRACK_TONES[i % TRACK_TONES.length]; }

type Props = { label?: string; icon?: string; value: number; tone?: Tone };

export default function ProjectProgressBar({ label, icon, value, tone = "overall" }: Props) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="p794-bar">
      {(label || icon) && (
        <div className="p794-bar-head">
          <span>{icon ? icon + " " : ""}{label}</span>
          <strong>{pct}%</strong>
        </div>
      )}
      <div className="p794-bar-track">
        <i className={"p794-bar-fill p794-bar-" + tone} style={{ width: pct + "%" }} />
      </div>
    </div>
  );
}
