import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconCheck, IconChevronDown } from "../../icons";
import { flattenPageRefs, orderedModules } from "../content/navigation";
import type { LearningCourseManifest } from "../content/types";

/**
 * The reader's table of contents — driven ONLY by the manifest (module → lesson → page identities). It never loads a
 * module body. Phase 21E L2-B:
 *   • only the module holding the current page starts expanded; EVERY module toggle (the active one included) really
 *     expands / collapses, and navigating to a page in another module reveals that module again;
 *   • the current lesson is marked (visually and for assistive technology); the active page carries
 *     `aria-current="page"` and is scrolled into view when it changes (e.g. when a mobile drawer is reopened);
 *   • optional device-local "visited" marks (`visited`, students only — see visitedPages.ts): a mark is rendered only
 *     for a page of THIS manifest, so a stored id of an unpublished page is never shown;
 *   • optional page jump («انتقل إلى صفحة», normal reading only). Picking an option with the pointer opens that page at
 *     once; browsing the options with the keyboard only moves a draft, which Enter or «انتقل» opens — so arrowing
 *     through 248 options never navigates on every step (WCAG 3.2.2).
 */
export default function LearningReaderToc({
  manifest, selectedPageId, activeModuleId, activeLessonId, onSelectPage, idPrefix, visited, showJump = false,
}: {
  manifest: LearningCourseManifest;
  selectedPageId: string;
  activeModuleId: string | undefined;
  /** The lesson that holds the current page (marked as the current lesson). */
  activeLessonId?: string;
  onSelectPage: (pageId: string) => void;
  /** Unique per rendered TOC instance (e.g. "desktop" / "mobile") so the desktop sidebar and the mobile drawer
   *  can both exist in the DOM without colliding ids; each button's aria-controls stays within its own instance. */
  idPrefix: string;
  /** Page ids opened before on this device by this student (absent → no marks at all). */
  visited?: ReadonlySet<string>;
  /** Render the «انتقل إلى صفحة» jump at the top of the index (normal reading; presentation has its own field). */
  showJump?: boolean;
}) {
  const modules = orderedModules(manifest);
  // Expanded modules. Initially only the active one; navigating into another module reveals it (adjusted during
  // render when the active module changes — the documented derived-state pattern, no effect).
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => (activeModuleId ? { [activeModuleId]: true } : {}));
  const [revealed, setRevealed] = useState(activeModuleId);
  if (activeModuleId !== revealed) {
    setRevealed(activeModuleId);
    if (activeModuleId) setExpanded(e => ({ ...e, [activeModuleId]: true }));
  }
  const activeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeBtnRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedPageId]);

  const toggle = (moduleId: string) => setExpanded(e => ({ ...e, [moduleId]: !e[moduleId] }));

  return (
    <nav className="learning-reader-toc" aria-label="فهرس الكتاب">
      {showJump && <PageJump manifest={manifest} selectedPageId={selectedPageId} onSelectPage={onSelectPage} idPrefix={idPrefix} />}
      <ul className="learning-reader-toc-modules">
        {modules.map(m => {
          const open = expanded[m.id] === true;
          const isActiveModule = m.id === activeModuleId;
          const panelId = "learning-reader-toc-" + idPrefix + "-" + m.id;
          return (
            <li key={m.id} className={"learning-reader-toc-module" + (isActiveModule ? " is-current" : "")}>
              <button
                type="button"
                className="learning-reader-toc-modbtn"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(m.id)}
              >
                <IconChevronDown size={16} className={"learning-reader-toc-caret" + (open ? " is-open" : "")} aria-hidden="true" />
                <span className="learning-reader-toc-modtitle">{m.title}</span>
              </button>
              {/* Always in the DOM (so aria-controls resolves) and `hidden` while collapsed (out of the accessibility tree). */}
              <ul id={panelId} className="learning-reader-toc-lessons" hidden={!open}>
                {[...m.lessons].sort((a, b) => a.order - b.order).map(l => {
                  const currentLesson = isActiveModule && l.id === activeLessonId;
                  return (
                    <li key={l.id} className={"learning-reader-toc-lesson" + (currentLesson ? " is-current" : "")}>
                      <p className="learning-reader-toc-lessontitle">
                        {l.title}
                        {currentLesson && <span className="learning-reader-toc-lessonnow">الدرس الحالي</span>}
                      </p>
                      <ul className="learning-reader-toc-pages">
                        {[...l.pages].sort((a, b) => a.order - b.order).map(p => {
                          const active = p.id === selectedPageId;
                          const seen = !!visited?.has(p.id);
                          return (
                            <li key={p.id}>
                              <button
                                type="button"
                                ref={active && open ? activeBtnRef : undefined}
                                className={"learning-reader-toc-page" + (active ? " is-active" : "") + (seen ? " is-visited" : "")}
                                aria-current={active ? "page" : undefined}
                                onClick={() => onSelectPage(p.id)}
                              >
                                <span className="learning-reader-toc-pagetitle">{p.title}</span>
                                {seen && <>
                                  <IconCheck size={14} className="learning-reader-toc-seen" aria-hidden="true" />
                                  <span className="learning-reader-srtext">، تمت قراءتها</span>
                                </>}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Keys that move a closed <select>'s value while browsing (plus type-ahead letters).
const BROWSE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);

/** «انتقل إلى صفحة» — the full page list as one select plus «انتقل». Pointer choice → open at once; keyboard browsing →
 *  a draft committed by Enter or «انتقل». The draft belongs to the page it was started on: any navigation drops it. */
function PageJump({ manifest, selectedPageId, onSelectPage, idPrefix }: {
  manifest: LearningCourseManifest; selectedPageId: string; onSelectPage: (pageId: string) => void; idPrefix: string;
}) {
  const pages = flattenPageRefs(manifest);
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const browsingRef = useRef(false);
  const pending = draft && draft.from === selectedPageId && draft.to !== selectedPageId ? draft.to : null;
  const selectId = "learning-reader-jump-select" + (idPrefix === "desktop" ? "" : "-" + idPrefix);
  const commit = () => { if (pending) onSelectPage(pending); setDraft(null); };
  const onKeyDown = (e: KeyboardEvent<HTMLSelectElement>) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); return; }
    if (BROWSE_KEYS.has(e.key) || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) browsingRef.current = true;
  };
  return (
    <div className="learning-reader-jump">
      <label htmlFor={selectId}>انتقل إلى صفحة</label>
      <div className="learning-reader-jump-row">
        <select
          id={selectId}
          value={pending ?? selectedPageId}
          onKeyDown={onKeyDown}
          onPointerDown={() => { browsingRef.current = false; }}
          onBlur={() => { browsingRef.current = false; }}
          onChange={e => {
            const to = e.target.value;
            if (browsingRef.current) setDraft({ from: selectedPageId, to });
            else { setDraft(null); onSelectPage(to); }
          }}
        >
          {pages.map((f, i) => <option key={f.page.id} value={f.page.id}>{i + 1} — {f.page.title}</option>)}
        </select>
        <button type="button" className="eb-button is-small learning-reader-jump-go" onClick={commit} disabled={!pending}>انتقل</button>
      </div>
    </div>
  );
}
