import type { LearningVisualProps } from "../../types";

/**
 * «فكرة SVI و Gateway» (Book 791381, PDF 134) — each VLAN can have its own Gateway: the Default Gateway is the door a
 * device leaves through to reach OTHER networks. The page's exact example value is 192.168.1.254. Without a Gateway a
 * VLAN works internally but cannot reach other networks. Motion TEACHES the exit path: a VLAN device's traffic reaches
 * the Default Gateway and only through it leaves toward other networks (a repeating flow — no cumulative frozen state).
 * Reduced motion ⇒ the static exit path. This page's SVI-command detail (interface vlan 10 / 192.168.10.254) belongs to
 * PDF 133; here the featured address is the Gateway 192.168.1.254.
 */
const GW = { x: 196, y: 96 };
const DEVS = [{ x: 46, y: 62 }, { x: 46, y: 130 }];
export default function SviGateway({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 196"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏Gateway: باب خروج VLAN إلى الشبكات الأخرى</text>
      {/* VLAN devices */}
      <g data-vlan="10"><rect className="eb-visual-zone" x="14" y="36" width="86" height="124" rx="12" stroke="var(--eb-primary)" /><text className="eb-visual-zone-label" x="24" y="52" fill="var(--eb-primary-strong)">VLAN</text></g>
      {DEVS.map((d, i) => (
        <g key={i}><line className="eb-visual-link is-strong" x1={GW.x - 44} y1={GW.y} x2={d.x + 18} y2={d.y} /><rect className="eb-visual-node is-target" x={d.x - 18} y={d.y - 12} width="36" height="24" rx="5" /><text className="eb-visual-node-label" x={d.x} y={d.y} textAnchor="middle" dominantBaseline="central" fontSize="10">جهاز</text></g>
      ))}
      {/* the Default Gateway — the exit door */}
      <g data-gateway="1">
        <rect className="eb-visual-router" x={GW.x - 44} y={GW.y - 22} width="88" height="44" rx="8" />
        <text className="eb-visual-node-label is-inverse" x={GW.x} y={GW.y - 6} textAnchor="middle" dominantBaseline="central" fontSize="11">Default Gateway</text>
        <text className="eb-visual-token" x={GW.x} y={GW.y + 12} textAnchor="middle" dominantBaseline="central" direction="ltr" fontSize="12" fill="#fff">192.168.1.254</text>
      </g>
      {/* exit to other networks */}
      <line className="eb-visual-link" x1={GW.x + 44} y1={GW.y} x2="332" y2={GW.y} strokeDasharray="4 3" />
      <g transform={`translate(348 ${GW.y})`}><path className="eb-visual-cloud" d="M-16 6 a10 10 0 0 1 2 -19 a12 12 0 0 1 22 -2 a9 9 0 0 1 4 21 z" /></g>
      <text className="eb-visual-part-label" x="348" y={GW.y + 26} textAnchor="middle">شبكات أخرى</text>
      {/* motion: device traffic leaves only through the gateway (repeating flow) */}
      {!reducedMotion ? (
        <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" />
          <animateMotion dur="2.6s" repeatCount="indefinite" keyPoints="0;0.5;1" keyTimes="0;0.5;1" calcMode="linear" path={`M ${DEVS[0].x + 18} ${DEVS[0].y} L ${GW.x} ${GW.y} L 332 ${GW.y}`} /></g>
      ) : (
        <rect className="eb-visual-packet-static" x={GW.x + 60} y={GW.y - 5} width="10" height="10" rx="2" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="184" textAnchor="middle">‏بدون Gateway تعمل VLAN داخليًا لكن لا تصل إلى الشبكات الأخرى</text>
    </svg>
  );
}
