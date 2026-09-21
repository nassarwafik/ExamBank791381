import type { LearningVisualProps } from "../../types";

/**
 * «SSID — اسم شبكة Wi-Fi» (Book 791381, PDF 162) — the SSID is the wireless network NAME that appears to the user; the
 * router or Access Point broadcasts it so the network becomes visible and a device can find and select it. Motion
 * TEACHES that broadcast: the name radiates from the Access Point out to a device, which then "sees" the network name
 * (a finite one-shot: the name travels once and the device highlights the found name). Reduced motion ⇒ the Access
 * Point, the broadcast name and the device shown complete. Book scope for PDF 162 ONLY: SSID = the network NAME made
 * visible — no security technology names (PDF 164) and no encryption.
 */
export default function SsidBeacon({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const AP = { x: 80, y: 96 }, DEV = { x: 300, y: 96 };
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 180"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏SSID = اسم الشبكة اللاسلكية الظاهر</text>

      {/* the Access Point broadcasts the name */}
      <rect className="eb-visual-server" x={AP.x - 34} y={AP.y - 18} width="68" height="36" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={AP.x} y={AP.y} textAnchor="middle" dominantBaseline="central" fontSize="10">Access Point</text>
      <text className="eb-visual-meta" x={AP.x} y={AP.y + 32} textAnchor="middle">يبثّ الاسم</text>

      {/* the broadcast SSID name travelling to the device */}
      <g data-ssid="1">
        <rect className="eb-visual-seg is-v4" x="150" y="80" width="80" height="30" rx="6" opacity={reducedMotion ? 1 : 0}>
          {!reducedMotion && <animate id="ssidBeam" attributeName="opacity" begin="0.4s" dur="0.9s" values="0;1" fill="freeze" />}
        </rect>
        <text className="eb-visual-token" x="190" y="96" textAnchor="middle" dominantBaseline="central" fontSize="10" opacity={reducedMotion ? 1 : 0}>
          SSID
          {!reducedMotion && <animate attributeName="opacity" begin="ssidBeam.begin" dur="0.9s" values="0;1" fill="freeze" />}
        </text>
      </g>

      {/* the device sees / selects the network name */}
      <rect className="eb-visual-node is-target" x={DEV.x - 26} y={DEV.y - 20} width="52" height="40" rx="6" />
      <text className="eb-visual-node-label" x={DEV.x} y={DEV.y} textAnchor="middle" dominantBaseline="central" fontSize="11">جهاز</text>
      <text className="eb-visual-meta" x={DEV.x} y={DEV.y + 34} textAnchor="middle">يرى الاسم ويختاره</text>

      <text className="eb-visual-caption-svg" x="190" y="152" textAnchor="middle">‏الاسم يُبَثّ فتصبح الشبكة مرئية، فيجدها الجهاز ويختارها</text>
      <text className="eb-visual-meta" x="190" y="170" textAnchor="middle">SSID هو اسم الشبكة الذي تراه عند البحث</text>
    </svg>
  );
}
