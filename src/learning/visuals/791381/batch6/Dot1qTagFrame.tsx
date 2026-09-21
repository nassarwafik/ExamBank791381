import type { LearningVisualProps } from "../../types";

/**
 * «ما هو Dot1Q؟» (Book 791381, PDF 152) — 802.1Q (Dot1Q) is the standard that puts a Tag on the frame; the Tag carries
 * the VLAN number so several VLANs can share one Trunk link. Motion TEACHES the tag insertion: the plain frame
 * [ MAC | Data ] gains a Tag field in the middle → [ MAC | Tag: VLAN 10 | Data ]. ONE-SHOT: the Tag is revealed once
 * and stays (fill=freeze) — it never flickers back to an untagged frame. Reduced motion ⇒ the tagged frame shown
 * complete. Book scope: the Dot1Q term and the Tag(=VLAN number) idea only — NOT the `encapsulation dot1Q` command
 * (PDF 154) and no sub-interface addresses.
 */
export default function Dot1qTagFrame({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 180"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏Dot1Q يضع Tag يحمل رقم VLAN</text>

      {/* the frame: MAC | (Tag) | Data — the Tag appears between the two original fields */}
      <rect className="eb-visual-seg" x="24" y="52" width="96" height="40" rx="6" />
      <text className="eb-visual-node-label" x="72" y="72" textAnchor="middle" dominantBaseline="central">MAC</text>

      <g data-tag="1">
        <rect className="eb-visual-seg is-v4" x="132" y="52" width="116" height="40" rx="6" opacity={reducedMotion ? 1 : 0}>
          {!reducedMotion && <animate id="tagIn" attributeName="opacity" begin="0.3s" dur="0.9s" values="0;1;1" keyTimes="0;0.7;1" fill="freeze" />}
        </rect>
        <text className="eb-visual-token" x="190" y="72" textAnchor="middle" dominantBaseline="central" opacity={reducedMotion ? 1 : 0}>
          Tag: VLAN 10
          {!reducedMotion && <animate attributeName="opacity" begin="tagIn.end" dur="0.6s" values="0;1" fill="freeze" />}
        </text>
      </g>

      <rect className="eb-visual-seg" x="260" y="52" width="96" height="40" rx="6" />
      <text className="eb-visual-node-label" x="308" y="72" textAnchor="middle" dominantBaseline="central">Data</text>

      <text className="eb-visual-part-label" x="190" y="118" textAnchor="middle">‏الـ Tag يميّز عدة VLAN على نفس رابط Trunk</text>
      <text className="eb-visual-caption-svg" x="190" y="150" textAnchor="middle">‏Dot1Q: Tag بين حقول الإطار يخبر الجهاز أنّ الحزمة تابعة لأي VLAN</text>
    </svg>
  );
}
