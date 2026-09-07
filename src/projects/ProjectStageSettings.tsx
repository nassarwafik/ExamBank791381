import { useEffect, useMemo, useState } from "react";
import { trackerGet, trackerPost } from "./api";
import { stagesByGroup, trackIcon } from "./helpers";
import type { ProjectStage, ProjectGroup, TrackMeta } from "./types";

type Template = { stages: ProjectStage[]; groups: ProjectGroup[]; trackWeights: Record<string, number>; config: Record<string, number> };
type Props = { token: string; projectCode: string; classId: string; tracks: TrackMeta[]; readOnly: boolean };

// Derives the stage-id prefix for a track from its existing stages (B/P/A/V…), falling back to the
// first letter of the trackId — so "Add stage" never borrows another track's numbering.
function trackPrefix(stages: ProjectStage[], trackId: string): string {
  const sample = stages.find(s => s.track === trackId);
  if (sample) { const p = String(sample.stageId).replace(/\d+/g, ""); if (p) return p; }
  return (trackId[0] || "S").toUpperCase();
}

export default function ProjectStageSettings({ token, projectCode, classId, tracks, readOnly }: Props) {
  const [tpl, setTpl] = useState<Template | null>(null);
  const [track, setTrack] = useState<string>(tracks[0]?.trackId || "");
  const [groupFilter, setGroupFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await trackerGet<{ template: Template }>(token, projectCode, "template", { classId });
      setTpl(r.template);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل المراحل."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [classId, projectCode]);

  const groups = useMemo(() => tpl ? tpl.groups.filter(g => g.track === track).sort((a, b) => a.order - b.order) : [], [tpl, track]);
  const byGroup = useMemo(() => tpl ? stagesByGroup(tpl.stages, track) : new Map<string, ProjectStage[]>(), [tpl, track]);
  const term = search.trim().toLowerCase();

  function editStage(stageId: string, patch: Partial<ProjectStage>) {
    setTpl(prev => prev ? { ...prev, stages: prev.stages.map(s => s.stageId === stageId ? { ...s, ...patch } : s) } : prev);
  }
  function addStage(groupId: string) {
    setTpl(prev => {
      if (!prev) return prev;
      const prefix = trackPrefix(prev.stages, track);
      // track-specific numbering: max over THIS track's ids sharing the prefix.
      const nums = prev.stages.filter(s => s.track === track && String(s.stageId).startsWith(prefix)).map(s => Number(String(s.stageId).slice(prefix.length)) || 0);
      const id = prefix + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0");
      const order = Math.max(0, ...prev.stages.filter(s => s.track === track).map(s => s.order)) + 1;
      return { ...prev, stages: [...prev.stages, { stageId: id, track, groupId, title: "مرحلة جديدة", description: "", order, weight: 1, required: true, active: true }] };
    });
  }

  async function save() {
    if (!tpl || readOnly || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await trackerPost(token, projectCode, { action: "template.update", classId, template: { stages: tpl.stages, trackWeights: tpl.trackWeights, config: tpl.config } });
      setNotice("✓ تم حفظ إعداد المراحل.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ الإعداد."); }
    finally { setBusy(false); }
  }

  async function resetProject() {
    if (readOnly || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await trackerPost<{ deletedProgressCount: number }>(token, projectCode, { action: "project.reset", classId });
      setConfirmReset(false);
      setNotice("✓ تم تصفير المشروع لهذا الصف (حُذف تقدّم " + r.deletedProgressCount + " طالبًا). المراحل الآن نسخة جديدة والطلاب كما هم.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تصفير المشروع."); }
    finally { setBusy(false); }
  }

  if (loading && !tpl) return <div className="platform-loading">⏳ جارٍ التحميل...</div>;
  if (!tpl) return <div className="platform-error">{error || "تعذر التحميل."}</div>;

  const visibleGroups = groups.filter(g => !groupFilter || g.groupId === groupFilter);

  return (
    <div className="p794-settings">
      {readOnly && <div className="platform-warning">الصف مؤرشف — الإعداد للقراءة فقط.</div>}
      {error && <div className="platform-error">{error}</div>}
      {notice && <div className="platform-notice">{notice}</div>}
      <div className="p794-settings-bar">
        <nav className="analytics-view-tabs" role="tablist">
          {tracks.map(t => <button key={t.trackId} type="button" className={"analytics-view-tab " + (track === t.trackId ? "active" : "")} onClick={() => { setTrack(t.trackId); setGroupFilter(""); }}>{trackIcon(t.icon)} {t.title}</button>)}
        </nav>
        <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
          <option value="">كل المجموعات</option>
          {groups.map(g => <option key={g.groupId} value={g.groupId}>{g.title}</option>)}
        </select>
        <input className="p794-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن مرحلة..." />
        {!readOnly && <button className="platform-primary" disabled={busy} onClick={() => void save()}>حفظ التغييرات</button>}
      </div>
      {visibleGroups.map(g => {
        const rows = ((byGroup.get(g.groupId) || []) as ProjectStage[]).filter(st => !term || st.title.toLowerCase().includes(term) || st.stageId.toLowerCase().includes(term));
        if (term && !rows.length) return null;
        return (
          <section key={g.groupId} className="platform-card">
            <div className="platform-card-heading"><div><span className="platform-eyebrow">{g.title}</span><h3>{g.title}</h3></div>
              {!readOnly && <button onClick={() => addStage(g.groupId)}>+ إضافة مرحلة</button>}
            </div>
            <div className="p794-settings-list">
              {rows.map(stage => (
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
        );
      })}

      {!readOnly && (
        <section className="platform-card p794-danger-zone">
          <div className="platform-card-heading"><div><span className="platform-eyebrow">منطقة خطرة</span><h3>تصفير المشروع للصف</h3></div></div>
          <p className="p794-muted">يحذف كل تقدّم الطلاب وملاحظاتهم في هذا المشروع لهذا الصف ويعيد المراحل إلى النسخة الجديدة. <strong>الصف وحسابات الطلاب لا تُحذف.</strong> لا يمكن التراجع.</p>
          {!confirmReset ? (
            <button type="button" className="p794-danger-btn" disabled={busy} onClick={() => setConfirmReset(true)}>تصفير المشروع…</button>
          ) : (
            <div className="p794-danger-confirm">
              <span>متأكد؟ سيُحذف كل التقدّم نهائيًا.</span>
              <button type="button" className="p794-danger-btn" disabled={busy} onClick={() => void resetProject()}>{busy ? "جارٍ التصفير…" : "نعم، صفّر المشروع"}</button>
              <button type="button" disabled={busy} onClick={() => setConfirmReset(false)}>إلغاء</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
