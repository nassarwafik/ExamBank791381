import type { LearningVisualProps } from "../../types";

/**
 * «القرصنة والهجمات على الشبكة» (Book 791381, PDF 108) — a purely conceptual map: a network attack may target any of
 * three things the book names — the user, the information/data, or the servers. This is NOT an attack-mechanics
 * diagram (no tools, commands, exploits or malware steps). Motion TEACHES the idea by sequentially sending a marker
 * from the central threat to each of the three possible targets. Reduced motion ⇒ a still frame of the three targets.
 */
const THREAT = { x: 190, y: 96 };
const TARGETS = [
  { x: 190, y: 32, label: "المستخدم" },
  { x: 60, y: 160, label: "المعلومات" },
  { x: 320, y: 160, label: "الخوادم" },
];
export default function AttackTargets({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 200"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {TARGETS.map((t, i) => <line key={i} className="eb-visual-link" x1={THREAT.x} y1={THREAT.y} x2={t.x} y2={t.y} />)}
      {/* central threat indicator (conceptual, not an actor/tool) */}
      <g transform={`translate(${THREAT.x} ${THREAT.y})`}>
        <path className="eb-visual-pin" d="M0 -20 L20 16 L-20 16 Z" />
        <text x="0" y="6" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="700">!</text>
      </g>
      <text className="eb-visual-part-label" x={THREAT.x} y={THREAT.y + 34} textAnchor="middle">تهديد</text>
      {/* three possible target categories */}
      {TARGETS.map((t, i) => (
        <g key={i} data-target="1">
          <rect className="eb-visual-node is-target" x={t.x - 50} y={t.y - 17} width="100" height="34" rx="8" />
          <text className="eb-visual-node-label" x={t.x} y={t.y} textAnchor="middle" dominantBaseline="central">{t.label}</text>
        </g>
      ))}
      {/* a marker reaches each target IN TURN — a bounded CHAIN (target0 → target1 → target2 → repeat), not three
          independent infinite loops that would overlap after the first cycle. Each leg begins on the previous leg's end;
          the first leg restarts only when the last leg ends. This shows the attack MAY target any one of the three. */}
      {!reducedMotion && TARGETS.map((t, i) => (
        <g key={"p" + i} className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" />
          <animateMotion id={`at${i}`} begin={i === 0 ? "0s;at2.end" : `at${i - 1}.end`} dur="0.8s" path={`M ${THREAT.x} ${THREAT.y} L ${t.x} ${t.y}`} />
        </g>
      ))}
      <text className="eb-visual-caption-svg" x="190" y="192" textAnchor="middle">قد يستهدف الهجوم: المستخدم أو المعلومات أو الخوادم</text>
    </svg>
  );
}
