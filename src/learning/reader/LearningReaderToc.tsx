import { useEffect, useRef, useState } from "react";
import { IconChevronDown } from "../../icons";
import { orderedModules } from "../content/navigation";
import type { LearningCourseManifest } from "../content/types";

/**
 * The reader's table of contents — driven ONLY by the manifest (module → lesson → page identities). It never
 * loads a module body. Modules are collapsible; the module containing the active page is auto-expanded (while
 * manual expand/collapse of other modules is preserved). The active page carries `aria-current="page"` and is
 * scrolled into view when it changes (e.g. when a mobile drawer is reopened).
 */
export default function LearningReaderToc({
  manifest, selectedPageId, activeModuleId, onSelectPage, idPrefix,
}: {
  manifest: LearningCourseManifest;
  selectedPageId: string;
  activeModuleId: string | undefined;
  onSelectPage: (pageId: string) => void;
  /** Unique per rendered TOC instance (e.g. "desktop" / "mobile") so the desktop sidebar and the mobile drawer
   *  can both exist in the DOM without colliding ids; each button's aria-controls stays within its own instance. */
  idPrefix: string;
}) {
  const modules = orderedModules(manifest);
  // Manual expand/collapse state; the active module is always forced open on top of the user's choices.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const activeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeBtnRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedPageId]);

  const toggle = (moduleId: string) => setCollapsed(c => ({ ...c, [moduleId]: !c[moduleId] }));

  return (
    <nav className="learning-reader-toc" aria-label="فهرس الكتاب">
      <ul className="learning-reader-toc-modules">
        {modules.map(m => {
          const isActiveModule = m.id === activeModuleId;
          const open = isActiveModule || !collapsed[m.id];
          const panelId = "learning-reader-toc-" + idPrefix + "-" + m.id;
          return (
            <li key={m.id} className="learning-reader-toc-module">
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
              {open && (
                <ul id={panelId} className="learning-reader-toc-lessons">
                  {[...m.lessons].sort((a, b) => a.order - b.order).map(l => (
                    <li key={l.id} className="learning-reader-toc-lesson">
                      <p className="learning-reader-toc-lessontitle">{l.title}</p>
                      <ul className="learning-reader-toc-pages">
                        {[...l.pages].sort((a, b) => a.order - b.order).map(p => {
                          const active = p.id === selectedPageId;
                          return (
                            <li key={p.id}>
                              <button
                                type="button"
                                ref={active ? activeBtnRef : undefined}
                                className={"learning-reader-toc-page" + (active ? " is-active" : "")}
                                aria-current={active ? "page" : undefined}
                                onClick={() => onSelectPage(p.id)}
                              >
                                {p.title}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
