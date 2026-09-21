import type { LearningVisualProps } from "../../types";

/**
 * «فتح موقع — الرحلة الكاملة» (Book 791381, PDF 261) — the summary's integrative scenario in its EXACT printed order:
 * 1) DNS (UDP 53) to resolve the name, 2) ARP (Broadcast · L2) to find the gateway MAC, 3) the TCP three-way
 * handshake, then 4) HTTP/HTTPS (GET · TLS · 80/443). Motion TEACHES the causal chain: each stage lights up only
 * after the one before it. ONE-SHOT: the first stage begins at a fixed time and each freezes, so it plays once.
 * Reduced motion ⇒ all four stages shown still, in order. Book scope: exactly these four stages in this order.
 */
const STAGES: [string, string][] = [
  ["DNS", "UDP 53"],
  ["ARP", "Broadcast · L2"],
  ["TCP Handshake", "SYN·SYN-ACK·ACK"],
  ["HTTP/HTTPS", "GET · TLS · 80/443"],
];
export default function WebOpeningJourney({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const X0 = 16, CW = 82, GAP = 10, Y = 70, H = 66;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 214"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="24" textAnchor="middle">‏فتح موقع: DNS ثم ARP ثم TCP ثم HTTP</text>

      {/* the baseline the journey runs along */}
      <line className="eb-visual-link is-faint" x1={X0} y1={Y + H + 14} x2={X0 + 4 * CW + 3 * GAP} y2={Y + H + 14} />

      {STAGES.map(([title, note], i) => {
        const x = X0 + i * (CW + GAP);
        return (
          <g key={title} data-stage={title} opacity={reducedMotion ? 1 : 0}>
            {!reducedMotion && <animate id={`j${i}`} attributeName="opacity" from="0" to="1" dur="0.4s"
              begin={i === 0 ? "0.3s" : `j${i - 1}.end`} fill="freeze" />}
            <rect className="eb-visual-zone" x={x} y={Y} width={CW} height={H} rx="7" />
            <text className="eb-visual-part-label" x={x + CW / 2} y={Y - 8} textAnchor="middle">{i + 1}</text>
            <text className="eb-visual-node-label" x={x + CW / 2} y={Y + 24} textAnchor="middle" dominantBaseline="central" fontSize="11" direction="ltr">{title}</text>
            <text className="eb-visual-meta" x={x + CW / 2} y={Y + 48} textAnchor="middle" direction="ltr">{note}</text>
            {/* the connecting step to the next stage */}
            <circle className="eb-visual-dot" cx={x + CW / 2} cy={Y + H + 14} r="4" />
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="200" textAnchor="middle">‏كل خطوة تجيب سؤالًا: العنوان؟ البوابة؟ الخادم مستعدّ؟ الصفحة</text>
    </svg>
  );
}
