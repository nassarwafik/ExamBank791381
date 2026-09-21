import type { LearningVisualProps } from "../../types";

/**
 * «إنشاء VLAN على السويتش» (Book 791381, PDF 130) — before, the switch does not have the target VLANs; the CLI command
 * `vlan <id>` creates a VLAN and `name <x>` gives it a clear name (the name only eases management). The page's exact
 * example: `vlan 10` → `name MNG`, `vlan 20` → `name GAZ`. Motion TEACHES causality: a VLAN appears in the switch ONLY
 * AFTER its creation command runs — the name does not change how the network works. Reduced motion ⇒ both created
 * VLANs shown. This is conceptual creation, not a general CLI tutorial (the CLI simulator lives elsewhere).
 */
const CMDS = [
  { line1: "Switch(config)# vlan 10", line2: "name MNG", vlan: "VLAN 10", name: "MNG" },
  { line1: "Switch(config)# vlan 20", line2: "name GAZ", vlan: "VLAN 20", name: "GAZ" },
];
export default function CreateVlan({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 196"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏الأمر ينشئ VLAN داخل السويتش</text>
      {/* CLI on the left */}
      {CMDS.map((c, i) => {
        const y = 44 + i * 62;
        return (
          <g key={i} data-cmd={i}>
            <rect className="eb-visual-seg is-v4" x="14" y={y} width="176" height="48" rx="6" opacity={reducedMotion ? 1 : 0}>
              {!reducedMotion && <animate id={`mk${i}`} attributeName="opacity" begin={i === 0 ? "0.2s" : `mk${i - 1}.end`} dur="1.0s" values="0;1;1" keyTimes="0;0.4;1" fill="freeze" />}
            </rect>
            <text className="eb-visual-token" x="24" y={y + 18} direction="ltr" fontSize="11" opacity={reducedMotion ? 1 : 0}>{c.line1}
              {!reducedMotion && <animate attributeName="opacity" begin={i === 0 ? "0.2s" : `mk${i - 1}.end`} dur="1.0s" values="0;1;1" keyTimes="0;0.4;1" fill="freeze" />}</text>
            <text className="eb-visual-token is-octet" x="34" y={y + 36} direction="ltr" fontSize="11" opacity={reducedMotion ? 1 : 0}>Switch(config-vlan)# {c.line2}
              {!reducedMotion && <animate attributeName="opacity" begin={i === 0 ? "0.2s" : `mk${i - 1}.end`} dur="1.0s" values="0;1;1" keyTimes="0;0.4;1" fill="freeze" />}</text>
          </g>
        );
      })}
      {/* switch VLAN database on the right */}
      <rect className="eb-visual-switch-box" x="230" y="40" width="136" height="120" rx="8" />
      <text className="eb-visual-node-label is-inverse" x="298" y="54" textAnchor="middle" fontSize="11">Switch — قائمة VLAN</text>
      {CMDS.map((c, i) => {
        const y = 70 + i * 42;
        return (
          <g key={i} data-created={c.vlan}>
            <rect className="eb-visual-octet is-network" x="244" y={y} width="108" height="32" rx="5" opacity={reducedMotion ? 1 : 0}>
              {!reducedMotion && <animate id={`vl${i}`} attributeName="opacity" begin={`mk${i}.end`} dur="0.8s" values="0;1;1" keyTimes="0;0.5;1" fill="freeze" />}
            </rect>
            <text className="eb-visual-node-label" x="298" y={y + 16} textAnchor="middle" dominantBaseline="central" direction="ltr" fontSize="12" opacity={reducedMotion ? 1 : 0}>{c.vlan} · {c.name}
              {!reducedMotion && <animate attributeName="opacity" begin={`mk${i}.end`} dur="0.8s" values="0;1;1" keyTimes="0;0.5;1" fill="freeze" />}</text>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="184" textAnchor="middle">‏vlan 10 → name MNG · vlan 20 → name GAZ · الاسم للإدارة فقط</text>
    </svg>
  );
}
