import type { LearningVisualProps } from "../../types";

/**
 * «كيف يعمل VTP؟» (Book 791381, PDF 141) — the page's three steps: set ONE switch as Server, set the rest as Clients,
 * and define a VLAN on the Server only — it then reaches the others automatically over the Trunk links. Motion TEACHES
 * that propagation: an update travels from the Server switch down to each Client, and the Clients light up as
 * "received". ONE-SHOT: the update starts at a fixed time and freezes at the Clients (fill=freeze) — it does not loop
 * back. Reduced motion ⇒ Server, Clients and the trunk links shown statically. Book scope for THIS page: the Server /
 * Client roles and automatic VLAN propagation only — NOT the vtp mode / domain / password commands (they arrive on
 * PDF 142), and nothing about Dot1Q, sub-interfaces or routing.
 */
const CLIENTS = [{ x: 70 }, { x: 190 }, { x: 310 }];
export default function VtpPropagation({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const SRV = { x: 190, y: 52 };
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 216"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="20" textAnchor="middle">‏VTP: نعرّف VLAN في السيرفر فتصل تلقائيًا</text>

      {/* the Server switch defines the VLAN once */}
      <g data-role="server">
        <rect className="eb-visual-server" x={SRV.x - 52} y={SRV.y - 16} width="104" height="32" rx="7" />
        <text className="eb-visual-node-label is-inverse" x={SRV.x} y={SRV.y} textAnchor="middle" dominantBaseline="central">Server · VLAN</text>
      </g>

      {/* trunk links down to each Client */}
      {CLIENTS.map((c, i) => (
        <line key={i} className="eb-visual-link is-strong" x1={SRV.x} y1={SRV.y + 16} x2={c.x + 40} y2="150" />
      ))}
      <text className="eb-visual-zone-label" x="300" y="112" textAnchor="middle">Trunk</text>

      {/* the Clients receive the VLAN automatically */}
      {CLIENTS.map((c, i) => (
        <g key={i} data-role="client" data-recv={i + 1}>
          <rect className="eb-visual-switch-box" x={c.x} y="150" width="80" height="28" rx="6" />
          <text className="eb-visual-node-label is-inverse" x={c.x + 40} y="164" textAnchor="middle" dominantBaseline="central">Client</text>
        </g>
      ))}

      {/* the update travelling Server → each Client (one-shot, freezes at the Clients) */}
      {!reducedMotion && CLIENTS.map((c, i) => (
        <g key={i} className="eb-visual-packet">
          <rect x="-5" y="-5" width="10" height="10" rx="2" />
          <animateMotion id={i === 0 ? "vtpSend" : undefined} begin="0.4s" dur="1.2s" fill="freeze"
            path={`M ${SRV.x} ${SRV.y + 16} L ${c.x + 40} 150`} />
        </g>
      ))}
      {reducedMotion && CLIENTS.map((c, i) => (
        <rect key={i} className="eb-visual-packet-static" x={(SRV.x + c.x + 40) / 2 - 5} y="100" width="10" height="10" rx="2" />
      ))}
      <text className="eb-visual-caption-svg" x="190" y="204" textAnchor="middle">‏سويتش Server واحد يرسل التحديثات إلى كل Client عبر Trunk — نعرّف مرّة واحدة</text>
    </svg>
  );
}
