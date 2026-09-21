import type { LearningVisualProps } from "../../types";

/**
 * «برمجة السويتش — CLI» (Book 791381, PDF 121) — this page teaches ONLY the idea of the CLI: it is the command
 * interface we program the switch from (CLI = Command Line Interface), each command is written on its own line, and we
 * use it to define VLANs, ports, passwords and Trunk. It does NOT yet teach any real Cisco command or prompt (enable /
 * configure terminal / vlan 10 / Switch# / Switch(config)#) — those belong to PDF 122. So this visual stays generic: a
 * terminal with abstract lines appearing one by one (write a line → Enter → next line), each naming a source-supported
 * category, with NO real command syntax. One-shot motion ending in the full list. Reduced motion ⇒ the static terminal.
 */
const LINES = ["تعريف VLAN", "ضبط المنافذ", "كلمات المرور", "إعداد Trunk"];
export default function CliInterface({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 196"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏CLI: واجهة الأوامر التي نبرمج منها السويتش</text>
      {/* a generic terminal window — no real command syntax */}
      <rect className="eb-visual-switch-box" x="24" y="34" width="332" height="118" rx="8" />
      <text className="eb-visual-token is-octet" x="40" y="52" direction="ltr" fill="#fff" fontSize="12">CLI = Command Line Interface</text>
      {LINES.map((l, i) => {
        const y = 74 + i * 20;
        return (
          <g key={i} data-line={i} opacity={reducedMotion ? 1 : 0}>
            <text className="eb-visual-token is-octet" x="42" y={y} direction="ltr" fill="#fff" fontSize="12">›</text>
            <text className="eb-visual-node-label is-inverse" x="60" y={y} dominantBaseline="alphabetic" fontSize="12">{l}</text>
            {/* one command line appears, then the next (one command per line); one-shot, ends with the full list */}
            {!reducedMotion && <animate id={`cliLine${i}`} attributeName="opacity" begin={i === 0 ? "0.2s" : `cliLine${i - 1}.end`} dur="0.7s" values="0;1;1" keyTimes="0;0.5;1" fill="freeze" />}
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="174" textAnchor="middle">‏كل أمر يُكتب في سطر مستقل — نستعملها لـ VLAN والمنافذ وكلمات المرور و Trunk</text>
      <text className="eb-visual-meta" x="190" y="190" textAnchor="middle">‏المهم فهم وظيفة الأمر</text>
    </svg>
  );
}
