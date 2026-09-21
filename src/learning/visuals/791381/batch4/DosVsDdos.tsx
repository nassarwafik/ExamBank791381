import type { LearningVisualProps } from "../../types";

/**
 * «DoS / DDoS» (Book 791381, PDF 109) — DoS floods a server with many requests from ONE source; DDoS floods the same
 * server with many requests from MANY devices at once. The MOTION makes the distinction visible without relying on
 * labels: the DoS panel streams packets from a single source, the DDoS panel streams from several independent sources
 * simultaneously toward one server. Reduced motion ⇒ still packets. This does not teach any attack implementation.
 */
const DOS_SRC = { x: 40, y: 96 };
const DOS_SRV = { x: 150, y: 96 };
const DDOS_SRV = { x: 356, y: 96 };
const DDOS_SRC = [{ x: 210, y: 40 }, { x: 210, y: 96 }, { x: 210, y: 152 }];
export default function DosVsDdos({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  const server = (x: number, y: number) => (
    <><rect className="eb-visual-node is-target" x={x - 20} y={y - 22} width="40" height="44" rx="6" /><text className="eb-visual-part-label" x={x} y={y + 36} textAnchor="middle">خادم</text></>
  );
  const src = (x: number, y: number, k: number) => (
    <rect key={k} data-src="1" className="eb-visual-node" x={x - 18} y={y - 12} width="36" height="24" rx="5" />
  );
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* ── DoS: ONE source ── */}
      <text className="eb-visual-row-label" x="95" y="22" textAnchor="middle" direction="ltr">DoS</text>
      {src(DOS_SRC.x, DOS_SRC.y, 0)}
      {server(DOS_SRV.x, DOS_SRV.y)}
      <line className="eb-visual-link is-strong" x1={DOS_SRC.x + 18} y1={DOS_SRC.y} x2={DOS_SRV.x - 20} y2={DOS_SRV.y} />
      {!reducedMotion ? [0, 0.4, 0.8].map((b, i) => (
        <g key={i} className="eb-visual-packet"><rect x="-5" y="-4" width="10" height="8" rx="2" /><animateMotion begin={`${b}s`} dur="1.2s" repeatCount="indefinite" path={`M ${DOS_SRC.x + 18} ${DOS_SRC.y} L ${DOS_SRV.x - 20} ${DOS_SRV.y}`} /></g>
      )) : <rect className="eb-visual-packet-static" x="92" y="92" width="10" height="8" rx="2" />}
      <text className="eb-visual-part-label" x="95" y="184" textAnchor="middle">مصدر واحد يُغرق الخادم</text>

      {/* ── DDoS: MANY sources ── */}
      <text className="eb-visual-row-label" x="290" y="22" textAnchor="middle" direction="ltr">DDoS</text>
      {DDOS_SRC.map((s, i) => src(s.x, s.y, i + 1))}
      {server(DDOS_SRV.x, DDOS_SRV.y)}
      {DDOS_SRC.map((s, i) => <line key={i} className="eb-visual-link is-strong" x1={s.x + 18} y1={s.y} x2={DDOS_SRV.x - 20} y2={DDOS_SRV.y} />)}
      {!reducedMotion ? DDOS_SRC.map((s, i) => (
        <g key={i} className="eb-visual-packet"><rect x="-5" y="-4" width="10" height="8" rx="2" /><animateMotion begin={`${i * 0.3}s`} dur="1.2s" repeatCount="indefinite" path={`M ${s.x + 18} ${s.y} L ${DDOS_SRV.x - 20} ${DDOS_SRV.y}`} /></g>
      )) : DDOS_SRC.map((s, i) => <rect key={i} className="eb-visual-packet-static" x={s.x + 40} y={s.y - 4} width="10" height="8" rx="2" />)}
      <text className="eb-visual-part-label" x="288" y="184" textAnchor="middle">أجهزة كثيرة تُغرقه معًا</text>
      <text className="eb-visual-caption-svg" x="190" y="204" textAnchor="middle">DoS: مصدر واحد · DDoS: مصادر كثيرة في آن واحد</text>
    </svg>
  );
}
