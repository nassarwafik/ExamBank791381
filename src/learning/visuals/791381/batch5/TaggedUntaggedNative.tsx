import type { LearningVisualProps } from "../../types";

/**
 * «Native / Tagged / Untagged VLAN» (Book 791381, PDF 135–137) — the three cases exactly as the page describes them:
 *   • TAGGED: a frame crosses a Trunk carrying its VLAN number as a Tag (example VLAN 10,20).
 *   • UNTAGGED / ACCESS: a frame on an access port for a normal device (PC/Printer), with no tag.
 *   • NATIVE: the native VLAN (example 99) crosses the Trunk WITHOUT a tag.
 * Motion TEACHES the difference: on the trunk, the VLAN-10 and VLAN-20 frames each carry a visible Tag badge, while the
 * Native-99 frame crosses with no tag; the access frame on the left is untagged. Reduced motion ⇒ all frames shown
 * statically with their tag state. No Router-on-a-Stick (next batch).
 */
const SW1 = { x: 96, y: 72 };
const SW2 = { x: 284, y: 72 };
const TRUNK = { x1: SW1.x + 26, x2: SW2.x - 26, y: 72 };
const FRAMES = [
  { id: "t10", label: "VLAN 10", tag: "Tag 10", tagged: true, off: 0 },
  { id: "t20", label: "VLAN 20", tag: "Tag 20", tagged: true, off: 0.5 },
  { id: "nat", label: "Native 99", tag: "بلا Tag", tagged: false, off: 1.0 },
];
export default function TaggedUntaggedNative({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const sw = (p: { x: number; y: number }, l: string) => (
    <g><rect className="eb-visual-switch-box" x={p.x - 26} y={p.y - 15} width="52" height="30" rx="6" /><text className="eb-visual-node-label is-inverse" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" direction="ltr">{l}</text></g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 214"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏Tagged / Untagged / Native عبر Trunk</text>
      {/* trunk between switches */}
      <line data-trunk="1" className="eb-visual-link is-strong" x1={TRUNK.x1} y1={TRUNK.y} x2={TRUNK.x2} y2={TRUNK.y} strokeWidth="4" />
      <text className="eb-visual-part-label" x="190" y="44" textAnchor="middle">Trunk</text>
      {sw(SW1, "SW1")}
      {sw(SW2, "SW2")}
      {/* access device on the left — untagged */}
      <g data-access="1">
        <line className="eb-visual-link is-strong" x1={SW1.x} y1={SW1.y + 15} x2={SW1.x} y2="132" stroke="var(--eb-primary)" />
        <rect className="eb-visual-node is-target" x={SW1.x - 26} y="132" width="52" height="26" rx="5" />
        <text className="eb-visual-node-label" x={SW1.x} y="145" textAnchor="middle" dominantBaseline="central" fontSize="10">PC — Access</text>
        <text className="eb-visual-meta" x={SW1.x} y="172" textAnchor="middle">بلا Tag (Untagged)</text>
      </g>
      {/* frames crossing the trunk: tagged carry a badge, native crosses with none */}
      {!reducedMotion ? FRAMES.map(f => (
        <g key={f.id} data-frame={f.id} className="eb-visual-packet">
          <rect x="-20" y="-9" width="40" height="18" rx="3" className={f.tagged ? "eb-visual-octet is-network" : "eb-visual-octet is-host"} />
          <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="8" fill="var(--eb-text)" direction="ltr">{f.tag}</text>
          <animateMotion dur="3s" begin={`${f.off}s`} repeatCount="indefinite" path={`M ${TRUNK.x1} ${TRUNK.y} L ${TRUNK.x2} ${TRUNK.y}`} />
        </g>
      )) : FRAMES.map((f, i) => (
        <g key={f.id} data-frame={f.id} transform={`translate(${TRUNK.x1 + 26 + i * 46} ${TRUNK.y})`}>
          <rect x="-20" y="-9" width="40" height="18" rx="3" className={f.tagged ? "eb-visual-octet is-network" : "eb-visual-octet is-host"} />
          <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="8" fill="var(--eb-text)" direction="ltr">{f.tag}</text>
        </g>
      ))}
      {/* legend */}
      <text data-legend="tagged" className="eb-visual-part-label" x="20" y="192">‏Tagged: VLAN 10,20 تحمل Tag</text>
      <text data-legend="native" className="eb-visual-part-label" x="20" y="208">‏Native: VLAN 99 تعبر Trunk بلا Tag</text>
      <text className="eb-visual-caption-svg" x="300" y="200" textAnchor="middle">‏الوسم يخبر السويتش لأي VLAN تنتمي الحزمة</text>
    </svg>
  );
}
