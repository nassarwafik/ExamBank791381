import type { LearningVisualProps } from "../../types";

/**
 * «منافذ الربط بين السويتشات» (Book 791381, PDF 146) — the page's own table of which physical ports on each switch are
 * the inter-switch links, and therefore the ports that will be configured as Trunk. Static diagram (no motion): the six
 * switches Sw1-HFA … Sw6-HFA, each with its exact trunk-candidate ports, so the "these ports are the links between
 * switches" idea reads at a glance. Book scope for PDF 146 ONLY: the exact switch names and ports (only Sw6-HFA has the
 * Gigabit uplink G0/0) — NO Dot1Q, no sub-interfaces, nothing from PDF 147+.
 */
const SWITCHES: [string, string[]][] = [
  ["Sw1-HFA", ["F0/23", "F0/24"]],
  ["Sw2-HFA", ["F0/22", "F0/23", "F0/24"]],
  ["Sw3-HFA", ["F0/22", "F0/23", "F0/24"]],
  ["Sw4-HFA", ["F0/23", "F0/24"]],
  ["Sw5-HFA", ["F0/22", "F0/23", "F0/24"]],
  ["Sw6-HFA", ["F0/22", "F0/23", "F0/24", "G0/0"]],
];
export default function InterSwitchTrunkPorts({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 250"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏المنافذ التي ستكون Trunk في كل سويتش</text>
      {SWITCHES.map(([name, ports], i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = 16 + col * 184, y = 34 + row * 68;
        return (
          <g key={name} data-switch={name}>
            <rect className="eb-visual-switch-box" x={x} y={y} width="172" height="26" rx="6" />
            <text className="eb-visual-node-label is-inverse" x={x + 86} y={y + 13} textAnchor="middle" dominantBaseline="central" fontSize="12">{name}</text>
            {ports.map((p, k) => {
              const px = x + 6 + k * 42;
              const isG = p.startsWith("G");
              return (
                <g key={p}>
                  <rect className={"eb-visual-seg " + (isG ? "is-v6" : "is-v4")} x={px} y={y + 32} width="38" height="22" rx="4" />
                  <text className="eb-visual-token" x={px + 19} y={y + 43} textAnchor="middle" dominantBaseline="central" fontSize="9.5">{p}</text>
                </g>
              );
            })}
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="244" textAnchor="middle">‏المنافذ بين السويتشات تكون Trunk · فقط Sw6-HFA يحمل منفذ G0/0</text>
    </svg>
  );
}
