import type { LearningVisualProps } from "../../types";

/**
 * «NAT · PAT · APIPA — ثلاثة مفاهيم منفصلة» (Book 791381, PDF 258) — the summary keeps three distinct ideas apart:
 * NAT translates private IPs to a public one, PAT shares ONE public IP across many devices by port (NAT + Ports), and
 * APIPA is NOT a translation mode at all but a self-assigned 169.254.x.x address that signals a DHCP failure. The two
 * translation concepts sit under one heading and APIPA under a separate one, split by a divider, so APIPA is never
 * implied to be a NAT mode. Purely still (no motion). Book scope: exactly the three printed distinctions.
 */
export default function NatPatApipa({ ariaLabel, className }: LearningVisualProps) {
  const panel = (x: number, w: number, key: string, title: string, lines: string[]) => (
    <g data-concept={key}>
      <rect className="eb-visual-zone" x={x} y="64" width={w} height="94" rx="8" />
      <text className="eb-visual-node-label" x={x + w / 2} y="82" textAnchor="middle" dominantBaseline="central" fontSize="12" direction="ltr">{title}</text>
      {lines.map((ln, i) => (
        <text key={i} className="eb-visual-meta" x={x + w / 2} y={104 + i * 16} textAnchor="middle" dominantBaseline="central">{ln}</text>
      ))}
    </g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 214"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏ثلاثة مفاهيم منفصلة</text>

      {/* translation family: NAT + PAT */}
      <g data-family="translation">
        <text className="eb-visual-part-label" x="124" y="50" textAnchor="middle">تحويل للخروج إلى الإنترنت</text>
        {panel(18, 100, "NAT", "NAT", ["تحويل العنوان", "الخاص إلى العام"])}
        {panel(128, 104, "PAT", "PAT", ["عنوان عام واحد", "لعدة أجهزة", "بالمنافذ (Ports)"])}
      </g>

      {/* the divider that keeps APIPA a separate idea */}
      <line className="eb-visual-divider" x1="244" y1="46" x2="244" y2="162" stroke="var(--eb-line-2)" strokeDasharray="4 4" />

      {/* fallback family: APIPA is NOT a NAT mode */}
      <g data-family="fallback">
        <text className="eb-visual-part-label" x="312" y="50" textAnchor="middle">ليس تحويلًا — فشل DHCP</text>
        {panel(258, 104, "APIPA", "APIPA", ["الجهاز يعطي نفسه", "169.254.x.x", "عند فشل DHCP"])}
      </g>

      <text className="eb-visual-caption-svg" x="190" y="190" textAnchor="middle">‏NAT/PAT للخروج بعنوان عام · APIPA إشارة إلى مشكلة في DHCP</text>
    </svg>
  );
}
