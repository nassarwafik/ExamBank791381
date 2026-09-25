// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { installPullToRefreshGuard, PULL_TO_REFRESH_GUARD } from "./pullToRefreshGuard";

// Mobile session-safety hotfix — the native pull-to-refresh gesture is disabled through the browser's own control
// (`overscroll-behavior-y` on the root scroller). A DOM emulator cannot perform Android's native gesture, so these tests
// verify the CONTROL we rely on: that production installs it on <html>/<body>, that the stylesheet carries it too, and
// that nothing that would disable scrolling (overflow, touch-action, touch listeners) is introduced.

const root = () => document.documentElement;
const overscroll = (el: HTMLElement) => el.style.getPropertyValue("overscroll-behavior-y");
function resetInline() {
  root().removeAttribute("style");
  document.body.removeAttribute("style");
}
beforeEach(resetInline);
afterEach(() => { resetInline(); vi.restoreAllMocks(); vi.resetModules(); vi.doUnmock("react-dom/client"); vi.doUnmock("./registerServiceWorker"); vi.doUnmock("./installPrompt"); });

describe("installPullToRefreshGuard", () => {
  it("sets overscroll-behavior-y: none on <html> and <body>", () => {
    expect(PULL_TO_REFRESH_GUARD).toBe("none");
    installPullToRefreshGuard(document);
    expect(overscroll(root())).toBe("none");
    expect(overscroll(document.body)).toBe("none");
  });

  it("is idempotent: calling it again changes nothing", () => {
    installPullToRefreshGuard(document);
    const once = [root().getAttribute("style"), document.body.getAttribute("style")];
    installPullToRefreshGuard(document);
    installPullToRefreshGuard();
    expect([root().getAttribute("style"), document.body.getAttribute("style")]).toEqual(once);
  });

  it("never touches overflow / touch-action and keeps existing inline styles (scrolling stays enabled)", () => {
    document.body.style.setProperty("color", "red");
    installPullToRefreshGuard(document);
    for (const el of [root(), document.body]) {
      for (const prop of ["overflow", "overflow-y", "overflow-x", "touch-action", "overscroll-behavior-x", "position", "height"]) {
        expect(el.style.getPropertyValue(prop), prop).toBe("");
      }
    }
    expect(document.body.style.getPropertyValue("color")).toBe("red");
  });

  it("registers no event listener at all (no touch is ever prevented)", () => {
    const spies = [vi.spyOn(window, "addEventListener"), vi.spyOn(document, "addEventListener"), vi.spyOn(root(), "addEventListener"), vi.spyOn(document.body, "addEventListener")];
    installPullToRefreshGuard(document);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it("is a safe no-op without a document", () => {
    expect(() => installPullToRefreshGuard(undefined)).not.toThrow();
  });
});

describe("production wiring", () => {
  it("the real entry point (src/main.tsx) installs the guard at startup — before/independent of the app render", async () => {
    const render = vi.fn();
    vi.doMock("react-dom/client", () => ({ createRoot: vi.fn(() => ({ render })) }));
    vi.doMock("./registerServiceWorker", () => ({ registerServiceWorker: vi.fn() }));
    vi.doMock("./installPrompt", () => ({ initInstallPrompt: vi.fn() }));
    document.body.innerHTML = '<div id="root"></div>';
    expect(overscroll(root())).toBe("");
    await import("../main.tsx");
    expect(overscroll(root())).toBe("none");
    expect(overscroll(document.body)).toBe("none");
    expect(render).toHaveBeenCalledTimes(1);                                   // the app itself still mounts normally
  });

  it("the global stylesheet carries the same rule for html + body (applies before any script runs)", () => {
    const css = readFileSync(resolve(__dirname, "../index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/html,\s*body\s*\{\s*overscroll-behavior-y:\s*none;\s*\}/);
  });

  it("no global root rule disables scrolling (overflow hidden / touch-action none on html, body or #root)", () => {
    for (const file of ["../index.css", "../App.css"]) {
      const css = readFileSync(resolve(__dirname, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      const rootRules = css.match(/(^|\})\s*((?:html|body|#root|:root)(?:\s*,\s*(?:html|body|#root|:root))*)\s*\{[^}]*\}/g) || [];
      for (const rule of rootRules) {
        expect(rule, file).not.toMatch(/overflow(-y)?\s*:\s*hidden/);
        expect(rule, file).not.toMatch(/touch-action\s*:\s*none/);
      }
    }
  });
});
