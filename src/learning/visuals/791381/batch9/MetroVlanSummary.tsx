import type { LearningVisualProps } from "../../types";

/**
 * «Metro-Ethernet و VLAN» (Book 791381, PDF 250) — the summary's relationship: Metro-Ethernet is a fiber network that
 * connects several branches/schools at high speed (a PHYSICAL link), while VLANs divide the network logically inside
 * that same infrastructure to isolate customers (a LOGICAL separation). Two branches connect through one shared
 * Metro-Ethernet fiber, and inside it customer VLAN A and VLAN B are physically carried together but logically
 * isolated. Purely a still summary (no motion). Book scope: exactly the PDF250 terms — NO HDLC, no invented provider
 * topology or technology.
 */
export default function MetroVlanSummary({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 224"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏Metro-Ethernet يربط فيزيائيًّا · VLAN تفصل منطقيًّا</text>

      {/* the two branches */}
      <g data-node="branchA">
        <rect className="eb-visual-node is-target" x="14" y="54" width="78" height="34" rx="6" />
        <text className="eb-visual-node-label" x="53" y="67" textAnchor="middle" dominantBaseline="central" fontSize="10">فرع / مدرسة</text>
        <text className="eb-visual-node-label" x="53" y="79" textAnchor="middle" dominantBaseline="central" fontSize="10">A</text>
      </g>
      <g data-node="branchB">
        <rect className="eb-visual-node is-target" x="288" y="54" width="78" height="34" rx="6" />
        <text className="eb-visual-node-label" x="327" y="67" textAnchor="middle" dominantBaseline="central" fontSize="10">فرع / مدرسة</text>
        <text className="eb-visual-node-label" x="327" y="79" textAnchor="middle" dominantBaseline="central" fontSize="10">B</text>
      </g>

      {/* the shared Metro-Ethernet fiber infrastructure (physical) */}
      <line className="eb-visual-link" x1="92" y1="71" x2="132" y2="71" stroke="var(--eb-primary)" />
      <line className="eb-visual-link" x1="248" y1="71" x2="288" y2="71" stroke="var(--eb-primary)" />
      <g data-infra="metro-ethernet">
        <rect className="eb-visual-cloud" x="132" y="54" width="116" height="34" rx="14" />
        <text className="eb-visual-node-label is-inverse" x="190" y="71" textAnchor="middle" dominantBaseline="central" fontSize="10" direction="ltr">Metro-Ethernet</text>
      </g>
      <text className="eb-visual-meta" x="190" y="102" textAnchor="middle">ألياف تربط الفروع فيزيائيًّا</text>

      {/* inside the same infrastructure: two logically isolated VLANs */}
      <text className="eb-visual-part-label" x="190" y="120" textAnchor="middle">داخل البنية نفسها — عزل منطقي للعملاء</text>
      <g data-vlan="A">
        <rect className="eb-visual-zone" x="40" y="128" width="140" height="34" rx="6" stroke="var(--eb-success)" strokeDasharray="5 4" />
        <text className="eb-visual-node-label" x="110" y="140" textAnchor="middle" dominantBaseline="central" fontSize="10" direction="ltr">VLAN A — العميل A</text>
        <text className="eb-visual-meta" x="110" y="153" textAnchor="middle" dominantBaseline="central">معزول منطقيًّا</text>
      </g>
      <g data-vlan="B">
        <rect className="eb-visual-zone" x="200" y="128" width="140" height="34" rx="6" stroke="var(--eb-primary)" strokeDasharray="5 4" />
        <text className="eb-visual-node-label" x="270" y="140" textAnchor="middle" dominantBaseline="central" fontSize="10" direction="ltr">VLAN B — العميل B</text>
        <text className="eb-visual-meta" x="270" y="153" textAnchor="middle" dominantBaseline="central">معزول منطقيًّا</text>
      </g>

      <text className="eb-visual-caption-svg" x="190" y="188" textAnchor="middle">‏البنية الفيزيائية واحدة، و VLAN تفصل حركة كل عميل عن الآخر</text>
      <text className="eb-visual-caption-svg" x="190" y="206" textAnchor="middle">‏Metro-Ethernet = ربط المواقع · VLAN = فصل منطقي داخلها</text>
    </svg>
  );
}
