// Mobile session-safety hotfix — disable the browser's NATIVE pull-to-refresh / overscroll navigation gesture.
//
// On Android (Chrome and the installed PWA) dragging the page down past its top edge triggers the browser's own
// reload spinner. That reload is accidental: it can throw a student out of an exam, the Reader, Messages or Games,
// and — whenever the reload does not bring the session back — land on the login page. The browser control for this
// gesture is `overscroll-behavior` on the ROOT scroller: `none` on the y axis stops the pull-to-refresh action and the
// boundary glow/bounce, and nothing else. Ordinary scrolling (including inner scroll areas, which keep their own
// `overscroll-behavior: contain`) is unchanged; this sets NO overflow, NO touch-action and NO event listener, so no
// touch is ever prevented. Explicit reloads (the browser's reload button, F5, the menu) are unaffected.
//
// The same rule lives in index.css (applies before any script runs); this helper applies it inline on <html> and
// <body> at startup as well, so the guard does not depend on stylesheet load order and is directly testable.
// Authentication is untouched: the session keeps its sessionStorage / /api/platform-session contract.

export const PULL_TO_REFRESH_GUARD = "none";

/** Apply the guard to the document's root scrolling surfaces. Idempotent; a no-op without a DOM. */
export function installPullToRefreshGuard(doc: Document | undefined = typeof document === "undefined" ? undefined : document): void {
  if (!doc) return;
  for (const el of [doc.documentElement, doc.body]) {
    if (!el) continue;
    el.style.setProperty("overscroll-behavior-y", PULL_TO_REFRESH_GUARD);
  }
}
