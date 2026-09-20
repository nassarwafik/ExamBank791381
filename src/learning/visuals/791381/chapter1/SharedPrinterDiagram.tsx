import type { LearningVisualProps } from "../../types";

/**
 * «حسنات الشبكة» (Book 791381, PDF 10) — the book's own example: several computers SHARE one printer over the
 * network instead of buying a printer per device. Three computers connect to a single printer; subtle print-job
 * dots flow from the computers toward the printer. Reduced motion ⇒ no dots (still frame of devices + links).
 */
const PCS = [
  { x: 70, y: 45 },
  { x: 70, y: 120 },
  { x: 70, y: 195 },
];
const PRINTER = { x: 320, y: 120 };

export default function SharedPrinterDiagram({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg
      className={"eb-visual" + (className ? " " + className : "")}
      viewBox="0 0 400 250" role="img" aria-label={ariaLabel}
      xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
    >
      {PCS.map((p, i) => (
        <path key={"pl" + i} id={"sp-lk" + i} className="eb-visual-link" fill="none"
          d={`M ${p.x + 34} ${p.y} C 200 ${p.y}, 210 ${PRINTER.y}, ${PRINTER.x - 44} ${PRINTER.y}`} />
      ))}

      {/* computers */}
      {PCS.map((p, i) => (
        <g key={"pc" + i}>
          <rect className="eb-visual-node" x={p.x - 34} y={p.y - 20} width="68" height="40" rx="8" />
          <text className="eb-visual-node-label" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">حاسوب</text>
        </g>
      ))}

      {/* shared printer */}
      <g>
        <rect className={"eb-visual-printer" + (reducedMotion ? "" : " eb-visual-pulse")} x={PRINTER.x - 44} y={PRINTER.y - 34} width="88" height="68" rx="10" />
        <rect className="eb-visual-printer-slot" x={PRINTER.x - 26} y={PRINTER.y - 8} width="52" height="14" rx="3" />
        <text className="eb-visual-node-label" x={PRINTER.x} y={PRINTER.y + 22} textAnchor="middle" dominantBaseline="central">طابعة</text>
      </g>

      {/* print-job pulses (motion) */}
      {!reducedMotion && PCS.map((_, i) => (
        <circle key={"j" + i} className="eb-visual-dot" r="4">
          <animateMotion dur="2.6s" begin={`${i * 0.5}s`} repeatCount="indefinite">
            <mpath href={`#sp-lk${i}`} />
          </animateMotion>
        </circle>
      ))}
    </svg>
  );
}
