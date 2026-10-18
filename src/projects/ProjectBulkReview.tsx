import { useEffect, useMemo, useRef, useState } from "react";
import { trackerGet, trackerPost } from "./api";
import { STAGE_STATUS_TONE, stageStatusLabel, normalizeStageStatus } from "./teacherPresentation";
import { fmtContribution } from "./projectPerformance";
import StatusBadge from "../ui/StatusBadge";
import EmptyState from "../ui/EmptyState";
import { useConfirm } from "../ui/useConfirm";
import { IconCheck } from "../icons";
import { bulkNoticeText, type BulkTotals } from "./bulkReview";
import type { ProjectGroup, StageStatus, TrackMeta } from "./types";

type Props = {
  token: string; projectCode: string; classId: string; tracks: TrackMeta[]; readOnly: boolean;
  /** Called after a bulk write that changed at least one status (App re-reads the global ready counts). */
  onReadyChanged?: () => void;
};

export type BoardStage = { stageId: string; track: string; groupId: string; title: string; order: number; required: boolean };
export type BoardCell = { status: StageStatus; score: number | null };
export type BoardStudent = { studentId: string; displayName: string; code: string; cells: Record<string, BoardCell> };
export type Board = { readOnly: boolean; stages: BoardStage[]; groups: ProjectGroup[]; students: BoardStudent[] };
type BulkResult = { studentId: string; stageId: string; ok: boolean; changed?: boolean; error?: string };
type BulkResponse = { readyChanged: boolean; results: BulkResult[]; totals: BulkTotals };
type Mode = "ready" | "stage";

const EMPTY_CELL: BoardCell = { status: "not_started", score: null };
const cellOf = (s: BoardStudent, stageId: string): BoardCell => {
  const c = s.cells[stageId];
  return c ? { status: normalizeStageStatus(c.status), score: typeof c.score === "number" ? c.score : null } : EMPTY_CELL;
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
export default function ProjectBulkReview({ token, projectCode, classId, tracks, readOnly, onReadyChanged }: Props) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [chosenMode, setChosenMode] = useState<Mode | null>(null);
  const [track, setTrack] = useState<string>(tracks[0]?.trackId || "");
  const [stageId, setStageId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [score, setScore] = useState("");
  const [busy, setBusy] = useState(false);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const seq = useRef(0);
  const { confirm, confirmDialog } = useConfirm();

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
    setBoard(null); setChosenMode(null); setStageId(""); setSelected(new Set()); setItemErrors({}); setScore("");
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
  const readyByStage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of readyPairs) m[p.stage.stageId] = (m[p.stage.stageId] || 0) + 1;
    return m;
  }, [readyPairs]);
  const trackStages = useMemo(() => stages.filter(s => s.track === track), [stages, track]);
  const groupTitle = useMemo(() => new Map((board?.groups || []).map(g => [g.groupId, g.title])), [board]);

  // Until the teacher picks a mode: the ready list when something waits, else «حسب المرحلة» on the first stage with work.
  const mode: Mode = chosenMode ?? (readyPairs.length ? "ready" : "stage");
  useEffect(() => {
    if (!board || (stageId && trackStages.some(s => s.stageId === stageId))) return;
    const first = trackStages.find(s => readyByStage[s.stageId]) || trackStages[0];
    setStageId(first ? first.stageId : "");
  }, [board, trackStages, stageId, readyByStage]);

  const locked = readOnly || !!board?.readOnly;
  const stage = stages.find(s => s.stageId === stageId) || null;
  const visibleKeys = mode === "ready"
    ? readyPairs.map(p => keyOf(p.student.studentId, p.stage.stageId))
    : stage && board ? board.students.map(s => keyOf(s.studentId, stage.stageId)) : [];
  const selectedVisible = visibleKeys.filter(k => selected.has(k));
  const allVisibleSelected = visibleKeys.length > 0 && selectedVisible.length === visibleKeys.length;

  function toggle(key: string) {
    setSelected(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }
  function selectOnly(keys: string[]) { setSelected(new Set(keys)); }
  function changeMode(next: Mode) { setChosenMode(next); setSelected(new Set()); setItemErrors({}); }
  function changeTrack(next: string) { setTrack(next); setStageId(""); setSelected(new Set()); setItemErrors({}); }
  function changeStage(next: string) { setStageId(next); setSelected(new Set()); setItemErrors({}); }

  const scoreText = score.trim();
  const scoreValue = scoreText === "" ? undefined : Number(scoreText);
  const scoreInvalid = scoreValue !== undefined && (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100);

  async function apply(status: StageStatus, verb: string) {
    if (locked || busy || !selectedVisible.length || (status === "approved" && scoreInvalid)) return;
    if (status !== "approved") {
      const ok = await confirm({ title: "إرجاع المراحل إلى قيد التنفيذ", message: "سيُلغى اعتماد المراحل المحددة المعتمدة وتُحتسب من جديد عند اعتمادها. العلامات المحفوظة لا تُحذف.", confirmLabel: "إرجاع " + selectedVisible.length });
      if (!ok) return;
    }
    const items = selectedVisible.map(parseKey);
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
        <button type="button" aria-pressed={mode === "stage"} onClick={() => changeMode("stage")}>حسب المرحلة</button>
      </div>

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

      {!locked && visibleKeys.length > 0 && (
        <div className="eb-bulk-bar eb-bulk-review-bar" role="region" aria-label="إجراءات التقييم الجماعي">
          <span className="eb-bulk-summary" role="status">{selectedVisible.length} محدد من {visibleKeys.length}</span>
          <div className="eb-bulk-groups">
            <div className="eb-bulk-group">
              <button type="button" className="eb-button is-small" disabled={busy} onClick={() => selectOnly(allVisibleSelected ? [] : visibleKeys)}>{allVisibleSelected ? "إلغاء التحديد" : "تحديد الكل"}</button>
              {mode === "stage" && stage && board && (
                <>
                  <button type="button" className="eb-button is-small" disabled={busy} onClick={() => selectOnly(board.students.filter(s => cellOf(s, stage.stageId).status === "ready_for_review").map(s => keyOf(s.studentId, stage.stageId)))}>تحديد الجاهزين</button>
                  <button type="button" className="eb-button is-small" disabled={busy} onClick={() => selectOnly(board.students.filter(s => cellOf(s, stage.stageId).status !== "approved").map(s => keyOf(s.studentId, stage.stageId)))}>تحديد غير المعتمدين</button>
                </>
              )}
            </div>
            <div className="eb-bulk-group">
              <label className="eb-field-inline eb-bulk-score">علامة موحّدة (اختياري)
                <input type="number" inputMode="decimal" min={0} max={100} step={0.5} dir="ltr" value={score} onChange={e => setScore(e.target.value)} placeholder="—" aria-invalid={scoreInvalid || undefined} disabled={busy} />
              </label>
              <button type="button" className="eb-button is-primary is-small" disabled={busy || !selectedVisible.length || scoreInvalid} onClick={() => void apply("approved", "تم اعتماد")}>
                <IconCheck size={16} />{busy ? "جارٍ الحفظ…" : "اعتماد المحدد"}
              </button>
              <button type="button" className="eb-button is-small" disabled={busy || !selectedVisible.length} onClick={() => void apply("in_progress", "أُرجعت إلى قيد التنفيذ")}>إرجاع إلى قيد التنفيذ</button>
            </div>
          </div>
          {scoreInvalid && <p className="eb-stage-row-error" role="alert">العلامة يجب أن تكون رقمًا بين 0 و 100.</p>}
        </div>
      )}

      {mode === "ready" && (
        readyPairs.length ? (
          <ul className="eb-bulk-list" aria-label="مراحل بانتظار الاعتماد">
            {readyPairs.map(({ student, stage: st }) => {
              const key = keyOf(student.studentId, st.stageId);
              return (
                <li key={key} className={"eb-bulk-row" + (selected.has(key) ? " is-selected" : "")}>
                  <label className="eb-bulk-row-main">
                    {!locked && checkbox(key, student.displayName + " — " + st.stageId)}
                    <strong>{student.displayName}</strong>
                    <span className="eb-stage-code">{st.stageId}</span>
                    <span>{st.title}</span>
                    <span className="eb-muted">{tracks.find(t => t.trackId === st.track)?.title || st.track}</span>
                  </label>
                  {cellBadge(cellOf(student, st.stageId))}
                  {itemErrors[key] && <small className="eb-stage-row-error" role="alert">{itemErrors[key]}</small>}
                </li>
              );
            })}
          </ul>
        ) : <EmptyState compact title="لا توجد مراحل بانتظار الاعتماد." description="اختر «حسب المرحلة» لاعتماد مرحلة لعدة طلاب دفعة واحدة." />
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
