import type { LearningVisualProps } from "../../types";

/**
 * «Frame / Packet / Segment» (Book 791381, PDF 117) — each PDU's anatomy, and how each wraps the previous one.
 * Segment (Transport) = ports + flow-control added to the Data. Packet (Network) = source/destination IP + routing
 * added around the Segment. Frame (Data Link) = source/destination MAC + error-checking added around the Packet.
 * Motion TEACHES the progressive build: the Segment header is highlighted first, THEN the Packet header (wrapping the
 * Segment), THEN the Frame header + error-check (wrapping the Packet). Reduced motion ⇒ the three structures shown
 * statically. Book scope only: field FAMILIES, not TCP sequence numbers, header byte layout, EtherType or CRC internals.
 */
const ROWS = [
  { id: "anaSeg", tag: "Segment", ar: "النقل", head: "منافذ · تحكّم بالتدفّق", inner: "بيانات", extra: null as string | null },
  { id: "anaPkt", tag: "Packet", ar: "الشبكة", head: "IP المصدر/الهدف · توجيه", inner: "Segment", extra: null },
  { id: "anaFrm", tag: "Frame", ar: "ربط البيانات", head: "MAC المصدر/الهدف", inner: "Packet", extra: "فحص الأخطاء" },
];
const rowY = (i: number) => 40 + i * 56;
export default function PduAnatomy({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 212"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏كل وحدة تضيف حقولها حول الوحدة الأصغر</text>
      {ROWS.map((r, i) => {
        const y = rowY(i);
        const hasExtra = !!r.extra;
        const headW = 150, innerW = hasExtra ? 96 : 150, extraW = 70;
        const hx = 20, ix = hx + headW + 4, ex = ix + innerW + 4;
        return (
          <g key={r.id} data-pdu={r.tag}>
            <text className="eb-visual-token" x="20" y={y - 6} direction="ltr" fontSize="12" fontWeight="700">{r.tag}</text>
            <text className="eb-visual-meta" x="120" y={y - 6}>({r.ar})</text>
            {/* the added header fields for this layer */}
            <rect data-head="1" className="eb-visual-octet is-network" x={hx} y={y} width={headW} height="34" rx="5" />
            <text className="eb-visual-node-label" x={hx + headW / 2} y={y + 17} textAnchor="middle" dominantBaseline="central" fontSize="11">{r.head}</text>
            {/* the inner unit it wraps */}
            <rect className="eb-visual-node is-target" x={ix} y={y} width={innerW} height="34" rx="5" />
            <text className="eb-visual-node-label" x={ix + innerW / 2} y={y + 17} textAnchor="middle" dominantBaseline="central" fontSize={r.inner.length > 6 ? 11 : 12} direction={/[A-Za-z]/.test(r.inner) ? "ltr" : undefined}>{r.inner}</text>
            {/* Frame's extra error-check field */}
            {hasExtra && <>
              <rect className="eb-visual-seg is-v6" x={ex} y={y} width={extraW} height="34" rx="5" />
              <text className="eb-visual-node-label" x={ex + extraW / 2} y={y + 17} textAnchor="middle" dominantBaseline="central" fontSize="10">{r.extra}</text>
            </>}
            {/* chained emphasis: Segment header → Packet header → Frame header */}
            {!reducedMotion && (
              <rect x={hx - 2} y={y - 2} width={headW + 4} height="38" rx="6" fill="none" stroke="var(--eb-primary-strong)" strokeWidth="2.5" opacity="0">
                <animate id={r.id} attributeName="opacity" begin={i === 0 ? "0s;anaFrm.end" : `${ROWS[i - 1].id}.end`} dur="1.0s" values="0;1;1;0" keyTimes="0;0.2;0.8;1" />
              </rect>
            )}
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="206" textAnchor="middle">‏Packet يغلّف Segment · Frame يغلّف Packet ويضيف فحص الأخطاء</text>
    </svg>
  );
}
