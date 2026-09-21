import type { LearningVisualProps } from "../../types";

/**
 * «IP مقابل MAC — مستوى الملخّص» (Book 791381, PDF 231) — the summary-level contrast the page draws: IP is a LOGICAL
 * address (32 bit) that identifies the device on its network and changes when the network changes, while MAC is a
 * PHYSICAL address (48 bit = 6 Hex pairs) burned into the card and fixed to the local interface. Purely a still
 * side-by-side comparison (no motion): two columns, each with the exact properties the page lists. Book scope: the
 * logical-vs-physical / 32-vs-48-bit distinction only — NOT ARP or deeper resolution mechanics.
 */
const SIDES: { key: string; head: string; rows: string[] }[] = [
  { key: "ip", head: "IP — عنوان منطقي", rows: ["منطقي (Logical)", "32 bit", "يتغيّر بتغيّر الشبكة", "يحدّد الجهاز على الشبكة"] },
  { key: "mac", head: "MAC — عنوان فيزيائي", rows: ["فيزيائي (Physical)", "48 bit = 6 أزواج Hex", "ثابت في البطاقة", "يحدّد الواجهة المحلية"] },
];
export default function IpVsMacSummary({ ariaLabel, className }: LearningVisualProps) {
  const CW = 156, GAP = 20, X0 = 22, Y0 = 44, RH = 30;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 214"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏IP منطقي · MAC فيزيائي</text>
      {SIDES.map((s, i) => {
        const x = X0 + i * (CW + GAP);
        const accent = s.key === "ip" ? "var(--eb-primary)" : "var(--eb-success)";
        return (
          <g key={s.key} data-side={s.key}>
            <rect className="eb-visual-zone" x={x} y={Y0} width={CW} height={30} rx="6" stroke={accent} />
            <text className="eb-visual-node-label" x={x + CW / 2} y={Y0 + 15} textAnchor="middle" dominantBaseline="central" fontSize="11" fill={accent}>{s.head}</text>
            {s.rows.map((r, j) => (
              <g key={j}>
                <line className="eb-visual-link is-faint" x1={x + 10} y1={Y0 + 40 + j * RH} x2={x + CW - 10} y2={Y0 + 40 + j * RH} />
                <text className="eb-visual-meta" x={x + CW / 2} y={Y0 + 40 + j * RH + 14} textAnchor="middle">{r}</text>
              </g>
            ))}
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="206" textAnchor="middle">‏IP منطقي يتغيّر مع الشبكة · MAC فيزيائي ثابت في البطاقة</text>
    </svg>
  );
}
