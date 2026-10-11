// @vitest-environment happy-dom
// Phase 21E.1 (slice 2) — audit finding F16: dismissing the phone menu (Escape, the backdrop, «إغلاق القائمة») returns keyboard focus
// to the «القائمة» button even when the tap that opened it never focused that button (WebKit / a scripted click). Before, the focus
// trap restored whatever was focused when the drawer OPENED — <body> — and the teacher's place was lost. Fail-first: on main b8a65f1
// every case below ends on <body>.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import TeacherAppShell from "./TeacherAppShell";
import type { TeacherNavState } from "./teacherNav";

const nav: TeacherNavState = { teacherView: "platform", workspaceTab: "dashboard", projectCode: "", projectList: [] } as TeacherNavState;
let listeners: Array<(e: { matches: boolean }) => void> = [];
beforeEach(() => {
  listeners = [];
  window.matchMedia = ((q: string) => ({
    matches: false, media: q,
    addEventListener: (_t: string, l: (e: { matches: boolean }) => void) => { listeners.push(l); },
    removeEventListener: (_t: string, l: (e: { matches: boolean }) => void) => { listeners = listeners.filter(x => x !== l); },
    onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount() {
  const onNavigate = vi.fn();
  render(<TeacherAppShell nav={nav} projectReadyTotal={0} displayName="المعلم" onNavigate={onNavigate as never} onLogout={() => {}}><p>محتوى الصفحة</p></TeacherAppShell>);
  return { onNavigate };
}
const menu = () => screen.getByRole("button", { name: "القائمة" });
/** Opens the drawer the way a touch tap on WebKit does: the button is activated but never focused (focus stays on <body>). */
const tapOpen = () => {
  (document.activeElement as HTMLElement | null)?.blur?.();
  expect(document.activeElement).toBe(document.body);
  act(() => { menu().click(); });
  expect(screen.getByRole("dialog", { name: "التنقل الرئيسي" })).toBeTruthy();
};

describe("21E.1 slice 2 — F16: closing the phone menu returns focus to «القائمة»", () => {
  it("Escape", () => {
    mount(); tapOpen();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(menu());
  });
  it("the backdrop", () => {
    mount(); tapOpen();
    fireEvent.click(document.querySelector(".eb-drawer-backdrop")!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(menu());
  });
  it("«إغلاق القائمة»", () => {
    mount(); tapOpen();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "إغلاق القائمة" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(menu());
  });
  it("unchanged: choosing a destination navigates (focus is the new page's), and growing to desktop never pulls focus to the hidden button", () => {
    const { onNavigate } = mount(); tapOpen();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "التقارير" }));
    expect(onNavigate).toHaveBeenCalledWith("reports");
    expect(document.activeElement).not.toBe(menu());
    tapOpen();
    act(() => { for (const l of listeners) l({ matches: true }); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).not.toBe(menu());
  });
});
