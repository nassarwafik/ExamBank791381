import type { LearningVisualProps } from "../../types";

/**
 * «بروتوكولات التوجيه» (Book 791381, PDF 210) — the overview page: routing means choosing the path data takes to reach
 * the needed network, and the page introduces three method categories — Static Route (a manual path the admin writes),
 * OSPF (a smart Link-State protocol that picks the path by speed / Bandwidth) and EIGRP (a Cisco protocol using
 * Bandwidth + Delay). Static diagram (no motion): the definition and the three labelled method cards, complete as a
 * still frame. It stays at PDF 210's level — the short badge each card carries is the page's own — and does NOT leak
 * the per-protocol CONFIG commands from the later pages (PDF 214+). Book scope: routing = path choice · the three
 * method categories with their page badges.
 */
const METHODS: [string, string, string, string][] = [
  ["static", "Static Route", "مسار يدوي يكتبه المدير", "يدوي · بسيط"],
  ["ospf", "OSPF", "يختار الطريق حسب السرعة / Bandwidth", "Link-State"],
  ["eigrp", "EIGRP", "من Cisco — يعتمد على Bandwidth + Delay", "Cisco · متطور"],
];
export default function RoutingMethodsOverview({ ariaLabel, className }: LearningVisualProps) {
  const rowY = (i: number) => 74 + i * 44;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 224"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏التوجيه: اختيار الطريق إلى الشبكة المطلوبة</text>
      <text className="eb-visual-part-label" x="190" y="44" textAnchor="middle">ثلاث طرق للراوتر ليعرف الشبكات البعيدة</text>

      {METHODS.map(([key, name, desc, badge], i) => (
        <g key={key} data-method={key}>
          <rect className="eb-visual-seg is-v6" x="20" y={rowY(i) - 17} width="340" height="36" rx="7" />
          <text className="eb-visual-node-label" x="34" y={rowY(i)} dominantBaseline="central" fontSize="12">{name}</text>
          <text className="eb-visual-meta" x="150" y={rowY(i)} dominantBaseline="central">{desc}</text>
          <rect className="eb-visual-token is-octet" x="286" y={rowY(i) - 10} width="66" height="20" rx="4" />
          <text className="eb-visual-token" x="319" y={rowY(i)} textAnchor="middle" dominantBaseline="central" fontSize="8.5">{badge}</text>
        </g>
      ))}

      <text className="eb-visual-caption-svg" x="190" y="214" textAnchor="middle">‏Static مسار يدوي · OSPF ذكي حسب Bandwidth · EIGRP من Cisco بـ Bandwidth + Delay</text>
    </svg>
  );
}
