import type { LearningVisualProps } from "../../types";

/**
 * «SSH / Telnet» (Book 791381, PDF 90) — both give remote access to a device, but SSH encrypts the session while
 * Telnet sends everything as plain text. Two panels: an admin connects to a device; the SSH channel carries a locked
 * (encrypted) packet, the Telnet channel carries readable plain text. Motion: the packet travels each channel.
 * Reduced motion ⇒ still packets. Names render LTR.
 */
export default function SshVsTelnet({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const y = 64;
  const panel = (ox: number, name: string, ar: string, secure: boolean) => (
    <g>
      <rect className="eb-visual-node" x={ox} y="20" width="176" height="92" rx="10" />
      <text className="eb-visual-row-label" x={ox + 88} y="16" textAnchor="middle" direction="ltr">{name}</text>
      <circle className="eb-visual-hub" cx={ox + 24} cy={y} r="9" />
      <rect className={"eb-visual-switch-box"} x={ox + 132} y={y - 14} width="30" height="28" rx="5" />
      <line className={"eb-visual-link" + (secure ? " is-strong" : " is-faint")} x1={ox + 33} y1={y} x2={ox + 132} y2={y} />
      <text className="eb-visual-part-label" x={ox + 88} y="98" textAnchor="middle">{ar}</text>
    </g>
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 150"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {panel(8, "SSH", "قناة مشفّرة — لا يمكن قراءتها", true)}
      {panel(196, "Telnet", "نص صريح — يمكن قراءته", false)}
      {!reducedMotion ? (
        <>
          <path id="st-ssh" className="eb-visual-route" d={`M 41 ${y} L 132 ${y}`} />
          <g className="eb-visual-packet"><rect x="-7" y="-6" width="14" height="12" rx="3" /><animateMotion dur="2.4s" repeatCount="indefinite"><mpath href="#st-ssh" /></animateMotion></g>
          <path id="st-tel" className="eb-visual-route" d={`M 229 ${y} L 320 ${y}`} />
          <g className="eb-visual-packet is-flood"><rect x="-7" y="-6" width="14" height="12" rx="3" /><animateMotion dur="2.4s" repeatCount="indefinite"><mpath href="#st-tel" /></animateMotion></g>
        </>
      ) : (
        <>
          <rect className="eb-visual-packet-static" x="80" y={y - 6} width="14" height="12" rx="3" />
          <rect className="eb-visual-packet-static" x="268" y={y - 6} width="14" height="12" rx="3" />
        </>
      )}
      {/* channel state label: encrypted vs readable */}
      <text className="eb-visual-part-label" x="96" y={y - 16} textAnchor="middle">مشفّر</text>
      <text className="eb-visual-part-label" x="284" y={y - 16} textAnchor="middle">مكشوف</text>
      <text className="eb-visual-caption-svg" x="190" y="140" textAnchor="middle">كلاهما وصول عن بُعد · SSH يشفّر و Telnet يرسل نصًا صريحًا</text>
    </svg>
  );
}
