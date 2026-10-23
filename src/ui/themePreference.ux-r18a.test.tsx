// @vitest-environment happy-dom
// UX-R18a — «المظهر», the device-level appearance choice, and the colour resolver charts read tokens through
// (docs/enterprise-ux-r0-redesign-foundation.md R18a). These tests pin: system is the default and clears the key; light / dark
// are stored and mirrored on <html data-theme>; a broken or full storage keeps the choice for the page; another tab's choice is
// followed; nothing happens at start-up until dark mode is released; the switch is the kit's radio group; neither shell renders
// it before release, both do after; and a light-dark() token resolves to the half the element's color-scheme shows.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import { THEME_KEY, DARK_MODE_RELEASED, getThemeChoice, setThemeChoice, initThemePreference, applyThemeChoice } from "./themePreference";
import ThemeSwitch from "./ThemeSwitch";
import { resolveThemeColor, isDarkScheme } from "./themeColor";
import { tokenColor } from "../projects/chartPalette";
import { readChartTokens } from "../charts/chartTheme";

const html = () => document.documentElement;
beforeEach(() => { localStorage.clear(); html().removeAttribute("data-theme"); setThemeChoice("system"); html().removeAttribute("data-theme"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("UX-R18a — the stored choice", () => {
  it("is system by default; light and dark are stored and mirrored on <html data-theme>; system clears the key", () => {
    expect(getThemeChoice()).toBe("system");
    setThemeChoice("dark");
    expect([localStorage.getItem(THEME_KEY), html().getAttribute("data-theme"), getThemeChoice()]).toEqual(["dark", "dark", "dark"]);
    setThemeChoice("light");
    expect([localStorage.getItem(THEME_KEY), html().getAttribute("data-theme")]).toEqual(["light", "light"]);
    setThemeChoice("system");
    expect([localStorage.getItem(THEME_KEY), html().getAttribute("data-theme"), getThemeChoice()]).toEqual([null, "system", "system"]);
  });

  it("anything else in storage reads as system", () => {
    localStorage.setItem(THEME_KEY, "sepia");
    expect(getThemeChoice()).toBe("system");
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
    expect(screen.getByRole("radio", { name: "داكن" }).getAttribute("aria-checked")).toBe("true");
  });

  it("start-up is inert until dark mode is released; released, it applies the stored choice", () => {
    expect(DARK_MODE_RELEASED).toBe(false);
    localStorage.setItem(THEME_KEY, "dark");
    initThemePreference();
    expect(html().hasAttribute("data-theme")).toBe(false);
    initThemePreference(true);
    expect(html().getAttribute("data-theme")).toBe("dark");
    localStorage.removeItem(THEME_KEY); applyThemeChoice();
    expect(html().getAttribute("data-theme")).toBe("system");
  });
});

describe("UX-R18a — the switch", () => {
  it("is a radio group «المظهر» of three options, system checked by default", () => {
    render(<ThemeSwitch />);
    const group = screen.getByRole("radiogroup", { name: "المظهر" });
    expect([...group.querySelectorAll("[role=radio]")].map(r => r.textContent)).toEqual(["تلقائي", "فاتح", "داكن"]);
    expect(screen.getByRole("radio", { name: "تلقائي" }).getAttribute("aria-checked")).toBe("true");
  });

  it("choosing «داكن» stores it and darkens the page; the arrow keys move and select", () => {
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole("radio", { name: "داكن" }));
    expect([localStorage.getItem(THEME_KEY), html().getAttribute("data-theme")]).toEqual(["dark", "dark"]);
    expect(screen.getByRole("radio", { name: "داكن" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(screen.getByRole("radio", { name: "داكن" }), { key: "Home" });
    expect(html().getAttribute("data-theme")).toBe("system");
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });
});

describe("UX-R18a — the shells render «المظهر» only once dark mode is released", () => {
  async function shells() {
    const { default: TeacherAppShell } = await import("../shell/TeacherAppShell");
    const { default: StudentShell } = await import("../shell/StudentShell");
    const nav = { teacherView: "platform", workspaceTab: "dashboard", projectCode: "", projectList: [] } as never;
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => true })) as never;
    render(<TeacherAppShell nav={nav} projectReadyTotal={0} displayName="المعلم" onNavigate={() => {}} onLogout={() => {}}><p>x</p></TeacherAppShell>);
    const teacher = screen.queryAllByRole("radiogroup", { name: "المظهر" }).length;
    cleanup();
    render(<StudentShell studentName="أحمد" onLogout={() => {}}><p>x</p></StudentShell>);
    const student = screen.queryAllByRole("radiogroup", { name: "المظهر" }).length;
    return { teacher, student };
  }

  it("not before release", async () => {
    expect(await shells()).toEqual({ teacher: 0, student: 0 });
  });

  it("both shells once released (the teacher's in the account group, before «تسجيل الخروج»)", async () => {
    vi.resetModules();
    vi.doMock("./themePreference", async orig => ({ ...(await orig<typeof import("./themePreference")>()), DARK_MODE_RELEASED: true }));
    expect(await shells()).toEqual({ teacher: 1, student: 1 });
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
