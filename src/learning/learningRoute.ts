// Phase L.2 — the Learning Materials location in the URL, so a book, a section or a page has a link, the browser's Back
// button walks the library ⇄ book ⇄ reader steps, and a reload keeps the reader where it was.
//
// The app has no router: the teacher shell keeps its own navigation in state. This route is therefore a URL FRAGMENT
// owned by the Learning Materials page alone — no server rewrite, no change to any other page:
//
//   #/learning                              the library
//   #/learning/<courseId>                   a book's overview
//   #/learning/<courseId>/read              the reader at the book's beginning
//   #/learning/<courseId>/read/<pageId>     the reader at a page
//
// Ids are validated (the same shape the content ids have); anything malformed is "no route", never a crash, and an
// unknown course or page is resolved by the page / the Reader exactly as before (library, or the book's first page).

export type LearningRoute =
  | { kind: "library" }
  | { kind: "course"; courseId: string }
  | { kind: "reader"; courseId: string; pageId?: string };

const PREFIX = "#/learning";
const ID = /^[A-Za-z0-9_-]{1,80}$/;

/** The route a fragment names, or null when the fragment is not a (well-formed) Learning Materials route. */
export function parseLearningRoute(hash: string): LearningRoute | null {
  if (typeof hash !== "string" || !(hash === PREFIX || hash.startsWith(PREFIX + "/"))) return null;
  const parts = hash.slice(PREFIX.length).split("/").filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return "\u0000"; } });
  if (parts.length === 0) return { kind: "library" };
  const [courseId, verb, pageId, ...rest] = parts;
  if (!ID.test(courseId) || rest.length > 0) return null;
  if (verb === undefined) return { kind: "course", courseId };
  if (verb !== "read") return null;
  if (pageId === undefined) return { kind: "reader", courseId };
  return ID.test(pageId) ? { kind: "reader", courseId, pageId } : null;
}

/** The fragment for a route (always well-formed). */
export function formatLearningRoute(route: LearningRoute): string {
  if (route.kind === "library") return PREFIX;
  if (route.kind === "course") return PREFIX + "/" + encodeURIComponent(route.courseId);
  return PREFIX + "/" + encodeURIComponent(route.courseId) + "/read" + (route.pageId ? "/" + encodeURIComponent(route.pageId) : "");
}

/** True when the current URL opens Learning Materials (the teacher app starts on that page). */
export function isLearningLocation(): boolean {
  try { return typeof location !== "undefined" && parseLearningRoute(location.hash) !== null; } catch { return false; }
}

/** Write the route into the URL: a new history entry (`push`) or the current one replaced. Never throws. */
export function writeLearningRoute(route: LearningRoute, mode: "push" | "replace"): void {
  try {
    const hash = formatLearningRoute(route);
    if (location.hash === hash) return;
    const url = location.pathname + location.search + hash;
    if (mode === "push") history.pushState(null, "", url); else history.replaceState(null, "", url);
  } catch { /* history unavailable (sandboxed frame): the page keeps working without a URL */ }
}

/** Remove the Learning Materials fragment (the teacher left the page). Leaves any other fragment alone. */
export function clearLearningRoute(): void {
  try {
    if (parseLearningRoute(location.hash) === null) return;
    history.replaceState(null, "", location.pathname + location.search);
  } catch { /* ignore */ }
}
