import type { LearningVisualProps } from "../../types";

/**
 * «أنواع المسارات والمسار الثابت» (Book 791381, PDF 251) — the page's three route types and its exact static-route
 * example. Static = manual, fast/secure, does not change automatically; Dynamic = automatic via routing protocols
 * (OSPF · EIGRP); Default = 0.0.0.0/0 for unknown destinations. The book's static command is decoded into its three
 * parts: destination 192.168.2.0, mask 255.255.255.0, next-hop 10.0.0.2 — and the Default route is 0.0.0.0/0. Purely
 * a still summary (no motion); NO fake terminal output. Book scope: exactly the PDF251 types and values.
 */
const TYPES: [string, string][] = [
  ["Static", "يدوي · سريع وآمن · لا يتغيّر"],
  ["Dynamic", "تلقائي · OSPF · EIGRP"],
  ["Default", "0.0.0.0/0 لغير المعروف"],
];
const PARTS: [string, string][] = [
  ["الوجهة (destination)", "192.168.2.0"],
  ["القناع (mask)", "255.255.255.0"],
  ["القفزة التالية (next-hop)", "10.0.0.2"],
];
export default function RouteTypesSummary({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 258"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="18" textAnchor="middle">‏Static · Dynamic · Default</text>

      {/* the three route types */}
      {TYPES.map(([k, d], i) => {
        const w = 112, gap = 6, x = 16 + i * (w + gap);
        return (
          <g key={k} data-route={k}>
            <rect className="eb-visual-zone" x={x} y="30" width={w} height="52" rx="7" />
            <text className="eb-visual-node-label" x={x + w / 2} y="46" textAnchor="middle" dominantBaseline="central" fontSize="11" direction="ltr">{k}</text>
            <text className="eb-visual-meta" x={x + w / 2} y="66" textAnchor="middle" dominantBaseline="central">{d}</text>
          </g>
        );
      })}

      {/* decode the exact static-route example */}
      <text className="eb-visual-part-label" x="190" y="106" textAnchor="middle">تحليل مثال الكتاب للمسار الثابت</text>
      <g data-example="static">
        <rect className="eb-visual-node is-target" x="40" y="114" width="300" height="20" rx="5" />
        <text className="eb-visual-token is-octet" x="190" y="124" textAnchor="middle" dominantBaseline="central" fontSize="10" direction="ltr">ip route 192.168.2.0 255.255.255.0 10.0.0.2</text>
      </g>
      {PARTS.map(([k, v], i) => {
        const y = 142 + i * 24;
        return (
          <g key={"p" + i} data-part={k}>
            <rect className="eb-visual-zone" x="40" y={y} width="300" height="20" rx="4" />
            <text className="eb-visual-part-label" x="52" y={y + 10} dominantBaseline="central" textAnchor="start">{k}</text>
            <text className="eb-visual-token is-octet" x="328" y={y + 10} dominantBaseline="central" textAnchor="end" fontSize="11" direction="ltr">{v}</text>
          </g>
        );
      })}

      {/* the default route */}
      <g data-part="default">
        <rect className="eb-visual-zone" x="40" y="220" width="300" height="20" rx="4" stroke="var(--eb-primary)" />
        <text className="eb-visual-part-label" x="52" y="230" dominantBaseline="central" textAnchor="start">المسار الافتراضي (Default)</text>
        <text className="eb-visual-token is-octet" x="328" y="230" dominantBaseline="central" textAnchor="end" fontSize="11" direction="ltr">0.0.0.0/0</text>
      </g>
      <text className="eb-visual-caption-svg" x="190" y="252" textAnchor="middle">‏الشبكة الهدف، ثم القناع، ثم القفزة التالية</text>
    </svg>
  );
}
