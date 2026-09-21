import type { LearningVisualProps } from "../../types";

/**
 * «التجزئة Subnetting — المثال المحلول» (Book 791381, PDF 242) — the page's own worked example 192.168.1.25 /24, laid
 * out so each piece is visually separated: the IP octets, the /24 prefix boundary, the NETWORK part (first three
 * octets) vs the HOST part (last octet), and the four results the book computes — Network .0, first host .1, last host
 * .254, Broadcast .255. Motion TEACHES the derivation: the four results reveal in order after the split. ONE-SHOT: the
 * first result begins at a fixed time and each freezes, so it plays once. Reduced motion ⇒ the split and all four
 * results shown still. Book scope: this exact example only — no new example is invented.
 */
const OCTETS = ["192", "168", "1", "25"];
const RESULTS: [string, string][] = [
  ["الشبكة", "192.168.1.0"],
  ["أول جهاز", "192.168.1.1"],
  ["آخر جهاز", "192.168.1.254"],
  ["البث", "192.168.1.255"],
];
export default function SubnettingWalkthrough({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const X0 = 40, CW = 68, GAP = 4, Y = 48;
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 220"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-row-label" x="190" y="22" textAnchor="middle">‏مثال الكتاب: 192.168.1.25 /24</text>

      {/* the IP octets, split into network (first three) vs host (last) at the /24 boundary */}
      <g data-part="ip">
        {OCTETS.map((v, i) => {
          const x = X0 + i * (CW + GAP);
          const network = i < 3;
          return (
            <g key={i} data-band={network ? "network" : "host"}>
              <rect className={"eb-visual-octet " + (network ? "is-network" : "is-host")} x={x} y={Y} width={CW} height={38} rx="6" />
              <text className="eb-visual-token is-octet" x={x + CW / 2} y={Y + 19} textAnchor="middle" dominantBaseline="central" direction="ltr">{v}</text>
              <text className="eb-visual-part-label" x={x + CW / 2} y={Y - 10} textAnchor="middle">{network ? "شبكة" : "جهاز"}</text>
            </g>
          );
        })}
      </g>
      {/* the /24 prefix boundary between octet 3 and 4 */}
      <g data-part="prefix">
        <line className="eb-visual-divider" x1={X0 + 3 * (CW + GAP) - GAP / 2} y1={Y - 6} x2={X0 + 3 * (CW + GAP) - GAP / 2} y2={Y + 44} stroke="var(--eb-primary)" />
        <text className="eb-visual-prefix" x={X0 + 3 * (CW + GAP) + 14} y={Y + 54} textAnchor="middle" direction="ltr">/24</text>
      </g>

      {/* the four computed results, revealed in order (one-shot, freeze) */}
      <g data-part="result">
        {RESULTS.map(([label, val], i) => {
          const ry = 116 + i * 24;
          return (
            <g key={label} data-result={label} opacity={reducedMotion ? 1 : 0}>
              {!reducedMotion && <animate id={`sub${i}`} attributeName="opacity" from="0" to="1" dur="0.4s"
                begin={i === 0 ? "0.5s" : `sub${i - 1}.end`} fill="freeze" />}
              <text className="eb-visual-part-label" x="120" y={ry} textAnchor="end" dominantBaseline="central">{label}</text>
              <text className="eb-visual-token is-octet" x="150" y={ry} textAnchor="start" dominantBaseline="central" fontSize="13" direction="ltr">{val}</text>
            </g>
          );
        })}
      </g>
      <text className="eb-visual-caption-svg" x="190" y="212" textAnchor="middle">‏نصفّر جزء الجهاز للشبكة ونملؤه بـ 255 للبث</text>
    </svg>
  );
}
