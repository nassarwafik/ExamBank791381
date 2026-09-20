import type { LearningVisualProps } from "../../types";

/**
 * «Unicast و Multicast» (Book 791381, PDF 68) — the page's worked contrast: browsing a site is Unicast (one source →
 * one target), while a video stream is Multicast (one source → a chosen group only, NOT everyone). Two panels side by
 * side make the "one target" vs "a defined group" difference explicit. Motion: a packet travels to its target(s).
 * Reduced motion ⇒ still packets at each source.
 */
const panel = (ox: number, title: string, ar: string, targets: number[], key: string) => {
  const sx = ox + 26, sy = 60;
  const tgt = [[ox + 150, 34], [ox + 150, 60], [ox + 150, 86]] as const;
  return (
    <g key={key}>
      <rect className="eb-visual-node" x={ox} y={16} width="168" height="96" rx="10" />
      <text className="eb-visual-row-label" x={ox + 84} y={12} textAnchor="middle" direction="ltr">{title}</text>
      <circle className="eb-visual-hub" cx={sx} cy={sy} r="10" />
      {tgt.map(([tx, ty], t) => {
        const on = targets.includes(t);
        return (
          <g key={t}>
            <line className={"eb-visual-link" + (on ? " is-strong" : " is-faint")} x1={sx + 10} y1={sy} x2={tx} y2={ty} />
            <circle className={"eb-visual-node" + (on ? " is-target" : " is-dim")} cx={tx} cy={ty} r="8" />
          </g>
        );
      })}
      <text className="eb-visual-part-label" x={ox + 84} y={128} textAnchor="middle">{ar}</text>
    </g>
  );
};
export default function UnicastMulticast({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 168"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {panel(8, "Unicast", "تصفّح موقع: مصدر واحد وهدف واحد", [1], "u")}
      {panel(204, "Multicast", "بث مصوّر: مصدر واحد لمجموعة محدّدة", [0, 2], "m")}
      {!reducedMotion ? (
        <>
          <path id="um-u" className="eb-visual-route" d="M 44 60 L 158 60" />
          <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" /><animateMotion dur="2.2s" repeatCount="indefinite"><mpath href="#um-u" /></animateMotion></g>
          <path id="um-m" className="eb-visual-route" d="M 240 60 L 354 34" />
          <g className="eb-visual-packet"><rect x="-5" y="-5" width="10" height="10" rx="2" /><animateMotion dur="2.2s" repeatCount="indefinite"><mpath href="#um-m" /></animateMotion></g>
        </>
      ) : (
        <>
          <rect className="eb-visual-packet-static" x="95" y="55" width="10" height="10" rx="2" />
          <rect className="eb-visual-packet-static" x="291" y="49" width="10" height="10" rx="2" />
        </>
      )}
      <text className="eb-visual-caption-svg" x="190" y="160" textAnchor="middle">Unicast: هدف واحد · Multicast: مجموعة محدّدة فقط (ليس الجميع)</text>
    </svg>
  );
}
