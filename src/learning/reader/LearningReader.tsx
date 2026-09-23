import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconChevronBack, IconMenu, IconClose, IconMaximize, IconMinimize } from "../../icons";
import useFocusTrap from "../../ui/useFocusTrap";
import { usePrefersReducedMotion } from "../../ui/usePrefersReducedMotion";
import { flattenPageRefs, findPage, previousPage, nextPage, pagePosition } from "../content/navigation";
import type { LearningCourseManifest, ContentModule, ContentPage } from "../content/types";
import LearningReaderToc from "./LearningReaderToc";
import LearningPageRenderer, { type ReaderPageBody, type ReaderPageHeader } from "./LearningPageRenderer";
import { registryContentApi, type ReaderContentApi } from "./readerContentApi";
import type { LibraryTrainingHost } from "../training/types";
import type { StudyHost } from "../study/types";
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
 *
 * PRESENTATION MODE (وضع العرض): local UI state that promotes the SAME Reader tree to an app-level, fixed,
 * full-viewport overlay (a PowerPoint-like large view for desktops / projectors): the sidebar, the partial note and
 * the jump select are hidden, the page fills the viewport, and the bottom bar carries السابق / التالي, the ordinal
 * position («98 / 248», the READER position — never the PDF page) with a direct page-number field, and the index
 * opens as the existing drawer. Keyboard: ArrowLeft / PageDown → next, ArrowRight / PageUp → previous (RTL reading:
 * «next» is the visually-left button), Escape → exit, F → toggle; none of them fire while typing in an input,
 * textarea, select or editable element (the CLI terminal line included) or while a nested dialog (index drawer,
 * activity fullscreen) is open. Native browser fullscreen is requested BEST-EFFORT only — the overlay is the
 * authority and stays usable when the request is refused or unavailable. Nothing is persisted.
 */
export default function LearningReader({
  courseId, onExit, api = registryContentApi, exitLabel = "العودة إلى نظرة الكتاب", training, study, initialPageId, onPageChange,
  initialPresentation, onPresentationChange, embedded = false,
}: {
  courseId: string;
  onExit: () => void;
  api?: ReaderContentApi;
  /** Label of the back/exit control — the host decides where "back" leads (teacher library, student portal). */
  exitLabel?: string;
  /** Learning-Practice host seam (availability + open) for `library-training` blocks. Absent → generic cards. */
  training?: LibraryTrainingHost;
  /** Study-Practice host seam (completion state + report) for in-page exercises. Absent → practice stays local. */
  study?: StudyHost;
  /** The page to open first (validated against the manifest; unknown → first page). Lets a host that swaps the
   *  Reader out (e.g. for a training) remount it on the SAME page. Read once, at manifest load. */
  initialPageId?: string;
  /** Notified with every selected page id (including the initial one) so a host can remember where the reader is. */
  onPageChange?: (pageId: string) => void;
  /** Start in presentation mode (a host that swapped the Reader out for a training remounts it as it was). */
  initialPresentation?: boolean;
  /** Notified whenever presentation mode is entered / left (local UI state — never persisted by the Reader). */
  onPresentationChange?: (presentation: boolean) => void;
  /** SEMANTICS only: the host already owns the page's <main> landmark (the teacher app shell), so the content column
   *  renders as a <div> instead of a nested <main>. Same class, ref, tabIndex and children → identical layout and
   *  behavior (normal and presentation mode). Default (standalone, e.g. the student's full-screen Reader): <main>. */
  embedded?: boolean;
}) {
  const [manifestState, setManifestState] = useState<ManifestState>({ status: "loading" });
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [manifestNonce, setManifestNonce] = useState(0);
  const [erroredModules, setErroredModules] = useState<Set<string>>(new Set());
  // Session cache of loaded module bodies, held in STATE so the page body is derived from it during render.
  const [modules, setModules] = useState<Record<string, ContentModule>>({});
  // Presentation mode + its direct page-number field: `pageDraft` is the learner's in-progress text (null = not
  // editing → the field shows the current Reader ordinal) and `jumpError` the last validation message. Both are
  // reset by the navigation event itself (selectPage), never by an effect.
  const [presentation, setPresentation] = useState<boolean>(initialPresentation === true);
  const [pageDraft, setPageDraft] = useState<string | null>(null);
  const [jumpError, setJumpError] = useState("");

  const inflightRef = useRef<Set<string>>(new Set());   // module ids currently loading — de-dupes concurrent loads
  const mountedRef = useRef(true);
  const pendingFocusRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const ContentRoot = embedded ? "div" : "main";
  const drawerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const presentToggleRef = useRef<HTMLButtonElement>(null);
  const pendingToggleFocusRef = useRef(false);
  const nativeFullscreenRef = useRef(false);        // true while THIS reader owns a native fullscreen session
  const onPresentationChangeRef = useRef(onPresentationChange);
  useEffect(() => { onPresentationChangeRef.current = onPresentationChange; }, [onPresentationChange]);
  const reducedMotion = usePrefersReducedMotion();
  // Host-remembered start page + change notifier, held in refs so neither re-arms the manifest load.
  const initialPageRef = useRef(initialPageId);
  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => { onPageChangeRef.current = onPageChange; }, [onPageChange]);

  // Load the manifest once per course (re-armed by the retry button); pick the first page in reading order. The
  // state is only ever set from the ASYNC callbacks, so nothing is set synchronously inside the effect.
  useEffect(() => {
    let alive = true;
    api.loadManifest(courseId).then(manifest => {
      if (!alive) return;
      const pages = flattenPageRefs(manifest);
      setManifestState({ status: "ready", manifest });
      const wanted = initialPageRef.current;
      setSelectedPageId(wanted && findPage(manifest, wanted) ? wanted : pages.length > 0 ? pages[0].page.id : "");
    }).catch(() => { if (alive) setManifestState({ status: "error" }); });
    return () => { alive = false; };
  }, [courseId, api, manifestNonce]);

  const manifest = manifestState.status === "ready" ? manifestState.manifest : null;
  const pages = useMemo(() => (manifest ? flattenPageRefs(manifest) : []), [manifest]);
  const located = manifest && selectedPageId ? findPage(manifest, selectedPageId) : undefined;
  const activeModuleId = located?.module.id;

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => { if (selectedPageId) onPageChangeRef.current?.(selectedPageId); }, [selectedPageId]);

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
    setPageDraft(null);
    setJumpError("");
  }, [manifest]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useFocusTrap(drawerRef, drawerOpen, closeDrawer);
  useEffect(() => {
    if (!drawerOpen && !presentation) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen, presentation]);

  // ── Presentation mode ──────────────────────────────────────────────────────────────────────────────────────
  // Native fullscreen is a best-effort enhancement: requested on entry, released on exit, never required. A refusal
  // (no user gesture, unsupported, iframe policy) leaves the app-level overlay exactly as usable.
  const enterPresentation = useCallback(() => {
    setPresentation(true);
    setJumpError("");
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) { nativeFullscreenRef.current = true; return; }   // already native (e.g. back from a training)
    const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> | void };
    if (typeof el.requestFullscreen !== "function") return;
    try {
      const p = el.requestFullscreen();
      if (p && typeof (p as Promise<void>).then === "function") (p as Promise<void>).then(() => { nativeFullscreenRef.current = true; }, () => { nativeFullscreenRef.current = false; });
    } catch { nativeFullscreenRef.current = false; }
  }, []);
  const exitPresentation = useCallback(() => {
    setPresentation(false);
    setJumpError("");
    pendingToggleFocusRef.current = true;
    if (typeof document === "undefined" || !nativeFullscreenRef.current) return;
    nativeFullscreenRef.current = false;
    const doc = document as Document & { exitFullscreen?: () => Promise<void> | void };
    if (document.fullscreenElement && typeof doc.exitFullscreen === "function") {
      try { const p = doc.exitFullscreen(); if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {}); } catch { /* best effort */ }
    }
  }, []);
  const togglePresentation = useCallback(() => { if (presentation) exitPresentation(); else enterPresentation(); }, [presentation, enterPresentation, exitPresentation]);

  useEffect(() => { onPresentationChangeRef.current?.(presentation); }, [presentation]);
  // Leaving presentation returns focus to the toggle (the element the user came from), once it is back in the tree.
  useEffect(() => {
    if (presentation || !pendingToggleFocusRef.current) return;
    pendingToggleFocusRef.current = false;
    presentToggleRef.current?.focus();
  }, [presentation]);
  // The browser left native fullscreen (its own Escape / UI) while this reader owned it → leave presentation too, so
  // one gesture never leaves a half state (overlay without fullscreen is still fine when native was never granted).
  useEffect(() => {
    if (!presentation) return;
    const onChange = () => {
      if (!document.fullscreenElement && nativeFullscreenRef.current) { nativeFullscreenRef.current = false; setPresentation(false); pendingToggleFocusRef.current = true; }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [presentation]);
  // A nested dialog (index drawer, activity fullscreen) inside the presentation root owns Escape / the keyboard.
  const nestedDialogOpen = useCallback(() => !!rootRef.current?.querySelector('[aria-modal="true"]'), []);
  const onPresentationEscape = useCallback(() => { if (!nestedDialogOpen()) exitPresentation(); }, [nestedDialogOpen, exitPresentation]);
  useFocusTrap(rootRef, presentation, onPresentationEscape);

  const prev = manifest && selectedPageId ? previousPage(manifest, selectedPageId) : null;
  const next = manifest && selectedPageId ? nextPage(manifest, selectedPageId) : null;
  // Direct page number (READER ordinal, 1..total — never the PDF page). Arabic-Indic and Persian digits are accepted.
  const currentIndex = manifest && selectedPageId ? (pagePosition(manifest, selectedPageId)?.index ?? 0) : 0;
  const pageInput = pageDraft ?? (currentIndex > 0 ? String(currentIndex) : "");
  const goToPageNumber = useCallback((raw: string) => {
    const text = String(raw || "").trim().replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
    const total = pages.length;
    const n = /^\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > total) { setJumpError(`أدخل رقم صفحة بين 1 و ${total}.`); return; }
    setJumpError("");
    selectPage(pages[n - 1].page.id);
  }, [pages, selectPage]);

  // Keyboard: F toggles presentation (any mode); in presentation ArrowLeft / PageDown → next, ArrowRight / PageUp →
  // previous. Never while typing (input / textarea / select / editable — the CLI line is an input), never with a
  // modifier, never while a nested dialog owns the keyboard. Escape is handled by the presentation focus trap.
  useEffect(() => {
    if (!manifest) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target) || nestedDialogOpen()) return;
      if (e.key === "f" || e.key === "F" || e.code === "KeyF") { e.preventDefault(); togglePresentation(); return; }
      if (!presentation) return;
      if (e.key === "ArrowLeft" || e.key === "PageDown") { e.preventDefault(); if (next) selectPage(next.id); }
      else if (e.key === "ArrowRight" || e.key === "PageUp") { e.preventDefault(); if (prev) selectPage(prev.id); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [manifest, presentation, next, prev, selectPage, togglePresentation, nestedDialogOpen]);

  if (manifestState.status === "loading") {
    return <div className="learning-reader"><p className="learning-reader-status" role="status">جارٍ تحميل فهرس الكتاب...</p></div>;
  }
  if (manifestState.status === "error" || !manifest) {
    return (
      <div className="learning-reader">
        <div className="learning-reader-state is-error" role="alert">
          <p className="learning-reader-state-title">تعذّر تحميل فهرس الكتاب</p>
          <button type="button" className="eb-button is-primary" onClick={() => { setManifestState({ status: "loading" }); setManifestNonce(n => n + 1); }}>إعادة المحاولة</button>
          <button type="button" className="eb-button is-quiet is-small" onClick={onExit}>{exitLabel}</button>
        </div>
      </div>
    );
  }

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

  const presentToggle = (
    <button
      key="present-toggle"
      type="button"
      ref={presentToggleRef}
      className={"eb-button is-small learning-reader-present-toggle" + (presentation ? "" : " is-quiet")}
      aria-pressed={presentation}
      onClick={togglePresentation}
    >
      {presentation ? <IconMinimize size={18} aria-hidden="true" /> : <IconMaximize size={18} aria-hidden="true" />}
      {presentation ? "خروج من وضع العرض" : "وضع العرض"}
    </button>
  );

  return (
    <div
      ref={rootRef}
      className={"learning-reader" + (presentation ? " is-presentation" : "")}
      dir="rtl"
      data-presentation={presentation || undefined}
      role={presentation ? "dialog" : undefined}
      aria-modal={presentation || undefined}
      aria-label={presentation ? "وضع العرض — كتاب " + courseId : undefined}
    >
      <div className="learning-reader-topbar">
        {!presentation && (
          <button type="button" className="eb-button is-quiet is-small learning-reader-back" onClick={onExit}>
            <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />{exitLabel}
          </button>
        )}
        <span className="learning-reader-booktitle">كتاب {courseId}{presentation && located ? <span className="learning-reader-topbar-page"> · {located.page.title}</span> : null}</span>
        <button type="button" className="eb-button is-quiet is-small learning-reader-toc-toggle" aria-expanded={drawerOpen} aria-controls="learning-reader-drawer" onClick={() => setDrawerOpen(true)}>
          <IconMenu size={18} aria-hidden="true" />الفهرس
        </button>
        {presentation && <span className="learning-reader-keyhint" aria-hidden="true">← → للتنقل · Esc للخروج</span>}
        {presentToggle}
      </div>

      {!presentation && <p className="learning-reader-partial" role="note">يجري تجهيز محتوى الكتاب التفاعلي تدريجيًا.</p>}

      <div className="learning-reader-layout">
        <aside className="learning-reader-sidebar" aria-label="فهرس الكتاب (سطح المكتب)">{renderToc("desktop")}</aside>

        <ContentRoot className="learning-reader-main" ref={contentRef} tabIndex={-1}>
          {!presentation && (
            <div className="learning-reader-jump">
              <label htmlFor="learning-reader-jump-select">انتقل إلى صفحة</label>
              <select id="learning-reader-jump-select" value={selectedPageId} onChange={e => selectPage(e.target.value)}>
                {pages.map((f, i) => <option key={f.page.id} value={f.page.id}>{i + 1} — {f.page.title}</option>)}
              </select>
            </div>
          )}
          {header ? <LearningPageRenderer header={header} body={body} training={training} study={study} /> : <p className="learning-reader-status" role="status">لا توجد صفحات بعد.</p>}
        </ContentRoot>
      </div>

      <nav className="learning-reader-nav" aria-label="تنقّل بين الصفحات">
        <button type="button" className="eb-button learning-reader-navbtn" disabled={!prev} onClick={() => prev && selectPage(prev.id)}>
          <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />السابق
        </button>
        {presentation ? (
          <form className="learning-reader-pagejump" onSubmit={e => { e.preventDefault(); goToPageNumber(pageInput); }}>
            <label htmlFor="learning-reader-pagejump-input" className="learning-reader-srtext">رقم الصفحة</label>
            <input
              id="learning-reader-pagejump-input"
              className="learning-reader-pagejump-input"
              type="text"
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              value={pageInput}
              onChange={e => { setPageDraft(e.target.value); if (jumpError) setJumpError(""); }}
              aria-invalid={jumpError ? true : undefined}
              aria-describedby={jumpError ? "learning-reader-pagejump-error" : "learning-reader-pagejump-total"}
            />
            <span id="learning-reader-pagejump-total" className="learning-reader-pagejump-total" dir="ltr">/ {position.total}</span>
            <button type="submit" className="eb-button is-small learning-reader-pagejump-go">انتقل</button>
            {jumpError && <p id="learning-reader-pagejump-error" className="learning-reader-pagejump-error" role="alert">{jumpError}</p>}
          </form>
        ) : (
          <span className="learning-reader-navpos" aria-hidden="true">{position.index} / {position.total}</span>
        )}
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

/** True when a keyboard event originates in a field the learner may be typing in (inputs, textareas, selects, the CLI
 *  terminal line, any content-editable element) — navigation shortcuts must never steal those keys. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const el = target as HTMLElement;
  if (el.isContentEditable === true) return true;
  return !!target.closest('[contenteditable=""], [contenteditable="true"], [role="textbox"]');
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
