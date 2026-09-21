import type { LearningVisualProps } from "../../types";

/**
 * «مقدمة DHCP» (Book 791381, PDF 169) — the automatic-configuration idea, enriched (teacher-authorized, unit-level:
 * PDF 169–176) to show the TWO ways a network can provide DHCP: (A) a Router acting as the DHCP server, or (B) a
 * dedicated DHCP server. Either way a new client automatically receives the same three settings — IP, Gateway and
 * DNS — instead of a technician typing each value by hand. Motion TEACHES "automatically": the three settings reveal
 * one after another and freeze (one-shot, no loop). Reduced motion ⇒ the three settings shown already delivered.
 * Scope: the automatic-delivery idea, the two source methods and the three settings only — NOT the four-stage DORA
 * exchange, and no addresses, pool ranges or CLI commands (those are later pages in the unit).
 */
const SETTINGS: [string, string][] = [
  ["IP", "عنوان IP"],
  ["Gateway", "البوابة"],
  ["DNS", "خادم DNS"],
];
export default function DhcpAutomaticConfig({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const rowY = (i: number) => 70 + i * 34;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 232"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏DHCP تلقائيًا — بطريقتين</text>

      {/* two DHCP source methods on the left */}
      <g data-source="router">
        <rect className="eb-visual-router" x="14" y="44" width="96" height="40" rx="7" />
        <text className="eb-visual-node-label is-inverse" x="62" y="60" textAnchor="middle" dominantBaseline="central" fontSize="11">راوتر</text>
        <text className="eb-visual-meta is-inverse" x="62" y="74" textAnchor="middle" dominantBaseline="central">كخادم DHCP</text>
      </g>
      <g data-source="server">
        <rect className="eb-visual-server" x="14" y="132" width="96" height="40" rx="7" />
        <text className="eb-visual-node-label is-inverse" x="62" y="148" textAnchor="middle" dominantBaseline="central" fontSize="11">خادم DHCP</text>
        <text className="eb-visual-meta is-inverse" x="62" y="162" textAnchor="middle" dominantBaseline="central">مخصّص</text>
      </g>
      <text className="eb-visual-part-label" x="62" y="104" textAnchor="middle" fill="var(--eb-success)">أيّهما — تلقائيًا</text>

      {/* both methods converge; the three settings are delivered automatically (one-shot reveal, freeze) */}
      <line className="eb-visual-link" x1="110" y1="64" x2="150" y2="104" />
      <line className="eb-visual-link" x1="110" y1="152" x2="150" y2="118" />
      {SETTINGS.map(([token, label], i) => (
        <g key={token} data-setting={token} opacity={reducedMotion ? 1 : 0}>
          {!reducedMotion && (
            <animate id={`cfg${i}`} attributeName="opacity"
              begin={i === 0 ? "0.4s" : `cfg${i - 1}.end`} dur="0.6s" values="0;1" fill="freeze" />
          )}
          <rect className="eb-visual-seg is-v6" x="150" y={rowY(i) - 14} width="128" height="26" rx="6" />
          <text className="eb-visual-token" x="164" y={rowY(i) - 1} dominantBaseline="central" fontSize="11" direction="ltr">{token}</text>
          {/* Arabic gloss: MIDDLE-anchored (an end-anchored RTL string would spill right, past the box onto the client) */}
          <text className="eb-visual-meta" x="230" y={rowY(i) - 1} textAnchor="middle" dominantBaseline="central">{label}</text>
        </g>
      ))}

      {/* the new client on the right */}
      <line className="eb-visual-link" x1="278" y1="104" x2="296" y2="112" />
      <g data-node="client">
        <rect className="eb-visual-node is-target" x="296" y="84" width="70" height="56" rx="7" />
        <text className="eb-visual-node-label" x="331" y="104" textAnchor="middle" dominantBaseline="central" fontSize="11">جهاز جديد</text>
        <text className="eb-visual-meta" x="331" y="124" textAnchor="middle" dominantBaseline="central">ينضمّ للشبكة</text>
      </g>

      <text className="eb-visual-caption-svg" x="190" y="204" textAnchor="middle">‏الراوتر أو خادم مخصّص — كلاهما يعطي الجهاز عنوان IP والبوابة و DNS تلقائيًا</text>
      <text className="eb-visual-meta" x="190" y="220" textAnchor="middle">بلا إدخال يدوي لكل جهاز</text>
    </svg>
  );
}
