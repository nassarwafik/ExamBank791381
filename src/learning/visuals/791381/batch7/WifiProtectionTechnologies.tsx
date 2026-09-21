import type { LearningVisualProps } from "../../types";

/**
 * «تقنيات حماية Wi-Fi» (Book 791381, PDF 164) — the page's protection technologies, from oldest/weakest to newest/best:
 * WEP (old and weak, not recommended at all — «ضعيف»), WPA (came to improve WEP, uses changing keys — «أفضل من WEP»),
 * and WPA2 / WPA3 (newest and most secure, recommended today — «الأفضل»). The book combines WPA2 / WPA3 into a single
 * "best" tier. Static diagram (no motion): a security ladder rising WEP → WPA → WPA2 / WPA3. Book scope for PDF 164:
 * exactly these four names and their ratings; no key-length or 802.11 detail.
 */
const RUNGS = [
  { tech: "WEP", desc: "قديم وضعيف", rate: "ضعيف", tone: "var(--eb-danger)" },
  { tech: "WPA", desc: "تحسين WEP · مفاتيح تتغيّر", rate: "أفضل من WEP", tone: "var(--eb-info)" },
  { tech: "WPA2 / WPA3", desc: "الأحدث والأكثر أمانًا", rate: "الأفضل", tone: "var(--eb-success)" },
];
export default function WifiProtectionTechnologies({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 200"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏تقنيات حماية Wi-Fi — من الأقدم إلى الأحدث</text>
      {RUNGS.map((r, i) => {
        const y = 40 + i * 46;
        const w = 150 + i * 66;
        return (
          <g key={r.tech} data-tech={r.tech}>
            <rect className="eb-visual-seg" x={20} y={y} width={w} height="36" rx="6" fill={r.tone} opacity="0.18" stroke={r.tone} />
            <text className="eb-visual-node-label" x={32} y={y + 18} dominantBaseline="central" fontSize="12">{r.tech}</text>
            <text className="eb-visual-meta" x={32} y={y + 30} dominantBaseline="central" fontSize="9.5">{r.desc}</text>
            <text className="eb-visual-token" x={20 + w + 8} y={y + 18} dominantBaseline="central" fontSize="10">{r.rate}</text>
          </g>
        );
      })}
      <text className="eb-visual-part-label" x="24" y="196">الأضعف</text>
      <text className="eb-visual-part-label" x="356" y="196" textAnchor="end">الأقوى</text>
      <text className="eb-visual-caption-svg" x="190" y="192" textAnchor="middle">‏WEP ثم WPA ثم WPA2 / WPA3 — كلّما تأخّر زاد الأمان</text>
    </svg>
  );
}
