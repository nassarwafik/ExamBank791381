import type { LearningVisualProps } from "../../types";

/**
 * «ما هي VLAN؟» / «فكرة VLAN» (Book 791381, PDF 125, 127) — one physical switch is divided LOGICALLY into separate
 * groups; the cables do not change. The book's example: VLAN 10 = الإدارة, VLAN 20 = المحاسبة. Devices in the same
 * VLAN talk easily; each VLAN behaves like its own network. Motion TEACHES the separation: traffic stays INSIDE its
 * VLAN group (VLAN 10 traffic never reaches VLAN 20 and vice-versa), even though both connect to the same switch.
 * Reduced motion ⇒ the two groups shown statically. No inter-VLAN routing here (Router-on-a-Stick is later).
 */
const SW = { x: 190, y: 110 };
const V10 = [{ x: 58, y: 58 }, { x: 58, y: 162 }];
const V20 = [{ x: 322, y: 58 }, { x: 322, y: 162 }];
export default function VlanSegmentation({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const dev = (p: { x: number; y: number }, cls: string, k: number) => (
    <g key={k}><line className="eb-visual-link is-strong" x1={SW.x} y1={SW.y} x2={p.x} y2={p.y} /><rect className={"eb-visual-node " + cls} x={p.x - 20} y={p.y - 13} width="40" height="26" rx="5" /></g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏سويتش واحد — تقسيم منطقي، الكابلات لم تتغيّر</text>
      {/* two logical groups on one physical switch */}
      <g data-vlan="10"><rect className="eb-visual-zone" x="14" y="34" width="128" height="150" rx="12" stroke="var(--eb-primary)" /><text className="eb-visual-zone-label" x="26" y="50" fill="var(--eb-primary-strong)">VLAN 10 · الإدارة</text></g>
      <g data-vlan="20"><rect className="eb-visual-zone" x="238" y="34" width="128" height="150" rx="12" stroke="var(--eb-success)" /><text className="eb-visual-zone-label" x="250" y="50" fill="var(--eb-success)">VLAN 20 · المحاسبة</text></g>
      {V10.map((p, i) => dev(p, "is-target", i))}
      {V20.map((p, i) => dev(p, "", i))}
      <rect className="eb-visual-switch-box" x={SW.x - 26} y={SW.y - 15} width="52" height="30" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={SW.x} y={SW.y} textAnchor="middle" dominantBaseline="central">Switch</text>
      {/* traffic stays inside each VLAN (never crosses between the two groups) */}
      {!reducedMotion ? (
        <>
          <g data-flow="10" className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" /><animateMotion dur="2.6s" repeatCount="indefinite" keyPoints="0;0.5;1" keyTimes="0;0.5;1" calcMode="linear" path={`M ${V10[0].x} ${V10[0].y} L ${SW.x} ${SW.y} L ${V10[1].x} ${V10[1].y}`} /></g>
          <g data-flow="20" className="eb-visual-dot is-response"><circle r="5" /><animateMotion dur="2.6s" repeatCount="indefinite" keyPoints="0;0.5;1" keyTimes="0;0.5;1" calcMode="linear" path={`M ${V20[0].x} ${V20[0].y} L ${SW.x} ${SW.y} L ${V20[1].x} ${V20[1].y}`} /></g>
        </>
      ) : (
        <>
          <rect data-flow="10" className="eb-visual-packet-static" x={(V10[0].x + SW.x) / 2 - 5} y={(V10[0].y + SW.y) / 2 - 5} width="10" height="10" rx="2" />
          <circle data-flow="20" className="eb-visual-dot is-response" cx={(V20[0].x + SW.x) / 2} cy={(V20[0].y + SW.y) / 2} r="5" />
        </>
      )}
      <text className="eb-visual-caption-svg" x="190" y="202" textAnchor="middle">‏كل قسم يصبح كأنه شبكة مستقلة — الحركة تبقى داخل VLAN نفسها</text>
    </svg>
  );
}
