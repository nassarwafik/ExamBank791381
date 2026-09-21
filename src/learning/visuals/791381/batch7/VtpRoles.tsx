import type { LearningVisualProps } from "../../types";

/**
 * «ما هو VTP؟» (Book 791381, PDF 140) — VTP is a Cisco protocol to manage VLANs across several switches. This page
 * teaches the ROLES: one switch acts as the Server (defines and sends the VLAN updates), the rest are Clients (receive
 * them), and the updates travel over the Trunk links between the switches. Static diagram (no motion): the three roles
 * labelled around one topology — distinct from the m19 vtp-propagation animation (which shows the update travelling).
 * Book scope for PDF 140 ONLY: the Server / Client roles and the Trunk link — NOT the vtp mode / domain / password
 * commands (those arrive on PDF 142), and no Domain / Password fields.
 */
const CLIENTS = [{ x: 78 }, { x: 302 }];
export default function VtpRoles({ ariaLabel, className }: LearningVisualProps) {
  const SRV = { x: 190, y: 54 };
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏VTP = VLAN Trunking Protocol (من Cisco)</text>

      {/* the Server switch — defines and controls the VLAN updates */}
      <g data-role="server">
        <rect className="eb-visual-server" x={SRV.x - 60} y={SRV.y - 17} width="120" height="34" rx="7" />
        <text className="eb-visual-node-label is-inverse" x={SRV.x} y={SRV.y} textAnchor="middle" dominantBaseline="central">Server</text>
        <text className="eb-visual-meta" x={SRV.x} y={SRV.y + 30} textAnchor="middle">يعرّف VLAN ويرسل التحديثات</text>
      </g>

      {/* trunk links to the clients */}
      {CLIENTS.map((c, i) => (
        <line key={i} className="eb-visual-link is-strong" x1={SRV.x} y1={SRV.y + 17} x2={c.x + 40} y2="140" />
      ))}
      <text className="eb-visual-zone-label" x="190" y="104" textAnchor="middle">Trunk</text>

      {/* the Client switches — receive the updates */}
      {CLIENTS.map((c, i) => (
        <g key={i} data-role="client">
          <rect className="eb-visual-switch-box" x={c.x} y="140" width="80" height="30" rx="6" />
          <text className="eb-visual-node-label is-inverse" x={c.x + 40} y="155" textAnchor="middle" dominantBaseline="central">Client</text>
          <text className="eb-visual-meta" x={c.x + 40} y="184" textAnchor="middle">يستقبل التحديثات</text>
        </g>
      ))}
      <text className="eb-visual-caption-svg" x="190" y="204" textAnchor="middle">‏Server يرسل التحديثات إلى Clients عبر وصلات Trunk — إدارة VLAN على عدة سويتشات</text>
    </svg>
  );
}
