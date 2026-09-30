import { useId } from "react";
import { listQuestionTypes, questionTypeLabel } from "./questionTypeCatalog";
import { EMPTY_NAVIGATOR_FILTERS, filterNavigatorEntries, navigatorFiltersActive, type NavigatorEntry, type NavigatorFilters } from "./structuredExamProductivity";

// Phase 13B — the Question Navigator (مستكشف الأسئلة): a compact productivity layer over the real section / question
// editors. It renders the lightweight flattened index (never the question objects), filters ONLY its own list (the exam
// stays fully rendered), and drives selection + navigation by stable examQuestionId. No editor is recreated here.

export type NavigatorSection = { id: string; title: string };
type Props = {
  entries: NavigatorEntry[];
  sections: NavigatorSection[];
  filters: NavigatorFilters;
  onFilters: (f: NavigatorFilters) => void;
  selected: ReadonlySet<string>;
  onToggle: (examQuestionId: string) => void;
  onSelectMany: (ids: string[]) => void;
  onClearSelection: () => void;
  onNavigate: (examQuestionId: string) => void;
  /** Rendered as a plain panel (default) or inside a dialog (mobile): only affects the outer element. */
  asPanel?: boolean;
  /** DOM id of the outer element (the toolbar toggle's aria-controls). */
  id?: string;
};

const typeLabel = (t: string) => questionTypeLabel(t) || t || "—";

export default function ExamQuestionNavigator({ entries, sections, filters, onFilters, selected, onToggle, onSelectMany, onClearSelection, onNavigate, asPanel = true, id }: Props) {
  const uid = useId();
  const visible = filterNavigatorEntries(entries, filters);
  const active = navigatorFiltersActive(filters);
  const bySection = new Map<string, NavigatorEntry[]>();
  for (const e of visible) { const list = bySection.get(e.sectionId); if (list) list.push(e); else bySection.set(e.sectionId, [e]); }
  const difficulties = Array.from(new Set(entries.map(e => e.difficulty).filter((d): d is number => d !== null))).sort((a, b) => a - b);
  const set = (patch: Partial<NavigatorFilters>) => onFilters({ ...filters, ...patch });
  const body = (
    <>
      <div className="sb-nav-tools">
        <input type="search" className="sb-input sb-nav-search" aria-label="بحث في الامتحان" placeholder="بحث في الامتحان" value={filters.q} onChange={e => set({ q: e.target.value })} />
        <div className="sb-nav-filters">
          <label className="sb-nav-filter"><span>القسم</span>
            <select className="sb-input sb-input-sm" value={filters.sectionId} onChange={e => set({ sectionId: e.target.value })}><option value="">الكل</option>{sections.map(s => <option key={s.id} value={s.id}>{s.title || "قسم"}</option>)}</select></label>
          <label className="sb-nav-filter"><span>النوع</span>
            <select className="sb-input sb-input-sm" value={filters.type} onChange={e => set({ type: e.target.value })}><option value="">الكل</option>{listQuestionTypes().map(d => <option key={d.key} value={d.key}>{d.label}</option>)}</select></label>
          <label className="sb-nav-filter"><span>المصدر</span>
            <select className="sb-input sb-input-sm" value={filters.origin} onChange={e => set({ origin: e.target.value as NavigatorFilters["origin"] })}><option value="">الكل</option><option value="bank">من البنك</option><option value="manual">غير بنك</option></select></label>
          {difficulties.length > 0 && (
            <label className="sb-nav-filter"><span>الصعوبة</span>
              <select className="sb-input sb-input-sm" value={filters.difficulty} onChange={e => set({ difficulty: e.target.value })}><option value="">الكل</option>{difficulties.map(d => <option key={d} value={String(d)}>مستوى {d}</option>)}</select></label>
          )}
        </div>
        <div className="sb-nav-actions">
          <p className="sb-nav-count" role="status">{visible.length} من {entries.length} سؤالًا</p>
          {active && <button type="button" className="sb-btn sb-btn-sm" onClick={() => onFilters(EMPTY_NAVIGATOR_FILTERS)}>مسح الفلاتر</button>}
          <button type="button" className="sb-btn sb-btn-sm" onClick={() => onSelectMany(visible.map(e => e.examQuestionId))} disabled={!visible.length}>تحديد الظاهر</button>
          {selected.size > 0 && <button type="button" className="sb-btn sb-btn-sm" onClick={onClearSelection}>إلغاء التحديد</button>}
        </div>
      </div>
      {entries.length === 0 && <p className="sb-nav-empty">لا توجد أسئلة في الامتحان بعد.</p>}
      {entries.length > 0 && visible.length === 0 && <p className="sb-nav-empty">لا توجد أسئلة مطابقة.</p>}
      <div className="sb-nav-groups">
        {sections.map(s => {
          const list = bySection.get(s.id) || [];
          if (active && !list.length) return null;
          const title = s.title || "قسم";
          return (
            <div key={s.id} className="sb-nav-group" role="group" aria-label={title}>
              <div className="sb-nav-group-head">
                <span className="sb-nav-group-title">{title}</span>
                <span className="sb-nav-group-n">{list.length}</span>
                {list.length > 0 && <button type="button" className="sb-link-btn" aria-label={"تحديد القسم " + title} onClick={() => onSelectMany(list.map(e => e.examQuestionId))}>تحديد القسم</button>}
              </div>
              {list.length === 0 ? <p className="sb-nav-group-empty">لا أسئلة</p> : (
                <ul className="sb-nav-list">
                  {list.map(e => {
                    const checked = selected.has(e.examQuestionId);
                    const cid = uid + "-" + e.examQuestionId;
                    return (
                      <li key={e.examQuestionId} className={"sb-nav-item" + (checked ? " is-selected" : "")}>
                        <input id={cid} type="checkbox" className="sb-nav-check" checked={checked} onChange={() => onToggle(e.examQuestionId)} aria-label={"تحديد: " + (e.text || "سؤال " + e.number)} />
                        <button type="button" className="sb-nav-jump" onClick={() => onNavigate(e.examQuestionId)}>
                          <span className="sb-nav-num">{e.number}</span>
                          <span className="sb-nav-text">{e.text || "(بلا نص)"}</span>
                          <span className="sb-nav-meta">{typeLabel(e.presentationType)}{e.marks !== null ? " · " + e.marks + " علامة" : ""}</span>
                          {e.origin === "bank" && <span className="sb-nav-badge">بنك</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
  return asPanel ? <aside id={id} className="sb-navigator" aria-label="مستكشف الأسئلة">{body}</aside> : <div id={id} className="sb-navigator sb-navigator-dialog">{body}</div>;
}
