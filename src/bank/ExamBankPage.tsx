import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import SectionHeader from "../ui/SectionHeader";
import StatCard from "../ui/StatCard";
import EmptyState from "../ui/EmptyState";
import StatusBadge from "../ui/StatusBadge";
import Dialog from "../ui/Dialog";
import IconButton from "../ui/IconButton";
import { useConfirm } from "../ui/useConfirm";
import { IconPlus, IconUpload, IconBuilder, IconSearch, IconEye, IconEdit, IconTrash, IconRefresh, IconLock } from "../icons";
import { withTrackingCode } from "../lib/requestTrace";
import {
  type BankQuestionRow, type BankQuestionInput, type BankFilters, type BankPresentationType, type BankSection,
  EMPTY_FILTERS, PRESENTATION_TYPES, SECTIONS, SECTION_LABELS, TYPE_LABELS, SOURCE_LABELS,
  emptyInput, inputFromRow, validateInput, filterRows, summarize, distinctTopics, correctOptionText, sectionLabel, typeLabel, sourceLabel
} from "./bankQuestionModel";
import "../bank-pro.css";

/*
 * UX-6c — Exam Bank Management (بنك الامتحانات): the real destination behind the sidebar group.
 *   نظرة عامة        counts derived from the loaded question list + the saved-exam list (no extra request)
 *   بنك الأسئلة      the EDITABLE question bank (GET/POST /api/bank-questions on the existing bank store): client-side
 *                    search/filters over the loaded list, preview, add, edit, delete (destructive confirmation);
 *                    official-bank questions are listed read-only (no edit/delete control is rendered for them)
 *   الامتحانات المحفوظة  the EXISTING /api/saved-exams contract (list, open in the builder, delete) — no second system
 *   المكتبة الرسمية   the bundled read-only exam-library catalog (list, open an editable COPY in the builder)
 * Request behaviour: entering the page issues exactly one bank load and one saved-exam list load; filters, search,
 * tab changes and previews issue nothing; the library catalog loads once on first open of its tab; each mutation is
 * one POST whose authoritative response updates the local list (no refetch). Out-of-order load responses are
 * ignored via a sequence guard; a failed mutation leaves the list exactly as it was.
 */
export type SavedExamListItem = { blobName: string; examId: string; title: string; savedAt: string; questionCount: number; totalMarks: number };
type LibraryCatalogItem = { libraryItemId: string; title: string; questionCount: number; totalMarks: number; publishable?: boolean; category?: string };
type View = "overview" | "questions" | "exams" | "library";
type Props = {
  token: string;
  onOpenBuilder: () => void;
  onOpenImport: () => void;
  onOpenSavedExam: (item: SavedExamListItem) => Promise<void> | void;
  onCopyLibraryExamToBuilder: (examSnapshot: { questions?: unknown[]; title?: string } | null, title: string) => void;
};

const VIEWS: { key: View; label: string }[] = [
  { key: "overview", label: "نظرة عامة" }, { key: "questions", label: "بنك الأسئلة" }, { key: "exams", label: "الامتحانات المحفوظة" }, { key: "library", label: "المكتبة الرسمية" }
];
const fmtDate = (v: string) => (v ? new Date(v).toLocaleString("ar", { numberingSystem: "latn" }) : "—");
const NO_ROWS: BankQuestionRow[] = [];

export default function ExamBankPage({ token, onOpenBuilder, onOpenImport, onOpenSavedExam, onCopyLibraryExamToBuilder }: Props) {
  const [view, setView] = useState<View>("overview");
  const [rows, setRows] = useState<BankQuestionRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState<BankFilters>(EMPTY_FILTERS);
  const [savedExams, setSavedExams] = useState<SavedExamListItem[] | null>(null);
  const [savedError, setSavedError] = useState("");
  const [catalog, setCatalog] = useState<LibraryCatalogItem[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [preview, setPreview] = useState<BankQuestionRow | null>(null);
  const [editor, setEditor] = useState<{ mode: "create" } | { mode: "edit"; row: BankQuestionRow } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const { confirm, confirmDialog } = useConfirm();
  const loadSeq = useRef(0);
  const questionsHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const filterId = useId();

  const api = useCallback(async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
    const h = new Headers(options.headers || {});
    h.set("Content-Type", "application/json"); h.set("x-builder-token", token); h.set("Authorization", "Bearer " + token);
    const r = await fetch(url, { ...options, headers: h });
    const j = await r.json() as T & { error?: string };
    if (!r.ok) throw new Error(withTrackingCode(j.error || "حدث خطأ.", r.status, r));
    return j;
  }, [token]);

  // One bank load per entry; a stale (out-of-order) response never overwrites a newer one (sequence guard). The
  // mount effect only starts the two requests and applies their results asynchronously; "loading" is derived (no
  // rows yet and no error, or an explicit refresh in flight), so no state is written synchronously in the effect.
  const fetchBank = useCallback(() => api<{ questions: BankQuestionRow[] }>("/api/bank-questions"), [api]);
  const fetchSavedExams = useCallback(() => api<{ exams: SavedExamListItem[] }>("/api/saved-exams"), [api]);
  useEffect(() => {
    const seq = ++loadSeq.current;
    fetchBank()
      .then(r => { if (seq === loadSeq.current) { setRows(r.questions || []); setLoadError(""); } })
      .catch(e => { if (seq === loadSeq.current) setLoadError(e instanceof Error ? e.message : "تعذر تحميل بنك الأسئلة."); });
    fetchSavedExams()
      .then(r => { setSavedExams(r.exams || []); setSavedError(""); })
      .catch(e => { setSavedExams([]); setSavedError(e instanceof Error ? e.message : "تعذر تحميل الامتحانات المحفوظة."); });
  }, [fetchBank, fetchSavedExams]);
  async function refreshBank() {                                              // user-initiated: shows the loading state
    const seq = ++loadSeq.current;
    setRefreshing(true); setLoadError("");
    try {
      const r = await fetchBank();
      if (seq === loadSeq.current) setRows(r.questions || []);
    } catch (e) {
      if (seq === loadSeq.current) setLoadError(e instanceof Error ? e.message : "تعذر تحميل بنك الأسئلة.");
    } finally {
      if (seq === loadSeq.current) setRefreshing(false);
    }
  }
  async function loadSavedExams() {                                           // user-initiated refresh of the saved list
    setSavedError("");
    try { const r = await fetchSavedExams(); setSavedExams(r.exams || []); }
    catch (e) { setSavedError(e instanceof Error ? e.message : "تعذر تحميل الامتحانات المحفوظة."); }
  }
  const loading = (rows === null && !loadError) || refreshing;

  async function openView(next: View) {
    setView(next);
    if (next === "library" && catalog === null && !catalogLoading) {
      setCatalogLoading(true); setCatalogError("");
      try { const r = await api<{ catalog: LibraryCatalogItem[] }>("/api/exam-library"); setCatalog(r.catalog || []); }
      catch (e) { setCatalog([]); setCatalogError(e instanceof Error ? e.message : "تعذر تحميل المكتبة الرسمية."); }
      finally { setCatalogLoading(false); }
    }
  }

  const list = rows ?? NO_ROWS;
  const summary = useMemo(() => summarize(list), [list]);
  const visible = useMemo(() => filterRows(list, filters), [list, filters]);
  const topics = useMemo(() => distinctTopics(list), [list]);
  const filtered = filters !== EMPTY_FILTERS && (filters.q || filters.section || filters.type || filters.difficulty || filters.source);

  async function saveQuestion(input: BankQuestionInput) {
    if (!editor) return;
    setBusy(true); setActionError(""); setNotice("");
    try {
      if (editor.mode === "create") {
        const r = await api<{ question: BankQuestionRow }>("/api/bank-questions", { method: "POST", body: JSON.stringify({ action: "create", question: input }) });
        setRows(prev => [r.question, ...(prev || [])]);
        setNotice("✓ تمت إضافة السؤال إلى بنك الأسئلة.");
      } else {
        const id = editor.row.id;
        const r = await api<{ question: BankQuestionRow }>("/api/bank-questions", { method: "POST", body: JSON.stringify({ action: "update", id, question: input }) });
        setRows(prev => (prev || []).map(x => (x.id === id ? r.question : x)));
        setNotice("✓ تم حفظ تعديلات السؤال.");
      }
      setEditor(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "تعذر حفظ السؤال.");
    } finally { setBusy(false); }
  }
  async function deleteQuestion(row: BankQuestionRow) {
    const ok = await confirm({ title: "حذف سؤال من البنك", message: "سيُحذف هذا السؤال نهائيًا من بنك الأسئلة. الامتحانات المحفوظة تحتفظ بنسختها الخاصة ولن تتأثر.\n\n" + row.text.slice(0, 160), confirmLabel: "حذف نهائي", cancelLabel: "إلغاء", tone: "danger" });
    if (!ok) return;
    setBusy(true); setActionError(""); setNotice("");
    try {
      await api<{ deleted: boolean }>("/api/bank-questions", { method: "POST", body: JSON.stringify({ action: "delete", id: row.id }) });
      setRows(prev => (prev || []).filter(x => x.id !== row.id));
      setNotice("✓ تم حذف السؤال.");
      questionsHeadingRef.current?.focus();                                  // the row's own controls are gone
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "تعذر حذف السؤال.");
    } finally { setBusy(false); }
  }
  async function deleteSavedExam(item: SavedExamListItem) {
    const ok = await confirm({ title: "حذف امتحان محفوظ", message: "هل تريد حذف الامتحان المحفوظ «" + item.title + "»؟ لا يمكن التراجع.", confirmLabel: "حذف", cancelLabel: "إلغاء", tone: "danger" });
    if (!ok) return;
    setBusy(true); setActionError(""); setNotice("");
    try {
      await api<{ deleted: boolean }>("/api/saved-exams", { method: "POST", body: JSON.stringify({ action: "delete", blobName: item.blobName }) });
      setSavedExams(prev => (prev || []).filter(x => x.blobName !== item.blobName));
      setNotice("✓ تم حذف الامتحان المحفوظ.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "تعذر حذف الامتحان.");
    } finally { setBusy(false); }
  }
  async function openLibraryCopy(item: LibraryCatalogItem) {
    setBusy(true); setActionError("");
    try {
      const r = await api<{ item: { examSnapshot: { questions?: unknown[]; title?: string } } }>("/api/exam-library/" + encodeURIComponent(item.libraryItemId));
      onCopyLibraryExamToBuilder(r.item?.examSnapshot || null, item.title);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "تعذر فتح عنصر المكتبة.");
    } finally { setBusy(false); }
  }

  const primaryActions = (
    <div className="eb-bank-actions">
      <button type="button" className="eb-button is-primary" onClick={onOpenBuilder}><IconBuilder size={16} aria-hidden="true" />إنشاء امتحان جديد</button>
      <button type="button" className="eb-button" onClick={() => { setActionError(""); setEditor({ mode: "create" }); }}><IconPlus size={16} aria-hidden="true" />إضافة سؤال</button>
      <button type="button" className="eb-button" onClick={onOpenImport}><IconUpload size={16} aria-hidden="true" />استيراد أسئلة</button>
    </div>
  );

  return (
    <section className="eb-bank" aria-label="بنك الامتحانات">
      <p className="eb-bank-intro">إدارة أسئلة البنك، الامتحانات المحفوظة والمكتبة الرسمية من مكان واحد. الأسئلة الرسمية للقراءة فقط.</p>
      <div className="eb-segmented" role="group" aria-label="أقسام بنك الامتحانات">
        {VIEWS.map(v => <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => void openView(v.key)}>{v.label}</button>)}
      </div>
      {notice && <p className="eb-muted" role="status">{notice}</p>}
      {actionError && <p className="platform-error" role="alert">{actionError}</p>}

      {view === "overview" && (
        <section className="eb-bank-overview" aria-labelledby="eb-bank-overview-title">
          <SectionHeader level={2} id="eb-bank-overview-title" title="نظرة عامة" description="أرقام مأخوذة من بنك الأسئلة والامتحانات المحفوظة كما هي الآن." actions={primaryActions} />
          {loading && <p className="eb-muted" role="status">جارٍ تحميل بنك الأسئلة...</p>}
          {loadError && <p className="platform-error" role="alert">{loadError} <button type="button" className="eb-button is-small" onClick={() => void refreshBank()}><IconRefresh size={14} aria-hidden="true" />إعادة المحاولة</button></p>}
          {!loading && !loadError && (<>
            <div className="eb-bank-stats">
              <StatCard label="عدد الأسئلة" value={summary.total} primary />
              <StatCard label="قابلة للتعديل" value={summary.editable} hint="مستوردة أو مضافة يدويًا" />
              <StatCard label="أسئلة رسمية" value={summary.official} hint="للقراءة فقط" />
              <StatCard label="الامتحانات المحفوظة" value={savedExams === null ? "…" : savedExams.length} tone="info" />
              <StatCard label="بانتظار التصنيف" value={summary.pendingClassification} tone={summary.pendingClassification > 0 ? "attention" : "neutral"} />
            </div>
            {summary.total > 0 && (
              <div className="eb-bank-dist">
                <div className="eb-bank-dist-card"><h3>حسب القسم</h3><dl className="eb-bank-dl">{SECTIONS.map(s => <div key={s} style={{ display: "contents" }}><dt>{SECTION_LABELS[s]}</dt><dd>{summary.bySection[s] || 0}</dd></div>)}</dl></div>
                <div className="eb-bank-dist-card"><h3>حسب النوع</h3><dl className="eb-bank-dl">{PRESENTATION_TYPES.map(t => <div key={t} style={{ display: "contents" }}><dt>{TYPE_LABELS[t]}</dt><dd>{summary.byType[t] || 0}</dd></div>)}</dl></div>
                <div className="eb-bank-dist-card"><h3>حسب الصعوبة</h3><dl className="eb-bank-dl">{["1", "2", "3", "4", "5"].map(d => <div key={d} style={{ display: "contents" }}><dt>مستوى {d}</dt><dd>{summary.byDifficulty[d] || 0}</dd></div>)}{summary.byDifficulty["—"] ? <div style={{ display: "contents" }}><dt>غير محدد</dt><dd>{summary.byDifficulty["—"]}</dd></div> : null}</dl></div>
                {summary.byTopic.length > 0 && <div className="eb-bank-dist-card"><h3>أكثر المواضيع</h3><dl className="eb-bank-dl">{summary.byTopic.slice(0, 8).map(t => <div key={t.topic} style={{ display: "contents" }}><dt>{t.topic}</dt><dd>{t.count}</dd></div>)}</dl></div>}
              </div>
            )}
            {summary.total === 0 && <EmptyState compact title="بنك الأسئلة فارغ." description="أضف سؤالًا أو استورد أسئلة من ملف لتبدأ." />}
          </>)}
        </section>
      )}

      {view === "questions" && (
        <section aria-labelledby="eb-bank-questions-title">
          <SectionHeader level={2} id="eb-bank-questions-title" title="بنك الأسئلة" count={rows ? visible.length : undefined} description="بحث وتصفية محليان على القائمة المحمّلة. الأسئلة الرسمية تُعرض للقراءة فقط."
            actions={<><button type="button" className="eb-button is-primary is-small" onClick={() => { setActionError(""); setEditor({ mode: "create" }); }}><IconPlus size={16} aria-hidden="true" />إضافة سؤال</button><button type="button" className="eb-button is-small" onClick={onOpenImport}><IconUpload size={16} aria-hidden="true" />استيراد</button><IconButton label="تحديث" icon={<IconRefresh size={18} />} onClick={() => void refreshBank()} /></>} />
          <h2 ref={questionsHeadingRef} tabIndex={-1} className="eb-visually-hidden">قائمة الأسئلة</h2>
          <div className="eb-bank-toolbar">
            <div className="eb-search-field student-search-field">
              <IconSearch size={16} aria-hidden="true" />
              <input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} placeholder="ابحث في نص السؤال أو الموضوع أو المعرّف" aria-label="ابحث في نص السؤال أو الموضوع أو المعرّف" />
            </div>
            <label className="eb-bank-filter" htmlFor={filterId + "-section"}>القسم
              <select id={filterId + "-section"} value={filters.section} onChange={e => setFilters(f => ({ ...f, section: e.target.value }))}><option value="">كل الأقسام</option>{SECTIONS.map(s => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}</select></label>
            <label className="eb-bank-filter" htmlFor={filterId + "-type"}>النوع
              <select id={filterId + "-type"} value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}><option value="">كل الأنواع</option>{PRESENTATION_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select></label>
            <label className="eb-bank-filter" htmlFor={filterId + "-difficulty"}>الصعوبة
              <select id={filterId + "-difficulty"} value={filters.difficulty} onChange={e => setFilters(f => ({ ...f, difficulty: e.target.value }))}><option value="">كل المستويات</option>{["1", "2", "3", "4", "5"].map(d => <option key={d} value={d}>مستوى {d}</option>)}</select></label>
            <label className="eb-bank-filter" htmlFor={filterId + "-source"}>المصدر
              <select id={filterId + "-source"} value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}><option value="">كل المصادر</option>{(["official", "import", "manual"] as const).map(k => <option key={k} value={k}>{SOURCE_LABELS[k]}</option>)}</select></label>
            {filtered ? <button type="button" className="eb-button is-small" onClick={() => setFilters(EMPTY_FILTERS)}>مسح التصفية</button> : null}
          </div>
          {loading && <p className="eb-muted" role="status">جارٍ تحميل بنك الأسئلة...</p>}
          {loadError && <p className="platform-error" role="alert">{loadError} <button type="button" className="eb-button is-small" onClick={() => void refreshBank()}>إعادة المحاولة</button></p>}
          {!loading && !loadError && list.length === 0 && (
            <EmptyState title="لا توجد أسئلة في البنك بعد." description="أضف سؤالًا يدويًا أو استورد أسئلة من ملف." action={<><button type="button" className="eb-button is-primary is-small" onClick={() => setEditor({ mode: "create" })}><IconPlus size={16} aria-hidden="true" />إضافة سؤال</button></>} />
          )}
          {!loading && !loadError && list.length > 0 && visible.length === 0 && <EmptyState compact title="لا توجد أسئلة مطابقة." description="جرّب كلمة بحث أخرى أو غيّر المرشحات." />}
          {!loading && !loadError && visible.length > 0 && (
            <div className="eb-bank-table-wrap">
              <table className="eb-bank-table">
                <thead><tr><th scope="col">السؤال</th><th scope="col">القسم</th><th scope="col">الموضوع</th><th scope="col">النوع</th><th scope="col">الصعوبة</th><th scope="col">المصدر</th><th scope="col">إجراءات</th></tr></thead>
                <tbody>
                  {visible.map(row => (
                    <tr key={row.id}>
                      <td><span className="eb-bank-text" title={row.text}>{row.text || "—"}</span><span className="eb-bank-id">{row.id}</span></td>
                      <td>{sectionLabel(row.section)}</td>
                      <td>{row.topic || "—"}</td>
                      <td>{typeLabel(row.presentationType)}</td>
                      <td className="eb-bank-num">{row.difficulty === null ? "—" : row.difficulty}</td>
                      <td><StatusBadge tone={row.official ? "neutral" : row.sourceKind === "manual" ? "success" : "info"}>{row.official ? <><IconLock size={12} aria-hidden="true" /> رسمي</> : sourceLabel(row.sourceKind)}</StatusBadge></td>
                      <td><div className="eb-row-actions">
                        <button type="button" className="eb-button is-quiet is-small" onClick={() => setPreview(row)}><IconEye size={14} aria-hidden="true" />معاينة</button>
                        {!row.official && <button type="button" className="eb-button is-quiet is-small" onClick={() => { setActionError(""); setEditor({ mode: "edit", row }); }} disabled={busy}><IconEdit size={14} aria-hidden="true" />تعديل</button>}
                        {!row.official && <button type="button" className="eb-button is-quiet is-small is-danger" onClick={() => void deleteQuestion(row)} disabled={busy}><IconTrash size={14} aria-hidden="true" />حذف</button>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {view === "exams" && (
        <section aria-labelledby="eb-bank-exams-title">
          <SectionHeader level={2} id="eb-bank-exams-title" title="الامتحانات المحفوظة" count={savedExams ? savedExams.length : undefined} description="الامتحانات التي حفظتها من باني الامتحان. الفتح يتابع التعديل في الباني."
            actions={<><button type="button" className="eb-button is-primary is-small" onClick={onOpenBuilder}><IconBuilder size={16} aria-hidden="true" />إنشاء امتحان جديد</button><IconButton label="تحديث" icon={<IconRefresh size={18} />} onClick={() => void loadSavedExams()} /></>} />
          {savedExams === null && <p className="eb-muted" role="status">جارٍ تحميل الامتحانات المحفوظة...</p>}
          {savedError && <p className="platform-error" role="alert">{savedError}</p>}
          {savedExams !== null && savedExams.length === 0 && !savedError && <EmptyState title="لا توجد امتحانات محفوظة بعد." description="أنشئ امتحانًا في الباني واحفظه ليظهر هنا." action={<button type="button" className="eb-button is-primary is-small" onClick={onOpenBuilder}>إنشاء امتحان جديد</button>} />}
          {savedExams !== null && savedExams.length > 0 && (
            <ul className="eb-bank-exam-list">
              {savedExams.map(item => (
                <li key={item.blobName} className="eb-bank-exam-row">
                  <div className="eb-bank-exam-main">
                    <h3 className="eb-bank-exam-title">{item.title}</h3>
                    <p className="eb-bank-exam-meta">{item.questionCount} سؤال · {item.totalMarks} علامة · آخر حفظ: {fmtDate(item.savedAt)}</p>
                  </div>
                  <div className="eb-bank-exam-actions">
                    <button type="button" className="eb-button is-primary is-small" onClick={() => void onOpenSavedExam(item)} disabled={busy}><IconBuilder size={14} aria-hidden="true" />فتح في الباني</button>
                    <button type="button" className="eb-button is-quiet is-small is-danger" onClick={() => void deleteSavedExam(item)} disabled={busy}><IconTrash size={14} aria-hidden="true" />حذف</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {view === "library" && (
        <section aria-labelledby="eb-bank-library-title">
          <SectionHeader level={2} id="eb-bank-library-title" title="المكتبة الرسمية" count={catalog ? catalog.length : undefined} description="امتحانات رسمية مضمّنة مع التطبيق، للقراءة فقط. يمكنك فتح نسخة قابلة للتعديل في الباني." />
          {catalogLoading && <p className="eb-muted" role="status">جارٍ تحميل المكتبة...</p>}
          {catalogError && <p className="platform-error" role="alert">{catalogError}</p>}
          {catalog !== null && !catalogLoading && catalog.length === 0 && !catalogError && <EmptyState compact title="المكتبة الرسمية فارغة." />}
          {catalog !== null && catalog.length > 0 && (
            <ul className="eb-bank-exam-list">
              {catalog.map(item => (
                <li key={item.libraryItemId} className="eb-bank-exam-row">
                  <div className="eb-bank-exam-main">
                    <h3 className="eb-bank-exam-title">{item.title}</h3>
                    <p className="eb-bank-exam-meta">{item.questionCount} سؤال · {item.totalMarks} علامة</p>
                  </div>
                  <div className="eb-bank-meta"><StatusBadge tone="neutral"><IconLock size={12} aria-hidden="true" /> للقراءة فقط</StatusBadge>{item.publishable === false && <StatusBadge tone="warn">يحتاج مراجعة</StatusBadge>}</div>
                  <div className="eb-bank-exam-actions">
                    <button type="button" className="eb-button is-small" onClick={() => void openLibraryCopy(item)} disabled={busy}><IconBuilder size={14} aria-hidden="true" />فتح نسخة في الباني</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Dialog open={preview !== null} title="معاينة السؤال" onClose={() => setPreview(null)} size="md"
        footer={<>{preview && !preview.official && <button type="button" className="eb-button" onClick={() => { const row = preview; setPreview(null); setActionError(""); setEditor({ mode: "edit", row }); }}><IconEdit size={16} aria-hidden="true" />تعديل</button>}<button type="button" className="eb-button is-primary" onClick={() => setPreview(null)}>إغلاق المعاينة</button></>}>
        {preview && (
          <div className="eb-bank-preview">
            <div className="eb-bank-meta">
              <StatusBadge tone="info">{sectionLabel(preview.section)}</StatusBadge>
              <StatusBadge tone="neutral">{typeLabel(preview.presentationType)}</StatusBadge>
              <StatusBadge tone="neutral">صعوبة {preview.difficulty === null ? "—" : preview.difficulty}</StatusBadge>
              <StatusBadge tone={preview.official ? "neutral" : "success"}>{preview.official ? "رسمي — للقراءة فقط" : sourceLabel(preview.sourceKind)}</StatusBadge>
            </div>
            <p className="eb-bank-preview-text">{preview.text}</p>
            {preview.presentationType === "multipleChoice" && preview.options.length > 0 && (
              <ol className="eb-bank-options">{preview.options.map(o => <li key={o.value} className={correctOptionText(preview) === o.text && o.text ? "is-correct" : ""}>{o.text}{correctOptionText(preview) === o.text && o.text ? " (الإجابة الصحيحة)" : ""}</li>)}</ol>
            )}
            {preview.presentationType !== "multipleChoice" && (
              <p className="eb-bank-hint">{Array.isArray(preview.answer?.values) && (preview.answer.values as unknown[]).length > 0 ? "الإجابات المقبولة: " + (preview.answer.values as unknown[]).map(String).join(" · ") : "التصحيح يدوي (لا توجد إجابة نموذجية)."}</p>
            )}
            <p className="eb-bank-hint">الموضوع: {preview.topic || "—"} · المعرّف: <span dir="ltr">{preview.id}</span>{preview.hasImage ? " · يحتوي صورة" : ""}</p>
          </div>
        )}
      </Dialog>

      {editor && <QuestionEditorDialog key={editor.mode === "edit" ? editor.row.id : "create"} mode={editor.mode} initial={editor.mode === "edit" ? inputFromRow(editor.row) : emptyInput()} topics={topics} busy={busy} serverError={actionError} onClose={() => { setEditor(null); setActionError(""); }} onSave={saveQuestion} />}
      {confirmDialog}
    </section>
  );
}

function QuestionEditorDialog({ mode, initial, topics, busy, serverError, onClose, onSave }: { mode: "create" | "edit"; initial: BankQuestionInput; topics: string[]; busy: boolean; serverError: string; onClose: () => void; onSave: (input: BankQuestionInput) => Promise<void> }) {
  const [input, setInput] = useState<BankQuestionInput>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [valuesText, setValuesText] = useState((initial.answer.values || []).join("\n"));
  const formId = "eb-bank-question-form";
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const listId = useId();
  const set = (patch: Partial<BankQuestionInput>) => setInput(prev => ({ ...prev, ...patch }));
  function changeType(presentationType: BankPresentationType) {
    if (presentationType === "multipleChoice") set({ presentationType, options: input.options.length >= 2 ? input.options : [{ value: "a", text: "" }, { value: "b", text: "" }], answer: { correctOptionValue: input.answer.correctOptionValue || "" } });
    else set({ presentationType, options: [], answer: { values: valuesText.split("\n").map(v => v.trim()).filter(Boolean) } });
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const next: BankQuestionInput = input.presentationType === "multipleChoice" ? input : { ...input, options: [], answer: { values: valuesText.split("\n").map(v => v.trim()).filter(Boolean) } };
    const found = validateInput(next);
    setErrors(found);
    if (found.length) return;
    void onSave(next);
  }
  const errorId = formId + "-errors";
  return (
    <Dialog open title={mode === "create" ? "إضافة سؤال إلى البنك" : "تعديل السؤال"} onClose={onClose} size="lg" initialFocusRef={textRef} describedBy={errors.length ? errorId : undefined}
      footer={<><button type="button" className="eb-button" onClick={onClose} disabled={busy}>إلغاء</button><button type="submit" form={formId} className="eb-button is-primary" disabled={busy}>{busy ? "جارٍ الحفظ..." : mode === "create" ? "إضافة السؤال" : "حفظ التعديلات"}</button></>}>
      <form id={formId} className="eb-bank-form" onSubmit={submit} noValidate>
        {(errors.length > 0 || serverError) && (
          <ul id={errorId} className="eb-bank-form-errors" role="alert">{serverError && <li>{serverError}</li>}{errors.map(e => <li key={e}>{e}</li>)}</ul>
        )}
        <label>نص السؤال
          <textarea ref={textRef} value={input.text} onChange={e => set({ text: e.target.value })} aria-invalid={errors.includes("نص السؤال مطلوب.") ? true : undefined} />
        </label>
        <div className="eb-bank-form-grid">
          <label>القسم
            <select value={input.section} onChange={e => set({ section: e.target.value as BankSection })}>{SECTIONS.map(s => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}</select></label>
          <label>الموضوع
            <input value={input.topic} onChange={e => set({ topic: e.target.value })} list={listId} dir="auto" aria-invalid={errors.includes("الموضوع مطلوب.") ? true : undefined} />
            <datalist id={listId}>{topics.map(t => <option key={t} value={t} />)}</datalist></label>
          <label>الصعوبة (1–5)
            <select value={String(input.difficulty)} onChange={e => set({ difficulty: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>{d}</option>)}</select></label>
          <label>نوع السؤال
            <select value={input.presentationType} onChange={e => changeType(e.target.value as BankPresentationType)}>{PRESENTATION_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select></label>
        </div>
        {input.presentationType === "multipleChoice" ? (
          <fieldset className="eb-bank-form" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="eb-bank-hint">الخيارات — اختر الإجابة الصحيحة</legend>
            {input.options.map((o, i) => (
              <div key={o.value} className="eb-bank-option-row">
                <input type="radio" name="eb-bank-correct" aria-label={"الخيار " + (i + 1) + " هو الإجابة الصحيحة"} checked={input.answer.correctOptionValue === o.value} onChange={() => set({ answer: { correctOptionValue: o.value } })} />
                <input value={o.text} aria-label={"نص الخيار " + (i + 1)} onChange={e => set({ options: input.options.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} />
                <IconButton label={"حذف الخيار " + (i + 1)} icon={<IconTrash size={16} />} disabled={input.options.length <= 2} onClick={() => { const options = input.options.filter((_, k) => k !== i); set({ options, answer: { correctOptionValue: options.some(x => x.value === input.answer.correctOptionValue) ? input.answer.correctOptionValue : "" } }); }} />
              </div>
            ))}
            <div><button type="button" className="eb-button is-small" disabled={input.options.length >= 12} onClick={() => set({ options: [...input.options, { value: nextOptionValue(input.options), text: "" }] })}><IconPlus size={14} aria-hidden="true" />إضافة خيار</button></div>
          </fieldset>
        ) : (
          <label>الإجابات المقبولة (سطر لكل إجابة، اتركها فارغة للتصحيح اليدوي)
            <textarea value={valuesText} onChange={e => setValuesText(e.target.value)} dir="auto" />
          </label>
        )}
      </form>
    </Dialog>
  );
}
function nextOptionValue(options: { value: string }[]): string {
  const letters = "abcdefghijkl";
  for (const l of letters) if (!options.some(o => o.value === l)) return l;
  return "o" + (options.length + 1);
}
