// @vitest-environment happy-dom
// ErrorBoundary distinguishes a stale-deployment chunk-load failure (calm "site updated — reload" message, session
// preserved) from an ordinary runtime error (honest generic message), and logs a SAFE, non-sensitive diagnostic.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

function Boom({ error }: { error: unknown }): never { throw error; }
const chunkErr = Object.assign(new Error("Failed to fetch dynamically imported module: https://x/assets/StudentReader-abc.js"), { name: "TypeError" });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ErrorBoundary", () => {
  it("chunk-load failure → the specific 'site updated' recoverable message (NOT the generic fatal one)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom error={chunkErr} /></ErrorBoundary>);
    expect(screen.getByText("تم تحديث الموقع")).toBeTruthy();
    expect(screen.getByText(/أعد تحميل النسخة الجديدة/)).toBeTruthy();
    expect(screen.getByText(/وجلستك محفوظة/)).toBeTruthy();          // session/data preserved
    expect(screen.getByRole("button").textContent).toContain("إعادة تحميل النسخة الجديدة");
    expect(screen.queryByText("حدث خطأ غير متوقع")).toBeNull();       // not the generic fatal screen
  });

  it("ordinary runtime error → the honest generic message (a real bug is not disguised as a deploy refresh)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom error={new Error("Cannot read properties of undefined (reading 'x')")} /></ErrorBoundary>);
    expect(screen.getByText("حدث خطأ غير متوقع")).toBeTruthy();
    expect(screen.queryByText("تم تحديث الموقع")).toBeNull();
  });

  it("reload button triggers a reload", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, writable: true });
    render(<ErrorBoundary><Boom error={chunkErr} /></ErrorBoundary>);
    fireEvent.click(screen.getByRole("button"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("logs a SAFE diagnostic (kind + name + message) and NEVER tokens/credentials", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom error={chunkErr} /></ErrorBoundary>);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("[ErrorBoundary]");
    expect(logged).toContain("chunk");
    expect(logged).not.toMatch(/bearer|token|password|examBankBuilderToken/i);
  });

  it("renders children normally when there is no error", () => {
    render(<ErrorBoundary><p>OK-CONTENT</p></ErrorBoundary>);
    expect(screen.getByText("OK-CONTENT")).toBeTruthy();
  });
});
