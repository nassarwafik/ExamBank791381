import type { LearningVisualProps } from "../../types";

/**
 * «Distance Vector / Link-State» (Book 791381, PDF 212) — the two families of dynamic routing differ in WHEN they send
 * updates: a Distance Vector protocol (example EIGRP) sends updates periodically, on a timer; a Link-State protocol
 * (example OSPF) sends an update only when something changes and builds a full map. Motion TEACHES that difference:
 * the Distance Vector side emits repeated periodic pulses (a steady loop that leaves no stale state), while the
 * Link-State side sends a single update triggered by a change (one-shot, freeze). Reduced motion ⇒ the two labelled
 * panels shown statically. Book scope: the two update behaviours and their example protocols only — no metric values,
 * AD numbers, areas or commands.
 */
export default function RoutingUpdateTypes({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 196"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏نوعان من التوجيه الديناميكي</text>

      {/* Distance Vector — periodic updates */}
      <g data-update="periodic">
        <rect className="eb-visual-seg is-v4" x="20" y="40" width="160" height="118" rx="8" />
        <text className="eb-visual-node-label" x="100" y="60" textAnchor="middle" fontSize="12">Distance Vector</text>
        <text className="eb-visual-meta" x="100" y="78" textAnchor="middle">تحديثات دورية (بمؤقّت)</text>
        <text className="eb-visual-token" x="100" y="98" textAnchor="middle" fontSize="10">EIGRP</text>
        {[0, 1, 2].map(k => (
          <circle key={k} className="eb-visual-dot" cx={52 + k * 32} cy="126" r="6" opacity={reducedMotion ? 1 : 0.3}>
            {!reducedMotion && <animate attributeName="opacity" begin={`${k * 0.4}s`} dur="1.2s" values="0.3;1;0.3" repeatCount="indefinite" />}
          </circle>
        ))}
        <text className="eb-visual-meta" x="100" y="150" textAnchor="middle">كل فترة زمنية</text>
      </g>

      {/* Link-State — update only on change */}
      <g data-update="on-change">
        <rect className="eb-visual-seg is-v6" x="200" y="40" width="160" height="118" rx="8" />
        <text className="eb-visual-node-label" x="280" y="60" textAnchor="middle" fontSize="12">Link-State</text>
        <text className="eb-visual-meta" x="280" y="78" textAnchor="middle">تحديث عند التغيير + خريطة كاملة</text>
        <text className="eb-visual-token" x="280" y="98" textAnchor="middle" fontSize="10">OSPF</text>
        <circle className="eb-visual-dot is-response" cx="240" cy="126" r="6" opacity={reducedMotion ? 1 : 0}>
          {!reducedMotion && <animate id="lsPulse" attributeName="opacity" begin="0.5s" dur="0.8s" values="0;1;1" keyTimes="0;0.6;1" fill="freeze" />}
        </circle>
        <text className="eb-visual-meta" x="292" y="130" dominantBaseline="central">عند حدوث تغيير فقط</text>
      </g>
      <text className="eb-visual-caption-svg" x="190" y="184" textAnchor="middle">‏Distance Vector يرسل دوريًا · Link-State يرسل عند التغيير ويبني خريطة كاملة</text>
    </svg>
  );
}
