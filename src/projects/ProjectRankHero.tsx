import ProjectPerformanceCircle from "./ProjectPerformanceCircle";
import "./performance.css";
import { PROJECT_STRENGTH_MAX, projectRankVisual } from "./projectPerformance";
import type { ProjectPerformance } from "./types";

/**
 * The project detail hero: the project's rank artwork (the SAME six images as the global rank), its title and
 * level, «قوة المشروع: X / 600», and the grade/progress circle. Everything is the server's `performance`.
 */
export default function ProjectRankHero({ title, performance, compact }: { title: string; performance: ProjectPerformance; compact?: boolean }) {
  const v = projectRankVisual(performance.tier);
  const max = performance.maxStrength || PROJECT_STRENGTH_MAX;
  return (
    <div className={"eb-prh" + (compact ? " is-compact" : "")}>
      <div className="eb-prh-rank">
        <img className="eb-prh-art" src={v.image} alt={"رتبة المشروع: " + v.title + " — المستوى " + v.level} width={compact ? 72 : 96} height={compact ? 72 : 96} loading="lazy" decoding="async" />
        <div className="eb-prh-text">
          <p className="eb-prh-title">{title}</p>
          <p className="eb-prh-rank-title">{v.title}<span className="eb-prh-level">المستوى {v.level}</span></p>
          <p className="eb-prh-strength">قوة المشروع: <strong dir="ltr">{performance.projectStrength} / {max}</strong></p>
        </div>
      </div>
      <ProjectPerformanceCircle grade={performance.grade} progress={performance.overallProgress} size={compact ? 112 : 132} />
      <dl className="eb-prh-facts">
        <div><dt>علامة المشروع</dt><dd dir="ltr">{performance.grade} / 100</dd></div>
        <div><dt>التقدم</dt><dd dir="ltr">{performance.overallProgress}%</dd></div>
      </dl>
    </div>
  );
}
