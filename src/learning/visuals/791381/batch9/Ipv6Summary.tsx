import type { LearningVisualProps } from "../../types";

/**
 * «العنوان IPv6 — البنية والتصغير» (Book 791381, PDF 244) — the summary page's own three parts: the structure (128 bit
 * = 8 Hextets of 16 bit; a /64 prefix on the left, a 64-bit device part on the right), the exact compression example
 * (full 2001:0DB8:0000:0000:0000:0000:0000:0001 → drop leading zeros 2001:DB8:0:0:0:0:0:1 → :: once 2001:DB8::1),
 * and the special addresses (::1 Loopback, :: no address, FE80::/10 Link-Local, FF00::/8 Multicast, no Broadcast in
 * IPv6). Purely a still summary (no motion). Book scope: exactly the PDF244 information — no external IPv6 rules and
 * no PDF167 example addresses.
 */
const STRUCTURE: [string, string][] = [
  ["الطول الكلّي", "128 bit"],
  ["التقسيم", "8 مجموعات (Hextet = 16 bit)"],
  ["جزء الشبكة (يسار)", "Prefix 64 bit  /64"],
  ["جزء الجهاز (يمين)", "64 bit"],
];
const COMPRESS: [string, string][] = [
  ["الكامل", "2001:0DB8:0000:0000:0000:0000:0000:0001"],
  ["حذف الأصفار البادئة", "2001:DB8:0:0:0:0:0:1"],
  ["الشكل النهائي (:: مرة واحدة)", "2001:DB8::1"],
];
const SPECIAL: [string, string][] = [
  ["::1", "Loopback"],
  ["::", "لا عنوان"],
  ["FE80::/10", "Link-Local"],
  ["FF00::/8", "Multicast"],
];
const X = 16, W = 348;
export default function Ipv6Summary({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 372"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="18" textAnchor="middle">‏IPv6 — البنية والتصغير</text>

      {/* A. structure */}
      <text className="eb-visual-part-label" x="190" y="36" textAnchor="middle">أ · البنية</text>
      {STRUCTURE.map(([k, v], i) => {
        const y = 44 + i * 22;
        return (
          <g key={"s" + i} data-struct={k}>
            <rect className="eb-visual-zone" x={X} y={y} width={W} height="19" rx="4" />
            <text className="eb-visual-part-label" x={X + 100} y={y + 10} dominantBaseline="central" textAnchor="middle">{k}</text>
            <text className="eb-visual-token is-octet" x={X + W - 10} y={y + 10} dominantBaseline="central" textAnchor="end" fontSize="11" direction="ltr">{v}</text>
          </g>
        );
      })}

      {/* B. compression */}
      <text className="eb-visual-part-label" x="190" y="152" textAnchor="middle">ب · التصغير خطوة بخطوة</text>
      {COMPRESS.map(([k, v], i) => {
        const y = 160 + i * 30;
        return (
          <g key={"c" + i} data-compress={v}>
            <rect className="eb-visual-zone" x={X} y={y} width={W} height="26" rx="4" />
            <text className="eb-visual-meta" x={X + 10} y={y + 8} dominantBaseline="central" textAnchor="start">{k}</text>
            <text className="eb-visual-token is-octet" x={X + W / 2} y={y + 19} dominantBaseline="central" textAnchor="middle" fontSize="11" direction="ltr">{v}</text>
          </g>
        );
      })}

      {/* C. special addresses */}
      <text className="eb-visual-part-label" x="190" y="262" textAnchor="middle">ج · عناوين خاصة (لا Broadcast في IPv6)</text>
      {SPECIAL.map(([k, v], i) => {
        const y = 270 + i * 22;
        return (
          <g key={"p" + i} data-special={k}>
            <rect className="eb-visual-zone" x={X} y={y} width={W} height="19" rx="4" />
            <text className="eb-visual-token is-octet" x={X + 10} y={y + 10} dominantBaseline="central" textAnchor="start" fontSize="11" direction="ltr">{k}</text>
            <text className="eb-visual-part-label" x={X + W - 10} y={y + 10} dominantBaseline="central" textAnchor="end" direction="ltr">{v}</text>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="366" textAnchor="middle">‏احذف الأصفار البادئة ثم استبدل أطول سلسلة أصفار بـ :: مرة واحدة</text>
    </svg>
  );
}
