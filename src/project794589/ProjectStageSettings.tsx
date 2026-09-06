import { useEffect, useMemo, useState } from "react";
import { projectApi } from "./api";
import { TRACK_META, stagesByGroup } from "./helpers";
import type { ProjectStage, ProjectGroup, Track } from "./types";

type Template = { stages: ProjectStage[]; groups: ProjectGroup[]; trackWeights: { book: number; packetTracer: number }; config: Record<string, number> };

// Edits the CLASS snapshot only (never the global default). Deletion is soft (active:false) so a
// stage that already has student history is never lost.
export default function ProjectStageSettings({ token, classId, readOnly }: { token: string; classId: string; readOnly: boolean }) {
  const [tpl, setTpl] = useState<Template | null>(null);
  const [track, setTrack] = useState<Track>("book");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await projectApi<{ template: Template; readOnly: boolean }>(token, "/api/project-794589?resource=template&classId=" + encodeURIComponent(classId));
      setTpl(r.template);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل المراحل."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [classId]);

  const groups = useMemo(() => tpl ? tpl.groups.filter(g => g.track === track).sort((a, b) => a.order - b.order) : [], [tpl, track]);
  const byGroup = useMemo(() => tpl ? stagesByGroup(tpl.stages, track) : new Map(), [tpl, track]);

  function editStage(stageId: string, patch: Partial<ProjectStage>) {
    setTpl(prev => prev ? { ...prev, stages: prev.stages.map(s => s.stageId === stageId ? { ...s, ...patch } : s) } : prev);
  }
  function addStage(groupId: string) {
    setTpl(prev => {
      if (!prev) return prev;
      const nums = prev.stages.map(s => Number(String(s.stageId).replace(/\D/g, "")) || 0);
      const prefix = track === "book" ? "B" : "P";
      const id = prefix + String(Math.max(0, ...nums) + 1).padStart(2, "0");
      const order = Math.max(0, ...prev.stages.filter(s => s.track === track).map(s => s.order)) + 1;
      return { ...prev, stages: [...prev.stages, { stageId: id, track, groupId, title: "مرحلة جديدة", description: "", order, weight: 1, required: true, active: true }] };
    });
  }

  async function save() {
    if (!tpl || readOnly || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await projectApi(token, "/api/project-794589", { method: "POST", body: JSON.stringify({ action: "template.update", classId, template: { stages: tpl.stages, trackWeights: tpl.trackWeights, config: tpl.config } }) });
      setNotice("✓ تم حفظ إعداد المراحل.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ الإعداد."); }
    finally { setBusy(false); }
  }

  if (loading && !tpl) return <div className="platform-loading">⏳ جارٍ التحميل...</div>;
  if (!tpl) return <div className="platform-error">{error || "تعذر التحميل."}</div>;

  return (
    <div className="p794-settings">
      {readOnly && <div className="platform-warning">الصف مؤرشف — الإعداد للقراءة فقط.</div>}
      {error && <div className="platform-error">{error}</div>}
      {notice && <div className="platform-notice">{notice}</div>}
      <div className="p794-settings-bar">
        <nav className="analytics-view-tabs" role="tablist">
          {(["book", "packetTracer"] as Track[]).map(t => <button key={t} type="button" className={"analytics-view-tab " + (track === t ? "active" : "")} onClick={() => setTrack(t)}>{TRACK_META[t].icon} {TRACK_META[t].label}</button>)}
        </nav>
        {!readOnly && <button className="platform-primary" disabled={busy} onClick={() => void save()}>حفظ التغييرات</button>}
      </div>
      {groups.map(g => (
        <section key={g.groupId} className="platform-card">
          <div className="platform-card-heading"><div><span className="platform-eyebrow">{g.groupId}</span><h3>{g.title}</h3></div>
            {!readOnly && <button onClick={() => addStage(g.groupId)}>+ إضافة مرحلة</button>}
          </div>
          <div className="p794-settings-list">
            {((byGroup.get(g.groupId) || []) as ProjectStage[]).map(stage => (
              <div key={stage.stageId} className={"p794-settings-row" + (stage.active === false ? " inactive" : "")}>
                <span className="p794-stage-code">{stage.stageId}</span>
                <input className="p794-settings-title" value={stage.title} disabled={readOnly} onChange={e => editStage(stage.stageId, { title: e.target.value })} />
                <label className="p794-settings-num">الوزن<input type="number" min={0} step={0.5} value={stage.weight ?? 1} disabled={readOnly} onChange={e => editStage(stage.stageId, { weight: Number(e.target.value) })} /></label>
                <label className="p794-settings-num">الترتيب<input type="number" value={stage.order} disabled={readOnly} onChange={e => editStage(stage.stageId, { order: Number(e.target.value) })} /></label>
                <label className="p794-settings-check"><input type="checkbox" checked={stage.required !== false} disabled={readOnly} onChange={e => editStage(stage.stageId, { required: e.target.checked })} />إلزامية</label>
                <label className="p794-settings-check"><input type="checkbox" checked={stage.active !== false} disabled={readOnly} onChange={e => editStage(stage.stageId, { active: e.target.checked })} />مفعّلة</label>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
