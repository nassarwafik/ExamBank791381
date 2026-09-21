import type { LearningVisualProps } from "../../types";

/**
 * «Collision Domain — Hub مقابل Switch» (Book 791381, PDF 98–99) — a Hub puts all attached devices in ONE shared
 * collision domain (two devices sending at once collide), while a Switch gives EACH port its own separate collision
 * domain (independent flows never collide). Motion TEACHES it: on the Hub side two packets converge on the shared
 * hub and collide (burst); on the Switch side two independent flows cross the switch on separate paths with NO
 * collision. Reduced motion ⇒ a still frame with the packets parked and the burst shown statically on the hub only.
 */
const HUB = { x: 96, y: 96 };
const SW = { x: 284, y: 96 };
const dev = (x: number, y: number) => ({ x, y });
const HUB_DEV = [dev(30, 40), dev(162, 40), dev(30, 152), dev(162, 152)];
const SW_DEV = [dev(218, 40), dev(350, 40), dev(218, 152), dev(350, 152)];
export default function CollisionDomains({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const node = (p: { x: number; y: number }, k: number) => (
    <rect key={k} className="eb-visual-node" x={p.x - 16} y={p.y - 12} width="32" height="24" rx="5" />
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* ── HUB panel: ONE shared collision domain ── */}
      <text className="eb-visual-row-label" x={HUB.x} y="18" textAnchor="middle" direction="ltr">Hub</text>
      <g data-domain="shared"><rect className="eb-visual-zone" x="14" y="26" width="164" height="140" rx="14" /></g>
      {HUB_DEV.map((p, i) => <g key={i}>{node(p, i)}<line className="eb-visual-link" x1={p.x} y1={p.y} x2={HUB.x} y2={HUB.y} /></g>)}
      <circle className="eb-visual-hub" cx={HUB.x} cy={HUB.y} r="13" />
      {/* two senders (top-left + top-right) transmit at once → collide at the hub */}
      {!reducedMotion ? (
        <>
          <path id="cd-a" className="eb-visual-route" d={`M ${HUB_DEV[0].x} ${HUB_DEV[0].y} L ${HUB.x} ${HUB.y}`} />
          <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" /><animateMotion dur="1.6s" repeatCount="indefinite"><mpath href="#cd-a" /></animateMotion></g>
          <path id="cd-b" className="eb-visual-route" d={`M ${HUB_DEV[1].x} ${HUB_DEV[1].y} L ${HUB.x} ${HUB.y}`} />
          <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" /><animateMotion dur="1.6s" repeatCount="indefinite"><mpath href="#cd-b" /></animateMotion></g>
        </>
      ) : (
        <>
          <rect className="eb-visual-packet-static" x={HUB.x - 20} y={HUB.y - 20} width="10" height="10" rx="2" />
          <rect className="eb-visual-packet-static" x={HUB.x + 10} y={HUB.y - 20} width="10" height="10" rx="2" />
        </>
      )}
      <g data-collision="1" className={reducedMotion ? "" : "eb-visual-pulse"}>
        <path className="eb-visual-pin" d={`M${HUB.x} ${HUB.y - 24} l3 7 7 -2 -4 6 4 6 -7 -2 -3 7 -3 -7 -7 2 4 -6 -4 -6 7 2 z`} />
      </g>
      <text className="eb-visual-part-label" x={HUB.x} y="182" textAnchor="middle">مجال تصادم واحد للجميع</text>

      {/* ── SWITCH panel: each port is its OWN collision domain ── */}
      <text className="eb-visual-row-label" x={SW.x} y="18" textAnchor="middle" direction="ltr">Switch</text>
      {SW_DEV.map((p, i) => <g key={i} data-domain="port"><circle className="eb-visual-zone" cx={p.x} cy={p.y} r="22" />{node(p, i)}<line className="eb-visual-link" x1={p.x} y1={p.y} x2={SW.x} y2={SW.y} /></g>)}
      <rect className="eb-visual-switch-box" x={SW.x - 20} y={SW.y - 14} width="40" height="28" rx="6" />
      {/* two INDEPENDENT flows cross the switch at the same time — no collision */}
      {!reducedMotion ? (
        <>
          <path id="cd-f1" className="eb-visual-route" d={`M ${SW_DEV[0].x} ${SW_DEV[0].y} L ${SW.x} ${SW.y} L ${SW_DEV[3].x} ${SW_DEV[3].y}`} />
          <g data-flow="1" className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" /><animateMotion dur="2.6s" repeatCount="indefinite"><mpath href="#cd-f1" /></animateMotion></g>
          <path id="cd-f2" className="eb-visual-route" d={`M ${SW_DEV[1].x} ${SW_DEV[1].y} L ${SW.x} ${SW.y} L ${SW_DEV[2].x} ${SW_DEV[2].y}`} />
          <g data-flow="1" className="eb-visual-dot is-response"><circle r="5" /><animateMotion dur="2.6s" repeatCount="indefinite"><mpath href="#cd-f2" /></animateMotion></g>
        </>
      ) : (
        <>
          <rect data-flow="1" className="eb-visual-packet-static" x={SW_DEV[0].x - 5} y={SW_DEV[0].y - 5} width="10" height="10" rx="2" />
          <circle data-flow="1" className="eb-visual-dot is-response" cx={SW_DEV[1].x} cy={SW_DEV[1].y} r="5" />
        </>
      )}
      <text className="eb-visual-part-label" x={SW.x} y="182" textAnchor="middle">كل منفذ = مجال تصادم مستقل</text>
      <text className="eb-visual-caption-svg" x="190" y="202" textAnchor="middle">Hub يشارك مجال التصادم · Switch يفصله لكل منفذ</text>
    </svg>
  );
}
