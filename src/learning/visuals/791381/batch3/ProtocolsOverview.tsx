import type { LearningVisualProps } from "../../types";

/**
 * «أهم البروتوكولات» (Book 791381, PDF 87) — a map grouping the unit's protocols by the job they do: web, names,
 * configuration, mail, files, remote access. A central hub links to six category chips (each with its example
 * protocols). Motion: a dot travels a spoke from the hub. Reduced motion ⇒ a still dot at the hub. Protocol names LTR.
 */
const CHIPS = [
  { ar: "الويب", p: "HTTP · HTTPS", cx: 100, cy: 52 },
  { ar: "الأسماء", p: "DNS", cx: 280, cy: 52 },
  { ar: "الإعداد", p: "DHCP", cx: 40, cy: 130 },
  { ar: "البريد", p: "SMTP · IMAP", cx: 340, cy: 130 },
  { ar: "الملفات", p: "FTP · TFTP", cx: 100, cy: 206 },
  { ar: "الإدارة عن بُعد", p: "SSH · Telnet", cx: 280, cy: 206 },
];
const HUB = { x: 190, y: 130 };
export default function ProtocolsOverview({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 240"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {CHIPS.map((c, i) => (
        <line key={"l" + i} className="eb-visual-link" x1={HUB.x} y1={HUB.y} x2={c.cx} y2={c.cy} />
      ))}
      {CHIPS.map((c, i) => (
        <g key={i}>
          <rect className="eb-visual-seg is-v4" x={c.cx - 52} y={c.cy - 18} width="104" height="36" rx="8" />
          <text className="eb-visual-part-label" x={c.cx} y={c.cy - 4} textAnchor="middle">{c.ar}</text>
          <text className="eb-visual-token" x={c.cx} y={c.cy + 11} textAnchor="middle" direction="ltr">{c.p}</text>
        </g>
      ))}
      <circle className="eb-visual-hub" cx={HUB.x} cy={HUB.y} r="26" />
      <text className="eb-visual-hub-label" x={HUB.x} y={HUB.y - 4} textAnchor="middle" dominantBaseline="central">البروتوكولات</text>
      <text className="eb-visual-hub-label" x={HUB.x} y={HUB.y + 10} textAnchor="middle" dominantBaseline="central">حسب المهمة</text>
      {!reducedMotion ? (
        <>
          <path id="po-spoke" className="eb-visual-route" d={`M ${HUB.x} ${HUB.y} L ${CHIPS[0].cx} ${CHIPS[0].cy}`} />
          <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" /><animateMotion dur="2.6s" repeatCount="indefinite"><mpath href="#po-spoke" /></animateMotion></g>
        </>
      ) : (
        <rect className="eb-visual-packet-static" x={HUB.x - 5} y={HUB.y - 5} width="10" height="10" rx="2" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="234" textAnchor="middle">لكل مهمة بروتوكول (أو أكثر) يقوم بها</text>
    </svg>
  );
}
