import type { LearningVisualProps } from "../../types";

/**
 * «ما هو Trunk؟» (Book 791381, PDF 147) — a Trunk is ONE cable between two switches that carries SEVERAL VLANs; each
 * frame keeps a Tag that says which VLAN it belongs to (VLAN 10 · VLAN 20 · VLAN 30 in the page's own example). The
 * contrast the page draws: WITHOUT a trunk you would need a separate cable per VLAN. Motion TEACHES the core idea:
 * the three differently-tagged frames travel the SAME single trunk cable (Switch 1 → Switch 2), staggered so each
 * Tag stays readable; ONE-SHOT (freeze) so the frames come to rest arrived at Switch 2. Reduced motion ⇒ the three
 * tagged frames are parked along the one cable (a complete, correct still frame — same direction, same labels). Book
 * scope only: Switch 1 / Switch 2, VLAN 10/20/30, Tag — no Dot1Q term (PDF 152), no sub-interfaces, no router
 * (PDF 150+).
 */
const VLANS = [10, 20, 30];
const START_X = 104, END_X = 276, LANE_Y = 70;   // the single trunk cable path, Switch 1 → Switch 2
export default function TrunkMultiVlan({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏Trunk = كابل واحد يحمل عدة VLAN</text>

      {/* the two switches and the single trunk cable between them */}
      <g data-trunk="1">
        <line className="eb-visual-link is-strong" x1="86" y1={LANE_Y} x2="294" y2={LANE_Y} strokeWidth="4" />
        <text className="eb-visual-zone-label" x="190" y="50" textAnchor="middle">Trunk</text>
      </g>
      <rect className="eb-visual-switch-box" x="40" y="56" width="46" height="28" rx="6" />
      <text className="eb-visual-node-label is-inverse" x="63" y={LANE_Y} textAnchor="middle" dominantBaseline="central">Switch 1</text>
      <rect className="eb-visual-switch-box" x="294" y="56" width="46" height="28" rx="6" />
      <text className="eb-visual-node-label is-inverse" x="317" y={LANE_Y} textAnchor="middle" dominantBaseline="central">Switch 2</text>

      {/* the three tagged frames on the ONE trunk cable — each keeps its VLAN Tag and travels Switch 1 → Switch 2.
          Motion staggers them (0.3s apart) so every Tag is readable; one-shot (freeze) leaves them arrived at Switch 2.
          Under reduced motion each frame is parked at a fixed point along the SAME cable (a complete still frame). */}
      {VLANS.map((v, i) => {
        const parkedX = START_X + i * 58;               // still-frame position along the cable
        return (
          <g key={v} data-tagvlan={v} className="eb-visual-packet" transform={`translate(${reducedMotion ? parkedX : START_X} ${LANE_Y})`}>
            <rect x="-22" y="-13" width="44" height="26" rx="5" />
            <text className="eb-visual-token is-inverse" x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="11">Tag {v}</text>
            {!reducedMotion && (
              <animateTransform attributeName="transform" type="translate" begin={`${0.3 + i * 0.6}s`} dur="1.6s"
                fill="freeze" from={`${START_X} ${LANE_Y}`} to={`${END_X} ${LANE_Y}`} />
            )}
          </g>
        );
      })}

      {/* the three VLANs the one trunk carries (numbers kept explicit) */}
      <text className="eb-visual-part-label" x="190" y="112" textAnchor="middle">‏VLAN 10 · VLAN 20 · VLAN 30 — على نفس الكابل</text>

      {/* the contrast: without a trunk, one cable per VLAN */}
      <text className="eb-visual-part-label" x="190" y="150" textAnchor="middle">‏بدون Trunk: كابل منفصل لكل VLAN</text>
      {VLANS.map((v, i) => (
        <line key={v} className="eb-visual-link is-faint" x1={120 + i * 68} y1="162" x2={172 + i * 68} y2="162" />
      ))}
      <text className="eb-visual-caption-svg" x="190" y="200" textAnchor="middle">‏كابل واحد + Tag لكل حزمة يميّز VLAN · Access لجهاز واحد، Trunk لعدة VLAN</text>
    </svg>
  );
}
