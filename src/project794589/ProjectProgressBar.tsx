type Props = { label?: string; icon?: string; value: number; tone?: "overall" | "book" | "pt" };

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
