import type { LearningVisualProps } from "../../types";

/**
 * «منافذ السويتش» / «برمجة المنافذ من CLI» (Book 791381, PDF 123–124) — every port has a name: FastEthernet F0/1 … F0/24
 * (first port F0/1, from the left) and the faster Gigabit ports G0/1, G0/2. Before programming we CHOOSE the correct
 * port. PDF 124 gives the steps in WORDS only (choose the port/group → pick Access or Trunk → associate a VLAN) and its
 * clarification says the actual commands come later — so this visual shows PORT SELECTION, never a CLI command (no
 * `interface f0/1`). Motion is one-shot: the chosen port F0/1 is highlighted and labelled, ending in the selected
 * state. Reduced motion ⇒ the panel with F0/1 already selected.
 */
const COLS = 12;
const px = (col: number) => 20 + col * 24;
export default function SwitchPortsMap({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 188"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏واجهة السويتش من الأمام — لكل منفذ اسم</text>
      {/* chassis */}
      <rect className="eb-visual-switch-box" x="12" y="34" width="356" height="64" rx="8" />
      {/* 24 FastEthernet ports in two rows */}
      {Array.from({ length: COLS }).map((_, col) => [0, 1].map(row => {
        const idx = row * COLS + col + 1;   // F0/1 .. F0/24
        const selected = idx === 1;
        return (
          <rect key={`p${idx}`} data-fe={idx} data-selected={selected ? "1" : undefined}
            className={"eb-visual-node" + (selected && reducedMotion ? " is-target" : "")}
            x={px(col)} y={44 + row * 26} width="20" height="20" rx="3" />
        );
      }))}
      {/* selection highlight on F0/1 — one-shot, appears and stays (no CLI command) */}
      {!reducedMotion && (
        <rect data-highlight="1" className="eb-visual-node is-target" x={px(0)} y="44" width="20" height="20" rx="3" opacity="0">
          <animate id="portSel" attributeName="opacity" begin="portLabel.end" dur="0.6s" values="0;1" fill="freeze" />
        </rect>
      )}
      <text className="eb-visual-meta" x={px(0) + 10} y="90" textAnchor="middle">F0/1</text>
      <text className="eb-visual-meta" x={px(11) + 10} y="90" textAnchor="middle">F0/24</text>
      {/* Gigabit ports */}
      <rect className="eb-visual-octet is-network" x="316" y="44" width="22" height="20" rx="3" />
      <text className="eb-visual-bit-label" x="327" y="54" textAnchor="middle" dominantBaseline="central" fontSize="9">G0/1</text>
      <rect className="eb-visual-octet is-network" x="342" y="44" width="22" height="20" rx="3" />
      <text className="eb-visual-bit-label" x="353" y="54" textAnchor="middle" dominantBaseline="central" fontSize="9">G0/2</text>
      <text className="eb-visual-meta" x="340" y="90" textAnchor="middle">Gigabit أسرع</text>
      {/* port SELECTION (concept, not a command) */}
      <g data-select="1" opacity={reducedMotion ? 1 : 0}>
        <rect className="eb-visual-seg is-v4" x="120" y="110" width="140" height="26" rx="6" />
        <text className="eb-visual-node-label" x="190" y="123" textAnchor="middle" dominantBaseline="central">نحدّد المنفذ F0/1</text>
        {!reducedMotion && <animate id="portLabel" attributeName="opacity" begin="0.2s" dur="0.7s" values="0;1;1" keyTimes="0;0.5;1" fill="freeze" />}
      </g>
      {/* PDF 124 conceptual stages — words only, no command syntax */}
      <text className="eb-visual-caption-svg" x="190" y="156" textAnchor="middle">‏اختيار المنفذ · تحديد Access / Trunk · ربطه بـ VLAN</text>
      <text className="eb-visual-meta" x="190" y="174" textAnchor="middle">‏نختار المنفذ الصحيح قبل كتابة أوامر البرمجة</text>
    </svg>
  );
}
