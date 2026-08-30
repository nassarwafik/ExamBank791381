import { Component } from "react";
import type { ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/**
 * Low-risk safety net: catches render errors anywhere below it and shows a
 * calm Arabic fallback instead of a blank/broken screen. Does not touch
 * App logic, routing, or auth — purely a wrapper around <App/> in main.tsx.
 * Inline styles on purpose, so the fallback still renders correctly even if
 * something else in the CSS pipeline is what broke.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("ErrorBoundary caught an error:", error, info?.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
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
            fontFamily:
              '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif',
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
            <h1 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
              حدث خطأ غير متوقع
            </h1>
            <p style={{ margin: "0 0 22px", color: "#64748b", fontSize: 14, lineHeight: 1.8 }}>
              حدث خطأ غير متوقع. يمكنك إعادة تحميل الصفحة والمحاولة مجددًا.
              البيانات التي تم حفظها سابقًا ستبقى محفوظة.
            </p>
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
              إعادة تحميل الصفحة
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
