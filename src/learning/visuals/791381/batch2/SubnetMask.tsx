import type { LearningVisualProps } from "../../types";

/**
 * «قناع الشبكة Subnet Mask» (Book 791381, PDF 37) — the mask tells which octets are the NETWORK part (255) and which
 * are the HOST part (0). Faithful example IP 192.168.1.100 with mask 255.255.255.0 → network 192.168.1, host 100.
 * Motion: the mask slides over the address and the network octets light up. Reduced motion ⇒ mask in place, network
 * octets highlighted statically. All numbers render LTR.
 */
const IP = [192, 168, 1, 100];
const MASK = [255, 255, 255, 0];
const X0 = 34, CW = 74, GAP = 4, Y = 60;

export default function SubnetMask({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 190"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {IP.map((v, i) => {
        const x = X0 + i * (CW + GAP);
        const network = MASK[i] === 255;
        const anim = network && !reducedMotion ? " eb-visual-glow-anim" : "";
        return (
          <g key={i}>
            <rect className={"eb-visual-octet" + (network ? " is-network" : " is-host") + anim} x={x} y={Y} width={CW} height={40} rx="6"
              style={anim ? { animationDelay: `${i * 0.3}s` } : undefined} />
            <text className="eb-visual-token is-octet" x={x + CW / 2} y={Y + 20} textAnchor="middle" dominantBaseline="central" direction="ltr">{v}</text>
            <text className="eb-visual-mask-cell" x={x + CW / 2} y={Y + 62} textAnchor="middle" direction="ltr">{MASK[i]}</text>
            <text className="eb-visual-part-label" x={x + CW / 2} y={Y - 12} textAnchor="middle">{network ? "شبكة" : "جهاز"}</text>
          </g>
        );
      })}
      <text className="eb-visual-caption-svg" x="190" y="30" textAnchor="middle">‏255 = جزء الشبكة · 0 = جزء الجهاز</text>
      <text className="eb-visual-meta" x="190" y="168" textAnchor="middle">القناع (الصف السفلي) يكشف أين ينتهي جزء الشبكة</text>
    </svg>
  );
}
