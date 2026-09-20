import type { LearningVisualProps } from "../../types";

/**
 * «DNS / HTTP / DHCP» (Book 791381, PDF 88) — the book's worked sequence when a student joins the network and opens
 * google.com: (1) DHCP hands the device an IP automatically, (2) DNS turns the name google.com into an IP address,
 * (3) HTTP fetches the web page. Three ordered steps with a marker that advances along them. Reduced motion ⇒ marker
 * on step 1. Protocol names + the domain render LTR.
 */
const STEPS = [
  { en: "DHCP", ar: "يمنح الجهاز عنوان IP تلقائيًا" },
  { en: "DNS", ar: "يحوّل google.com إلى عنوان IP" },
  { en: "HTTP", ar: "يجلب صفحة الويب من الخادم" },
];
export default function DnsHttpDhcp({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const w = 116, gap = 8, y = 40, h = 66;
  // RTL reading: step 1 on the right
  const xOf = (i: number) => 366 - (i + 1) * w - i * gap;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 148"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {STEPS.map((s, i) => {
        const x = xOf(i);
        return (
          <g key={s.en}>
            <rect className="eb-visual-seg is-v4" x={x} y={y} width={w} height={h} rx="8" />
            <circle className="eb-visual-dot" cx={x + w - 14} cy={y + 14} r="9" />
            <text className="eb-visual-token is-inverse" x={x + w - 14} y={y + 14} textAnchor="middle" dominantBaseline="central" direction="ltr">{i + 1}</text>
            <text className="eb-visual-row-label" x={x + 12} y={y + 18} direction="ltr">{s.en}</text>
            <text className="eb-visual-part-label" x={x + w / 2} y={y + 44} textAnchor="middle">{s.ar}</text>
            {i < STEPS.length - 1 && <text className="eb-visual-row-label" x={x - gap / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central">‹</text>}
          </g>
        );
      })}
      {!reducedMotion ? (
        <>
          <path id="dhd-flow" className="eb-visual-route" d={`M ${xOf(0) + w / 2} ${y - 12} L ${xOf(2) + w / 2} ${y - 12}`} />
          <g className="eb-visual-packet"><rect x="-6" y="-5" width="12" height="10" rx="2" /><animateMotion dur="3.6s" repeatCount="indefinite"><mpath href="#dhd-flow" /></animateMotion></g>
        </>
      ) : (
        <rect className="eb-visual-packet-static" x={xOf(0) + w / 2 - 6} y={y - 17} width="12" height="10" rx="2" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="132" textAnchor="middle">من الانضمام للشبكة إلى فتح الموقع: DHCP ثم DNS ثم HTTP</text>
    </svg>
  );
}
