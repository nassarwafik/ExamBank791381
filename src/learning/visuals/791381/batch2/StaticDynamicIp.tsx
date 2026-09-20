import type { LearningVisualProps } from "../../types";

/**
 * «Static IP و Dynamic IP» (Book 791381, PDF 33) — a static address is set by hand and stays fixed; a dynamic address
 * is handed out (and can change) by a DHCP server. Motion: on the dynamic side a request/response flows between the
 * device and the DHCP server; the static side is a fixed pinned label. Reduced motion ⇒ no request/response motion.
 */
export default function StaticDynamicIp({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 200"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <line className="eb-visual-divider" x1="190" y1="20" x2="190" y2="180" />
      {/* Static side */}
      <text className="eb-visual-row-label" x="96" y="34" textAnchor="middle">Static — ثابت</text>
      <rect className="eb-visual-node" x="52" y="70" width="88" height="44" rx="8" />
      <text className="eb-visual-node-label" x="96" y="86" textAnchor="middle" dominantBaseline="central">جهاز</text>
      <text className="eb-visual-token" x="96" y="104" textAnchor="middle" dominantBaseline="central" direction="ltr">10.0.0.5</text>
      <g className={reducedMotion ? "" : "eb-visual-pin-anim"}>
        <circle className="eb-visual-pin" cx="96" cy="60" r="7" />
      </g>
      <text className="eb-visual-meta" x="96" y="150" textAnchor="middle">لا يتغيّر — يُضبط يدويًا</text>
      {/* Dynamic side */}
      <text className="eb-visual-row-label" x="286" y="34" textAnchor="middle">Dynamic — متغيّر</text>
      <rect className="eb-visual-node" x="222" y="70" width="70" height="44" rx="8" />
      <text className="eb-visual-node-label" x="257" y="92" textAnchor="middle" dominantBaseline="central">جهاز</text>
      <rect className="eb-visual-server" x="316" y="66" width="48" height="52" rx="7" />
      <text className="eb-visual-node-label is-inverse" x="340" y="92" textAnchor="middle" dominantBaseline="central">DHCP</text>
      <path id="sd-req" className="eb-visual-link" fill="none" d="M 292 82 L 316 82" />
      <path id="sd-res" className="eb-visual-link is-strong" fill="none" d="M 316 102 L 292 102" />
      {!reducedMotion && (<>
        <circle className="eb-visual-dot" r="4"><animateMotion dur="2.6s" repeatCount="indefinite" keyTimes="0;0.5;1" keyPoints="0;1;1" calcMode="linear"><mpath href="#sd-req" /></animateMotion></circle>
        <circle className="eb-visual-dot is-response" r="4"><animateMotion dur="2.6s" begin="1.3s" repeatCount="indefinite" keyTimes="0;0.5;1" keyPoints="0;1;1" calcMode="linear"><mpath href="#sd-res" /></animateMotion></circle>
      </>)}
      <text className="eb-visual-meta" x="286" y="150" textAnchor="middle">يوزّعه سيرفر DHCP وقد يتغيّر</text>
    </svg>
  );
}
