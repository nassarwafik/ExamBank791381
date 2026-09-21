import type { LearningVisualProps } from "../../types";

/**
 * «Port Security» (Book 791381, PDF 180) — the CONCEPT page (before any scenario): a switch port controls WHO may
 * connect, deciding by the device's MAC address. A device with a known/allowed MAC is let through; an unknown device
 * is denied. Motion TEACHES the decision: the allowed side is admitted, then the denied mark reveals for the unknown
 * device (one-shot, freeze). Reduced motion ⇒ both outcomes shown statically. Book scope for THIS page: the
 * allow-known / deny-unknown idea keyed on MAC only — NOT the PDF 181 scenario's specific hosts (PC0 / PC1 / a named
 * stranger) and NOT the configuration keywords (sticky, maximum) from the CLI pages (PDF 182+).
 */
export default function PortSecurityConcept({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏المنفذ يقرّر بحسب عنوان MAC</text>

      {/* the switch with the protected port */}
      <g data-node="switch">
        <rect className="eb-visual-switch-box" x="150" y="86" width="80" height="40" rx="6" />
        <text className="eb-visual-node-label is-inverse" x="190" y="106" textAnchor="middle" dominantBaseline="central" fontSize="11">Switch</text>
        <text className="eb-visual-meta" x="190" y="140" textAnchor="middle">منفذ محمي</text>
      </g>

      {/* allowed: a device whose MAC is known */}
      <g data-outcome="allow">
        <line className="eb-visual-link is-strong" x1="150" y1="100" x2="96" y2="66" />
        <rect className="eb-visual-node is-target" x="20" y="50" width="76" height="32" rx="6" fill="var(--eb-success)" opacity="0.16" stroke="var(--eb-success)" />
        <text className="eb-visual-node-label" x="58" y="62" textAnchor="middle" fontSize="10.5">MAC معروف</text>
        <text className="eb-visual-token" x="58" y="76" textAnchor="middle" fontSize="9">جهاز مسموح</text>
        <text className="eb-visual-part-label" x="112" y="52" fill="var(--eb-success)">✓ يُسمح</text>
      </g>

      {/* denied: an unknown device — the deny mark reveals once, after the allowed path */}
      <g data-outcome="deny" opacity={reducedMotion ? 1 : 0}>
        {!reducedMotion && (
          <animate id="deny" attributeName="opacity" begin="0.7s" dur="0.6s" values="0;1" fill="freeze" />
        )}
        <line className="eb-visual-link is-faint" x1="150" y1="112" x2="96" y2="150" strokeDasharray="5 4" />
        <rect className="eb-visual-node is-target" x="20" y="134" width="76" height="32" rx="6" fill="var(--eb-danger)" opacity="0.14" stroke="var(--eb-danger)" />
        <text className="eb-visual-node-label" x="58" y="146" textAnchor="middle" fontSize="10.5">جهاز مجهول</text>
        <text className="eb-visual-token" x="58" y="160" textAnchor="middle" fontSize="9">غير مسموح</text>
        <text className="eb-visual-part-label" x="112" y="158" fill="var(--eb-danger)">✕ يُمنع</text>
      </g>

      {/* what the port protects toward */}
      <line className="eb-visual-link is-strong" x1="230" y1="106" x2="300" y2="106" />
      <rect className="eb-visual-seg is-v4" x="300" y="90" width="60" height="32" rx="6" />
      <text className="eb-visual-node-label" x="330" y="106" textAnchor="middle" dominantBaseline="central" fontSize="10">الشبكة</text>

      <text className="eb-visual-caption-svg" x="190" y="196" textAnchor="middle">‏Port Security يحمي المنفذ: الجهاز المعروف بعنوان MAC يُسمح له، والجهاز المجهول يُمنع</text>
    </svg>
  );
}
