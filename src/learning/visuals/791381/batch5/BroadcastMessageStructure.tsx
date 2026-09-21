import type { LearningVisualProps } from "../../types";

/**
 * «مبنى رسالة Broadcast» (Book 791381, PDF 74) — a Broadcast is understood as "for everyone" because its DESTINATION
 * MAC is FF:FF:FF:FF:FF:FF. The teacher-enrichment comparison on the page keeps the SOURCE fields unchanged
 * (IP 192.168.1.10, MAC A0:02:AF:2D:10:22) while only the destination MAC changes from one device
 * (B4:11:C2:07:9E:31, unicast) to FF:FF:FF:FF:FF:FF (broadcast). Motion TEACHES that causal link: the destination MAC
 * flips to all-F, and ONLY THEN the frame is delivered to every device inside the same local Broadcast Domain — the
 * router does not pass it on. Reduced motion ⇒ the broadcast frame + delivery shown statically. Not the generic m16
 * broadcast-domain fan-out: this one is about the FRAME'S destination field.
 */
const SW = { x: 120, y: 150 };
const DEVS = [{ x: 36, y: 150 }, { x: 120, y: 206 }, { x: 204, y: 150 }];
export default function BroadcastMessageStructure({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 236"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* ── the frame: source fields fixed, destination MAC becomes all-F ── */}
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏حقول رسالة Broadcast</text>
      <rect className="eb-visual-seg" x="14" y="30" width="352" height="70" rx="8" />
      {/* source IP (unchanged) */}
      <text className="eb-visual-part-label" x="30" y="46">‏IP المصدر (لا يتغيّر)</text>
      <text className="eb-visual-token" x="30" y="64" direction="ltr">192.168.1.10</text>
      {/* source MAC (unchanged) */}
      <text className="eb-visual-part-label" x="30" y="84">‏MAC المصدر (لا يتغيّر)</text>
      <text className="eb-visual-token" x="30" y="98" direction="ltr" fontSize="11">A0:02:AF:2D:10:22</text>
      {/* destination MAC — the field that changes */}
      <text className="eb-visual-part-label" x="366" y="46" textAnchor="end">‏MAC الهدف</text>
      <g data-dest="1">
        {/* unicast value (one device) — present only while motion plays, fades to reveal broadcast */}
        {!reducedMotion && (
          <text className="eb-visual-token is-octet" data-unicast="1" x="366" y="64" textAnchor="end" direction="ltr" fontSize="11" opacity="1">
            B4:11:C2:07:9E:31
            <animate id="bcUni" attributeName="opacity" begin="0s;bcDeliver.end" dur="1.0s" values="1;1;0" keyTimes="0;0.55;1" />
          </text>
        )}
        {/* broadcast value (everyone) */}
        <text className="eb-visual-token" data-bcast="1" x="366" y="86" textAnchor="end" direction="ltr" fontSize="12" fontWeight="700" opacity={reducedMotion ? 1 : 0}>
          FF:FF:FF:FF:FF:FF
          {!reducedMotion && <animate id="bcChange" attributeName="opacity" begin="bcUni.end" dur="0.9s" values="0;1;1" keyTimes="0;0.5;1" fill="freeze" />}
        </text>
      </g>
      <text className="eb-visual-meta" x="366" y="100" textAnchor="end">‏= أرسِل للجميع محليًا</text>

      {/* ── delivery inside the one Broadcast Domain; router does not pass it ── */}
      <rect className="eb-visual-zone" x="14" y="116" width="252" height="112" rx="12" />
      <text className="eb-visual-zone-label" x="26" y="132">‏Broadcast Domain واحد</text>
      {DEVS.map((d, i) => <line key={i} className="eb-visual-link is-strong" x1={SW.x} y1={SW.y} x2={d.x} y2={d.y} />)}
      <rect className="eb-visual-switch-box" x={SW.x - 22} y={SW.y - 14} width="44" height="28" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={SW.x} y={SW.y} textAnchor="middle" dominantBaseline="central">Switch</text>
      {DEVS.map((d, i) => <rect key={i} className="eb-visual-node is-target" x={d.x - 18} y={d.y - 12} width="36" height="24" rx="5" />)}
      {/* router boundary — broadcast stops here */}
      <line data-boundary="1" className="eb-visual-divider" x1="278" y1="116" x2="278" y2="228" stroke="var(--eb-danger)" strokeDasharray="5 4" />
      <g transform="translate(300 150)"><rect className="eb-visual-router" x="-16" y="-12" width="32" height="24" rx="5" /><text className="eb-visual-node-label" x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="10">راوتر</text></g>
      <text className="eb-visual-part-label" x="322" y="182" textAnchor="middle">لا يعبر</text>
      {/* motion: after the dest becomes all-F, the frame reaches every device (never past the router) */}
      {!reducedMotion ? (
        DEVS.map((d, i) => (
          <g key={i} data-recv="1" className="eb-visual-packet">
            <rect x="-5" y="-5" width="10" height="10" rx="2" />
            <animateMotion id={i === 0 ? "bcDeliver" : undefined} begin="bcChange.end" dur="0.8s" path={`M ${SW.x} ${SW.y} L ${d.x} ${d.y}`} />
          </g>
        ))
      ) : (
        DEVS.map((d, i) => <rect key={i} data-recv="1" className="eb-visual-packet-static" x={(SW.x + d.x) / 2 - 5} y={(SW.y + d.y) / 2 - 5} width="10" height="10" rx="2" />)
      )}
      <text className="eb-visual-caption-svg" x="190" y="232" textAnchor="middle">‏MAC الهدف = FF:FF:FF:FF:FF:FF ⇐ تصل للجميع داخل الشبكة المحلية</text>
    </svg>
  );
}
