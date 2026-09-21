import type { LearningVisualProps } from "../../types";

/**
 * «أنواع الشبكات اللاسلكية» (Book 791381, PDF 161) — the page's OWN four wireless network types, by scope from nearest
 * to widest: PAN / WPAN (very close, personal — phone & Bluetooth headset, Bluetooth / IR), WLAN (a wireless local
 * network — home or school), and WWAN (a wide wireless network — 4G / 5G). Static diagram (no motion): a range scale
 * placing each type by how far it reaches. Book scope for PDF 161 ONLY: exactly these names and examples — there is NO
 * WMAN on this page, and PAN and WPAN both appear for very-near devices; no external classification is substituted.
 */
const TYPES = [
  { name: "PAN", idea: "أجهزة قريبة جدًا", ex: "هاتف وسماعة" },
  { name: "WPAN", idea: "اتصال شخصي", ex: "Bluetooth / IR" },
  { name: "WLAN", idea: "شبكة محلية", ex: "بيت أو مدرسة" },
  { name: "WWAN", idea: "شبكة واسعة", ex: "4G / 5G" },
];
export default function WirelessNetworkTypes({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 200"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏أنواع الشبكات اللاسلكية — حسب المدى</text>
      <text className="eb-visual-part-label" x="24" y="40">أقرب</text>
      <text className="eb-visual-part-label" x="356" y="40" textAnchor="end">أوسع</text>
      {/* range axis */}
      <line className="eb-visual-axis" x1="24" y1="48" x2="356" y2="48" />
      {TYPES.map((t, i) => {
        const x = 30 + i * 86;
        return (
          <g key={t.name} data-wtype={t.name}>
            <rect className="eb-visual-seg is-v4" x={x} y="60" width="76" height="96" rx="8" opacity={0.55 + i * 0.15} />
            <text className="eb-visual-node-label" x={x + 38} y="80" textAnchor="middle" fontSize="13">{t.name}</text>
            <text className="eb-visual-meta" x={x + 38} y="104" textAnchor="middle">{t.idea}</text>
            <text className="eb-visual-token" x={x + 38} y="132" textAnchor="middle" fontSize="9.5">{t.ex}</text>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="180" textAnchor="middle">‏WPAN = بلوتوث · WLAN = بيت · WWAN = خلوي — كلّها لاسلكية (W = Wireless)</text>
    </svg>
  );
}
