import type { LearningVisualProps } from "../../types";

/**
 * «أوامر السويتش والراوتر» (Book 791381, PDF 192) — the reference unit's OPENING page, at its own level only: Cisco
 * devices are generally managed through the CLI, where commands are typed directly to configure the device; the
 * commands differ by device type and version, so the student must understand WHAT a command does and WHEN to use it,
 * and the CLI matters in the practical / programming exam questions. Static diagram (no motion): the Cisco device
 * managed through the CLI plus these source-supported ideas, complete as a still frame. It deliberately shows NO actual
 * commands and NO downstream command FAMILIES (VLAN / VTP / Router on a Stick / Port Security / passwords appear only
 * on the later reference pages PDF 193–197, each with its own CLI simulation). Book scope for THIS page: CLI-managed
 * devices · direct commands to configure · differ by device/version · know a command's function and when · important
 * in practical exams.
 */
const IDEAS = [
  "تختلف حسب نوع الجهاز والإصدار",
  "افهم وظيفة الأمر ومتى يُستخدم",
  "مهم في أسئلة البرمجة والامتحانات العملية",
];
export default function CiscoCliOverview({ ariaLabel, className }: LearningVisualProps) {
  const rowY = (i: number) => 132 + i * 28;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 224"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏أجهزة Cisco تُدار غالبًا عبر CLI</text>

      {/* the device managed through the CLI (two-way) */}
      <g data-node="device">
        <rect className="eb-visual-router" x="30" y="52" width="120" height="46" rx="8" />
        <text className="eb-visual-node-label is-inverse" x="90" y="72" textAnchor="middle" dominantBaseline="central" fontSize="12">جهاز Cisco</text>
        <text className="eb-visual-meta is-inverse" x="90" y="90" textAnchor="middle">سويتش أو راوتر</text>
      </g>
      <g data-node="cli">
        <rect className="eb-visual-seg is-v4" x="230" y="52" width="120" height="46" rx="8" />
        <text className="eb-visual-node-label" x="290" y="72" textAnchor="middle" dominantBaseline="central" fontSize="12">CLI</text>
        <text className="eb-visual-meta" x="290" y="90" textAnchor="middle">سطر الأوامر</text>
      </g>
      {/* two-way link: direct commands configure the device */}
      <line className="eb-visual-link is-strong" x1="150" y1="75" x2="230" y2="75" />
      <path className="eb-visual-marker" d="M 168 68 l -10 7 l 10 7 z" />
      <path className="eb-visual-marker" d="M 212 68 l 10 7 l -10 7 z" />
      <text className="eb-visual-token" x="190" y="64" textAnchor="middle" fontSize="9">أوامر مباشرة</text>
      <text className="eb-visual-meta" x="190" y="112" textAnchor="middle">نكتب أوامر مباشرة لإعداد الجهاز</text>

      {/* the source-supported ideas of the page (no commands, no families) */}
      {IDEAS.map((idea, i) => (
        <g key={i} data-idea={i}>
          <rect className="eb-visual-seg is-v6" x="30" y={rowY(i) - 15} width="320" height="24" rx="5" />
          <text className="eb-visual-meta" x="190" y={rowY(i) - 2} textAnchor="middle">{idea}</text>
        </g>
      ))}

      <text className="eb-visual-caption-svg" x="190" y="220" textAnchor="middle">‏أجهزة Cisco تُدار عبر CLI بأوامر مباشرة — المهم فهم وظيفة الأمر ومتى يُستخدم</text>
    </svg>
  );
}
