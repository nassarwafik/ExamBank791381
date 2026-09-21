import type { LearningVisualProps } from "../../types";

/**
 * «HDLC و Metro Ethernet» (Book 791381, PDF 209) — the page's two newer site-linking technologies: HDLC is a protocol
 * for connecting devices over WAN lines; Metro Ethernet links multiple sites within a city and is noted for speed,
 * stability and easy expansion (common for connecting branches inside one urban area). Static diagram (no motion): the
 * two labelled cards, complete as a still frame. Uses the page's exact terminology and stays at the book's level.
 * Book scope for THIS page: HDLC (devices over WAN lines) vs Metro Ethernet (multiple sites within a city · speed +
 * stability + easy expansion).
 */
export default function HdlcVsMetro({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 200"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏تقنيات أحدث لربط المواقع</text>

      {/* HDLC */}
      <g data-tech="hdlc">
        <rect className="eb-visual-seg is-v4" x="20" y="40" width="160" height="118" rx="8" />
        <text className="eb-visual-node-label" x="100" y="62" textAnchor="middle" fontSize="12">HDLC</text>
        <text className="eb-visual-meta" x="100" y="92" textAnchor="middle">بروتوكول لربط الأجهزة</text>
        <text className="eb-visual-meta" x="100" y="110" textAnchor="middle">عبر خطوط WAN</text>
      </g>

      {/* Metro Ethernet */}
      <g data-tech="metro-ethernet">
        <rect className="eb-visual-seg is-v6" x="200" y="40" width="160" height="118" rx="8" />
        <text className="eb-visual-node-label" x="280" y="60" textAnchor="middle" fontSize="12">Metro Ethernet</text>
        <text className="eb-visual-meta" x="280" y="80" textAnchor="middle">ربط مواقع متعددة داخل مدينة</text>
        <text className="eb-visual-token" x="280" y="104" textAnchor="middle" fontSize="9">سرعة · استقرار · سهولة توسعة</text>
        <text className="eb-visual-meta" x="280" y="128" textAnchor="middle">شائع لربط الفروع في منطقة حضرية</text>
      </g>

      <text className="eb-visual-caption-svg" x="190" y="186" textAnchor="middle">‏HDLC يربط الأجهزة عبر خطوط WAN · Metro Ethernet يربط مواقع المدينة بسرعة واستقرار وسهولة توسعة</text>
    </svg>
  );
}
