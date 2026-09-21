import type { LearningVisualProps } from "../../types";

/**
 * «مقدمة DHCP» (Book 791381, PDF 169) — the page's core idea BEFORE any exchange: when a new client joins, DHCP hands
 * it the network settings AUTOMATICALLY — an IP address, a Gateway and a DNS — instead of the technician typing each
 * value by hand. Motion TEACHES "automatically": the three settings arrive at the client one after another and freeze
 * in place (one-shot, no loop). Reduced motion ⇒ the three settings shown already delivered. Book scope for THIS page:
 * the automatic-delivery idea and the three settings only — NOT the four-stage DORA exchange (that is PDF 170), and no
 * addresses, pool ranges or CLI commands (PDF 171+).
 */
const SETTINGS: [string, string][] = [
  ["IP", "عنوان IP"],
  ["Gateway", "البوابة"],
  ["DNS", "خادم DNS"],
];
export default function DhcpAutomaticConfig({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const rowY = (i: number) => 66 + i * 36;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏DHCP يوزّع إعدادات الشبكة تلقائيًا</text>

      {/* the new client on the right, DHCP on the left; settings travel client-ward */}
      <g data-node="dhcp">
        <rect className="eb-visual-server" x="24" y="70" width="72" height="60" rx="7" />
        <text className="eb-visual-node-label is-inverse" x="60" y="94" textAnchor="middle" dominantBaseline="central" fontSize="12">DHCP</text>
        <text className="eb-visual-meta is-inverse" x="60" y="114" textAnchor="middle">مصدر تلقائي</text>
      </g>
      <g data-node="client">
        <rect className="eb-visual-node is-target" x="284" y="70" width="72" height="60" rx="7" />
        <text className="eb-visual-node-label" x="320" y="90" textAnchor="middle" dominantBaseline="central" fontSize="12">جهاز جديد</text>
        <text className="eb-visual-meta" x="320" y="112" textAnchor="middle">ينضمّ للشبكة</text>
      </g>

      {/* the three settings delivered automatically — each reveals once and freezes (one-shot) */}
      {SETTINGS.map(([token, label], i) => (
        <g key={token} data-setting={token} opacity={reducedMotion ? 1 : 0}>
          {!reducedMotion && (
            <animate id={`cfg${i}`} attributeName="opacity"
              begin={i === 0 ? "0.4s" : `cfg${i - 1}.end`} dur="0.6s" values="0;1" fill="freeze" />
          )}
          <rect className="eb-visual-seg is-v6" x="122" y={rowY(i) - 15} width="136" height="26" rx="6" />
          <text className="eb-visual-token" x="140" y={rowY(i) - 1} dominantBaseline="central" fontSize="11">{token}</text>
          <text className="eb-visual-meta" x="248" y={rowY(i) - 1} textAnchor="end" dominantBaseline="central">{label}</text>
        </g>
      ))}
      <text className="eb-visual-part-label" x="190" y="52" textAnchor="middle" fill="var(--eb-success)">تلقائيًا — بلا إدخال يدوي</text>
      <text className="eb-visual-caption-svg" x="190" y="198" textAnchor="middle">‏عند انضمام جهاز جديد يعطيه DHCP عنوان IP والبوابة و DNS تلقائيًا بدل الإدخال اليدوي</text>
    </svg>
  );
}
