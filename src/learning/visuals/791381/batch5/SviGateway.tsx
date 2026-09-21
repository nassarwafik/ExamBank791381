import type { LearningVisualProps } from "../../types";

/**
 * «الواجهة SVI» / «فكرة SVI و Gateway» (Book 791381, PDF 133–134) — a VLAN can have a logical interface (SVI) that
 * carries an IP address and acts as the gateway (exit door) for that VLAN. The page's exact example:
 * `interface vlan 10` → `ip address 192.168.10.254 255.255.255.0` → `no shutdown`. The SVI is LOGICAL (inside the
 * switch), NOT a physical port. Motion TEACHES the exit path: a VLAN-10 device's traffic reaches the SVI gateway and
 * only through it leaves toward other networks. Reduced motion ⇒ the logical SVI + physical ports shown statically.
 * Physical (solid) vs logical (dashed) is made visually obvious; only source-supported values are used.
 */
const SW = { x: 150, y: 118 };
const DEVS = [{ x: 44, y: 74 }, { x: 44, y: 162 }];
export default function SviGateway({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏SVI: بوابة منطقية لكل VLAN</text>
      {/* physical VLAN-10 devices connected by real cables (solid) */}
      <g data-vlan="10"><rect className="eb-visual-zone" x="14" y="40" width="118" height="150" rx="12" stroke="var(--eb-primary)" /><text className="eb-visual-zone-label" x="24" y="56" fill="var(--eb-primary-strong)">VLAN 10</text></g>
      {DEVS.map((d, i) => (
        <g key={i}><line className="eb-visual-link is-strong" x1={SW.x - 26} y1={SW.y} x2={d.x + 20} y2={d.y} /><rect className="eb-visual-node is-target" x={d.x - 20} y={d.y - 13} width="40" height="26" rx="5" /><text className="eb-visual-node-label" x={d.x} y={d.y} textAnchor="middle" dominantBaseline="central" fontSize="10">جهاز</text></g>
      ))}
      <rect className="eb-visual-switch-box" x={SW.x - 26} y={SW.y - 16} width="52" height="32" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={SW.x} y={SW.y} textAnchor="middle" dominantBaseline="central" fontSize="11">Switch</text>
      {/* logical SVI (dashed) — inside the switch, carries the IP, is the gateway */}
      <g data-svi="1">
        <rect className="eb-visual-node" x={SW.x + 44} y="72" width="150" height="56" rx="8" fill="none" stroke="var(--eb-primary-strong)" strokeWidth="2" strokeDasharray="5 4" />
        <text className="eb-visual-part-label" x={SW.x + 119} y="66" textAnchor="middle">واجهة منطقية (SVI)</text>
        <text className="eb-visual-token" x={SW.x + 119} y="90" textAnchor="middle" dominantBaseline="central" direction="ltr" fontSize="11">interface vlan 10</text>
        <text className="eb-visual-token is-octet" x={SW.x + 119} y="110" textAnchor="middle" dominantBaseline="central" direction="ltr" fontSize="11">192.168.10.254</text>
      </g>
      <text className="eb-visual-meta" x={SW.x + 119} y="140" textAnchor="middle">Gateway — باب الخروج</text>
      {/* exit toward other networks */}
      <line className="eb-visual-link" x1={SW.x + 194} y1="100" x2="360" y2="100" strokeDasharray="4 3" />
      <text className="eb-visual-part-label" x="356" y="120" textAnchor="end">شبكات أخرى</text>
      {/* motion: device traffic reaches the SVI gateway, then exits */}
      {!reducedMotion ? (
        <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" />
          <animateMotion dur="2.4s" repeatCount="indefinite" keyPoints="0;0.5;1" keyTimes="0;0.55;1" calcMode="linear" path={`M ${DEVS[0].x + 20} ${DEVS[0].y} L ${SW.x} ${SW.y} L ${SW.x + 119} 100 L 360 100`} /></g>
      ) : (
        <rect className="eb-visual-packet-static" x={SW.x + 60} y="95" width="10" height="10" rx="2" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="204" textAnchor="middle">‏بدون Gateway تعمل VLAN داخليًا فقط · SVI منطقية لا منفذ فيزيائي</text>
    </svg>
  );
}
