import type { LearningVisualProps } from "../../types";

/**
 * «IPv6 — عنوان الجيل الجديد» (Book 791381, PDF 166) — IPv6 anatomy as THIS page presents it: a 128-bit address (versus
 * IPv4's 32 bits), written in hexadecimal, which gives a vast number of addresses — it came because IPv4 addresses
 * became insufficient. Static diagram (no motion): a short IPv4 32-bit bar against a long IPv6 128-bit bar (four times
 * as many bits), labelled hexadecimal. Book scope for PDF 166 ONLY: the 128-bit length, the IPv4=32 contrast and the
 * hexadecimal notation — this page prints NO example address and NO grouping/hextets, and NO compression / "::"
 * (compression is entirely PDF 167).
 */
export default function Ipv6Anatomy({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 190"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏IPv6 = 128 بت · IPv4 = 32 بت</text>

      {/* IPv4 — 32-bit bar (short) */}
      <g data-proto="ipv4">
        <text className="eb-visual-part-label" x="20" y="56">IPv4</text>
        <rect className="eb-visual-seg" x="64" y="44" width="72" height="26" rx="5" />
        <text className="eb-visual-token" x="100" y="57" textAnchor="middle" dominantBaseline="central" fontSize="11">32 بت</text>
      </g>

      {/* IPv6 — 128-bit bar (four times as long) */}
      <g data-proto="ipv6">
        <text className="eb-visual-part-label" x="20" y="102">IPv6</text>
        <rect className="eb-visual-seg is-v6" x="64" y="90" width="292" height="26" rx="5" />
        <text className="eb-visual-token" x="210" y="103" textAnchor="middle" dominantBaseline="central" fontSize="11">128 بت</text>
      </g>

      <text className="eb-visual-part-label" x="190" y="146" textAnchor="middle">‏يُكتب بالميزان السادس عشر Hexadecimal</text>
      <text className="eb-visual-caption-svg" x="190" y="172" textAnchor="middle">‏طوله 128 بت فيعطي عددًا هائلًا من العناوين — جاء لأن عناوين IPv4 لم تعد كافية</text>
    </svg>
  );
}
