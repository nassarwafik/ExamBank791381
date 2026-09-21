import type { LearningVisualProps } from "../../types";

/**
 * «Access Point — نقطة الوصول» (Book 791381, PDF 165) — the Access Point is a device that connects wireless devices to
 * the network. The page's figure: the AP is cable-connected to a wired Switch, and the devices reach it wirelessly — so
 * the wireless part is ONLY between the devices and the AP, and the rest is an ordinary wired network. Static diagram
 * (no motion): Switch —(wired cable)— AP —(wireless)— devices. Book scope for PDF 165: the AP as a connection point /
 * bridge — it is explicitly NOT the Internet and NOT a router.
 */
const DEVS = [{ x: 296, y: 60 }, { x: 316, y: 104 }, { x: 296, y: 148 }];
export default function AccessPointBridge({ ariaLabel, className }: LearningVisualProps) {
  const SW = { x: 60, y: 104 }, AP = { x: 190, y: 104 };
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 200"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏نقطة الوصول تربط الأجهزة اللاسلكية بالشبكة</text>

      {/* wired Switch */}
      <rect className="eb-visual-switch-box" x={SW.x - 34} y={SW.y - 18} width="68" height="36" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={SW.x} y={SW.y} textAnchor="middle" dominantBaseline="central" fontSize="11">Switch</text>

      {/* wired cable Switch — AP */}
      <g data-leg="wired">
        <line className="eb-visual-link is-strong" x1={SW.x + 34} y1={SW.y} x2={AP.x - 30} y2={AP.y} strokeWidth="4" />
        <text className="eb-visual-meta" x="125" y="96" textAnchor="middle">كابل (سلكي)</text>
      </g>

      {/* the Access Point */}
      <rect className="eb-visual-server" x={AP.x - 30} y={AP.y - 18} width="60" height="36" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={AP.x} y={AP.y} textAnchor="middle" dominantBaseline="central" fontSize="11">AP</text>
      <text className="eb-visual-meta" x={AP.x} y={AP.y - 26} textAnchor="middle">يبثّ Wi-Fi</text>

      {/* wireless AP — devices */}
      <g data-leg="wireless">
        {DEVS.map((d, i) => (
          <line key={i} className="eb-visual-link" x1={AP.x + 30} y1={AP.y} x2={d.x - 20} y2={d.y} strokeDasharray="4 4" />
        ))}
        {DEVS.map((d, i) => (
          <rect key={i} className="eb-visual-node is-target" x={d.x - 20} y={d.y - 12} width="40" height="24" rx="5" />
        ))}
        <text className="eb-visual-meta" x="316" y="176" textAnchor="middle">الأجهزة (لاسلكيًا)</text>
      </g>

      <text className="eb-visual-caption-svg" x="150" y="192" textAnchor="middle">‏اللاسلكي بين الأجهزة و AP فقط · الباقي شبكة سلكية — AP نقطة اتصال بالشبكة لا الإنترنت</text>
    </svg>
  );
}
