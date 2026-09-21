import type { LearningVisualProps } from "../../types";

/**
 * «DMZ — المنطقة العازلة» (Book 791381, PDF 159) — the DMZ is a zone BETWEEN the internal network and the Internet. The
 * page's figure is three zones in order: the Internet (outside) passes through a firewall into the DMZ (public services
 * Web / Mail / DNS), and the internal LAN sits behind a SECOND firewall. A visitor reaches the DMZ only and never
 * enters the internal network. Motion TEACHES that isolation: a visitor travels along the zone row (y=108, inside the
 * zone boxes), visibly crosses the firewall-1 line at x=124, and STOPS INSIDE the DMZ box (one-shot, freezes at x≈190)
 * — it never reaches firewall 2 (x=256) or the internal LAN. Reduced motion ⇒ the three zones with the two firewalls,
 * and the static packet positioned INSIDE the DMZ box. Book scope: the three zones, the public services and the two
 * firewalls only.
 */
export default function DmzThreeZone({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 200"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏DMZ — منطقة بين الإنترنت والشبكة الداخلية</text>

      {/* zone 1 — the Internet (outside) */}
      <g data-zone="internet">
        <rect className="eb-visual-seg" x="16" y="44" width="96" height="74" rx="8" />
        <text className="eb-visual-node-label" x="64" y="66" textAnchor="middle" fontSize="12">الإنترنت</text>
        <text className="eb-visual-meta" x="64" y="86" textAnchor="middle">خارج الشبكة</text>
      </g>
      {/* firewall 1 */}
      <g data-firewall="1">
        <line className="eb-visual-divider" x1="124" y1="40" x2="124" y2="122" stroke="var(--eb-danger)" strokeWidth="2.5" />
        <text className="eb-visual-meta" x="124" y="134" textAnchor="middle" fill="var(--eb-danger)">جدار حماية</text>
      </g>

      {/* zone 2 — the DMZ (public services) */}
      <g data-zone="dmz">
        <rect className="eb-visual-seg is-v4" x="136" y="44" width="108" height="74" rx="8" />
        <text className="eb-visual-node-label" x="190" y="62" textAnchor="middle" fontSize="12">DMZ</text>
        <text className="eb-visual-meta" x="190" y="80" textAnchor="middle">خدمات عامة</text>
        <text className="eb-visual-token" x="190" y="98" textAnchor="middle" fontSize="10">Web · Mail · DNS</text>
      </g>
      {/* firewall 2 */}
      <g data-firewall="2">
        <line className="eb-visual-divider" x1="256" y1="40" x2="256" y2="122" stroke="var(--eb-danger)" strokeWidth="2.5" />
        <text className="eb-visual-meta" x="256" y="134" textAnchor="middle" fill="var(--eb-danger)">جدار ثانٍ</text>
      </g>

      {/* zone 3 — the internal LAN (protected) */}
      <g data-zone="internal">
        <rect className="eb-visual-seg" x="268" y="44" width="96" height="74" rx="8" stroke="var(--eb-success)" />
        <text className="eb-visual-node-label" x="316" y="66" textAnchor="middle" fontSize="11">الشبكة الداخلية</text>
        <text className="eb-visual-meta" x="316" y="86" textAnchor="middle">محمية</text>
      </g>

      {/* the visitor travels along the zone row (y=108): starts in the Internet zone, crosses firewall 1 (x=124),
          and freezes INSIDE the DMZ box (x≈190) — it never reaches firewall 2 (x=256) or the internal LAN. */}
      {!reducedMotion ? (
        <g className="eb-visual-packet" data-stop="1">
          <rect x="-6" y="-6" width="12" height="12" rx="2" />
          <animateMotion id="dmzVisit" begin="0.4s" dur="1.3s" fill="freeze" path="M 64 108 L 190 108" />
        </g>
      ) : (
        <rect className="eb-visual-packet-static" data-stop="1" x="184" y="102" width="12" height="12" rx="2" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="176" textAnchor="middle">‏الزائر يصل إلى DMZ فقط ولا يدخل الشبكة الداخلية</text>
      <text className="eb-visual-meta" x="190" y="192" textAnchor="middle">جداران للحماية يجعلان DMZ منطقة معزولة</text>
    </svg>
  );
}
