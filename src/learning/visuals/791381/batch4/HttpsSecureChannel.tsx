import type { LearningVisualProps } from "../../types";

/**
 * «SSL / TLS و HTTPS» (Book 791381, PDF 114) — SSL/TLS protects the communication between the browser and the server;
 * HTTPS is simply HTTP plus that security layer. The visual shows the browser↔server exchange crossing a protected
 * (locked/encrypted) channel, and the conceptual equation HTTP + security = HTTPS. Motion TEACHES it: the request
 * crosses the secure channel from browser to server. Reduced motion ⇒ a still packet in the channel. No TLS handshake,
 * certificate, cipher-suite or key detail (not on this page).
 */
const B = { x: 58, y: 60 };
const S = { x: 322, y: 60 };
export default function HttpsSecureChannel({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const chip = (x: number, w: number, label: string, cls: string) => (
    <g><rect className={"eb-visual-seg " + cls} x={x} y="118" width={w} height="28" rx="7" /><text className="eb-visual-token" x={x + w / 2} y="132" textAnchor="middle" dominantBaseline="central" direction="ltr">{label}</text></g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 172"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* secure channel */}
      <rect data-secure="1" className="eb-visual-seg is-v4" x="96" y="44" width="188" height="32" rx="16" />
      <text className="eb-visual-part-label" x="190" y="36" textAnchor="middle">قناة محميّة (SSL/TLS)</text>
      <g transform="translate(190 60)"><rect x="-8" y="-4" width="16" height="12" rx="2" className="eb-visual-router" /><path d="M-5 -4 v-4 a5 5 0 0 1 10 0 v4" fill="none" stroke="var(--eb-primary-strong)" strokeWidth="2" /></g>
      <rect className="eb-visual-node" x={B.x - 28} y={B.y - 15} width="56" height="30" rx="6" /><text className="eb-visual-node-label" x={B.x} y={B.y} textAnchor="middle" dominantBaseline="central">المتصفّح</text>
      <rect className="eb-visual-node is-target" x={S.x - 28} y={S.y - 15} width="56" height="30" rx="6" /><text className="eb-visual-node-label" x={S.x} y={S.y} textAnchor="middle" dominantBaseline="central">الخادم</text>
      {!reducedMotion ? (
        <g className="eb-visual-packet"><rect x="-6" y="-5" width="12" height="10" rx="2" /><animateMotion dur="2.4s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear" path={`M ${B.x + 28} ${B.y} L ${S.x - 28} ${S.y}`} /></g>
      ) : (
        <rect className="eb-visual-packet-static" x="184" y="55" width="12" height="10" rx="2" />
      )}
      {/* the conceptual equation HTTP + security = HTTPS */}
      {chip(40, 74, "HTTP", "is-v6")}
      <text className="eb-visual-row-label" x="126" y="132" textAnchor="middle" dominantBaseline="central">+</text>
      {chip(138, 84, "SSL/TLS", "is-v4")}
      <text className="eb-visual-row-label" x="236" y="132" textAnchor="middle" dominantBaseline="central">=</text>
      {chip(248, 92, "HTTPS", "is-v4")}
      <text className="eb-visual-caption-svg" x="190" y="164" textAnchor="middle">HTTPS = HTTP مع طبقة أمان تحمي الاتصال بين المتصفّح والخادم</text>
    </svg>
  );
}
