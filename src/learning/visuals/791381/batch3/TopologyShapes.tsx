import type { ReactNode } from "react";
import type { LearningVisualProps } from "../../types";

/**
 * «أنواع الشبكات البسيطة» (Book 791381, PDF 58) — the six arrangement shapes a network can take, shown at a glance:
 * P2P, Bus, Ring, Star, Tree, Hybrid. Each is a tiny faithful glyph (nodes + links) with its LTR name. Motion: ONE
 * dot circulates the Ring glyph to hint "traffic follows the shape". Reduced motion ⇒ the dot rests on the ring.
 */
const RING_D = "M 316 74 A 22 22 0 1 1 315.9 74"; // near-full circle for the Ring glyph, drives the dot
export default function TopologyShapes({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const cell = (x: number, y: number, label: string, draw: ReactNode) => (
    <g key={label}>
      <rect className="eb-visual-node" x={x} y={y} width="112" height="76" rx="10" />
      {draw}
      <text className="eb-visual-part-label" x={x + 56} y={y + 90} textAnchor="middle" direction="ltr">{label}</text>
    </g>
  );
  const dot = (cx: number, cy: number) => <circle className="eb-visual-dot" cx={cx} cy={cy} r="5" />;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 250"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* P2P — two nodes, one link */}
      {cell(6, 8, "P2P", <g><line className="eb-visual-link" x1="30" y1="46" x2="88" y2="46" />{dot(30, 46)}{dot(88, 46)}</g>)}
      {/* Bus — shared line, drops */}
      {cell(134, 8, "Bus", <g><line className="eb-visual-link is-strong" x1="146" y1="60" x2="234" y2="60" />{[158, 178, 198, 218].map(x => <g key={x}><line className="eb-visual-link" x1={x} y1="60" x2={x} y2="34" />{dot(x, 30)}</g>)}</g>)}
      {/* Ring — nodes on a circle, one circulating dot */}
      {cell(262, 8, "Ring", <g>
        <circle className="eb-visual-ring" cx="318" cy="46" r="22" fill="none" />
        {[[318,24],[340,46],[318,68],[296,46]].map(([cx,cy],i)=><g key={i}>{dot(cx,cy)}</g>)}
        <path id="tp-ring" className="eb-visual-route" d={RING_D} />
        {!reducedMotion
          ? <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" /><animateMotion dur="3s" repeatCount="indefinite"><mpath href="#tp-ring" /></animateMotion></g>
          : <rect className="eb-visual-packet-static" x="313" y="19" width="10" height="10" rx="2" />}
      </g>)}
      {/* Star — central hub */}
      {cell(6, 132, "Star", <g>{[[30,150],[88,150],[30,192],[88,192]].map(([x,y],i)=><line key={i} className="eb-visual-link" x1="59" y1="170" x2={x} y2={y} />)}<circle className="eb-visual-hub" cx="59" cy="170" r="9" />{[[30,150],[88,150],[30,192],[88,192]].map(([x,y],i)=><g key={i}>{dot(x,y)}</g>)}</g>)}
      {/* Tree — hierarchy */}
      {cell(134, 132, "Tree", <g><line className="eb-visual-link" x1="190" y1="146" x2="168" y2="170" /><line className="eb-visual-link" x1="190" y1="146" x2="212" y2="170" /><line className="eb-visual-link" x1="168" y1="170" x2="156" y2="192" /><line className="eb-visual-link" x1="168" y1="170" x2="180" y2="192" />{dot(190,146)}{dot(168,170)}{dot(212,170)}{dot(156,192)}{dot(180,192)}</g>)}
      {/* Hybrid — star + bus mix */}
      {cell(262, 132, "Hybrid", <g><line className="eb-visual-link is-strong" x1="284" y1="170" x2="352" y2="170" /><circle className="eb-visual-hub" cx="300" cy="170" r="8" />{[[300,150],[300,192]].map(([x,y],i)=><g key={i}><line className="eb-visual-link" x1="300" y1="170" x2={x} y2={y} />{dot(x,y)}</g>)}{dot(340,170)}{dot(352,150)}<line className="eb-visual-link" x1="340" y1="170" x2="352" y2="150" /></g>)}
      <text className="eb-visual-caption-svg" x="190" y="242" textAnchor="middle">أشكال ترتيب الأجهزة داخل الشبكة</text>
    </svg>
  );
}
