import type { LearningVisualProps } from "../../types";

/**
 * «مراحل عمل DHCP» (Book 791381, PDF 170) — the DORA exchange between الجهاز (client) and خادم DHCP (server), in the
 * page's exact order and directions: Discover and Request leave the device (client → server); Offer and ACK come back
 * (server → client). Motion TEACHES the back-and-forth: one message travels per stage, each beginning only after the
 * previous stage ends. ONE-SHOT: the first stage begins at a fixed time (not from the last stage's end) and each
 * message freezes, so the exchange plays once and rests complete. Reduced motion ⇒ the four labelled stages shown
 * statically. Book scope: the four DORA stages and their directions only — no addresses, no pool/commands (PDF 171+).
 */
const CLIENT = { x: 54 }, SERVER = { x: 326 };
// [key, y, outbound?] — outbound = client→server (Discover, Request); inbound = server→client (Offer, ACK)
const STAGES: [string, number, boolean][] = [
  ["Discover", 60, true],
  ["Offer", 96, false],
  ["Request", 132, true],
  ["ACK", 168, false],
];
export default function DhcpDora({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 214"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏DORA: Discover · Offer · Request · ACK</text>

      {/* the two actors */}
      <rect className="eb-visual-node is-target" x={CLIENT.x - 30} y="38" width="60" height="30" rx="6" />
      <text className="eb-visual-node-label" x={CLIENT.x} y="53" textAnchor="middle" dominantBaseline="central" fontSize="11">الجهاز</text>
      <rect className="eb-visual-server" x={SERVER.x - 30} y="38" width="60" height="30" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={SERVER.x} y="53" textAnchor="middle" dominantBaseline="central" fontSize="10">خادم DHCP</text>
      <line className="eb-visual-divider" x1={CLIENT.x} y1="72" x2={CLIENT.x} y2="196" />
      <line className="eb-visual-divider" x1={SERVER.x} y1="72" x2={SERVER.x} y2="196" />

      {/* the four stages, each a labelled lane; the moving message shows its direction */}
      {STAGES.map(([key, y], i) => (
        <g key={key} data-step={key}>
          <text className="eb-visual-part-label" x="190" y={y - 6} textAnchor="middle">{key}</text>
          <line className="eb-visual-link is-faint" x1={CLIENT.x} y1={y} x2={SERVER.x} y2={y} />
          <text className="eb-visual-meta" x="190" y={y + 13} textAnchor="middle">{STAGES[i][2] ? "الجهاز ← الخادم" : "الخادم ← الجهاز"}</text>
        </g>
      ))}

      {/* one message per stage, chained in DORA order; one-shot (freeze) */}
      {!reducedMotion && STAGES.map(([key, y, out], i) => (
        <g key={key} className="eb-visual-packet">
          <rect x="-5" y="-5" width="10" height="10" rx="2" />
          <animateMotion id={`dora${i}`} begin={i === 0 ? "0.3s" : `dora${i - 1}.end`} dur="0.85s" fill="freeze"
            path={out ? `M ${CLIENT.x} ${y} L ${SERVER.x} ${y}` : `M ${SERVER.x} ${y} L ${CLIENT.x} ${y}`} />
        </g>
      ))}
      <text className="eb-visual-caption-svg" x="190" y="206" textAnchor="middle">‏الطلب يبدأ من الجهاز، والخادم يردّ في كل مرّة — بالترتيب DORA</text>
    </svg>
  );
}
