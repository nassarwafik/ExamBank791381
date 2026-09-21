import type { LearningVisualProps } from "../../types";

/**
 * «Localhost» (Book 791381, PDF 104) — localhost (127.0.0.1) refers back to the SAME machine: a request sent to it
 * goes down the local network stack and loops straight back inside the device, never leaving to a router, switch,
 * internet or remote server. Motion TEACHES it: the packet travels App → stack → back up to App, entirely within the
 * device boundary. Reduced motion ⇒ a still packet on the loopback path. There is deliberately NO external node.
 */
const APP = { x: 190, y: 52 };
const STACK = { x: 190, y: 128 };
export default function LocalhostLoopback({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 186"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* the single device — everything happens inside it */}
      <rect data-machine="1" className="eb-visual-zone" x="40" y="20" width="300" height="132" rx="16" />
      <text className="eb-visual-zone-label" x="56" y="38">جهازك (127.0.0.1)</text>
      {/* app + network stack, both inside the device */}
      <rect className="eb-visual-node is-target" x={APP.x - 60} y={APP.y - 16} width="120" height="32" rx="6" />
      <text className="eb-visual-node-label" x={APP.x} y={APP.y} textAnchor="middle" dominantBaseline="central">التطبيق / الطلب</text>
      <rect className="eb-visual-node" x={STACK.x - 60} y={STACK.y - 16} width="120" height="32" rx="6" />
      <text className="eb-visual-node-label" x={STACK.x} y={STACK.y} textAnchor="middle" dominantBaseline="central">مكدّس الشبكة</text>
      {/* loopback lanes: down (request) then up (response) */}
      <line className="eb-visual-link is-strong" x1="168" y1={APP.y + 16} x2="168" y2={STACK.y - 16} />
      <line className="eb-visual-link" x1="212" y1={STACK.y - 16} x2="212" y2={APP.y + 16} />
      <text className="eb-visual-token" x="150" y="90" textAnchor="middle" direction="ltr">127.0.0.1</text>
      {!reducedMotion ? (
        <g data-loopback="1" className="eb-visual-packet">
          <rect x="-5" y="-5" width="10" height="10" rx="2" />
          <animateMotion dur="2.4s" repeatCount="indefinite" keyPoints="0;0.5;1" keyTimes="0;0.5;1" calcMode="linear"
            path={`M 168 ${APP.y + 16} L 168 ${STACK.y - 16} L 212 ${STACK.y - 16} L 212 ${APP.y + 16}`} />
        </g>
      ) : (
        <rect data-loopback="1" className="eb-visual-packet-static" x="163" y={(APP.y + STACK.y) / 2 - 5} width="10" height="10" rx="2" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="176" textAnchor="middle">الطلب يعود إلى نفس الجهاز — لا يغادر إلى الشبكة</text>
    </svg>
  );
}
