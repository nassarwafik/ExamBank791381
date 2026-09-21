import type { LearningVisualProps } from "../../types";

/**
 * «مصافحة TCP الثلاثية» (Book 791381, PDF 260) — the exact three-step handshake in causal order with the page's
 * conceptual content: SYN (client → server) «طلب اتصال + رقم تسلسل», SYN-ACK (server → client) «موافقة + رقم تسلسل +
 * تأكيد SYN», ACK (client → server) «تأكيد الرد», after which data exchange begins. Motion TEACHES the causality:
 * each message begins only after the previous one arrives, so SYN precedes SYN-ACK precedes ACK. ONE-SHOT: the first
 * message begins at a fixed time and each freezes, so it plays once. Reduced motion ⇒ the three labelled steps shown
 * still. Book scope: the messages, their directions and their conceptual notes — NO invented numeric sequence values.
 */
const CLIENT = { x: 54 }, SERVER = { x: 326 };
// [label, y, outbound?, concept] — outbound = client → server (SYN, ACK); inbound = server → client (SYN-ACK)
const STEPS: [string, number, boolean, string][] = [
  ["SYN", 66, true, "طلب اتصال + رقم تسلسل"],
  ["SYN-ACK", 110, false, "موافقة + رقم تسلسل + تأكيد SYN"],
  ["ACK", 154, true, "تأكيد الرد"],
];
export default function TcpThreeWayHandshake({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 228"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏SYN · SYN-ACK · ACK</text>

      {/* the two actors */}
      <rect className="eb-visual-node is-target" x={CLIENT.x - 30} y="34" width="60" height="26" rx="6" />
      <text className="eb-visual-node-label" x={CLIENT.x} y="47" textAnchor="middle" dominantBaseline="central" fontSize="11">العميل</text>
      <rect className="eb-visual-server" x={SERVER.x - 30} y="34" width="60" height="26" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={SERVER.x} y="47" textAnchor="middle" dominantBaseline="central" fontSize="11">الخادم</text>
      <line className="eb-visual-divider" x1={CLIENT.x} y1="60" x2={CLIENT.x} y2="194" />
      <line className="eb-visual-divider" x1={SERVER.x} y1="60" x2={SERVER.x} y2="194" />

      {/* the three steps, each with its conceptual note (no numeric sequence values) */}
      {STEPS.map(([label, y, out, concept], i) => (
        <g key={label} data-step={label}>
          <text className="eb-visual-part-label" x="190" y={y - 6} textAnchor="middle">{i + 1} · {label} · {out ? "العميل ← الخادم" : "الخادم ← العميل"}</text>
          <line className="eb-visual-link is-faint" x1={CLIENT.x} y1={y} x2={SERVER.x} y2={y} />
          <text className="eb-visual-meta" x="190" y={y + 14} textAnchor="middle">{concept}</text>
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
      <text className="eb-visual-caption-svg" x="190" y="214" textAnchor="middle">‏بعد ACK يبدأ تبادل البيانات — اتصال TCP موثوق</text>
    </svg>
  );
}
