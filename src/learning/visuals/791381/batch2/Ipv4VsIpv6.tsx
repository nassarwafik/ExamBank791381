import type { LearningVisualProps } from "../../types";

/**
 * «IPv4 و IPv6» (Book 791381, PDF 26) — a comparison: IPv4 is 32 bits in 4 numeric octets (192.168.1.5) while IPv6
 * is 128 bits in 8 hex groups (2001:db8::1). Each row stacks cleanly: label · segment bar · the example address ·
 * a short size note. Motion: a soft emphasis sweeps each bar. Reduced motion ⇒ both bars static. Tokens render LTR.
 */
function Row({ label, count, w, cls, token, meta, reducedMotion, delay }:
  { label: string; count: number; w: number; cls: string; token: string; meta: string; reducedMotion: boolean; delay: number }) {
  const barW = count * w + (count - 1) * 3;
  const x0 = (380 - barW) / 2;
  return (
    <>
      <text className="eb-visual-row-label" x="24" y="0" direction="ltr">{label}</text>
      <g className={reducedMotion ? "" : "eb-visual-glow-anim"} style={reducedMotion ? undefined : { animationDelay: `${delay}s` }}>
        {Array.from({ length: count }, (_, i) => <rect key={i} className={"eb-visual-seg " + cls} x={x0 + i * (w + 3)} y="8" width={w} height="22" rx="3" />)}
      </g>
      <text className="eb-visual-token" x="190" y="48" textAnchor="middle" dominantBaseline="central" direction="ltr">{token}</text>
      <text className="eb-visual-meta" x="190" y="66" textAnchor="middle">{meta}</text>
    </>
  );
}

export default function Ipv4VsIpv6({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <g transform="translate(0 26)"><Row label="IPv4" count={4} w={70} cls="is-v4" token="192.168.1.5" meta="‏32 بت · 4 مقاطع رقمية" reducedMotion={reducedMotion} delay={0} /></g>
      <line className="eb-visual-divider" x1="40" y1="114" x2="340" y2="114" />
      <g transform="translate(0 128)"><Row label="IPv6" count={8} w={34} cls="is-v6" token="2001:db8::1" meta="‏128 بت · 8 مجموعات (أرقام وحروف)" reducedMotion={reducedMotion} delay={0.6} /></g>
    </svg>
  );
}
