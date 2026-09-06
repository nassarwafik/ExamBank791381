import { useEffect, useMemo, useState } from "react";
import { STATUS_META, TRACK_META, fmtDate, stagesByGroup } from "./helpers";
import ProjectProgressBar from "./ProjectProgressBar";
import StageStatusBadge from "./StageStatusBadge";
import type { StageStatus, Track, ProjectStage, ProjectGroup, StudentCard } from "./types";

type ProjectData = {
  ok: true; enrolled: boolean; programCode?: string; className?: string;
  summary?: StudentCard; stages?: ProjectStage[]; groups?: ProjectGroup[];
  progress?: Record<string, { status: StageStatus; note?: string; updatedAt?: string }>;
  nextBookStage?: ProjectStage | null; nextPacketTracerStage?: ProjectStage | null;
};

// Read-only "my project 794589" section for the student portal. Uses the student token; shows the
// student's own progress only (the endpoint enforces ownership). Mobile-friendly.
export default function StudentProjectSection({ token }: { token: string }) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [track, setTrack] = useState<Track>("book");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/student-project", { headers: { "x-student-token": token, Authorization: "Bearer " + token } });
        // This is an OPTIONAL secondary panel: it must NEVER log the student out or block the
        // portal. On any failure (401/404/network/parse) it simply doesn't render its section.
        if (!r.ok) return;
        const j = await r.json();
        if (j && j.ok && !cancelled) setData(j);
      } catch { /* ignore - section just won't show */ }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const groups = useMemo(() => data?.groups ? data.groups.filter(g => g.track === track).sort((a, b) => a.order - b.order) : [], [data, track]);
  const byGroup = useMemo(() => data?.stages ? stagesByGroup(data.stages.filter(s => s.active !== false), track) : new Map(), [data, track]);

  // Nothing to show for non-794589 students, or on any error/not-loaded state.
  // This is an optional panel: it silently renders nothing rather than disrupting the portal.
  if (!data || !data.enrolled || !data.summary) return null;

  const s = data.summary;
  const next = track === "book" ? data.nextBookStage : data.nextPacketTracerStage;

  return (
    <section className="student-panel">
      <div className="student-panel-heading"><div><span className="platform-eyebrow">Project 794589</span><h3>📡 مشروعي 794589</h3></div></div>
      <ProjectProgressBar label="التقدم العام" value={s.overallProgress} tone="overall" />
      <div className="p794-portal-tracks">
        <ProjectProgressBar label="📘 الكتاب" value={s.bookProgress} tone="book" />
        <ProjectProgressBar label="🖧 Packet Tracer" value={s.packetTracerProgress} tone="pt" />
      </div>
      {next && <p className="p794-portal-next">الخطوة التالية في {TRACK_META[track].label}: <strong>{next.stageId} — {next.title}</strong></p>}

      <nav className="analytics-view-tabs" role="tablist" aria-label="مسارات المشروع">
        {(["book", "packetTracer"] as Track[]).map(t => (
          <button key={t} type="button" className={"analytics-view-tab " + (track === t ? "active" : "")} onClick={() => setTrack(t)}>{TRACK_META[t].icon} {TRACK_META[t].label}</button>
        ))}
      </nav>

      {groups.map(g => (
        <div key={g.groupId} className="p794-group">
          <div className="p794-group-head" style={{ cursor: "default" }}><span>{g.title}</span></div>
          <div className="p794-stage-list">
            {((byGroup.get(g.groupId) || []) as ProjectStage[]).map(stage => {
              const entry = data.progress ? data.progress[stage.stageId] : undefined;
              const status = (entry?.status || "not_started") as StageStatus;
              return (
                <div key={stage.stageId} className={"p794-stage-row " + STATUS_META[status].className}>
                  <div className="p794-stage-row-main" style={{ cursor: "default" }}>
                    <StageStatusBadge status={status} showLabel={false} />
                    <span className="p794-stage-code">{stage.stageId}</span>
                    <span className="p794-stage-title">{stage.title}</span>
                    {entry?.note ? <span className="p794-note-dot" title={"ملاحظة المعلم: " + entry.note}>📝</span> : null}
                    <small>{fmtDate(entry?.updatedAt || "")}</small>
                  </div>
                  {entry?.note ? <div className="p794-note-view" style={{ margin: "0 12px 10px" }}>📝 {entry.note}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
