// Phase 8B — paging of the student's class achievement feed (presentation only; the server order is kept).

/** The feed opens on the newest FEED_PAGE posts; «عرض المزيد» reveals the next FEED_PAGE already loaded. */
export const FEED_PAGE = 10;

/**
 * How many posts are on screen: the student's own choice (`requested`, grown by «عرض المزيد»), widened — never
 * narrowed — so that a post a notification points at is always rendered (routeRecognition can then scroll to and
 * focus it). Derived during render, so the target exists in the SAME commit that sets the highlight.
 */
export function visiblePostCount(total: number, requested: number, highlightIndex: number): number {
  const needed = highlightIndex >= 0 ? Math.ceil((highlightIndex + 1) / FEED_PAGE) * FEED_PAGE : 0;
  return Math.min(total, Math.max(requested, needed));
}
