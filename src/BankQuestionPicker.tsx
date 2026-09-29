import { useEffect, useId, useMemo, useRef, useState } from "react";
import { bankFiltersFromFocus, type BankPickerFocus } from "./bankPickerFocus";
import Dialog from "./ui/Dialog";
import StatusBadge from "./ui/StatusBadge";
import {
  type BankQuestionRow, type BankFilters, EMPTY_FILTERS, PRESENTATION_TYPES, SECTIONS, SECTION_LABELS, TYPE_LABELS, SOURCE_LABELS,
  filterRows, distinctTopics, correctOptionText, sectionLabel, typeLabel, sourceLabel
} from "./bank/bankQuestionModel";
import { isValidQuestionMarks, MAX_BANK_SELECT, type BankExamQuestion } from "./structuredExamProductivity";

// Phase 13B — "إضافة من بنك الأسئلة": a SELECTION experience over the EXISTING Question Bank for inserting a batch of
// questions into the open structured exam. It is not the bank management page. The bank is loaded lazily on first open
// through App-owned authenticated callbacks (the builder never holds a token); rows are the existing GET
// /api/bank-questions projection (the same labels / filters as the management page); insertion retrieves the CANONICAL
// questions by exact id (the new bank-question-select endpoint → buildExamQuestion) and hands them to the owner, which
// applies ONE functional updater. A bank question already used in the exam (exact bankQuestionId) is shown as مضاف and
// cannot be selected. A failed request leaves the exam untouched and the selection in place for a retry.

export type BankPickerService = { list: () => Promise<BankQuestionRow[]>; select: (ids: string[]) => Promise<BankExamQuestion[]> };
export type InsertOutcome = "ok" | "missing-target" | "already-used" | "stale";
export const ALREADY_USED_MESSAGE = "أحد الأسئلة المحددة أُضيف إلى الامتحان أثناء العملية. راجع التحديد ثم أعد المحاولة.";
type Props = {
  open: boolean;
  onClose: () => void;
  service: BankPickerService;
  sections: { id: string; title: string }[];
  usedBankQuestionIds: ReadonlySet<string>;
  /** Owner applies the batch in ONE updater; exam id, target and exact bank duplicates are re-validated against the LATEST
   *  exam there. The outcome may be deferred (a promise settled once the updater's decision is committed): "ok" is only
   *  ever reported for a batch the exam authority actually applied. */
  onInsert: (questions: BankExamQuestion[], targetSectionId: string, marks: number) => InsertOutcome | Promise<InsertOutcome>;
  /** Phase 13C-B — optional EXACT initial filter (topic id / difficulty / bank presentation type) from a live coverage row.
   *  Only prefills the filters; the teacher edits them freely and nothing is selected or inserted automatically. */
  focus?: BankPickerFocus;
};

const NO_ROWS: BankQuestionRow[] = [];

export default function BankQuestionPicker({ open, onClose, service, sections, usedBankQuestionIds, onInsert, focus }: Props) {
  const uid = useId();
  const [rows, setRows] = useState<BankQuestionRow[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadSeq, setLoadSeq] = useState(0);
  const [filters, setFilters] = useState<BankFilters & { topic: string }>(() => bankFiltersFromFocus(focus));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<BankQuestionRow | null>(null);
  const [target, setTarget] = useState(() => sections[0]?.id ?? "");
  const [marks, setMarks] = useState("1");
  const [busy, setBusy] = useState(false);
  const [insertError, setInsertError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // Lazy load on first open (and on explicit retry via loadSeq). Loading is DERIVED (rows === null && !error): the effect
  // only starts the request; results are applied asynchronously and ignored once unmounted / superseded.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    service.list()
      .then(list => { if (!cancelled && mounted.current) { setRows(list || []); setLoadError(""); } })
      .catch(e => { if (!cancelled && mounted.current) setLoadError(e instanceof Error ? e.message : "تعذر تحميل بنك الأسئلة."); });
    return () => { cancelled = true; };
  }, [open, service, loadSeq]);
  const loading = open && rows === null && !loadError;

  const list = rows ?? NO_ROWS;
  const topics = useMemo(() => distinctTopics(list), [list]);
  const visible = useMemo(() => filterRows(list, filters).filter(r => !filters.topic || r.topic === filters.topic), [list, filters]);
  const filtered = !!(filters.q || filters.section || filters.type || filters.difficulty || filters.source || filters.topic);
  const targetValid = sections.some(s => s.id === target);
  const marksValue = marks.trim() === "" ? NaN : Number(marks);
  const marksValid = isValidQuestionMarks(marksValue);
  // Effective selection = selected minus the ids the LATEST exam already uses (derived every render, never stored, never
  // stale): a question that became مضاف while the picker stayed open is not counted, not shown checked, never submitted.
  const effective = useMemo(() => {
    let changed = false;
    const next = new Set<string>();
    for (const id of selected) { if (usedBankQuestionIds.has(id)) changed = true; else next.add(id); }
    return changed ? next : selected;
  }, [selected, usedBankQuestionIds]);
  const canInsert = effective.size > 0 && effective.size <= MAX_BANK_SELECT && targetValid && marksValid && !busy;

  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else if (!usedBankQuestionIds.has(id)) next.add(id); return next; });
  const selectVisible = () => setSelected(prev => { const next = new Set(prev); for (const r of visible) if (!usedBankQuestionIds.has(r.id)) next.add(r.id); return next; });

  async function insert() {
    if (!canInsert) return;
    const ids = list.filter(r => effective.has(r.id)).map(r => r.id);  // list order (deterministic), exact ids only, never a used one
    setBusy(true); setInsertError("");
    try {
      const canonical = await service.select(ids);
      if (!mounted.current) return;                                   // the exam changed / picker gone: never apply
      const outcome = await onInsert(canonical, target, marksValue);   // settled only once the exam authority decided
      if (!mounted.current) return;
      if (outcome === "ok") { setSelected(new Set()); onClose(); return; }
      if (outcome === "missing-target") { setTarget(""); setInsertError("القسم المستهدف لم يعد موجودًا. اختر قسمًا آخر ثم أعد المحاولة."); return; }
      if (outcome === "already-used") { setInsertError(ALREADY_USED_MESSAGE); return; }              // selection kept (minus the used ids)
      setInsertError("تغيّر الامتحان المفتوح، أعد المحاولة.");
    } catch (e) {
      if (mounted.current) setInsertError(e instanceof Error ? e.message : "تعذر جلب الأسئلة من البنك.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} size="lg" title="إضافة من بنك الأسئلة" className="sb-picker"
        footer={
          <>
            {busy && <span className="sb-hint sb-picker-busy" role="status">جارٍ الإدراج…</span>}
            <button type="button" className="eb-button" onClick={onClose} disabled={busy}>إلغاء</button>
            <button type="button" className="eb-button is-primary" onClick={() => { void insert(); }} disabled={!canInsert} aria-busy={busy || undefined}>{"إضافة " + effective.size + " أسئلة"}</button>
          </>
        }>
        <div className="sb-picker-body">
          <div className="sb-picker-toolbar">
            <input type="search" className="sb-input" aria-label="ابحث في بنك الأسئلة" placeholder="ابحث في نص السؤال أو الموضوع أو المعرّف" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} />
            <label className="sb-nav-filter" htmlFor={uid + "-section"}><span>القسم</span>
              <select id={uid + "-section"} className="sb-input sb-input-sm" value={filters.section} onChange={e => setFilters(f => ({ ...f, section: e.target.value }))}><option value="">الكل</option>{SECTIONS.map(s => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}</select></label>
            <label className="sb-nav-filter" htmlFor={uid + "-type"}><span>النوع</span>
              <select id={uid + "-type"} className="sb-input sb-input-sm" value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}><option value="">الكل</option>{PRESENTATION_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select></label>
            <label className="sb-nav-filter" htmlFor={uid + "-difficulty"}><span>الصعوبة</span>
              <select id={uid + "-difficulty"} className="sb-input sb-input-sm" value={filters.difficulty} onChange={e => setFilters(f => ({ ...f, difficulty: e.target.value }))}><option value="">الكل</option>{["1", "2", "3", "4", "5"].map(d => <option key={d} value={d}>مستوى {d}</option>)}</select></label>
            <label className="sb-nav-filter" htmlFor={uid + "-source"}><span>المصدر</span>
              <select id={uid + "-source"} className="sb-input sb-input-sm" value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}><option value="">الكل</option>{(["official", "import", "manual"] as const).map(k => <option key={k} value={k}>{SOURCE_LABELS[k]}</option>)}</select></label>
            <label className="sb-nav-filter" htmlFor={uid + "-topic"}><span>الموضوع</span>
              <select id={uid + "-topic"} className="sb-input sb-input-sm" value={filters.topic} onChange={e => setFilters(f => ({ ...f, topic: e.target.value }))}><option value="">الكل</option>{topics.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
            <button type="button" className="sb-btn sb-btn-sm" onClick={() => setFilters({ ...EMPTY_FILTERS, topic: "" })} disabled={!filtered}>مسح الفلاتر</button>
          </div>

          {loading && <p className="sb-hint" role="status">جارٍ تحميل بنك الأسئلة...</p>}
          {loadError && <p className="sb-banner sb-banner-error" role="alert">{loadError} <button type="button" className="sb-btn sb-btn-sm" onClick={() => { setLoadError(""); setRows(null); setLoadSeq(n => n + 1); }}>إعادة المحاولة</button></p>}
          {!loading && !loadError && list.length === 0 && <p className="sb-nav-empty">بنك الأسئلة فارغ.</p>}
          {!loading && !loadError && list.length > 0 && visible.length === 0 && <p className="sb-nav-empty">لا توجد أسئلة مطابقة.</p>}

          <div className="sb-picker-selbar">
            <span className="sb-stat sb-picker-count">{effective.size} أسئلة محددة</span>
            <button type="button" className="sb-btn sb-btn-sm" onClick={selectVisible} disabled={!visible.length}>تحديد الظاهر</button>
            <button type="button" className="sb-btn sb-btn-sm" onClick={() => setSelected(new Set())} disabled={!effective.size}>إلغاء التحديد</button>
            <span className="sb-hint">الحدّ الأقصى {MAX_BANK_SELECT} سؤالًا في المرة الواحدة.</span>
          </div>

          {!loading && !loadError && visible.length > 0 && (
            <div className="sb-picker-table-wrap">
              <table className="sb-picker-table">
                <thead><tr><th scope="col"><span className="eb-visually-hidden">اختيار</span></th><th scope="col">السؤال</th><th scope="col">القسم</th><th scope="col">الموضوع</th><th scope="col">النوع</th><th scope="col">الصعوبة</th><th scope="col">المصدر</th><th scope="col"><span className="eb-visually-hidden">إجراءات</span></th></tr></thead>
                <tbody>
                  {visible.map(row => {
                    const used = usedBankQuestionIds.has(row.id);
                    const checked = effective.has(row.id);
                    return (
                      <tr key={row.id} className={(checked ? "is-selected " : "") + (used ? "is-used" : "")}>
                        <td><input type="checkbox" checked={checked} disabled={used || busy} onChange={() => toggle(row.id)} aria-label={"اختيار السؤال: " + row.text} /></td>
                        <td>
                          <span className="sb-picker-text" title={row.text}>{row.text || "—"}</span>
                          <span className="sb-picker-sub">{row.questionNumber ? "سؤال " + row.questionNumber + " · " : ""}<span dir="ltr">{row.id}</span>{row.hasImage && <span className="sb-picker-img" role="img" aria-label="تحتوي صورة" title="تحتوي صورة">🖼</span>}{used && <StatusBadge tone="success">مضاف</StatusBadge>}</span>
                        </td>
                        <td>{sectionLabel(row.section)}</td>
                        <td>{row.topic || "—"}</td>
                        <td>{typeLabel(row.presentationType)}</td>
                        <td className="sb-picker-num">{row.difficulty === null ? "—" : row.difficulty}</td>
                        <td><StatusBadge tone={row.official ? "neutral" : row.sourceKind === "manual" ? "success" : "info"}>{sourceLabel(row.sourceKind)}</StatusBadge></td>
                        <td><button type="button" className="eb-button is-quiet is-small" onClick={() => setPreview(row)}>معاينة</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="sb-picker-target">
            <label className="sb-inline"><span>القسم الهدف</span>
              <select className="sb-input sb-input-sm" aria-label="القسم الهدف" value={targetValid ? target : ""} onChange={e => { setTarget(e.target.value); setInsertError(""); }} disabled={busy}>
                <option value="">اختر القسم…</option>
                {sections.map(s => <option key={s.id} value={s.id}>{s.title || "قسم"}</option>)}
              </select></label>
            <label className="sb-inline"><span>العلامة لكل سؤال</span><input className="sb-input sb-input-xs" type="number" step="0.25" min="0.25" aria-label="العلامة لكل سؤال" value={marks} onChange={e => setMarks(e.target.value)} disabled={busy} /></label>
            {!marksValid && <span className="sb-bulk-error">العلامة يجب أن تكون رقمًا أكبر من صفر.</span>}
          </div>
          {insertError && <p className="sb-banner sb-banner-error" role="alert">{insertError}</p>}
        </div>
      </Dialog>

      <Dialog open={preview !== null} onClose={() => setPreview(null)} size="md" title="معاينة السؤال" className="sb-picker-preview">
        {preview && (
          <div className="eb-bank-preview">
            <div className="eb-bank-meta">
              <StatusBadge tone="neutral">{sectionLabel(preview.section)}</StatusBadge>
              <StatusBadge tone="info">{typeLabel(preview.presentationType)}</StatusBadge>
              {preview.topic && <StatusBadge tone="neutral">{preview.topic}</StatusBadge>}
              {preview.difficulty !== null && <StatusBadge tone="neutral">صعوبة {preview.difficulty}</StatusBadge>}
              <StatusBadge tone={preview.official ? "neutral" : "success"}>{sourceLabel(preview.sourceKind)}</StatusBadge>
            </div>
            <p className="eb-bank-preview-text">{preview.text}</p>
            {preview.presentationType === "multipleChoice" && (
              <ol className="eb-bank-options">{preview.options.map(o => <li key={o.value} className={correctOptionText(preview) === o.text ? "is-correct" : ""}>{o.text}{correctOptionText(preview) === o.text ? " ✓" : ""}</li>)}</ol>
            )}
            {(preview.presentationType === "fillBlank" || preview.presentationType === "wordBank") && (
              <ul className="eb-bank-options">{preview.fields.map((f, i) => <li key={f.id || i}>{f.label || "الفراغ " + (i + 1)}: <strong>{f.correct}</strong></li>)}</ul>
            )}
            {preview.presentationType === "wordBank" && preview.wordBank.length > 0 && <p className="sb-hint">بنك الكلمات: {preview.wordBank.join(" · ")}</p>}
            {preview.presentationType === "open" && Array.isArray(preview.answer?.values) && (preview.answer.values as unknown[]).length > 0 && <p className="sb-hint">إجابات مقبولة: {(preview.answer.values as unknown[]).map(String).join(" · ")}</p>}
            {preview.hasImage && <p className="sb-hint">يحتوي هذا السؤال على صورة تُدرج معه.</p>}
          </div>
        )}
      </Dialog>
    </>
  );
}
