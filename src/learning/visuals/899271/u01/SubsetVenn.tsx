import type { LearningVisualProps } from "../../types";

/** AUTO-A2 unit 1 (S1 11–13) — A ⊆ B: the circle of A inside the circle of B, with the slide's example words. Static. */
export default function SubsetVenn({ ariaLabel, className }: LearningVisualProps) {
  return (
    <svg className={"eb-visual" + (className ? " " + className : "")} viewBox="0 0 380 210" role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <ellipse className="eb-visual-zone" cx="190" cy="105" rx="165" ry="85" />
      <text className="eb-visual-zone-label" x="320" y="40" textAnchor="middle" direction="ltr">B</text>
      <ellipse className="eb-visual-zone is-inner" cx="150" cy="110" rx="90" ry="50" />
      <text className="eb-visual-zone-label" x="80" y="78" textAnchor="middle" direction="ltr">A</text>
      {[["aa", 120, 100], ["abb", 165, 95], ["bb", 145, 128]].map(([t, x, y]) => <text key={t} className="eb-visual-token" x={x} y={y} textAnchor="middle" direction="ltr">{t}</text>)}
      {[["aaa", 278, 90], ["bbb", 290, 128]].map(([t, x, y]) => <text key={t} className="eb-visual-token" x={x} y={y} textAnchor="middle" direction="ltr">{t}</text>)}
      <text className="eb-visual-caption-svg" x="190" y="204" textAnchor="middle">‏كل عنصر في A موجود أيضًا في B</text>
    </svg>
  );
}
