import type { LearningVisualProps } from "../../types";

/**
 * «البروتوكولات ونوع النقل» (Book 791381, PDF 92) — the rule: a protocol whose data must arrive complete rides TCP
 * (reliable), while a short/fast message rides UDP. Two columns sort example protocols; the book's worked pair is
 * highlighted: FTP → TCP (a file must arrive complete) and DHCP → UDP (a short, speed-first message). Motion: the two
 * highlighted chips glow. Reduced motion ⇒ still. Protocol names render LTR.
 */
const TCP = ["HTTP", "HTTPS", "FTP", "SMTP"];
const UDP = ["DHCP", "DNS", "TFTP"];
const HILITE: Record<string, boolean> = { FTP: true, DHCP: true };
export default function ProtocolsByTransport({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const col = (ox: number, head: string, sub: string, list: string[], cls: string) => (
    <g>
      <rect className={"eb-visual-seg " + cls} x={ox} y="20" width="160" height="34" rx="8" />
      <text className="eb-visual-row-label" x={ox + 80} y="33" textAnchor="middle" dominantBaseline="central" direction="ltr">{head}</text>
      <text className="eb-visual-part-label" x={ox + 80} y="47" textAnchor="middle" dominantBaseline="central">{sub}</text>
      {list.map((p, i) => {
        const y = 64 + i * 38, hi = HILITE[p] && !reducedMotion;
        return (
          <g key={p}>
            <rect className={"eb-visual-node" + (HILITE[p] ? " is-target" : "") + (hi ? " eb-visual-glow-anim" : "")} x={ox} y={y} width="160" height="30" rx="6" />
            <text className="eb-visual-token" x={ox + 80} y={y + 15} textAnchor="middle" dominantBaseline="central" direction="ltr">{p}</text>
          </g>
        );
      })}
    </g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 240"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {col(20, "TCP", "موثوق — يصل كاملًا", TCP, "is-v4")}
      {col(200, "UDP", "سريع — رسائل قصيرة", UDP, "is-v6")}
      <text className="eb-visual-caption-svg" x="190" y="232" textAnchor="middle">مثال الكتاب: FTP على TCP (ملف كامل) · DHCP على UDP (رسالة قصيرة سريعة)</text>
    </svg>
  );
}
