import type { LearningVisualProps } from "../../types";

/**
 * «Ports — المنافذ المهمة» (Book 791381, PDF 168) — the page's table of well-known port numbers, grouped by purpose:
 * web (HTTP 80, HTTPS 443), name resolution (DNS 53), remote access (SSH 22, Telnet 23), mail (SMTP 25, POP3 110,
 * IMAP 143) and file transfer (FTP 21). Static diagram (no motion): a labelled port map, complete as a still frame.
 * Book scope: exactly the services and numbers this page prints — note it lists FTP as 21 (this module does not print
 * the 20/21 pair). No IPv6 content here (that is PDF 166–167).
 */
const PORTS = [
  { s: "HTTP", p: 80 }, { s: "HTTPS", p: 443 }, { s: "DNS", p: 53 },
  { s: "SSH", p: 22 }, { s: "Telnet", p: 23 }, { s: "FTP", p: 21 },
  { s: "SMTP", p: 25 }, { s: "POP3", p: 110 }, { s: "IMAP", p: 143 },
];
export default function WellKnownPorts({ ariaLabel, className }: LearningVisualProps) {
  const COLS = 3;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏المنافذ المهمة (Ports)</text>
      {PORTS.map((it, i) => {
        const col = i % COLS, row = Math.floor(i / COLS);
        const x = 22 + col * 118, y = 42 + row * 50;
        return (
          <g key={it.s} data-port={it.p}>
            <rect className="eb-visual-seg is-v4" x={x} y={y} width="106" height="40" rx="6" />
            <text className="eb-visual-node-label" x={x + 12} y={y + 20} dominantBaseline="central" fontSize="12">{it.s}</text>
            <text className="eb-visual-token is-octet" x={x + 92} y={y + 20} textAnchor="end" dominantBaseline="central">{it.p}</text>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="202" textAnchor="middle">‏لكل خدمة رقم منفذ ثابت: HTTP 80 · HTTPS 443 · DNS 53 · SSH 22 · FTP 21</text>
    </svg>
  );
}
