import type { LearningVisualProps } from "../../types";

/**
 * «أمر ping» (Book 791381, PDF 93) — ping sends an ICMP echo REQUEST to a destination and waits for an echo REPLY;
 * the round trip measures the reach and the time to arrive (زمن الوصول). The page also notes some destinations do
 * not answer ICMP. Motion TEACHES the round trip: a request packet travels out to the destination, then a reply
 * travels back. Reduced motion ⇒ still packets on each leg. No fabricated command output — only the concept.
 */
const A = { x: 60, y: 74 };
const B = { x: 320, y: 74 };
export default function PingEcho({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const node = (p: { x: number; y: number }, label: string) => (
    <g>
      <rect className="eb-visual-node" x={p.x - 30} y={p.y - 20} width="60" height="40" rx="8" />
      <text className="eb-visual-node-label" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" direction="ltr">{label}</text>
    </g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 156"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="24" textAnchor="middle" direction="ltr">ping</text>
      {/* request leg (top) and reply leg (bottom) */}
      <line className="eb-visual-link is-strong" x1={A.x + 30} y1={A.y - 10} x2={B.x - 30} y2={A.y - 10} />
      <line className="eb-visual-link is-faint" x1={B.x - 30} y1={A.y + 10} x2={A.x + 30} y2={A.y + 10} />
      <text className="eb-visual-part-label" x="190" y={A.y - 18} textAnchor="middle">طلب Echo (ICMP)</text>
      <text className="eb-visual-part-label" x="190" y={A.y + 34} textAnchor="middle">رد Echo</text>
      {node(A, "جهازك")}
      {node(B, "الوجهة")}
      {!reducedMotion ? (
        // Sequenced round trip: the request travels the FULL leg first; the reply begins only when the request
        // animation ENDS (pingReq.end), i.e. after it reaches the destination; the next request waits for the reply
        // to end (pingRep.end). No overlap, so the student sees REQUEST → ARRIVAL → REPLY, repeating coherently.
        <>
          <path id="pe-req" className="eb-visual-route" d={`M ${A.x + 30} ${A.y - 10} L ${B.x - 30} ${A.y - 10}`} />
          <g data-mt="request" className="eb-visual-packet"><rect x="-6" y="-5" width="12" height="10" rx="2" /><animateMotion id="pingReq" begin="0s;pingRep.end" dur="1.4s"><mpath href="#pe-req" /></animateMotion></g>
          <path id="pe-rep" className="eb-visual-route" d={`M ${B.x - 30} ${A.y + 10} L ${A.x + 30} ${A.y + 10}`} />
          <g data-mt="reply" className="eb-visual-dot is-response"><circle r="5" /><animateMotion id="pingRep" begin="pingReq.end" dur="1.4s"><mpath href="#pe-rep" /></animateMotion></g>
        </>
      ) : (
        <>
          <rect className="eb-visual-packet-static" x={A.x + 40} y={A.y - 15} width="12" height="10" rx="2" />
          <circle className="eb-visual-dot is-response" cx={B.x - 40} cy={A.y + 10} r="5" />
        </>
      )}
      <text className="eb-visual-caption-svg" x="190" y="148" textAnchor="middle">طلب ثم رد يقيس الوصول وزمنه · بعض الوجهات لا تردّ على ICMP</text>
    </svg>
  );
}
