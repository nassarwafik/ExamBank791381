// @vitest-environment happy-dom
// Realistic integration of the STUDENT Reader lazy-load path — the exact production machinery
// (lazyWithRetry → React.lazy → Suspense → ErrorBoundary) — covering:
//   A. normal current-version load → the Reader opens
//   B. stale-deployment chunk mismatch → bounded ONE-shot recovery (reload), not the fatal boundary
//   C. mismatch that survives the reload → the calm "site updated" boundary (session preserved), no loop
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { lazy, Suspense } from "react";
import type { ReactElement } from "react";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";
import { lazyWithRetry } from "./lazyWithRetry";

const KEY = "student-reader";
const chunkErr = () => Object.assign(new Error("Failed to fetch dynamically imported module: /assets/StudentReader-OLD.js"), { name: "TypeError" });

function Harness({ factory }: { factory: () => Promise<{ default: () => ReactElement }> }) {
  const Lazy = lazy(lazyWithRetry(factory, KEY));
  return (
    <ErrorBoundary>
      <Suspense fallback={<p role="status">جارٍ فتح المادة التعليمية...</p>}>
        <Lazy />
      </Suspense>
    </ErrorBoundary>
  );
}

beforeEach(() => { try { sessionStorage.clear(); } catch { /* ignore */ } vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Student Reader deployment recovery", () => {
  it("A: normal current-version load opens the Reader", async () => {
    const factory = () => Promise.resolve({ default: () => <p>READER-OPEN</p> });
    render(<Harness factory={factory} />);
    expect(await screen.findByText("READER-OPEN")).toBeTruthy();
  });

  it("B: a stale chunk mismatch (first time) triggers exactly ONE controlled reload and stays on the loading state — never the fatal boundary", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, writable: true });
    render(<Harness factory={() => Promise.reject(chunkErr())} />);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    // still suspended (loading), NOT the fatal error boundary
    expect(screen.getByRole("status").textContent).toContain("جارٍ فتح المادة");
    expect(screen.queryByText("حدث خطأ غير متوقع")).toBeNull();
    expect(sessionStorage.getItem("examBankChunkReload:" + KEY)).toBe("1");
  });

  it("C: a mismatch that survives the reload shows the calm 'site updated' boundary (session preserved) and does NOT reload again", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, writable: true });
    sessionStorage.setItem("examBankChunkReload:" + KEY, "1");    // the one reload already happened
    sessionStorage.setItem("examBankBuilderToken", "student-token"); // a real session is present
    render(<Harness factory={() => Promise.reject(chunkErr())} />);
    expect(await screen.findByText("تم تحديث الموقع")).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();                        // no second reload → no loop
    expect(sessionStorage.getItem("examBankBuilderToken")).toBe("student-token"); // session preserved
  });
});
