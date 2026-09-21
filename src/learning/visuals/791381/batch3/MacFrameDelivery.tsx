import type { LearningVisualProps } from "../../types";

/**
 * «استخدامات MAC Address» (Book 791381, PDF 65) — inside a local network the frame is delivered by MAC address: it
 * is bound to the device's network card, so it stays the same while the IP follows whatever network the device
 * joins. Faithful: a frame carrying «MAC الهدف» leaves PC1, passes the Switch, and is delivered to PC2's card.
 * Motion: the frame travels PC1 → Switch → PC2. Reduced motion ⇒ the frame rests on the PC1 → Switch leg.
 */
const SW = { x: 190, y: 116 };
const P1 = { x: 70, y: 46 };
const P2 = { x: 310, y: 46 };
const ROUTE_D = `M ${P1.x} ${P1.y + 16} L ${SW.x} ${SW.y - 14} L ${P2.x} ${P2.y + 16}`;
export default function MacFrameDelivery({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const pc = (p: { x: number; y: number }, label: string, mac: string, tag: string) => (
    <g>
      <rect className="eb-visual-node" x={p.x - 34} y={p.y - 16} width="68" height="32" rx="6" />
      <text className="eb-visual-node-label" x={p.x} y={p.y - 2} textAnchor="middle" dominantBaseline="central">{label}</text>
      <text className="eb-visual-token" x={p.x} y={p.y + 30} textAnchor="middle" direction="ltr">{mac}</text>
      <text className="eb-visual-part-label" x={p.x} y={p.y + 44} textAnchor="middle">{tag}</text>
    </g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 196"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <line className="eb-visual-link" x1={P1.x} y1={P1.y + 16} x2={SW.x} y2={SW.y - 14} />
      <line className="eb-visual-link" x1={P2.x} y1={P2.y + 16} x2={SW.x} y2={SW.y - 14} />
      <path id="mf-route" className="eb-visual-route" d={ROUTE_D} />
      {pc(P1, "PC1", "A0:…:22", "المرسِل")}
      {pc(P2, "PC2", "B4:…:31", "المستقبِل")}
      {/* switch */}
      <rect className="eb-visual-switch-box" x={SW.x - 34} y={SW.y - 14} width="68" height="30" rx="7" />
      <text className="eb-visual-node-label is-inverse" x={SW.x} y={SW.y + 1} textAnchor="middle" dominantBaseline="central">Switch</text>
      {/* the frame carrying the destination MAC */}
      {!reducedMotion ? (
        <g className="eb-visual-packet"><rect x="-16" y="-9" width="32" height="18" rx="3" /><animateMotion dur="3s" repeatCount="indefinite" rotate="auto"><mpath href="#mf-route" /></animateMotion></g>
      ) : (
        <rect className="eb-visual-packet-static" x={(P1.x + SW.x) / 2 - 16} y={(P1.y + 16 + SW.y - 14) / 2 - 9} width="32" height="18" rx="3" />
      )}
      <text className="eb-visual-part-label" x="190" y="176" textAnchor="middle">الإطار يحمل MAC الهدف = كرت شبكة PC2</text>
      <text className="eb-visual-caption-svg" x="190" y="190" textAnchor="middle">‏MAC مرتبط بكرت الشبكة فيبقى ثابتًا · IP يتبع الشبكة فيتغيّر</text>
    </svg>
  );
}
