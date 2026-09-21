import type { LearningVisualProps } from "../../types";

/**
 * «VPN» (Book 791381, PDF 113) — a VPN creates a secure connection over the internet and encrypts the data while it
 * is in transit; it suits remote work and public/untrusted Wi-Fi. Motion TEACHES it: the data travels from the remote
 * device through an ENCRYPTED TUNNEL that crosses the public/untrusted zone and reaches the trusted destination — the
 * packet visibly stays inside the tunnel the whole way across the untrusted area. Reduced motion ⇒ a still packet
 * inside the tunnel. The book says the real IP is only partially hidden, so no claim of complete anonymity is made.
 */
const DEV = { x: 44, y: 82 };
const DST = { x: 336, y: 82 };
export default function VpnTunnel({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 180"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* public / untrusted zone the traffic must cross */}
      <rect data-untrusted="1" className="eb-visual-zone" x="104" y="34" width="172" height="96" rx="12" stroke="var(--eb-danger)" />
      <text className="eb-visual-zone-label" x="190" y="50" textAnchor="middle" fill="var(--eb-danger)">شبكة عامة غير موثوقة</text>
      {/* the encrypted tunnel crossing the untrusted zone */}
      <rect data-tunnel="1" className="eb-visual-seg is-v4" x="70" y="70" width="240" height="26" rx="13" />
      <g transform="translate(190 83)"><rect x="-7" y="-4" width="14" height="11" rx="2" className="eb-visual-router" /><path d="M-4 -4 v-3 a4 4 0 0 1 8 0 v3" fill="none" stroke="var(--eb-primary-strong)" strokeWidth="2" /></g>
      <text className="eb-visual-part-label" x="120" y="112" textAnchor="middle">نفق مشفّر</text>
      {/* endpoints */}
      <rect className="eb-visual-node" x={DEV.x - 24} y={DEV.y - 15} width="48" height="30" rx="6" /><text className="eb-visual-node-label" x={DEV.x} y={DEV.y} textAnchor="middle" dominantBaseline="central">جهازك</text>
      <rect className="eb-visual-node is-target" x={DST.x - 24} y={DST.y - 15} width="48" height="30" rx="6" /><text className="eb-visual-part-label" x={DST.x} y={DST.y + 30} textAnchor="middle">وجهة موثوقة</text>
      <text className="eb-visual-node-label is-inverse" x={DST.x} y={DST.y} textAnchor="middle" dominantBaseline="central" style={{ fill: "var(--eb-text)" }}>خاصّة</text>
      {/* data stays INSIDE the tunnel across the untrusted zone */}
      {!reducedMotion ? (
        <g className="eb-visual-packet"><rect x="-6" y="-5" width="12" height="10" rx="2" /><animateMotion dur="2.6s" repeatCount="indefinite" path="M 74 83 L 306 83" /></g>
      ) : (
        <rect className="eb-visual-packet-static" x="184" y="78" width="12" height="10" rx="2" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="150" textAnchor="middle">VPN ينشئ نفقًا مشفّرًا يعبر الشبكة العامة بأمان</text>
      <text className="eb-visual-meta" x="190" y="166" textAnchor="middle">مفيد للعمل عن بُعد وشبكات Wi-Fi العامة · يخفي عنوانك الحقيقي جزئيًا</text>
    </svg>
  );
}
