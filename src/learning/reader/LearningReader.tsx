import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconChevronBack, IconMenu, IconClose } from "../../icons";
import useFocusTrap from "../../ui/useFocusTrap";
import { usePrefersReducedMotion } from "../../ui/usePrefersReducedMotion";
import { flattenPageRefs, findPage, previousPage, nextPage, pagePosition } from "../content/navigation";
import type { LearningCourseManifest, ContentModule, ContentPage } from "../content/types";
import LearningReaderToc from "./LearningReaderToc";
import LearningPageRenderer, { type ReaderPageBody, type ReaderPageHeader } from "./LearningPageRenderer";
import { registryContentApi, type ReaderContentApi } from "./readerContentApi";
import "./reader.css";

export type { ReaderContentApi } from "./readerContentApi";

type ManifestState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; manifest: LearningCourseManifest };

/**
 * The professional mobile-first Interactive Learning Reader. It reads the Phase-2 manifest for the table of
 * contents and navigation, lazily loads only the module that owns the selected page (cached for the session,
 * stale-load safe), and renders the page through `LearningPageRenderer`. It performs ZERO backend requests (the
 * only async is the content-API's code-split imports). Navigation authority is the pageId + the canonical
 * navigation helpers — never array positions re-implemented here.
 */
export default function LearningReader({
  courseId, onExit, api = registryContentApi,
}: {
  courseId: string;
  onExit: () => void;
  api?: ReaderContentApi;
}) {
  const [manifestState, setManifestState] = useState<ManifestState>({ status: "loading" });
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [manifestNonce, setManifestNonce] = useState(0);
  const [erroredModules, setErroredModules] = useState<Set<string>>(new Set());
  // Session cache of loaded module bodies, held in STATE so the page body is derived from it during render.
  const [modules, setModules] = useState<Record<string, ContentModule>>({});

  const inflightRef = useRef<Set<string>>(new Set());   // module ids currently loading — de-dupes concurrent loads
  const mountedRef = useRef(true);
  const pendingFocusRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Load the manifest once per course (re-armed by the retry button); pick the first page in reading order. The
  // state is only ever set from the ASYNC callbacks, so nothing is set synchronously inside the effect.
  useEffect(() => {
    let alive = true;
    api.loadManifest(courseId).then(manifest => {
      if (!alive) return;
      const pages = flattenPageRefs(manifest);
      setManifestState({ status: "ready", manifest });
      setSelectedPageId(pages.length > 0 ? pages[0].page.id : "");
    }).catch(() => { if (alive) setManifestState({ status: "error" }); });
    return () => { alive = false; };
  }, [courseId, api, manifestNonce]);

  const manifest = manifestState.status === "ready" ? manifestState.manifest : null;
  const pages = useMemo(() => (manifest ? flattenPageRefs(manifest) : []), [manifest]);
  const located = manifest && selectedPageId ? findPage(manifest, selectedPageId) : undefined;
  const activeModuleId = located?.module.id;

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Trigger the async load of the owning module for the selected page — exactly once (de-duplicated by inflight +
  // the loaded/errored state). State is only set from the async callbacks; the page body is DERIVED during render
  // from `modules` below, so an out-of-order late resolve of a previous page's module never overrides the current
  // page.
  useEffect(() => {
    if (!manifest || !activeModuleId) return;
    if (!api.hasModule(courseId, activeModuleId)) return;
    // A module the COMMITTED state now shows as loaded (or errored) is no longer in flight — it is released HERE, where
    // that state is observable, never inside the promise callbacks: releasing it there, before the state commit, let
    // a passive-effect run triggered by ANOTHER module's commit (two loads interleaved by a quick navigation) observe
    // "not in flight, not loaded" and request the same chunk a second time. (Found by the Phase-3E reader test.)
    if (modules[activeModuleId] || erroredModules.has(activeModuleId)) { inflightRef.current.delete(activeModuleId); return; }
    if (inflightRef.current.has(activeModuleId)) return;
    const moduleId = activeModuleId;
    inflightRef.current.add(moduleId);
    api.loadModule(courseId, moduleId)
      .then(mod => { if (mountedRef.current) setModules(prev => ({ ...prev, [moduleId]: mod })); })
      .catch(() => { if (mountedRef.current) setErroredModules(prev => new Set(prev).add(moduleId)); });
  }, [manifest, activeModuleId, courseId, api, modules, erroredModules]);

  // Derived page body for the CURRENT selection (never stale): unavailable / error / loading / ready-from-state.
  const body: ReaderPageBody = !located
    ? { kind: "loading" }
    : !api.hasModule(courseId, located.module.id)
      ? { kind: "unavailable" }
      : erroredModules.has(located.module.id)
        ? { kind: "error", onRetry: () => setErroredModules(prev => { const n = new Set(prev); n.delete(located.module.id); return n; }) }
        : modules[located.module.id]
          ? bodyForModule(modules[located.module.id], selectedPageId)
          : { kind: "loading" };

  // After a real page navigation (not initial mount, not TOC expand): scroll to the top of the new page and move
  // focus to its title. Guarded so it never steals focus on first render.
  useEffect(() => {
    if (!pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    contentRef.current?.scrollTo?.({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    const title = contentRef.current?.querySelector<HTMLElement>(".learning-reader-page-title");
    title?.focus();
  }, [selectedPageId, reducedMotion]);

  const selectPage = useCallback((pageId: string) => {
    // Manifest-order-validated: ignore unknown ids (controlled fallback, never a crash).
    if (manifest && !findPage(manifest, pageId)) return;
    pendingFocusRef.current = true;
    setSelectedPageId(pageId);
    setDrawerOpen(false);
  }, [manifest]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useFocusTrap(drawerRef, drawerOpen, closeDrawer);
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  if (manifestState.status === "loading") {
    return <div className="learning-reader"><p className="learning-reader-status" role="status">جارٍ تحميل فهرس الكتاب...</p></div>;
  }
  if (manifestState.status === "error" || !manifest) {
    return (
      <div className="learning-reader">
        <div className="learning-reader-state is-error" role="alert">
          <p className="learning-reader-state-title">تعذّر تحميل فهرس الكتاب</p>
          <button type="button" className="eb-button is-primary" onClick={() => { setManifestState({ status: "loading" }); setManifestNonce(n => n + 1); }}>إعادة المحاولة</button>
          <button type="button" className="eb-button is-quiet is-small" onClick={onExit}>العودة إلى نظرة الكتاب</button>
        </div>
      </div>
    );
  }

  const prev = selectedPageId ? previousPage(manifest, selectedPageId) : null;
  const next = selectedPageId ? nextPage(manifest, selectedPageId) : null;
  const position = (selectedPageId ? pagePosition(manifest, selectedPageId) : null) ?? { index: 0, total: pages.length };
  const header: ReaderPageHeader | null = located ? {
    courseId,
    pageTitle: located.page.title,
    moduleTitle: located.module.title,
    lessonTitle: located.lesson.title,
    position,
    source: located.page.source,
  } : null;

  // Both TOC instances share the SAME page-selection authority (`selectPage`) but carry distinct `idPrefix`es so
  // their DOM ids never collide while both exist (desktop sidebar + open mobile drawer).
  const renderToc = (idPrefix: string) => (
    <LearningReaderToc
      manifest={manifest}
      selectedPageId={selectedPageId}
      activeModuleId={located?.module.id}
      onSelectPage={selectPage}
      idPrefix={idPrefix}
    />
  );

  return (
    <div className="learning-reader" dir="rtl">
      <div className="learning-reader-topbar">
        <button type="button" className="eb-button is-quiet is-small learning-reader-back" onClick={onExit}>
          <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />العودة إلى نظرة الكتاب
        </button>
        <span className="learning-reader-booktitle">كتاب {courseId}</span>
        <button type="button" className="eb-button is-quiet is-small learning-reader-toc-toggle" aria-expanded={drawerOpen} aria-controls="learning-reader-drawer" onClick={() => setDrawerOpen(true)}>
          <IconMenu size={18} aria-hidden="true" />الفهرس
        </button>
      </div>

      <p className="learning-reader-partial" role="note">يجري تجهيز محتوى الكتاب التفاعلي تدريجيًا.</p>

      <div className="learning-reader-layout">
        <aside className="learning-reader-sidebar" aria-label="فهرس الكتاب (سطح المكتب)">{renderToc("desktop")}</aside>

        <main className="learning-reader-main" ref={contentRef} tabIndex={-1}>
          <div className="learning-reader-jump">
            <label htmlFor="learning-reader-jump-select">انتقل إلى صفحة</label>
            <select id="learning-reader-jump-select" value={selectedPageId} onChange={e => selectPage(e.target.value)}>
              {pages.map((f, i) => <option key={f.page.id} value={f.page.id}>{i + 1} — {f.page.title}</option>)}
            </select>
          </div>
          {header ? <LearningPageRenderer header={header} body={body} /> : <p className="learning-reader-status" role="status">لا توجد صفحات بعد.</p>}
        </main>
      </div>

      <nav className="learning-reader-nav" aria-label="تنقّل بين الصفحات">
        <button type="button" className="eb-button learning-reader-navbtn" disabled={!prev} onClick={() => prev && selectPage(prev.id)}>
          <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />السابق
        </button>
        <span className="learning-reader-navpos" aria-hidden="true">{position.index} / {position.total}</span>
        <button type="button" className="eb-button learning-reader-navbtn" disabled={!next} onClick={() => next && selectPage(next.id)}>
          التالي<IconChevronBack size={18} aria-hidden="true" />
        </button>
      </nav>

      {drawerOpen && (
        <div className="learning-reader-drawer-root">
          <div className="learning-reader-drawer-backdrop" aria-hidden="true" onClick={closeDrawer} />
          <div
            id="learning-reader-drawer"
            ref={drawerRef}
            className="learning-reader-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="فهرس الكتاب"
            onKeyDown={e => { if (e.key === "Escape") closeDrawer(); }}
          >
            <div className="learning-reader-drawer-head">
              <span>الفهرس</span>
              <button type="button" className="eb-button is-quiet is-small" onClick={closeDrawer} autoFocus>
                <IconClose size={18} aria-hidden="true" />إغلاق
              </button>
            </div>
            {renderToc("mobile")}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Resolve the selected page inside a loaded module body → a ready / unavailable / missing reader body. Pure.
 * A page absent from the body is "قيد الإعداد" (unavailable) when the module is a PARTIAL conversion — its manifest
 * lists pages this batch has not converted yet — and a "missing content" integrity problem otherwise (a module that
 * claims complete content but is unexpectedly missing a page).
 */
function bodyForModule(module: ContentModule, pageId: string): ReaderPageBody {
  for (const lesson of module.lessons) {
    const page: ContentPage | undefined = lesson.pages.find(p => p.id === pageId);
    if (page) return { kind: "ready", page };
  }
  return module.partial ? { kind: "unavailable" } : { kind: "missing" };
}
