import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { AnnotationsClient, ReaderAnnotations } from "./annotationsClient";
import { paintHighlights } from "./highlightRanges";

// Phase L.5 — the Reader's annotations state (one read on open, every write answered with the fresh server view) and the
// painter that shows the current page's highlights. The panel and the selection chip are in ReaderAnnotations.tsx.

export type AnnotationsState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: ReaderAnnotations };

export type ReaderAnnotationsApi = {
  state: AnnotationsState;
  busy: boolean;
  /** The last write's failure (the server's message), cleared by the next action. */
  error: string;
  /** The last write's confirmation («✓ …»), cleared by the next action. */
  notice: string;
  retry: () => void;
  toggleBookmark: (pageId: string) => Promise<void>;
  saveNote: (pageId: string, text: string) => Promise<boolean>;
  highlight: (pageId: string, quote: string) => Promise<void>;
  unhighlight: (pageId: string, id: string) => Promise<void>;
};

/** The student's annotations for one course: one read on mount, then every write answers with the fresh server view.
 *  No client (a teacher preview) → "off": no request and no write is ever made. */
export function useReaderAnnotations(client: AnnotationsClient | null, courseId: string): ReaderAnnotationsApi {
  const [state, setState] = useState<AnnotationsState>(client ? { status: "loading" } : { status: "off" });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busyRef = useRef(false);
  // The outcome line fades after a few seconds; an error stays until the next action.
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!client) return;
    let alive = true;
    void client.get(courseId).then(data => { if (alive) setState(data ? { status: "ready", data } : { status: "error" }); });
    return () => { alive = false; };
  }, [client, courseId, attempt]);
  const run = useCallback(async (write: (c: AnnotationsClient) => Promise<ReaderAnnotations>, done: string): Promise<boolean> => {
    if (!client || busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const data = await write(client);
      setState({ status: "ready", data });
      setNotice(done);
      return true;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "تعذر حفظ التغيير الآن. حاول مرة أخرى.");
      return false;
    } finally { busyRef.current = false; setBusy(false); }
  }, [client]);
  const bookmarked = (pageId: string) => state.status === "ready" && state.data.bookmarks.some(b => b.pageId === pageId);
  return {
    state, busy, error, notice,
    retry: () => { setState({ status: "loading" }); setAttempt(n => n + 1); },
    toggleBookmark: async pageId => {
      const on = !bookmarked(pageId);
      await run(c => c.bookmark(courseId, pageId, on), on ? "✓ أُضيفت الصفحة إلى علاماتك المرجعية." : "✓ أُزيلت العلامة المرجعية.");
    },
    saveNote: (pageId, text) => run(c => c.note(courseId, pageId, text), text.trim() ? "✓ حُفظت ملاحظتك." : "✓ حُذفت ملاحظتك."),
    highlight: async (pageId, quote) => { await run(c => c.highlight(courseId, pageId, quote), "✓ ظُلّل المقطع."); },
    unhighlight: async (pageId, id) => { await run(c => c.unhighlight(courseId, pageId, id), "✓ أُزيل التظليل."); },
  };
}

/** Paints the current page's highlights and repaints when the page's content changes (lazy figures, a module arriving). */
export function useHighlightPainter(contentRef: RefObject<HTMLElement | null>, quotes: readonly string[], pageKey: string) {
  const key = pageKey + "\u0000" + quotes.join("\u0000");
  useEffect(() => {
    const root = contentRef.current;
    if (!root || quotes.length === 0) return;                // nothing to paint: no observer, no work
    let frame = 0;
    let painted = paintHighlights(root.querySelector(".learning-reader-page"), quotes);
    const repaint = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { painted.clear(); painted = paintHighlights(root.querySelector(".learning-reader-page"), quotes); });
    };
    const observer = typeof MutationObserver === "function" ? new MutationObserver(repaint) : null;
    observer?.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { observer?.disconnect(); cancelAnimationFrame(frame); painted.clear(); };
  }, [contentRef, key]);   // eslint-disable-line react-hooks/exhaustive-deps
}
