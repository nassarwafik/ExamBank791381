import type { LearningVisualProps } from "../../types";

/**
 * «Unicast و Multicast» (Book 791381, PDF 68) — the page's worked contrast: browsing a site is Unicast (one source →
 * one target), while a video stream is Multicast (one source → a chosen GROUP only, never everyone). THE MOTION
 * TEACHES IT: the Unicast panel animates a packet to its single target; the Multicast panel animates a packet to EACH
 * selected group member and NONE to the excluded device. Reduced motion ⇒ still packets at each source. Targets are
 * highlighted by fill either way.
 */
const TY = [34, 60, 86] as const;   // three target y positions per panel
export default function UnicastMulticast({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const panel = (ox: number, title: string, ar: string, targets: number[], key: string) => {
    const sx = ox + 26, sy = 60, tx = ox + 150;
    return (
      <g data-panel={key}>
        <rect className="eb-visual-node" x={ox} y={16} width="168" height="96" rx="10" />
        <text className="eb-visual-row-label" x={ox + 84} y={12} textAnchor="middle" direction="ltr">{title}</text>
        <circle className="eb-visual-hub" cx={sx} cy={sy} r="10" />
        {TY.map((ty, t) => {
          const on = targets.includes(t);
          return (
            <g key={t}>
              <line className={"eb-visual-link" + (on ? " is-strong" : " is-faint")} x1={sx + 10} y1={sy} x2={tx} y2={ty} />
              <circle className={"eb-visual-node" + (on ? " is-target" : " is-dim")} cx={tx} cy={ty} r="8" />
            </g>
          );
        })}
        {/* one animated packet per SELECTED target (never to the excluded member) */}
        {!reducedMotion
          ? targets.map(t => (
              <g key={"p" + t} data-mt="1" className="eb-visual-packet">
                <rect x="-5" y="-5" width="10" height="10" rx="2" />
                <animateMotion dur="2.2s" repeatCount="indefinite" path={`M ${sx + 10} ${sy} L ${tx} ${TY[t]}`} />
              </g>
            ))
          : <rect className="eb-visual-packet-static" x={sx + 6} y={sy - 5} width="10" height="10" rx="2" />}
        <text className="eb-visual-part-label" x={ox + 84} y={128} textAnchor="middle">{ar}</text>
      </g>
    );
  };
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 168"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {panel(8, "Unicast", "تصفّح موقع: مصدر واحد وهدف واحد", [1], "unicast")}
      {panel(204, "Multicast", "بث مصوّر: مصدر واحد لمجموعة محدّدة", [0, 2], "multicast")}
      <text className="eb-visual-caption-svg" x="190" y="160" textAnchor="middle">Unicast: هدف واحد · Multicast: كل أعضاء المجموعة المحدّدة فقط</text>
    </svg>
  );
}
