import type { LearningVisualProps } from "../../types";

/**
 * «فئات العناوين» (Book 791381, PDF 35) — the class is decided by the FIRST octet only: A = 1–126, B = 128–191,
 * C = 192–223. A number line from 0 to 223 is split into the three class bands. Motion: a marker sweeps the line to
 * show "read the first number, find its band". Reduced motion ⇒ bands shown, no sweep.
 */
const X0 = 26, W = 328, Y = 78, H = 30, MAX = 223;
const px = (v: number) => X0 + (v / MAX) * W;
const BANDS = [
  { a: 1, b: 126, label: "A", cls: "is-a" },
  { a: 128, b: 191, label: "B", cls: "is-b" },
  { a: 192, b: 223, label: "C", cls: "is-c" },
];

export default function AddressClasses({ ariaLabel, reducedMotion, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 150"
      role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <text className="eb-visual-caption-svg" x="190" y="34" textAnchor="middle">الرقم الأول من اليسار يحدّد الفئة</text>
      <line className="eb-visual-axis" x1={X0} y1={Y + H + 8} x2={X0 + W} y2={Y + H + 8} />
      {BANDS.map((bd, i) => {
        const x = px(bd.a), w = px(bd.b) - px(bd.a);
        return (
          <g key={i}>
            <rect className={"eb-visual-band " + bd.cls} x={x} y={Y} width={w} height={H} rx="5" />
            <text className="eb-visual-band-label" x={x + w / 2} y={Y + H / 2} textAnchor="middle" dominantBaseline="central">{bd.label}</text>
            <text className="eb-visual-tick" x={x} y={Y + H + 22} textAnchor="middle" direction="ltr">{bd.a}</text>
            <text className="eb-visual-tick" x={x + w} y={Y + H + 22} textAnchor="middle" direction="ltr">{bd.b}</text>
          </g>
        );
      })}
      {!reducedMotion && (
        <g className="eb-visual-sweep-anim">
          <line className="eb-visual-marker" x1="0" y1={Y - 6} x2="0" y2={Y + H + 6} />
        </g>
      )}
    </svg>
  );
}
