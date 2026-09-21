import type { LearningVisualProps } from "../../types";

/**
 * «أمر arp» (Book 791381, PDF 97) — ARP associates an IP address with the MAC address of the device that holds it;
 * `arp -a` lists the IP↔MAC pairs a device has learned on its network. Motion TEACHES the association forming: the
 * device asks "who has this IP?", the neighbour answers with its MAC, and the IP↔MAC pair is recorded. Reduced motion
 * ⇒ a still query marker. Addresses are illustrative examples (not captured command output). Values render LTR.
 */
const A = { x: 58, y: 56 };
const B = { x: 322, y: 56 };
const IP = "192.168.1.20";
const MAC = "B4:11:C2:07:9E:31";
export default function ArpAssociation({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const node = (p: { x: number; y: number }, label: string) => (
    <g>
      <rect className="eb-visual-node" x={p.x - 30} y={p.y - 20} width="60" height="40" rx="8" />
      <text className="eb-visual-node-label" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">{label}</text>
    </g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 176"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="24" textAnchor="middle" direction="ltr">arp</text>
      <line className="eb-visual-link is-strong" x1={A.x + 30} y1={A.y - 8} x2={B.x - 30} y2={A.y - 8} />
      <line className="eb-visual-link is-faint" x1={B.x - 30} y1={A.y + 8} x2={A.x + 30} y2={A.y + 8} />
      <text className="eb-visual-part-label" x="190" y={A.y - 16} textAnchor="middle">من له هذا الـ IP؟</text>
      <text className="eb-visual-part-label" x="190" y={A.y + 30} textAnchor="middle">عنوان MAC الخاص بي</text>
      {node(A, "جهازك")}
      {node(B, "الجار")}
      {!reducedMotion ? (
        <>
          <path id="arp-q" className="eb-visual-route" d={`M ${A.x + 30} ${A.y - 8} L ${B.x - 30} ${A.y - 8}`} />
          <g className="eb-visual-packet"><rect x="-6" y="-5" width="12" height="10" rx="2" /><animateMotion dur="1.7s" repeatCount="indefinite"><mpath href="#arp-q" /></animateMotion></g>
          <path id="arp-r" className="eb-visual-route" d={`M ${B.x - 30} ${A.y + 8} L ${A.x + 30} ${A.y + 8}`} />
          <g className="eb-visual-dot is-response"><circle r="5" /><animateMotion dur="1.7s" begin="0.85s" repeatCount="indefinite"><mpath href="#arp-r" /></animateMotion></g>
        </>
      ) : (
        <rect className="eb-visual-packet-static" x={A.x + 40} y={A.y - 13} width="12" height="10" rx="2" />
      )}
      {/* the learned IP ↔ MAC association (what arp -a records) */}
      <rect className="eb-visual-seg is-v4" x="40" y="112" width="300" height="34" rx="8" />
      <text className="eb-visual-token" x="120" y="129" textAnchor="middle" dominantBaseline="central" direction="ltr">{IP}</text>
      <text className="eb-visual-row-label" x="190" y="129" textAnchor="middle" dominantBaseline="central">↔</text>
      <text className="eb-visual-token" x="266" y="129" textAnchor="middle" dominantBaseline="central" direction="ltr">{MAC}</text>
      <text className="eb-visual-caption-svg" x="190" y="166" textAnchor="middle">ARP يربط عنوان IP بعنوان MAC · arp -a يعرض ما تعلّمه الجهاز</text>
    </svg>
  );
}
