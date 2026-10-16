// Phase 21G.1 — the assignments workspace controller, extracted unchanged from AssignmentsPanel (which now only renders): the list
// and its master scope, the composer's create, every assignment action (status, attempts, details, timing, archive, restore, purge),
// the detail (one authoritative results read per open, sequenced), the gradebook view and the per-student row actions, the item
// analysis, the coding bulk retry, the Phase 12B drill-in and the focus discipline of the non-modal areas. Every request goes
// through the ONE helper (assignmentsApi); every mutation is reconciled from the server's answer, never guessed.
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { examHasQuestions } from "../examTypes";
import { normalizeClassStatus } from "../classLifecycle";
import { useConfirm } from "../ui/useConfirm";
import { windowBlocks, assignmentWindowIssues } from "./assignmentWindow";
import { bulkRetryNotice } from "./codingRecovery";
import { assignmentsApi, toLocalInput } from "./assignmentsApi";
import { matchesMasterScope, normalizeQuery, gradebookRows, rowGrading, sortAnalysisQuestions, summarizeAnalysis, drillViewFor, type MasterScope } from "./assignmentsView";
import { homeKpis, timeFilterCounts, type TimeFilter } from "./assignmentsHome";
import { studentsCount, type PageTab } from "./assignmentPage";
import { copiesCount } from "./assignmentWizard";
import { useAssignmentComposer } from "./useAssignmentComposer";
import { reviewNav, type ReviewTarget } from "./reviewNav";
import { normalizeResultsRelease, type ResultsRelease } from "./resultsRelease";
import type { AssignmentDrill } from "./drillTarget";
import type { AssignmentProgress, CodingEvidenceTotals, CodingGradingStatus, Classroom, Item, Impact, Exam, StudentResult, LifecycleSnap, Stats, GradebookFilter, GradebookSort, ItemAnalysis, AnalysisSort, WorkspaceMode } from "./types";

export type AssignmentsControllerProps = {
  token: string;
  classes: Classroom[];
  currentExam: unknown | null;
  onCopyLibraryExamToBuilder?: (examSnapshot: Exam, title: string) => void;
  drill?: AssignmentDrill | null;
  onDrillConsumed?: (seq: number) => void;
};

/** The DOM anchors the controller moves focus to. The view owns them (it renders the elements) and hands them in, so the controller's
 *  result holds no refs and the view never reads one during render. */
export type AssignmentsWorkspaceRefs = {
  toolbarRef: RefObject<HTMLDivElement | null>;
  composerHeadingRef: RefObject<HTMLHeadingElement | null>;
  detailHeadingRef: RefObject<HTMLHeadingElement | null>;
};

export function useAssignmentsController({ token, classes, currentExam, onCopyLibraryExamToBuilder, drill = null, onDrillConsumed }: AssignmentsControllerProps, { toolbarRef, composerHeadingRef, detailHeadingRef }: AssignmentsWorkspaceRefs) {
  const current = currentExam && typeof currentExam === "object" ? currentExam as Exam : null;
  const api = assignmentsApi(token);
  const [items, setItems] = useState<Item[]>([]), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [resultsFor, setResultsFor] = useState<Item | null>(null), [results, setResults] = useState<StudentResult[]>([]), [stats, setStats] = useState<Stats | null>(null), [review, setReview] = useState<{ studentId: string; attemptNumber: number } | null>(null);
  const [detailsFor, setDetailsFor] = useState<Item | null>(null);
  const [deadlineFor, setDeadlineFor] = useState<string | null>(null), [deadlineValue, setDeadlineValue] = useState("");
  const [reopenFor, setReopenFor] = useState<string | null>(null), [reopenValue, setReopenValue] = useState("");
  const [extendFor, setExtendFor] = useState<string | null>(null), [extendValue, setExtendValue] = useState("");
  const [showArchived, setShowArchived] = useState(false), [purgeFor, setPurgeFor] = useState<Item | null>(null), [purgeTitle, setPurgeTitle] = useState("");
  // Phase 21G.3 — the assignment page's section (the gradebook by default; every newly opened assignment starts there).
  const [pageTab, setPageTabState] = useState<PageTab>("students"), pageTabRef = useRef<PageTab>("students");
  const setPageTab = (t: PageTab) => { pageTabRef.current = t; setPageTabState(t); };
  const [analysis, setAnalysis] = useState<ItemAnalysis | null>(null), [analysisBusy, setAnalysisBusy] = useState(false), [analysisSort, setAnalysisSort] = useState<AnalysisSort>("number");
  const [codingSummary, setCodingSummary] = useState<CodingGradingStatus | null>(null), [codingTotals, setCodingTotals] = useState<CodingEvidenceTotals | null>(null);
  // Roadmap #13 — gradebook search / filter / sort (client-side over the already-loaded results; no request per keystroke).
  const [gbSearch, setGbSearch] = useState(""), [gbFilter, setGbFilter] = useState<GradebookFilter>("all"), [gbSort, setGbSort] = useState<GradebookSort>("name");
  // Phase 21G.4 — the gradebook's row selection for the bulk actions. Cleared whenever the visible rows change meaning (another
  // assignment, a search, a filter), so a bulk action only ever reaches rows the teacher can see ticked.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set()), [bulkDeadlineOpen, setBulkDeadlineOpen] = useState(false), [bulkDeadlineValue, setBulkDeadlineValue] = useState("");
  const clearSelection = () => setSelected(new Set());
  // A bulk run belongs to the assignment it started on: leaving or switching the page stops it (bulkRun) and releases the busy state
  // the run holds (bulkBusy) — never a busy state owned by another request.
  const bulkRun = useRef(0), bulkBusy = useRef(false);
  const stopBulk = () => { bulkRun.current += 1; if (bulkBusy.current) { bulkBusy.current = false; setBusy(false); } };
  // UX-5 workspace state: list filter (separate from the composer's target class), search, mode, explicit attempts / timing editors.
  // Phase 21G.2 — the home: every class by default (the teacher narrows it), a time filter, the server progress (null = not
  // loaded / unavailable: the figures that need it are shown as unknown, never as zero), and a minute clock for the time chips.
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all"), [progress, setProgress] = useState<Map<string, AssignmentProgress> | null>(null), [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const [filterClassId, setFilterClassId] = useState(""), [search, setSearch] = useState(""), [mode, setMode] = useState<WorkspaceMode>("list"), [attemptsFor, setAttemptsFor] = useState<Item | null>(null), [timingFor, setTimingFor] = useState<Item | null>(null);
  const openerFocusPending = useRef<HTMLElement | null>(null);
  const detailOpenerRef = useRef<HTMLElement | null>(null), composerOpenerRef = useRef<HTMLElement | null>(null), focusDetailPending = useRef(false), focusComposerOpenerPending = useRef(false), focusWorkspacePending = useRef(false);
  const scopeRef = useRef<MasterScope>({ classId: "", showArchived: false, q: "" });
  // Phase 12B — drill-in bookkeeping. listReady: the assignment list has been read successfully at least once (a drill is never judged
  // against the empty pre-load list). appliedDrillSeq: the newest drill this mount has consumed (never re-applied). resultsSeq: the
  // newest results read; an older response that resolves later is discarded, so the newest intent always wins. drillFocus: the student
  // row a drill asked for, shown only while its assignment is open.
  const [listReady, setListReady] = useState(false);
  const appliedDrillSeq = useRef(0), resultsSeq = useRef(0);
  // resultsBusy: the workspace's `busy` is currently held by a results read (so superseding that read may release it — never a busy
  // state owned by an unrelated mutation).
  const resultsBusy = useRef(false);
  const [drillFocus, setDrillFocus] = useState<{ assignmentId: string; studentId: string } | null>(null);
  const { confirm, cancelPending, confirmDialog } = useConfirm();
  // Roadmap #34: a class is offered as an assignment target only through the canonical lifecycle helper (status "archived" OR
  // active:false ⇒ archived), never the raw compatibility `active` flag.
  const active = useMemo(() => classes.filter(x => normalizeClassStatus(x) === "active"), [classes]);
  const composer = useAssignmentComposer({ api, current, active, onCopyLibraryExamToBuilder, setError, setNotice });
  // Phase 21G.2 — the list scope covers every class until the teacher picks one ("" = all classes).
  const effectiveFilter = filterClassId;

  async function load() { setLoading(true); try { const r = await api<{ assignments: Item[] }>("/api/assignments"); setItems(r.assignments || []); setListReady(true); setNow(Date.now()); } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل الواجبات."); } finally { setLoading(false); } }
  // Phase 21G.2 — progress is secondary: a failed read leaves the list working and the progress figures «غير متاح».
  async function loadProgress() { try { const r = await api<{ progress: AssignmentProgress[] }>("/api/assignment-progress"); setProgress(new Map((Array.isArray(r.progress) ? r.progress : []).map(p => [p.assignmentId, p]))); } catch { setProgress(null); } }
  useEffect(() => { void load(); void loadProgress(); void composer.source.loadSavedExams(); }, []);
  function refresh() { void load(); void loadProgress(); void composer.source.loadSavedExams(); }

  // ── Workspace modes: composer (non-modal, in the detail area) and detail (non-modal). Focus moves to the area's heading when it
  // appears and returns to the opening control when it closes.
  function openComposer() {
    const el = typeof document !== "undefined" ? document.activeElement : null;
    composerOpenerRef.current = el instanceof HTMLElement ? el : null;
    setError(""); setNotice(""); setMode("composer");
    // 21G.6 — a wizard opened after every chosen class got its copy starts on the first class again (on opening, never behind the
    // teacher's back while the wizard is open).
    if (!composer.fields.classIds.length && active[0]) composer.fields.setClassIds([active[0].classId]);
  }
  function closeComposer() {
    // The opener is disabled while the composer is open, so focus is returned after the mode flips (effect below).
    focusComposerOpenerPending.current = true; setMode("list");
  }
  useEffect(() => {
    if (mode === "composer") { composerHeadingRef.current?.focus(); return; }
    if (focusComposerOpenerPending.current) {
      focusComposerOpenerPending.current = false;
      const el = composerOpenerRef.current; composerOpenerRef.current = null;
      if (el && el.isConnected) el.focus();
    }
  }, [mode, composerHeadingRef]);
  useEffect(() => { if (mode === "list" && resultsFor && focusDetailPending.current) { focusDetailPending.current = false; detailHeadingRef.current?.focus(); } }, [mode, resultsFor, detailHeadingRef]);

  // Phase 21G.6 (D4) — one copy of the assignment per chosen class: the SAME create request as before, once per class, one after the
  // other. Every class is reported; a class that failed stays chosen (a class that succeeded is removed from the selection, so a
  // retry can never create a second copy there) and the wizard stays open on its review step.
  async function create() {
    const f = composer.fields, sourceExam = composer.source.sourceExam, ids = [...f.classIds];
    if (busy || !ids.length || !f.title.trim() || !sourceExam || !examHasQuestions(sourceExam) || windowBlocks(assignmentWindowIssues(f.openAt, f.dueAt))) return;
    const nameOf = (id: string) => active.find(c => c.classId === id)?.name || id;
    const body = (classId: string) => JSON.stringify({ action: "create", classId, title: f.title.trim(), instructions: f.instructions.trim(), openAt: f.openAt ? new Date(f.openAt).toISOString() : "", dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : "", maxAttempts: f.maxAttempts, durationMinutes: f.durationMinutes, attemptPolicy: f.attemptPolicy, resultsRelease: f.resultsRelease, publish: f.publish, examSnapshot: sourceExam });
    setBusy(true); setError(""); setNotice("");
    const created: Item[] = [], failed: { id: string; error: string }[] = [];
    try {
      for (const id of ids) {
        try { const r = await api<{ assignment: Item }>("/api/assignments", { method: "POST", body: body(id) }); created.push(r.assignment); setItems(x => [r.assignment, ...x]); f.setClassIds(x => x.filter(y => y !== id)); }
        catch (e) { failed.push({ id, error: e instanceof Error ? e.message : "تعذر إنشاء الواجب." }); }
      }
    } finally { setBusy(false); }
    if (created.length) void loadProgress();
    if (created.length) {
      const one = created[0];
      setNotice(ids.length === 1
        ? (one?.source?.revisionNumber ? "✓ تم إنشاء الواجب من الإصدار المنشور رقم " + one.source.revisionNumber + " (إدارة النشر) — النسخة المنشورة مثبّتة لهذا الواجب." : "✓ تم إنشاء الواجب من الامتحان المختار.")
        : "✓ تم إنشاء " + copiesCount(created.length) + " من الواجب: " + created.map(a => a.className || nameOf(a.classId)).join("، ") + ".");
    }
    if (failed.length) setError("تعذر إنشاء الواجب لـ " + failed.map(x => nameOf(x.id) + " (" + x.error + ")").join("، ") + (created.length ? ". الصفوف الأخرى أُنشئت؛ أعد المحاولة للصفوف المتبقية." : "."));
    else closeComposer();
  }
  async function action(item: Item, body: Record<string, unknown>) { setBusy(true); try { const r = await api<{ assignment: Item }>("/api/assignments", { method: "POST", body: JSON.stringify({ assignmentId: item.assignmentId, ...body }) }); reconcileMutated(r.assignment); if (body.action === "setStatus") void loadProgress(); return true; } catch (e) { setError(e instanceof Error ? e.message : "تعذر تنفيذ العملية."); return false; } finally { setBusy(false); } }
  // Phase 21G.5 (D2) — the results release: the mode (any time), and in «يدويًا» mode publishing / withdrawing (confirmed: it
  // changes what every student of the class sees). The server enforces it; the returned summary reconciles the row and the page.
  async function setResultsRelease(item: Item, mode: ResultsRelease) {
    if (normalizeResultsRelease(item.resultsRelease) === mode) return;
    await action(item, { action: "setResultsRelease", resultsRelease: mode });
  }
  async function releaseResults(item: Item, released: boolean) {
    if (!(await confirm(released
      ? { title: "نشر النتائج للطلاب", message: "سيرى كل طالب في الصف علامته وملاحظاتك في هذا الواجب، بما فيها الشارات وإشعارات التصحيح.", confirmLabel: "نشر النتائج" }
      : { title: "إخفاء النتائج عن الطلاب", message: "ستُحجب العلامات والملاحظات عن الطلاب حتى تنشرها مرة أخرى. لا تتغير العلامات نفسها.", confirmLabel: "إخفاء النتائج", tone: "danger" }))) return;
    setError(""); setNotice("");
    if (await action(item, { action: "releaseResults", released })) setNotice(released ? "✓ نُشرت نتائج «" + item.title + "» للطلاب." : "✓ أُخفيت نتائج «" + item.title + "» عن الطلاب.");
  }
  async function saveMaxAttempts(item: Item, value: number) { await action(item, { action: "setMaxAttempts", maxAttempts: value }); setAttemptsFor(null); }
  // Phase 21G.0 — title / instructions edit: one authoritative request, the returned summary reconciles the row and the detail.
  async function saveDetails(item: Item, title: string, instructions: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await api<{ assignment: Item }>("/api/assignments", { method: "POST", body: JSON.stringify({ action: "updateDetails", assignmentId: item.assignmentId, title, instructions }) });
      reconcileMutated(r.assignment); setDetailsFor(null); setNotice("✓ تم تحديث عنوان الواجب وتعليماته.");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحديث بيانات الواجب."); } finally { setBusy(false); }
  }
  // Phase 5A — class-wide time & deadline update. One authoritative request; reconcile the returned summary into the list (and the
  // open gradebook if it points here) WITHOUT a page reload, then a clear success notice. Availability / eligibility is re-derived
  // server-side, so an eligible student reopens and an exhausted one does not.
  async function saveTiming(item: Item, dueAtIso: string, durationMinutes: number) {
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await api<{ assignment: Item }>("/api/assignments", { method: "POST", body: JSON.stringify({ action: "updateTiming", assignmentId: item.assignmentId, dueAt: dueAtIso, durationMinutes }) });
      reconcileMutated(r.assignment); setTimingFor(null); void loadProgress(); setNotice("✓ تم تحديث وقت الواجب وموعد التسليم.");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحديث وقت الواجب."); } finally { setBusy(false); }
  }
  // Roadmap #7 — archive-first deletion. The normal destructive action ARCHIVES (never physically deletes) and always checks
  // authoritative impact first so an active-attempt archive is confirmed explicitly.
  async function fetchImpact(item: Item): Promise<Impact | null> { try { const r = await api<{ impact: Impact }>("/api/assignments", { method: "POST", body: JSON.stringify({ action: "deleteImpact", assignmentId: item.assignmentId }) }); return r.impact; } catch (e) { setError(e instanceof Error ? e.message : "تعذر حساب أثر العملية."); return null; } }
  async function archiveItem(item: Item) {
    setBusy(true); setError(""); setNotice("");
    try {
      const impact = await fetchImpact(item); if (!impact) return;
      let confirmActive = false;
      if (impact.activeAttempts > 0) {
        if (!(await confirm({ message: "يوجد " + impact.activeAttempts + " طلاب في محاولات نشطة. أرشفة الواجب ستمنعهم من المتابعة حتى تتم استعادته. لن تُحذف إجاباتهم أو محاولاتهم.", title: "أرشفة واجب فيه محاولات نشطة", confirmLabel: "أرشفة" }))) return;
        confirmActive = true;
      } else if (!(await confirm({ message: "سيتم إخفاء الواجب عن الطلاب مع الاحتفاظ بجميع التسليمات والنتائج. يمكنك استعادته لاحقًا.", title: "أرشفة الواجب", confirmLabel: "أرشفة" }))) return;
      const r = await api<{ assignment: Item }>("/api/assignments", { method: "POST", body: JSON.stringify({ action: "archive", assignmentId: item.assignmentId, ...(confirmActive ? { confirmActiveAttempts: true } : {}) }) });
      // If this assignment's gradebook is open: refresh its authoritative status so B2B controls hide at once, or drop the detail
      // entirely when the archived assignment leaves the current master scope.
      reconcileMutated(r.assignment); void loadProgress();
      if (resultsFor?.assignmentId === item.assignmentId) { setDeadlineFor(null); setReopenFor(null); setExtendFor(null); }
      setNotice("✓ تم أرشفة الواجب «" + item.title + "».");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر أرشفة الواجب."); } finally { setBusy(false); }
  }
  async function restoreItem(item: Item) { setBusy(true); setError(""); setNotice(""); try { const r = await api<{ assignment: Item }>("/api/assignments", { method: "POST", body: JSON.stringify({ action: "restore", assignmentId: item.assignmentId }) }); reconcileMutated(r.assignment); void loadProgress(); setNotice("✓ تم استعادة الواجب «" + item.title + "»."); } catch (e) { setError(e instanceof Error ? e.message : "تعذر استعادة الواجب."); } finally { setBusy(false); } }
  // Permanent purge — impact-gated. History present => never even offer purge; zero history => danger dialog that requires typing the
  // exact title before POSTing action:"purge".
  async function openPurge(item: Item) { setError(""); setNotice(""); setBusy(true); try { const impact = await fetchImpact(item); if (!impact) return; if (impact.submissionDocuments > 0) { setError("لا يمكن الحذف النهائي لأن للواجب بيانات طلاب محفوظة. اترك الواجب في الأرشيف للحفاظ على السجل."); return; } setPurgeFor(item); setPurgeTitle(""); } finally { setBusy(false); } }
  async function confirmPurge() { if (!purgeFor) return; const item = purgeFor; setBusy(true); setError(""); try { const r = await api<{ purged?: boolean }>("/api/assignments", { method: "POST", body: JSON.stringify({ action: "purge", assignmentId: item.assignmentId, confirmAssignmentId: item.assignmentId, confirmTitle: purgeTitle }) }); if (r.purged) { setItems(x => x.filter(y => y.assignmentId !== item.assignmentId)); if (resultsFor?.assignmentId === item.assignmentId) clearDetail({ restoreFocus: false }); focusWorkspacePending.current = true; setPurgeFor(null); setNotice("✓ تم حذف الواجب نهائيًا."); } } catch (e) { setError(e instanceof Error ? e.message : "تعذر الحذف النهائي."); } finally { setBusy(false); } }
  // Opening an assignment = exactly one authoritative results read; the composer yields to the detail area. Phase 12B — sequenced: a
  // read that resolves after a NEWER open / drill started is discarded (newest intent wins, never an older response overwriting a newer
  // selection). A drill applies its gradebook view to the SAME authoritative rows.
  async function loadResults(item = resultsFor, trigger?: HTMLElement | null, drillTarget?: AssignmentDrill) {
    if (!item) return;
    if (trigger !== undefined) { detailOpenerRef.current = trigger; focusDetailPending.current = true; setMode("list"); setPageTab("students"); stopBulk(); clearSelection(); setBulkDeadlineOpen(false); }
    if (trigger !== undefined && !drillTarget) setDrillFocus(null);                        // a manual open: the teacher leaves the drill focus
    const seq = ++resultsSeq.current;
    resultsBusy.current = true;
    setBusy(true); setDeadlineFor(null); setReopenFor(null); setExtendFor(null); setAnalysis(null);
    try {
      const r = await api<{ students: StudentResult[]; stats: Stats; codingSummary?: CodingGradingStatus; codingEvidenceTotals?: CodingEvidenceTotals }>("/api/assignment-results?assignmentId=" + encodeURIComponent(item.assignmentId));
      if (seq !== resultsSeq.current) return;
      if (!matchesMasterScope(item, scopeRef.current)) return;
      const students = r.students || [];
      setResultsFor(item); setResults(students); setStats(r.stats || null); setCodingSummary(r.codingSummary || null); setCodingTotals(r.codingEvidenceTotals || null);
      if (drillTarget) applyDrillView(drillTarget, item, students);
      // A reload while the analysis section is shown refreshes it too (the reload cleared it above).
      if (trigger === undefined && pageTabRef.current === "analysis") void loadItemAnalysis(item);
    } catch (e) { if (seq === resultsSeq.current) setError(e instanceof Error ? e.message : "تعذر تحميل النتائج."); } finally { if (seq === resultsSeq.current) { resultsBusy.current = false; setBusy(false); } }
  }
  // Review fix — the ONE place that retires the current results intent without starting a new read: every older in-flight read
  // becomes stale (its response and its finally are ignored), and the busy state that read held is released here, because that read's
  // own finally no longer will. Used when a newer drill turns out to be unavailable.
  function supersedeResultsIntent() {
    resultsSeq.current += 1;
    focusDetailPending.current = false;
    if (resultsBusy.current) { resultsBusy.current = false; setBusy(false); }
  }
  function applyDrillView(d: AssignmentDrill, item: Item, students: StudentResult[]) {
    const view = drillViewFor(d, students);
    setGbSearch("");
    setGbFilter(view.filter);
    setDrillFocus(view.focusStudentId ? { assignmentId: item.assignmentId, studentId: view.focusStudentId } : null);
    if (view.notice) setNotice(view.notice);
  }
  // Phase 12B — consume a drill ONCE, and only against the authoritative list (never the empty pre-load list). The exact assignment is
  // brought into the master scope (its class, current view, no search) and opened through the SAME results read as «فتح». An
  // assignment that no longer exists (or was archived) is never replaced by another: calm note only.
  function applyDrill(d: AssignmentDrill, list: Item[]) {
    const item = list.find(x => x.assignmentId === d.assignmentId);
    if (!item || item.status === "archived") {
      // A newer intent that cannot be honoured still wins over every older one: retire any in-flight read, drop the open detail
      // (results, stats, gradebook controls, drill focus), keep the list, select nothing, request nothing.
      supersedeResultsIntent();
      clearDetail({ restoreFocus: false });
      setError(""); setNotice("تعذر فتح الواجب المطلوب لأنه لم يعد متاحًا (ربما أُرشف أو حُذف). تُعرض قائمة الواجبات.");
      return;
    }
    const scope: MasterScope = { classId: item.classId, showArchived: false, q: "", time: "all", now };
    scopeRef.current = scope; setFilterClassId(item.classId); setShowArchived(false); setSearch(""); setTimeFilter("all");
    setError(""); setNotice("");
    void loadResults(item, null, d);
  }
  useEffect(() => {
    if (!drill || !listReady || drill.seq <= appliedDrillSeq.current) return;
    appliedDrillSeq.current = drill.seq;                                                // marked synchronously: never applied twice
    const d = drill;
    onDrillConsumed?.(d.seq);
    void Promise.resolve().then(() => applyDrill(d, items));
  }, [drill, listReady]);// eslint-disable-line react-hooks/exhaustive-deps
  // Clears every piece of detail state (results, stats, analysis, gradebook controls, row editors, opener ref). restoreFocus:true =
  // the explicit close button (focus returns to the original "فتح"); restoreFocus:false = the detail left the master scope while the
  // teacher operates a master control or after an authoritative mutation, so the control they are using keeps focus and no detached
  // opener is ever focused.
  function clearDetail({ restoreFocus }: { restoreFocus: boolean }) {
    setPageTab("students"); stopBulk(); clearSelection(); setBulkDeadlineOpen(false);
    setResultsFor(null); setResults([]); setStats(null); setDeadlineFor(null); setReopenFor(null); setExtendFor(null); setAnalysis(null); setGbSearch(""); setGbFilter("all"); setGbSort("name"); setDrillFocus(null);
    const el = detailOpenerRef.current; detailOpenerRef.current = null;
    // Phase 21G.3 — the opener sits in the list, which is hidden while the page is open: focus it once the list is shown again.
    if (restoreFocus && el) openerFocusPending.current = el;
  }
  useEffect(() => {
    const el = openerFocusPending.current;
    if (!el || resultsFor) return;
    openerFocusPending.current = null;
    if (el.isConnected) el.focus();
  }, [resultsFor]);
  function closeDetail() { clearDetail({ restoreFocus: true }); }
  // Master controls: apply the change, then enforce the invariant against the resulting scope. The composer is never closed here (its
  // target class is intentionally independent of the list filter).
  function changeScope(patch: { filterClassId?: string; showArchived?: boolean; search?: string; timeFilter?: TimeFilter }) {
    const next: MasterScope = { classId: patch.filterClassId !== undefined ? patch.filterClassId : effectiveFilter, showArchived: patch.showArchived !== undefined ? patch.showArchived : showArchived, q: normalizeQuery(patch.search !== undefined ? patch.search : search), time: patch.timeFilter !== undefined ? patch.timeFilter : timeFilter, now };
    scopeRef.current = next;
    if (patch.timeFilter !== undefined) setTimeFilter(patch.timeFilter);
    if (patch.filterClassId !== undefined) setFilterClassId(patch.filterClassId);
    if (patch.showArchived !== undefined) setShowArchived(patch.showArchived);
    if (patch.search !== undefined) setSearch(patch.search);
    if (resultsFor && !matchesMasterScope(resultsFor, next)) clearDetail({ restoreFocus: false });
  }
  // Authoritative assignment mutation (setStatus / setMaxAttempts / details / timing / archive / restore): replace the row, and if the
  // returned assignment no longer belongs to the master scope, drop a detail that pointed at it (never focusing a detached opener; a
  // stable workspace target is focused only if focus was actually lost with the row).
  function reconcileMutated(updated: Item) {
    setItems(x => x.map(y => (y.assignmentId === updated.assignmentId ? updated : y)));
    if (matchesMasterScope(updated, scopeRef.current)) { setResultsFor(prev => (prev && prev.assignmentId === updated.assignmentId ? updated : prev)); return; }
    if (resultsFor?.assignmentId === updated.assignmentId) clearDetail({ restoreFocus: false });
    focusWorkspacePending.current = true;
  }
  useEffect(() => {
    if (!focusWorkspacePending.current) return;
    focusWorkspacePending.current = false;
    const el = document.activeElement;
    if (!el || el === document.body || !el.isConnected) toolbarRef.current?.focus();
  });
  async function loadItemAnalysis(item = resultsFor) { if (!item) return; setAnalysisBusy(true); setError(""); try { const r = await api<ItemAnalysis>("/api/assignment-item-analysis?assignmentId=" + encodeURIComponent(item.assignmentId)); setAnalysis(r); } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل تحليل الأسئلة."); } finally { setAnalysisBusy(false); } }
  // The analysis loads the first time its section is chosen and is kept while the page stays open (one request, not one per visit).
  function selectPageTab(t: PageTab) { setPageTab(t); if (t === "analysis" && !analysis && !analysisBusy) void loadItemAnalysis(); }
  // Phase 17D-A — ONE bulk retry of the assignment's open coding grading (same revision, server-selected targets), then an
  // authoritative reload of the gradebook. The request carries the assignment id only.
  async function bulkCodingRetry() {
    if (!resultsFor) return;
    const item = resultsFor;
    if (!(await confirm({ message: "سيُعاد إرسال الأسئلة البرمجية التي لم يكتمل تصحيحها الآلي إلى خادم التنفيذ بنفس الإصدار. لن تتغير الإجابات أو المراجعات اليدوية.", title: "إعادة محاولة التصحيح البرمجي", confirmLabel: "إعادة المحاولة" }))) return;
    setBusy(true); setError(""); setNotice("");
    let r: { scheduled: number; hasMore: boolean } | null = null;
    try { r = await api<{ scheduled: number; hasMore: boolean }>("/api/coding/bulk-retry", { method: "POST", body: JSON.stringify({ assignmentId: item.assignmentId }) }); }
    catch { setError("تعذر جدولة إعادة محاولة التصحيح البرمجي."); }
    finally { setBusy(false); }
    if (!r) return;
    await loadResults(item);
    setNotice(bulkRetryNotice({ scheduled: Number(r.scheduled) || 0, hasMore: !!r.hasMore }));
  }
  // Merge an authoritative lifecycle snapshot (returned by every mutating action) into the student's row so the UI never guesses
  // (B2B #2/#20). Only defined fields are applied.
  function mergeSnap(studentId: string, snap: LifecycleSnap) { setResults(x => x.map(y => (y.studentId === studentId ? { ...y, ...snap } : y))); }
  async function grantAttempt(s: StudentResult) {
    if (!resultsFor) return;
    if (!(await confirm({ message: "سيتم السماح للطالب بمحاولة إضافية دون حذف المحاولات السابقة.", title: "منح محاولة إضافية", confirmLabel: "منح المحاولة" }))) return;
    setBusy(true); setError("");
    try { const r = await api<LifecycleSnap>("/api/assignment-results", { method: "POST", body: JSON.stringify({ action: "allowRetry", assignmentId: resultsFor.assignmentId, studentId: s.studentId }) }); mergeSnap(s.studentId, r); setNotice("✓ تم منح محاولة إضافية للطالب " + s.studentName); } catch (e) { setError(e instanceof Error ? e.message : "تعذر منح المحاولة."); } finally { setBusy(false); }
  }
  // Prefill only from an EXISTING per-student override; never from the original dueAt (that value equals the global due and would fail
  // the "must be after the original due" rule if submitted as-is). While the assignment is still open reopenUntil is optional, so a
  // blank default is safe.
  function openReopen(s: StudentResult) { setError(""); setExtendFor(null); setDeadlineFor(null); setReopenFor(s.studentId); setReopenValue(s.dueAtOverride ? toLocalInput(s.dueAtOverride) : ""); }
  async function saveReopen(s: StudentResult) {
    if (!resultsFor) return;
    if (!(await confirm({ message: "إعادة فتح الواجب لهذا الطالب: تُتاح له محاولة واحدة إذا لزم دون حذف نتيجته السابقة، ولن تبدأ المحاولة تلقائيًا.", title: "إعادة فتح للطالب", confirmLabel: "إعادة الفتح" }))) return;
    setBusy(true); setError("");
    try { const body: { action: string; assignmentId: string; studentId: string; reopenUntil?: string } = { action: "reopenStudent", assignmentId: resultsFor.assignmentId, studentId: s.studentId }; if (reopenValue) body.reopenUntil = new Date(reopenValue).toISOString(); const r = await api<LifecycleSnap>("/api/assignment-results", { method: "POST", body: JSON.stringify(body) }); mergeSnap(s.studentId, r); setReopenFor(null); setNotice("✓ تم إعادة فتح الواجب للطالب " + s.studentName); } catch (e) { setError(e instanceof Error ? e.message : "تعذر إعادة فتح الواجب."); } finally { setBusy(false); }
  }
  function openExtend(s: StudentResult) { setError(""); setReopenFor(null); setDeadlineFor(null); setExtendFor(s.studentId); const cur = s.activeAttempt?.extendedEndsAt || s.attemptDurationEndsAt || s.activeAttempt?.endsAt || ""; setExtendValue(cur ? toLocalInput(cur) : ""); }
  async function saveExtend(s: StudentResult) {
    if (!resultsFor || !extendValue) return;
    if (!(await confirm({ message: "سيتم تمديد وقت هذه المحاولة النشطة فقط دون إعادة ضبط العدّاد أو تغيير بدايتها.", title: "تمديد وقت المحاولة", confirmLabel: "تمديد" }))) return;
    setBusy(true); setError("");
    try { const r = await api<LifecycleSnap>("/api/assignment-results", { method: "POST", body: JSON.stringify({ action: "extendActiveAttempt", assignmentId: resultsFor.assignmentId, studentId: s.studentId, newEndsAt: new Date(extendValue).toISOString() }) }); mergeSnap(s.studentId, r); setExtendFor(null); setNotice("✓ تم تمديد وقت المحاولة للطالب " + s.studentName); } catch (e) { setError(e instanceof Error ? e.message : "تعذر تمديد وقت المحاولة."); } finally { setBusy(false); }
  }
  // Phase 7B — end the student's CURRENT attempt. Sends ONLY the identity of the attempt shown in this row (attemptNumber + startedAt,
  // + attemptEpoch for a model-3 attempt) and never any answers: the server grades its own saved draft. The response is the
  // authoritative row (lifecycle + results) and is merged in place; a 409 (the attempt changed meanwhile — submitted, paused, resumed,
  // or a newer attempt) only shows the error and leaves the local row untouched.
  async function endAttempt(s: StudentResult) {
    const act = s.activeAttempt;
    if (!resultsFor || !act) return;
    if (!(await confirm({ message: "سيتم إنهاء المحاولة الحالية وتصحيح آخر إجابات محفوظة على الخادم. لن يستطيع الطالب متابعة هذه المحاولة بعد ذلك.", title: "إنهاء محاولة الطالب", confirmLabel: "إنهاء المحاولة", tone: "danger" }))) return;
    setBusy(true); setError("");
    try {
      const body = { action: "endActiveAttempt", assignmentId: resultsFor.assignmentId, studentId: s.studentId, expectedAttemptNumber: act.attemptNumber, expectedStartedAt: act.startedAt, ...(typeof act.attemptEpoch === "number" ? { expectedAttemptEpoch: act.attemptEpoch } : {}) };
      const r = await api<LifecycleSnap>("/api/assignment-results", { method: "POST", body: JSON.stringify(body) });
      mergeSnap(s.studentId, r); setExtendFor(x => (x === s.studentId ? null : x)); setNotice("✓ تم إنهاء محاولة الطالب " + s.studentName);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر إنهاء المحاولة."); } finally { setBusy(false); }
  }
  function openDeadline(s: StudentResult) { setError(""); setReopenFor(null); setExtendFor(null); setDeadlineFor(s.studentId); setDeadlineValue(s.dueAtOverride ? toLocalInput(s.dueAtOverride) : ""); }
  async function saveDeadline(s: StudentResult) { if (!resultsFor || !deadlineValue) return; setBusy(true); setError(""); try { const r = await api<LifecycleSnap & { dueAtOverride: string | null }>("/api/assignment-results", { method: "POST", body: JSON.stringify({ action: "setDueAtOverride", assignmentId: resultsFor.assignmentId, studentId: s.studentId, dueAtOverride: new Date(deadlineValue).toISOString() }) }); mergeSnap(s.studentId, r); setDeadlineFor(null); setNotice("✓ تم تمديد الموعد للطالب " + s.studentName); } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ التمديد."); } finally { setBusy(false); } }
  async function clearDeadline(s: StudentResult) { if (!resultsFor) return; setBusy(true); setError(""); try { const r = await api<LifecycleSnap & { dueAtOverride: string | null }>("/api/assignment-results", { method: "POST", body: JSON.stringify({ action: "setDueAtOverride", assignmentId: resultsFor.assignmentId, studentId: s.studentId, dueAtOverride: null }) }); mergeSnap(s.studentId, r); setDeadlineFor(null); setNotice("✓ تم إلغاء تمديد الطالب " + s.studentName); } catch (e) { setError(e instanceof Error ? e.message : "تعذر إلغاء التمديد."); } finally { setBusy(false); } }
  // Phase 21G.4 — a bulk action is the SAME per-student request as the row action, sent once per ticked visible row, one after the
  // other (each answer is the authoritative snapshot of that student and is merged in place). Every student is reported: the ones that
  // failed stay ticked so the teacher can retry them. Opening another assignment (or closing this one) stops the run.
  async function runBulk(label: string, send: (s: StudentResult, assignmentId: string) => Promise<LifecycleSnap>, done: (n: string) => string) {
    const item = resultsFor;
    const rows = visibleResults.filter(s => selected.has(s.studentId));
    if (!item || !rows.length) return false;
    const run = ++bulkRun.current, failed: { s: StudentResult; error: string }[] = [];
    let ok = 0;
    bulkBusy.current = true; setBusy(true); setError(""); setNotice("");
    try {
      for (const [i, s] of rows.entries()) {
        if (bulkRun.current !== run) return false;
        setNotice(label + " " + (i + 1) + " من " + rows.length + "…");
        try { const r = await send(s, item.assignmentId); if (bulkRun.current !== run) return false; mergeSnap(s.studentId, r); ok++; }
        catch (e) { failed.push({ s, error: e instanceof Error ? e.message : "تعذر تنفيذ الإجراء." }); }
      }
    } finally { if (bulkRun.current === run) { bulkBusy.current = false; setBusy(false); } }
    setSelected(new Set(failed.map(f => f.s.studentId)));
    setNotice(ok ? "✓ " + done(studentsCount(ok)) : "");
    if (failed.length) setError("تعذر تنفيذ الإجراء لـ " + studentsCount(failed.length) + ": " + failed.map(f => f.s.studentName + " (" + f.error + ")").join("، "));
    return failed.length === 0;
  }
  async function bulkGrant() {
    const n = visibleResults.filter(s => selected.has(s.studentId)).length;
    if (!resultsFor || !n) return;
    if (!(await confirm({ message: "سيتم السماح لـ " + studentsCount(n) + " بمحاولة إضافية دون حذف المحاولات السابقة.", title: "منح محاولة إضافية للمحددين", confirmLabel: "منح المحاولة" }))) return;
    await runBulk("جارٍ منح المحاولة", (s, assignmentId) => api<LifecycleSnap>("/api/assignment-results", { method: "POST", body: JSON.stringify({ action: "allowRetry", assignmentId, studentId: s.studentId }) }), n => "تم منح محاولة إضافية لـ " + n + ".");
  }
  function openBulkDeadline() { setError(""); setDeadlineFor(null); setReopenFor(null); setExtendFor(null); setBulkDeadlineValue(""); setBulkDeadlineOpen(true); }
  async function saveBulkDeadline() {
    if (!bulkDeadlineValue) return;
    const dueAtOverride = new Date(bulkDeadlineValue).toISOString();
    const allDone = await runBulk("جارٍ تمديد الموعد", (s, assignmentId) => api<LifecycleSnap>("/api/assignment-results", { method: "POST", body: JSON.stringify({ action: "setDueAtOverride", assignmentId, studentId: s.studentId, dueAtOverride }) }), n => "تم تمديد الموعد لـ " + n + ".");
    if (allDone) setBulkDeadlineOpen(false);
  }
  // Review opens above the NON-MODAL detail; row-editor dialogs and the pending confirm never stay open beneath it.
  function openReview(s: StudentResult) { if (!s.latestResult) return; setDeadlineFor(null); setReopenFor(null); setExtendFor(null); setAttemptsFor(null); setPurgeFor(null); cancelPending(); setReview({ studentId: s.studentId, attemptNumber: s.latestResult.attemptNumber }); }

  const masterScope: MasterScope = { classId: effectiveFilter, showArchived, q: normalizeQuery(search), time: timeFilter, now };
  useEffect(() => { scopeRef.current = masterScope; });
  const archivedCount = items.filter(x => matchesMasterScope(x, { classId: effectiveFilter, showArchived: true, q: "" })).length;
  const scoped = items.filter(x => matchesMasterScope(x, { ...masterScope, q: "", time: "all" }));
  const visible = items.filter(x => matchesMasterScope(x, masterScope));
  const sortedQuestions = useMemo(() => sortAnalysisQuestions(analysis, analysisSort), [analysis, analysisSort]);
  const analysisSummary = useMemo(() => summarizeAnalysis(analysis), [analysis]);
  const visibleResults = useMemo(() => gradebookRows(results, gbSearch, gbFilter, gbSort), [results, gbSearch, gbFilter, gbSort]);
  const reviewNavigation = useMemo(() => (review ? reviewNav(gradebookRows(results, "", "all", gbSort), review.studentId, rowGrading) : null), [review, results, gbSort]);
  const deadlineStudent = results.find(x => x.studentId === deadlineFor) || null, reopenStudent = results.find(x => x.studentId === reopenFor) || null, extendStudent = results.find(x => x.studentId === extendFor) || null;
  const extendEffDue = extendStudent ? (extendStudent.dueAtOverride || resultsFor?.dueAt || "") : "";
  const willClip = !!(extendValue && extendEffDue && new Date(extendValue).getTime() > new Date(extendEffDue).getTime());
  const f = composer.fields, src = composer.source;
  const canCreate = !busy && !src.examLoading && f.classIds.length > 0 && !!f.title.trim() && !!src.sourceExam && src.sourceCount > 0 && !windowBlocks(composer.windowIssues);

  return {
    token, busy, loading, error, notice, mode,
    toolbar: { active, effectiveFilter, showArchived, search, archivedCount, changeScope, openComposer, refresh, timeFilter, timeCounts: timeFilterCounts(scoped, now) },
    home: { kpis: homeKpis(scoped, progress, now), progress, now },
    list: { visible, hasAnyInScope: scoped.length > 0, selectedId: mode === "list" && resultsFor ? resultsFor.assignmentId : "", open: (item: Item, trigger: HTMLElement | null) => void loadResults(item, trigger), publish: (item: Item) => void action(item, { action: "setStatus", status: "published" }), unpublish: (item: Item) => void action(item, { action: "setStatus", status: "draft" }), editAttempts: setAttemptsFor, editTiming: setTimingFor, editDetails: setDetailsFor, archive: (item: Item) => void archiveItem(item), restore: (item: Item) => void restoreItem(item), purge: (item: Item) => void openPurge(item), setResultsRelease: (item: Item, mode: ResultsRelease) => void setResultsRelease(item, mode), releaseResults: (item: Item, released: boolean) => void releaseResults(item, released) },
    composer: { ...composer, close: closeComposer, create: () => void create(), canCreate },
    detail: { item: resultsFor, stats, close: closeDetail, analysis, analysisBusy, analysisSort, setAnalysisSort, tab: pageTab, selectTab: selectPageTab, sortedQuestions, analysisSummary, reload: () => void loadResults(resultsFor) },
    gradebook: { rows: visibleResults, results, focusStudentId: drillFocus && resultsFor && drillFocus.assignmentId === resultsFor.assignmentId ? drillFocus.studentId : undefined, search: gbSearch, setSearch: (v: string) => { setGbSearch(v); clearSelection(); }, filter: gbFilter, setFilter: (v: GradebookFilter) => { setGbFilter(v); clearSelection(); }, sort: gbSort, setSort: setGbSort, codingSummary, codingTotals, bulkCodingRetry: () => void bulkCodingRetry(), review: openReview, grant: (s: StudentResult) => void grantAttempt(s), reopen: openReopen, extend: openExtend, deadline: openDeadline, endAttempt: (s: StudentResult) => void endAttempt(s),
      selected, toggleSelected: (id: string) => setSelected(x => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
      toggleAllSelected: (ids: string[], on: boolean) => setSelected(x => { const n = new Set(x); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; }),
      clearSelection, bulkGrant: () => void bulkGrant(), openBulkDeadline,
      bulkDeadline: { open: bulkDeadlineOpen, count: visibleResults.filter(s => selected.has(s.studentId)).length, value: bulkDeadlineValue, setValue: setBulkDeadlineValue, close: () => setBulkDeadlineOpen(false), save: () => void saveBulkDeadline() } },
    dialogs: {
      attemptsFor, closeAttempts: () => setAttemptsFor(null), saveMaxAttempts: (item: Item, value: number) => void saveMaxAttempts(item, value),
      detailsFor, closeDetails: () => setDetailsFor(null), saveDetails: (item: Item, title: string, instructions: string) => void saveDetails(item, title, instructions),
      timingFor, closeTiming: () => setTimingFor(null), saveTiming: (item: Item, dueAtIso: string, durationMinutes: number) => void saveTiming(item, dueAtIso, durationMinutes),
      deadlineStudent, deadlineValue, setDeadlineValue, closeDeadline: () => setDeadlineFor(null), saveDeadline: (s: StudentResult) => void saveDeadline(s), clearDeadline: (s: StudentResult) => void clearDeadline(s),
      reopenStudent, reopenValue, setReopenValue, closeReopen: () => setReopenFor(null), saveReopen: (s: StudentResult) => void saveReopen(s),
      extendStudent, extendValue, setExtendValue, closeExtend: () => setExtendFor(null), saveExtend: (s: StudentResult) => void saveExtend(s), willClip,
      purgeFor, purgeTitle, setPurgeTitle, confirmPurge: () => void confirmPurge(), closePurge: () => { if (!busy) setPurgeFor(null); },
      confirmDialog
    },
    // Phase 21G.5 — the review moves between students in the gradebook's current sort order, over EVERY student (a search or a
    // filter never strands it: a student who leaves the «بانتظار التصحيح» filter once graded is still the review's position).
    review: { target: review, close: () => setReview(null), nav: reviewNavigation, go: (t: ReviewTarget) => setReview(t) }
  };
}
export type AssignmentsController = ReturnType<typeof useAssignmentsController>;
