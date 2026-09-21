import type { LearningVisualProps } from "../../types";

/**
 * «Unicast / Multicast / Broadcast» (Book 791381, PDF 66–67) — the three ways a message is addressed: Unicast to ONE
 * device, Multicast to a chosen GROUP, Broadcast to ALL devices. Each row shows one source (right, RTL) and four
 * devices. THE MOTION TEACHES THE REACH: an animated packet travels to EVERY destination the type reaches —
 * Unicast → its single target; Multicast → each selected member (never a non-member); Broadcast → all four. Reduced
 * motion ⇒ still packets parked at the source; the reached targets are highlighted by fill either way.
 */
const ROWS = [
  { key: "Unicast", ar: "إلى جهاز واحد", hit: [0] },
  { key: "Multicast", ar: "إلى مجموعة محدّدة", hit: [0, 2] },
  { key: "Broadcast", ar: "إلى كل الأجهزة", hit: [0, 1, 2, 3] },
];
const TX = 40;    // leftmost target x
const SX = 330;   // source x (right)
export default function MessageTypes({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 236"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {ROWS.map((r, i) => {
        const y = 30 + i * 66;
        return (
          <g key={r.key} data-row={r.key}>
            <text className="eb-visual-row-label" x={SX} y={y - 14} textAnchor="middle" direction="ltr">{r.key}</text>
            <circle className="eb-visual-hub" cx={SX} cy={y} r="11" />
            {[0, 1, 2, 3].map(t => {
              const tx = TX + t * 58, on = r.hit.includes(t);
              return (
                <g key={t}>
                  <line className={"eb-visual-link" + (on ? " is-strong" : " is-faint")} x1={SX - 11} y1={y} x2={tx} y2={y} />
                  <circle className={"eb-visual-node" + (on ? " is-target" : " is-dim")} cx={tx} cy={y} r="9" />
                </g>
              );
            })}
            <text className="eb-visual-part-label" x={SX} y={y + 26} textAnchor="middle">{r.ar}</text>
            {/* ONE animated packet per REACHED destination (never to a non-member) */}
            {!reducedMotion
              ? r.hit.map(t => (
                  <g key={"p" + t} data-mt="1" className="eb-visual-packet">
                    <rect x="-5" y="-5" width="10" height="10" rx="2" />
                    <animateMotion dur="2.4s" repeatCount="indefinite" path={`M ${SX - 11} ${y} L ${TX + t * 58} ${y}`} />
                  </g>
                ))
              : <rect className="eb-visual-packet-static" x={SX - 28} y={y - 5} width="10" height="10" rx="2" />}
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="226" textAnchor="middle">المصدر (يمين) ومدى الوصول: واحد · مجموعة · الجميع</text>
    </svg>
  );
}
