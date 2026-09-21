import type { LearningVisualProps } from "../../types";

/**
 * «أوامر الفحص المهمة» (Book 791381, PDF 198) — a decision map for the page's four `show` groups: the student asks
 * "what do I want to inspect?" and the map points to the matching category. The four groups and their commands are the
 * page's EXACT lists. Static diagram (no motion): the central question and the four labelled command groups, complete
 * as a still frame. Book scope for THIS page: the four inspection groups with their exact `show` commands, and the
 * reminder that `show` only inspects and never changes settings — nothing added beyond the page's own commands.
 */
const GROUPS: [string, string, string[]][] = [
  ["vlan-ports", "VLAN & Ports", ["show vlan brief", "show ip interface brief", "show mac-address-table", "show vtp status"]],
  ["port-security", "Port Security", ["show port-security", "show port-security interface F0/1"]],
  ["config", "Config", ["show interfaces", "show running-config", "show startup-config"]],
  ["routing-services", "Routing & Services", ["show arp", "show cdp neighbors", "show ip route", "show ip dhcp pool"]],
];
export default function ShowCommandsMap({ ariaLabel, className }: LearningVisualProps) {
  const pos = (i: number) => ({ x: 16 + (i % 2) * 184, y: 56 + Math.floor(i / 2) * 84 });
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 240"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏ماذا أريد أن أفحص؟ → مجموعة الأمر المناسبة</text>

      {GROUPS.map(([key, title, cmds], i) => {
        const { x, y } = pos(i);
        return (
          <g key={key} data-group={key}>
            <rect className="eb-visual-seg is-v6" x={x} y={y} width="180" height="76" rx="7" />
            <text className="eb-visual-node-label" x={x + 10} y={y + 15} fontSize="11">{title}</text>
            {cmds.map((c, j) => (
              <text key={c} className="eb-visual-token" x={x + 10} y={y + 30 + j * 12} fontSize="8.5">{c}</text>
            ))}
          </g>
        );
      })}

      <text className="eb-visual-caption-svg" x="190" y="230" textAnchor="middle">‏اختر المجموعة بحسب ما تريد فحصه · أوامر show للفحص فقط ولا تغيّر الإعدادات</text>
    </svg>
  );
}
