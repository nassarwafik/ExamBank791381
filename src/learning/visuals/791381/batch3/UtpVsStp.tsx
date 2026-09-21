import type { LearningVisualProps } from "../../types";

/**
 * «الكوابل: UTP و STP» (Book 791381, PDF 62) — the ONLY cables this page teaches are the twisted-pair pair: UTP with
 * NO shield and STP with a metallic shield; the point is protection against external interference. (Coaxial and Fiber
 * are introduced on PDF 63, which already carries the cable-comparison activity, so they are NOT shown here.)
 * Motion TEACHES the distinction: external interference approaches both — it reaches the pair inside UTP, but the
 * STP metallic shield blocks it before it reaches the pair. Reduced motion ⇒ still interference marks outside each
 * cable. Names render LTR.
 */
export default function UtpVsStp({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const midY = 74;
  const panel = (ox: number, name: string, ar: string, shielded: boolean) => {
    const innerX = ox + 30, innerW = 108;               // the twisted pair inside
    const shieldX = ox + 24, shieldW = 120;             // the metal shield (STP only)
    const noiseFrom = ox + 172, noiseToUtp = innerX + innerW / 2, noiseToStp = shieldX + shieldW + 6;
    return (
      <g>
        <text className="eb-visual-row-label" x={ox + 84} y="26" textAnchor="middle" direction="ltr">{name}</text>
        {/* metal shield (STP only) */}
        {shielded && <rect className="eb-visual-seg is-v4" x={shieldX} y={midY - 22} width={shieldW} height="44" rx="7" />}
        {shielded && <text className="eb-visual-part-label" x={ox + 84} y={midY - 28} textAnchor="middle">درع معدني</text>}
        {/* the twisted pair (two intertwined strands, drawn as two wavy lines) */}
        {[0, 1].map(k => (
          <path key={k} className="eb-visual-link is-strong" fill="none"
            d={`M ${innerX} ${midY + (k ? 6 : -6)} q 13 ${k ? -12 : 12} 27 0 q 13 ${k ? 12 : -12} 27 0 q 13 ${k ? -12 : 12} 27 0 q 13 ${k ? 12 : -12} 27 0`} />
        ))}
        {/* external interference marker approaching from the right */}
        <path id={`nz-${name}`} className="eb-visual-route" d={`M ${noiseFrom} ${midY} L ${shielded ? noiseToStp : noiseToUtp} ${midY}`} />
        {!reducedMotion
          ? <g className="eb-visual-pin"><path d="M0 -7 L4 0 L0 7 L-4 0 Z" /><animateMotion dur="1.9s" repeatCount="indefinite"><mpath href={`#nz-${name}`} /></animateMotion></g>
          : <g className="eb-visual-pin" transform={`translate(${noiseFrom - 10} ${midY})`}><path d="M0 -7 L4 0 L0 7 L-4 0 Z" /></g>}
        <text className="eb-visual-part-label" x={ox + 84} y={midY + 40} textAnchor="middle">{ar}</text>
      </g>
    );
  };
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 150"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {panel(6, "UTP", "بلا درع — التشويش يصل إلى السلكين", false)}
      {panel(196, "STP", "درع معدني — يصدّ التشويش", true)}
      <text className="eb-visual-caption-svg" x="190" y="142" textAnchor="middle">الدرع المعدني في STP يزيد المقاومة للتشويش الخارجي</text>
    </svg>
  );
}
