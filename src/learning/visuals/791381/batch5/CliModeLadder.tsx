import type { LearningVisualProps } from "../../types";

/**
 * «الدخول إلى وضع البرمجة» (Book 791381, PDF 122) — the mode progression the page prints, by its PROMPT only:
 *   Switch>  --enable-->  Switch#  --configure terminal-->  Switch(config)#   (then `vlan 10` as the example command).
 * The page's "remember" is exactly: > → # → (config)#. It does NOT show Switch(config-vlan)#, so this visual never
 * renders that prompt. Motion is a ONE-SHOT causal chain that genuinely teaches command → prompt change: a prompt
 * becomes active, its command appears, and ONLY THEN the next prompt becomes active — never before its command. It
 * ends in the (config)# state with the `vlan 10` example; it does not restart. Reduced motion ⇒ the full static ladder.
 */
const STEPS = [
  { prompt: "Switch>", note: "وضع المستخدم", cmd: "enable" },
  { prompt: "Switch#", note: "وضع الأوامر المتقدّم", cmd: "configure terminal" },
  { prompt: "Switch(config)#", note: "وضع الإعدادات", cmd: "vlan 10" },
];
const rowY = (i: number) => 40 + i * 58;
export default function CliModeLadder({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 216"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏يتغيّر الرمز مع كل أمر: &gt; ثم # ثم (config)#</text>
      {STEPS.map((s, i) => {
        const y = rowY(i);
        // the prompt becomes ACTIVE: first at 0.2s, each later one only after the PREVIOUS command has appeared
        const activeBegin = i === 0 ? "0.2s" : `cmd${i - 1}.end`;
        return (
          <g key={i} data-step={i}>
            {/* active-state highlight (one-shot, stays once reached) */}
            <rect className="eb-visual-switch-box" x="18" y={y} width="214" height="32" rx="6" opacity={reducedMotion ? 1 : 0.4}>
              {!reducedMotion && <animate id={`active${i}`} attributeName="opacity" begin={activeBegin} dur="0.5s" values="0.4;1" fill="freeze" />}
            </rect>
            <text className="eb-visual-token is-octet" data-prompt={i} x="30" y={y + 16} dominantBaseline="central" direction="ltr" fontSize="13" fill="#fff">{s.prompt}</text>
            <text className="eb-visual-meta" x="248" y={y + 16} dominantBaseline="central">{s.note}</text>
            {/* the command that triggers the NEXT prompt appears AFTER this prompt is active */}
            {i < STEPS.length - 1 && <line className="eb-visual-link is-strong" x1="123" y1={y + 32} x2="123" y2={y + 58} />}
            <g data-cmd={i} opacity={reducedMotion ? 1 : 0}>
              <rect className="eb-visual-octet is-network" x="140" y={y + 38} width="160" height="20" rx="4" />
              <text className="eb-visual-token" x="220" y={y + 48} textAnchor="middle" dominantBaseline="central" direction="ltr" fontSize="11">{s.cmd}</text>
              {!reducedMotion && <animate id={`cmd${i}`} attributeName="opacity" begin={`active${i}.end`} dur="0.7s" values="0;1;1" keyTimes="0;0.5;1" fill="freeze" />}
            </g>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="210" textAnchor="middle">‏كل رمز يصبح فعّالًا فقط بعد أمره — vlan 10 مثال من (config)#</text>
    </svg>
  );
}
