// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { installClientErrorReporting, resetClientErrorReporting, sendClientErrorReport, reportRenderError, ownLocation, topFrame, safeErrorName } from "./clientErrorReporter";
import ErrorBoundary from "../ErrorBoundary";

// D3 (item 3) — the browser half of client error reporting: content-free, signed-in only, bounded, never throws.

type Sent = { url: string; init: RequestInit; body: Record<string, unknown> };
let sent: Sent[];
beforeEach(() => {
  sent = [];
  resetClientErrorReporting();
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init: RequestInit) => { sent.push({ url, init, body: JSON.parse(String(init.body)) }); return Promise.resolve({ ok: true, status: 204 } as Response); });
  try { sessionStorage.setItem("examBankBuilderToken", "tok-1"); } catch { /* ignore */ }
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); try { sessionStorage.clear(); } catch { /* ignore */ } });

describe("what a report may contain", () => {
  it("only the app's own bundle location; another origin, an extension or a query loses it", () => {
    expect(ownLocation(location.origin + "/assets/index-ab.js", 1, 20)).toEqual({ file: "/assets/index-ab.js", line: 1, col: 20 });
    expect(ownLocation("https://evil.example/assets/x.js", 1, 2)).toEqual({});
    expect(ownLocation("chrome-extension://abc/content.js", 1, 2)).toEqual({});
    expect(ownLocation(location.origin + "/index.html", 1, 2)).toEqual({});
  });
  it("the first own frame of a stack; error names outside the allowlist collapse to Error", () => {
    expect(topFrame(`TypeError: x\n    at f (chrome-extension://a/b.js:1:1)\n    at g (${location.origin}/assets/Exam-12.js:3:44)`)).toEqual({ file: "/assets/Exam-12.js", line: 3, col: 44 });
    expect(safeErrorName({ name: "TypeError" })).toBe("TypeError");
    expect(safeErrorName({ name: "token=abc" })).toBe("Error");
  });
  it("the request carries the session token in a header and ONLY the allowlisted fields in the body (never a message or stack)", () => {
    reportRenderError(Object.assign(new TypeError("answer=سرّي"), { stack: `TypeError: answer=سرّي\n at ${location.origin}/assets/A-1.js:2:3` }), "exam-question");
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("/api/client-error-report");
    expect((sent[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(sent[0].init.keepalive).toBe(true);
    expect(Object.keys(sent[0].body).sort()).toEqual(["area", "build", "col", "file", "kind", "line", "name"]);
    expect(sent[0].body).toMatchObject({ kind: "render", name: "TypeError", file: "/assets/A-1.js", line: 2, col: 3, area: "exam-question" });
    expect(JSON.stringify(sent[0].body)).not.toContain("سرّي");
  });
});

describe("bounds", () => {
  it("no session token → nothing is sent", () => {
    sessionStorage.clear();
    expect(sendClientErrorReport({ kind: "runtime" })).toBe(false);
    expect(sent).toHaveLength(0);
  });
  it("identical reports are sent once; at most 5 per page load", () => {
    for (let i = 0; i < 3; i++) sendClientErrorReport({ kind: "runtime", name: "Error", file: "/assets/a.js", line: 1, col: 1 });
    expect(sent).toHaveLength(1);
    for (let i = 2; i < 12; i++) sendClientErrorReport({ kind: "runtime", name: "Error", file: "/assets/a.js", line: i, col: 1 });
    expect(sent).toHaveLength(5);
  });
  it("a failing network never throws into the app", async () => {
    (globalThis as { fetch?: unknown }).fetch = vi.fn(() => Promise.reject(new Error("offline")));
    expect(() => sendClientErrorReport({ kind: "runtime" })).not.toThrow();
    await new Promise(r => setTimeout(r, 0));
  });
});

describe("global listeners and the app's error boundary", () => {
  it("an uncaught error in the app's code, an unhandled rejection and a CSP violation are reported; a resource load error and ResizeObserver noise are not", () => {
    installClientErrorReporting();
    window.dispatchEvent(new ErrorEvent("error", { message: "boom", filename: location.origin + "/assets/index-x.js", lineno: 5, colno: 6, error: new RangeError("boom") }));
    window.dispatchEvent(new ErrorEvent("error", { message: "ResizeObserver loop completed with undelivered notifications." }));
    window.dispatchEvent(new Event("error"));
    const rejection = new Event("unhandledrejection") as Event & { reason?: unknown };
    rejection.reason = Object.assign(new TypeError("x"), { stack: `TypeError: x\n at ${location.origin}/assets/B-2.js:7:8` });
    window.dispatchEvent(rejection);
    const csp = new Event("securitypolicyviolation") as Event & Record<string, unknown>;
    Object.assign(csp, { effectiveDirective: "script-src-elem", violatedDirective: "script-src-elem", blockedURI: "https://cdn.evil.example/x.js?student=1", sourceFile: location.origin + "/assets/index-x.js", lineNumber: 1, columnNumber: 2 });
    document.dispatchEvent(csp);
    expect(sent.map(s => s.body.kind)).toEqual(["runtime", "rejection", "csp"]);
    expect(sent[0].body).toMatchObject({ name: "RangeError", file: "/assets/index-x.js", line: 5, col: 6 });
    expect(sent[1].body).toMatchObject({ name: "TypeError", file: "/assets/B-2.js", line: 7, col: 8 });
    expect(sent[2].body).toMatchObject({ directive: "script-src-elem", blocked: "https://cdn.evil.example" });
  });
  it("the root ErrorBoundary reports a render error (area app) and keeps its fallback", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => { throw new TypeError("render failed: secret"); };
    const r = render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(r.container.textContent).toContain("حدث خطأ غير متوقع");
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatchObject({ kind: "render", name: "TypeError", area: "app" });
    expect(JSON.stringify(sent[0].body)).not.toContain("secret");
  });
});
