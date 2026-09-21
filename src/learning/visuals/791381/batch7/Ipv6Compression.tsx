import type { LearningVisualProps } from "../../types";

/**
 * «أمثلة اختصار IPv6» (Book 791381, PDF 167) — the page's own compression examples. The rule: consecutive all-zero
 * groups are replaced by "::" used ONCE only in the address, and leading zeros inside a group are dropped. Motion
 * TEACHES the compression: for each of the three book examples the FULL form is shown, then its legal SHORTENED form is
 * revealed beneath it (one after another, each once, then frozen) — a finite one-shot demonstration. Reduced motion ⇒
 * all three full→short pairs shown complete. Book scope: EXACTLY the three example addresses printed on PDF 167, copied
 * character-for-character — no invented address, no normalisation.
 */
const PAIRS = [
  { full: "2001:0db8:0000:0000:0000:ff00:0042:8329", short: "2001:db8::ff00:42:8329" },
  { full: "fe80:0000:0000:0000:0202:b3ff:fe1e:8329", short: "fe80::202:b3ff:fe1e:8329" },
  { full: "2a00:8640:0000:0000:0200:23ff:fe10:8329", short: "2a00:8640::200:23ff:fe10:8329" },
];
export default function Ipv6Compression({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 208"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏اختصار IPv6 — الأصفار المتتالية → :: مرة واحدة</text>
      {PAIRS.map((p, i) => {
        const y = 42 + i * 52;
        return (
          <g key={i}>
            <text className="eb-visual-token" data-full={i} x="190" y={y} textAnchor="middle" direction="ltr" fontSize="8.5" fill="var(--eb-text-secondary)">{p.full}</text>
            <text className="eb-visual-meta" x="190" y={y + 14} textAnchor="middle">↓</text>
            <text className="eb-visual-token" data-short={i} x="190" y={y + 30} textAnchor="middle" direction="ltr" fontSize="10.5" fontWeight="700" opacity={reducedMotion ? 1 : 0}>
              {p.short}
              {!reducedMotion && <animate id={`shortReveal${i}`} attributeName="opacity"
                begin={i === 0 ? "0.5s" : `shortReveal${i - 1}.end`} dur="0.7s" values="0;1" fill="freeze" />}
            </text>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="202" textAnchor="middle">‏تُحذف الأصفار في بداية كل مقطع، والمقاطع الصفرية المتتالية تُستبدل بـ :: مرة واحدة</text>
    </svg>
  );
}
