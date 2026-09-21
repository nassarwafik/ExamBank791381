import type { LearningVisualProps } from "../../types";

/**
 * «Phishing / Spoofing» (Book 791381, PDF 111) — book-level concepts only. Phishing: a fake-looking message or site
 * deceives the USER into acting. Spoofing: an address/identity is FORGED so it appears to come from a trusted party.
 * Two panels keep it conceptual — no real brands, no realistic malicious links, no credential-harvesting mechanics.
 * Motion: on the Phishing side a fake message reaches the user; on the Spoofing side a message arrives wearing a
 * forged "trusted" identity. Reduced motion ⇒ still packets.
 */
export default function PhishingVsSpoofing({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 190"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* ── Phishing — fake message deceives the user ── */}
      <text className="eb-visual-row-label" x="95" y="22" textAnchor="middle" direction="ltr">Phishing</text>
      <g><rect className="eb-visual-node is-dim" x="18" y="52" width="60" height="40" rx="6" stroke="var(--eb-danger)" /><path className="eb-visual-link" d="M18 56 L48 78 L78 56" fill="none" /><text className="eb-visual-part-label" x="48" y="106" textAnchor="middle">رسالة مزيّفة</text></g>
      <rect className="eb-visual-node is-target" x="122" y="54" width="52" height="36" rx="6" /><text className="eb-visual-node-label" x="148" y="72" textAnchor="middle" dominantBaseline="central">المستخدم</text>
      <line className="eb-visual-link" x1="78" y1="72" x2="122" y2="72" />
      {!reducedMotion ? <g data-phish="1" className="eb-visual-packet"><rect x="-5" y="-4" width="10" height="8" rx="2" /><animateMotion dur="1.8s" repeatCount="indefinite" path="M 78 72 L 122 72" /></g>
        : <rect data-phish="1" className="eb-visual-packet-static" x="95" y="68" width="10" height="8" rx="2" />}
      <text className="eb-visual-part-label" x="95" y="128" textAnchor="middle">تخدع المستخدم ليثق بها</text>

      {/* ── Spoofing — forged trusted identity ── */}
      <text className="eb-visual-row-label" x="285" y="22" textAnchor="middle" direction="ltr">Spoofing</text>
      <rect className="eb-visual-node" x="204" y="54" width="52" height="36" rx="6" /><text className="eb-visual-node-label" x="230" y="72" textAnchor="middle" dominantBaseline="central">مصدر</text>
      {/* forged identity badge over the sender */}
      <g data-forged="1"><rect className="eb-visual-octet is-network" x="196" y="96" width="68" height="22" rx="5" /><text className="eb-visual-part-label" x="230" y="107" textAnchor="middle" dominantBaseline="central">هوية موثوقة (مزيّفة)</text></g>
      <rect className="eb-visual-node is-target" x="322" y="54" width="52" height="36" rx="6" /><text className="eb-visual-node-label" x="348" y="72" textAnchor="middle" dominantBaseline="central">المستقبِل</text>
      <line className="eb-visual-link" x1="256" y1="72" x2="322" y2="72" />
      {!reducedMotion ? <g className="eb-visual-packet"><rect x="-6" y="-5" width="12" height="10" rx="2" /><animateMotion dur="1.8s" repeatCount="indefinite" path="M 256 72 L 322 72" /></g>
        : <rect className="eb-visual-packet-static" x="283" y="67" width="12" height="10" rx="2" />}
      <text className="eb-visual-part-label" x="285" y="140" textAnchor="middle">تزييف الهوية لتبدو من جهة موثوقة</text>
      <text className="eb-visual-caption-svg" x="190" y="182" textAnchor="middle">Phishing يخدع المستخدم · Spoofing يزيّف هوية المصدر</text>
    </svg>
  );
}
