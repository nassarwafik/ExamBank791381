import type { LearningVisualProps } from "../../types";

/**
 * «APIPA» (Book 791381, PDF 105) — when a client asks for automatic configuration but finds NO DHCP server to answer,
 * it falls back and gives ITSELF an APIPA address 169.254.x.x, which works only inside the local network. Motion
 * TEACHES it: the client sends a DHCP request toward the server, which does not answer (marked ✗), so no reply
 * returns; the fallback 169.254 address on the client is emphasised. Reduced motion ⇒ a still frame showing the
 * fallback address. It deliberately does NOT claim normal internet connectivity.
 */
const CLIENT = { x: 70, y: 70 };
const SERVER = { x: 312, y: 70 };
export default function ApipaFallback({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 180"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <line className="eb-visual-link" x1={CLIENT.x + 28} y1={CLIENT.y} x2={SERVER.x - 28} y2={SERVER.y} />
      {/* client + its fallback APIPA address */}
      <rect className="eb-visual-node is-target" x={CLIENT.x - 28} y={CLIENT.y - 18} width="56" height="36" rx="6" />
      <text className="eb-visual-node-label" x={CLIENT.x} y={CLIENT.y} textAnchor="middle" dominantBaseline="central">جهازك</text>
      {/* the APIPA fallback address is HIDDEN until the request has failed — revealed only after the no-response stage,
          never glowing from time zero. Reduced motion shows it statically. */}
      <g data-fallback="1" opacity={reducedMotion ? 1 : 0}>
        <rect data-apipa="1" className="eb-visual-octet is-host" x={CLIENT.x - 46} y={CLIENT.y + 26} width="92" height="24" rx="5" />
        <text className="eb-visual-token is-octet" x={CLIENT.x} y={CLIENT.y + 38} textAnchor="middle" dominantBaseline="central" direction="ltr">169.254.10.7</text>
        {!reducedMotion && <animate id="apipaFallback" attributeName="opacity" begin="apipaNoResp.end" dur="1.2s" values="0;1;1;0" keyTimes="0;0.25;0.7;1" />}
      </g>
      {/* DHCP server that does NOT answer */}
      <rect className="eb-visual-node" x={SERVER.x - 30} y={SERVER.y - 18} width="60" height="36" rx="6" />
      <text className="eb-visual-node-label" x={SERVER.x} y={SERVER.y} textAnchor="middle" dominantBaseline="central" direction="ltr">DHCP?</text>
      {/* the "no response" mark is HIDDEN until the request reaches the server (begins on apipaReq.end) */}
      <g data-noresp="1" opacity={reducedMotion ? 1 : 0}>
        <g transform={`translate(${SERVER.x + 40} ${SERVER.y})`}>
          <circle className="eb-visual-pin" r="12" /><path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#fff" strokeWidth="2" fill="none" />
        </g>
        <text className="eb-visual-part-label" x={SERVER.x} y={SERVER.y + 34} textAnchor="middle">لا استجابة</text>
        {/* the no-response flash appears then RESETS to 0 (no fill=freeze), so it does not linger into the next request */}
        {!reducedMotion && <animate id="apipaNoResp" attributeName="opacity" begin="apipaReq.end" dur="0.9s" values="0;1;1;0" keyTimes="0;0.25;0.7;1" />}
      </g>
      {/* bounded causal cycle: the request goes out (nothing returns — no DHCP reply); on arrival the no-response mark
          appears; ONLY THEN the APIPA fallback is revealed; the next request waits for the fallback stage to finish. */}
      {!reducedMotion ? (
        <g className="eb-visual-packet"><rect x="-6" y="-5" width="12" height="10" rx="2" /><animateMotion id="apipaReq" begin="0s;apipaFallback.end" dur="1.1s" fill="freeze" path={`M ${CLIENT.x + 28} ${CLIENT.y} L ${SERVER.x - 28} ${SERVER.y}`} /></g>
      ) : (
        <rect className="eb-visual-packet-static" x={(CLIENT.x + SERVER.x) / 2 - 6} y={CLIENT.y - 5} width="12" height="10" rx="2" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="150" textAnchor="middle">لا يجد DHCP فيختار 169.254 لنفسه تلقائيًا</text>
      <text className="eb-visual-meta" x="190" y="166" textAnchor="middle">يعمل داخل الشبكة المحلية فقط</text>
    </svg>
  );
}
