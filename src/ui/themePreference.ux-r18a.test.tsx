// @vitest-environment happy-dom
// UX-R18a — the dark-mode toggle and the colour resolver charts read tokens through (docs/enterprise-ux-r0-redesign-foundation.md
// R18a). Owner decisions (2026-10-23): one button between the dark and the normal mode, a moon / sun icon in the top bar, the
// normal mode by default, dark pages shown to users only once everything is finished. These tests pin: light is the default and
// clears the key; dark is stored and mirrored on <html data-theme>; a broken storage keeps the choice for the page; another tab's
// choice is followed; nothing happens at start-up until dark mode is released; the toggle is one named button with aria-pressed;
// neither shell renders it before release, both top bars do after; and a light-dark() token resolves to the half the element's
// color-scheme shows.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import { THEME_KEY, DARK_MODE_RELEASED, getThemeChoice, setThemeChoice, initThemePreference, applyThemeChoice } from "./themePreference";
import ThemeSwitch from "./ThemeSwitch";
import { resolveThemeColor, isDarkScheme } from "./themeColor";
import { tokenColor } from "../projects/chartPalette";
import { readChartTokens } from "../charts/chartTheme";

const html = () => document.documentElement;
beforeEach(() => { localStorage.clear(); setThemeChoice("light"); html().removeAttribute("data-theme"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("UX-R18a — the stored choice", () => {
  it("is light by default; dark is stored and mirrored on <html data-theme>; light clears the key", () => {
    expect(getThemeChoice()).toBe("light");
    setThemeChoice("dark");
    expect([localStorage.getItem(THEME_KEY), html().getAttribute("data-theme"), getThemeChoice()]).toEqual(["dark", "dark", "dark"]);
    setThemeChoice("light");
    expect([localStorage.getItem(THEME_KEY), html().getAttribute("data-theme"), getThemeChoice()]).toEqual([null, "light", "light"]);
  });

  it("anything else in storage reads as light", () => {
    for (const v of ["system", "sepia", "DARK"]) { localStorage.setItem(THEME_KEY, v); expect(getThemeChoice(), v).toBe("light"); }
  });

  it("when storage throws, the choice still applies to the current page", () => {
    // the storage object itself (happy-dom's localStorage does not route through Storage.prototype)
    const store = window.localStorage;
    const setItem = vi.spyOn(store, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const getItem = vi.spyOn(store, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    setThemeChoice("dark");
    expect(() => store.getItem(THEME_KEY)).toThrow("blocked");
    expect([getThemeChoice(), html().getAttribute("data-theme")]).toEqual(["dark", "dark"]);
    expect([setItem.mock.calls.length, getItem.mock.calls.length > 1]).toEqual([1, true]);
    setItem.mockRestore(); getItem.mockRestore();                        // restoreAllMocks does not reach happy-dom's storage object
  });

  it("follows a choice made in another tab", () => {
    render(<ThemeSwitch />);
    localStorage.setItem(THEME_KEY, "dark");
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: THEME_KEY })); });
    expect(html().getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "الوضع الداكن" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("released (UX-R18c2): start-up applies the stored choice; with the flag off it stays inert", () => {
    expect(DARK_MODE_RELEASED).toBe(true);
    localStorage.setItem(THEME_KEY, "dark");
    initThemePreference(false);
    expect(html().hasAttribute("data-theme")).toBe(false);
    initThemePreference();
    expect(html().getAttribute("data-theme")).toBe("dark");
    localStorage.removeItem(THEME_KEY); applyThemeChoice();
    expect(html().getAttribute("data-theme")).toBe("light");
  });
});

describe("UX-R18a — the toggle", () => {
  it("is one button «الوضع الداكن», not pressed, showing the moon", () => {
    render(<ThemeSwitch />);
    const button = screen.getByRole("button", { name: "الوضع الداكن" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(button.querySelector("svg path")?.getAttribute("d")).toMatch(/^M16\.5 12\.2/);   // the moon
  });

  it("a click turns dark mode on (stored, the page dark, pressed, the sun); a second click returns to the normal mode", () => {
    render(<ThemeSwitch />);
    const button = screen.getByRole("button", { name: "الوضع الداكن" });
    fireEvent.click(button);
    expect([localStorage.getItem(THEME_KEY), html().getAttribute("data-theme"), button.getAttribute("aria-pressed")]).toEqual(["dark", "dark", "true"]);
    expect(button.querySelector("svg circle")).not.toBeNull();                                // the sun
    fireEvent.click(button);
    expect([localStorage.getItem(THEME_KEY), html().getAttribute("data-theme"), button.getAttribute("aria-pressed")]).toEqual([null, "light", "false"]);
  });
});

describe("UX-R18a / R18c2 — the top bars render the toggle once dark mode is released (released in R18c2)", () => {
  async function shells() {
    const { default: TeacherAppShell } = await import("../shell/TeacherAppShell");
    const { default: StudentShell } = await import("../shell/StudentShell");
    const nav = { teacherView: "platform", workspaceTab: "dashboard", projectCode: "", projectList: [] } as never;
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => true })) as never;
    const { container } = render(<TeacherAppShell nav={nav} projectReadyTotal={0} displayName="المعلم" onNavigate={() => {}} onLogout={() => {}}><p>x</p></TeacherAppShell>);
    const teacher = container.querySelectorAll("header .eb-topbar-actions .eb-theme-toggle").length + container.querySelectorAll("aside .eb-theme-toggle").length * 10;
    cleanup();
    const s = render(<StudentShell studentName="أحمد" onLogout={() => {}}><p>x</p></StudentShell>);
    const student = s.container.querySelectorAll("header.student-topbar .eb-theme-toggle").length;
    return { teacher, student };
  }

  it("released: both top bars (never the sidebar)", async () => {
    expect(await shells()).toEqual({ teacher: 1, student: 1 });
  });

  it("the flag still gates it: off, neither top bar renders the toggle", async () => {
    vi.resetModules();
    vi.doMock("./themePreference", async orig => ({ ...(await orig<typeof import("./themePreference")>()), DARK_MODE_RELEASED: false }));
    expect(await shells()).toEqual({ teacher: 0, student: 0 });
    vi.doUnmock("./themePreference"); vi.resetModules();
  });
});

describe("UX-R18a — charts read a light-dark() token as the half the element shows", () => {
  const scheme = (s: string, props: Record<string, string> = {}) =>
    vi.spyOn(window, "getComputedStyle").mockImplementation(() => ({ colorScheme: s, getPropertyValue: (n: string) => props[n] ?? "" }) as unknown as CSSStyleDeclaration);

  it("picks the light half in light, the dark half in dark; commas inside rgba() stay; other values are unchanged", () => {
    scheme("light");
    expect(resolveThemeColor("light-dark(#2a0a4e, #b59cee)")).toBe("#2a0a4e");
    expect(resolveThemeColor("light-dark(rgba(28, 19, 48, 0.45), rgba(0, 0, 0, 0.6))")).toBe("rgba(28, 19, 48, 0.45)");
    expect(resolveThemeColor("#16a34a")).toBe("#16a34a");
    vi.restoreAllMocks(); scheme("dark");
    expect(isDarkScheme()).toBe(true);
    expect(resolveThemeColor("light-dark(#2a0a4e, #b59cee)")).toBe("#b59cee");
    expect(resolveThemeColor("light-dark(rgba(28, 19, 48, 0.45), rgba(0, 0, 0, 0.6))")).toBe("rgba(0, 0, 0, 0.6)");
  });

  it("the project palette and the chart theme resolve tokens through it", () => {
    scheme("light", { "--eb-primary": "light-dark(#2a0a4e, #b59cee)", "--eb-text": "light-dark(#2d2740, #dcd7e8)" });
    expect(tokenColor("--eb-primary")).toBe("#2a0a4e");
    expect(readChartTokens(document.body).text).toBe("#2d2740");
    vi.restoreAllMocks(); scheme("dark", { "--eb-primary": "light-dark(#2a0a4e, #b59cee)", "--eb-text": "light-dark(#2d2740, #dcd7e8)" });
    expect(tokenColor("--eb-primary")).toBe("#b59cee");
    expect(readChartTokens(document.body).text).toBe("#dcd7e8");
  });
});
