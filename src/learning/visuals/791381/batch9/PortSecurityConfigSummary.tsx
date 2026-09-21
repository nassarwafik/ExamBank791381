import type { LearningVisualProps } from "../../types";

/**
 * «تأمين المنفذ Port Security — ملخّص الإعداد» (Book 791381, PDF 255) — the page's configuration chain and its three
 * violation policies, at the summary level. The port is first put in Access mode, Port Security is enabled, a
 * Maximum of 2 devices is allowed, MAC addresses are learned Sticky, and a Violation policy is chosen. The three
 * printed violation outcomes are shown exactly: Shutdown (closes the port → err-disabled), Restrict (drop + alert),
 * Protect (drop, no alert). Purely a still summary (no motion) — the page already carries the live CLI simulator, so
 * this draws NO terminal and NO invented output. Book scope: exactly the printed steps and violation meanings — no
 * device names, no MAC values.
 */
const STEPS: [string, string][] = [
  ["Access", "switchport mode access"],
  ["Port Security", "تفعيل الميزة"],
  ["Maximum 2", "جهازان على الأكثر"],
  ["Sticky", "تعلّم MAC تلقائيًّا"],
  ["Violation", "سياسة المخالفة"],
];
const VIOLATIONS: [string, string][] = [
  ["Shutdown", "إغلاق المنفذ · err-disabled"],
  ["Restrict", "إسقاط + تنبيه"],
  ["Protect", "إسقاط بلا تنبيه"],
];
export default function PortSecurityConfigSummary({ ariaLabel, className }: LearningVisualProps) {
  const SX = 44, SW = 292, RH = 22;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 268"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="18" textAnchor="middle">‏تأمين المنفذ Port Security</text>

      {/* the port, then the ordered configuration chain */}
      <rect className="eb-visual-node is-target" x="150" y="26" width="80" height="18" rx="5" />
      <text className="eb-visual-node-label" x="190" y="35" textAnchor="middle" dominantBaseline="central" fontSize="10">المنفذ Port</text>
      <line className="eb-visual-link is-faint" x1="190" y1="44" x2="190" y2="54" />
      {STEPS.map(([k, d], i) => {
        const y = 54 + i * RH;
        return (
          <g key={k} data-step={k}>
            <rect className="eb-visual-zone" x={SX} y={y} width={SW} height="19" rx="4" />
            <text className="eb-visual-node-label" x={SX + 10} y={y + 10} dominantBaseline="central" textAnchor="start" fontSize="10.5" direction="ltr">{k}</text>
            <text className="eb-visual-meta" x={SX + SW * 0.66} y={y + 10} dominantBaseline="central" textAnchor="middle">{d}</text>
          </g>
        );
      })}

      {/* the three violation policies, exactly as printed */}
      <text className="eb-visual-part-label" x="190" y="186" textAnchor="middle">سياسات المخالفة الثلاث</text>
      {VIOLATIONS.map(([k, d], i) => {
        const w = 112, gap = 6, x = 16 + i * (w + gap);
        return (
          <g key={k} data-violation={k}>
            <rect className="eb-visual-zone" x={x} y="196" width={w} height="50" rx="7" />
            <text className="eb-visual-node-label" x={x + w / 2} y="212" textAnchor="middle" dominantBaseline="central" fontSize="11" direction="ltr">{k}</text>
            <text className="eb-visual-meta" x={x + w / 2} y="230" textAnchor="middle" dominantBaseline="central">{d}</text>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="262" textAnchor="middle">‏الثلاث تمنع المخالف؛ Shutdown وحده يغلق المنفذ</text>
    </svg>
  );
}
