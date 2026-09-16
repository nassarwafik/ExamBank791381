// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import TeacherAppShell from "./TeacherAppShell";
import type { TeacherNavState } from "./teacherNav";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1F2FF}▸▾]/u;
const NAV = ["لوحة المتابعة", "الصفوف والطلاب", "الواجبات", "المشاريع", "التقارير", "باني الامتحان", "استيراد من ملف", "سجل النشاط"];
const state = (over: Partial<TeacherNavState> = {}): TeacherNavState => ({ teacherView: "platform", workspaceTab: "dashboard", projectCode: "", projectList: [{ projectCode: "899373", title: "مشروع 899373" }], ...over });

function mount(over: Partial<TeacherNavState> = {}, extra: { ready?: number } = {}) {
  const onNavigate = vi.fn<(id: string) => void>();
  const onLogout = vi.fn<() => void>();
  const utils = render(
    <TeacherAppShell nav={state(over)} projectReadyTotal={extra.ready ?? 0} displayName="المعلم" onNavigate={onNavigate as never} onLogout={onLogout}>
      <p>محتوى الصفحة</p>
    </TeacherAppShell>
  );
  return { ...utils, onNavigate, onLogout };
}
const sidebar = () => screen.getByRole("complementary", { name: "التنقل الرئيسي" });
const navButtons = () => Array.from(sidebar().querySelectorAll<HTMLButtonElement>("button.eb-nav-link"));

// matchMedia stub: `desktop` decides whether "(min-width: 1024px)" matches; `listeners` lets a test fire a change.
function stubMatchMedia(desktop: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  window.matchMedia = ((q: string) => ({
    matches: q.includes("1024") ? desktop : false, media: q,
    addEventListener: (_t: string, l: (e: { matches: boolean }) => void) => { listeners.push(l); },
    removeEventListener: (_t: string, l: (e: { matches: boolean }) => void) => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); },
    onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true
  })) as unknown as typeof window.matchMedia;
  return listeners;
}

beforeEach(() => { stubMatchMedia(false); document.body.style.overflow = ""; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("UX-2 TeacherAppShell — navigation", () => {
  it("renders every destination as a named button, in expanded and compact modes alike, with no emoji anywhere in the shell", () => {
    mount();
    for (const label of NAV) expect(within(sidebar()).getByRole("button", { name: label })).toBeTruthy();
    expect(within(sidebar()).getByRole("button", { name: "تسجيل الخروج" }).className).toContain("app-sidebar-logout");
    // compact rail (manual toggle): labels stay in the accessibility tree — same names resolve
    fireEvent.click(screen.getByRole("button", { name: "طيّ القائمة" }));
    expect(document.querySelector(".eb-shell")?.className).toContain("is-compact");
    for (const label of NAV) expect(within(sidebar()).getByRole("button", { name: label })).toBeTruthy();
    expect(screen.getByRole("button", { name: "توسيع القائمة" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".eb-nav-label")?.textContent).toBe("لوحة المتابعة"); // text present, not display:none
    expect(EMOJI.test(sidebar().textContent || "")).toBe(false);
    expect(sidebar().querySelectorAll("svg").length).toBeGreaterThanOrEqual(NAV.length);
  });
  it("marks exactly one destination as current (aria-current=page) and it follows the existing state", () => {
    const { rerender, onNavigate, onLogout } = mount();
    const current = () => navButtons().filter(b => b.getAttribute("aria-current") === "page").map(b => b.textContent?.trim());
    expect(current()).toEqual(["لوحة المتابعة"]);
    rerender(<TeacherAppShell nav={state({ teacherView: "platform", workspaceTab: "audit" })} projectReadyTotal={0} displayName="المعلم" onNavigate={onNavigate as never} onLogout={onLogout}><p>x</p></TeacherAppShell>);
    expect(current()).toEqual(["سجل النشاط"]);
    rerender(<TeacherAppShell nav={state({ teacherView: "import" })} projectReadyTotal={0} displayName="المعلم" onNavigate={onNavigate as never} onLogout={onLogout}><p>x</p></TeacherAppShell>);
    expect(current()).toEqual(["استيراد من ملف"]);
    expect(navButtons().filter(b => b.classList.contains("is-active")).length).toBe(1);
  });
  it("clicking a destination asks App to navigate by id (no state of its own); logout calls onLogout", () => {
    const { onNavigate, onLogout } = mount();
    fireEvent.click(within(sidebar()).getByRole("button", { name: "الواجبات" }));
    fireEvent.click(within(sidebar()).getByRole("button", { name: "استيراد من ملف" }));
    fireEvent.click(within(sidebar()).getByRole("button", { name: "سجل النشاط" }));
    expect(onNavigate.mock.calls.map(c => c[0])).toEqual(["assignments", "import", "audit"]);
    fireEvent.click(within(sidebar()).getByRole("button", { name: "تسجيل الخروج" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
  it("project ready-for-review badge comes from the provided count and is part of the accessible name", () => {
    mount({}, { ready: 3 });
    const projects = within(sidebar()).getByRole("button", { name: /المشاريع/ });
    expect(projects.querySelector(".eb-nav-badge")?.textContent).toContain("3");
    expect(projects.getAttribute("aria-label")).toBeNull();
    expect(projects.textContent).toMatch(/3\s*مراحل بانتظار الفحص/);
    cleanup();
    mount({}, { ready: 0 });
    expect(document.querySelector(".eb-nav-badge")).toBeNull();
  });
  it("page header: one h1 from the state, breadcrumb for an open project leads back to the hub", () => {
    const { onNavigate } = mount({ teacherView: "project", projectCode: "899373" });
    expect(screen.getAllByRole("heading", { level: 1 }).map(h => h.textContent)).toEqual(["مشروع 899373"]);
    fireEvent.click(screen.getByRole("navigation", { name: "مسار الصفحة" }).querySelector("button")!);
    expect(onNavigate).toHaveBeenCalledWith("projects");
  });
  it("skip link targets the main landmark", () => {
    mount();
    const skip = screen.getByText("تجاوز إلى المحتوى") as HTMLAnchorElement;
    expect(skip.getAttribute("href")).toBe("#eb-main");
    expect(screen.getByRole("main").id).toBe("eb-main");
  });
});

describe("UX-2 TeacherAppShell — drawer (below the shell breakpoint)", () => {
  it("opens as a modal dialog, moves focus inside, traps Tab, Escape closes and restores focus to the opener", () => {
    mount();
    const opener = screen.getByRole("button", { name: "القائمة" });
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    expect(opener.getAttribute("aria-controls")).toBe("eb-sidebar");
    opener.focus();
    fireEvent.click(opener);
    expect(opener.getAttribute("aria-expanded")).toBe("true");
    const dialog = screen.getByRole("dialog", { name: "التنقل الرئيسي" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    // focus entered the drawer (its first focusable control: the close button)
    expect(dialog.contains(document.activeElement)).toBe(true);
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>("button"));
    const last = focusables[focusables.length - 1];
    // Tab from the last control wraps to the first; Shift+Tab from the first wraps to the last
    last.focus(); fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(focusables[0]);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);
  });
  it("choosing a destination navigates and closes the drawer; the backdrop and the close button also close it", () => {
    const { onNavigate } = mount();
    fireEvent.click(screen.getByRole("button", { name: "القائمة" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "التقارير" }));
    expect(onNavigate).toHaveBeenCalledWith("reports");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "القائمة" }));
    fireEvent.click(document.querySelector(".eb-drawer-backdrop")!);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "القائمة" }));
    fireEvent.click(screen.getByRole("button", { name: "إغلاق القائمة" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("closes itself when the viewport grows to desktop (the sidebar becomes the fixed rail again)", () => {
    const listeners = stubMatchMedia(false);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "القائمة" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    act(() => { for (const l of listeners) l({ matches: true }); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
