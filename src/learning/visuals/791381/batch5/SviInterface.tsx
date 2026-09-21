import type { LearningVisualProps } from "../../types";

/**
 * «الواجهة SVI» (Book 791381, PDF 133) — an SVI is a LOGICAL interface inside the switch for a VLAN. The page's exact
 * commands: `interface vlan 10` → `ip address 192.168.10.254 255.255.255.0` → `no shutdown`; it is a virtual interface
 * used to manage the VLAN, especially useful on Layer-3 switches. This page does NOT yet teach the Gateway / exit to
 * other networks (that is PDF 134). Motion TEACHES the physical-vs-logical distinction and builds the SVI one command at
 * a time (one-shot, ending in the complete logical interface). Reduced motion ⇒ the static logical SVI. No Gateway text.
 */
const SW = { x: 132, y: 120 };
const DEVS = [{ x: 42, y: 76 }, { x: 42, y: 164 }];
const CMDS = ["interface vlan 10", "ip address 192.168.10.254 255.255.255.0", "no shutdown"];
export default function SviInterface({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏SVI: واجهة منطقية داخل السويتش لا منفذ فيزيائي</text>
      {/* physical VLAN-10 devices on solid cables (physical side) */}
      <g data-vlan="10"><rect className="eb-visual-zone" x="14" y="40" width="104" height="150" rx="12" stroke="var(--eb-primary)" /><text className="eb-visual-zone-label" x="24" y="56" fill="var(--eb-primary-strong)">VLAN 10 · منافذ فيزيائية</text></g>
      {DEVS.map((d, i) => (
        <g key={i}><line data-physical="1" className="eb-visual-link is-strong" x1={SW.x - 24} y1={SW.y} x2={d.x + 18} y2={d.y} /><rect className="eb-visual-node is-target" x={d.x - 18} y={d.y - 12} width="36" height="24" rx="5" /><text className="eb-visual-node-label" x={d.x} y={d.y} textAnchor="middle" dominantBaseline="central" fontSize="10">جهاز</text></g>
      ))}
      <rect className="eb-visual-switch-box" x={SW.x - 24} y={SW.y - 16} width="48" height="32" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={SW.x} y={SW.y} textAnchor="middle" dominantBaseline="central" fontSize="10">Switch</text>
      {/* the LOGICAL SVI (dashed) built one command at a time */}
      <rect data-svi="1" className="eb-visual-node" x="180" y="56" width="184" height="98" rx="8" fill="none" stroke="var(--eb-primary-strong)" strokeWidth="2" strokeDasharray="5 4" />
      <text className="eb-visual-part-label" x="272" y="50" textAnchor="middle">واجهة افتراضية (SVI)</text>
      {CMDS.map((c, i) => {
        const y = 78 + i * 26;
        return (
          <g key={i} data-cmd={i} opacity={reducedMotion ? 1 : 0}>
            <text className="eb-visual-token" x="190" y={y} direction="ltr" fontSize={i === 1 ? 9 : 11}>{c}</text>
            {!reducedMotion && <animate id={`svi${i}`} attributeName="opacity" begin={i === 0 ? "0.2s" : `svi${i - 1}.end`} dur="0.8s" values="0;1;1" keyTimes="0;0.5;1" fill="freeze" />}
          </g>
        );
      })}
      <text className="eb-visual-meta" x="272" y="150" textAnchor="middle">IP لإدارة VLAN — تفيد سويتشات Layer 3</text>
      <text className="eb-visual-caption-svg" x="190" y="204" textAnchor="middle">‏فيزيائي: منافذ حقيقية · منطقي: interface vlan 10 داخل السويتش</text>
    </svg>
  );
}
