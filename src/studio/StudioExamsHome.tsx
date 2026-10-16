import { useEffect, useId, useRef, useState } from "react";
import { IconPlus, IconSearch, IconRefresh, IconCopy, IconUpload, IconSparkles, IconBuilder, IconTrash, IconWarning, IconCheck } from "../icons";
import { HOME_FILTERS, filterHomeExams, homeCounts, type HomeExam, type HomeFilter } from "./studioHome";
import "./studio.css";

// Phase 21F.7 — «امتحاناتي»: the Exam Studio's home, in place of the builder page's access bar. The saved exams as cards (status,
// readiness, size, last save), a search, status filters, and the four ways to start an exam (blank, academic preset, import, the AI
// composer); a legacy exam is converted to a NEW structured one (21F.9, D1). Every action is the owner's existing handler: opening goes through the same load (and its unsaved-work guard), deleting
// through the same confirmation, creating through the same entry points. The list loads once when the home appears.

type Props = {
  exams: readonly HomeExam[];
  loading: boolean;
  onRefresh: () => void;
  onOpen: (exam: HomeExam) => void;
  onDelete: (exam: HomeExam) => void;
  onCreateBlank: () => void;
  onCreateFromPreset?: () => void;
  onImport?: () => void;
  onCompose?: () => void;
  /** An exam is open in memory but the editor is closed: continue it. */
  onContinue?: () => void;
  continueTitle?: string;
  /** Phase 21F.9 (D1) — a legacy (flat) exam becomes a NEW structured exam; the original stays as it is. Absent → not offered. */
  onConvertLegacy?: (exam: HomeExam) => void;
  /** Back to the classic access bar (the layout preference). */
  onClassic?: () => void;
};

const qCount = (n: number) => (n === 1 ? "سؤال واحد" : n === 2 ? "سؤالان" : n >= 3 && n <= 10 ? n + " أسئلة" : n + " سؤالًا");
const mCount = (n: number) => (n === 1 ? "علامة واحدة" : n === 2 ? "علامتان" : n >= 3 && n <= 10 ? n + " علامات" : n + " علامة");
const fmtDate = (v: string) => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" }) : "غير معروف"; };

export default function StudioExamsHome(p: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HomeFilter>("all");
  const searchId = "st-home-search-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  // Load once when the home appears (the owner's refresh; later refreshes are the teacher's «تحديث»).
  const initialRefresh = useRef(p.onRefresh);
  useEffect(() => { initialRefresh.current(); }, []);
  const counts = homeCounts(p.exams);
  const visible = filterHomeExams(p.exams, filter, query);
  const creators = [
    { key: "blank", label: "امتحان فارغ", note: "ابدأ بقسم واحد وأضف أسئلتك.", icon: <IconPlus size={20} />, run: p.onCreateBlank },
    { key: "preset", label: "من قالب أكاديمي", note: "تصميم محفوظ: المواضيع والأهداف والأقسام.", icon: <IconCopy size={20} />, run: p.onCreateFromPreset },
    { key: "import", label: "استيراد ملف", note: "امتحان منظّم من ملف JSON أو HTML.", icon: <IconUpload size={20} />, run: p.onImport },
    { key: "compose", label: "المؤلف الذكي", note: "صِف الامتحان ودع الذكاء الاصطناعي يقترحه.", icon: <IconSparkles size={20} />, run: p.onCompose }
  ].filter((c): c is typeof c & { run: () => void } => !!c.run);

  return (
    <section className="st-home" dir="rtl" aria-labelledby="st-home-title" data-studio-home>
      <header className="st-home-head">
        <div>
          <h2 id="st-home-title">امتحاناتي</h2>
          <p>أنشئ امتحانًا جديدًا أو تابع العمل على امتحان محفوظ.</p>
        </div>
        <div className="st-row-actions">
          {p.onClassic && <button type="button" className="st-btn is-ghost" onClick={p.onClassic}>الواجهة الكلاسيكية</button>}
        </div>
      </header>

      {p.onContinue && (
        <div className="st-home-continue" role="note">
          <span><b>امتحان مفتوح لم يُغلق:</b> {p.continueTitle?.trim() || "امتحان بلا عنوان"}</span>
          <button type="button" className="st-btn is-primary" onClick={p.onContinue}><IconBuilder size={16} aria-hidden="true" />متابعة التحرير</button>
        </div>
      )}

      <ul className="st-home-create" aria-label="إنشاء امتحان">
        {creators.map(c => (
          <li key={c.key}>
            <button type="button" className={"st-create" + (c.key === "compose" ? " is-ai" : "")} onClick={c.run} data-create={c.key}>
              <span className="st-create-ic" aria-hidden="true">{c.icon}</span>
              <b>{c.label}</b>
              <span>{c.note}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="st-home-bar">
        <label className="st-home-search" htmlFor={searchId}>
          <IconSearch size={16} aria-hidden="true" />
          <span className="st-visually-hidden">ابحث في امتحاناتك</span>
          <input id={searchId} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث بعنوان الامتحان…" />
        </label>
        <div className="st-home-filters" role="group" aria-label="تصفية حسب الحالة">
          {HOME_FILTERS.filter(f => f.key === "all" || counts[f.key] > 0 || filter === f.key).map(f => (
            <button key={f.key} type="button" className="st-filter" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label} <span className="st-filter-n">{counts[f.key]}</span></button>
          ))}
        </div>
        <button type="button" className="st-icon-btn" onClick={p.onRefresh} disabled={p.loading} aria-label="تحديث القائمة" title="تحديث القائمة"><IconRefresh size={18} /></button>
      </div>

      <p className="st-visually-hidden" role="status" aria-live="polite">{p.loading ? "جارٍ تحميل الامتحانات…" : visible.length + " من " + p.exams.length + " امتحان"}</p>
      {p.loading && p.exams.length === 0 ? <p className="st-home-empty">جارٍ تحميل الامتحانات…</p>
        : p.exams.length === 0 ? <p className="st-home-empty">لا توجد امتحانات محفوظة بعد. ابدأ بإحدى الطرق أعلاه.</p>
        : visible.length === 0 ? <p className="st-home-empty">لا توجد امتحانات تطابق البحث أو التصفية.</p>
        : (
          <ul className="st-exam-grid" aria-label="الامتحانات المحفوظة">
            {visible.map(e => <ExamCard key={e.blobName} exam={e} onOpen={() => p.onOpen(e)} onDelete={() => p.onDelete(e)} onConvert={p.onConvertLegacy ? () => p.onConvertLegacy?.(e) : undefined} />)}
          </ul>
        )}
    </section>
  );
}

function ExamCard({ exam: e, onOpen, onDelete, onConvert }: { exam: HomeExam; onOpen: () => void; onDelete: () => void; onConvert?: () => void }) {
  const legacy = e.kind === "legacy", final = !legacy && e.status === "final";
  const r = legacy ? null : e.readiness;
  const titleId = "st-exam-" + e.blobName.replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <li className={"st-exam-card" + (final ? " is-final" : "")} data-exam-id={e.examId} aria-labelledby={titleId}>
      <div className="st-exam-tags">
        <span className={"st-chip" + (final ? " is-teal" : "")}>{legacy ? "امتحان قديم (غير منظّم)" : final ? "معتمد نهائيًا" : "مسودة"}</span>
        {r && !final && (r.canFinalize
          ? <span className="st-chip is-teal"><IconCheck size={12} aria-hidden="true" />جاهز للاعتماد</span>
          : <span className="st-chip is-error"><IconWarning size={12} aria-hidden="true" />{r.blockers === 1 ? "عائق واحد" : r.blockers + " عوائق"}</span>)}
      </div>
      <h3 id={titleId}>{e.title}</h3>
      <p className="st-exam-meta">{qCount(e.questionCount)} · {mCount(e.totalMarks)}</p>
      <p className="st-exam-date">آخر حفظ: {fmtDate(e.savedAt)}</p>
      <div className="st-exam-actions">
        {legacy && onConvert
          ? <>
              <button type="button" className="st-btn is-primary is-small" onClick={onConvert} aria-describedby={titleId}><IconBuilder size={14} aria-hidden="true" />تحويل إلى منظّم</button>
              <button type="button" className="st-btn is-small" onClick={onOpen} aria-describedby={titleId}>فتح كما هو</button>
            </>
          : <button type="button" className="st-btn is-primary is-small" onClick={onOpen} aria-describedby={titleId}><IconBuilder size={14} aria-hidden="true" />فتح</button>}
        <button type="button" className="st-btn is-ghost is-small is-danger" onClick={onDelete} aria-label={"حذف «" + e.title + "»"}><IconTrash size={14} aria-hidden="true" />حذف</button>
      </div>
    </li>
  );
}
