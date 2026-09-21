import type { LearningVisualProps } from "../../types";

/**
 * «مقارنة سريعة: OSI و TCP/IP» (Book 791381, PDF 83) — the mapping the book stresses: OSI has 7 layers, TCP/IP has 4,
 * and the OSI top three (Application, Presentation, Session) collapse into TCP/IP's single Application layer; then
 * Transport↔Transport, Network↔Internet, and Data Link + Physical↔Link. Two aligned columns with the four
 * TCP/IP boxes spanning their matching OSI rows. Motion: a subtle glow on the collapsed top group. Reduced motion ⇒
 * a still mapping. Names render LTR.
 */
// OSI is numbered 7→1 top-to-bottom per the book (7 Application … 1 Physical); n carries the book's layer number.
const OSI = [
  { n: 7, en: "Application" }, { n: 6, en: "Presentation" }, { n: 5, en: "Session" },
  { n: 4, en: "Transport" }, { n: 3, en: "Network" }, { n: 2, en: "Data Link" }, { n: 1, en: "Physical" },
];
// TCP/IP is numbered 4→1 (4 Application … 1 Link); each box spans the OSI rows (by array index) it maps onto.
const MAP = [
  { n: 4, en: "Application", from: 0, to: 2 },
  { n: 3, en: "Transport", from: 3, to: 3 },
  { n: 2, en: "Internet", from: 4, to: 4 },
  { n: 1, en: "Link", from: 5, to: 6 },
];
export default function OsiVsTcpIp({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const y0 = 40, rh = 24, gap = 2;
  const rowY = (i: number) => y0 + i * (rh + gap);
  const oX = 214, oW = 150, tX = 20, tW = 150;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 240"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x={tX + tW / 2} y="26" textAnchor="middle" direction="ltr">TCP/IP · 4</text>
      <text className="eb-visual-row-label" x={oX + oW / 2} y="26" textAnchor="middle" direction="ltr">OSI · 7</text>
      {/* OSI 7 rows */}
      {OSI.map((l, i) => (
        <g key={l.en}>
          <rect className="eb-visual-seg is-v6" x={oX} y={rowY(i)} width={oW} height={rh} rx="4" />
          <text className="eb-visual-token" x={oX + oW / 2} y={rowY(i) + rh / 2} textAnchor="middle" dominantBaseline="central" direction="ltr">{l.n}. {l.en}</text>
        </g>
      ))}
      {/* TCP/IP 4 boxes spanning matching OSI rows */}
      {MAP.map(m => {
        const y = rowY(m.from), hgt = rowY(m.to) + rh - rowY(m.from);
        const grouped = m.to > m.from, glow = grouped && !reducedMotion;
        return (
          <g key={m.en}>
            <rect className={"eb-visual-seg is-v4" + (glow ? " eb-visual-glow-anim" : "")} x={tX} y={y} width={tW} height={hgt} rx="6" />
            <text className="eb-visual-token" x={tX + tW / 2} y={y + hgt / 2} textAnchor="middle" dominantBaseline="central" direction="ltr">{m.n}. {m.en}</text>
            {/* connectors to the OSI span */}
            <line className="eb-visual-link is-faint" x1={tX + tW} y1={y + hgt / 2} x2={oX} y2={rowY(m.from) + (grouped ? rh / 2 : rh / 2)} />
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="232" textAnchor="middle">الطبقات الثلاث العليا في OSI تُجمع في Application واحدة في TCP/IP</text>
    </svg>
  );
}
