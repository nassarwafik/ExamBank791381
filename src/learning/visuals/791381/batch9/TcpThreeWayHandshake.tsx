import type { LearningVisualProps } from "../../types";

/**
 * «مصافحة TCP الثلاثية» (Book 791381, PDF 260) — the exact three-step handshake in causal order: SYN (client → server),
 * then SYN-ACK (server → client), then ACK (client → server), after which reliable data exchange begins. Motion
 * TEACHES the causality: each message begins only after the previous one arrives, so SYN precedes SYN-ACK precedes
 * ACK. ONE-SHOT: the first message begins at a fixed time and each freezes, so it plays once. Reduced motion ⇒ the
 * three labelled steps shown still. Book scope: the three messages and their directions only — no sequence-number
 * fields are drawn.
 */
const CLIENT = { x: 56 }, SERVER = { x: 324 };
// [label, y, outbound?] — outbound = client → server (SYN, ACK); inbound = server → client (SYN-ACK)
const STEPS: [string, number, boolean][] = [
  ["SYN", 72, true],
  ["SYN-ACK", 112, false],
  ["ACK", 152, true],
];
export default function TcpThreeWayHandshake({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 214"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏SYN · SYN-ACK · ACK</text>

      {/* the two actors */}
      <rect className="eb-visual-node is-target" x={CLIENT.x - 30} y="38" width="60" height="28" rx="6" />
      <text className="eb-visual-node-label" x={CLIENT.x} y="52" textAnchor="middle" dominantBaseline="central" fontSize="11">العميل</text>
      <rect className="eb-visual-server" x={SERVER.x - 30} y="38" width="60" height="28" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={SERVER.x} y="52" textAnchor="middle" dominantBaseline="central" fontSize="11">الخادم</text>
      <line className="eb-visual-divider" x1={CLIENT.x} y1="66" x2={CLIENT.x} y2="180" />
      <line className="eb-visual-divider" x1={SERVER.x} y1="66" x2={SERVER.x} y2="180" />

      {/* the three steps */}
      {STEPS.map(([label, y, out], i) => (
        <g key={label} data-step={label}>
          <text className="eb-visual-part-label" x="190" y={y - 6} textAnchor="middle">{i + 1} · {label}</text>
          <line className="eb-visual-link is-faint" x1={CLIENT.x} y1={y} x2={SERVER.x} y2={y} />
          <text className="eb-visual-meta" x="190" y={y + 13} textAnchor="middle">{out ? "العميل ← الخادم" : "الخادم ← العميل"}</text>
        </g>
      ))}

      {/* one message per step, chained causally; one-shot (freeze) */}
      {!reducedMotion && STEPS.map(([label, y, out], i) => (
        <g key={label} className="eb-visual-packet">
          <rect x="-5" y="-5" width="10" height="10" rx="2" />
          <animateMotion id={`hs${i}`} begin={i === 0 ? "0.3s" : `hs${i - 1}.end`} dur="0.9s" fill="freeze"
            path={out ? `M ${CLIENT.x} ${y} L ${SERVER.x} ${y}` : `M ${SERVER.x} ${y} L ${CLIENT.x} ${y}`} />
        </g>
      ))}
      <text className="eb-visual-caption-svg" x="190" y="200" textAnchor="middle">‏بعد ACK يبدأ تبادل البيانات — اتصال TCP موثوق</text>
    </svg>
  );
}
