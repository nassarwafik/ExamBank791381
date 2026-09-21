import type { LearningVisualProps } from "../../types";

/**
 * «برمجة السويتش — CLI» / «الدخول إلى وضع البرمجة» (Book 791381, PDF 121–122) — the CLI mode progression, taught by the
 * prompt that changes as each command is entered (the book teaches modes by their PROMPT, not by English EXEC names):
 *   Switch>  --enable-->  Switch#  --configure terminal-->  Switch(config)#  --vlan 10-->  Switch(config-vlan)#
 * Motion TEACHES causality: a command lights up, and ONLY THEN the next prompt becomes active — never before the
 * command. Reduced motion ⇒ the full ladder shown statically. Commands quoted exactly as printed (full
 * `configure terminal`, not the short form). No invented Cisco command semantics.
 */
const STEPS = [
  { prompt: "Switch>", note: "وضع المستخدم", cmd: "enable", cmdNote: "وضع الأوامر المتقدّم" },
  { prompt: "Switch#", note: "وضع الأوامر المتقدّم", cmd: "configure terminal", cmdNote: "وضع الإعدادات" },
  { prompt: "Switch(config)#", note: "وضع الإعدادات", cmd: "vlan 10", cmdNote: "نعرّف VLAN" },
  { prompt: "Switch(config-vlan)#", note: "إعداد VLAN", cmd: null as string | null, cmdNote: null },
];
const rowY = (i: number) => 34 + i * 54;
export default function CliModeLadder({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 250"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏يتغيّر الرمز مع كل أمر: من &gt; إلى # ثم (config)#</text>
      {STEPS.map((s, i) => {
        const y = rowY(i);
        return (
          <g key={i} data-step={i}>
            <rect className="eb-visual-switch-box" x="18" y={y} width="210" height="34" rx="6" />
            <text className="eb-visual-token is-octet" data-prompt={i} x="30" y={y + 17} dominantBaseline="central" direction="ltr" fontSize="13" fill="#fff">{s.prompt}</text>
            <text className="eb-visual-meta" x="246" y={y + 17} dominantBaseline="central">{s.note}</text>
            {/* the command that triggers the NEXT prompt */}
            {s.cmd && (<>
              <line className="eb-visual-link is-strong" x1="123" y1={y + 34} x2="123" y2={y + 54} />
              <rect data-cmd={i} className="eb-visual-octet is-network" x="142" y={y + 38} width="150" height="20" rx="4" opacity={reducedMotion ? 1 : 0}>
                {!reducedMotion && <animate id={`cmd${i}`} attributeName="opacity" begin={i === 0 ? "0s;cmd2.end" : `cmd${i - 1}.end`} dur="1.0s" values="0;1;1" keyTimes="0;0.4;1" fill="freeze" />}
              </rect>
              <text className="eb-visual-token" x="217" y={y + 48} textAnchor="middle" dominantBaseline="central" direction="ltr" fontSize="11" opacity={reducedMotion ? 1 : 0}>
                {s.cmd}
                {!reducedMotion && <animate attributeName="opacity" begin={i === 0 ? "0s;cmd2.end" : `cmd${i - 1}.end`} dur="1.0s" values="0;1;1" keyTimes="0;0.4;1" fill="freeze" />}
              </text>
            </>)}
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="242" textAnchor="middle">‏enable ← configure terminal ← vlan 10 · الرمز يتغيّر بعد كل أمر</text>
    </svg>
  );
}
