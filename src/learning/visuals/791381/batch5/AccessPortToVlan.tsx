import type { LearningVisualProps } from "../../types";

/**
 * «ربط المنافذ مع VLAN» / «توضيح Access Ports» / «إعداد Untagged / Access» (Book 791381, PDF 131, 132, 138) — an access
 * port belongs to exactly ONE VLAN. The page's exact steps: `interface f0/1` → `switchport mode access` →
 * `switchport access vlan 10`, after which the connected device is inside that VLAN automatically, sending/receiving
 * with NO tag. Motion TEACHES the causal order: the port becomes a member ONLY after the final CLI step — each step
 * lights in turn, then the device joins the VLAN 10 group. Reduced motion ⇒ the member end state shown. The port
 * never carries more than one VLAN.
 */
const STEPS = ["interface f0/1", "switchport mode access", "switchport access vlan 10"];
export default function AccessPortToVlan({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 202"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏المنفذ يصبح عضوًا في VLAN بعد الإعداد</text>
      {/* CLI steps, lit in sequence */}
      {STEPS.map((s, i) => {
        const y = 40 + i * 40;
        return (
          <g key={i} data-step={i}>
            <rect className="eb-visual-seg is-v4" x="14" y={y} width="196" height="30" rx="6" opacity={reducedMotion ? 1 : 0}>
              {!reducedMotion && <animate id={`ap${i}`} attributeName="opacity" begin={i === 0 ? "0.2s" : `ap${i - 1}.end`} dur="0.9s" values="0;1;1" keyTimes="0;0.4;1" fill="freeze" />}
            </rect>
            <text className="eb-visual-token" x="24" y={y + 15} dominantBaseline="central" direction="ltr" fontSize="11" opacity={reducedMotion ? 1 : 0}>{s}
              {!reducedMotion && <animate attributeName="opacity" begin={i === 0 ? "0.2s" : `ap${i - 1}.end`} dur="0.9s" values="0;1;1" keyTimes="0;0.4;1" fill="freeze" />}</text>
          </g>
        );
      })}
      {/* VLAN 10 group on the right; the device joins it after the final step */}
      <g data-vlan="10"><rect className="eb-visual-zone" x="238" y="34" width="128" height="120" rx="12" stroke="var(--eb-primary)" /><text className="eb-visual-zone-label" x="250" y="50" fill="var(--eb-primary-strong)">VLAN 10</text></g>
      <rect className="eb-visual-switch-box" x="276" y="66" width="52" height="26" rx="6" />
      <text className="eb-visual-node-label is-inverse" x="302" y="79" textAnchor="middle" dominantBaseline="central" fontSize="10">Switch f0/1</text>
      {/* the device — grey until assigned, then a VLAN-10 member */}
      <g data-device="1">
        <line className="eb-visual-link is-strong" x1="302" y1="92" x2="302" y2="120" />
        <rect className="eb-visual-node" x="278" y="120" width="48" height="26" rx="5" />
        <text className="eb-visual-node-label" x="302" y="133" textAnchor="middle" dominantBaseline="central" fontSize="11">جهاز</text>
        {/* membership highlight — appears only after the final step and STAYS (one-shot final state, no restart) */}
        <rect data-member="1" className="eb-visual-node is-target" x="278" y="120" width="48" height="26" rx="5" opacity={reducedMotion ? 1 : 0}>
          {!reducedMotion && <animate id="apJoin" attributeName="opacity" begin="ap2.end" dur="0.8s" values="0;1;1" keyTimes="0;0.6;1" fill="freeze" />}
        </rect>
        <text className="eb-visual-node-label" x="302" y="133" textAnchor="middle" dominantBaseline="central" fontSize="11" opacity={reducedMotion ? 1 : 0}>عضو VLAN 10
          {!reducedMotion && <animate attributeName="opacity" begin="ap2.end" dur="0.8s" values="0;1;1" keyTimes="0;0.6;1" fill="freeze" />}</text>
      </g>
      <text className="eb-visual-caption-svg" x="190" y="176" textAnchor="middle">‏Access Port = جهاز واحد في VLAN واحدة، بلا Tag</text>
      <text className="eb-visual-meta" x="190" y="194" textAnchor="middle">‏الجهاز المتصل يدخل VLAN المحدّدة تلقائيًا</text>
    </svg>
  );
}
