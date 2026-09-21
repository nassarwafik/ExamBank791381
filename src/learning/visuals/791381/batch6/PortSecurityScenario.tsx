import type { LearningVisualProps } from "../../types";

/**
 * «سيناريو Port Security» (Book 791381, PDF 181) — the switch port remembers the ALLOWED device(s); the two permitted
 * computers (PC0 and PC1) work, but a stranger device is refused at the port. Static diagram (no motion): the
 * allow/deny outcome is a labelled comparison, complete as a still frame. Book scope for THIS page: the allow-vs-deny
 * idea only — NOT the specific MAC value, the `sticky` option (PDF 183) or the `maximum` count (PDF 184), which are
 * later configuration details.
 */
const ALLOWED = [{ id: "PC0", y: 56 }, { id: "PC1", y: 104 }];
export default function PortSecurityScenario({ ariaLabel, className }: LearningVisualProps) {
  const SW = { x: 250, y: 96 };
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏Port Security — المسموح يعمل، الغريب يُرفض</text>

      {/* the switch port that stores the allowed MAC */}
      <rect className="eb-visual-switch-box" x={SW.x - 34} y={SW.y - 18} width="68" height="36" rx="7" />
      <text className="eb-visual-node-label is-inverse" x={SW.x} y={SW.y} textAnchor="middle" dominantBaseline="central" fontSize="11">Switch</text>
      <text className="eb-visual-meta" x={SW.x} y={SW.y + 34} textAnchor="middle">المنفذ يحفظ MAC المسموح</text>

      {/* the two allowed computers → work */}
      {ALLOWED.map(pc => (
        <g key={pc.id} data-allow="1">
          <line className="eb-visual-link is-strong" x1={SW.x - 34} y1={SW.y} x2="120" y2={pc.y} stroke="var(--eb-success)" />
          <rect className="eb-visual-node is-target" x="60" y={pc.y - 14} width="60" height="28" rx="5" stroke="var(--eb-success)" />
          <text className="eb-visual-node-label" x="90" y={pc.y} textAnchor="middle" dominantBaseline="central" fontSize="11">{pc.id}</text>
          <text className="eb-visual-meta" x="30" y={pc.y + 1} textAnchor="middle" dominantBaseline="central" fill="var(--eb-success)">يعمل</text>
        </g>
      ))}

      {/* the stranger → denied at the port */}
      <g data-deny="1">
        <line className="eb-visual-link" x1={SW.x - 34} y1={SW.y + 12} x2="120" y2="164" stroke="var(--eb-danger)" strokeDasharray="5 4" />
        <rect className="eb-visual-node" x="60" y="150" width="60" height="28" rx="5" stroke="var(--eb-danger)" />
        <text className="eb-visual-node-label" x="90" y="164" textAnchor="middle" dominantBaseline="central" fontSize="10">جهاز غريب</text>
        <text className="eb-visual-meta" x="30" y="165" textAnchor="middle" dominantBaseline="central" fill="var(--eb-danger)">يُرفض</text>
      </g>
      <text className="eb-visual-caption-svg" x="190" y="200" textAnchor="middle">‏المنفذ لا يقبل أي جهاز عشوائي، بل المسموح به فقط</text>
    </svg>
  );
}
