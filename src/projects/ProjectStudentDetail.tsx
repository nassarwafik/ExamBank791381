import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { trackerGet, trackerPost } from "./api";
import { fmtDate, stagesByGroup } from "./helpers";
import { STAGE_STATUS_ORDER, STAGE_STATUS_TONE, STAGE_STATUS_CLASS, stageStatusLabel, normalizeStageStatus, toneForTrack } from "./teacherPresentation";
import ProgressBar from "../ui/ProgressBar";
import StatusBadge from "../ui/StatusBadge";
import ActionMenu from "../ui/ActionMenu";
import Dialog from "../ui/Dialog";
import { readApproveOnSave, writeApproveOnSave } from "./approveOnSave";
import IconButton from "../ui/IconButton";
import EmptyState from "../ui/EmptyState";
import { IconChevronBack, IconCheck } from "../icons";
import { useConfirm } from "../ui/useConfirm";
import { SAVE_LABELS } from "../teacher/saveLabels";
import ProjectRankHero from "./ProjectRankHero";
import ProjectEvaluationCard from "./ProjectEvaluationCard";
import { fmtContribution, fmtStageScore, normalizeProjectPerformance, stageValueOf } from "./projectPerformance";
import { mutationBody, normalizeProjectEvaluation, type StagePatch } from "./projectEvaluation";
import { BY_LABEL, fmtDateTime, stageHistoryText, type StageHistoryEvent, type StageHistoryState } from "./stageHistory";
import { gridStatusChanges, parseGridScore, scoreGridChanges, type GridChange } from "./scoreGrid";
import type { Board } from "./ProjectBulkReview";
import type { StudentDetail, ProjectStage, StudentCard, StageProgressEntry, HistoryEvent, BalanceInsight, TrackMeta, ProjectPerformance, ProjectEvaluation, StageStatus } from "./types";
import type { ProjectEvaluationQueueView } from "./drillTarget";

type Props = {
  token: string; projectCode: string; classId: string; studentId: string; tracks: TrackMeta[];
  onBack: () => void;
  /** Called after any successful progress mutation so the (still mounted) student list can refresh on return. */
  onChanged?: () => void;
  /** Called only after a successful STATUS mutation (never note-only, noChange, cancel or failure): a status
   * change can alter the global ready-for-review counts App owns. */
  onReadyChanged?: () => void;
  /** Phase 9E — Evaluation Focus Mode: the drill `seq` that opened this student from the Today Hub («تقييم المشاريع»).
   * 0 / undefined = a normal opening (heading focus, no banner, no highlight). Each seq is applied exactly once: after
   * THIS selection's detail has loaded, the first ungraded active stage (server `evaluation.stages` order) gets its
   * track selected and its score input focused. */
  evaluationFocusSeq?: number;
  /** Phase 9F — the evaluation queue session around this student (only in focus mode): position and neighbours. */
  evaluationQueue?: ProjectEvaluationQueueView | null;
  onEvaluationQueueMove?: (dir: -1 | 1) => void;
  /** Reported once per loaded detail whose server `evaluation.ungradedStages === 0` (App marks the item completed). */
  onEvaluationComplete?: () => void;
  /** Phase 9G — «العودة إلى لوحة اليوم» from the final-session panel (App ends the session; never automatic). */
  onEvaluationQueueFinish?: () => void;
  /** 9G review — «العودة إلى آخر طالب في الجلسة»: shown only when this item is NOT the terminal one, the terminal item
   * is completed, and no next item is eligible (skip-completed left nothing after us). Never changes next/previous. */
  onEvaluationQueueReturnToTerminal?: () => void;
  /** Phase P4 — outside Evaluation Focus Mode: this student's neighbours in the list the teacher opened them from. */
  siblings?: { previous: SiblingRef | null; next: SiblingRef | null; position: number; total: number } | null;
  onOpenSibling?: (studentId: string) => void;
};
type SiblingRef = { studentId: string; displayName: string };

type UpdateResponse = {
  ok: true; noChange?: boolean;
  summary: StudentCard;
  performance?: ProjectPerformance;
  /** Phase 9B — the recomputed evaluation summary (additive). */
  evaluation?: ProjectEvaluation;
  stage: StageProgressEntry & { stageId: string };
  /** Absent on the narrow score actions (a score never changes the workflow, so nextStages / balance are unchanged). */
  nextStages?: Record<string, ProjectStage | null>;
  balance?: BalanceInsight;
  history: HistoryEvent[];
};
type ScoreBulkResult = { studentId: string; stageId: string; ok: boolean; changed?: boolean; error?: string; score?: number | null };
type ScoreBulkResponse = { results: ScoreBulkResult[]; totals: { requested: number; changed: number; unchanged: number; failed: number } };
type StatusBulkResponse = { readyChanged?: boolean; results: { studentId: string; stageId: string; ok: boolean; changed?: boolean; error?: string }[] };

type Patch = StagePatch;
const dropKeys = <T,>(map: Record<string, T>, keys: Iterable<string>): Record<string, T> => {
  const next = { ...map }; let changed = false;
  for (const k of keys) if (k in next) { delete next[k]; changed = true; }
  return changed ? next : map;
};
// Phase P8 — the operations a single write carries (a note or a workflow status), for the busy / double-submit state of the row.
// The remembered switch lives in approveOnSave.ts (shared with the class matrix, Phase G1).
const patchKinds = (patch: Patch): string[] => [patch.score !== undefined ? "score" : "", patch.status !== undefined ? "status" : "", patch.note !== undefined ? "note" : ""].filter(Boolean);
const CHUNK = 300;                                                              // the server's score.bulk / progress.bulk limit
/** The statuses the row menu writes at once (approved and in_progress are the «منجز» toggle's, saved with the scores). */
const MENU_STATUSES: StageStatus[] = STAGE_STATUS_ORDER.filter(st => st !== "approved" && st !== "in_progress");
const errorText = (r: { error?: string; score?: number | null }) =>
  r.error === "stale" ? "تغيّرت العلامة على الخادم إلى " + (typeof r.score === "number" ? fmtContribution(r.score) : "—") + ". راجعها ثم احفظ من جديد."
    : r.error === "not_member" ? "الطالب لم يعد في الصف."
      : r.error === "stage_inactive" ? "المرحلة غير مفعّلة."
        : r.error === "conflict" ? "تعارض مؤقت، أعد الحفظ."
          : r.error === "invalid" ? "قيمة غير صحيحة." : "تعذر الحفظ.";

/**
 * Non-modal student profile for one project. Same single `student` read as before; focus moves to the heading on open and
 * the workspace returns it to the opener on back. Archived classes expose no mutation controls at all.
 *
 * Phase G2 (owner decisions of 2026-10-23: the compact table replaces the collapsible sections, one save bar for the
 * student's edits, the same approve-on-save switch as the class matrix). The stages of the selected track are ONE table
 * — الموضوع | منجز؟ | العلامة من 100 | الموزونة | الحالة | إجراءات — with each group as a section row:
 *   • Every row is a score AND a «منجز» decision, exactly as a matrix cell (Phase G1): the toggle (or Space in the field)
 *     marks the stage done or reopens it; with «اعتماد المرحلة عند حفظ العلامة» on, a typed score approves the stage too
 *     (a student's unconfirmed mark is confirmed), never a cleared one; off, a score never changes a status.
 *   • Enter moves to the next stage's field (Shift+Enter back), Escape restores the row; nothing is written until
 *     «حفظ التغييرات»: `score.bulk` (each score with the value the row showed as the stale guard), then `progress.bulk`
 *     for the approvals and the reopenings — never for a stage whose score failed — then the profile is re-read, so the
 *     weighted values, the grade and the evaluation are the server's.
 *   • The row menu: the details and the teacher's note (a dialog; the note is its own `progress.update`), «مسح العلامة»
 *     (an unsaved change the save bar carries), and the two workflow statuses the toggle does not cover, written at once.
 *   • Drafts are keyed by stage, cleared whenever the project, class or student changes, and confirmed before moving to a
 *     sibling. The field is disabled while a save is in flight; a failed row keeps its draft and shows the server's reason.
 *   • Phase 9E / 9F / 9G (focus mode, the queue, the final panel) are unchanged: the focused stage's field is found by
 *     `[data-stage-id] input[data-stage-score]`, and completion is read from the server's evaluation after each save.
 */
/** The first ungraded ACTIVE stage in the server's canonical order (Phase 9B `evaluation.stages`); null when none. */
function firstUngraded(evaluation: ProjectEvaluation | null): ProjectEvaluation["stages"][number] | null {
  return evaluation ? evaluation.stages.find(s => !s.graded) ?? null : null;
}
const remainingText = (n: number) => (n === 1 ? "بقيت مرحلة واحدة بدون علامة." : n === 2 ? "بقيت مرحلتان بدون علامة." : "بقيت " + n + " مراحل بدون علامة.");
// Phase 9G — session-summary wording. «تم تقييم» counts the students THIS session saw the server declare complete;
// «لم يُسجَّل اكتمال تقييمهم خلال هذه الجلسة» deliberately says "not recorded in this session", never "ungraded now".
const studentsWord = (n: number) => (n === 1 ? "طالب واحد" : n === 2 ? "طالبان" : n + " طلاب");
const sessionDoneText = (completed: number, total: number) => "تم تقييم " + completed + " من " + total + " " + (total === 1 ? "طالب" : "طلاب") + " في هذه الجلسة.";
const sessionRemainingText = (remaining: number) => (remaining === 0 ? "اكتمل تقييم جميع الطلاب في قائمة هذه الجلسة." : "بقي " + studentsWord(remaining) + " في القائمة لم يُسجَّل اكتمال تقييمهم خلال هذه الجلسة.");

/** The matrix's one-student view of this profile: the change helpers of Phase G1 decide what a save writes. */
function boardOf(detail: StudentDetail, studentId: string, name: string): Board {
  const cells: Board["students"][number]["cells"] = {};
  for (const [stageId, e] of Object.entries(detail.progress)) {
    const status = normalizeStageStatus(e.status);
    cells[stageId] = { status, score: typeof e.score === "number" ? e.score : null, selfReported: status === "approved" && !!e.selfReportedAt };
  }
  return {
    readOnly: detail.readOnly,
    groups: detail.groups || [],
    stages: detail.stages.filter(s => s.active !== false).map(s => ({ stageId: s.stageId, track: s.track, groupId: s.groupId, title: s.title, order: s.order, required: s.required !== false })),
    students: [{ studentId, displayName: name, code: detail.student.code, cells }]
  };
}

export default function ProjectStudentDetail({ token, projectCode, classId, studentId, tracks, onBack, onChanged, onReadyChanged, evaluationFocusSeq = 0, evaluationQueue = null, onEvaluationQueueMove, onEvaluationComplete, onEvaluationQueueFinish, onEvaluationQueueReturnToTerminal, siblings = null, onOpenSibling }: Props) {
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [track, setTrack] = useState<string>(tracks[0]?.trackId || "");
  const [detailsFor, setDetailsFor] = useState("");                            // the stage whose details / note dialog is open
  const [history, setHistory] = useState<StageHistoryState | null>(null);      // Phase G3 — the open «سجلّ التغييرات» dialog
  const historySeq = useRef(0);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});  // keyed studentId|stageId (the matrix's keys)
  const [doneDrafts, setDoneDrafts] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});   // keyed by stageId
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});     // keyed by stageId
  const [pending, setPending] = useState<Record<string, true>>({});           // "stageId:kind" queued or in flight (single writes)
  const [saving, setSaving] = useState(false);                                // the save bar's bulk write
  const savingRef = useRef(false);                                            // the same, readable within one tick (a double activation)
  const [approveOnSave, setApproveOnSave] = useState(readApproveOnSave);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  // The selection every queued write belongs to; a write or response for another selection is dropped.
  const contextKey = projectCode + "|" + classId + "|" + studentId;
  const contextRef = useRef(contextKey);
  contextRef.current = contextKey;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef<Set<string>>(new Set());
  // Stale-selection guard: only the LATEST requested (project, class, student) may populate the view — a slow
  // response for a previously selected student can never overwrite the current one's grade / rank / stages.
  const requestSeq = useRef(0);
  // Phase 9E — the focus request: which stage's score input to focus once it is rendered, and which drill seq was
  // already consumed (a seq is applied once; the same seq never re-focuses, a new seq for the same student does).
  const [focusStageId, setFocusStageId] = useState("");
  const appliedFocusSeq = useRef(0);
  // The (project, class, student) `detail` was actually fetched for. Between a selection change and the effect that
  // resets the view, React renders once with the NEW ids and the OLD detail; every 9E/9F decision below therefore
  // requires `loadedContextKey === contextKey`, so a previous student's evaluation can never be read as the current one.
  const [loadedContextKey, setLoadedContextKey] = useState("");

  async function load() {
    const seq = ++requestSeq.current, requestedContextKey = contextKey;
    setLoading(true); setError("");
    try {
      const r = await trackerGet<StudentDetail>(token, projectCode, "student", { classId, studentId });
      if (seq !== requestSeq.current || requestedContextKey !== contextRef.current) return;
      setDetail(r); setLoadedContextKey(requestedContextKey);
    } catch (e) { if (seq === requestSeq.current) setError(e instanceof Error ? e.message : "تعذر تحميل ملف الطالب."); }
    finally { if (seq === requestSeq.current) setLoading(false); }
  }
  // A new (project, class, student) starts clean: no detail, no dialog, no drafts, no row errors, no queued busy state.
  function resetSelection() {
    setDetail(null); setLoadedContextKey(""); setDetailsFor(""); setHistory(null); historySeq.current++; setScoreDrafts({}); setDoneDrafts({}); setNoteDrafts({}); setRowErrors({}); setPending({}); setNotice(""); setError("");
    setFocusStageId("");                                                       // a pending focus never carries over to another selection
    pendingRef.current = new Set();
    setSaving(false); savingRef.current = false;                               // a bulk save of the previous selection no longer holds this one's fields
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { resetSelection(); void load(); }, [classId, studentId, projectCode]);
  useEffect(() => { headingRef.current?.focus(); }, [studentId]);

  const focusMode = evaluationFocusSeq > 0;
  // `detailIsCurrent`: the detail on screen belongs to the CURRENT selection (not the one-render-old detail of the
  // previous student). The evaluation is exposed only then — an older evaluation is never treated as current.
  const detailIsCurrent = !!detail && loadedContextKey === contextKey;
  const evaluation = useMemo(() => (loadedContextKey === contextKey ? normalizeProjectEvaluation(detail?.evaluation) : null), [detail, loadedContextKey, contextKey]);
  /** Select the stage's track and request the focus of its score input (rendered next). */
  function focusStage(stage: ProjectEvaluation["stages"][number]) {
    setTrack(stage.track);
    setFocusStageId(stage.stageId);
  }
  // Phase 9E — apply the drill seq ONCE, only after THIS selection's detail arrived (`detail` is set solely by the
  // latest request, so a stale student response can never aim the focus at the new student). Read-only profiles have
  // no input to focus; a fully graded project has nothing to focus (the banner says so).
  useEffect(() => {
    if (!focusMode || evaluationFocusSeq === appliedFocusSeq.current || !detail || !detailIsCurrent) return;
    appliedFocusSeq.current = evaluationFocusSeq;                              // consumed ONLY against this selection's own detail
    const stage = firstUngraded(evaluation);
    if (stage && !detail.readOnly) focusStage(stage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluationFocusSeq, detail, detailIsCurrent]);
  // Phase 9F — tell the session owner when the SERVER says this student is fully graded (after load or after a save);
  // reported at most once per selection, never triggers navigation (the teacher moves on by pressing the CTA).
  const completeReported = useRef("");
  useEffect(() => {
    if (!focusMode || !detailIsCurrent || !evaluation || !detail || evaluation.ungradedStages !== 0) return;
    if (completeReported.current === contextKey) return;
    completeReported.current = contextKey;                                     // never from a previous selection's detail
    onEvaluationComplete?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMode, evaluation, detail, detailIsCurrent, contextKey]);
  // The requested input exists only after the track state above has rendered; focus + reveal it then, once.
  useEffect(() => {
    if (!focusStageId || !detail) return;
    const input = listRef.current?.querySelector<HTMLInputElement>('[data-stage-id="' + focusStageId + '"] input[data-stage-score]');
    if (!input) return;
    input.focus();
    input.scrollIntoView?.({ block: "center" });
    setFocusStageId("");
  }, [focusStageId, detail, track]);
  useEffect(() => { if (detailsFor) noteRef.current?.focus(); }, [detailsFor]);

  const name = detail?.student.displayName || studentId;
  const groups = useMemo(() => detail ? (detail.groups || []).filter(g => g.track === track).sort((a, b) => a.order - b.order) : [], [detail, track]);
  const byGroup = useMemo(() => detail ? stagesByGroup(detail.stages.filter(s => s.active !== false), track) : new Map(), [detail, track]);
  const board = useMemo(() => (detail ? boardOf(detail, studentId, name) : null), [detail, studentId, name]);
  const keyOf = (stageId: string) => studentId + "|" + stageId;
  // ---- the save bar's decisions (the matrix's helpers over this one student) ----
  const changes: GridChange[] = useMemo(() => (board ? scoreGridChanges(scoreDrafts, board) : []), [scoreDrafts, board]);
  const statusChanges = useMemo(() => (board ? gridStatusChanges(doneDrafts, changes, board, approveOnSave) : []), [doneDrafts, changes, board, approveOnSave]);
  const invalid = changes.filter(c => c.invalid).length;
  const pendingScores = changes.filter(c => !c.invalid);
  const changedKeys = useMemo(() => new Set([...pendingScores.map(c => c.key), ...statusChanges.map(c => c.key)]), [pendingScores, statusChanges]);
  const pendingCount = changedKeys.size;
  const unsavedNotes = !!detail && Object.entries(noteDrafts).some(([sid, v]) => v !== (detail.progress[sid]?.note || ""));
  const dirty = changes.length > 0 || statusChanges.some(c => !c.implied);
  const unsavedDrafts = dirty || unsavedNotes;

  function discardAll() { setScoreDrafts({}); setDoneDrafts({}); setRowErrors({}); }
  function setDraft(stageId: string, value: string) {
    setScoreDrafts(prev => ({ ...prev, [keyOf(stageId)]: value }));
    setRowErrors(prev => dropKeys(prev, [stageId]));
  }
  const savedScore = (stageId: string): number | null => { const c = board?.students[0].cells[stageId]; return c && typeof c.score === "number" ? c.score : null; };
  const approvedOf = (stageId: string) => board?.students[0].cells[stageId]?.status === "approved";
  /** Flips the row's «منجز» as shown (`done` includes an approval the switch implies for a new score). Back at the saved
   *  state the explicit decision is dropped, unless the switch would then imply the opposite. */
  function toggleDone(stageId: string, done: boolean) {
    const key = keyOf(stageId);
    const saved = approvedOf(stageId);
    const next = !done;
    const implies = approveOnSave && !saved && pendingScores.some(c => c.key === key && c.score !== null);
    setDoneDrafts(prev => (next === saved && !implies ? dropKeys(prev, [key]) : { ...prev, [key]: next }));
    setRowErrors(prev => dropKeys(prev, [stageId]));
  }
  function moveFocus(from: HTMLInputElement, step: 1 | -1) {
    const inputs = Array.from(listRef.current?.querySelectorAll<HTMLInputElement>("input[data-stage-score]") || []);
    const next = inputs[inputs.indexOf(from) + step];
    if (next) { next.focus(); next.select(); }
  }
  function onScoreKey(e: KeyboardEvent<HTMLInputElement>, stageId: string, done: boolean) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") { e.preventDefault(); moveFocus(e.currentTarget, e.shiftKey ? -1 : 1); }           // Enter: the next topic, never a write
    else if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(e.currentTarget, 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(e.currentTarget, -1); }
    else if (e.key === " ") { e.preventDefault(); toggleDone(stageId, done); }                                // a score never holds a space
    else if (e.key === "Escape") {
      e.preventDefault();
      setScoreDrafts(prev => dropKeys(prev, [keyOf(stageId)]));
      setDoneDrafts(prev => dropKeys(prev, [keyOf(stageId)]));
      setRowErrors(prev => dropKeys(prev, [stageId]));
    }
  }
  function clearScore(stageId: string) {
    if (savedScore(stageId) === null) return;
    setDraft(stageId, "");
    setNotice("ستُمسح علامة المرحلة " + stageId + " عند الحفظ. «تجاهل التغييرات» يتراجع عن ذلك.");
  }

  // ---- the save bar: every changed score, then the approvals and the reopenings, then the profile is re-read ----
  async function save() {
    if (!detail || detail.readOnly || saving || savingRef.current || !pendingCount || invalid) return;
    const context = contextRef.current;
    savingRef.current = true; setSaving(true); setError(""); setNotice("");
    const failed: Record<string, string> = {};
    const savedScoreKeys: string[] = [], savedStatusKeys: string[] = [];
    let changed = 0, unchanged = 0, approved = 0, reopened = 0, statusWritten = false;
    try {
      for (let i = 0; i < pendingScores.length; i += CHUNK) {
        const items = pendingScores.slice(i, i + CHUNK).map(c => ({ studentId: c.studentId, stageId: c.stageId, score: c.score, expected: c.expected }));
        const r = await trackerPost<ScoreBulkResponse>(token, projectCode, { action: "score.bulk", classId, items });
        for (const x of r.results) { if (x.ok) savedScoreKeys.push(keyOf(x.stageId)); else failed[x.stageId] = errorText(x); }
        changed += r.totals.changed; unchanged += r.totals.unchanged;
      }
      // Status decisions after the scores; a stage whose score failed keeps its whole change for the retry.
      for (const to of ["approved", "in_progress"] as const) {
        const list = statusChanges.filter(c => c.to === to && !(c.stageId in failed));
        for (let i = 0; i < list.length; i += CHUNK) {
          const items = list.slice(i, i + CHUNK).map(c => ({ studentId: c.studentId, stageId: c.stageId }));
          const r = await trackerPost<StatusBulkResponse>(token, projectCode, { action: "progress.bulk", classId, items, status: to });
          for (const x of r.results) {
            if (x.ok) { savedStatusKeys.push(keyOf(x.stageId)); if (to === "approved") approved++; else reopened++; statusWritten = true; }
            else failed[x.stageId] = errorText(x);
          }
        }
      }
    } catch (e) {
      if (context === contextRef.current) setError(e instanceof Error ? e.message : "تعذر حفظ التغييرات.");
    } finally {
      if (context === contextRef.current) {
        setScoreDrafts(prev => dropKeys(prev, savedScoreKeys));
        setDoneDrafts(prev => dropKeys(prev, savedStatusKeys));
        setRowErrors(failed);
        const failedCount = Object.keys(failed).length;
        if (savedScoreKeys.length || savedStatusKeys.length || failedCount) {
          const parts = [savedScoreKeys.length || !savedStatusKeys.length ? "حُفظت " + changed + " علامة" + (unchanged ? "، ودون تغيير " + unchanged : "") : ""];
          if (approved) parts.push("اعتُمدت " + approved + " مرحلة");
          if (reopened) parts.push("أُعيدت " + reopened + " مرحلة إلى قيد التنفيذ");
          setNotice(parts.filter(Boolean).join("، ") + (failedCount ? "، وتعذر حفظ " + failedCount + " (مُعلَّمة في الجدول)." : "."));
        }
        if (savedScoreKeys.length || savedStatusKeys.length) {
          await load();                                                        // the weighted values, grade, evaluation and history are the server's
          onChanged?.();
          if (statusWritten) onReadyChanged?.();
        }
        savingRef.current = false; setSaving(false);
      }
    }
  }

  // ---- single writes: a note, or a workflow status the toggle does not cover — the canonical progress.update ----
  function writeSingle(stage: ProjectStage, patch: Patch) {
    if (!detail || detail.readOnly) return;
    const keys = patchKinds(patch).map(k => stage.stageId + ":" + k);
    if (keys.some(k => pendingRef.current.has(k))) return;                      // double-submit guard (same operation)
    const context = contextRef.current;
    const submittedNote = patch.note;
    for (const k of keys) pendingRef.current.add(k);
    setPending(prev => ({ ...prev, ...Object.fromEntries(keys.map(k => [k, true as const])) }));
    setRowErrors(prev => dropKeys(prev, [stage.stageId]));
    const run = async () => {
      if (context !== contextRef.current) return;                              // selection changed while queued
      setNotice("");
      try {
        const res = await trackerPost<UpdateResponse>(token, projectCode, mutationBody(classId, studentId, stage.stageId, patch));
        if (context !== contextRef.current) return;                            // stale response for another student
        if (!res.noChange) {
          const { stageId: sid, ...entry } = res.stage;
          setDetail(prev => prev ? { ...prev, summary: res.summary, performance: res.performance ?? prev.performance, evaluation: res.evaluation ?? prev.evaluation, progress: { ...prev.progress, [sid]: entry }, nextStages: res.nextStages ?? prev.nextStages, balance: res.balance === undefined ? prev.balance : res.balance, history: res.history } : prev);
          onChanged?.();
          if (patch.status !== undefined) onReadyChanged?.();
        }
        // A note draft is dropped ONLY if it still equals the value this request submitted; a newer edit stays unsaved work.
        if (patch.note !== undefined) setNoteDrafts(prev => (prev[stage.stageId] === undefined || prev[stage.stageId] !== submittedNote ? prev : dropKeys(prev, [stage.stageId])));
        setNotice(patch.note !== undefined ? "تم حفظ الملاحظة." : "تم تحديث حالة المرحلة.");
      } catch (e) {
        if (context !== contextRef.current) return;
        // The typed draft is kept (never erased on failure) and the error stays attached to this stage's row.
        setRowErrors(prev => ({ ...prev, [stage.stageId]: e instanceof Error ? e.message : "تعذر حفظ التغيير." }));
      } finally {
        if (context === contextRef.current) {
          for (const k of keys) pendingRef.current.delete(k);
          setPending(prev => { const next = { ...prev }; for (const k of keys) delete next[k]; return next; });
        }
      }
    };
    // Serialized: each write starts after the previous one settled (responses therefore apply in order).
    queue.current = queue.current.then(run, run);
  }
  /** Phase G3 — «سجلّ التغييرات»: every stored event of the stage, read from the server when the dialog opens (never cached:
   *  a save since the last opening shows). A response for another stage or selection is dropped. */
  async function openHistory(stageId: string) {
    const seq = ++historySeq.current, context = contextRef.current;
    setHistory({ stageId, loading: true, error: "", events: [] });
    try {
      const r = await trackerGet<{ events: StageHistoryEvent[] }>(token, projectCode, "stage-history", { classId, studentId, stageId });
      if (seq !== historySeq.current || context !== contextRef.current) return;
      setHistory({ stageId, loading: false, error: "", events: Array.isArray(r.events) ? r.events : [] });
    } catch (e) {
      if (seq !== historySeq.current || context !== contextRef.current) return;
      setHistory({ stageId, loading: false, error: e instanceof Error ? e.message : "تعذر تحميل سجلّ التغييرات.", events: [] });
    }
  }
  function closeHistory() { historySeq.current++; setHistory(null); }
  function toggleApproveOnSave(on: boolean) {
    setApproveOnSave(on);
    writeApproveOnSave(on);
  }

  // Phase P4 — moving to another student (or another track's view is unaffected) drops this profile's drafts, so unsaved
  // scores, decisions or notes are confirmed first.
  const { confirm, confirmDialog } = useConfirm();
  function goToSibling(target: SiblingRef) {
    if (!unsavedDrafts) { onOpenSibling?.(target.studentId); return; }
    void confirm({ title: "تغييرات لم تُحفظ", message: "في ملف هذا الطالب " + (pendingCount || "") + (pendingCount ? " تغيير" : "ملاحظة") + " لم يُحفظ بعد. هل تريد تجاهله والانتقال إلى " + target.displayName + "؟", confirmLabel: "تجاهل والانتقال", cancelLabel: "البقاء هنا", tone: "danger" })
      .then(ok => { if (ok) onOpenSibling?.(target.studentId); });
  }
  const siblingNav = siblings && onOpenSibling && (siblings.previous || siblings.next) ? (
    <nav className="eb-student-sibling-nav" aria-label="التنقل بين الطلاب">
      <button type="button" className="eb-button is-quiet is-small" disabled={!siblings.previous} onClick={() => siblings.previous && goToSibling(siblings.previous)} aria-label={siblings.previous ? "الطالب السابق: " + siblings.previous.displayName : "لا يوجد طالب سابق"}>الطالب السابق</button>
      <span className="eb-muted">{siblings.position} من {siblings.total}</span>
      <button type="button" className="eb-button is-small" disabled={!siblings.next} onClick={() => siblings.next && goToSibling(siblings.next)} aria-label={siblings.next ? "الطالب التالي: " + siblings.next.displayName : "لا يوجد طالب تالٍ"}>الطالب التالي</button>
    </nav>
  ) : null;
  const backButton = <IconButton label="عودة إلى تقدّم الطلاب" icon={<IconChevronBack size={18} className="eb-flip-rtl" />} onClick={onBack} />;
  // ONE stable head (back + h2) across loading / error / loaded states so the focused heading never remounts.
  const head = (
    <div className="eb-student-profile-head">
      {backButton}
      <div className="eb-student-profile-heading">
        <h2 id="eb-student-profile-title" className="eb-subheading" ref={headingRef} tabIndex={-1}>{detail ? "ملف المشروع: " + name : "ملف المشروع"}</h2>
        {detail && <p className="eb-muted">{detail.student.code ? "الكود " + detail.student.code + " · " : ""}آخر تحديث: {fmtDate(detail.summary.updatedAt)}</p>}
      </div>
      {detail?.readOnly && <StatusBadge tone="warn">مؤرشف — للقراءة فقط</StatusBadge>}
      {siblingNav}
      {confirmDialog}
    </div>
  );

  if (!detail || !board) {
    return <section className="eb-student-profile" aria-labelledby="eb-student-profile-title">
      {head}
      {loading && <p className="eb-muted" role="status">جارٍ تحميل ملف الطالب...</p>}
      {!loading && error && <div className="platform-error assignment-inline-message" role="alert">{error} <button type="button" className="eb-button is-small" onClick={() => void load()}>إعادة المحاولة</button></div>}
    </section>;
  }

  const s = detail.summary;
  const perf = normalizeProjectPerformance(detail.performance);
  const timeline = [...detail.history].reverse().slice(0, 20);
  const readOnly = detail.readOnly;
  const detailsStage = detailsFor ? detail.stages.find(st => st.stageId === detailsFor) ?? null : null;
  const detailsEntry = detailsStage ? detail.progress[detailsStage.stageId] : undefined;
  const detailsValue = detailsStage && perf ? stageValueOf(perf, detailsStage.stageId) : null;
  const detailsNote = detailsStage ? (noteDrafts[detailsStage.stageId] ?? (detailsEntry?.note || "")) : "";
  const detailsNoteBusy = !!detailsStage && !!pending[detailsStage.stageId + ":note"];
  const historyStage = history ? detail.stages.find(st => st.stageId === history.stageId) ?? null : null;

  return (
    <section className="eb-student-profile" aria-labelledby="eb-student-profile-title">
      {head}
      {error && <div className="platform-error assignment-inline-message" role="alert">{error}</div>}
      {notice && <div className="platform-notice assignment-inline-message" role="status" aria-live="polite">{notice}</div>}

      {perf && <ProjectRankHero title={detail.student.displayName || name} performance={perf} compact />}
      <div className="eb-student-profile-summary">
        <ProgressBar label="التقدم العام" value={s.overallProgress} tone="primary" />
        <div className="eb-project-track-bars">
          {tracks.map((t, i) => <ProgressBar key={t.trackId} label={t.title} value={s.trackProgress[t.trackId] || 0} tone={toneForTrack(i)} size="sm" />)}
        </div>
        <p className="eb-student-profile-counts">
          {STAGE_STATUS_ORDER.slice().reverse().map(st => <StatusBadge key={st} tone={STAGE_STATUS_TONE[st]}>{stageStatusLabel(st)} {s.counts[st]}</StatusBadge>)}
        </p>
        {detail.balance && (
          <p className="platform-warning assignment-inline-message" role="status">{detail.balance.leadingTrackTitle} متقدّم على {detail.balance.laggingTrackTitle} بـ {detail.balance.diff}%</p>
        )}
        <p className="eb-student-profile-next">
          <span className="eb-muted">الخطوة التالية:</span>
          {tracks.map(t => {
            const n = detail.nextStages[t.trackId];
            return <StatusBadge key={t.trackId} tone={n ? "info" : "success"}>{t.title}: {n ? n.stageId + " — " + n.title : "مكتمل"}</StatusBadge>;
          })}
        </p>
      </div>

      {evaluation && <ProjectEvaluationCard id="eb-student-profile-eval" variant="teacher" evaluation={evaluation} />}

      {focusMode && evaluation && (
        // Phase 9E — Evaluation Focus Mode banner: the LATEST evaluation (updated by every save), never the one from the
        // moment the profile opened. The next-stage action re-aims at the first stage still ungraded now.
        <div className={"eb-eval-focus" + (evaluation.ungradedStages === 0 ? " is-complete" : "")} role="status" data-ungraded={evaluation.ungradedStages} data-queue-position={evaluationQueue ? evaluationQueue.position : undefined}>
          {evaluation.ungradedStages === 0
            ? <span className="eb-eval-focus-text">{evaluationQueue ? (evaluationQueue.next ? "اكتمل تقييم هذا الطالب — انتقل إلى الطالب التالي." : "اكتمل تقييم هذا الطالب — لا يوجد طالب آخر في قائمة التقييم.") : "اكتمل تقييم جميع مراحل المشروع لهذا الطالب."}</span>
            : <>
              <span className="eb-eval-focus-text">وضع التقييم — {evaluationQueue ? "الطالب " + evaluationQueue.position + " من " + evaluationQueue.total + " — " : ""}{remainingText(evaluation.ungradedStages)}</span>
              {!readOnly && <button type="button" className="eb-button is-small eb-eval-focus-next" onClick={() => { const next = firstUngraded(evaluation); if (next) focusStage(next); }}>المرحلة التالية غير المقيّمة</button>}
            </>}
          {evaluationQueue && (
            // 9F — queue navigation (never automatic): the nearest not-yet-completed neighbours; omitted at the ends.
            <span className="eb-eval-queue-nav" role="group" aria-label="التنقل في قائمة التقييم">
              {evaluationQueue.previous && <button type="button" className="eb-button is-quiet is-small eb-eval-queue-prev" aria-label={"الطالب السابق في قائمة التقييم: " + evaluationQueue.previous.displayName} onClick={() => onEvaluationQueueMove?.(-1)}>الطالب السابق</button>}
              {evaluationQueue.next && <button type="button" className={"eb-button is-small eb-eval-queue-next" + (evaluation.ungradedStages === 0 ? " is-primary" : " is-quiet")} aria-label={"الطالب التالي في قائمة التقييم: " + evaluationQueue.next.displayName} onClick={() => onEvaluationQueueMove?.(1)}>{evaluation.ungradedStages === 0 ? "انتقل إلى الطالب التالي: " + evaluationQueue.next.displayName : "الطالب التالي"}</button>}
              {evaluationQueue.next === null && !evaluationQueue.isTerminalItem && evaluationQueue.terminalCompleted && (
                // 9G review — the completed terminal item is skipped by next/previous, so it needs its own way back.
                <button type="button" className={"eb-button is-small eb-eval-queue-terminal" + (evaluation.ungradedStages === 0 ? " is-primary" : " is-quiet")} aria-label={"العودة إلى آخر طالب في الجلسة: " + evaluationQueue.terminal.displayName} onClick={() => onEvaluationQueueReturnToTerminal?.()}>العودة إلى آخر طالب في الجلسة</button>
              )}
            </span>
          )}
        </div>
      )}
      {focusMode && evaluation && evaluationQueue && evaluationQueue.isTerminalItem && evaluationQueue.currentCompleted && evaluation.ungradedStages === 0 && (
        // Phase 9G — the end of the session: derived (focus mode + THIS item is the queue's TERMINAL item by index —
        // never `next === null`, which only means the completed items after us were skipped — + the session has
        // recorded this item as completed + the server says it is fully graded), never stored, never automatic,
        // reversible until the return button is pressed («الطالب السابق» above still works and hides this panel).
        // `currentCompleted` also keeps the counts honest: right after the last save the panel waits for App to
        // record the completion, so it never flashes the previous total. No autofocus here.
        <section className="eb-eval-finish" role="status" aria-labelledby="eb-eval-finish-title" data-completed={evaluationQueue.summary.completed} data-total={evaluationQueue.summary.total} data-remaining={evaluationQueue.summary.remaining}>
          <h3 id="eb-eval-finish-title" className="eb-eval-finish-title">اكتملت جلسة تقييم المشاريع.</h3>
          <p className="eb-eval-finish-text">{sessionDoneText(evaluationQueue.summary.completed, evaluationQueue.summary.total)}</p>
          <p className="eb-eval-finish-text">{sessionRemainingText(evaluationQueue.summary.remaining)}</p>
          <button type="button" className="eb-button is-primary eb-eval-finish-return" aria-label="إنهاء جلسة التقييم والعودة إلى لوحة اليوم" onClick={() => onEvaluationQueueFinish?.()}>العودة إلى لوحة اليوم</button>
        </section>
      )}

      <div className="eb-segmented eb-student-profile-tracks" role="group" aria-label="مسارات المشروع">
        {tracks.map(t => <button key={t.trackId} type="button" aria-pressed={track === t.trackId} onClick={() => setTrack(t.trackId)}>{t.title}</button>)}
      </div>

      {!readOnly && (
        <div className="eb-stage-grade-bar">
          <label className="eb-stage-approve-toggle">
            <input type="checkbox" role="switch" checked={approveOnSave} disabled={saving} onChange={e => toggleApproveOnSave(e.target.checked)} />
            اعتماد المرحلة عند حفظ العلامة
          </label>
          <p className="eb-muted eb-stage-grade-hint">{approveOnSave
            ? "اكتب العلامة واضغط Enter للموضوع التالي، والمسافة لتحديد الموضوع منجزًا؛ ثم «حفظ التغييرات» مرة واحدة: تُحفظ العلامات وتُعتمد مراحلها معًا."
            : "اكتب العلامة واضغط Enter للموضوع التالي، والمسافة لتحديد الموضوع منجزًا؛ ثم «حفظ التغييرات» مرة واحدة. العلامة وحدها لا تغيّر الحالة."}</p>
        </div>
      )}
      {!readOnly && (
        <div className="eb-bulk-bar eb-bulk-review-bar eb-stage-save-bar" role="region" aria-label="حفظ تغييرات الطالب">
          <span className="eb-bulk-summary" role="status">{pendingCount || invalid ? pendingCount + " تغيير جاهز للحفظ" + (invalid ? " · " + invalid + " غير صحيحة" : "") : "لا توجد تغييرات"}</span>
          <div className="eb-bulk-group">
            <button type="button" className="eb-button is-primary is-small" disabled={saving || !pendingCount || invalid > 0} onClick={() => void save()}>{saving ? SAVE_LABELS.saving : SAVE_LABELS.saveChanges + (pendingCount ? " (" + pendingCount + ")" : "")}</button>
            <button type="button" className="eb-button is-quiet is-small" disabled={saving || !dirty} onClick={() => { discardAll(); setNotice(""); }}>تجاهل التغييرات</button>
          </div>
          {invalid > 0 && <p className="eb-stage-row-error" role="alert">صحّح {invalid === 1 ? "علامة واحدة" : invalid + " علامات"}: العلامة رقم من 0 إلى 100.</p>}
        </div>
      )}

      <div className="eb-stage-table-wrap" ref={listRef}>
        {!groups.length ? <EmptyState compact title="لا توجد مراحل في هذا المسار." /> : (
          <table className="eb-stage-table">
            <caption className="eb-visually-hidden">مراحل المسار لهذا الطالب: الإنجاز، والعلامة من 100، والقيمة الموزونة كما يحسبها الخادم، والحالة</caption>
            <thead>
              <tr>
                <th scope="col" className="eb-stage-col-stage">الموضوع</th>
                <th scope="col" className="eb-stage-col-done">منجز؟</th>
                <th scope="col" className="eb-stage-col-score">العلامة من 100</th>
                <th scope="col" className="eb-stage-col-value">الموزونة</th>
                <th scope="col" className="eb-stage-col-status">الحالة</th>
                <th scope="col" className="eb-stage-col-actions"><span className="eb-visually-hidden">إجراءات</span></th>
              </tr>
            </thead>
            {groups.map(g => {
              const stages = (byGroup.get(g.groupId) || []) as ProjectStage[];
              const approvedInGroup = stages.filter(st => approvedOf(st.stageId)).length;
              return (
                <tbody key={g.groupId} className="eb-stage-group" data-group-id={g.groupId}>
                  <tr className="eb-stage-group-row">
                    <th scope="rowgroup" colSpan={6}><span className="eb-stage-group-title">{g.title}</span> <small className="eb-muted">{approvedInGroup}/{stages.length} منجزة</small></th>
                  </tr>
                  {stages.map(stage => {
                    const key = keyOf(stage.stageId);
                    const entry = detail.progress[stage.stageId];
                    const cell = board.students[0].cells[stage.stageId];
                    const status = normalizeStageStatus(entry?.status);
                    const selfReported = !!cell?.selfReported;                   // P2: marked by the student, not confirmed yet
                    const saved = savedScore(stage.stageId);
                    const draft = scoreDrafts[key];
                    const value = draft ?? (saved === null ? "" : String(saved));
                    const parsed = draft === undefined ? null : parseGridScore(draft);
                    const isInvalid = !!parsed && parsed.kind === "invalid";
                    const isChanged = changedKeys.has(key);
                    const rowError = rowErrors[stage.stageId];
                    const statusChange = statusChanges.find(x => x.key === key);
                    const done = statusChange ? statusChange.to === "approved" : status === "approved";
                    const statusBusy = !!pending[stage.stageId + ":status"];
                    const stageValue = perf ? stageValueOf(perf, stage.stageId) : null;
                    const label = stage.stageId + " — " + stage.title;
                    const evaluationPending = focusMode && !!evaluation && evaluation.stages.some(es => es.stageId === stage.stageId && !es.graded);
                    return (
                      <tr key={stage.stageId} className={"eb-stage-row " + STAGE_STATUS_CLASS[status] + (selfReported ? " is-self" : "") + (isChanged ? " is-changed" : "") + (isInvalid || rowError ? " is-invalid" : "") + (statusBusy ? " is-busy" : "") + (evaluationPending ? " is-evaluation-pending" : "")} data-stage-id={stage.stageId} aria-busy={statusBusy || undefined}>
                        <th scope="row" className="eb-stage-cell-stage">
                          <span className="eb-stage-code">{stage.stageId}</span>
                          <span className="eb-stage-title">{stage.title}{stage.required === false ? <em className="eb-stage-optional"> (اختياري)</em> : null}</span>
                          {entry?.note ? <small className="eb-stage-note-flag">ملاحظة</small> : null}
                          <small className="eb-muted eb-stage-date">{fmtDate(entry?.updatedAt || "")}</small>
                          {rowError && <p className="eb-stage-row-error" role="alert">{stage.stageId}: {rowError}</p>}
                        </th>
                        <td className="eb-stage-cell-done">
                          {readOnly
                            ? (status === "approved" ? <IconCheck size={16} aria-label="منجز" /> : <span className="eb-muted" aria-label="غير منجز">—</span>)
                            : <button type="button" className={"eb-score-done" + (done ? " is-on" : "")} aria-pressed={done} disabled={saving}
                              aria-label={stage.stageId + ": منجز"} title={done ? "منجز (اضغط لإعادتها إلى قيد التنفيذ)" : "تحديد المرحلة منجزة"}
                              onClick={() => toggleDone(stage.stageId, done)}><IconCheck size={14} aria-hidden="true" /></button>}
                        </td>
                        <td className="eb-stage-cell-score">
                          {readOnly ? (
                            <span className="eb-stage-score-text" dir="ltr">{saved === null ? "—" : fmtContribution(saved)} / 100</span>
                          ) : (
                            <input type="text" inputMode="decimal" dir="ltr" autoComplete="off" className="eb-stage-score-input" data-stage-score=""
                              value={value} disabled={saving}
                              aria-label={"علامة المرحلة " + label + " من 100"} placeholder="0–100" aria-invalid={isInvalid || !!rowError || undefined}
                              onFocus={e => e.currentTarget.select()}
                              onChange={e => setDraft(stage.stageId, e.target.value)}
                              onKeyDown={e => onScoreKey(e, stage.stageId, done)} />
                          )}
                        </td>
                        <td className="eb-stage-cell-value">
                          {stageValue
                            ? <span dir="ltr" title="القيمة في المشروع">{fmtContribution(stageValue.contribution)}/{fmtContribution(stageValue.maxContribution)}</span>
                            : <span className="eb-muted">—</span>}
                          {stageValue && !stageValue.counted && saved !== null && <small className="eb-muted">عند الاعتماد</small>}
                        </td>
                        <td className="eb-stage-cell-status"><StatusBadge tone={STAGE_STATUS_TONE[status]}>{stageStatusLabel(status)}</StatusBadge>{selfReported && <StatusBadge tone="warn">حدّدها الطالب</StatusBadge>}</td>
                        <td className="eb-stage-cell-actions">
                          <ActionMenu label={"إجراءات المرحلة " + stage.stageId} disabled={saving || statusBusy}>
                            <button type="button" className="eb-menu-item" onClick={() => setDetailsFor(stage.stageId)}>{readOnly ? "التفاصيل" : "التفاصيل والملاحظة"}</button>
                            <button type="button" className="eb-menu-item" onClick={() => void openHistory(stage.stageId)}>سجلّ التغييرات</button>
                            {!readOnly && <button type="button" className="eb-menu-item" disabled={saved === null} onClick={() => clearScore(stage.stageId)}>مسح العلامة</button>}
                            {!readOnly && MENU_STATUSES.map(st => (
                              <button key={st} type="button" className="eb-menu-item" disabled={statusBusy || status === st} onClick={() => writeSingle(stage, { status: st })}>{stageStatusLabel(st)}</button>
                            ))}
                          </ActionMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        )}
      </div>
      <p className="eb-score-grid-legend eb-muted" aria-hidden="true">
        <span className="eb-score-legend is-approved">منجزة (معتمدة)</span>
        <span className="eb-score-legend is-ready">بانتظار الاعتماد</span>
        <span className="eb-score-legend is-self">حدّدها الطالب</span>
        <span className="eb-score-legend is-changed">تغيير غير محفوظ</span>
        <span className="eb-score-legend is-invalid">غير صحيحة</span>
      </p>

      <Dialog open={!!detailsStage} title={detailsStage ? "المرحلة " + detailsStage.stageId + " — " + detailsStage.title : ""} onClose={() => setDetailsFor("")} size="md" initialFocusRef={readOnly ? undefined : noteRef}>
        {detailsStage && (
          <div id={"eb-stage-" + detailsStage.stageId} className="eb-stage-detail">
            {detailsStage.description ? <p className="eb-muted">{detailsStage.description}</p> : null}
            {perf && (
              <p className="eb-stage-score">
                <span>العلامة: <strong dir="ltr">{fmtStageScore(detailsEntry)}</strong></span>
                {detailsValue && <span>القيمة في المشروع: <strong dir="ltr">{fmtContribution(detailsValue.contribution)} / {fmtContribution(detailsValue.maxContribution)}</strong></span>}
                {detailsValue && !detailsValue.counted && typeof detailsEntry?.score === "number" && <small className="eb-muted">تُحتسب عند اعتماد المرحلة</small>}
              </p>
            )}
            {readOnly ? (
              detailsEntry?.note ? <p className="eb-stage-note-view">ملاحظة المعلم: {detailsEntry.note}</p> : <small className="eb-muted">لا توجد ملاحظة.</small>
            ) : (
              <>
                <label className="eb-field eb-stage-note-edit">ملاحظة المعلم
                  <textarea ref={noteRef} value={detailsNote} onChange={e => { const v = e.target.value; setNoteDrafts(prev => ({ ...prev, [detailsStage.stageId]: v })); }} placeholder="اكتب ملاحظة للطالب..." rows={3} />
                </label>
                <div className="eb-stage-note-actions">
                  <button type="button" className="eb-button is-small" disabled={detailsNoteBusy || detailsNote === (detailsEntry?.note || "")} onClick={() => writeSingle(detailsStage, { note: detailsNote })}>{detailsNoteBusy ? SAVE_LABELS.saving : "حفظ الملاحظة"}</button>
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>

      <Dialog open={!!history} title={historyStage ? "سجلّ تغييرات المرحلة " + historyStage.stageId + " — " + historyStage.title : "سجلّ التغييرات"} onClose={closeHistory} size="md">
        {history && (
          <div className="eb-stage-history" data-stage-id={history.stageId}>
            {history.loading && <p className="eb-muted" role="status">جارٍ تحميل سجلّ التغييرات...</p>}
            {!history.loading && history.error && <div className="platform-error assignment-inline-message" role="alert">{history.error} <button type="button" className="eb-button is-small" onClick={() => void openHistory(history.stageId)}>إعادة المحاولة</button></div>}
            {!history.loading && !history.error && (history.events.length ? (
              <ol className="eb-timeline eb-stage-history-list" aria-label="التغييرات من الأحدث إلى الأقدم">
                {history.events.map(ev => (
                  <li key={ev.eventId}>
                    <span className="eb-timeline-text">{stageHistoryText(ev)}</span>
                    <small className="eb-muted eb-stage-history-meta"><span className="eb-timeline-date">{fmtDateTime(ev.createdAt)}</span> · <span className="eb-stage-history-by">{BY_LABEL[ev.by] || BY_LABEL.teacher}</span></small>
                  </li>
                ))}
              </ol>
            ) : <EmptyState compact title="لا توجد تغييرات مسجّلة لهذه المرحلة." />)}
          </div>
        )}
      </Dialog>

      <section className="eb-stage-timeline" aria-labelledby="eb-stage-timeline-title">
        <h3 id="eb-stage-timeline-title" className="eb-subheading">أحدث الأحداث</h3>
        {timeline.length ? (
          <ol className="eb-timeline">
            {timeline.map(ev => (
              <li key={ev.eventId}>
                <span className="eb-timeline-date">{fmtDate(ev.createdAt)}</span>
                <span className="eb-timeline-text">{ev.type === "status" && ev.toStatus ? (ev.source === "student" ? (ev.toStatus === "approved" ? "حدّدها الطالب كمنفّذة" : "تراجع الطالب عن التحديد") : ev.verified ? "تأكيد المعلم" : stageStatusLabel(ev.toStatus)) + " — " + ev.stageId : ev.type === "score" ? (typeof ev.toScore === "number" ? "علامة " + fmtContribution(ev.toScore) + " / 100 — " + ev.stageId : "مسح العلامة — " + ev.stageId) : "ملاحظة — " + ev.stageId}</span>
              </li>
            ))}
          </ol>
        ) : <EmptyState compact title="لا توجد أحداث بعد." />}
      </section>
    </section>
  );
}
