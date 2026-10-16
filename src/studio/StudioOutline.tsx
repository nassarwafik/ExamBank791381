import { memo, useId, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { BuilderQuestion, BuilderSection } from "../examTypes";
import type { StructuredIssue } from "../examQuality";
import { questionLabelOf } from "../builder/issueIndex";
import { sectionMaxMarks } from "../examBuilderState";
import { IconSearch, IconPlus, IconGrip } from "../icons";
import { StatusDot, type IssueTone } from "./StudioPrimitives";
import StudioTypeIcon from "./StudioTypeIcon";
import type { QuestionReadiness } from "./studioReview";

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
  readiness: QuestionReadiness;
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

type RowEvents = {
  dragStart: (e: DragEvent<HTMLElement>, id: string) => void;
  dragOver: (e: DragEvent<HTMLElement>, sectionId: string, index: number, id: string) => void;
  drop: (e: DragEvent<HTMLElement>) => void;
  dragEnd: () => void;
  open: (id: string) => void;
};

export default memo(StudioOutline);

/** One question row: memoized on plain values, so only the rows whose content or state changed re-render. */
const OutlineRow = memo(function OutlineRow({ id, sectionId, index, label, text, marks, type, tone, active, selected, focusable, dragging, dropMark, canDrag, events }: {
  id: string; sectionId: string; index: number; label: string; text: string; marks: number; type: BuilderQuestion["presentationType"]; tone: IssueTone;
  active: boolean; selected: boolean; focusable: boolean; dragging: boolean; dropMark: "before" | "after" | null; canDrag: boolean; events: RowEvents;
}) {
  return (
    <li role="treeitem" aria-level={2} aria-selected={active} aria-current={active ? "true" : undefined}
      className={"st-row" + (selected ? " is-selected" : "") + (dragging ? " is-dragging" : "") + (dropMark === "before" ? " is-drop-before" : dropMark === "after" ? " is-drop-after" : "")}
      tabIndex={focusable ? 0 : -1}
      draggable={canDrag} aria-roledescription={canDrag ? "عنصر قابل للسحب" : undefined}
      onDragStart={e => events.dragStart(e, id)}
      onDragOver={e => events.dragOver(e, sectionId, index, id)}
      onDrop={events.drop}
      onDragEnd={events.dragEnd}
      data-name={text || label} data-outline-question={id}
      aria-label={"السؤال " + label + ": " + (text || "سؤال بلا نص") + "، " + marks + " علامة، " + (tone === "ok" ? "سليم" : tone === "warn" ? "فيه تنبيه" : "فيه خطأ")}
      onClick={e => { e.stopPropagation(); events.open(id); }}>
      <span className="st-grip" aria-hidden="true"><IconGrip size={14} /></span>
      <span className="st-tile" aria-hidden="true">{label}</span>
      <span className="st-type" aria-hidden="true"><StudioTypeIcon type={type} size={14} /></span>
      <span className={"st-text" + (text ? "" : " is-empty")} aria-hidden="true">{text || "سؤال بلا نص"}</span>
      <span className="st-marks" aria-hidden="true">{marks}</span>
      <span aria-hidden="true"><StatusDot tone={tone} /></span>
    </li>
  );
});

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
  // Phase 21F.9 — the rows are memoized (a keystroke in one question re-renders that row only): they get ONE stable events object
  // that always runs this render's handlers.
  const rowImpl = useRef<RowEvents | null>(null);
  const [rowEvents] = useState<RowEvents>(() => ({
    dragStart: (e, id) => rowImpl.current?.dragStart(e, id),
    dragOver: (e, sectionId, index, id) => rowImpl.current?.dragOver(e, sectionId, index, id),
    drop: e => rowImpl.current?.drop(e),
    dragEnd: () => rowImpl.current?.dragEnd(),
    open: id => rowImpl.current?.open(id)
  }));
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
  useLayoutEffect(() => {
    rowImpl.current = {
      dragStart: (e, id) => { if (!canDrag) return; setDragId(id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", id); } catch { /* some engines refuse */ } },
      dragOver: dragOverRow,
      drop: finishDrop,
      dragEnd: () => { setDragId(null); setDrop(null); },
      open: id => { if (!disabled) onOpenQuestion(id); }
    };
  });
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
  const readyShare = readiness.share;
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
                      return (
                        <OutlineRow key={id} id={id} sectionId={section.id} index={index} label={questionLabelOf(question.displayNumber, index)} text={(question.text || "").trim()}
                          marks={question.marks} type={question.presentationType} tone={toneOf(issuesOf.get(id))} active={activeId === id} selected={selectedIds.has(id)}
                          focusable={focusKey === "q:" + id} dragging={dragId === id} dropMark={drop?.at === "before:" + id ? "before" : drop?.at === "after:" + id ? "after" : null}
                          canDrag={canDrag} events={rowEvents} />
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
