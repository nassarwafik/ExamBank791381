import type { LearningVisualProps } from "../../types";

/**
 * «أوامر السويتش والراوتر» (Book 791381, PDF 192) — the reference unit's OPENING navigation map: Cisco devices are run
 * from the CLI, and this unit gathers the command families that were spread across the earlier units. The map's job is
 * recognition — which FAMILY of commands belongs to which task — so the student can navigate the reference. Static
 * diagram (no motion): the CLI hub and the command families each tagged by its task, complete as a still frame. It is
 * a family/task map ONLY: it names the families this unit collects and NEVER lists their individual commands (those
 * live on the per-family reference pages PDF 193–197, each with its own CLI simulation). Book scope: CLI-managed
 * devices · the command families by task.
 */
const FAMILIES: [string, string, string][] = [
  ["switch-vlan", "السويتش و VLAN", "تجهيز المنافذ وفصل الشبكات"],
  ["vtp", "VTP", "نشر إعدادات VLAN بين السويتشات"],
  ["router-on-a-stick", "Router on a Stick", "التوجيه بين الـ VLAN"],
  ["port-security", "Port Security", "حماية المنافذ"],
  ["passwords", "كلمات المرور", "حماية الجهاز نفسه"],
];
export default function CiscoCommandFamilies({ ariaLabel, className }: LearningVisualProps) {
  const rowY = (i: number) => 60 + i * 28;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 228"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏عائلات أوامر Cisco — أيّ عائلة لأيّ مهمّة</text>

      {/* the CLI hub */}
      <rect className="eb-visual-router" x="24" y="96" width="76" height="40" rx="8" />
      <text className="eb-visual-node-label is-inverse" x="62" y="112" textAnchor="middle" dominantBaseline="central" fontSize="12">CLI</text>
      <text className="eb-visual-meta is-inverse" x="62" y="128" textAnchor="middle">أوامر Cisco</text>

      {/* the families, each tagged by its task (no individual commands) */}
      {FAMILIES.map(([key, name, task], i) => (
        <g key={key} data-family={key}>
          <line className="eb-visual-link" x1="100" y1="116" x2="150" y2={rowY(i)} />
          <rect className="eb-visual-seg is-v6" x="150" y={rowY(i) - 13} width="210" height="24" rx="5" />
          <text className="eb-visual-node-label" x="160" y={rowY(i) - 1} dominantBaseline="central" fontSize="10.5">{name}</text>
          <text className="eb-visual-meta" x="350" y={rowY(i) - 1} textAnchor="end" dominantBaseline="central">{task}</text>
        </g>
      ))}

      <text className="eb-visual-part-label" x="190" y="210" textAnchor="middle">المطلوب: معرفة وظيفة الأمر ومتى يُستخدم — لا الحفظ الأعمى</text>
      <text className="eb-visual-caption-svg" x="190" y="223" textAnchor="middle">‏خريطة تنقّل: كل عائلة أوامر ترتبط بمهمّتها — التفاصيل في صفحات المرجع التالية</text>
    </svg>
  );
}
