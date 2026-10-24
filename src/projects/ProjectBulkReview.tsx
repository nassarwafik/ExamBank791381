import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trackerGet, trackerPost } from "./api";
import { STAGE_STATUS_TONE, stageStatusLabel, normalizeStageStatus } from "./teacherPresentation";
import { fmtContribution } from "./projectPerformance";
import StatusBadge from "../ui/StatusBadge";
import EmptyState from "../ui/EmptyState";
import { useConfirm } from "../ui/useConfirm";
import { IconCheck } from "../icons";
import { bulkNoticeText, type BulkTotals } from "./bulkReview";
import ProjectScoreGrid from "./ProjectScoreGrid";
import type { ProjectGroup, StageStatus, TrackMeta } from "./types";

type Props = {
  token: string; projectCode: string; classId: string; tracks: TrackMeta[]; readOnly: boolean;
  /** Called after a bulk write that changed at least one status (App re-reads the global ready counts). */
  onReadyChanged?: () => void;
  /** Phase P4 — reports whether «جدول العلامات» holds unsaved scores (the workspace asks before leaving). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Phase P6 — the mode to open on (a dashboard shortcut); otherwise the default below. */
  initialMode?: BulkMode | null;
};

export type BoardStage = { stageId: string; track: string; groupId: string; title: string; order: number; required: boolean };
export type BoardCell = { status: StageStatus; score: number | null; selfReported?: boolean };
/** Phase G1 — `summary`: the server's progress and weighted grade for the student (the same calculators as the cards). */
export type BoardStudent = { studentId: string; displayName: string; code: string; cells: Record<string, BoardCell>; summary?: { overallProgress: number; grade: number } };
/** Phase G3 — `title` / `className` / `schoolYear` (additive) head the exported file. */
export type Board = { readOnly: boolean; stages: BoardStage[]; groups: ProjectGroup[]; students: BoardStudent[]; title?: string; className?: string; schoolYear?: string };
type BulkResult = { studentId: string; stageId: string; ok: boolean; changed?: boolean; error?: string };
type BulkResponse = { readyChanged: boolean; results: BulkResult[]; totals: BulkTotals };
type Mode = "ready" | "self" | "stage" | "grid";
export type BulkMode = Mode;
type GroupBy = "student" | "stage";

const EMPTY_CELL: BoardCell = { status: "not_started", score: null };
const cellOf = (s: BoardStudent, stageId: string): BoardCell => {
  const c = s.cells[stageId];
  if (!c) return EMPTY_CELL;
  const status = normalizeStageStatus(c.status);
  return { status, score: typeof c.score === "number" ? c.score : null, selfReported: status === "approved" && c.selfReported === true };
};
const keyOf = (studentId: string, stageId: string) => studentId + "|" + stageId;
const parseKey = (key: string) => { const i = key.indexOf("|"); return { studentId: key.slice(0, i), stageId: key.slice(i + 1) }; };
const ERROR_TEXT: Record<string, string> = { not_member: "الطالب لم يعد في الصف", stage_inactive: "المرحلة غير مفعّلة", conflict: "تعارض مؤقت", invalid: "قيمة غير صحيحة", failed: "تعذر الحفظ" };

/**
 * Phase P1 — bulk review. The teacher's fastest path through a class: ONE `board` read (every member × every active
 * stage), two ways to select (stages waiting for review across the whole class, or one stage for every student), and ONE
 * `progress.bulk` write per decision («اعتماد المحدد» with an optional common score — approval never needs a score —
 * or «إرجاع إلى قيد التنفيذ»). The server applies each pair through the canonical pipeline and reports per item; failed
 * pairs stay selected for a retry. Only the latest board read for the current (project, class) may populate the view.
 */
export default function ProjectBulkReview({ token, projectCode, classId, tracks, readOnly, onReadyChanged, onDirtyChange, initialMode = null }: Props) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [chosenMode, setChosenMode] = useState<Mode | null>(initialMode);
  // Phase P6 — the waiting lists («بانتظار الاعتماد», «حدّدها الطلاب») are grouped (by student by default, or by stage),
  // can be narrowed to one track, and each group carries its own one-tap decision.
  const [groupBy, setGroupBy] = useState<GroupBy>("student");
  const [listTrack, setListTrack] = useState<string>("all");
  const [track, setTrack] = useState<string>(tracks[0]?.trackId || "");
  const [stageId, setStageId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [score, setScore] = useState("");
  const [busy, setBusy] = useState(false);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const seq = useRef(0);
  const { confirm, confirmDialog } = useConfirm();
  // Phase P4 — unsaved scores in «جدول العلامات»: leaving the grid for another mode asks first.
  const [gridDirty, setGridDirty] = useState(false);
  const onGridDirty = useCallback((d: boolean) => { setGridDirty(d); onDirtyChange?.(d); }, [onDirtyChange]);

  async function load(keepNotice = false) {
    const mine = ++seq.current;
    setLoading(true); setError(""); if (!keepNotice) setNotice("");
    try {
      const r = await trackerGet<Board>(token, projectCode, "board", { classId });
      if (mine !== seq.current) return;                                         // a newer read (another class) superseded this one
      setBoard(r);
    } catch (e) { if (mine === seq.current) setError(e instanceof Error ? e.message : "تعذر تحميل بيانات الصف."); }
    finally { if (mine === seq.current) setLoading(false); }
  }
  // A new (project, class) starts clean: no board from the previous class, no selection, no stage, no errors.
  useEffect(() => {
    setBoard(null); setChosenMode(initialMode); setStageId(""); setSelected(new Set()); setItemErrors({}); setScore(""); setListTrack("all");
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, projectCode]);

  const stages = useMemo(() => board ? board.stages.slice().sort((a, b) => a.order - b.order) : [], [board]);
  const readyPairs = useMemo(() => {
    if (!board) return [];
    const out: { student: BoardStudent; stage: BoardStage }[] = [];
    for (const student of board.students) for (const stage of stages) if (cellOf(student, stage.stageId).status === "ready_for_review") out.push({ student, stage });
    return out;
  }, [board, stages]);
  // Phase P2 — stages the STUDENTS marked as done (already counted) that the teacher has not confirmed yet.
  const selfPairs = useMemo(() => {
    if (!board) return [];
    const out: { student: BoardStudent; stage: BoardStage }[] = [];
    for (const student of board.students) for (const stage of stages) if (cellOf(student, stage.stageId).selfReported) out.push({ student, stage });
    return out;
  }, [board, stages]);
  const readyByStage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of readyPairs) m[p.stage.stageId] = (m[p.stage.stageId] || 0) + 1;
    return m;
  }, [readyPairs]);
  const trackStages = useMemo(() => stages.filter(s => s.track === track), [stages, track]);
  const groupTitle = useMemo(() => new Map((board?.groups || []).map(g => [g.groupId, g.title])), [board]);

  // Until the teacher picks a mode: the ready list when something waits, then the students' own marks, else «حسب المرحلة».
  const mode: Mode = chosenMode ?? (readyPairs.length ? "ready" : selfPairs.length ? "self" : "stage");
  const modePairs = mode === "ready" ? readyPairs : mode === "self" ? selfPairs : [];
  const pairs = listTrack === "all" ? modePairs : modePairs.filter(p => p.stage.track === listTrack);
  // Groups of the visible waiting list, in board order: students by name as the server sorts them; stages track by track
  // (the project's track order), then by their order inside the track.
  const groups = useMemo(() => {
    const out: { key: string; title: string; code?: string; pairs: typeof pairs }[] = [];
    const at = new Map<string, number>();
    for (const p of pairs) {
      const key = groupBy === "student" ? p.student.studentId : p.stage.stageId;
      if (!at.has(key)) { at.set(key, out.length); out.push({ key, title: groupBy === "student" ? p.student.displayName : p.stage.stageId + " — " + p.stage.title, code: groupBy === "student" ? p.student.code : undefined, pairs: [] }); }
      out[at.get(key)!].pairs.push(p);
    }
    if (groupBy === "stage") {
      const rank = (g: { pairs: typeof pairs }) => { const st = g.pairs[0].stage, t = tracks.findIndex(x => x.trackId === st.track); return (t < 0 ? tracks.length : t) * 100000 + st.order; };
      out.sort((a, b) => rank(a) - rank(b));
    }
    return out;
  }, [pairs, groupBy, tracks]);
  useEffect(() => {
    if (!board || (stageId && trackStages.some(s => s.stageId === stageId))) return;
    const first = trackStages.find(s => readyByStage[s.stageId]) || trackStages[0];
    setStageId(first ? first.stageId : "");
  }, [board, trackStages, stageId, readyByStage]);

  const locked = readOnly || !!board?.readOnly;
  const stage = stages.find(s => s.stageId === stageId) || null;
  const visibleKeys = mode === "ready" || mode === "self"
    ? pairs.map(p => keyOf(p.student.studentId, p.stage.stageId))
    : stage && board ? board.students.map(s => keyOf(s.studentId, stage.stageId)) : [];
  const selectedVisible = visibleKeys.filter(k => selected.has(k));
  const allVisibleSelected = visibleKeys.length > 0 && selectedVisible.length === visibleKeys.length;

  function toggle(key: string) {
    setSelected(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }
  function selectOnly(keys: string[]) { setSelected(new Set(keys)); }
  function changeMode(next: Mode) {
    const go = () => { setChosenMode(next); setSelected(new Set()); setItemErrors({}); };
    if (mode !== "grid" || next === "grid" || !gridDirty) { go(); return; }
    void confirm({ title: "علامات غير محفوظة", message: "في «جدول العلامات» علامات لم تُحفظ بعد. هل تريد تجاهلها؟", confirmLabel: "تجاهل العلامات", cancelLabel: "متابعة الإدخال", tone: "danger" })
      .then(ok => { if (ok) go(); });
  }
  function changeTrack(next: string) { setTrack(next); setStageId(""); setSelected(new Set()); setItemErrors({}); }
  function changeStage(next: string) { setStageId(next); setSelected(new Set()); setItemErrors({}); }

  const scoreText = score.trim();
  const scoreValue = scoreText === "" ? undefined : Number(scoreText);
  const scoreInvalid = scoreValue !== undefined && (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100);

  async function apply(status: StageStatus, verb: string, keys: string[] = selectedVisible) {
    if (locked || busy || !keys.length || (status === "approved" && scoreInvalid)) return;
    if (status !== "approved") {
      const ok = await confirm({ title: "إرجاع المراحل إلى قيد التنفيذ", message: "سيُلغى اعتماد المراحل المحددة المعتمدة وتُحتسب من جديد عند اعتمادها. العلامات المحفوظة لا تُحذف.", confirmLabel: "إرجاع " + keys.length });
      if (!ok) return;
    }
    const items = keys.map(parseKey);
    setChosenMode(mode);                                                       // stay on this view even when it empties
    setBusy(true); setError(""); setNotice(""); setItemErrors({});
    try {
      const body: Record<string, unknown> = { action: "progress.bulk", classId, items, status };
      if (status === "approved" && scoreValue !== undefined) body.score = scoreValue;
      const r = await trackerPost<BulkResponse>(token, projectCode, body);
      const failed: Record<string, string> = {};
      for (const x of r.results) if (!x.ok) failed[keyOf(x.studentId, x.stageId)] = ERROR_TEXT[x.error || "failed"] || ERROR_TEXT.failed;
      setItemErrors(failed);
      setSelected(new Set(Object.keys(failed)));                               // failed pairs stay selected for a retry
      setNotice(bulkNoticeText(verb, r.totals));
      if (r.readyChanged) onReadyChanged?.();
      await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ التغييرات."); }
    finally { setBusy(false); }
  }
  // Phase P6 — every waiting stage in view (the track filter applies) in ONE request, after a confirmation.
  async function applyAll() {
    const keys = pairs.map(p => keyOf(p.student.studentId, p.stage.stageId));
    if (!keys.length) return;
    const self = mode === "self";
    const ok = await confirm({
      title: self ? "تأكيد كل ما حدّده الطلاب" : "اعتماد كل المراحل الجاهزة",
      message: (self ? "سيُؤكَّد " : "سيُعتمد ") + keys.length + " مرحلة لـ " + new Set(pairs.map(p => p.student.studentId)).size + " طالب باسمك" + (scoreValue !== undefined ? "، مع العلامة الموحّدة " + scoreValue : "") + ". يمكنك إرجاع أي مرحلة لاحقًا.",
      confirmLabel: (self ? "تأكيد " : "اعتماد ") + keys.length
    });
    if (ok) await apply("approved", self ? "تم تأكيد" : "تم اعتماد", keys);
  }

  if (!board) {
    return (
      <section className="eb-bulk-review" aria-labelledby="eb-bulk-review-title">
        <h2 id="eb-bulk-review-title" className="eb-subheading">التقييم الجماعي</h2>
        {loading && <p className="eb-muted" role="status">جارٍ تحميل بيانات الصف...</p>}
        {!loading && error && <div className="platform-error assignment-inline-message" role="alert">{error} <button type="button" className="eb-button is-small" onClick={() => void load()}>إعادة المحاولة</button></div>}
      </section>
    );
  }

  const checkbox = (key: string, label: string) => (
    <input type="checkbox" checked={selected.has(key)} disabled={locked || busy} onChange={() => toggle(key)} aria-label={label} />
  );
  const cellBadge = (cell: BoardCell) => (
    <span className="eb-bulk-cell">
      <StatusBadge tone={STAGE_STATUS_TONE[cell.status]}>{stageStatusLabel(cell.status)}</StatusBadge>
      {cell.selfReported && <StatusBadge tone="warn">حدّدها الطالب</StatusBadge>}
      {cell.score !== null && <span className="eb-muted" dir="ltr">{fmtContribution(cell.score)} / 100</span>}
    </span>
  );

  return (
    <section className="eb-bulk-review" aria-labelledby="eb-bulk-review-title">
      <h2 id="eb-bulk-review-title" className="eb-subheading">التقييم الجماعي</h2>
      <p className="eb-muted">حدّد الطلاب والمراحل ثم اعتمدها دفعة واحدة. الاعتماد لا يحتاج علامة، ويمكن إضافة علامة موحّدة اختياريًا.</p>
      {locked && <p className="platform-warning assignment-inline-message" role="status">الصف مؤرشف — للقراءة فقط.</p>}
      {error && <div className="platform-error assignment-inline-message" role="alert">{error}</div>}
      {notice && <div className="platform-notice assignment-inline-message" role="status" aria-live="polite">{notice}</div>}

      <div className="eb-segmented eb-bulk-modes" role="group" aria-label="طريقة العرض">
        <button type="button" aria-pressed={mode === "ready"} onClick={() => changeMode("ready")}>بانتظار الاعتماد ({readyPairs.length})</button>
        <button type="button" aria-pressed={mode === "self"} onClick={() => changeMode("self")}>حدّدها الطلاب ({selfPairs.length})</button>
        <button type="button" aria-pressed={mode === "stage"} onClick={() => changeMode("stage")}>حسب المرحلة</button>
        <button type="button" aria-pressed={mode === "grid"} onClick={() => changeMode("grid")}>جدول العلامات</button>
      </div>

      {mode === "grid" && (
        <ProjectScoreGrid token={token} projectCode={projectCode} classId={classId} tracks={tracks} board={board} locked={locked}
          onSaved={() => load(true)} onDirtyChange={onGridDirty} onStatusChanged={onReadyChanged} />
      )}

      {mode === "stage" && (
        <div className="eb-bulk-stage-picker">
          <div className="eb-segmented" role="group" aria-label="المسار">
            {tracks.map(t => <button key={t.trackId} type="button" aria-pressed={track === t.trackId} onClick={() => changeTrack(t.trackId)}>{t.title}</button>)}
          </div>
          <label className="eb-field-inline">المرحلة
            <select value={stageId} onChange={e => changeStage(e.target.value)} disabled={!trackStages.length}>
              {trackStages.map(s => (
                <option key={s.stageId} value={s.stageId}>{s.stageId} — {s.title}{groupTitle.get(s.groupId) ? " · " + groupTitle.get(s.groupId) : ""}{readyByStage[s.stageId] ? " (" + readyByStage[s.stageId] + " بانتظار الاعتماد)" : ""}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {mode !== "grid" && !locked && visibleKeys.length > 0 && (
        <div className="eb-bulk-bar eb-bulk-review-bar" role="region" aria-label="إجراءات التقييم الجماعي">
          <span className="eb-bulk-summary" role="status">{selectedVisible.length} محدد من {visibleKeys.length}</span>
          <div className="eb-bulk-groups">
            <div className="eb-bulk-group">
              <button type="button" className="eb-button is-small" disabled={busy} onClick={() => selectOnly(allVisibleSelected ? [] : visibleKeys)}>{allVisibleSelected ? "إلغاء التحديد" : "تحديد الكل"}</button>
              {(mode === "ready" || mode === "self") && (
                <button type="button" className="eb-button is-small is-primary" disabled={busy || scoreInvalid} onClick={() => void applyAll()}>
                  <IconCheck size={16} />{(mode === "self" ? "تأكيد الكل" : "اعتماد الكل") + " (" + visibleKeys.length + ")"}
                </button>
              )}
              {mode === "stage" && stage && board && (
                <>
                  <button type="button" className="eb-button is-small" disabled={busy} onClick={() => selectOnly(board.students.filter(s => cellOf(s, stage.stageId).status === "ready_for_review").map(s => keyOf(s.studentId, stage.stageId)))}>تحديد الجاهزين</button>
                  <button type="button" className="eb-button is-small" disabled={busy} onClick={() => selectOnly(board.students.filter(s => cellOf(s, stage.stageId).status !== "approved").map(s => keyOf(s.studentId, stage.stageId)))}>تحديد غير المعتمدين</button>
                  <button type="button" className="eb-button is-small" disabled={busy} onClick={() => selectOnly(board.students.filter(s => cellOf(s, stage.stageId).selfReported).map(s => keyOf(s.studentId, stage.stageId)))}>تحديد ما حدّده الطلاب</button>
                </>
              )}
            </div>
            <div className="eb-bulk-group">
              <label className="eb-field-inline eb-bulk-score">علامة موحّدة (اختياري)
                <input type="number" inputMode="decimal" min={0} max={100} step={0.5} dir="ltr" value={score} onChange={e => setScore(e.target.value)} placeholder="—" aria-invalid={scoreInvalid || undefined} disabled={busy} />
              </label>
              <button type="button" className="eb-button is-primary is-small" disabled={busy || !selectedVisible.length || scoreInvalid} onClick={() => void apply("approved", mode === "self" ? "تم تأكيد" : "تم اعتماد")}>
                <IconCheck size={16} />{busy ? "جارٍ الحفظ…" : mode === "self" ? "تأكيد المحدد" : "اعتماد المحدد"}
              </button>
              <button type="button" className="eb-button is-small" disabled={busy || !selectedVisible.length} onClick={() => void apply("in_progress", "أُرجعت إلى قيد التنفيذ")}>إرجاع إلى قيد التنفيذ</button>
            </div>
          </div>
          {scoreInvalid && <p className="eb-stage-row-error" role="alert">العلامة يجب أن تكون رقمًا بين 0 و 100.</p>}
        </div>
      )}

      {mode === "self" && <p className="eb-muted">مراحل حدّدها الطلاب كمنفّذة وتُحتسب في تقدّمهم الآن. «تأكيد المحدد» يعتمدها باسمك، و«إرجاع إلى قيد التنفيذ» يلغي تحديد الطالب.</p>}
      {(mode === "ready" || mode === "self") && modePairs.length > 0 && (
        <div className="eb-review-list-controls">
          <div className="eb-segmented" role="group" aria-label="تجميع القائمة">
            <button type="button" aria-pressed={groupBy === "student"} onClick={() => setGroupBy("student")}>بالطلاب</button>
            <button type="button" aria-pressed={groupBy === "stage"} onClick={() => setGroupBy("stage")}>بالمراحل</button>
          </div>
          {tracks.length > 1 && (
            <div className="eb-chip-group" role="group" aria-label="مسار القائمة">
              {[{ trackId: "all", title: "كل المسارات" }, ...tracks].map(t => {
                const n = t.trackId === "all" ? modePairs.length : modePairs.filter(p => p.stage.track === t.trackId).length;
                return <button key={t.trackId} type="button" className="eb-chip-button" aria-pressed={listTrack === t.trackId} onClick={() => { setListTrack(t.trackId); setSelected(new Set()); setItemErrors({}); }}>{t.title} ({n})</button>;
              })}
            </div>
          )}
        </div>
      )}
      {(mode === "ready" || mode === "self") && (
        pairs.length ? (
          <ul className="eb-review-groups" aria-label={mode === "ready" ? "مراحل بانتظار الاعتماد" : "مراحل حدّدها الطلاب"}>
            {groups.map(g => {
              const keys = g.pairs.map(p => keyOf(p.student.studentId, p.stage.stageId));
              const verb = mode === "self" ? "تأكيد" : "اعتماد";
              const action = groupBy === "student" ? verb + " مراحل " + g.title : verb + " " + g.pairs[0].stage.stageId + " للجميع";
              return (
                <li key={g.key} className="eb-review-group">
                  <div className="eb-review-group-head">
                    <h3 className="eb-review-group-title">{g.title}{g.code ? <span className="eb-muted"> {g.code}</span> : null} <span className="eb-review-group-count">({g.pairs.length})</span></h3>
                    {!locked && (
                      <button type="button" className="eb-button is-small" disabled={busy || scoreInvalid} onClick={() => void apply("approved", mode === "self" ? "تم تأكيد" : "تم اعتماد", keys)}>
                        <IconCheck size={16} />{action + " (" + keys.length + ")"}
                      </button>
                    )}
                  </div>
                  <ul className="eb-bulk-list" aria-label={g.title}>
                    {g.pairs.map(({ student, stage: st }) => {
                      const key = keyOf(student.studentId, st.stageId);
                      return (
                        <li key={key} className={"eb-bulk-row" + (selected.has(key) ? " is-selected" : "")}>
                          <label className="eb-bulk-row-main">
                            {!locked && checkbox(key, student.displayName + " — " + st.stageId)}
                            {groupBy === "stage" ? <strong>{student.displayName}</strong> : <span className="eb-stage-code">{st.stageId}</span>}
                            {groupBy === "student" && <span>{st.title}</span>}
                            {groupBy === "student" && <span className="eb-muted">{tracks.find(t => t.trackId === st.track)?.title || st.track}</span>}
                          </label>
                          {cellBadge(cellOf(student, st.stageId))}
                          {itemErrors[key] && <small className="eb-stage-row-error" role="alert">{itemErrors[key]}</small>}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        ) : modePairs.length
          ? <EmptyState compact title="لا شيء في هذا المسار." description="اختر «كل المسارات» لرؤية القائمة كاملة." />
          : mode === "ready"
          ? <EmptyState compact title="لا توجد مراحل بانتظار الاعتماد." description="اختر «حسب المرحلة» لاعتماد مرحلة لعدة طلاب دفعة واحدة." />
          : <EmptyState compact title="لا توجد مراحل حدّدها الطلاب بانتظار تأكيدك." />
      )}

      {mode === "stage" && (
        stage && board.students.length ? (
          <ul className="eb-bulk-list" aria-label={"طلاب المرحلة " + stage.stageId}>
            {board.students.map(student => {
              const key = keyOf(student.studentId, stage.stageId);
              return (
                <li key={key} className={"eb-bulk-row" + (selected.has(key) ? " is-selected" : "")}>
                  <label className="eb-bulk-row-main">
                    {!locked && checkbox(key, student.displayName)}
                    <strong>{student.displayName}</strong>
                    {student.code ? <span className="eb-muted">{student.code}</span> : null}
                  </label>
                  {cellBadge(cellOf(student, stage.stageId))}
                  {itemErrors[key] && <small className="eb-stage-row-error" role="alert">{itemErrors[key]}</small>}
                </li>
              );
            })}
          </ul>
        ) : <EmptyState compact title={board.students.length ? "لا توجد مراحل في هذا المسار." : "لا يوجد طلاب في هذا الصف بعد."} />
      )}
      {confirmDialog}
    </section>
  );
}
