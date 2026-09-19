import VisuallyHidden from "../ui/VisuallyHidden";
import "./performance.css";

/**
 * The project grade/progress circle: the GRADE (/100) sits in the centre, the PROGRESS (%) is the outer ring.
 * Two different axes on purpose (progress 90% with grade 65 is valid). Presentation only — both numbers are the
 * server's. Accessible: the ring is a progressbar named «التقدم في المشروع», the centre is text, and a visually
 * hidden sentence states both values in words.
 */
const R = 44;
const C = 2 * Math.PI * R;
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

export default function ProjectPerformanceCircle({ grade, progress, size = 132 }: { grade: number; progress: number; size?: number }) {
  const p = clamp(progress);
  const g = clamp(grade);
  return (
    <div className="eb-ppc" style={{ width: size, height: size }}>
      <div className="eb-ppc-ring" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-valuetext={p + "%"} aria-label="التقدم في المشروع">
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
          <circle className="eb-ppc-track" cx="50" cy="50" r={R} fill="none" />
          <circle className="eb-ppc-fill" cx="50" cy="50" r={R} fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - p / 100)} transform="rotate(-90 50 50)" />
        </svg>
      </div>
      <div className="eb-ppc-center" aria-hidden="true">
        <strong className="eb-ppc-grade"><span dir="ltr">{g} / 100</span></strong>
        <span className="eb-ppc-grade-label">العلامة</span>
      </div>
      <p className="eb-ppc-progress" aria-hidden="true"><span dir="ltr">{p}%</span> التقدم في المشروع</p>
      <VisuallyHidden>العلامة {g} من 100، والتقدم في المشروع {p} بالمئة.</VisuallyHidden>
    </div>
  );
}
