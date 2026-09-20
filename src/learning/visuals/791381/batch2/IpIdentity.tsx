import type { LearningVisualProps } from "../../types";

/**
 * «ما هو عنوان IP؟» (Book 791381, PDF 25) — an IP is a unique address for each device, like a house address: without
 * it the message never reaches the right place. A packet addressed to 192.168.1.5 travels to the matching device.
 * Motion: the packet moves from the network to the device that owns the address. Reduced motion ⇒ packet at rest.
 */
const DEVICES = [
  { x: 300, y: 40, ip: "192.168.1.5", target: true },
  { x: 300, y: 110, ip: "192.168.1.6", target: false },
  { x: 300, y: 180, ip: "192.168.1.7", target: false },
];
const HUB = { x: 70, y: 110 };

export default function IpIdentity({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 220"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {DEVICES.map((d, i) => (
        <path key={"l" + i} id={"ip-l" + i} className="eb-visual-link" fill="none" d={`M ${HUB.x + 34} ${HUB.y} L ${d.x - 52} ${d.y}`} />
      ))}
      {/* network cloud */}
      <circle className="eb-visual-hub" cx={HUB.x} cy={HUB.y} r="34" />
      <text className="eb-visual-hub-label" x={HUB.x} y={HUB.y} textAnchor="middle" dominantBaseline="central">شبكة</text>
      {/* devices with IP labels */}
      {DEVICES.map((d, i) => (
        <g key={"d" + i}>
          <rect className={"eb-visual-node" + (d.target ? " is-target" : "")} x={d.x - 52} y={d.y - 20} width="104" height="40" rx="8" />
          <text className="eb-visual-token" x={d.x} y={d.y} textAnchor="middle" dominantBaseline="central" direction="ltr">{d.ip}</text>
        </g>
      ))}
      {/* packet addressed to the target device */}
      {!reducedMotion && (
        <g className="eb-visual-packet">
          <rect x="-9" y="-8" width="18" height="16" rx="3" />
          <animateMotion dur="2.6s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.6;1" calcMode="linear"><mpath href="#ip-l0" /></animateMotion>
        </g>
      )}
    </svg>
  );
}
