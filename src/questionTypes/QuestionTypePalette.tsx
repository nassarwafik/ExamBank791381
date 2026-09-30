import { useId, useMemo, useRef, useState } from "react";
import Dialog from "../ui/Dialog";
import { listQuestionTypes, type QuestionTypeCategory } from "../questionTypeCatalog";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../questionTypeAliases";
import { chipsFor, typeDescription, typeIcon } from "./typePresentation";
import "./questionTypes.css";

// Phase 16A — the Question Type Palette (lazy): one card per catalog / plugin type with icon, Arabic label, description,
// grading mode and capability chips; search, category tabs, arrow-key navigation, empty state, RTL, narrow screens. UI state
// lives here only — nothing is persisted into the exam. Selecting a card hands the KEY to the host, which creates the
// question through the canonical factory.
type Props = { open: boolean; onClose: () => void; onPick: (key: string) => void };
const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[ً-ْ]/g, "").replace(/\s+/g, " ").trim();

export default function QuestionTypePalette({ open, onClose, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<QuestionTypeCategory | "all">("all");
  const listRef = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const types = useMemo(() => listQuestionTypes(), []);
  const visible = useMemo(() => {
    const q = norm(query);
    return types.filter(d => (category === "all" || d.category === category) && (!q || norm(d.label).includes(q) || norm(typeDescription(d)).includes(q) || d.key.toLowerCase().includes(q)));
  }, [types, query, category]);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const cards = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-testid=qt-card]") ?? []);
    const i = cards.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0 || !cards.length) return;
    let next = i;
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = Math.min(cards.length - 1, i + 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowRight") next = Math.max(0, i - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = cards.length - 1;
    else return;
    e.preventDefault(); cards[next].focus();
  };
  const categories: (QuestionTypeCategory | "all")[] = ["all", ...CATEGORY_ORDER];
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="إضافة سؤال" className="qt-palette-dialog">
      <div className="qt-palette" dir="rtl">
        <p className="sb-hint">اختر نوع السؤال. يعرض كل بطاقة طريقة التصحيح والقدرات المتاحة للنوع.</p>
        <div className="qt-palette-tools">
          <label className="qt-search" htmlFor={searchId}><span className="iex-visually-hidden">ابحث عن نوع سؤال</span><input id={searchId} type="search" className="sb-input" role="searchbox" aria-label="ابحث عن نوع سؤال" placeholder="ابحث عن نوع سؤال…" value={query} onChange={e => setQuery(e.target.value)} /></label>
          <div className="qt-tabs" role="tablist" aria-label="فئات الأنواع">
            {categories.map(c => <button key={c} type="button" role="tab" aria-selected={category === c} className={"qt-tab" + (category === c ? " is-active" : "")} onClick={() => setCategory(c)}>{c === "all" ? "الكل" : CATEGORY_LABELS[c]}</button>)}
          </div>
        </div>
        {visible.length === 0
          ? <div className="qt-empty" data-testid="qt-empty" role="status">لا توجد أنواع مطابقة لبحثك.</div>
          : <div className="qt-grid" ref={listRef} onKeyDown={onKey} role="list" aria-label="أنواع الأسئلة">
            {visible.map(d => (
              <button key={d.key} type="button" className="qt-card" data-testid="qt-card" data-type-key={d.key} onClick={() => onPick(d.key)}>
                <span className="qt-card-icon" aria-hidden="true">{typeIcon(d)}</span>
                <span className="qt-card-body">
                  <strong className="qt-card-label">{d.label}</strong>
                  <span className="qt-card-desc">{typeDescription(d)}</span>
                  <span className="qt-chips">{chipsFor(d).map(ch => <span key={ch} className="qt-chip">{ch}</span>)}</span>
                </span>
                <span className="qt-card-cat">{CATEGORY_LABELS[d.category]}</span>
              </button>
            ))}
          </div>}
      </div>
    </Dialog>
  );
}
