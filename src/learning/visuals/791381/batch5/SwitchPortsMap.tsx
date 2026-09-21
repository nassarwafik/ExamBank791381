import type { LearningVisualProps } from "../../types";

/**
 * «منافذ السويتش» / «برمجة المنافذ من CLI» (Book 791381, PDF 123–124) — every switch port has a name used in
 * programming: FastEthernet ports F0/1 … F0/24 (first port F0/1, counted from the left) and the faster Gigabit ports
 * G0/1, G0/2. Before programming, we pick the right port. Motion TEACHES the CLI→port link: the `interface f0/1`
 * selection lights up, and ONLY THEN the matching physical port is highlighted. Reduced motion ⇒ the panel with the
 * selected port shown statically. No fake full-device Cisco UI, no invented ports.
 */
const COLS = 12;
const px = (col: number) => 20 + col * 24;
export default function SwitchPortsMap({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 176"
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
      {/* selection highlight on F0/1 (motion: appears only after the CLI selection) */}
      {!reducedMotion && (
        <rect data-highlight="1" className="eb-visual-node is-target" x={px(0)} y="44" width="20" height="20" rx="3" opacity="0">
          <animate id="portSel" attributeName="opacity" begin="portCmd.end" dur="1.4s" values="0;1;1;0" keyTimes="0;0.15;0.8;1" />
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
      {/* CLI selection */}
      <rect data-cmd="1" className="eb-visual-seg is-v4" x="90" y="112" width="200" height="26" rx="6" opacity={reducedMotion ? 1 : 0}>
        {!reducedMotion && <animate id="portCmd" attributeName="opacity" begin="0s;portSel.end" dur="1.0s" values="0;1;1" keyTimes="0;0.5;1" fill="freeze" />}
      </rect>
      <text className="eb-visual-token" x="190" y="125" textAnchor="middle" dominantBaseline="central" direction="ltr" opacity={reducedMotion ? 1 : 0}>
        interface f0/1
        {!reducedMotion && <animate attributeName="opacity" begin="0s;portSel.end" dur="1.0s" values="0;1;1" keyTimes="0;0.5;1" fill="freeze" />}
      </text>
      <text className="eb-visual-caption-svg" x="190" y="164" textAnchor="middle">‏نختار المنفذ الصحيح (interface f0/1) قبل كتابة أوامر البرمجة</text>
    </svg>
  );
}
