import { Component } from "react";
import type { ReactNode } from "react";
import { isChunkLoadError } from "./lazyWithRetry";

type Props = { children: ReactNode };
type ErrorKind = "chunk" | "runtime";
type State = { hasError: boolean; kind: ErrorKind };

/**
 * Low-risk safety net: catches render errors anywhere below it and shows a calm Arabic fallback instead of a
 * blank/broken screen. Does not touch App logic, routing, or auth — purely a wrapper around <App/> in main.tsx.
 * Inline styles on purpose, so the fallback still renders correctly even if something else in the CSS pipeline
 * is what broke.
 *
 * It DISTINGUISHES a stale-deployment chunk-load failure (a lazy chunk 404'd because the site was updated while
 * this tab was open) from an ordinary runtime error. A chunk failure gets a specific, reassuring "the site was
 * updated — reload the new version" message; the reload fetches the fresh index.html and current chunks. The
 * per-lazy `lazyWithRetry` already auto-recovers this once, so the boundary is only reached if that one reload
 * did not resolve it — hence the button is a user-initiated reload (no automatic loop). The retained session is
 * never touched here. Ordinary runtime errors keep the honest generic message so real bugs are not disguised.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, kind: "runtime" };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, kind: isChunkLoadError(error) ? "chunk" : "runtime" };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    // SANITIZED observability. A runtime error's `message` can carry request URLs, ids, or token/password fragments
    // that bubbled up from application code, and its component stack can leak internal structure. In PRODUCTION we
    // therefore emit ONLY a bounded, structured summary — the classification code and the error's constructor name
    // (a safe class label like "TypeError"/"ChunkLoadError"), never the message, stack, or component tree. The full
    // error and React component stack are logged in DEV only, where the developer already has these values locally.
    const e = (error ?? {}) as { name?: unknown };
    const kind: ErrorKind = isChunkLoadError(error) ? "chunk" : "runtime";
    const code = kind === "chunk" ? "chunk-load" : "runtime";
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", { code, name: typeof e.name === "string" ? e.name : "Error" });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[ErrorBoundary] (dev) full error:", error, "\ncomponentStack:", info?.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      const chunk = this.state.kind === "chunk";
      const title = chunk ? "تم تحديث الموقع" : "حدث خطأ غير متوقع";
      const body = chunk
        ? "تم تحديث الموقع إلى نسخة جديدة. أعد تحميل النسخة الجديدة للمتابعة. بياناتك وجلستك محفوظة."
        : "حدث خطأ غير متوقع. يمكنك إعادة تحميل الصفحة والمحاولة مجددًا. البيانات التي تم حفظها سابقًا ستبقى محفوظة.";
      const button = chunk ? "إعادة تحميل النسخة الجديدة" : "إعادة تحميل الصفحة";
      return (
        <main
          dir="rtl"
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "#f5f7fa",
            fontFamily: '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: 440,
              width: "100%",
              background: "#fff",
              border: "1px solid #e9edf4",
              borderRadius: 20,
              padding: "32px 28px",
              textAlign: "center",
              boxShadow: "0 24px 60px -28px rgba(15,23,42,.18)",
            }}
          >
            <h1 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{title}</h1>
            <p style={{ margin: "0 0 22px", color: "#64748b", fontSize: 14, lineHeight: 1.8 }}>{body}</p>
            <button
              onClick={() => window.location.reload()}
              style={{
                border: 0,
                cursor: "pointer",
                padding: "12px 26px",
                borderRadius: 12,
                background: "#2563eb",
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              {button}
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
