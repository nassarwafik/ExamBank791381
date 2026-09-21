import type { LearningVisualProps } from "../../types";

/**
 * «Session Hijacking / MitM» (Book 791381, PDF 110) — book-level distinction only. Session Hijacking: the attacker
 * takes control of an ALREADY-OPEN session between two parties. Man-in-the-Middle: the attacker sits BETWEEN the two
 * parties so all traffic passes through them (readable/alterable). Two panels make the topology difference explicit:
 * hijacking shows a direct user↔server session that the attacker seizes from the side; MitM shows user→attacker→server
 * in a line. Motion is causal (session first, then takeover). No operational attack instructions. Reduced motion ⇒ still.
 */
export default function HijackingVsMitm({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const node = (x: number, y: number, label: string, cls = "eb-visual-node", extra: Record<string, string> = {}) => (
    <g {...extra}><rect className={cls} x={x - 26} y={y - 14} width="52" height="28" rx="6" /><text className="eb-visual-node-label" x={x} y={y} textAnchor="middle" dominantBaseline="central">{label}</text></g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 220"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* ── Session Hijacking — direct session, attacker seizes it from the side ── */}
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle" direction="ltr">Session Hijacking</text>
      <line data-session="1" className="eb-visual-link is-strong" x1="86" y1="60" x2="294" y2="60" />
      {node(60, 60, "المستخدم")}
      {node(320, 60, "الخادم")}
      {/* the session runs FIRST; only after it is established does the attacker's takeover appear and move into it —
          so the MOTION teaches that an ALREADY-OPEN session is being seized. Reduced motion shows the takeover statically. */}
      {!reducedMotion ? (
        <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" /><animateMotion id="hjSession" begin="0s;hjTakeover.end" dur="1.4s" fill="freeze" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear" path="M 86 60 L 294 60" /></g>
      ) : <rect className="eb-visual-packet-static" x="185" y="55" width="10" height="10" rx="2" />}
      {/* attacker takeover — hidden until the session is established (begins on hjSession.end), then seizes the open session */}
      <g data-hijack="1" opacity={reducedMotion ? 1 : 0}>
        <rect className="eb-visual-node is-dim" x="164" y="94" width="52" height="26" rx="6" stroke="var(--eb-danger)" />
        <text className="eb-visual-node-label" x="190" y="107" textAnchor="middle" dominantBaseline="central">مهاجم</text>
        <line className="eb-visual-link" x1="190" y1="94" x2="190" y2="74" stroke="var(--eb-danger)" strokeDasharray="4 4" />
        <path className="eb-visual-pin" d="M186 70 l4 8 4 -8 z" />
        {!reducedMotion && <animate id="hjTakeover" attributeName="opacity" begin="hjSession.end" dur="1.3s" values="0;1;1;0" keyTimes="0;0.25;0.75;1" />}
      </g>
      <text className="eb-visual-part-label" x="190" y="134" textAnchor="middle">يستولي على جلسة مفتوحة أصلًا</text>

      {/* ── MitM — attacker BETWEEN the two parties ── */}
      <text className="eb-visual-row-label" x="190" y="164" textAnchor="middle" direction="ltr">MitM</text>
      <line className="eb-visual-link is-strong" x1="86" y1="194" x2="164" y2="194" />
      <line className="eb-visual-link is-strong" x1="216" y1="194" x2="294" y2="194" />
      {node(60, 194, "المستخدم", "eb-visual-node", { "data-role": "user", "data-x": "60" })}
      {node(190, 194, "مهاجم", "eb-visual-node is-target", { "data-mitm": "1", "data-role": "attacker", "data-x": "190" })}
      {node(320, 194, "الخادم", "eb-visual-node", { "data-role": "server", "data-x": "320" })}
      {!reducedMotion ? (
        <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" /><animateMotion dur="2.6s" repeatCount="indefinite" keyPoints="0;0.5;1;0.5;0" keyTimes="0;0.25;0.5;0.75;1" calcMode="linear" path="M 86 194 L 190 194 L 294 194" /></g>
      ) : <rect className="eb-visual-packet-static" x="185" y="189" width="10" height="10" rx="2" />}
      <text className="eb-visual-caption-svg" x="190" y="214" textAnchor="middle">الاستيلاء يأخذ جلسة قائمة · MitM يمرّ كل شيء عبر المهاجم</text>
    </svg>
  );
}
