import type { LearningVisualProps } from "../../types";

/**
 * «الاتصالات الآمنة» (Book 791381, PDF 112) — the page defines security as TWO things together: (1) protecting the
 * data (encryption) AND (2) verifying the identity of the other party. The visual has both pillars: the data crosses
 * a protected/encrypted channel, and the receiver carries an identity-verification check. Motion is causal: the data
 * first crosses the encrypted channel, then the identity check confirms the endpoint. Reduced motion ⇒ a still frame
 * with both pillars shown. No certificate internals or key mechanics.
 */
const S = { x: 58, y: 66 };
const R = { x: 322, y: 66 };
export default function SecureTwoPillars({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 176"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      {/* protected/encrypted channel band */}
      <rect data-encrypted="1" className="eb-visual-seg is-v4" x="96" y="50" width="188" height="32" rx="16" />
      <text className="eb-visual-part-label" x="190" y="42" textAnchor="middle">قناة مشفّرة</text>
      {/* lock in the middle of the channel */}
      <g transform={`translate(190 66)`}><rect x="-8" y="-4" width="16" height="12" rx="2" className="eb-visual-router" /><path d="M-5 -4 v-4 a5 5 0 0 1 10 0 v4" fill="none" stroke="var(--eb-primary-strong)" strokeWidth="2" /></g>
      <rect className="eb-visual-node" x={S.x - 26} y={S.y - 15} width="52" height="30" rx="6" /><text className="eb-visual-node-label" x={S.x} y={S.y} textAnchor="middle" dominantBaseline="central">المرسِل</text>
      <rect className="eb-visual-node is-target" x={R.x - 26} y={R.y - 15} width="52" height="30" rx="6" /><text className="eb-visual-node-label" x={R.x} y={R.y} textAnchor="middle" dominantBaseline="central">المستقبِل</text>
      {/* identity-verification check on the receiver */}
      <g data-identity="1" transform={`translate(${R.x} ${R.y + 30})`}>
        <path className="eb-visual-printer" d="M0 -12 L11 -7 V2 a11 13 0 0 1 -11 12 a11 13 0 0 1 -11 -12 V-7 Z" />
        <path d="M-5 0 l3 4 6 -7" fill="none" stroke="var(--eb-success)" strokeWidth="2.4" />
      </g>
      {/* TWO PILLARS shown TOGETHER — NOT a protocol sequence. The book (PDF112) defines security as protecting the
          data AND verifying the other party's identity, both at once; it does not say the data is sent first and the
          identity checked afterward. So the data crosses the encrypted channel while the identity check runs — both
          begin at 0s, neither is a consequence of the other. Reduced motion shows both pillars statically. */}
      {!reducedMotion ? (
        <>
          <g className="eb-visual-packet"><rect x="-6" y="-5" width="12" height="10" rx="2" /><animateMotion id="secData" begin="0s" dur="1.8s" repeatCount="indefinite" path={`M ${S.x + 26} ${S.y} L ${R.x - 26} ${R.y}`} /></g>
          <circle data-identity-anim="1" cx={R.x} cy={R.y + 30} r="16" fill="none" stroke="var(--eb-success)" strokeWidth="2" opacity="0">
            <animate id="secCheck" attributeName="opacity" begin="0s" dur="1.8s" repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.3;0.7;1" />
          </circle>
        </>
      ) : (
        <rect className="eb-visual-packet-static" x="184" y="61" width="12" height="10" rx="2" />
      )}
      <text className="eb-visual-caption-svg" x="190" y="150" textAnchor="middle">الأمان = تشفير البيانات + التحقق من هوية الطرف الآخر</text>
    </svg>
  );
}
