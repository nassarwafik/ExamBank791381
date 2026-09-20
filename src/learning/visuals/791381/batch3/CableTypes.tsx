import type { LearningVisualProps } from "../../types";

/**
 * «الكوابل المستعملة في الشبكات» (Book 791381, PDF 61–62) — the network cable types and their protection against
 * interference: UTP (twisted pair, no shield), STP (twisted pair + metal shield), Coaxial, and Fiber (light, immune
 * to electrical noise). The book's rule: the more shielding, the better against interference. Motion: a signal pulse
 * runs along the fiber row (the immune one). Reduced motion ⇒ a still signal marker on the fiber.
 */
const ROWS = [
  { key: "UTP", ar: "مزدوج مجدول بلا حماية", shield: 1 },
  { key: "STP", ar: "مزدوج مجدول بحماية معدنية", shield: 2 },
  { key: "Coaxial", ar: "محوري", shield: 2 },
  { key: "Fiber", ar: "ألياف ضوئية (ضوء، بلا تشويش)", shield: 3 },
];
const FIBER_D = "M 150 158 L 300 158";
export default function CableTypes({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {ROWS.map((r, i) => {
        const y = 20 + i * 46;
        const fiber = r.key === "Fiber";
        return (
          <g key={r.key}>
            <text className="eb-visual-row-label" x="34" y={y + 16} direction="ltr">{r.key}</text>
            {/* cable bar; thicker/greener stroke shows more protection */}
            <rect className={"eb-visual-seg" + (fiber ? " is-v6" : r.shield >= 2 ? " is-v4" : "")} x="150" y={y + 4} width="150" height="20" rx="6" />
            {/* shield pips */}
            {Array.from({ length: r.shield }).map((_, k) => <circle key={k} className="eb-visual-dot" cx={310 + k * 12} cy={y + 14} r="3.5" />)}
            <text className="eb-visual-part-label" x="150" y={y - 2} >{r.ar}</text>
            {fiber && (!reducedMotion
              ? <><path id="ct-fiber" className="eb-visual-route" d={FIBER_D} /><g className="eb-visual-packet"><rect x="-6" y="-5" width="12" height="10" rx="3" /><animateMotion dur="1.8s" repeatCount="indefinite"><mpath href="#ct-fiber" /></animateMotion></g></>
              : <rect className="eb-visual-packet-static" x="188" y={y + 5} width="12" height="10" rx="3" />)}
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="202" textAnchor="middle">كلما زادت الحماية، كان الكابل أفضل ضد التشويش · النقاط = درجة الحماية</text>
    </svg>
  );
}
