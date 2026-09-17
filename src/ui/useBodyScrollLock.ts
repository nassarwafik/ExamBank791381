import { useEffect } from "react";

/**
 * useBodyScrollLock (UX-8a) — the shared Dialog's body scroll-lock semantics for the legacy full-screen overlays
 * (AssignmentReview, ExamPreview, StructuredExamImportDialog): capture the previous `document.body.style.overflow`,
 * set it to "hidden" while active, and restore the captured value on cleanup. Because the captured value is
 * restored verbatim, an overlay opened above an already-open Dialog (whose lock already set "hidden") restores
 * "hidden" on close and never unlocks the parent Dialog. The Dialog primitive keeps its own stack-aware lock.
 */
export default function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [active]);
}
