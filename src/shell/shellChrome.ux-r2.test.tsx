// @vitest-environment happy-dom
/// <reference types="node" />
// Phase UX-R2 — the redesign's light chrome (docs/enterprise-ux-r0-redesign-foundation.md §3.2, R2): a full-width top bar
// above a white sidebar. These guards pin what the move must keep true:
//  · ONE banner landmark (the top bar) holding the brand (an LTR island), the home pill under a name of its own (never a
//    second «لوحة المتابعة»), the quick navigation and the identity — and no <h1>, <main> or <nav> of its own;
//  · the sidebar is light chrome: no dark-surface class, no inverse controls, no dark --eb-nav-* token read by the shell;
//  · geometry: the bar is sticky at the top on the shell's nav layer; the sidebar sticks BELOW it and fills the rest;
//  · contrast of the chrome pairs, visible focus rings on white, and the phone bar (pill hidden, brand name off-screen only).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import TeacherAppShell from "./TeacherAppShell";
import type { TeacherNavState } from "./teacherNav";

const SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const flat = (s: string) => s.replace(/\s+/g, " ");
const state = (over: Partial<TeacherNavState> = {}): TeacherNavState => ({ teacherView: "platform", workspaceTab: "students", projectCode: "", projectList: [], ...over });

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function mount(over: Partial<TeacherNavState> = {}) {
  const onNavigate = vi.fn<(id: string) => void>();
  render(<TeacherAppShell nav={state(over)} projectReadyTotal={0} displayName="المعلم" onNavigate={onNavigate as never} onLogout={() => {}}><p>محتوى</p></TeacherAppShell>);
  return { onNavigate, bar: screen.getByRole("banner"), side: screen.getByRole("complementary", { name: "التنقل الرئيسي" }) };
}

describe("UX-R2 — the top bar is the page's one banner", () => {
  it("exactly one banner, holding the brand (LTR island), the home pill, the quick navigation and the signed-in teacher", () => {
    const { bar } = mount();
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(bar.querySelector(".eb-brand-text bdi")?.getAttribute("dir")).toBe("ltr");
    expect(within(bar).getByRole("button", { name: "الرئيسية" })).toBeTruthy();
    expect(within(bar).getByRole("combobox", { name: "انتقل إلى صفحة" })).toBeTruthy();
    expect(bar.textContent).toContain("المعلم");
  });
  it("adds no heading, landmark or navigation of its own (the page keeps one <h1> and one <main>)", () => {
    const { bar } = mount();
    expect(bar.querySelector("h1, h2, main, nav, aside")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });
  it("the home pill never doubles the sidebar's «لوحة المتابعة» and never claims aria-current", () => {
    const { bar } = mount({ workspaceTab: "dashboard" });
    expect(within(bar).queryByRole("button", { name: "لوحة المتابعة" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^لوحة المتابعة/ })).toHaveLength(1);
    expect(bar.querySelectorAll("[aria-current]")).toHaveLength(0);
  });
  it("the home pill and a quick-navigation choice navigate through the shell's onNavigate", () => {
    const { bar, onNavigate } = mount();
    fireEvent.click(within(bar).getByRole("button", { name: "الرئيسية" }));
    const field = within(bar).getByRole("combobox", { name: "انتقل إلى صفحة" });
    fireEvent.change(field, { target: { value: "تقارير" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onNavigate.mock.calls.map(c => c[0])).toEqual(["dashboard", "reports"]);
  });
});

describe("UX-R2 — the sidebar is light chrome", () => {
  it("no dark-surface class and no inverse control anywhere in the shell chrome", () => {
    const { bar, side } = mount();
    expect(side.className).toBe("eb-sidebar");
    expect(bar.querySelector(".eb-on-dark")).toBeNull();
    expect(side.querySelector(".eb-on-dark")).toBeNull();
  });
  it("the drawer's own header row (title + «إغلاق القائمة») exists only while the drawer is open", () => {
    const { side } = mount();
    expect(side.querySelector(".eb-sidebar-top")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "القائمة" }));
    const dialog = screen.getByRole("dialog", { name: "التنقل الرئيسي" });
    expect(within(dialog).getByRole("button", { name: "إغلاق القائمة" })).toBeTruthy();
    expect(dialog.querySelector(".eb-sidebar-title bdi")?.getAttribute("dir")).toBe("ltr");
  });
  it("the shell stylesheets read no dark-surface --eb-nav-* colour token (they stay for toasts and dark bands)", () => {
    for (const file of ["shell.css", "shell/teacher-nav-21e.css"]) {
      expect(read(file).match(/var\(--eb-nav-(?:bg|text|text-muted|hover|border|accent)\b/g), file).toBeNull();
    }
  });
});

describe("UX-R2 — geometry and layers", () => {
  const shell = flat(read("shell.css"));
  const rule = (sel: string) => { const m = new RegExp("(?:^|\\})\\s*" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}").exec(shell); expect(m, sel).toBeTruthy(); return m![1]; };
  it("the top bar is sticky at the top on the nav layer and spans the grid's top row", () => {
    const top = rule(".eb-topbar");
    expect(top).toMatch(/position:\s*sticky/); expect(top).toMatch(/inset-block-start:\s*0/);
    expect(top).toMatch(/z-index:\s*var\(--eb-z-nav\)/); expect(top).toMatch(/grid-area:\s*top/);
    expect(rule(".eb-shell")).toMatch(/grid-template-areas:\s*"top top" "side main"/);
  });
  it("the sidebar sticks BELOW the top bar and fills the rest of the viewport", () => {
    const side = rule(".eb-sidebar");
    expect(side).toMatch(/inset-block-start:\s*var\(--eb-topbar-h\)/);
    expect(side).toMatch(/height:\s*calc\(100vh - var\(--eb-topbar-h\)\)/);
    expect(read("design-tokens.css")).toMatch(/--eb-topbar-h:\s*58px/);
  });
});

describe("UX-R2 — contrast, focus and the phone bar", () => {
  const tokens = read("design-tokens.css");
  const resolve = (name: string, depth = 0): string => {
    const m = new RegExp("--eb-" + name + ":\\s*([^;]+);").exec(tokens);
    if (!m) throw new Error("--eb-" + name + " undefined");
    const v = m[1].trim(); const ref = /^var\(--eb-([\w-]+)\)$/.exec(v);
    return ref && depth < 4 ? resolve(ref[1], depth + 1) : v.toLowerCase();
  };
  const lum = (h: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  it("chrome text ≥ 7:1 and secondary text ≥ AA on every chrome surface (bar, hover, active pill, search field)", () => {
    for (const bg of ["chrome-bg", "chrome-hover", "chrome-active", "chrome-field"]) {
      expect(ratio(resolve("chrome-text"), resolve(bg)), "chrome-text on " + bg).toBeGreaterThanOrEqual(7);
      expect(ratio(resolve("chrome-text-muted"), resolve(bg)), "chrome-text-muted on " + bg).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("focus rings on the white chrome are the primary (never the pale tints that only worked on the dark rail)", () => {
    const shell = flat(read("shell.css")), nav = flat(read("shell/teacher-nav-21e.css"));
    const rings = [...shell.matchAll(/\.eb-nav-link:focus-visible\s*\{([^}]*)\}/g)].map(m => m[1]);
    expect(rings.at(-1)).toMatch(/outline:\s*2px solid var\(--eb-primary\)/);
    for (const css of [shell, nav]) expect(css).not.toMatch(/:focus-visible\s*\{[^}]*outline:[^;}]*var\(--eb-(?:primary-100|surface)\)/);
    expect(shell).toMatch(/\.eb-quicknav-input:focus-visible\s*\{[^}]*outline:\s*var\(--eb-focus-ring\)/);
  });
  it("phones (≤ 639 px): the home pill hides, the brand name leaves the screen but stays in the accessibility tree", () => {
    const phone = /@media \(max-width: 639px\) \{(.*?)\}\s*\}/.exec(flat(read("shell.css")));
    expect(phone).toBeTruthy();
    expect(phone![1]).toMatch(/\.eb-topbar-pill \{ display: none; \}/);
    expect(phone![1]).toMatch(/\.eb-topbar \.eb-brand-text \{[^}]*clip-path: inset\(50%\)/);
    expect(phone![1]).not.toMatch(/\.eb-brand-text \{[^}]*display: none/);
  });
});
