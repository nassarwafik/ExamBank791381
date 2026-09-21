import type { LearningVisualProps } from "../../types";

/**
 * «Static Route — التوجيه الثابت» (Book 791381, PDF 211) — the network administrator defines a FIXED path by hand,
 * clearly, from the router toward the destination network. Motion TEACHES that the path is administrator-set: one
 * packet follows the fixed route once and freezes at the destination (one-shot, no loop) — it does NOT depict any
 * protocol learning a route. Reduced motion ⇒ the fixed route shown drawn. It stays strictly at PDF 211's level: a
 * manual, clearly-defined, resource-light path for small simple networks; it introduces NO dynamic-protocol behaviour
 * (no learning, no automatic updates, no OSPF/EIGRP). Book scope: an admin-defined fixed route + its page traits
 * (manual · small networks · light on resources).
 */
export default function StaticRoutePath({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const routePath = "M 150 96 L 300 96";
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏مسار ثابت يحدّده المدير يدويًا</text>

      {/* the administrator sets the route by hand */}
      <g data-role="admin">
        <rect className="eb-visual-node is-target" x="20" y="76" width="74" height="40" rx="7" />
        <text className="eb-visual-node-label" x="57" y="92" textAnchor="middle" dominantBaseline="central" fontSize="10.5">مدير الشبكة</text>
        <text className="eb-visual-meta" x="57" y="108" textAnchor="middle">يكتب المسار</text>
      </g>
      <line className="eb-visual-link is-strong" x1="94" y1="96" x2="118" y2="96" />

      {/* the router */}
      <g data-role="router">
        <rect className="eb-visual-router" x="118" y="80" width="64" height="32" rx="7" />
        <text className="eb-visual-node-label is-inverse" x="150" y="96" textAnchor="middle" dominantBaseline="central" fontSize="11">Router</text>
      </g>

      {/* the fixed route toward the destination network */}
      <g data-route="static">
        <line className="eb-visual-route" x1="150" y1="96" x2="300" y2="96" strokeWidth="3" />
        <text className="eb-visual-token" x="225" y="86" textAnchor="middle" fontSize="9">مسار ثابت — يدوي بوضوح</text>
      </g>
      <g data-role="destination">
        <rect className="eb-visual-seg is-v4" x="300" y="78" width="60" height="36" rx="7" />
        <text className="eb-visual-node-label" x="330" y="96" textAnchor="middle" dominantBaseline="central" fontSize="10">الشبكة الهدف</text>
      </g>

      {/* one packet follows the fixed route once, then freezes at the destination (one-shot) */}
      {!reducedMotion && (
        <g className="eb-visual-packet">
          <rect x="-5" y="-5" width="10" height="10" rx="2" />
          <animateMotion id="stroll" begin="0.4s" dur="1.1s" fill="freeze" path={routePath} />
        </g>
      )}

      {/* the page's traits of a static route */}
      <text className="eb-visual-part-label" x="190" y="146" textAnchor="middle">يدوي بوضوح · مناسب للشبكات الصغيرة · لا يستهلك موارد كثيرة</text>
      <text className="eb-visual-meta" x="190" y="166" textAnchor="middle">أيّ تغيير يحتاج تعديلًا يدويًا من المدير</text>
      <text className="eb-visual-caption-svg" x="190" y="196" textAnchor="middle">‏التوجيه الثابت: المدير يحدّد المسار يدويًا من الراوتر إلى الشبكة الهدف</text>
    </svg>
  );
}
