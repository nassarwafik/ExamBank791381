import type { LearningVisualProps } from "../../types";

/**
 * «الشبكة الواسعة WAN» (Book 791381, PDF 207) — scope contrast: a LAN is inside one building and owned by the
 * organization, while a WAN spans large distances (cities, countries, continents) over provider lines, for example
 * linking a branch to the main headquarters. Static diagram (no motion): the two scopes side by side, complete as a
 * still frame. Book scope for THIS page: the LAN-vs-WAN scope idea only — NOT the specific WAN technologies
 * (Frame Relay PDF 208, Metro Ethernet PDF 209).
 */
export default function WanVsLanScope({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 200"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏LAN داخل المبنى · WAN بين المدن</text>

      {/* LAN — one building */}
      <g data-scope="lan">
        <rect className="eb-visual-seg is-v4" x="20" y="40" width="130" height="120" rx="8" />
        <text className="eb-visual-node-label" x="85" y="60" textAnchor="middle" fontSize="12">LAN</text>
        <text className="eb-visual-meta" x="85" y="78" textAnchor="middle">شبكة محلية</text>
        <rect className="eb-visual-node is-target" x="44" y="94" width="82" height="24" rx="5" />
        <text className="eb-visual-node-label" x="85" y="106" textAnchor="middle" dominantBaseline="central" fontSize="10">مبنى واحد</text>
        <text className="eb-visual-meta" x="85" y="138" textAnchor="middle">تملكها المؤسسة</text>
      </g>

      {/* WAN — branch ↔ HQ across distance */}
      <g data-scope="wan">
        <rect className="eb-visual-seg is-v6" x="176" y="40" width="184" height="120" rx="8" />
        <text className="eb-visual-node-label" x="268" y="60" textAnchor="middle" fontSize="12">WAN</text>
        <text className="eb-visual-meta" x="268" y="78" textAnchor="middle">شبكة واسعة — مدن ودول</text>
        <rect className="eb-visual-node is-target" x="192" y="100" width="56" height="24" rx="5" />
        <text className="eb-visual-node-label" x="220" y="112" textAnchor="middle" dominantBaseline="central" fontSize="10">فرع</text>
        <rect className="eb-visual-node is-target" x="288" y="100" width="60" height="24" rx="5" />
        <text className="eb-visual-node-label" x="318" y="112" textAnchor="middle" dominantBaseline="central" fontSize="9.5">المقر الرئيسي</text>
        <line className="eb-visual-link is-strong" x1="248" y1="112" x2="288" y2="112" strokeDasharray="4 4" />
        <text className="eb-visual-meta" x="268" y="140" textAnchor="middle">عبر خطوط مزوّد الخدمة</text>
      </g>
      <text className="eb-visual-caption-svg" x="190" y="186" textAnchor="middle">‏LAN داخل مبنى واحد تملكه المؤسسة · WAN تربط الفروع بالمقر عبر مسافات كبيرة</text>
    </svg>
  );
}
