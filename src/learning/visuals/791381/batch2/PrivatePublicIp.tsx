import type { LearningVisualProps } from "../../types";

/**
 * «عنوان خاص وعنوان عام» (Book 791381, PDF 30) — private addresses (192.168.1.5) live inside the local network only,
 * while one public address (8.8.8.8 as the internet-facing example) is reachable from the internet. The router sits
 * on the boundary. Motion: a packet flows from the LAN through the router out to the internet. Reduced motion ⇒ still.
 */
const HOSTS = [{ y: 40, ip: "192.168.1.5" }, { y: 96, ip: "192.168.1.6" }, { y: 152, ip: "192.168.1.20" }];
const ROUTER = { x: 214, y: 96 };
const NET = { x: 330, y: 96 };

export default function PrivatePublicIp({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* LAN boundary */}
      <rect className="eb-visual-zone" x="10" y="16" width="150" height="164" rx="12" />
      <text className="eb-visual-zone-label" x="85" y="30" textAnchor="middle">شبكة محلية — خاصة</text>
      {HOSTS.map((h, i) => (
        <g key={i}>
          <path className="eb-visual-link" fill="none" d={`M 120 ${h.y} L ${ROUTER.x - 26} ${ROUTER.y}`} />
          <rect className="eb-visual-node" x="24" y={h.y - 16} width="96" height="32" rx="7" />
          <text className="eb-visual-token" x="72" y={h.y} textAnchor="middle" dominantBaseline="central" direction="ltr">{h.ip}</text>
        </g>
      ))}
      {/* path to internet */}
      <path id="pp-path" className="eb-visual-link is-strong" fill="none" d={`M ${ROUTER.x + 26} ${ROUTER.y} L ${NET.x - 30} ${NET.y}`} />
      <rect className="eb-visual-router" x={ROUTER.x - 26} y={ROUTER.y - 22} width="52" height="44" rx="8" />
      <text className="eb-visual-node-label" x={ROUTER.x} y={ROUTER.y} textAnchor="middle" dominantBaseline="central">راوتر</text>
      <circle className="eb-visual-cloud" cx={NET.x} cy={NET.y} r="30" />
      <text className="eb-visual-hub-label" x={NET.x} y={NET.y - 4} textAnchor="middle" dominantBaseline="central">إنترنت</text>
      <text className="eb-visual-token is-inverse" x={NET.x} y={NET.y + 12} textAnchor="middle" dominantBaseline="central" direction="ltr">8.8.8.8</text>
      {!reducedMotion && (
        <g className="eb-visual-packet"><rect x="-9" y="-8" width="18" height="16" rx="3" />
          <animateMotion dur="2.4s" repeatCount="indefinite" href="#pp-path"><mpath href="#pp-path" /></animateMotion>
        </g>
      )}
    </svg>
  );
}
