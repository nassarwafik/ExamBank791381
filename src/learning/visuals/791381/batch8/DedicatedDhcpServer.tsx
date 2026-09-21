import type { LearningVisualProps } from "../../types";

/**
 * «DHCP عن طريق Server» (Book 791381, PDF 176) — the same automatic-addressing idea, but a DEDICATED server (not the
 * router) hands out the settings to the switch/LAN clients: we name a network such as 192.168.10.0/24 and the server
 * distributes it automatically. Static diagram (no motion): the dedicated server → switch → LAN clients chain, complete
 * as a still frame. It draws only the network topology idea — it deliberately does NOT reproduce the Packet Tracer
 * configuration WINDOW (its Services / On·Off / Start IP / Add·Save fields are the PDF 177–179 step screens, not this
 * page's concept). Book scope for THIS page: a central dedicated server distributing settings on 192.168.10.0/24 — no
 * CLI commands and no simulator UI.
 */
export default function DedicatedDhcpServer({ ariaLabel, className }: LearningVisualProps) {
  const CLIENTS = [268, 316];
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏خادم مخصّص يوزّع الإعدادات على الشبكة</text>

      {/* the dedicated server */}
      <g data-node="server">
        <rect className="eb-visual-server" x="20" y="72" width="80" height="56" rx="7" />
        <text className="eb-visual-node-label is-inverse" x="60" y="92" textAnchor="middle" dominantBaseline="central" fontSize="11">خادم Server</text>
        <text className="eb-visual-meta is-inverse" x="60" y="114" textAnchor="middle">DHCP مركزي</text>
      </g>

      {/* server → switch */}
      <line className="eb-visual-link is-strong" x1="100" y1="100" x2="160" y2="100" />
      <g data-node="switch">
        <rect className="eb-visual-switch-box" x="160" y="82" width="64" height="36" rx="6" />
        <text className="eb-visual-node-label is-inverse" x="192" y="100" textAnchor="middle" dominantBaseline="central" fontSize="11">Switch</text>
      </g>

      {/* switch → LAN clients */}
      {CLIENTS.map((cx, i) => (
        <g key={cx} data-node="client">
          <line className="eb-visual-link" x1="224" y1="100" x2={cx} y2={i === 0 ? 76 : 124} />
          <rect className="eb-visual-node is-target" x={cx - 22} y={(i === 0 ? 76 : 124) - 13} width="44" height="26" rx="5" />
          <text className="eb-visual-node-label" x={cx} y={i === 0 ? 76 : 124} textAnchor="middle" dominantBaseline="central" fontSize="10">جهاز</text>
        </g>
      ))}

      {/* the example network the server distributes */}
      <rect className="eb-visual-seg is-v6" x="132" y="150" width="116" height="26" rx="6" />
      <text className="eb-visual-token" x="190" y="163" textAnchor="middle" dominantBaseline="central" fontSize="11">192.168.10.0/24</text>
      <text className="eb-visual-part-label" x="190" y="146" textAnchor="middle" fill="var(--eb-success)">توزيع تلقائي للإعدادات</text>

      <text className="eb-visual-caption-svg" x="190" y="196" textAnchor="middle">‏نفس المبدأ: جهاز مركزي — هنا خادم مخصّص — يوزّع إعدادات شبكة 192.168.10.0/24 على الأجهزة</text>
    </svg>
  );
}
