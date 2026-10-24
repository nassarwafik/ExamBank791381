import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { trackerPost } from "./api";
import { normalizeStageStatus, stageStatusLabel } from "./teacherPresentation";
import { fmtContribution } from "./projectPerformance";
import EmptyState from "../ui/EmptyState";
import ActionMenu from "../ui/ActionMenu";
import Dialog from "../ui/Dialog";
import { useConfirm } from "../ui/useConfirm";
import { IconCheck } from "../icons";
import { SAVE_LABELS } from "../teacher/saveLabels";
import type { Board, BoardStage, BoardStudent } from "./ProjectBulkReview";
import type { StageStatus, TrackMeta } from "./types";
import { gridRowMatches, gridStatusChanges, parseGridScore, scoreGridChanges, type GridChange, type GridFilter } from "./scoreGrid";
import { readApproveOnSave, writeApproveOnSave } from "./approveOnSave";
import { projectScoresRows, SCORE_EXPORT_HEADER_ROW } from "./scoreExport";
import { downloadXlsx } from "../reports/xlsx";
import { exportFilename } from "../teacher/teacherExports";

type Props = {
  token: string; projectCode: string; classId: string; tracks: TrackMeta[];
  board: Board; locked: boolean;
  /** Re-reads the board after a save (the parent owns the board). */
  onSaved: () => Promise<void>;
  /** Reports whether the grid holds unsaved scores (the bulk view / workspace ask before leaving). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Phase G1 — called after a save that changed at least one status (App re-reads the global ready counts). */
  onStatusChanged?: () => void;
};

type ScoreBulkResult = { studentId: string; stageId: string; ok: boolean; changed?: boolean; error?: string; score?: number | null };
type ScoreBulkResponse = { results: ScoreBulkResult[]; totals: { requested: number; changed: number; unchanged: number; failed: number } };
type StatusBulkResponse = { readyChanged?: boolean; results: { studentId: string; stageId: string; ok: boolean; changed?: boolean; error?: string }[] };

const keyOf = (studentId: string, stageId: string) => studentId + "|" + stageId;
const CHUNK = 300;                                                              // the server's score.bulk / progress.bulk limit
const STATUS_CLASS: Record<StageStatus, string> = { not_started: "is-not-started", in_progress: "is-in-progress", ready_for_review: "is-ready", approved: "is-approved" };
const FILTERS: { id: GridFilter; label: string }[] = [{ id: "all", label: "الكل" }, { id: "waiting", label: "بانتظار الاعتماد" }, { id: "unscored", label: "بلا علامة" }];
const errorText = (r: { error?: string; score?: number | null }) =>
  r.error === "stale" ? "تغيّرت العلامة على الخادم إلى " + (typeof r.score === "number" ? fmtContribution(r.score) : "—") + ". راجعها ثم احفظ من جديد."
    : r.error === "not_member" ? "الطالب لم يعد في الصف."
      : r.error === "stage_inactive" ? "المرحلة غير مفعّلة."
        : r.error === "conflict" ? "تعارض مؤقت، أعد الحفظ."
          : r.error === "invalid" ? "قيمة غير صحيحة." : "تعذر الحفظ.";
const dropKeys = <T,>(map: Record<string, T>, keys: Iterable<string>): Record<string, T> => {
  const next = { ...map }; let changed = false;
  for (const k of keys) if (k in next) { delete next[k]; changed = true; }
  return changed ? next : map;
};

/**
 * Phase P4 — «جدول العلامات»: the class's students (rows) × stages (columns), each cell a score input; the teacher types like
 * in a spreadsheet and saves every changed cell in one decision.
 *   • Keyboard: Enter / ↓ next student, Shift+Enter / ↑ previous, ← / → the neighbouring stage (RTL: ← is the next
 *     column), Escape restores the cell's saved value. Focus selects the cell's text so typing replaces it.
 *   • Paste: a block copied from a spreadsheet (tab / new-line separated) fills the grid from the focused cell (rows =
 *     students as shown, columns = stages as shown); values beyond the grid are reported, never wrapped.
 *   • Values: 0–100, decimals allowed, Arabic-Indic digits and «٫» accepted; an empty cell clears a saved score. Invalid
 *     cells are marked and block the save.
 *   • Each score carries the score the grid showed (`expected`): a cell another write changed meanwhile is refused as stale
 *     and keeps the teacher's value with the server's current one in its message. Saved cells drop their draft.
 *
 * Phase G1 — the class matrix (owner decisions of 2026-10-23: one track at a time with all its groups, one save bar, the same
 * approve-on-save switch as the student profile):
 *   • The whole track by default («كل المجموعات», the groups as bands over their columns); one group can still be chosen.
 *   • Every cell is a score AND a «منجز» decision: its toggle (or Space in the cell) marks the stage done or reopens it. With
 *     «اعتماد المرحلة عند حفظ العلامة» on, a cell that gets a score is approved too (never a cleared one); off, a score
 *     never changes a status. Status writes go through `progress.bulk`, after the scores, and never for a cell whose score
 *     failed.
 *   • Each column's menu marks the stage done for the students shown, fills their empty scores with one value, or clears
 *     their scores — as unsaved changes the teacher reviews before «حفظ العلامات».
 *   • Filters: everyone, students with a stage waiting for the teacher, students with a stage without a score.
 *   • The end of every row shows the server's progress and weighted grade (re-read after each save); the matrix never
 *     computes a grade.
 * Drafts survive the board re-read after a save; switching track / group with unsaved changes asks first.
 */
export default function ProjectScoreGrid({ token, projectCode, classId, tracks, board, locked, onSaved, onDirtyChange, onStatusChanged }: Props) {
  const [track, setTrack] = useState<string>(tracks[0]?.trackId || "");
  const [groupId, setGroupId] = useState("");                                  // "" = every group of the track
  const [filter, setFilter] = useState<GridFilter>("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [doneDrafts, setDoneDrafts] = useState<Record<string, boolean>>({});
  const [approveOnSave, setApproveOnSave] = useState<boolean>(() => readApproveOnSave());
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [fillFor, setFillFor] = useState<BoardStage | null>(null);
  const [fillValue, setFillValue] = useState("");
  const tableRef = useRef<HTMLTableElement | null>(null);
  const fillInputRef = useRef<HTMLInputElement | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const stages = useMemo(() => board.stages.slice().sort((a, b) => a.order - b.order), [board]);
  const groups = useMemo(() => (board.groups || []).filter(g => g.track === track && stages.some(s => s.groupId === g.groupId)).sort((a, b) => a.order - b.order), [board, track, stages]);
  // The chosen group while it exists in this track, otherwise the whole track (derived, never stored).
  const activeGroup = groups.some(g => g.groupId === groupId) ? groupId : "";
  const columns: BoardStage[] = useMemo(() => {
    const groupOrder = new Map(groups.map((g, i) => [g.groupId, i]));
    return stages.filter(s => s.track === track && (activeGroup ? s.groupId === activeGroup : groupOrder.has(s.groupId)))
      .sort((a, b) => (groupOrder.get(a.groupId)! - groupOrder.get(b.groupId)!) || a.order - b.order);
  }, [stages, groups, track, activeGroup]);
  const bands = useMemo(() => {
    if (activeGroup || groups.length < 2) return [];
    return groups.map(g => ({ groupId: g.groupId, title: g.title, span: columns.filter(c => c.groupId === g.groupId).length })).filter(b => b.span > 0);
  }, [groups, columns, activeGroup]);
  const columnIds = useMemo(() => columns.map(c => c.stageId), [columns]);
  const students: BoardStudent[] = useMemo(() => board.students.filter(s => gridRowMatches(filter, s, columnIds)), [board, filter, columnIds]);

  const savedOf = (student: BoardStudent, stageId: string): number | null => {
    const c = student.cells[stageId];
    return c && typeof c.score === "number" ? c.score : null;
  };
  const approvedOf = (student: BoardStudent, stageId: string) => normalizeStageStatus(student.cells[stageId]?.status) === "approved";
  const changes: GridChange[] = useMemo(() => scoreGridChanges(drafts, board), [drafts, board]);
  const statusChanges = useMemo(() => gridStatusChanges(doneDrafts, changes, board, approveOnSave), [doneDrafts, changes, board, approveOnSave]);
  const invalid = changes.filter(c => c.invalid).length;
  const pending = changes.filter(c => !c.invalid);
  const changedKeys = useMemo(() => new Set([...pending.map(c => c.key), ...statusChanges.map(c => c.key)]), [pending, statusChanges]);
  const pendingCount = changedKeys.size;
  const dirty = changes.length > 0 || statusChanges.some(c => !c.implied);
  /** Phase G3 — «تصدير إلى Excel»: the SAVED scores of the whole class, every track (the server's board; never a draft). */
  function exportScores() {
    const rows = projectScoresRows(board, tracks, { title: board.title, className: board.className, schoolYear: board.schoolYear, exportedAt: new Date() });
    downloadXlsx(exportFilename("TadrisPlus-علامات-المشروع", [board.title, board.className].filter(Boolean).join(" ")).replace(/\.csv$/, ""), rows, { sheetName: "علامات المشروع", rtl: true, boldRows: [SCORE_EXPORT_HEADER_ROW] });
    setNotice("صُدّرت علامات " + board.students.length + " طالب في كل المسارات إلى ملف Excel." + (pendingCount ? " الملف يحمل العلامات المحفوظة فقط؛ لديك " + pendingCount + " تغيير لم يُحفظ بعد." : ""));
  }
  const failedList = useMemo(() => Object.entries(cellErrors).map(([key, text]) => {
    const i = key.indexOf("|"), studentId = key.slice(0, i), stageId = key.slice(i + 1);
    return { key, stageId, text, name: board.students.find(s => s.studentId === studentId)?.displayName || studentId };
  }), [cellErrors, board]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => { if (fillFor) fillInputRef.current?.focus(); }, [fillFor]);

  function discardAll() { setDrafts({}); setDoneDrafts({}); setCellErrors({}); }
  async function guard(action: () => void) {
    if (!dirty) { action(); return; }
    const ok = await confirm({ title: "علامات غير محفوظة", message: "في الجدول " + pendingCount + " تغيير لم يُحفظ بعد. هل تريد تجاهله؟", confirmLabel: "تجاهل العلامات", cancelLabel: "متابعة الإدخال", tone: "danger" });
    if (ok) { discardAll(); action(); }
  }
  function clearCellError(key: string) { setCellErrors(prev => dropKeys(prev, [key])); }
  function setDraft(key: string, value: string) { setDrafts(prev => ({ ...prev, [key]: value })); clearCellError(key); }
  /** Flips the cell's «منجز» as shown (`done` includes an approval the switch implies for a new score). Back at the saved
   *  state the explicit decision is dropped, unless the switch would then imply the opposite. */
  function toggleDone(student: BoardStudent, stageId: string, done: boolean) {
    const key = keyOf(student.studentId, stageId);
    const saved = approvedOf(student, stageId);
    const next = !done;
    const implies = approveOnSave && !saved && pending.some(c => c.key === key && c.score !== null);
    setDoneDrafts(prev => (next === saved && !implies ? dropKeys(prev, [key]) : { ...prev, [key]: next }));
    clearCellError(key);
  }
  function focusCell(r: number, c: number) {
    const input = tableRef.current?.querySelector<HTMLInputElement>('input[data-r="' + r + '"][data-c="' + c + '"]');
    if (input) { input.focus(); input.select(); }
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>, r: number, c: number, key: string, student: BoardStudent, stageId: string, done: boolean) {
    if (e.nativeEvent.isComposing) return;
    const move = (dr: number, dc: number) => { e.preventDefault(); focusCell(r + dr, c + dc); };
    if (e.key === "Enter") move(e.shiftKey ? -1 : 1, 0);
    else if (e.key === "ArrowDown") move(1, 0);
    else if (e.key === "ArrowUp") move(-1, 0);
    else if (e.key === "ArrowLeft") move(0, 1);                               // RTL: the next stage is to the left
    else if (e.key === "ArrowRight") move(0, -1);
    else if (e.key === " ") { e.preventDefault(); toggleDone(student, stageId, done); }  // a score never holds a space
    else if (e.key === "Escape") {
      e.preventDefault();
      setDrafts(prev => dropKeys(prev, [key]));
      setDoneDrafts(prev => dropKeys(prev, [key]));
      clearCellError(key);
    }
  }
  function onPaste(e: ClipboardEvent<HTMLInputElement>, r: number, c: number) {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ""))) return;                   // a single value: the input's own paste
    e.preventDefault();
    const rows = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map(line => line.split("\t"));
    const next: Record<string, string> = {};
    let placed = 0, outside = 0;
    rows.forEach((cells, i) => cells.forEach((value, j) => {
      const student = students[r + i], stage = columns[c + j];
      if (!student || !stage) { outside++; return; }
      next[keyOf(student.studentId, stage.stageId)] = value.trim();
      placed++;
    }));
    setDrafts(prev => ({ ...prev, ...next }));
    setCellErrors(prev => dropKeys(prev, Object.keys(next)));
    setNotice("لُصقت " + placed + " قيمة" + (outside ? "، وتجاوزت " + outside + " قيمة حدود الجدول ولم تُلصق." : ".") + " راجعها ثم اضغط «حفظ العلامات».");
  }

  // ---- the column menu: unsaved changes for the students shown, reviewed before «حفظ العلامات» ----
  function markColumnDone(stage: BoardStage) {
    const keys = students.filter(s => !approvedOf(s, stage.stageId)).map(s => keyOf(s.studentId, stage.stageId));
    setDoneDrafts(prev => { const next = { ...prev }; for (const k of keys) next[k] = true; return next; });
    setNotice(keys.length ? "حُدّدت المرحلة " + stage.stageId + " منجزة لـ " + keys.length + " طالب. راجع ثم اضغط «حفظ العلامات»." : "المرحلة " + stage.stageId + " منجزة لكل الطلاب المعروضين.");
  }
  function clearColumn(stage: BoardStage) {
    const keys = students.filter(s => savedOf(s, stage.stageId) !== null).map(s => keyOf(s.studentId, stage.stageId));
    setDrafts(prev => { const next = { ...prev }; for (const k of keys) next[k] = ""; return next; });
    setNotice(keys.length ? "ستُمسح علامات المرحلة " + stage.stageId + " لـ " + keys.length + " طالب عند الحفظ. «تجاهل التغييرات» يتراجع عن ذلك." : "لا توجد علامات محفوظة في المرحلة " + stage.stageId + " للطلاب المعروضين.");
  }
  const fillParsed = parseGridScore(fillValue);
  function applyFill() {
    if (!fillFor || fillParsed.kind !== "value") return;
    const stageId = fillFor.stageId;
    const keys = students.filter(s => savedOf(s, stageId) === null && !(keyOf(s.studentId, stageId) in drafts)).map(s => keyOf(s.studentId, stageId));
    setDrafts(prev => { const next = { ...prev }; for (const k of keys) next[k] = String(fillParsed.value); return next; });
    setNotice(keys.length ? "عُبّئت " + keys.length + " علامة فارغة في المرحلة " + stageId + " بالقيمة " + fmtContribution(fillParsed.value) + ". راجعها ثم اضغط «حفظ العلامات»." : "لا توجد خلايا فارغة في المرحلة " + stageId + " للطلاب المعروضين.");
    setFillFor(null); setFillValue("");
  }

  async function save() {
    if (locked || busy || !pendingCount || invalid) return;
    setBusy(true); setError(""); setNotice("");
    const failed: Record<string, string> = {};
    const savedScoreKeys: string[] = [], savedStatusKeys: string[] = [];
    let changed = 0, unchanged = 0, approved = 0, reopened = 0, statusWritten = false;
    try {
      for (let i = 0; i < pending.length; i += CHUNK) {
        const items = pending.slice(i, i + CHUNK).map(c => ({ studentId: c.studentId, stageId: c.stageId, score: c.score, expected: c.expected }));
        const r = await trackerPost<ScoreBulkResponse>(token, projectCode, { action: "score.bulk", classId, items });
        for (const x of r.results) {
          const key = keyOf(x.studentId, x.stageId);
          if (x.ok) savedScoreKeys.push(key); else failed[key] = errorText(x);
        }
        changed += r.totals.changed; unchanged += r.totals.unchanged;
      }
      // Status decisions after the scores; a cell whose score failed keeps its whole change for the retry.
      for (const to of ["approved", "in_progress"] as const) {
        const list = statusChanges.filter(c => c.to === to && !(c.key in failed));
        for (let i = 0; i < list.length; i += CHUNK) {
          const items = list.slice(i, i + CHUNK).map(c => ({ studentId: c.studentId, stageId: c.stageId }));
          const r = await trackerPost<StatusBulkResponse>(token, projectCode, { action: "progress.bulk", classId, items, status: to });
          for (const x of r.results) {
            const key = keyOf(x.studentId, x.stageId);
            if (x.ok) { savedStatusKeys.push(key); if (to === "approved") approved++; else reopened++; statusWritten = true; }
            else failed[key] = errorText(x);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ العلامات.");
    } finally {
      setDrafts(prev => dropKeys(prev, savedScoreKeys));
      setDoneDrafts(prev => dropKeys(prev, savedStatusKeys));
      setCellErrors(failed);
      const failedCount = Object.keys(failed).length;
      if (savedScoreKeys.length || savedStatusKeys.length || failedCount) {
        const parts = [savedScoreKeys.length || !savedStatusKeys.length ? "حُفظت " + changed + " علامة" + (unchanged ? "، ودون تغيير " + unchanged : "") : ""];
        if (approved) parts.push("اعتُمدت " + approved + " مرحلة");
        if (reopened) parts.push("أُعيدت " + reopened + " مرحلة إلى قيد التنفيذ");
        setNotice(parts.filter(Boolean).join("، ") + (failedCount ? "، وتعذر حفظ " + failedCount + " (مُعلَّمة في الجدول)." : "."));
      }
      await onSaved();
      if (statusWritten) onStatusChanged?.();
      setBusy(false);
    }
  }

  return (
    <div className="eb-score-grid" dir="rtl">
      <p className="eb-muted">اكتب العلامات كما في جدول بيانات: Enter للطالب التالي، والأسهم للتنقل، والمسافة لتحديد المرحلة منجزة، ويمكن لصق عمود أو جدول من Excel. تظهر في آخر كل صف نسبة التقدّم والعلامة الموزونة كما يحسبها الخادم.</p>
      <div className="eb-bulk-stage-picker eb-score-grid-controls">
        <div className="eb-segmented" role="group" aria-label="المسار">
          {tracks.map(t => <button key={t.trackId} type="button" aria-pressed={track === t.trackId} disabled={busy} onClick={() => { if (t.trackId !== track) void guard(() => setTrack(t.trackId)); }}>{t.title}</button>)}
        </div>
        <label className="eb-field-inline">المجموعة
          <select value={activeGroup} disabled={busy || !groups.length} onChange={e => { const next = e.target.value; void guard(() => setGroupId(next)); }}>
            <option value="">كل المجموعات ({stages.filter(s => s.track === track && groups.some(g => g.groupId === s.groupId)).length})</option>
            {groups.map(g => <option key={g.groupId} value={g.groupId}>{g.title} ({stages.filter(s => s.groupId === g.groupId).length})</option>)}
          </select>
        </label>
        <div className="eb-segmented" role="group" aria-label="عرض الطلاب">
          {FILTERS.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} disabled={busy} onClick={() => setFilter(f.id)}>{f.label}</button>)}
        </div>
        {!locked && (
          <label className="eb-stage-approve-toggle">
            <input type="checkbox" role="switch" checked={approveOnSave} disabled={busy} onChange={e => { setApproveOnSave(e.target.checked); writeApproveOnSave(e.target.checked); }} />
            اعتماد المرحلة عند حفظ العلامة
          </label>
        )}
        <button type="button" className="eb-button is-quiet is-small eb-score-grid-export" disabled={busy || !board.students.length} onClick={exportScores}>تصدير إلى Excel</button>
      </div>

      {!locked && (
        <div className="eb-bulk-bar eb-bulk-review-bar eb-score-grid-bar" role="region" aria-label="حفظ العلامات">
          <span className="eb-bulk-summary" role="status">{pendingCount || invalid ? pendingCount + " تغيير جاهز للحفظ" + (invalid ? " · " + invalid + " غير صحيحة" : "") : "لا توجد تغييرات"}</span>
          <div className="eb-bulk-group">
            <button type="button" className="eb-button is-primary is-small" disabled={busy || !pendingCount || invalid > 0} onClick={() => void save()}>{busy ? SAVE_LABELS.saving : "حفظ العلامات" + (pendingCount ? " (" + pendingCount + ")" : "")}</button>
            <button type="button" className="eb-button is-quiet is-small" disabled={busy || !dirty} onClick={() => { discardAll(); setNotice(""); }}>تجاهل التغييرات</button>
          </div>
          {invalid > 0 && <p className="eb-stage-row-error" role="alert">صحّح {invalid === 1 ? "خلية واحدة" : invalid + " خلايا"}: العلامة رقم من 0 إلى 100.</p>}
        </div>
      )}
      {error && <div className="platform-error assignment-inline-message" role="alert">{error}</div>}
      {failedList.length > 0 && (
        <div className="eb-score-grid-failures" role="alert">
          <ul aria-label="علامات لم تُحفظ">
            {failedList.slice(0, 10).map(f => <li key={f.key}><strong>{f.name}</strong> — {f.stageId}: {f.text}</li>)}
            {failedList.length > 10 && <li>و{failedList.length - 10} أخرى مُعلَّمة في الجدول.</li>}
          </ul>
        </div>
      )}
      {notice && <div className="platform-notice assignment-inline-message" role="status" aria-live="polite">{notice}</div>}

      {!board.students.length ? <EmptyState compact title="لا يوجد طلاب في هذا الصف بعد." />
        : !columns.length ? <EmptyState compact title="لا توجد مراحل مفعّلة في هذه المجموعة." />
          : !students.length ? <EmptyState compact title="لا يوجد طلاب يطابقون هذا العرض." />
            : (
              <div className="eb-score-grid-scroll" role="region" aria-label="جدول العلامات" tabIndex={0}>
                <table className="eb-score-grid-table" ref={tableRef}>
                  <caption className="eb-visually-hidden">علامات الطلاب من 100 وحالة الإنجاز لمراحل {activeGroup ? "المجموعة المختارة" : "المسار"}، مع التقدّم والعلامة الموزونة لكل طالب</caption>
                  <thead>
                    {bands.length > 0 && (
                      <tr className="eb-score-grid-bands">
                        <th scope="col" className="eb-score-grid-student"><span className="eb-visually-hidden">المجموعات</span></th>
                        {bands.map(b => <th key={b.groupId} scope="colgroup" colSpan={b.span}>{b.title}</th>)}
                        <th scope="col" aria-hidden="true" className="eb-score-grid-total" />
                      </tr>
                    )}
                    <tr>
                      <th scope="col" className="eb-score-grid-student">الطالب</th>
                      {columns.map(st => (
                        <th key={st.stageId} scope="col" title={st.title}>
                          <div className="eb-score-grid-head">
                            <span className="eb-stage-code">{st.stageId}</span>
                            {!locked && (
                              <ActionMenu label={"إجراءات المرحلة " + st.stageId} disabled={busy}>
                                <button type="button" className="eb-menu-item" onClick={() => markColumnDone(st)}>تحديد المرحلة منجزة للطلاب المعروضين</button>
                                <button type="button" className="eb-menu-item" onClick={() => { setFillFor(st); setFillValue(""); }}>تعبئة العلامات الفارغة…</button>
                                <button type="button" className="eb-menu-item" onClick={() => clearColumn(st)}>مسح علامات المرحلة</button>
                              </ActionMenu>
                            )}
                          </div>
                          <span className="eb-score-grid-stage-title">{st.title}</span>
                        </th>
                      ))}
                      <th scope="col" className="eb-score-grid-total">التقدّم · العلامة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student, r) => (
                      <tr key={student.studentId}>
                        <th scope="row" className="eb-score-grid-student">{student.displayName}{student.code ? <small className="eb-muted"> {student.code}</small> : null}</th>
                        {columns.map((st, c) => {
                          const key = keyOf(student.studentId, st.stageId);
                          const cell = student.cells[st.stageId];
                          const status = normalizeStageStatus(cell?.status);
                          const saved = savedOf(student, st.stageId);
                          const draft = drafts[key];
                          const value = draft ?? (saved === null ? "" : String(saved));
                          const parsed = draft === undefined ? null : parseGridScore(draft);
                          const isInvalid = !!parsed && parsed.kind === "invalid";
                          const isChanged = changedKeys.has(key);
                          const cellError = cellErrors[key];
                          const savedDone = status === "approved";
                          const statusChange = statusChanges.find(x => x.key === key);
                          const done = statusChange ? statusChange.to === "approved" : savedDone;
                          const statusText = cell?.selfReported ? "حدّدها الطالب" : stageStatusLabel(status);
                          return (
                            <td key={st.stageId} className={"eb-score-cell " + STATUS_CLASS[status] + (cell?.selfReported ? " is-self" : "") + (isChanged ? " is-changed" : "") + (isInvalid || cellError ? " is-invalid" : "")} title={cellError || statusText}>
                              {locked ? (
                                <span className="eb-score-cell-read"><span dir="ltr">{saved === null ? "—" : fmtContribution(saved)}</span>{savedDone && <IconCheck size={14} aria-label="منجز" />}</span>
                              ) : (
                                <div className="eb-score-cell-edit">
                                  <input type="text" inputMode="decimal" dir="ltr" autoComplete="off" data-r={r} data-c={c}
                                    value={value} disabled={busy}
                                    aria-label={student.displayName + " — " + st.stageId + " (" + statusText + ") علامة من 100"}
                                    aria-invalid={isInvalid || !!cellError || undefined}
                                    onFocus={e => e.currentTarget.select()}
                                    onChange={e => setDraft(key, e.target.value)}
                                    onKeyDown={e => onKey(e, r, c, key, student, st.stageId, done)}
                                    onPaste={e => onPaste(e, r, c)} />
                                  <button type="button" className={"eb-score-done" + (done ? " is-on" : "")} aria-pressed={done} disabled={busy}
                                    aria-label={student.displayName + " — " + st.stageId + ": منجز"} title={done ? "منجز (اضغط لإعادتها إلى قيد التنفيذ)" : "تحديد المرحلة منجزة"}
                                    onClick={() => toggleDone(student, st.stageId, done)}><IconCheck size={14} aria-hidden="true" /></button>
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="eb-score-grid-total">{student.summary
                          ? <span aria-label={"التقدّم " + student.summary.overallProgress + "٪، العلامة " + student.summary.grade}><span dir="ltr">{student.summary.overallProgress}%</span> · <strong dir="ltr">{student.summary.grade}</strong></span>
                          : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      <p className="eb-score-grid-legend eb-muted" aria-hidden="true">
        <span className="eb-score-legend is-approved">منجزة (معتمدة)</span>
        <span className="eb-score-legend is-ready">بانتظار الاعتماد</span>
        <span className="eb-score-legend is-self">حدّدها الطالب</span>
        <span className="eb-score-legend is-changed">تغيير غير محفوظ</span>
        <span className="eb-score-legend is-invalid">غير صحيحة</span>
      </p>
      <Dialog open={!!fillFor} title={"تعبئة العلامات الفارغة — " + (fillFor?.stageId || "")} onClose={() => setFillFor(null)} size="sm" initialFocusRef={fillInputRef}
        footer={<>
          <button type="button" className="eb-button is-primary" disabled={fillParsed.kind !== "value"} onClick={applyFill}>تعبئة</button>
          <button type="button" className="eb-button is-quiet" onClick={() => setFillFor(null)}>إلغاء</button>
        </>}>
        <form onSubmit={e => { e.preventDefault(); applyFill(); }}>
          <label className="eb-field">العلامة (0–100) للطلاب المعروضين الذين ليست لهم علامة في هذه المرحلة
            <input ref={fillInputRef} type="text" inputMode="decimal" dir="ltr" value={fillValue} onChange={e => setFillValue(e.target.value)} aria-invalid={fillValue !== "" && fillParsed.kind !== "value" || undefined} />
          </label>
          {fillValue !== "" && fillParsed.kind !== "value" && <p className="eb-stage-row-error" role="alert">العلامة رقم من 0 إلى 100.</p>}
        </form>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
