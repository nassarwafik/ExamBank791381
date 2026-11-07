// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// UX-S1 (approved design docs/enterprise-ux-student-s1.md §2.2) — on a phone the student's top bar no longer scrolls sideways
// with «تسجيل الخروج» off-screen: games / install / logout are also offered in the shared ActionMenu «المزيد» (CSS shows the menu
// only ≤ 720px and the wide group only above it). Logout is the SAME action from both places; the install dialog outlives the menu.
const order: string[] = [];
vi.mock("../student/exam/answerJournal", () => ({ clearAllJournals: () => { order.push("clearJournals"); } }));
import StudentShell from "./StudentShell";

afterEach(() => { cleanup(); order.length = 0; });

const openMore = () => { fireEvent.click(screen.getByRole("button", { name: "المزيد" })); return screen.getByRole("group", { name: "المزيد" }); };

describe("UX-S1 — the phone «المزيد» menu", () => {
  it("offers games, install and logout (last, as a warning action); the bar keeps one logout button outside the menu", () => {
    render(<StudentShell studentName="ليان" onLogout={() => {}} onOpenGames={() => {}}><p>x</p></StudentShell>);
    expect(screen.getAllByRole("button", { name: /تسجيل الخروج/ })).toHaveLength(1);           // menu closed: only the wide bar's
    const menu = openMore();
    const items = within(menu).getAllByRole("button").map(b => b.textContent);
    expect(items).toEqual(["الألعاب التعليمية", "تثبيت التطبيق", "تسجيل الخروج"]);
    expect(within(menu).getByRole("button", { name: "تسجيل الخروج" }).className).toContain("is-danger");
  });

  it("logout from the menu is the same action as the bar button: the device's unsent answers are cleared, then the session ends", () => {
    const onLogout = vi.fn(() => order.push("logout"));
    render(<StudentShell studentName="ليان" onLogout={onLogout}><p>x</p></StudentShell>);
    fireEvent.click(within(openMore()).getByRole("button", { name: "تسجيل الخروج" }));
    expect(order).toEqual(["clearJournals", "logout"]);
    fireEvent.click(screen.getByRole("button", { name: /تسجيل الخروج/ }));
    expect(order).toEqual(["clearJournals", "logout", "clearJournals", "logout"]);
  });

  it("games from the menu opens the games destination; no games → no item", () => {
    const onOpenGames = vi.fn();
    const a = render(<StudentShell studentName="ليان" onLogout={() => {}} onOpenGames={onOpenGames}><p>x</p></StudentShell>);
    fireEvent.click(within(openMore()).getByRole("button", { name: "الألعاب التعليمية" }));
    expect(onOpenGames).toHaveBeenCalledTimes(1);
    a.unmount();
    render(<StudentShell studentName="ليان" onLogout={() => {}}><p>x</p></StudentShell>);
    expect(within(openMore()).queryByRole("button", { name: "الألعاب التعليمية" })).toBeNull();
  });

  it("install from the menu opens the guidance dialog, which stays open after the menu closed", () => {
    render(<StudentShell studentName="ليان" onLogout={() => {}}><p>x</p></StudentShell>);
    fireEvent.click(within(openMore()).getByRole("button", { name: "تثبيت التطبيق" }));
    expect(screen.queryByRole("group", { name: "المزيد" })).toBeNull();                         // the menu closed
    expect(screen.getByRole("dialog").textContent).toContain("التثبيت اختياري");
  });

  it("an installed app (standalone) offers no install item anywhere", () => {
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === "(display-mode: standalone)", media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    try {
      render(<StudentShell studentName="ليان" onLogout={() => {}}><p>x</p></StudentShell>);
      expect(screen.queryByRole("button", { name: /تثبيت التطبيق/ })).toBeNull();
      expect(within(openMore()).queryByRole("button", { name: "تثبيت التطبيق" })).toBeNull();
    } finally { window.matchMedia = mm; }
  });

  it("CSS: the menu is phone-only, the wide group desktop-only, and the phone bar no longer scrolls sideways", () => {
    const css = readFileSync(resolve(__dirname, "..", "student", "student-portal-v2.css"), "utf8");
    expect(css).toMatch(/\.eb-student-shell \.student-topbar-wide \{ display: contents; \}/);
    expect(css).toMatch(/\.eb-student-shell \.student-topbar-more \{ display: none; \}/);
    const phone = css.slice(css.indexOf("@media (max-width: 720px)"));
    expect(phone).toMatch(/\.student-topbar-wide \{ display: none; \}/);
    expect(phone).toMatch(/\.student-topbar-more \{\s*display: inline-flex;/);
    expect(phone.slice(0, phone.indexOf("/* ── Welcome hero"))).not.toMatch(/overflow-x:\s*auto/);
  });
});
