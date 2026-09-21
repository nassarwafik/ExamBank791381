import type { LearningVisualProps } from "../../types";

/**
 * «مثال DHCP على الراوتر» (Book 791381, PDF 171) — the router itself hands out addresses on the network 192.168.1.0/24.
 * Two parts of that address space are NOT handed out: the reserved low addresses (192.168.1.1 – 192.168.1.9) and the
 * router's own gateway address 192.168.1.254; the rest is the pool distributed to the devices. Static diagram (no
 * motion): a single address-space bar makes "reserved vs distributed" obvious at a glance. Book scope: the network,
 * the reserved band, the gateway address and the distributed pool as CONCEPTS — NOT the CLI command words
 * (ip dhcp pool / default-router / dns-server / excluded-address arrive as commands on PDF 172–173).
 */
export default function DhcpPoolExcluded({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 176"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏الشبكة 192.168.1.0/24 — محجوز مقابل موزّع</text>

      {/* the /24 address-space bar: reserved band, distributed pool, gateway marker */}
      <g data-band="reserved">
        <rect className="eb-visual-seg" x="24" y="46" width="72" height="40" rx="6" fill="var(--eb-danger)" opacity="0.18" stroke="var(--eb-danger)" />
        <text className="eb-visual-token" x="60" y="63" textAnchor="middle" fontSize="10">‏.1 – .9</text>
        <text className="eb-visual-meta" x="60" y="79" textAnchor="middle">محجوزة</text>
      </g>
      <g data-band="pool">
        <rect className="eb-visual-seg" x="96" y="46" width="212" height="40" rx="6" fill="var(--eb-success)" opacity="0.18" stroke="var(--eb-success)" />
        <text className="eb-visual-token" x="202" y="63" textAnchor="middle" fontSize="10">نطاق التوزيع للأجهزة</text>
        <text className="eb-visual-meta" x="202" y="79" textAnchor="middle">تُعطى تلقائيًا</text>
      </g>
      <g data-band="gateway">
        <rect className="eb-visual-seg is-v4" x="308" y="46" width="48" height="40" rx="6" />
        <text className="eb-visual-token" x="332" y="63" textAnchor="middle" fontSize="10">.254</text>
        <text className="eb-visual-meta" x="332" y="79" textAnchor="middle">البوابة</text>
      </g>

      <text className="eb-visual-part-label" x="190" y="112" textAnchor="middle">‏الراوتر = البوابة على 192.168.1.254، ويوزّع باقي العناوين</text>
      <text className="eb-visual-token" x="190" y="132" textAnchor="middle" fontSize="11">192.168.1.254</text>
      <text className="eb-visual-caption-svg" x="190" y="162" textAnchor="middle">‏الراوتر يعمل خادم DHCP: يحجز البوابة والعناوين الأولى، ويوزّع الباقي على الأجهزة</text>
    </svg>
  );
}
