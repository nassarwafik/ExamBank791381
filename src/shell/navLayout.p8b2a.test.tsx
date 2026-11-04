// @vitest-environment happy-dom
// Tadris+ P8-B2a — the teacher's own order of the sidebar and the phone's bottom bar (owner decision §19.31), test data only:
//   the order / hidden list arrive with the app's own profile read (no extra request) and re-order the sidebar within its sections;
//   «لوحة المتابعة» always stays first and shown; a hidden destination still opens from the quick search;
//   the bottom bar: «لوحة المتابعة» and the teacher's first shown destinations they may open (4 in all), then «المزيد» = the menu;
//   «ترتيب القائمة» in the profile: offered with `layoutChoosable` only; moving / hiding, saving and «استعادة» send setNavLayout.
// Presentation only: nothing here grants or withdraws a permission. A feature (no fail-first).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act, waitFor } from "@testing-library/react";
import TeacherAppShell from "./TeacherAppShell";
import NavOrderSettings from "../teacher/NavOrderSettings";
import { TeacherAccessContext } from "./teacherAccessContext";
import { ARRANGEABLE_NAV, BOTTOM_BAR_SIZE, arrangeSections, bottomBarItems, noteTeacherNavLayout, orderedNav, parseNavLayout, resetKnownNavLayout } from "./navLayout";
import { PRIMARY_NAV, type TeacherNavState } from "./teacherNav";
import type { TeacherAccessView } from "./teacherAccess";
import { teacherProfileApi } from "../teacher/teacherProfile";

const state = (over: Partial<TeacherNavState> = {}): TeacherNavState => ({ teacherView: "platform", workspaceTab: "dashboard", projectCode: "", projectList: [], ...over });
function mount(access: TeacherAccessView | null = null) {
  const onNavigate = vi.fn();
  render(<TeacherAppShell nav={state()} projectReadyTotal={0} displayName="المعلم" onNavigate={onNavigate as never} onLogout={vi.fn()} access={access}><p>محتوى الصفحة</p></TeacherAppShell>);
  return { onNavigate };
}
const sideLabels = () => Array.from(screen.getByRole("navigation", { name: "الأقسام" }).querySelectorAll<HTMLButtonElement>("button.eb-nav-link")).map(b => b.textContent || "");
const bar = () => screen.getByRole("navigation", { name: "التنقل السريع" });
const barLabels = () => within(bar()).getAllByRole("button").map(b => b.textContent || "");
const enforced = (capabilities: string[]): TeacherAccessView => ({ status: "ok", enforced: true, capabilities });

beforeEach(() => {
  resetKnownNavLayout();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); resetKnownNavLayout(); });

describe("P8-B2a — the pure rules", () => {
  it("the arrangeable destinations are the main ones without «لوحة المتابعة»", () => {
    expect(ARRANGEABLE_NAV).toEqual(PRIMARY_NAV.filter(id => id !== "dashboard"));
  });
  it("parseNavLayout keeps known, unrepeated ids only; nothing left → null (the default order)", () => {
    expect(parseNavLayout({ order: ["games", "games", "builder", "dashboard", 7], hidden: ["reports"] })).toEqual({ order: ["games"], hidden: ["reports"] });
    for (const v of [null, undefined, [], "x", { order: [], hidden: [] }, { order: ["dashboard"] }]) expect(parseNavLayout(v)).toBeNull();
  });
  it("orderedNav: the named ids first in their order, the rest in the default order", () => {
    expect(orderedNav(["learning", "students", "assignments", "messages"], { order: ["messages", "students"], hidden: [] })).toEqual(["messages", "students", "learning", "assignments"]);
    expect(orderedNav(["learning", "students"], null)).toEqual(["learning", "students"]);
  });
  it("arrangeSections keeps each destination in its section and drops the hidden ones (never «لوحة المتابعة»)", () => {
    const s = arrangeSections({ order: ["games", "messages"], hidden: ["learning", "reports"] });
    expect(s.map(x => x.items)).toEqual([["dashboard", "messages", "students", "assignments"], ["games", "projects"]]);
  });
  it("bottomBarItems: «لوحة المتابعة» first, then the first shown destinations the teacher may open", () => {
    expect(bottomBarItems(null, null)).toEqual(["dashboard", "learning", "students", "assignments"]);
    expect(bottomBarItems({ order: ["games", "messages"], hidden: ["learning"] }, null)).toEqual(["dashboard", "games", "messages", "students"]);
    expect(bottomBarItems(null, enforced(["classes.class.view", "learning.course.view", "reports.widget.view"]))).toEqual(["dashboard", "learning", "reports"]);
    expect(bottomBarItems(null, null).length).toBe(BOTTOM_BAR_SIZE);
  });
});

describe("P8-B2a — the shell follows the teacher's order", () => {
  it("no order known: the sidebar as before; the bottom bar has the first destinations and «المزيد»", () => {
    mount();
    expect(sideLabels().slice(0, 8)).toEqual(["لوحة المتابعة", "المواد التعليمية", "الصفوف والطلاب", "الواجبات", "الرسائل", "المشاريع", "التقارير", "الألعاب التعليمية"]);
    expect(barLabels()).toEqual(["المتابعة", "المواد", "الطلاب", "الواجبات", "المزيد"]);
  });
  it("the profile answer's order re-arranges the sidebar and the bar at once; a hidden destination still opens from the quick search", async () => {
    const { onNavigate } = mount();
    act(() => noteTeacherNavLayout({ navLayout: { order: ["messages", "assignments"], hidden: ["learning"] }, layoutChoosable: true }));
    expect(sideLabels().slice(0, 7)).toEqual(["لوحة المتابعة", "الرسائل", "الواجبات", "الصفوف والطلاب", "المشاريع", "التقارير", "الألعاب التعليمية"]);
    expect(sideLabels()).not.toContain("المواد التعليمية");
    expect(barLabels()).toEqual(["المتابعة", "الرسائل", "الواجبات", "الطلاب", "المزيد"]);
    fireEvent.click(within(bar()).getByRole("button", { name: "الرسائل" }));
    expect(onNavigate).toHaveBeenLastCalledWith("messages");
    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "المواد" } });
    fireEvent.click(await screen.findByRole("option", { name: /المواد التعليمية/ }));
    expect(onNavigate).toHaveBeenLastCalledWith("learning");
  });
  it("the order comes with the app's own profile read (teacherProfileApi.load), with no request of the shell's own", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, profile: { teacherId: "t1", displayName: "سارة" }, navLayout: { order: ["games"], hidden: [] }, layoutChoosable: true }) }) as Response) as unknown as typeof fetch;
    mount();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await act(async () => { await teacherProfileApi.load("t"); });
    expect(sideLabels().slice(5, 8)).toEqual(["الألعاب التعليمية", "المشاريع", "التقارير"]);   // first of its own section
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
  it("the bar follows the access, and an unavailable access offers no bar", () => {
    mount(enforced(["classes.class.view", "students.student.view"]));
    expect(barLabels()).toEqual(["المتابعة", "الطلاب", "المزيد"]);
    cleanup();
    mount({ status: "unavailable", enforced: true, capabilities: [] });
    expect(screen.queryByRole("navigation", { name: "التنقل السريع" })).toBeNull();
  });
  it("«المزيد» opens the menu; dismissing it returns focus to «المزيد»", async () => {
    mount();
    const more = within(bar()).getByRole("button", { name: "المزيد" });
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "إغلاق القائمة" }));
    await waitFor(() => expect(document.activeElement).toBe(more));
  });
});

describe("P8-B2a — «ترتيب القائمة» in the profile", () => {
  let posts: Record<string, unknown>[] = [];
  beforeEach(() => {
    posts = [];
    globalThis.fetch = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)); posts.push(body);
      const layout = body.layout as { order: string[]; hidden: string[] };
      return { ok: true, status: 200, json: async () => ({ ok: true, navLayout: layout.order.length || layout.hidden.length ? layout : null }) } as Response;
    }) as unknown as typeof fetch;
  });
  const settings = (access: TeacherAccessView | null = null) => render(<TeacherAccessContext.Provider value={access}><NavOrderSettings token="t" /></TeacherAccessContext.Provider>);
  const rows = () => within(screen.getByRole("list", { name: "أقسام القائمة بالترتيب" })).getAllByRole("listitem").map(li => li.textContent?.replace(/[▲▼]/g, "") || "");
  it("not offered without `layoutChoosable`", () => {
    act(() => noteTeacherNavLayout({ navLayout: null, layoutChoosable: false }));
    settings();
    expect(screen.queryByRole("group", { name: "ترتيب القائمة" })).toBeNull();
  });
  it("moving and hiding, then saving: one setNavLayout with the whole order and the hidden list; the shell's order follows", async () => {
    act(() => noteTeacherNavLayout({ navLayout: null, layoutChoosable: true }));
    settings();
    expect(rows()).toEqual(["المواد التعليمية", "الصفوف والطلاب", "الواجبات", "الرسائل", "المشاريع", "التقارير", "الألعاب التعليمية"]);
    expect(screen.getByRole("button", { name: "تحريك «المواد التعليمية» للأعلى" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "تحريك «الرسائل» للأعلى" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "الألعاب التعليمية" }));
    expect(rows().slice(0, 4)).toEqual(["المواد التعليمية", "الصفوف والطلاب", "الرسائل", "الواجبات"]);
    fireEvent.click(screen.getByRole("button", { name: "حفظ الترتيب" }));
    await screen.findByText("تم حفظ ترتيب القائمة.");
    expect(posts).toEqual([{ action: "setNavLayout", layout: { order: ["learning", "students", "messages", "assignments", "projects", "reports", "games"], hidden: ["games"] } }]);
    expect(arrangeSections(parseNavLayout(posts[0].layout)).flatMap(s => s.items)).not.toContain("games");
  });
  it("«استعادة الترتيب الافتراضي» sends the empty order", async () => {
    act(() => noteTeacherNavLayout({ navLayout: { order: ["games"], hidden: [] }, layoutChoosable: true }));
    settings();
    expect(rows()[0]).toBe("الألعاب التعليمية");
    fireEvent.click(screen.getByRole("button", { name: "استعادة الترتيب الافتراضي" }));
    await screen.findByText("عادت القائمة إلى ترتيبها الافتراضي.");
    expect(posts).toEqual([{ action: "setNavLayout", layout: { order: [], hidden: [] } }]);
  });
  it("only the destinations the teacher may open are listed; moving skips the others", () => {
    act(() => noteTeacherNavLayout({ navLayout: null, layoutChoosable: true }));
    settings(enforced(["classes.class.view", "learning.course.view", "messages.inbox.read"]));
    expect(rows()).toEqual(["المواد التعليمية", "الرسائل"]);
    fireEvent.click(screen.getByRole("button", { name: "تحريك «الرسائل» للأعلى" }));
    expect(rows()).toEqual(["الرسائل", "المواد التعليمية"]);
  });
  it("a refusal shows the server's message and keeps the draft", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ ok: false, error: "ترتيب القائمة غير مفعّل لحسابك." }) }) as Response) as unknown as typeof fetch;
    act(() => noteTeacherNavLayout({ navLayout: null, layoutChoosable: true }));
    settings();
    fireEvent.click(screen.getByRole("button", { name: "تحريك «الرسائل» للأعلى" }));
    fireEvent.click(screen.getByRole("button", { name: "حفظ الترتيب" }));
    expect((await screen.findByRole("alert")).textContent).toBe("ترتيب القائمة غير مفعّل لحسابك.");
    expect(rows()[2]).toBe("الرسائل");
  });
});
