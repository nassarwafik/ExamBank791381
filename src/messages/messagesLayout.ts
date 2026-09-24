import { useCallback, useMemo, useSyncExternalStore } from "react";

// Phase 5E — responsive presentation helpers for the teacher messaging workspace. PRESENTATION ONLY: nothing here
// owns selection, thread data, polling or read state. The page derives which pane(s) to show from the EXISTING
// selected student plus the viewport, so resizing never changes what is selected, loaded or drafted.

/** At or above this width the roster and the conversation sit side by side; below it, one pane at a time. */
export const WIDE_LAYOUT_QUERY = "(min-width: 900px)";

/** Which direct-message pane(s) are on screen: both (desktop), or one of them (phone / narrow tablet). */
export type MessagesPane = "split" | "roster" | "conversation";
/** On a narrow screen: the pane the teacher last navigated to (a UI choice, never a second selection). */
export type NarrowPane = "roster" | "conversation";

export function messagesPane(wide: boolean, hasSelectedStudent: boolean, narrowPane: NarrowPane): MessagesPane {
  if (wide) return "split";
  return hasSelectedStudent && narrowPane === "conversation" ? "conversation" : "roster";
}

/** True while the direct conversation is actually on screen (the only time it may be polled or acknowledged). */
export function isConversationVisible(pane: MessagesPane): boolean {
  return pane !== "roster";
}

function subscribeTo(query: string) {
  return (onChange: () => void) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
    const list = window.matchMedia(query);
    if (typeof list.addEventListener === "function") {
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    }
    list.addListener?.(onChange);                                   // older Safari
    return () => list.removeListener?.(onChange);
  };
}
function readQuery(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;   // no media support → desktop
  return window.matchMedia(query).matches;
}

/** Live `matchMedia` result for the wide (two-pane) layout. */
export function useWideLayout(query: string = WIDE_LAYOUT_QUERY): boolean {
  const subscribe = useMemo(() => subscribeTo(query), [query]);          // stable → no resubscribe per render
  const read = useCallback(() => readQuery(query), [query]);
  return useSyncExternalStore(subscribe, read, () => true);
}

/** Distance (px) from the bottom within which the reader counts as "following" the newest messages. */
export const NEAR_BOTTOM_PX = 80;

export function isNearBottom(el: { scrollTop: number; scrollHeight: number; clientHeight: number }, threshold = NEAR_BOTTOM_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

/**
 * Chat auto-scroll rule. Jump to the newest message when a thread is (re)opened, when the viewer's OWN message
 * becomes the newest one (a successful send), or when the reader was already at the bottom. A reader who scrolled
 * up to older history keeps their position when a poll brings new messages.
 */
export function shouldScrollToNewest(input: { threadChanged: boolean; wasNearBottom: boolean; newestChanged: boolean; newestIsMine: boolean }): boolean {
  if (input.threadChanged) return true;
  if (input.newestChanged && input.newestIsMine) return true;
  return input.wasNearBottom;
}
