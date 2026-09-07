import { useEffect, useState } from "react";
import { trackerGet } from "./api";
import { trackIcon } from "./helpers";
import type { ProjectMeta } from "./types";

type Props = { token: string; onOpenProject: (projectCode: string) => void };

// Landing page for the "📡 المشاريع" group: a card per registered project. Reads the registry via the
// generic API, so a new project appears here automatically once added to the backend registry.
export default function ProjectHub({ token, onOpenProject }: Props) {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const r = await trackerGet<{ projects: ProjectMeta[] }>(token, "", "projects");
        if (!cancelled) setProjects(r.projects || []);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "تعذر تحميل المشاريع."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <section className="teacher-platform p794-root" dir="rtl">
      <div className="teacher-platform-inner">
        <section className="teacher-assignment-heading">
          <span className="platform-eyebrow">Projects</span>
          <h2>📡 المشاريع</h2>
          <p>اختر مشروعًا لمتابعة تقدّم الطلاب فيه واعتماد المراحل ورؤية الإحصائيات.</p>
        </section>
        {error && <div className="platform-error">{error}</div>}
        {loading && !projects.length && <div className="platform-loading">⏳ جارٍ التحميل...</div>}
        <div className="p794-hub-grid">
          {projects.map(p => (
            <article key={p.projectCode} className="platform-card p794-hub-card">
              <div className="p794-hub-code">📡 {p.projectCode}</div>
              <h3>{p.title}</h3>
              <div className="p794-hub-tracks">
                {p.tracks.map(t => <span key={t.trackId} className="p794-chip-tag">{trackIcon(t.icon)} {t.title}</span>)}
              </div>
              <button className="platform-primary" onClick={() => onOpenProject(p.projectCode)}>فتح المشروع</button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
