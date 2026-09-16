import EmptyState from "../ui/EmptyState";
import StatusBadge from "../ui/StatusBadge";
import { IconProjects } from "../icons";
import type { ProjectMeta } from "./types";
import "../projects-pro.css";

type Props = {
  /** The registry catalog already loaded by App at teacher boot (one read); the hub never re-fetches it. */
  projects: ProjectMeta[];
  status: "loading" | "ready" | "error";
  /** Ready-for-review counts per project from the existing global projects-summary read. */
  readyByProject: Record<string, number>;
  onRetry?: () => void;
  onOpenProject: (projectCode: string) => void;
};

// Landing page for "المشاريع": one card per registered project. The shell owns the page title, so the hub
// starts directly with content (no hero / eyebrow).
export default function ProjectHub({ projects, status, readyByProject, onRetry, onOpenProject }: Props) {
  if (status === "error") {
    return (
      <section className="eb-projects-hub" aria-label="المشاريع">
        <div className="platform-error assignment-inline-message" role="alert">
          تعذر تحميل قائمة المشاريع.{" "}
          {onRetry && <button type="button" className="eb-button is-small" onClick={onRetry}>إعادة المحاولة</button>}
        </div>
      </section>
    );
  }
  if (status === "loading" && !projects.length) {
    return <section className="eb-projects-hub" aria-label="المشاريع"><p className="eb-muted" role="status">جارٍ تحميل المشاريع...</p></section>;
  }
  if (!projects.length) {
    return <section className="eb-projects-hub" aria-label="المشاريع"><EmptyState title="لا توجد مشاريع مسجّلة." description="تظهر المشاريع هنا تلقائيًا عند إضافتها إلى سجل المشاريع." /></section>;
  }
  return (
    <section className="eb-projects-hub" aria-label="المشاريع">
      <ul className="eb-project-cards">
        {projects.map(p => {
          const ready = Number(readyByProject[p.projectCode]) || 0;
          return (
            <li key={p.projectCode} className="eb-project-card">
              <div className="eb-project-card-head">
                <span className="eb-project-card-icon" aria-hidden="true"><IconProjects size={20} /></span>
                <div className="eb-project-card-text">
                  <h2 className="eb-project-card-title">{p.title}</h2>
                  <p className="eb-project-card-meta">الرمز {p.projectCode}</p>
                </div>
              </div>
              <ul className="eb-project-card-tracks" aria-label={"مسارات " + p.title}>
                {p.tracks.map(t => <li key={t.trackId}><StatusBadge tone="neutral">{t.title}</StatusBadge></li>)}
              </ul>
              <div className="eb-project-card-foot">
                {ready > 0
                  ? <StatusBadge tone="info">{ready} مراحل بانتظار الفحص</StatusBadge>
                  : <span className="eb-muted eb-project-card-quiet">لا مراحل بانتظار الفحص</span>}
                <button type="button" className="eb-button is-primary" onClick={() => onOpenProject(p.projectCode)}>فتح المشروع</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
