import type { LearningVisualProps } from "../../types";

/**
 * «تجزئة البيانات في OSI» (Book 791381, PDF 116) — before sending, data is divided and organized; each layer adds a
 * wrapper («غلاف») around what came from the layer above and the whole thing gets a new name: Transport = Segment,
 * Network = Packet, Data Link = Frame. Motion TEACHES the wrapping as nesting: Data is always inside; then the Segment
 * wrapper is ADDED around Data, THEN the Packet wrapper around the Segment, THEN the Frame wrapper around the Packet —
 * strictly in that order (wrapper N appears before wrapper N+1). Reduced motion ⇒ all wrappers shown nested. Book
 * scope only: names + order, no header byte layout / protocol internals.
 */
export default function EncapsulationStack({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  // wrappers from outermost to innermost, each ADDED in reverse (innermost first) as the data descends the layers
  const wrap = (id: string, x: number, y: number, w: number, h: number, label: string, begin: string) => (
    <g data-wrap={id} opacity={reducedMotion ? 1 : 0}>
      <rect className="eb-visual-seg is-v4" x={x} y={y} width={w} height={h} rx="8" fill="none" strokeWidth="2" />
      <rect className="eb-visual-octet is-network" x={x + 8} y={y + 6} width={w - 16} height="18" rx="4" opacity="0.85" />
      <text className="eb-visual-token" x={x + w / 2} y={y + 15} textAnchor="middle" dominantBaseline="central" direction="ltr" fontSize="11">{label}</text>
      {!reducedMotion && <animate id={id} attributeName="opacity" begin={begin} dur="0.9s" values="0;1;1" keyTimes="0;0.6;1" fill="freeze" />}
    </g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 214"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏كل طبقة تضيف غلافًا حول ما قبله</text>
      {/* ONE-SHOT nesting: Segment is added around Data, THEN Packet around Segment, THEN Frame around Packet, and the
          animation STOPS in the complete nested final state — the wrappers do not restart while already frozen visible. */}
      {wrap("encFrame", 40, 34, 300, 150, "Frame — ربط البيانات (MAC)", "encPacket.end")}
      {wrap("encPacket", 70, 60, 240, 106, "Packet — الشبكة (IP)", "encSegment.end")}
      {wrap("encSegment", 100, 86, 180, 62, "Segment — النقل (منافذ)", "0.2s")}
      {/* Data — always present at the core */}
      <rect className="eb-visual-node is-target" x="150" y="112" width="80" height="30" rx="6" />
      <text className="eb-visual-node-label" x="190" y="127" textAnchor="middle" dominantBaseline="central">Data</text>
      <text className="eb-visual-caption-svg" x="190" y="204" textAnchor="middle">‏Data ← Segment ← Packet ← Frame · كل غلاف يحيط بالذي قبله</text>
    </svg>
  );
}
