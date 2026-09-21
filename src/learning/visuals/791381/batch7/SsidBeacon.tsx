import type { LearningVisualProps } from "../../types";

/**
 * «SSID — اسم شبكة Wi-Fi» (Book 791381, PDF 162) — the SSID is the wireless network NAME that appears to the user; the
 * router or Access Point broadcasts it so the network becomes visible and a device can find and select it. Motion
 * TEACHES that broadcast as a finite ONE-SHOT sequence: the SSID name label starts near the Access Point and visibly
 * TRAVELS across to the device (ssidMove, animateMotion); ONLY AFTER it arrives (begin="ssidMove.end") the device's
 * "found the network name" state is revealed, and both freeze in the complete final state. Reduced motion ⇒ the final
 * educational state — Access Point, the SSID arrived at the device, and the device's found state — with ZERO animation.
 * Book scope for PDF 162 ONLY: SSID = the network NAME made visible; no security technology names, encryption or
 * password concepts (those are PDF 163–164).
 */
const AP = { x: 66, y: 92 }, DEV = { x: 312, y: 92 };
export default function SsidBeacon({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 180"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏SSID = اسم الشبكة اللاسلكية الظاهر</text>

      {/* the Access Point broadcasts the name */}
      <rect className="eb-visual-server" x={AP.x - 34} y={AP.y - 18} width="68" height="36" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={AP.x} y={AP.y} textAnchor="middle" dominantBaseline="central" fontSize="10">Access Point</text>
      <text className="eb-visual-meta" x={AP.x} y={AP.y + 32} textAnchor="middle">يبثّ الاسم</text>

      {/* the travel lane */}
      <line className="eb-visual-link is-faint" x1={AP.x + 34} y1={AP.y} x2={DEV.x - 30} y2={DEV.y} strokeDasharray="4 5" />

      {/* the device that will find / select the network name */}
      <rect className="eb-visual-node is-target" x={DEV.x - 28} y={DEV.y - 20} width="56" height="40" rx="6" />
      <text className="eb-visual-node-label" x={DEV.x} y={DEV.y} textAnchor="middle" dominantBaseline="central" fontSize="11">جهاز</text>

      {/* the SSID name label: starts near the AP and TRAVELS to the device (one-shot, freeze) */}
      {!reducedMotion ? (
        <g data-ssid="1">
          <rect className="eb-visual-seg is-v4" x="-26" y="-12" width="52" height="24" rx="6" />
          <text className="eb-visual-token" x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="10">SSID</text>
          <animateMotion id="ssidMove" begin="0.4s" dur="1.1s" fill="freeze" path={`M ${AP.x + 44} ${AP.y} L ${DEV.x - 40} ${DEV.y}`} />
        </g>
      ) : (
        <g data-ssid="1" transform={`translate(${DEV.x - 40} ${DEV.y})`}>
          <rect className="eb-visual-seg is-v4" x="-26" y="-12" width="52" height="24" rx="6" />
          <text className="eb-visual-token" x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="10">SSID</text>
        </g>
      )}

      {/* the device-found state — revealed ONLY after the name arrives */}
      <text className="eb-visual-meta" data-found="1" x={DEV.x} y={DEV.y + 34} textAnchor="middle" fill="var(--eb-success)" opacity={reducedMotion ? 1 : 0}>
        وجد الشبكة ويختارها
        {!reducedMotion && <animate id="ssidFound" attributeName="opacity" begin="ssidMove.end" dur="0.6s" values="0;1" fill="freeze" />}
      </text>

      <text className="eb-visual-caption-svg" x="190" y="156" textAnchor="middle">‏الاسم يُبَثّ فتصبح الشبكة مرئية، فيجدها الجهاز ويختارها</text>
      <text className="eb-visual-meta" x="190" y="172" textAnchor="middle">SSID هو اسم الشبكة الذي تراه عند البحث</text>
    </svg>
  );
}
