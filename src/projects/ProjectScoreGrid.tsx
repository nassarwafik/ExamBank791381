import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { trackerPost } from "./api";
import { normalizeStageStatus, stageStatusLabel } from "./teacherPresentation";
import { fmtContribution } from "./projectPerformance";
import EmptyState from "../ui/EmptyState";
import { useConfirm } from "../ui/useConfirm";
import { SAVE_LABELS } from "../teacher/saveLabels";
import type { Board, BoardStage, BoardStudent } from "./ProjectBulkReview";
import type { StageStatus, TrackMeta } from "./types";
import { parseGridScore, scoreGridChanges, type GridChange } from "./scoreGrid";

type Props = {
  token: string; projectCode: string; classId: string; tracks: TrackMeta[];
  board: Board; locked: boolean;
  /** Re-reads the board after a save (the parent owns the board). */
  onSaved: () => Promise<void>;
  /** Reports whether the grid holds unsaved scores (the bulk view / workspace ask before leaving). */
  onDirtyChange?: (dirty: boolean) => void;
};

type ScoreBulkResult = { studentId: string; stageId: string; ok: boolean; changed?: boolean; error?: string; score?: number | null };
type ScoreBulkResponse = { results: ScoreBulkResult[]; totals: { requested: number; changed: number; unchanged: number; failed: number } };

const keyOf = (studentId: string, stageId: string) => studentId + "|" + stageId;
const CHUNK = 300;                                                              // the server's score.bulk limit
const STATUS_CLASS: Record<StageStatus, string> = { not_started: "is-not-started", in_progress: "is-in-progress", ready_for_review: "is-ready", approved: "is-approved" };
const errorText = (r: ScoreBulkResult) =>
  r.error === "stale" ? "تغيّرت العلامة على الخادم إلى " + (typeof r.score === "number" ? fmtContribution(r.score) : "—") + ". راجعها ثم احفظ من جديد."
    : r.error === "not_member" ? "الطالب لم يعد في الصف."
      : r.error === "stage_inactive" ? "المرحلة غير مفعّلة."
        : r.error === "conflict" ? "تعارض مؤقت، أعد الحفظ."
          : r.error === "invalid" ? "قيمة غير صحيحة." : "تعذر الحفظ.";

/**
 * Phase P4 — «جدول العلامات»: the class's students (rows) × the stages of ONE group (columns), each cell a score input.
 * The teacher types like in a spreadsheet and saves every changed cell in one decision (`score.bulk`).
 *   • Keyboard: Enter / ↓ next student, Shift+Enter / ↑ previous, ← / → the neighbouring stage (RTL: ← is the next
 *     column), Escape restores the cell's saved score. Focus selects the cell's text so typing replaces it.
 *   • Paste: a block copied from a spreadsheet (tab / new-line separated) fills the grid from the focused cell (rows =
 *     students, columns = stages in this group's order); values beyond the grid are reported, never wrapped.
 *   • Values: 0–100, decimals allowed, Arabic-Indic digits and «٫» accepted; an empty cell clears a saved score. Invalid
 *     cells are marked and block the save.
 *   • Each change carries the score the grid showed (`expected`): a cell another write changed meanwhile is refused as
 *     stale and keeps the teacher's value with the server's current one in its message. Saved cells drop their draft;
 *     failed ones keep it. A score never changes a status (approval stays its own decision).
 * Drafts survive the board re-read after a save; switching track / group with unsaved scores asks first.
 */
export default function ProjectScoreGrid({ token, projectCode, classId, tracks, board, locked, onSaved, onDirtyChange }: Props) {
  const [track, setTrack] = useState<string>(tracks[0]?.trackId || "");
  const [groupId, setGroupId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const tableRef = useRef<HTMLTableElement | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const stages = useMemo(() => board.stages.slice().sort((a, b) => a.order - b.order), [board]);
  const groups = useMemo(() => (board.groups || []).filter(g => g.track === track && stages.some(s => s.groupId === g.groupId)).sort((a, b) => a.order - b.order), [board, track, stages]);
  // The chosen group while it exists in this track, otherwise the track's first group (derived, never stored).
  const activeGroup = groups.some(g => g.groupId === groupId) ? groupId : groups[0]?.groupId || "";
  const columns: BoardStage[] = useMemo(() => stages.filter(s => s.track === track && s.groupId === activeGroup), [stages, track, activeGroup]);
  const students: BoardStudent[] = board.students;

  const savedOf = (student: BoardStudent, stageId: string): number | null => {
    const c = student.cells[stageId];
    return c && typeof c.score === "number" ? c.score : null;
  };
  const changes: GridChange[] = useMemo(() => scoreGridChanges(drafts, board), [drafts, board]);
  const invalid = changes.filter(c => c.invalid).length;
  const pending = changes.filter(c => !c.invalid);
  const changedKeys = useMemo(() => new Set(changes.filter(c => !c.invalid).map(c => c.key)), [changes]);
  const dirty = changes.length > 0;
  const failedList = useMemo(() => Object.entries(cellErrors).map(([key, text]) => {
    const i = key.indexOf("|"), studentId = key.slice(0, i), stageId = key.slice(i + 1);
    return { key, stageId, text, name: students.find(s => s.studentId === studentId)?.displayName || studentId };
  }), [cellErrors, students]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  async function guard(action: () => void) {
    if (!dirty) { action(); return; }
    const ok = await confirm({ title: "علامات غير محفوظة", message: "في الجدول " + changes.length + " علامة لم تُحفظ بعد. هل تريد تجاهلها؟", confirmLabel: "تجاهل العلامات", cancelLabel: "متابعة الإدخال", tone: "danger" });
    if (ok) { setDrafts({}); setCellErrors({}); action(); }
  }

  function setDraft(key: string, value: string) {
    setDrafts(prev => ({ ...prev, [key]: value }));
    setCellErrors(prev => { if (!(key in prev)) return prev; const next = { ...prev }; delete next[key]; return next; });
  }
  function focusCell(r: number, c: number) {
    const input = tableRef.current?.querySelector<HTMLInputElement>('input[data-r="' + r + '"][data-c="' + c + '"]');
    if (input) { input.focus(); input.select(); }
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>, r: number, c: number, key: string) {
    if (e.nativeEvent.isComposing) return;
    const move = (dr: number, dc: number) => { e.preventDefault(); focusCell(r + dr, c + dc); };
    if (e.key === "Enter") move(e.shiftKey ? -1 : 1, 0);
    else if (e.key === "ArrowDown") move(1, 0);
    else if (e.key === "ArrowUp") move(-1, 0);
    else if (e.key === "ArrowLeft") move(0, 1);                               // RTL: the next stage is to the left
    else if (e.key === "ArrowRight") move(0, -1);
    else if (e.key === "Escape") {
      e.preventDefault();
      setDrafts(prev => { if (!(key in prev)) return prev; const next = { ...prev }; delete next[key]; return next; });
      setCellErrors(prev => { if (!(key in prev)) return prev; const next = { ...prev }; delete next[key]; return next; });
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
    setCellErrors(prev => { const out = { ...prev }; for (const k of Object.keys(next)) delete out[k]; return out; });
    setNotice("لُصقت " + placed + " قيمة" + (outside ? "، وتجاوزت " + outside + " قيمة حدود الجدول ولم تُلصق." : ".") + " راجعها ثم اضغط «حفظ العلامات».");
  }

  async function save() {
    if (locked || busy || !pending.length || invalid) return;
    setBusy(true); setError(""); setNotice("");
    const failed: Record<string, string> = {};
    const savedKeys: string[] = [];
    let changed = 0, unchanged = 0;
    try {
      for (let i = 0; i < pending.length; i += CHUNK) {
        const items = pending.slice(i, i + CHUNK).map(c => ({ studentId: c.studentId, stageId: c.stageId, score: c.score, expected: c.expected }));
        const r = await trackerPost<ScoreBulkResponse>(token, projectCode, { action: "score.bulk", classId, items });
        for (const x of r.results) {
          const key = keyOf(x.studentId, x.stageId);
          if (x.ok) savedKeys.push(key); else failed[key] = errorText(x);
        }
        changed += r.totals.changed; unchanged += r.totals.unchanged;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ العلامات.");
    } finally {
      setDrafts(prev => { const next = { ...prev }; for (const k of savedKeys) delete next[k]; return next; });
      setCellErrors(failed);
      const failedCount = Object.keys(failed).length;
      if (savedKeys.length || failedCount) setNotice("حُفظت " + changed + " علامة" + (unchanged ? "، ودون تغيير " + unchanged : "") + (failedCount ? "، وتعذر حفظ " + failedCount + " (مُعلَّمة في الجدول)." : "."));
      await onSaved();
      setBusy(false);
    }
  }

  return (
    <div className="eb-score-grid" dir="rtl">
      <p className="eb-muted">اكتب العلامات كما في جدول بيانات: Enter للطالب التالي، والأسهم للتنقل، ويمكن لصق عمود أو جدول من Excel. لا تتغير حالة أي مرحلة؛ الاعتماد قرار منفصل.</p>
      <div className="eb-bulk-stage-picker">
        <div className="eb-segmented" role="group" aria-label="المسار">
          {tracks.map(t => <button key={t.trackId} type="button" aria-pressed={track === t.trackId} disabled={busy} onClick={() => { if (t.trackId !== track) void guard(() => setTrack(t.trackId)); }}>{t.title}</button>)}
        </div>
        <label className="eb-field-inline">المجموعة
          <select value={activeGroup} disabled={busy || !groups.length} onChange={e => { const next = e.target.value; void guard(() => setGroupId(next)); }}>
            {groups.map(g => <option key={g.groupId} value={g.groupId}>{g.title} ({stages.filter(s => s.groupId === g.groupId).length})</option>)}
          </select>
        </label>
      </div>

      {!locked && (
        <div className="eb-bulk-bar eb-bulk-review-bar eb-score-grid-bar" role="region" aria-label="حفظ العلامات">
          <span className="eb-bulk-summary" role="status">{dirty ? pending.length + " علامة جاهزة للحفظ" + (invalid ? " · " + invalid + " غير صحيحة" : "") : "لا توجد تغييرات"}</span>
          <div className="eb-bulk-group">
            <button type="button" className="eb-button is-primary is-small" disabled={busy || !pending.length || invalid > 0} onClick={() => void save()}>{busy ? SAVE_LABELS.saving : "حفظ العلامات" + (pending.length ? " (" + pending.length + ")" : "")}</button>
            <button type="button" className="eb-button is-quiet is-small" disabled={busy || !dirty} onClick={() => { setDrafts({}); setCellErrors({}); setNotice(""); }}>تجاهل التغييرات</button>
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

      {!students.length ? <EmptyState compact title="لا يوجد طلاب في هذا الصف بعد." />
        : !columns.length ? <EmptyState compact title="لا توجد مراحل مفعّلة في هذه المجموعة." />
          : (
            <div className="eb-score-grid-scroll" role="region" aria-label="جدول العلامات" tabIndex={0}>
              <table className="eb-score-grid-table" ref={tableRef}>
                <caption className="eb-visually-hidden">علامات الطلاب من 100 لمراحل المجموعة المختارة</caption>
                <thead>
                  <tr>
                    <th scope="col" className="eb-score-grid-student">الطالب</th>
                    {columns.map(st => (
                      <th key={st.stageId} scope="col" title={st.title}>
                        <span className="eb-stage-code">{st.stageId}</span>
                        <span className="eb-score-grid-stage-title">{st.title}</span>
                      </th>
                    ))}
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
                        const statusText = cell?.selfReported ? "حدّدها الطالب" : stageStatusLabel(status);
                        return (
                          <td key={st.stageId} className={"eb-score-cell " + STATUS_CLASS[status] + (isChanged ? " is-changed" : "") + (isInvalid || cellError ? " is-invalid" : "")} title={cellError || statusText}>
                            {locked ? (
                              <span dir="ltr">{saved === null ? "—" : fmtContribution(saved)}</span>
                            ) : (
                              <input type="text" inputMode="decimal" dir="ltr" autoComplete="off" data-r={r} data-c={c}
                                value={value} disabled={busy}
                                aria-label={student.displayName + " — " + st.stageId + " (" + statusText + ") علامة من 100"}
                                aria-invalid={isInvalid || !!cellError || undefined}
                                onFocus={e => e.currentTarget.select()}
                                onChange={e => setDraft(key, e.target.value)}
                                onKeyDown={e => onKey(e, r, c, key)}
                                onPaste={e => onPaste(e, r, c)} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      <p className="eb-score-grid-legend eb-muted" aria-hidden="true">
        <span className="eb-score-legend is-approved">معتمدة</span>
        <span className="eb-score-legend is-ready">بانتظار الاعتماد</span>
        <span className="eb-score-legend is-changed">تغيير غير محفوظ</span>
        <span className="eb-score-legend is-invalid">غير صحيحة</span>
      </p>
      {confirmDialog}
    </div>
  );
}
