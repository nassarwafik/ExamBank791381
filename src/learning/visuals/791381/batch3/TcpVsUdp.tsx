import type { LearningVisualProps } from "../../types";

/**
 * «TCP و UDP» (Book 791381, PDF 84) — TCP is reliable: it confirms the data arrived complete and in order (suited to
 * web, mail, files); UDP is fast with no confirmation (suited to live streaming and games). Two panels: TCP sends a
 * packet then receives an acknowledgement back; UDP fires packets one way. Motion shows each flow. Reduced motion ⇒
 * still packets. Protocol names render LTR.
 */
export default function TcpVsUdp({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const panelTop = 40, aY = panelTop + 20, bY = panelTop + 54;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 178"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* TCP panel */}
      <rect className="eb-visual-node" x="8" y="16" width="176" height="120" rx="10" />
      <text className="eb-visual-row-label" x="96" y="12" textAnchor="middle" direction="ltr">TCP</text>
      <circle className="eb-visual-hub" cx="30" cy={aY} r="8" /><circle className="eb-visual-hub" cx="162" cy={aY} r="8" />
      <line className="eb-visual-link is-strong" x1="38" y1={aY} x2="154" y2={aY} />
      <line className="eb-visual-link is-faint" x1="154" y1={bY} x2="38" y2={bY} />
      <text className="eb-visual-part-label" x="96" y={panelTop + 82} textAnchor="middle">إرسال ثم تأكيد الوصول (ACK)</text>
      <text className="eb-visual-meta" x="96" y={panelTop + 96} textAnchor="middle">موثوق ومرتّب · الويب، البريد، الملفات</text>
      {/* UDP panel */}
      <rect className="eb-visual-node" x="196" y="16" width="176" height="120" rx="10" />
      <text className="eb-visual-row-label" x="284" y="12" textAnchor="middle" direction="ltr">UDP</text>
      <circle className="eb-visual-hub" cx="218" cy={aY} r="8" /><circle className="eb-visual-hub" cx="350" cy={aY} r="8" />
      <line className="eb-visual-link is-strong" x1="226" y1={aY} x2="342" y2={aY} />
      <text className="eb-visual-part-label" x="284" y={panelTop + 82} textAnchor="middle">إرسال سريع بلا تأكيد</text>
      <text className="eb-visual-meta" x="284" y={panelTop + 96} textAnchor="middle">سريع · بث مباشر، ألعاب</text>
      {!reducedMotion ? (
        <>
          <path id="tu-tcp" className="eb-visual-route" d={`M 38 ${aY} L 154 ${aY}`} />
          <g className="eb-visual-packet"><rect x="-6" y="-5" width="12" height="10" rx="2" /><animateMotion dur="2.6s" repeatCount="indefinite"><mpath href="#tu-tcp" /></animateMotion></g>
          <path id="tu-ack" className="eb-visual-route" d={`M 154 ${bY} L 38 ${bY}`} />
          <g className="eb-visual-dot is-response"><circle r="5" /><animateMotion dur="2.6s" begin="1.3s" repeatCount="indefinite"><mpath href="#tu-ack" /></animateMotion></g>
          <path id="tu-udp" className="eb-visual-route" d={`M 226 ${aY} L 342 ${aY}`} />
          {[0, 0.6, 1.2].map((b, i) => <g key={i} className="eb-visual-packet"><rect x="-6" y="-5" width="12" height="10" rx="2" /><animateMotion dur="1.8s" begin={`${b}s`} repeatCount="indefinite"><mpath href="#tu-udp" /></animateMotion></g>)}
        </>
      ) : (
        <>
          <rect className="eb-visual-packet-static" x="90" y={aY - 5} width="12" height="10" rx="2" />
          <circle className="eb-visual-dot is-response" cx="96" cy={bY} r="5" />
          <rect className="eb-visual-packet-static" x="278" y={aY - 5} width="12" height="10" rx="2" />
        </>
      )}
      <text className="eb-visual-caption-svg" x="190" y="170" textAnchor="middle">TCP يتأكّد من الوصول الكامل · UDP يسبق بالسرعة</text>
    </svg>
  );
}
