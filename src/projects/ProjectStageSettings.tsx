import { useEffect, useMemo, useState } from "react";
import { trackerGet, trackerPost } from "./api";
import { stagesByGroup } from "./helpers";
import { useConfirm } from "../ui/useConfirm";
import SectionHeader from "../ui/SectionHeader";
import EmptyState from "../ui/EmptyState";
import VisuallyHidden from "../ui/VisuallyHidden";
import { IconPlus } from "../icons";
import type { ProjectStage, ProjectGroup, TrackMeta } from "./types";

type Template = { stages: ProjectStage[]; groups: ProjectGroup[]; trackWeights: Record<string, number>; config: Record<string, number> };
type Props = {
  token: string; projectCode: string; classId: string; tracks: TrackMeta[]; readOnly: boolean;
  /** Called after a successful template.update or project.reset (both can change which stages count as ready). */
  onReadyChanged?: () => void;
};

// Derives the stage-id prefix for a track from its existing stages (B/P/A/V…), falling back to the
// first letter of the trackId — so "Add stage" never borrows another track's numbering.
function trackPrefix(stages: ProjectStage[], trackId: string): string {
  const sample = stages.find(s => s.track === trackId);
  if (sample) { const p = String(sample.stageId).replace(/\d+/g, ""); if (p) return p; }
  return (trackId[0] || "S").toUpperCase();
}

const RESET_WARNING = "متأكد؟ سيُحذف كل التقدّم نهائيًا.";

/**
 * Per-class stage template editor. Same `template` read, same `template.update` body ({stages, trackWeights,
 * config}) and same `project.reset` body as before. The inline two-step reset became the shared danger
 * ConfirmDialog with the identical warning text; cancelling sends nothing. Archived classes are read-only.
 */
export default function ProjectStageSettings({ token, projectCode, classId, tracks, readOnly, onReadyChanged }: Props) {
  const [tpl, setTpl] = useState<Template | null>(null);
  const [track, setTrack] = useState<string>(tracks[0]?.trackId || "");
  const [groupFilter, setGroupFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await trackerGet<{ template: Template }>(token, projectCode, "template", { classId });
      setTpl(r.template);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل المراحل."); }
    finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      onReadyChanged?.();
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ الإعداد."); }
    finally { setBusy(false); }
  }

  async function resetProject() {
    if (readOnly || busy) return;
    // Same gate as the old inline confirm: one explicit "نعم، صفّر المشروع" answer to the same warning.
    if (!(await confirm({ message: RESET_WARNING, title: "تصفير المشروع للصف", confirmLabel: "نعم، صفّر المشروع", tone: "danger" }))) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await trackerPost<{ deletedProgressCount: number }>(token, projectCode, { action: "project.reset", classId });
      setNotice("✓ تم تصفير المشروع لهذا الصف (حُذف تقدّم " + r.deletedProgressCount + " طالبًا). المراحل الآن نسخة جديدة والطلاب كما هم.");
      onReadyChanged?.();
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تصفير المشروع."); }
    finally { setBusy(false); }
  }

  if (loading && !tpl) return <p className="eb-muted" role="status">جارٍ تحميل المراحل...</p>;
  if (!tpl) return <div className="platform-error assignment-inline-message" role="alert">{error || "تعذر التحميل."} <button type="button" className="eb-button is-small" onClick={() => void load()}>إعادة المحاولة</button></div>;

  const visibleGroups = groups.filter(g => !groupFilter || g.groupId === groupFilter);
  const rowsFor = (groupId: string) => ((byGroup.get(groupId) || []) as ProjectStage[]).filter(st => !term || st.title.toLowerCase().includes(term) || st.stageId.toLowerCase().includes(term));
  const anyRows = visibleGroups.some(g => rowsFor(g.groupId).length > 0);

  return (
    <section className="eb-stage-settings" aria-labelledby="eb-stage-settings-title">
      <h2 id="eb-stage-settings-title" className="eb-subheading">إعداد المراحل</h2>
      {readOnly && <p className="platform-warning assignment-inline-message" role="status">الصف مؤرشف — الإعداد للقراءة فقط.</p>}
      {error && <div className="platform-error assignment-inline-message" role="alert">{error}</div>}
      {notice && <div className="platform-notice assignment-inline-message" role="status" aria-live="polite">{notice}</div>}
      <div className="eb-stage-settings-bar" role="region" aria-label="أدوات إعداد المراحل">
        <div className="eb-segmented" role="group" aria-label="المسار">
          {tracks.map(t => <button key={t.trackId} type="button" aria-pressed={track === t.trackId} onClick={() => { setTrack(t.trackId); setGroupFilter(""); }}>{t.title}</button>)}
        </div>
        <label className="eb-field-inline">المجموعة
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
            <option value="">كل المجموعات</option>
            {groups.map(g => <option key={g.groupId} value={g.groupId}>{g.title}</option>)}
          </select>
        </label>
        <label className="eb-field-inline eb-project-search">بحث<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن مرحلة..." /></label>
        {!readOnly && <button type="button" className="eb-button is-primary" disabled={busy} onClick={() => void save()}>حفظ التغييرات</button>}
      </div>

      {!groups.length && <EmptyState compact title="لا توجد مجموعات مراحل في هذا المسار." />}
      {groups.length > 0 && !anyRows && <EmptyState compact title="لا توجد مراحل مطابقة." description="جرّب مجموعة أخرى أو امسح كلمة البحث." />}
      {visibleGroups.map(g => {
        const rows = rowsFor(g.groupId);
        if (term && !rows.length) return null;
        return (
          <section key={g.groupId} className="eb-stage-settings-group" aria-label={g.title}>
            <SectionHeader level={3} title={g.title} count={rows.length} actions={!readOnly && <button type="button" className="eb-button is-small" onClick={() => addStage(g.groupId)}><IconPlus size={16} />إضافة مرحلة</button>} />
            {rows.length ? (
              <ul className="eb-stage-form-list">
                {rows.map(stage => (
                  <li key={stage.stageId} className={"eb-stage-form-row" + (stage.active === false ? " is-inactive" : "")}>
                    <span className="eb-stage-code">{stage.stageId}</span>
                    <label className="eb-stage-form-title"><VisuallyHidden>عنوان المرحلة {stage.stageId}</VisuallyHidden><input value={stage.title} disabled={readOnly} onChange={e => editStage(stage.stageId, { title: e.target.value })} /></label>
                    <label className="eb-stage-form-num">الوزن<input type="number" min={0} step={0.5} value={stage.weight ?? 1} disabled={readOnly} onChange={e => editStage(stage.stageId, { weight: Number(e.target.value) })} /></label>
                    <label className="eb-stage-form-num">الترتيب<input type="number" value={stage.order} disabled={readOnly} onChange={e => editStage(stage.stageId, { order: Number(e.target.value) })} /></label>
                    <label className="eb-stage-form-check"><input type="checkbox" checked={stage.required !== false} disabled={readOnly} onChange={e => editStage(stage.stageId, { required: e.target.checked })} />إلزامية</label>
                    <label className="eb-stage-form-check"><input type="checkbox" checked={stage.active !== false} disabled={readOnly} onChange={e => editStage(stage.stageId, { active: e.target.checked })} />مفعّلة</label>
                  </li>
                ))}
              </ul>
            ) : <EmptyState compact title="لا توجد مراحل في هذه المجموعة بعد." />}
          </section>
        );
      })}

      {!readOnly && (
        <section className="eb-stage-danger-zone" aria-labelledby="eb-stage-danger-title">
          <SectionHeader level={3} id="eb-stage-danger-title" title="تصفير المشروع للصف" description={<>يحذف كل تقدّم الطلاب وملاحظاتهم في هذا المشروع لهذا الصف ويعيد المراحل إلى النسخة الجديدة. <strong>الصف وحسابات الطلاب لا تُحذف.</strong> لا يمكن التراجع.</>} />
          <button type="button" className="eb-button is-danger" disabled={busy} onClick={() => void resetProject()}>{busy ? "جارٍ التصفير…" : "تصفير المشروع…"}</button>
        </section>
      )}
      {confirmDialog}
    </section>
  );
}
