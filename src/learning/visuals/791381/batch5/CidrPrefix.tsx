import type { LearningVisualProps } from "../../types";

/**
 * «ما هو CIDR؟» (Book 791381, PDF 41) — CIDR is a short way to write the subnet mask: the number of NETWORK bits after
 * the "/". A 32-bit address is four 8-bit octets, so /8, /16, /24 give 1, 2, 3 whole network octets. Motion TEACHES
 * the prefix GROWING: the network highlight steps /8 → /16 → /24 in sequence, and each step's mask (255.0.0.0 →
 * 255.255.0.0 → 255.255.255.0) lights up with it. Reduced motion ⇒ all three rows shown statically (complete still
 * frame). Book scope only: whole octets, no /25+, no VLSM, no borrowed bits, no block-size formulas.
 */
const ROWS = [
  { p: 8, net: 1, mask: "255.0.0.0" },
  { p: 16, net: 2, mask: "255.255.0.0" },
  { p: 24, net: 3, mask: "255.255.255.0" },
];
const OX = 92;   // left x of the octet strip
const OW = 42;   // octet width
const GAP = 3;
export default function CidrPrefix({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const rowY = (i: number) => 50 + i * 46;
  const octX = (o: number) => OX + o * (OW + GAP);
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏العنوان = 32 بت = أربعة أقسام × 8 بتات</text>
      {ROWS.map((r, i) => {
        const y = rowY(i);
        return (
          <g key={r.p} data-cidr={r.p}>
            <text className="eb-visual-prefix" x="42" y={y + 12} textAnchor="middle" direction="ltr">/{r.p}</text>
            <text className="eb-visual-meta" x="42" y={y + 26} textAnchor="middle">{r.p} بت</text>
            {[0, 1, 2, 3].map(o => (
              <g key={o}>
                <rect className={"eb-visual-octet " + (o < r.net ? "is-network" : "is-host")} x={octX(o)} y={y} width={OW} height="24" rx="4" />
                <text className="eb-visual-node-label" x={octX(o) + OW / 2} y={y + 12} textAnchor="middle" dominantBaseline="central" fontSize="11">{o < r.net ? "شبكة" : "مضيف"}</text>
              </g>
            ))}
            <text className="eb-visual-token" data-mask={r.p} x={octX(3) + OW + 6} y={y + 12} dominantBaseline="central" direction="ltr" fontSize="10">{r.mask}</text>
            {/* the growing-prefix highlight, chained in sequence /8 → /16 → /24 (bounded cycle) */}
            {!reducedMotion && (
              <rect data-grow={r.p} x={OX - 2} y={y - 3} width={r.net * (OW + GAP)} height="30" rx="5" fill="none" stroke="var(--eb-primary-strong)" strokeWidth="2.5" opacity="0">
                <animate id={`cidr${r.p}`} attributeName="opacity"
                  begin={i === 0 ? "0s;cidr24.end" : `cidr${ROWS[i - 1].p}.end`} dur="1.1s" values="0;1;1;0" keyTimes="0;0.2;0.8;1" />
              </rect>
            )}
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="198" textAnchor="middle">‏/N = عدد بتات الشبكة · كلّما زاد زادت أقسام الشبكة الثابتة</text>
    </svg>
  );
}
