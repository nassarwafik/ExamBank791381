import { Component } from "react";
import type { ReactNode } from "react";
import { isChunkLoadError } from "../../lazyWithRetry";
import { IconWarning } from "../../icons";

type Kind = "chunk" | "runtime";
type Props = { children: ReactNode };
type State = { failed: Kind | null };

/**
 * Phase 11D — a LOCAL boundary around ONE educational illustration (inside VisualBlockView's frame only).
 *
 * A visual is a lazy chunk wrapped in lazyWithRetry, which already performs the one automatic stale-deployment reload.
 * When that recovery is exhausted (or the visual throws while rendering), the error used to bubble to the GLOBAL
 * ErrorBoundary and replace the whole Reader. Here it stops at the frame: the figure, its title and caption, the rest of
 * the page, the Reader chrome, the reading position and the session all stay; only the illustration area shows a calm
 * note. Two cases, never conflated (and distinct from the registry's unknown-visual «قيد الإعداد»):
 *   • stale deployment chunk  → «تم تحديث الرسم التوضيحي…» + a USER-pressed reload button (no automatic reload here:
 *     the only automatic reload belongs to lazyWithRetry, so this can never loop);
 *   • ordinary render failure → «تعذر عرض الرسم التوضيحي حاليًا.»
 * The raw error (message, stack, chunk URL) is never rendered; the log carries only the fixed classification code.
 * VisualBlockView keys it by visualId, so a different visual on the same frame starts clean.
 */
export default class VisualErrorBoundary extends Component<Props, State> {
  state: State = { failed: null };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: isChunkLoadError(error) ? "chunk" : "runtime" };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.warn("[VisualErrorBoundary]", { code: isChunkLoadError(error) ? "visual-chunk-load" : "visual-runtime" });
  }

  render() {
    const { failed } = this.state;
    if (!failed) return this.props.children;
    return (
      <div className="eb-visual-missing eb-visual-failed" role="status" data-visual-failure={failed}>
        <IconWarning size={18} aria-hidden="true" />
        {failed === "chunk"
          ? <>
            <span>تم تحديث الرسم التوضيحي. أعد تحميل الصفحة لعرض النسخة الجديدة.</span>
            <button type="button" className="eb-button is-small is-quiet eb-visual-reload" onClick={() => { try { window.location.reload(); } catch { /* non-browser */ } }}>إعادة تحميل الصفحة</button>
          </>
          : <span>تعذر عرض الرسم التوضيحي حاليًا.</span>}
      </div>
    );
  }
}
