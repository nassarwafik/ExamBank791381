// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import StudentShell from "../shell/StudentShell";
import type { NotificationCenterProps } from "./NotificationBell";
import type { NotificationItem } from "../messages/messagesClient";

// Phase 6C — the «الإشعارات» bell + panel inside the real StudentShell (presentation, a11y, open/close behaviour).
// Data and navigation are the portal's (see notificationCenter.6c.test.tsx); here they are plain props.

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const DIRECT: NotificationItem = { id: "1800000000002-aaaaaaaaaaaaaaaa", type: "direct", senderDisplayName: "أ. أحمد", preview: "راجع الواجب الثاني قبل الأحد", createdAt: "2026-09-01T08:00:00.000Z", unread: true };
const ANN: NotificationItem = { id: "1800000000001-bbbbbbbbbbbbbbbb", type: "announcement", senderDisplayName: "أ. أحمد", preview: "لا توجد حصة غدًا", createdAt: "2026-08-30T08:00:00.000Z", unread: false };

function mount(over: Partial<NotificationCenterProps> = {}, unread?: { total: number; capped: boolean }, withBell = true) {
  const props: NotificationCenterProps = { items: [DIRECT, ANN], loading: false, error: "", onOpenChange: vi.fn(), onSelect: vi.fn(), onOpenMessages: vi.fn(), onRetry: vi.fn(), ...over };
  const view = render(
    <StudentShell studentName="أحمد" onLogout={() => {}} onOpenGames={() => {}} onOpenMessages={() => {}} messagesUnread={unread} notifications={withBell ? props : undefined}>
      <p>محتوى البوابة</p>
    </StudentShell>
  );
  return { ...view, props };
}
const bell = () => screen.getByRole("button", { name: /^الإشعارات/ });
const panel = () => document.getElementById(bell().getAttribute("aria-controls") || "")!;

describe("StudentShell — «الإشعارات» bell", () => {
  it("1. rendered (first in the bar, before «الرسائل») only when notification support is supplied", () => {
    const a = mount({}, { total: 0, capped: false }, false);
    expect(screen.queryByRole("button", { name: /^الإشعارات/ })).toBeNull();
    a.unmount();
    mount();
    const actions = Array.from(document.querySelectorAll(".student-topbar-actions > *")).map(el => el.textContent || "");
    expect(actions[0]).toContain("الإشعارات");
    expect(actions[1]).toContain("الرسائل");
    expect(actions.some(t => t.includes("الألعاب التعليمية"))).toBe(true);
    expect(actions[actions.length - 1]).toContain("تسجيل الخروج");
    expect(bell().tagName).toBe("BUTTON");
    expect(bell().querySelector("svg")).toBeTruthy();                        // project icon, not a raw emoji
  });

  it("2. zero unread → no badge at all (and a plain accessible name)", () => {
    mount({}, { total: 0, capped: false });
    expect(bell().querySelector(".eb-nav-badge")).toBeNull();
    expect(bell().getAttribute("aria-label")).toBe("الإشعارات");
    const b = mount({}, undefined);
    expect(within(b.container).getByRole("button", { name: /^الإشعارات/ }).querySelector(".eb-nav-badge")).toBeNull();
  });

  it("3. positive unread → the same count as the «الرسائل» badge, announced in the accessible name", () => {
    mount({}, { total: 3, capped: false });
    expect(bell().querySelector(".eb-nav-badge")?.textContent).toBe("3");
    expect(bell().getAttribute("aria-label")).toBe("الإشعارات، 3 غير مقروءة");
    expect(screen.getByRole("button", { name: /الرسائل/ }).querySelector(".eb-nav-badge")?.textContent).toBe("3 رسائل غير مقروءة");
  });

  it("4. capped → «99+»", () => {
    mount({}, { total: 99, capped: true });
    expect(bell().querySelector(".eb-nav-badge")?.textContent).toBe("99+");
    expect(bell().getAttribute("aria-label")).toBe("الإشعارات، 99+ غير مقروءة");
  });

  it("5/6. click opens (aria-expanded, aria-controls → the panel), a second click closes", () => {
    const { props } = mount({}, { total: 1, capped: false });
    expect(bell().getAttribute("aria-expanded")).toBe("false");
    expect(panel().hidden).toBe(true);
    fireEvent.click(bell());
    expect(bell().getAttribute("aria-expanded")).toBe("true");
    expect(panel().hidden).toBe(false);
    expect(within(panel()).getByRole("heading", { name: "الإشعارات" })).toBeTruthy();
    expect(props.onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(bell());
    expect(bell().getAttribute("aria-expanded")).toBe("false");
    expect(panel().hidden).toBe(true);
    expect(props.onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("7. Escape closes and returns focus to the bell", () => {
    const { props } = mount();
    fireEvent.click(bell());
    within(panel()).getAllByRole("button")[1].focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(bell().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(bell());
    expect(props.onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("8. a pointer press outside closes; inside the panel it stays open; listeners are removed on close (no leak)", () => {
    const add = vi.spyOn(document, "addEventListener"), remove = vi.spyOn(document, "removeEventListener");
    mount();
    fireEvent.click(bell());
    fireEvent.pointerDown(within(panel()).getByRole("heading", { name: "الإشعارات" }));
    expect(bell().getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerDown(screen.getByText("محتوى البوابة"));
    expect(bell().getAttribute("aria-expanded")).toBe("false");
    for (const type of ["pointerdown", "keydown"]) {
      const added = add.mock.calls.filter(c => c[0] === type).map(c => c[1]);
      const removed = remove.mock.calls.filter(c => c[0] === type).map(c => c[1]);
      expect(added.length).toBeGreaterThan(0);
      for (const fn of added) expect(removed).toContain(fn);
    }
  });
});

describe("notification panel contents", () => {
  it("9. a direct teacher message: icon, «رسالة جديدة من المعلم», sender, preview, time — no internal ids", () => {
    mount();
    fireEvent.click(bell());
    const item = within(panel()).getAllByRole("listitem")[0];
    expect(item.textContent).toContain("رسالة جديدة من المعلم");
    expect(item.textContent).toContain("أ. أحمد");
    expect(item.textContent).toContain("راجع الواجب الثاني قبل الأحد");
    expect(item.querySelector("time")?.getAttribute("dateTime")).toBe(DIRECT.createdAt);
    expect(item.querySelector(".eb-notif-icon.is-direct svg")).toBeTruthy();
    expect(panel().textContent).not.toContain(DIRECT.id);
    expect(panel().textContent).not.toContain("1800000000");
  });

  it("10. a class announcement: «إعلان للصف» (read) / «إعلان جديد للصف» (unread)", () => {
    const a = mount();
    fireEvent.click(bell());
    const item = within(panel()).getAllByRole("listitem")[1];
    expect(item.textContent).toContain("إعلان للصف");
    expect(item.textContent).toContain("لا توجد حصة غدًا");
    expect(item.querySelector(".eb-notif-icon.is-announcement svg")).toBeTruthy();
    a.unmount();
    mount({ items: [{ ...ANN, unread: true }] });
    fireEvent.click(bell());
    expect(within(panel()).getByRole("listitem").textContent).toContain("إعلان جديد للصف");
  });

  it("11. unread vs read is semantic text, not colour alone", () => {
    mount();
    fireEvent.click(bell());
    const [unreadBtn, readBtn] = within(panel()).getAllByRole("button").filter(b => b.classList.contains("eb-notif-item"));
    expect(unreadBtn.getAttribute("data-unread")).toBe("true");
    expect(unreadBtn.textContent).toContain("جديد");
    expect(readBtn.getAttribute("data-unread")).toBe("false");
    expect(readBtn.textContent).toContain("مقروء");
    expect(readBtn.textContent).not.toContain("جديد");
    expect(within(panel()).getByRole("list").getAttribute("aria-label")).toBe("أحدث الإشعارات، 1 غير مقروءة");
  });

  it("12. empty state: «لا توجد إشعارات جديدة.» (never a blank box)", () => {
    mount({ items: [] });
    fireEvent.click(bell());
    expect(within(panel()).getByText("لا توجد إشعارات جديدة.")).toBeTruthy();
    expect(within(panel()).queryByRole("list")).toBeNull();
  });

  it("13. loading: first load shows a status line; a refresh keeps the items visible", () => {
    const a = mount({ items: null, loading: true });
    fireEvent.click(bell());
    expect(within(panel()).getByRole("status").textContent).toBe("جارٍ تحميل الإشعارات...");
    expect(within(panel()).queryByText("لا توجد إشعارات جديدة.")).toBeNull();
    a.unmount();
    mount({ loading: true });
    fireEvent.click(bell());
    expect(within(panel()).getByText("جارٍ تحديث الإشعارات...")).toBeTruthy();
    expect(within(panel()).getAllByRole("listitem")).toHaveLength(2);
  });

  it("14. a failed refresh keeps the last-good items with a small, non-destructive error + retry", () => {
    const { props } = mount({ error: "تعذر تحديث الإشعارات حاليًا." });
    fireEvent.click(bell());
    expect(within(panel()).getAllByRole("listitem")).toHaveLength(2);
    expect(panel().textContent).toContain("تعذر تحديث الإشعارات حاليًا. تظهر آخر إشعارات تم تحميلها.");
    fireEvent.click(within(panel()).getByRole("button", { name: "إعادة المحاولة" }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText("محتوى البوابة")).toBeTruthy();                   // the portal is untouched
  });

  it("selecting an item closes the panel and hands the item to the portal; «فتح الرسائل» opens the messages view", () => {
    const { props } = mount();
    fireEvent.click(bell());
    fireEvent.click(within(panel()).getAllByRole("button").filter(b => b.classList.contains("eb-notif-item"))[1]);
    expect(props.onSelect).toHaveBeenCalledWith(ANN);
    expect(bell().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(bell());
    fireEvent.click(within(panel()).getByRole("button", { name: "فتح الرسائل" }));
    expect(props.onOpenMessages).toHaveBeenCalledTimes(1);
    expect(bell().getAttribute("aria-expanded")).toBe("false");
  });

  it("unmounted while open (another view opened from the keyboard) → the owner is told it closed", () => {
    const { props, unmount } = mount();
    fireEvent.click(bell());
    expect(props.onOpenChange).toHaveBeenLastCalledWith(true);
    unmount();
    expect(props.onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("keyboard: the bell and the items are real buttons (Enter/Space activate them natively)", () => {
    mount();
    bell().focus();
    expect(document.activeElement).toBe(bell());
    fireEvent.click(bell());
    const items = within(panel()).getAllByRole("button").filter(b => b.classList.contains("eb-notif-item"));
    expect(items.every(b => b.tagName === "BUTTON" && b.getAttribute("type") === "button")).toBe(true);
  });
});
