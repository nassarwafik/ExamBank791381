import type { LearningVisualProps } from "../../types";

/**
 * «جهاز Router» (Book 791381, PDF 54) — a router connects DIFFERENT networks and forwards traffic between them and to
 * the internet, choosing the right path. Faithful to the page: Internet ← Router ← (Switch net 1, Switch net 2).
 *
 * Motion: ONE packet follows a single CONTINUOUS route that teaches the forwarding direction —
 *   Switch / Network 1  →  Router  →  Internet
 * looped as one clean sequence (never the reverse, never two independent repeats). The existing network links stay
 * visible. Reduced motion ⇒ a correct still frame with the packet parked at its Network-1 origin.
 */
const ROUTER = { x: 190, y: 118 };
const NET = { x: 190, y: 38 };
const SW1 = { x: 78, y: 186 };
const SW2 = { x: 302, y: 186 };

// Waypoints of the forwarding route, authored bottom→top so the packet always travels Network 1 → Router → Internet.
const ROUTE_START = { x: SW1.x + 24, y: SW1.y - 14 }; // leaves Switch / Network 1
const ROUTE_VIA = { x: ROUTER.x, y: ROUTER.y };       // through the Router
const ROUTE_END = { x: NET.x, y: NET.y + 26 };        // into the Internet
const ROUTE_D = `M ${ROUTE_START.x} ${ROUTE_START.y} L ${ROUTER.x - 24} ${ROUTER.y + 16} L ${ROUTE_VIA.x} ${ROUTE_VIA.y} L ${ROUTER.x} ${ROUTER.y - 22} L ${ROUTE_END.x} ${ROUTE_END.y}`;

export default function RouterNetworks({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 238"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* visible network links (topology) */}
      <path id="rt-up" className="eb-visual-link is-strong" fill="none" d={`M ${ROUTER.x} ${ROUTER.y - 22} L ${NET.x} ${NET.y + 26}`} />
      <path id="rt-s1" className="eb-visual-link" fill="none" d={`M ${ROUTER.x - 24} ${ROUTER.y + 16} L ${SW1.x + 24} ${SW1.y - 14}`} />
      <path id="rt-s2" className="eb-visual-link" fill="none" d={`M ${ROUTER.x + 24} ${ROUTER.y + 16} L ${SW2.x - 24} ${SW2.y - 14}`} />
      {/* the single continuous forwarding route (Network 1 → Router → Internet); invisible, drives the packet */}
      <path id="rt-route" className="eb-visual-route" fill="none" d={ROUTE_D} />
      {/* internet */}
      <circle className="eb-visual-cloud" cx={NET.x} cy={NET.y} r="30" />
      <text className="eb-visual-hub-label" x={NET.x} y={NET.y} textAnchor="middle" dominantBaseline="central">إنترنت</text>
      {/* router */}
      <rect className="eb-visual-router" x={ROUTER.x - 30} y={ROUTER.y - 22} width="60" height="44" rx="8" />
      <text className="eb-visual-node-label" x={ROUTER.x} y={ROUTER.y} textAnchor="middle" dominantBaseline="central">راوتر</text>
      {/* two different local networks */}
      {[{ n: SW1, l: "شبكة 1" }, { n: SW2, l: "شبكة 2" }].map((s, i) => (
        <g key={i}>
          <rect className="eb-visual-switch-box" x={s.n.x - 30} y={s.n.y - 16} width="60" height="34" rx="7" />
          <text className="eb-visual-node-label is-inverse" x={s.n.x} y={s.n.y} textAnchor="middle" dominantBaseline="central">Switch</text>
          <text className="eb-visual-part-label" x={s.n.x} y={s.n.y + 30} textAnchor="middle">{s.l}</text>
        </g>
      ))}
      {/* ONE packet along the single continuous route, looped; still frame parks it at the Network-1 origin */}
      {!reducedMotion ? (
        <g className="eb-visual-packet"><rect x="-8" y="-7" width="16" height="14" rx="3" />
          <animateMotion dur="3s" repeatCount="indefinite" rotate="auto"><mpath href="#rt-route" /></animateMotion>
        </g>
      ) : (
        <rect className="eb-visual-packet-static" x={ROUTE_START.x - 8} y={ROUTE_START.y - 7} width="16" height="14" rx="3" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="230" textAnchor="middle">يربط شبكتين مختلفتين ويمرّر البيانات إلى الإنترنت</text>
    </svg>
  );
}
