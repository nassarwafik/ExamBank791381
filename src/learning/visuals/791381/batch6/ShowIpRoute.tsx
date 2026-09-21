import type { LearningVisualProps } from "../../types";

/**
 * «show ip route» (Book 791381, PDF 222) — how to READ a routing-table line. The page's own sample line
 * `R 192.168.2.0/24 [120/1] via 192.168.1.1` is annotated field by field: the leading code (R = learned via RIP;
 * C = directly connected, O = OSPF, D = EIGRP), the bracket [Administrative Distance / Metric] = [120/1], and
 * `via 192.168.1.1` = the next-hop. Static diagram (no motion): the line with callouts, complete as a still frame.
 * Book scope: reading the fields of the book's sample output only — no new routes or commands.
 */
export default function ShowIpRoute({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏قراءة سطر من جدول التوجيه</text>

      {/* the sample line, split into labelled fields */}
      <rect className="eb-visual-seg" x="16" y="40" width="348" height="34" rx="6" />
      <text className="eb-visual-token" data-field="code" x="34" y="62" fontSize="13" fill="var(--eb-primary-strong)">R</text>
      <text className="eb-visual-token" x="70" y="62" fontSize="12">192.168.2.0/24</text>
      <text className="eb-visual-token" data-field="admetric" x="196" y="62" fontSize="12">[120/1]</text>
      <text className="eb-visual-token" data-field="nexthop" x="250" y="62" fontSize="11">via 192.168.1.1</text>

      {/* callouts */}
      <text className="eb-visual-part-label" x="36" y="96" textAnchor="middle">الكود</text>
      <text className="eb-visual-meta" x="36" y="110" textAnchor="middle">R = RIP</text>
      <text className="eb-visual-part-label" x="212" y="96" textAnchor="middle">[AD / Metric]</text>
      <text className="eb-visual-meta" x="212" y="110" textAnchor="middle">120 = المسافة الإدارية · 1 = Metric</text>
      <text className="eb-visual-part-label" x="300" y="128" textAnchor="middle">via = القفزة التالية</text>

      {/* the codes legend + a couple of sample lines */}
      <text className="eb-visual-part-label" x="20" y="150">الرموز:</text>
      <text className="eb-visual-meta" x="70" y="150">C = directly connected · O = OSPF · D = EIGRP · R = RIP</text>
      <text className="eb-visual-token" x="20" y="172" fontSize="10">C 192.168.1.0/24 · O 10.0.0.0/24 [110/2]</text>
      <text className="eb-visual-caption-svg" x="190" y="198" textAnchor="middle">‏الكود يدلّ على مصدر المسار، والقوسان [AD/Metric]، و via عنوان القفزة التالية</text>
    </svg>
  );
}
