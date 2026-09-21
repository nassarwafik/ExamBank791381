import type { LearningVisualProps } from "../../types";

/**
 * «خريطة أوامر الفحص CMD و Show» (Book 791381, PDF 262) — a CONCEPTUAL decision map (not a terminal): a question about
 * the network branches to the right command, split by context — Windows/CMD commands run on the computer, Cisco
 * `show` commands run on the device. Every command and its purpose is taken verbatim from the page's two tables; no
 * command OUTPUT is drawn (the page already has a live simulator for that). Purely still (no motion). Book scope:
 * exactly the printed commands and their purposes — no invented output.
 */
const CMD: [string, string][] = [
  ["ping 8.8.8.8", "اختبار الاتصال"],
  ["tracert", "مسار الوصول"],
  ["ipconfig", "عرض عنوان IP"],
  ["ipconfig /all", "تفاصيل كاملة"],
  ["nslookup", "فحص DNS"],
  ["arp -a", "جدول MAC"],
];
const SHOW: [string, string][] = [
  ["show vlan brief", "VLANs ومنافذها"],
  ["show interfaces trunk", "منافذ Trunk"],
  ["show mac address-table", "جدول MAC"],
  ["show interfaces status", "حالة المنافذ"],
  ["show vtp status", "إعدادات VTP"],
  ["show spanning-tree", "معلومات STP"],
];
const X = 16, W = 348, RH = 22;
export default function TroubleshootingCommandMap({ ariaLabel, className }: LearningVisualProps) {
  const section = (items: [string, string][], y0: number, tag: string, head: string) => (
    <g>
      {/* root → branch connector + header */}
      <line className="eb-visual-link is-faint" x1="190" y1="47" x2="190" y2={y0 - 6} />
      <rect className="eb-visual-node is-target" x={X} y={y0 - 24} width={W} height="20" rx="5" />
      <text className="eb-visual-node-label" x={X + W / 2} y={y0 - 14} textAnchor="middle" dominantBaseline="central" fontSize="10">{head}</text>
      {items.map(([cmd, purpose], i) => {
        const y = y0 + i * RH;
        return (
          <g key={cmd} data-cmd={tag === "cmd" ? cmd : undefined} data-show={tag === "show" ? cmd : undefined}>
            <rect className="eb-visual-zone" x={X} y={y} width={W} height={19} rx="4" />
            <text className="eb-visual-meta" x={X + 10} y={y + 10} dominantBaseline="central" textAnchor="start" direction="ltr" fontSize="10">{cmd}</text>
            <text className="eb-visual-part-label" x={X + W - 60} y={y + 10} dominantBaseline="central" textAnchor="middle" fontSize="10">{purpose}</text>
          </g>
        );
      })}
    </g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 428"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="18" textAnchor="middle">‏السؤال → الأمر المناسب</text>
      <rect className="eb-visual-router" x="140" y="28" width="100" height="18" rx="5" />
      <text className="eb-visual-node-label is-inverse" x="190" y="37" textAnchor="middle" dominantBaseline="central" fontSize="9">المشكلة / السؤال</text>
      {section(CMD, 84, "cmd", "على الحاسوب · CMD")}
      {section(SHOW, 250, "show", "على جهاز الشبكة · Show")}
      <text className="eb-visual-caption-svg" x="190" y="420" textAnchor="middle">‏لكل سؤال أمر مناسب — لا مخرجات مزيّفة</text>
    </svg>
  );
}
