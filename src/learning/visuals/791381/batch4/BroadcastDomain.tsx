import type { LearningVisualProps } from "../../types";

/**
 * «Broadcast Domain» (Book 791381, PDF 100) — a broadcast sent inside a switch domain reaches ALL devices in that
 * same broadcast domain. Motion TEACHES the fan-out and is causal: the broadcast first travels from the source up to
 * the switch, and ONLY THEN fans out to every device at once (each device is reached). Reduced motion ⇒ a still frame
 * with the four links highlighted as reached. (Router splitting is NOT shown — that is the PDF-101 interactive.)
 */
const SW = { x: 190, y: 104 };
const SRC = { x: 190, y: 170 };
const TARGETS = [{ x: 46, y: 44 }, { x: 142, y: 44 }, { x: 238, y: 44 }, { x: 334, y: 44 }];
export default function BroadcastDomain({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 200"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <rect className="eb-visual-zone" x="14" y="24" width="352" height="150" rx="16" />
      <text className="eb-visual-zone-label" x="30" y="40">مجال بث واحد</text>
      {/* links */}
      {TARGETS.map((t, i) => <line key={i} className="eb-visual-link is-strong" x1={SW.x} y1={SW.y} x2={t.x} y2={t.y} />)}
      <line className="eb-visual-link" x1={SW.x} y1={SW.y} x2={SRC.x} y2={SRC.y} />
      {/* target devices + source */}
      {TARGETS.map((t, i) => <rect key={i} className="eb-visual-node is-target" x={t.x - 18} y={t.y - 13} width="36" height="26" rx="5" />)}
      <rect className="eb-visual-switch-box" x={SW.x - 22} y={SW.y - 14} width="44" height="28" rx="6" />
      <text className="eb-visual-node-label is-inverse" x={SW.x} y={SW.y} textAnchor="middle" dominantBaseline="central">Switch</text>
      <rect className="eb-visual-node" x={SRC.x - 20} y={SRC.y - 13} width="40" height="26" rx="5" />
      <text className="eb-visual-part-label" x={SRC.x} y={SRC.y + 26} textAnchor="middle">المرسِل</text>
      {/* causal motion: source → switch first, then fan-out to ALL devices */}
      {!reducedMotion ? (
        <>
          <path id="bd-up" className="eb-visual-route" d={`M ${SRC.x} ${SRC.y} L ${SW.x} ${SW.y}`} />
          <g className="eb-visual-packet"><rect x="-6" y="-5" width="12" height="10" rx="2" /><animateMotion id="bcUp" begin="0s;bcFan0.end" dur="0.9s"><mpath href="#bd-up" /></animateMotion></g>
          {TARGETS.map((t, i) => (
            <g key={i} data-recv="1" className="eb-visual-packet">
              <rect x="-5" y="-5" width="10" height="10" rx="2" />
              <animateMotion id={i === 0 ? "bcFan0" : undefined} begin="bcUp.end" dur="0.9s" path={`M ${SW.x} ${SW.y} L ${t.x} ${t.y}`} />
            </g>
          ))}
        </>
      ) : (
        TARGETS.map((t, i) => <rect key={i} data-recv="1" className="eb-visual-packet-static" x={(SW.x + t.x) / 2 - 5} y={(SW.y + t.y) / 2 - 5} width="10" height="10" rx="2" />)
      )}
      <text className="eb-visual-caption-svg" x="190" y="192" textAnchor="middle">البث يصل إلى كل الأجهزة داخل مجال البث نفسه</text>
    </svg>
  );
}
