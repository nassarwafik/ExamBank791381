import type { LearningVisualProps } from "../../types";

/**
 * «مثال DHCP على الراوتر» (Book 791381, PDF 171) — on the network 192.168.1.0/24 the example's DHCP pool distributes a
 * SPECIFIC range only: 192.168.1.10 → 192.168.1.50 (the page states this is the example's design decision). Addresses
 * BEFORE the pool (192.168.1.1 – 192.168.1.9) and AFTER it (192.168.1.51 – 192.168.1.253) are NOT part of this
 * example's pool and are not distributed here, and the router's gateway 192.168.1.254 sits outside it too. In this
 * example the ROUTER itself plays both roles — it is the DHCP server that hands out the pool AND the network's Gateway
 * (192.168.1.254) — so the diagram labels the router «خادم DHCP + البوابة» without leaking any CLI command word.
 * Static diagram (no motion): the /24 address bar marks the .10–.50 distribution range against everything outside it —
 * it is deliberately NOT "the rest of the /24". Book scope: the example's exact pool range, the out-of-pool addresses,
 * the gateway, and the router's dual role — NOT the CLI command words (ip dhcp pool / default-router / dns-server /
 * excluded-address).
 */
export default function DhcpPoolExcluded({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 208"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏الشبكة 192.168.1.0/24 — نطاق DHCP في المثال</text>

      {/* the /24 address bar: before-pool, the pool (.10–.50), after-pool — only the middle band is distributed */}
      <g data-band="before">
        <rect className="eb-visual-seg" x="20" y="48" width="66" height="42" rx="6" />
        <text className="eb-visual-token" x="53" y="66" textAnchor="middle" fontSize="10">.1 – .9</text>
        <text className="eb-visual-meta" x="53" y="82" textAnchor="middle">قبل النطاق</text>
      </g>
      <g data-band="pool">
        <rect className="eb-visual-seg" x="90" y="48" width="158" height="42" rx="6" fill="var(--eb-success)" opacity="0.18" stroke="var(--eb-success)" />
        <text className="eb-visual-node-label" x="169" y="62" textAnchor="middle" fontSize="11">نطاق DHCP</text>
        <text className="eb-visual-token" x="169" y="80" textAnchor="middle" fontSize="10">192.168.1.10 – 192.168.1.50</text>
      </g>
      <g data-band="after">
        <rect className="eb-visual-seg" x="252" y="48" width="108" height="42" rx="6" />
        <text className="eb-visual-token" x="306" y="66" textAnchor="middle" fontSize="10">.51 – .253</text>
        <text className="eb-visual-meta" x="306" y="82" textAnchor="middle">بعد النطاق</text>
      </g>

      {/* only the middle band is handed out; everything else (including the gateway) is out of the example's pool */}
      <text className="eb-visual-part-label" x="90" y="112" fill="var(--eb-danger)">لا توزَّع</text>
      <text className="eb-visual-part-label" x="360" y="112" textAnchor="end" fill="var(--eb-danger)">لا توزَّع</text>
      <text className="eb-visual-part-label" x="169" y="112" textAnchor="middle" fill="var(--eb-success)">تُوزَّع تلقائيًا</text>

      {/* in this example the router is BOTH the DHCP server (hands out the pool) and the gateway (outside the pool) */}
      <g data-band="router">
        <rect className="eb-visual-router" x="40" y="128" width="96" height="34" rx="7" />
        <text className="eb-visual-node-label is-inverse" x="88" y="145" textAnchor="middle" dominantBaseline="central" fontSize="11">الراوتر</text>
        <text className="eb-visual-meta" x="152" y="140" textAnchor="start">خادم DHCP في هذا المثال</text>
        <text className="eb-visual-meta" x="152" y="156" textAnchor="start">وهو البوابة أيضًا</text>
      </g>

      {/* the gateway sits outside the pool */}
      <g data-band="gateway">
        <text className="eb-visual-token" x="190" y="180" textAnchor="middle" fontSize="11">البوابة 192.168.1.254</text>
        <text className="eb-visual-meta" x="190" y="193" textAnchor="middle">خارج النطاق</text>
      </g>
      <text className="eb-visual-caption-svg" x="190" y="205" textAnchor="middle">‏الراوتر هو خادم DHCP والبوابة · التوزيع من 192.168.1.10 إلى 192.168.1.50 فقط · 192.168.1.254 خارجه</text>
    </svg>
  );
}
