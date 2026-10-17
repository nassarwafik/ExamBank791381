import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MutableRefObject } from "react";
import { IconChevronBack, IconMenu, IconClose, IconMaximize, IconMinimize, IconSparkles, IconSliders, IconSearch, IconBook, IconSidebar, IconMore } from "../../icons";
import { useMediaQuery } from "../../ui/useMediaQuery";
import useFocusTrap from "../../ui/useFocusTrap";
import { usePrefersReducedMotion } from "../../ui/usePrefersReducedMotion";
import { setMotionOverride } from "../../ui/motionPreference";
import { flattenPageRefs, findPage, previousPage, nextPage, pagePosition } from "../content/navigation";
import type { LearningCourseManifest, ContentModule, ContentPage } from "../content/types";
import LearningReaderToc from "./LearningReaderToc";
import LearningPageRenderer, { type ReaderPageBody, type ReaderPageHeader } from "./LearningPageRenderer";
import { registryContentApi, type ReaderContentApi } from "./readerContentApi";
import type { LibraryTrainingHost } from "../training/types";
import type { StudyHost } from "../study/types";
import "./reader.css";
import "./reader-enterprise-l2a.css";
import "./reader-enterprise-l2b.css";
import { recordVisited, subscribeVisited, visitedSnapshot } from "./visitedPages";
import "./reader-enterprise-l2c.css";
import ReadingSettingsDialog from "./ReadingSettingsDialog";
import { loadReadingSettings, saveReadingSettings, type ReadingSettings } from "./readingSettings";
import "./reader-enterprise-l3b.css";
import "./reader-enterprise-l1.css";
import { loadTocDocked, saveTocDocked } from "./readerLayout";
import { useReaderSwipe } from "./useReaderSwipe";
import UnitContents from "./UnitContents";
import { lazyWithRetry } from "../../lazyWithRetry";
import type { SearchScope } from "../content/searchProvider";
import type { SearchHit, SearchProviderFactory, SearchSource } from "../search/searchModel";
import type { LearningSearchPanelProps } from "../search/LearningSearchPanel";

// Phase 21E L3-B — the search panel is its own lazy chunk: the Reader pays for it only when search is opened, and it
// indexes the manifest's titles + keywords only (opening it imports no module body).
const LearningSearchPanel = lazy(lazyWithRetry(() => import("../search/LearningSearchPanel"), "reader-search-panel"));

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
  initialPresentation, onPresentationChange, embedded = false, visitedScope, searchScope, onSearchOpen, searchProviderFactory,
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
  /** Phase 21E L2-B — opaque, host-supplied identity scope for the device-local "visited" marks in the index (the
   *  student portal passes the authenticated student's id). Absent → no marks are read, written or shown. */
  visitedScope?: string;
  /** Phase 21E L3-B — in-book search. The EXPLICIT release set searched (fail-closed, see `SearchScope`): the student
   *  host passes the module ids of the authenticated release list; only an authorized teacher host passes "all".
   *  Absent → no search control. Any other value → the search shows "unavailable" and no result. The index is built
   *  from THIS reader's manifest (for a student, already restricted to the released modules). */
  searchScope?: SearchScope["allowedModuleIds"];
  /** Phase 21E L3-B — re-checks the entitlement when a result is opened (the student host re-reads the server release
   *  list). Resolves false (or rejects) → the page is NOT opened and the search explains why. Absent → allowed. */
  onSearchOpen?: (hit: SearchHit) => Promise<boolean> | boolean;
  /** L3-7 — the search provider behind the index (default: the title/keyword provider). */
  searchProviderFactory?: SearchProviderFactory;
}) {
  const [manifestState, setManifestState] = useState<ManifestState>({ status: "loading" });
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [manifestNonce, setManifestNonce] = useState(0);
  // Phase L.1 — the table of contents never takes the text's room by default. From 1280px it is a docked column the reader
  // can fold away (remembered on this device); below 1280px, in focus mode and in presentation it is the overlay drawer.
  // Focus mode («وضع التركيز») hides the app's own chrome (navigation, page title) around the Reader — local state only.
  const wide = useMediaQuery("(min-width: 1280px)");
  const [tocDocked, setTocDocked] = useState<boolean>(loadTocDocked);
  const [focusMode, setFocusMode] = useState(false);
  // Phones: the secondary actions (focus, motion, presentation) live behind «المزيد» so the book title keeps its room.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreToggleRef = useRef<HTMLButtonElement>(null);
  // Phase 21E L2-C — reading comfort (text size, line spacing, reading theme), remembered on this device. Applied to the
  // root as data attributes in NORMAL reading only, so presentation mode keeps its own established layout.
  const [readingSettings, setReadingSettings] = useState<ReadingSettings>(loadReadingSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const changeReadingSettings = useCallback((next: ReadingSettings) => { setReadingSettings(next); saveReadingSettings(next); }, []);
  // Phase 21E L2-B — pages this student has READ on this device (empty without a scope), from the device store.
  const visited = useSyncExternalStore(subscribeVisited, () => visitedSnapshot(visitedScope, courseId), () => visitedSnapshot(undefined, courseId));
  const [erroredModules, setErroredModules] = useState<Set<string>>(new Set());
  // Session cache of loaded module bodies, held in STATE so the page body is derived from it during render.
  const [modules, setModules] = useState<Record<string, ContentModule>>({});
  // Presentation mode + its direct page-number field: `pageDraft` is the learner's in-progress text (null = not
  // editing → the field shows the current Reader ordinal) and `jumpError` the last validation message. Both are
  // reset by the navigation event itself (selectPage), never by an effect.
  const [presentation, setPresentation] = useState<boolean>(initialPresentation === true);
  const [pageDraft, setPageDraft] = useState<string | null>(null);
  const [jumpError, setJumpError] = useState("");
  // Phase 21E L3-B — in-book search: the query survives closing / reopening the panel (search → open → back), and a
  // result opened from the panel offers «العودة إلى نتائج البحث», which reopens it with the query and focus restored.
  const [searchOpen, setSearchOpen] = useState(false);
  // The live query is held by the search dialog itself (typing re-renders the panel only, never the page body or the
  // two indexes). The dialog mirrors it into `searchQueryRef`; the Reader copies it into `savedSearchQuery` only when the
  // dialog opens or closes, so it survives close / reopen and labels the back control.
  const searchQueryRef = useRef("");
  const [savedSearchQuery, setSavedSearchQuery] = useState("");
  const [searchOpening, setSearchOpening] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchReturn, setSearchReturn] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const pendingSearchToggleFocusRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const onSearchOpenRef = useRef(onSearchOpen);
  useEffect(() => { onSearchOpenRef.current = onSearchOpen; }, [onSearchOpen]);

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
  // Phase L.0 — the reader names the book by its title («شبكات الاتصال»), never by its catalogue number alone; the number
  // is only the stand-in while the manifest loads (or if it failed).
  const bookTitle = manifest?.title || "كتاب " + courseId;
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

  // Phase 21E L2-B — a page counts as visited once its CONTENT is ready: never on selection alone, never while its
  // module is loading, and never when it failed or is unavailable. The write goes to the device store (not React state).
  const readyPageId = body.kind === "ready" ? body.page.id : "";
  useEffect(() => { if (readyPageId) recordVisited(visitedScope, courseId, readyPageId); }, [readyPageId, visitedScope, courseId]);

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
  // The index docks only where it leaves the page enough room (≥1280px) and only in normal, unfocused reading.
  const dockable = wide && !focusMode && !presentation;
  const sidebarDocked = dockable && tocDocked;
  const toggleToc = useCallback(() => {
    if (!dockable) { setDrawerOpen(true); return; }
    setTocDocked(docked => { saveTocDocked(!docked); return !docked; });
  }, [dockable]);
  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && !moreRef.current?.contains(t) && !moreToggleRef.current?.contains(t)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setMoreOpen(false); moreToggleRef.current?.focus(); } };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey, true); };
  }, [moreOpen]);
  // Focus mode hides the host's chrome by a document-level flag the shells' stylesheets read (reader-enterprise-l1.css);
  // it is cleared when focus mode ends, when presentation takes over, and when the Reader unmounts.
  useEffect(() => {
    if (!focusMode || presentation || typeof document === "undefined") return;
    const html = document.documentElement;
    html.setAttribute("data-eb-reading-focus", "");
    return () => html.removeAttribute("data-eb-reading-focus");
  }, [focusMode, presentation]);
  useFocusTrap(drawerRef, drawerOpen, closeDrawer);
  // Closing the search (Escape, «إغلاق», the backdrop) returns focus to the «بحث» control explicitly — a clicked button is
  // not focused in every browser, so the trap's own "restore the previous element" could fall back to <body>.
  const closeSearch = useCallback(() => {
    setSearchOpen(false); setSearchError(""); pendingSearchToggleFocusRef.current = true;
    setSavedSearchQuery(searchQueryRef.current);
  }, []);
  useFocusTrap(searchRef, searchOpen, closeSearch);
  useEffect(() => {
    if (searchOpen || !pendingSearchToggleFocusRef.current) return;
    pendingSearchToggleFocusRef.current = false;
    searchToggleRef.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    if (!drawerOpen && !presentation && !searchOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen, presentation, searchOpen]);

  // ── Phase 21E L3-B: in-book search ──────────────────────────────────────────────────────────────────────────
  const searchEnabled = searchScope !== undefined;
  const searchScopeValid = searchScope === "all" || searchScope instanceof Set;
  const searchSources = useMemo<SearchSource[] | null>(
    () => (manifest && searchScopeValid && searchScope !== undefined ? [{ courseId, courseTitle: bookTitle, manifest, allowedModuleIds: searchScope }] : null),
    [manifest, searchScopeValid, searchScope, courseId, bookTitle],
  );
  const openSearch = useCallback(() => { setSearchError(""); setSavedSearchQuery(searchQueryRef.current); setSearchOpen(true); }, []);
  const clearSearchError = useCallback(() => setSearchError(""), []);
  const openSearchHit = useCallback(async (hit: SearchHit) => {
    // The page must exist in THIS reader's manifest (restricted for a student) and its module must be loadable here.
    if (!manifest || hit.courseId !== courseId || !findPage(manifest, hit.pageId) || !api.hasModule(courseId, hit.moduleId)) {
      setSearchError("لا يمكن فتح هذه الصفحة.");
      return;
    }
    setSearchOpening(true);
    setSearchError("");
    let allowed = false;
    try { allowed = onSearchOpenRef.current ? (await onSearchOpenRef.current(hit)) === true : true; } catch { allowed = false; }
    if (!mountedRef.current) return;
    setSearchOpening(false);
    if (!allowed) { setSearchError("لم تعد هذه الصفحة متاحة لك، أو تعذّر التحقق من صلاحيتك الآن. حاول مرة أخرى."); return; }
    setSearchOpen(false);
    setSavedSearchQuery(searchQueryRef.current);
    setSearchReturn(true);
    selectPage(hit.pageId);
  }, [manifest, courseId, api, selectPage]);

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
    // On a phone the toggle sits in the closed «المزيد» menu (not rendered as a box): focus that menu's button instead.
    const toggle = presentToggleRef.current;
    if (toggle && toggle.getClientRects().length === 0 && moreToggleRef.current?.getClientRects().length) moreToggleRef.current.focus();
    else toggle?.focus();
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
  // A nested dialog owns Escape / the keyboard: one inside the reader (index drawer, activity fullscreen) or one portalled
  // to the page (the reading-settings Dialog) — any open modal other than the presentation root itself.
  const nestedDialogOpen = useCallback(() => [...document.querySelectorAll('[aria-modal="true"]')].some(el => el !== rootRef.current), []);
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

  // Keyboard: F toggles presentation (any mode); ArrowLeft / PageDown → next, ArrowRight / PageUp → previous (RTL) —
  // anywhere in presentation, and in normal reading only from the reading surface (see `isReadingSurface`). Never while typing (input / textarea / select / editable — the CLI line is an input), never with a
  // modifier, never while a nested dialog owns the keyboard. Escape is handled by the presentation focus trap.
  useEffect(() => {
    if (!manifest) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target) || nestedDialogOpen()) return;
      if (e.key === "f" || e.key === "F" || e.code === "KeyF") { e.preventDefault(); togglePresentation(); return; }
      if (e.key === "Escape" && focusMode && !presentation) { e.preventDefault(); setFocusMode(false); return; }
      // Normal reading pages only while focus rests on the reading surface itself (the content root, which a click on
      // the text focuses, or the page title, which a page change focuses). Any focused control — a toolbar or TOC
      // button, a lesson activity, a training card, a scrollable region — keeps its own arrow keys.
      if (!presentation && !isReadingSurface(e.target, contentRef.current)) return;
      if (e.key === "ArrowLeft" || e.key === "PageDown") { e.preventDefault(); if (next) selectPage(next.id); }
      else if (e.key === "ArrowRight" || e.key === "PageUp") { e.preventDefault(); if (prev) selectPage(prev.id); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [manifest, presentation, focusMode, next, prev, selectPage, togglePresentation, nestedDialogOpen]);

  // Phase L.1 — touch screens turn pages with a horizontal swipe on the reading surface (see useReaderSwipe).
  const goNext = useCallback(() => { if (next) selectPage(next.id); }, [next, selectPage]);
  const goPrevious = useCallback(() => { if (prev) selectPage(prev.id); }, [prev, selectPage]);
  const swipe = useReaderSwipe(contentRef, goNext, goPrevious);

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
    lesson: lessonPosition(located.module.lessons, located.lesson.id),
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
      activeLessonId={located?.lesson.id}
      onSelectPage={selectPage}
      idPrefix={idPrefix}
      visited={visitedScope ? visited : undefined}
      showJump={!presentation}
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
      title={presentation ? "خروج من وضع العرض" : "وضع العرض"}
    >
      {presentation ? <IconMinimize size={18} aria-hidden="true" /> : <IconMaximize size={18} aria-hidden="true" />}
      <span className="learning-reader-btn-label">{presentation ? "خروج من وضع العرض" : "وضع العرض"}</span>
    </button>
  );

  // Phase 12A — «حركة الرسوم»: the explicit motion choice for this device (see ui/motionPreference.ts). `reducedMotion`
  // is the EFFECTIVE state (override, else the OS hint), so the control always names the action that changes it and
  // aria-pressed reflects whether the visuals currently move. Pressing it records an explicit "on" / "off" — a desktop
  // whose OS hides animations can turn the educational visuals back on, and anyone can switch them off.
  const motionToggle = (
    <button
      key="motion-toggle"
      type="button"
      className="eb-button is-quiet is-small learning-reader-motion-toggle"
      aria-pressed={!reducedMotion}
      onClick={() => setMotionOverride(reducedMotion ? "on" : "off")}
      title={reducedMotion ? "تشغيل حركة الرسوم" : "إيقاف حركة الرسوم"}
    >
      <IconSparkles size={18} aria-hidden="true" />
      <span className="learning-reader-btn-label">{reducedMotion ? "تشغيل حركة الرسوم" : "إيقاف حركة الرسوم"}</span>
    </button>
  );

  return (
    <div
      ref={rootRef}
      className={"learning-reader" + (presentation ? " is-presentation" : "")}
      dir="rtl"
      data-presentation={presentation || undefined}
      data-read-size={presentation ? undefined : readingSettings.size}
      data-read-spacing={presentation ? undefined : readingSettings.spacing}
      data-read-theme={presentation ? undefined : readingSettings.theme}
      data-toc={presentation ? undefined : sidebarDocked ? "docked" : "drawer"}
      data-focus={!presentation && focusMode ? "" : undefined}
      role={presentation ? "dialog" : undefined}
      aria-modal={presentation || undefined}
      aria-label={presentation ? "وضع العرض — " + bookTitle : undefined}
    >
      <div className="learning-reader-topbar">
        {!presentation && (
          <button type="button" className="eb-button is-quiet is-small learning-reader-back" onClick={onExit} title={exitLabel}>
            <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" /><span className="learning-reader-btn-label">{exitLabel}</span>
          </button>
        )}
        {presentation ? (
          <span className="learning-reader-booktitle">{bookTitle}{located ? <span className="learning-reader-topbar-page"> · {located.page.title}</span> : null}</span>
        ) : (
          // Phase L.1 — the book and where the reader is in it («الوحدة › الدرس»), so the page itself needs no kicker.
          <span className="learning-reader-titleblock">
            <span className="learning-reader-booktitle">{bookTitle}</span>
            {located && <span className="learning-reader-crumb">{located.module.title} › {located.lesson.title}</span>}
          </span>
        )}
        <button
          type="button"
          className="eb-button is-quiet is-small learning-reader-toc-toggle"
          aria-expanded={dockable ? sidebarDocked : drawerOpen}
          aria-controls={dockable ? "learning-reader-sidebar" : "learning-reader-drawer"}
          onClick={toggleToc}
          title="الفهرس"
        >
          {dockable ? <IconSidebar size={18} aria-hidden="true" /> : <IconMenu size={18} aria-hidden="true" />}<span className="learning-reader-btn-label">الفهرس</span>
        </button>
        {presentation && <span className="learning-reader-keyhint" aria-hidden="true">← → للتنقل · Esc للخروج</span>}
        {!presentation && searchEnabled && (
          <button type="button" ref={searchToggleRef} className="eb-button is-quiet is-small learning-reader-search-toggle" aria-haspopup="dialog" aria-expanded={searchOpen} onClick={openSearch} title="بحث">
            <IconSearch size={18} aria-hidden="true" /><span className="learning-reader-btn-label">بحث</span>
          </button>
        )}
        {!presentation && (
          <button type="button" className="eb-button is-quiet is-small learning-reader-settings-toggle" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)} title="إعدادات القراءة">
            <IconSliders size={18} aria-hidden="true" /><span className="learning-reader-btn-label">إعدادات القراءة</span>
          </button>
        )}
        {!presentation && (
          <button
            type="button"
            ref={moreToggleRef}
            className="eb-button is-quiet is-small learning-reader-more-toggle"
            aria-expanded={moreOpen}
            aria-controls="learning-reader-more"
            onClick={() => setMoreOpen(v => !v)}
            title="المزيد"
          >
            <IconMore size={18} aria-hidden="true" /><span className="learning-reader-btn-label">المزيد</span>
          </button>
        )}
        {/* On wide screens this group is part of the row (display: contents); on phones it is the «المزيد» menu. Choosing an
            action closes the menu. The buttons are the same elements on every width, so their names never change. */}
        <div id="learning-reader-more" ref={moreRef} className="learning-reader-more" data-open={moreOpen || undefined} onClick={e => { if ((e.target as Element).closest("button")) setMoreOpen(false); }}>
          {!presentation && (
            <button type="button" className="eb-button is-quiet is-small learning-reader-focus-toggle" aria-pressed={focusMode} onClick={() => setFocusMode(v => !v)} title={focusMode ? "الخروج من وضع التركيز" : "وضع التركيز"}>
              <IconBook size={18} aria-hidden="true" /><span className="learning-reader-btn-label">{focusMode ? "الخروج من وضع التركيز" : "وضع التركيز"}</span>
            </button>
          )}
          {motionToggle}
          {presentToggle}
        </div>
      </div>
      <ReadingSettingsDialog open={settingsOpen && !presentation} settings={readingSettings} onChange={changeReadingSettings} onClose={() => setSettingsOpen(false)} />

      <div className="learning-reader-layout">
        <aside id="learning-reader-sidebar" className="learning-reader-sidebar" aria-label="فهرس الكتاب (سطح المكتب)">{renderToc("desktop")}</aside>

        <ContentRoot className="learning-reader-main" ref={contentRef} tabIndex={-1} {...swipe}>
          {/* Phase L.0 — no stale «gradual release» note: only the introduction is pending, and the overview marks it «قريبًا». */}
          {!presentation && searchEnabled && searchReturn && !searchOpen && (
            <div className="learning-reader-search-return">
              <button type="button" className="eb-button is-small learning-reader-search-back" onClick={openSearch}>
                <IconSearch size={16} aria-hidden="true" />العودة إلى نتائج البحث{savedSearchQuery ? <span className="learning-reader-search-back-query"> «{savedSearchQuery}»</span> : null}
              </button>
            </div>
          )}
          {header ? <LearningPageRenderer header={header} body={body} training={training} study={study} /> : <p className="learning-reader-status" role="status">لا توجد صفحات بعد.</p>}
          {located && body.kind === "ready" && body.page.blocks.some(b => b.type === "unit-opener") && (
            <UnitContents module={located.module} currentLessonId={located.lesson.id} onSelectPage={selectPage} visited={visitedScope ? visited : undefined} />
          )}
        </ContentRoot>
      </div>

      <nav className="learning-reader-nav" aria-label="تنقّل بين الصفحات">
        {/* Phase 21E L2-B — a thin book-position bar along the top edge of the page bar (normal reading). The ordinal
            «n / total» counts the pages THIS reader can open (a student's published pages only). */}
        {!presentation && position.total > 0 && (
          <div
            className="learning-reader-progress"
            role="progressbar"
            aria-label="موضعك في الكتاب"
            aria-valuemin={1}
            aria-valuemax={position.total}
            aria-valuenow={Math.max(1, position.index)}
            aria-valuetext={`الصفحة ${position.index} من ${position.total}`}
          >
            <span className="learning-reader-progress-fill" style={{ "--learning-reader-progress": Math.max(0, position.index) / position.total } as CSSProperties} />
          </div>
        )}
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
        {/* Phase L.1 — the next page's title rides under «التالي» (normal reading); the button's name stays «التالي» and the
            title is its description, so the control reads the same to every user and every test. */}
        <button
          type="button"
          className="eb-button learning-reader-navbtn learning-reader-navbtn-next"
          disabled={!next}
          onClick={() => next && selectPage(next.id)}
          aria-label="التالي"
          aria-describedby={next && !presentation ? "learning-reader-next-title" : undefined}
        >
          <span className="learning-reader-navbtn-text">
            <span>التالي</span>
            {next && !presentation && <small id="learning-reader-next-title" className="learning-reader-navbtn-sub">{next.title}</small>}
          </span>
          <IconChevronBack size={18} aria-hidden="true" />
        </button>
      </nav>

      {searchOpen && !presentation && (
        <div className="learning-reader-search-root">
          <div className="learning-reader-search-backdrop" aria-hidden="true" onClick={closeSearch} />
          <div ref={searchRef} id="learning-reader-search" className="learning-reader-search" role="dialog" aria-modal="true" aria-labelledby="learning-reader-search-title">
            <div className="learning-reader-search-head">
              <h2 id="learning-reader-search-title" className="learning-reader-search-title">البحث في الكتاب</h2>
              <button type="button" className="eb-button is-quiet is-small" onClick={closeSearch}>
                <IconClose size={18} aria-hidden="true" />إغلاق
              </button>
            </div>
            <Suspense fallback={<p className="learning-reader-status" role="status">جارٍ تحميل البحث...</p>}>
              <ReaderSearchPanel
                initialQuery={savedSearchQuery}
                queryRef={searchQueryRef}
                onEdited={clearSearchError}
                sources={searchSources}
                availability={searchScopeValid ? "ready" : "unavailable"}
                onOpen={hit => { void openSearchHit(hit); }}
                openError={searchError}
                opening={searchOpening}
                inputRef={searchInputRef}
                providerFactory={searchProviderFactory}
                autoFocus
              />
            </Suspense>
          </div>
        </div>
      )}

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

/** Normal-mode paging source: the reading surface (content root) or the focused page title — never a control. */
/** The search dialog's panel with its own query state: a keystroke re-renders this subtree only. The query is mirrored into
 * the Reader's ref so it survives closing and reopening the dialog. */
function ReaderSearchPanel({ initialQuery, queryRef, onEdited, ...panel }: Omit<LearningSearchPanelProps, "query" | "onQueryChange"> & { initialQuery: string; queryRef: MutableRefObject<string>; onEdited: () => void }) {
  const [query, setQuery] = useState(initialQuery);
  const hasError = Boolean(panel.openError);
  const onQueryChange = useCallback((q: string) => { queryRef.current = q; setQuery(q); if (hasError) onEdited(); }, [queryRef, hasError, onEdited]);
  return <LearningSearchPanel {...panel} query={query} onQueryChange={onQueryChange} />;
}

function isReadingSurface(target: EventTarget | null, content: HTMLElement | null): boolean {
  if (!(target instanceof Element) || !content) return false;
  return target === content || (target.id === "learning-reader-page-title" && content.contains(target));
}

/** "Lesson x of y" inside its module, by the canonical lesson order (null if the lesson is unknown). */
function lessonPosition(lessons: readonly { id: string; order: number }[], lessonId: string): { index: number; total: number } | null {
  const ordered = [...lessons].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const i = ordered.findIndex(l => l.id === lessonId);
  return i < 0 ? null : { index: i + 1, total: ordered.length };
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
