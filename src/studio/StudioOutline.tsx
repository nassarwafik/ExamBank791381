import { memo, useId, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { BuilderSection } from "../examTypes";
import type { StructuredIssue } from "../examQuality";
import { questionLabelOf } from "../builder/issueIndex";
import { sectionMaxMarks } from "../examBuilderState";
import { IconSearch, IconPlus, IconGrip } from "../icons";
import { StatusDot, type IssueTone } from "./StudioPrimitives";
import StudioTypeIcon from "./StudioTypeIcon";

// Phase 21F.3 — the Studio outline («هيكل الامتحان»): every section and question with its marks and canonical issue state, at one
// glance. An ARIA tree (one Tab stop; ↑ / ↓ move, Home / End, Enter / Space opens the item; typing a letter jumps to the next item
// starting with it). Selecting a question opens it in the canvas; selecting a section opens its settings. The search narrows the
// list by prompt text, display number or type. Memoized: it re-renders only when the exam, the active item or the issues change.

type Props = {
  sections: readonly BuilderSection[];
  activeId: string | null;
  activeSectionId: string | null;
  selectedIds: ReadonlySet<string>;
  issuesOf: ReadonlyMap<string, readonly StructuredIssue[]>;
  readiness: { ok: number; warn: number; error: number; total: number; canFinalize: boolean };
  totalMarks: number;
  disabled: boolean;
  onOpenQuestion: (questionId: string) => void;
  onOpenSection: (sectionId: string) => void;
  onAddSection: () => void;
  /** Phase 21F.5 — drag-and-drop: put a question before the item at `toIndex` of a section (≥ length: last). */
  onPlace?: (questionId: string, toSectionId: string, toIndex: number) => void;
  /** Phase 21F.5 — Alt + ↑ / ↓ on a row: one place up / down (across section boundaries). */
  onNudge?: (questionId: string, delta: -1 | 1) => void;
};
type Drop = { sectionId: string; index: number; at: string };

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[ً-ْ]/g, "").replace(/\s+/g, " ").trim();
const toneOf = (issues: readonly StructuredIssue[] | undefined): IssueTone => (!issues?.length ? "ok" : issues.some(i => i.severity === "error") ? "error" : "warn");
const marksOf = (n: number) => (Number.isFinite(n) ? n : 0);

export default memo(StudioOutline);

function StudioOutline({ sections, activeId, activeSectionId, selectedIds, issuesOf, readiness, totalMarks, disabled, onOpenQuestion, onOpenSection, onAddSection, onPlace, onNudge }: Props) {
  // Phase 21F.5 — drag-and-drop (pointer): the dragged question and where it would land (before / after a row, or a section's top).
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  // A moved row keeps keyboard focus (a move to another section re-creates its row).
  const refocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    treeRef.current?.querySelector<HTMLElement>('[data-outline-question="' + CSS.escape(id) + '"]')?.focus();
  });
  const canDrag = !!onPlace && !disabled;
  const dragOverRow = (e: DragEvent<HTMLElement>, sectionId: string, index: number, id: string) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    const next = { sectionId, index: after ? index + 1 : index, at: (after ? "after:" : "before:") + id };
    if (!drop || drop.at !== next.at) setDrop(next);
  };
  const finishDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (dragId && drop) { refocus.current = dragId; onPlace?.(dragId, drop.sectionId, drop.index); }
    setDragId(null); setDrop(null);
  };
  const [query, setQuery] = useState("");
  const searchId = useId();
  const treeRef = useRef<HTMLUListElement>(null);
  const q = norm(query);
  const visible = useMemo(() => sections.map(s => ({
    section: s,
    questions: s.questions.map((question, index) => ({ question, index })).filter(({ question, index }) => !q
      || norm(question.text || "").includes(q) || norm(questionLabelOf(question.displayNumber, index)) === q || norm(String(question.presentationType)).includes(q))
  })).filter(g => !q || g.questions.length > 0), [sections, q]);
  const questionCount = sections.reduce((n, s) => n + s.questions.length, 0);
  // Roving focus: the active item, else the first item, is the tree's one Tab stop.
  const focusKey = activeId ? "q:" + activeId : activeSectionId ? "s:" + activeSectionId : visible[0] ? "s:" + visible[0].section.id : "";
  const items = () => Array.from(treeRef.current?.querySelectorAll<HTMLElement>("[role=treeitem]") ?? []);
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const rowId = list[i].dataset.outlineQuestion;
    if (e.altKey && rowId && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault(); e.stopPropagation();
      if (!disabled && onNudge) { refocus.current = rowId; onNudge(rowId, e.key === "ArrowUp" ? -1 : 1); }
      return;
    }
    let next = -1;
    if (e.key === "ArrowDown") next = Math.min(list.length - 1, i + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, i - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); list[i].click(); return; }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const ch = norm(e.key);
      const order = [...list.slice(i + 1), ...list.slice(0, i + 1)];
      const hit = order.find(el => norm(el.dataset.name || "").startsWith(ch));
      if (hit) { e.preventDefault(); hit.focus(); }
      return;
    }
    else return;
    e.preventDefault();
    list[next]?.focus();
  };
  const readyShare = readiness.total ? Math.round(((readiness.ok + readiness.warn) / readiness.total) * 100) : 0;
  return (
    <aside className="st-outline" aria-label="هيكل الامتحان">
      <div className="st-outline-head">
        <div className="st-outline-title"><h2>هيكل الامتحان</h2></div>
        <label className="st-search" htmlFor={searchId}>
          <IconSearch size={15} aria-hidden="true" />
          <span className="st-visually-hidden">ابحث في الأسئلة</span>
          <input id={searchId} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث في الأسئلة…" />
        </label>
        <div className="st-totals" aria-label="ملخص الامتحان">
          <span className="st-total">{sections.length} {sections.length === 1 ? "قسم" : sections.length === 2 ? "قسمان" : "أقسام"}</span>
          <span className="st-total">{questionCount} {questionCount === 1 ? "سؤال" : questionCount >= 3 && questionCount <= 10 ? "أسئلة" : "سؤالًا"}</span>
          <span className="st-total">{totalMarks} علامة</span>
        </div>
        <div className="st-ready">
          <div className="st-ready-row"><span>{readiness.canFinalize ? "جاهز للاعتماد" : readiness.error ? readiness.error + (readiness.error === 1 ? " سؤال يحتاج إصلاحًا" : " أسئلة تحتاج إصلاحًا") : "يحتاج مراجعة قبل الاعتماد"}</span><b>{readyShare}%</b></div>
          <div className="st-meter" role="img" aria-label={"الأسئلة السليمة " + (readiness.ok + readiness.warn) + " من " + readiness.total}><i style={{ inlineSize: readyShare + "%" }} /></div>
        </div>
      </div>
      {visible.length === 0
        ? <p className="st-empty-filter" role="status">لا توجد أسئلة مطابقة لبحثك.</p>
        : (
          <ul className="st-tree" role="tree" aria-label="الأقسام والأسئلة" ref={treeRef} onKeyDown={onKeyDown}>
            {visible.map(({ section, questions }) => {
              const si = sections.indexOf(section);
              const sKey = "s:" + section.id;
              return (
                <li key={section.id} className="st-tree-section" role="treeitem" aria-level={1} aria-expanded="true" aria-selected={activeSectionId === section.id && !activeId}
                  tabIndex={focusKey === sKey ? 0 : -1} data-name={section.title || "القسم"} data-outline-section={section.id}
                  aria-label={"القسم " + (si + 1) + ": " + (section.title || "قسم بلا عنوان") + "، " + questions.length + " من الأسئلة"}
                  onClick={e => { if (e.target === e.currentTarget || (e.target as HTMLElement).closest(".st-tree-section-head")) onOpenSection(section.id); }}>
                  <div className={"st-tree-section-head" + (drop?.at === "top:" + section.id ? " is-drop-before" : "")}
                    onDragOver={e => { if (!dragId) return; e.preventDefault(); if (drop?.at !== "top:" + section.id) setDrop({ sectionId: section.id, index: 0, at: "top:" + section.id }); }}
                    onDrop={finishDrop}>
                    <span className="st-sec-badge">{si + 1}</span>
                    <span className="st-t">{section.title || "قسم بلا عنوان"}</span>
                    <span className="st-m">{marksOf(sectionMaxMarks(section))} ع</span>
                  </div>
                  <ul role="group">
                    {questions.map(({ question, index }) => {
                      const id = question.examQuestionId;
                      const label = questionLabelOf(question.displayNumber, index);
                      const tone = toneOf(issuesOf.get(id));
                      const text = (question.text || "").trim();
                      return (
                        <li key={id} role="treeitem" aria-level={2} aria-selected={activeId === id} aria-current={activeId === id ? "true" : undefined}
                          className={"st-row" + (selectedIds.has(id) ? " is-selected" : "") + (dragId === id ? " is-dragging" : "") + (drop?.at === "before:" + id ? " is-drop-before" : drop?.at === "after:" + id ? " is-drop-after" : "")}
                          tabIndex={focusKey === "q:" + id ? 0 : -1}
                          draggable={canDrag} aria-roledescription={canDrag ? "عنصر قابل للسحب" : undefined}
                          onDragStart={e => { if (!canDrag) return; setDragId(id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", id); } catch { /* some engines refuse */ } }}
                          onDragOver={e => dragOverRow(e, section.id, index, id)}
                          onDrop={finishDrop}
                          onDragEnd={() => { setDragId(null); setDrop(null); }}
                          data-name={text || label} data-outline-question={id}
                          aria-label={"السؤال " + label + ": " + (text || "سؤال بلا نص") + "، " + question.marks + " علامة، " + (tone === "ok" ? "سليم" : tone === "warn" ? "فيه تنبيه" : "فيه خطأ")}
                          onClick={e => { e.stopPropagation(); if (!disabled) onOpenQuestion(id); }}>
                          <span className="st-grip" aria-hidden="true"><IconGrip size={14} /></span>
                          <span className="st-tile" aria-hidden="true">{label}</span>
                          <span className="st-type" aria-hidden="true"><StudioTypeIcon type={question.presentationType} size={14} /></span>
                          <span className={"st-text" + (text ? "" : " is-empty")} aria-hidden="true">{text || "سؤال بلا نص"}</span>
                          <span className="st-marks" aria-hidden="true">{question.marks}</span>
                          <span aria-hidden="true"><StatusDot tone={tone} /></span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      <div className="st-outline-foot">
        <button type="button" className="st-add-zone" onClick={onAddSection} disabled={disabled} data-add-section><IconPlus size={15} aria-hidden="true" />قسم جديد</button>
      </div>
    </aside>
  );
}
