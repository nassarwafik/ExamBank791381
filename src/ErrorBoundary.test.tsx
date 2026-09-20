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

  it("logs a SAFE bounded diagnostic (code + name) and NEVER tokens/credentials", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom error={chunkErr} /></ErrorBoundary>);
    // Inspect ONLY the boundary's own bounded log line (`console.error("[ErrorBoundary]", {...})`) — never React's
    // framework dev logging, which is not our production output.
    const ours = spy.mock.calls.filter(c => c[0] === "[ErrorBoundary]");
    const logged = JSON.stringify(ours);
    expect(ours.length).toBeGreaterThan(0);
    expect(logged).toContain("chunk-load");        // the classification code
    expect(logged).toContain("TypeError");         // the safe constructor-name label
    expect(logged).not.toMatch(/bearer|token|password|examBankBuilderToken/i);
  });

  it("PRODUCTION log is bounded — the raw message (URLs/ids/secrets) NEVER leaves the process", () => {
    // Force production: the DEV-only full-error/component-stack branch must be gated OFF, and the single bounded
    // line must not contain any of the sensitive fragments a real runtime error might carry.
    vi.stubEnv("DEV", false);
    vi.stubEnv("PROD", true);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = Object.assign(new Error("Bearer SECRET-TOKEN studentId=123 password=abc"), { name: "TypeError" });
    render(<ErrorBoundary><Boom error={secret} /></ErrorBoundary>);
    // No DEV full-error line was emitted (it is the only other place the raw message could appear).
    expect(spy.mock.calls.some(c => String(c[0]).includes("(dev)"))).toBe(false);
    // The boundary's own bounded production line carries only { code, name } — never the message contents.
    const ours = JSON.stringify(spy.mock.calls.filter(c => c[0] === "[ErrorBoundary]"));
    expect(ours).toContain("runtime");
    expect(ours).toContain("TypeError");
    expect(ours).not.toContain("SECRET-TOKEN");
    expect(ours).not.toContain("studentId=123");
    expect(ours).not.toContain("password=abc");
    expect(ours).not.toMatch(/bearer/i);
    vi.unstubAllEnvs();
  });

  it("renders children normally when there is no error", () => {
    render(<ErrorBoundary><p>OK-CONTENT</p></ErrorBoundary>);
    expect(screen.getByText("OK-CONTENT")).toBeTruthy();
  });
});
