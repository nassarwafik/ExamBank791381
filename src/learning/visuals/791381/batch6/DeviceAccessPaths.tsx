import type { LearningVisualProps } from "../../types";

/**
 * «طرق الدخول إلى أجهزة Cisco» (Book 791381, PDF 186) — the page's three access methods to a Cisco device: Console (a
 * direct local cable, `line console 0`, used for first setup), VTY (remote access by Telnet or SSH, `line vty 0 4`,
 * needs a password), and Enable (the privileged mode, protected by `enable secret`). Static diagram (no motion): the
 * three labelled paths into one device, complete as a still frame. Book scope for THIS page: the three access paths
 * and their line commands only — NOT the specific password value (PDF 187), password encryption (PDF 189) or the
 * show-config commands (PDF 190).
 */
export default function DeviceAccessPaths({ ariaLabel, className }: LearningVisualProps) {
  const DEV = { x: 190, y: 108 };
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 214"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏طرق الدخول إلى جهاز Cisco</text>

      {/* the device */}
      <rect className="eb-visual-router" x={DEV.x - 40} y={DEV.y - 16} width="80" height="32" rx="7" />
      <text className="eb-visual-node-label is-inverse" x={DEV.x} y={DEV.y} textAnchor="middle" dominantBaseline="central">جهاز Cisco</text>

      {/* Console — local cable */}
      <g data-access="console">
        <line className="eb-visual-link is-strong" x1={DEV.x - 40} y1={DEV.y} x2="70" y2="56" />
        <rect className="eb-visual-node is-target" x="20" y="40" width="100" height="34" rx="6" />
        <text className="eb-visual-node-label" x="70" y="52" textAnchor="middle" fontSize="11">Console (كابل مباشر)</text>
        <text className="eb-visual-token" x="70" y="67" textAnchor="middle" fontSize="9.5">line console 0</text>
      </g>

      {/* VTY — remote SSH/Telnet */}
      <g data-access="vty">
        <line className="eb-visual-link is-strong" x1={DEV.x + 40} y1={DEV.y} x2="310" y2="56" strokeDasharray="5 4" />
        <rect className="eb-visual-node is-target" x="260" y="40" width="100" height="34" rx="6" />
        <text className="eb-visual-node-label" x="310" y="52" textAnchor="middle" fontSize="11">VTY (Telnet / SSH)</text>
        <text className="eb-visual-token" x="310" y="67" textAnchor="middle" fontSize="9.5">line vty 0 4</text>
      </g>

      {/* Enable — privileged mode lock */}
      <g data-access="enable">
        <line className="eb-visual-link is-strong" x1={DEV.x} y1={DEV.y + 16} x2={DEV.x} y2="160" />
        <rect className="eb-visual-seg is-v4" x={DEV.x - 62} y="160" width="124" height="34" rx="6" />
        <text className="eb-visual-node-label" x={DEV.x} y="172" textAnchor="middle" fontSize="11">Enable (وضع متقدّم)</text>
        <text className="eb-visual-token" x={DEV.x} y="187" textAnchor="middle" fontSize="9.5">enable secret</text>
      </g>
      <text className="eb-visual-caption-svg" x="190" y="210" textAnchor="middle">‏Console قريب من الجهاز · VTY دخول عن بُعد · Enable للأوامر المتقدّمة</text>
    </svg>
  );
}
