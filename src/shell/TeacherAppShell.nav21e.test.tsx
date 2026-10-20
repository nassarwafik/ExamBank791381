// @vitest-environment happy-dom
/// <reference types="node" />
// Phase 21E — enterprise main navigation. The sidebar is organised into visible, labelled sections (teaching · follow-up ·
// exams · account) without moving, renaming or hiding any destination; the account controls (identity + logout) live
// together at the bottom; the keyboard order follows the visual order; the compact rail keeps every section name in the
// [UX-R2 — the redesign moved the identity and the menu toggles into the full-width top bar ABOVE the sidebar (the reference
// layout); logout stays the sidebar's last control. The four placement tests below were updated on purpose for that move;
// what they protect is kept: every control once, the account section last, and keyboard order = visual order.]
// accessibility tree; and the redesign stylesheet adds no stacking context, no physical (non-RTL) sides and keeps
// 44 px touch targets for the phone / tablet menu button.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import TeacherAppShell from "./TeacherAppShell";
import { NAV_LABELS, PRIMARY_NAV, PRIMARY_SECTIONS, EXAM_BANK_HEAD, EXAM_BANK_NAV, FOOTER_NAV, type TeacherNavState } from "./teacherNav";
import type { TeacherProfile } from "../teacher/teacherProfile";

const SRC = join(process.cwd(), "src");
const css = () => readFileSync(join(SRC, "shell", "teacher-nav-21e.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const norm = (s: string) => s.replace(/\s+/g, "");
const state = (over: Partial<TeacherNavState> = {}): TeacherNavState => ({ teacherView: "platform", workspaceTab: "dashboard", projectCode: "", projectList: [], ...over });
const profile: TeacherProfile = { teacherId: "t-1", displayName: "المعلم", hasCustomName: false, avatarId: "a1", profilePhoto: null, updatedAt: "" };

function mount(over: Partial<TeacherNavState> = {}, withIdentity = true) {
  const onNavigate = vi.fn<(id: string) => void>();
  render(
    <TeacherAppShell nav={state(over)} projectReadyTotal={2} messageUnread={{ total: 4, capped: false }} displayName="المعلم"
      identity={withIdentity ? { token: "tok", profile, onProfileChange: () => {} } : undefined} onNavigate={onNavigate as never} onLogout={() => {}}>
      <p>محتوى</p>
    </TeacherAppShell>
  );
  return { onNavigate };
}
const sidebar = () => screen.getByRole("complementary", { name: "التنقل الرئيسي" });
// A control's visible name: the nav label, else its tooltip title, else its aria-label (the avatar's aria-label carries a suffix).
const labelOf = (b: HTMLElement) => (b.querySelector(".eb-nav-label")?.textContent || "").trim() || b.getAttribute("title") || b.getAttribute("aria-label") || "";
const names = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLButtonElement>("button.eb-nav-link")).map(b => (b.querySelector(".eb-nav-label")?.textContent || "").trim());

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => true })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("21E nav — labelled sections, same destinations in the same order", () => {
  it("the sections are a pure partition of PRIMARY_NAV (order authority unchanged)", () => {
    expect(PRIMARY_SECTIONS.flatMap(s => s.items)).toEqual(PRIMARY_NAV);
    expect(PRIMARY_SECTIONS.map(s => s.label)).toEqual(["التدريس", "المتابعة والأنشطة"]);
  });

  it("renders named groups «التدريس» · «المتابعة والأنشطة» · «الامتحانات» · «الحساب», each holding exactly its destinations", () => {
    mount();
    const g = (name: string) => within(sidebar()).getByRole("group", { name });
    expect(names(g("التدريس"))).toEqual(["dashboard", "learning", "students", "assignments", "messages"].map(id => NAV_LABELS[id as never]));
    expect(names(g("المتابعة والأنشطة"))).toEqual(["projects", "reports", "games"].map(id => NAV_LABELS[id as never]));
    expect(names(g("الامتحانات"))).toEqual([EXAM_BANK_HEAD, ...EXAM_BANK_NAV].map(id => NAV_LABELS[id]));
    // the existing Exam Bank group (UX-6c) is kept inside the exams section
    expect(names(within(g("الامتحانات")).getByRole("group", { name: "بنك الامتحانات" }))).toEqual([EXAM_BANK_HEAD, ...EXAM_BANK_NAV].map(id => NAV_LABELS[id]));
    const account = g("الحساب");
    expect(within(account).getByRole("button", { name: "تسجيل الخروج" }).className).toContain("app-sidebar-logout");
    // UX-R2: the identity sits in the top bar (banner), once — never also in the sidebar.
    expect(within(screen.getByRole("banner")).getByRole("button", { name: /تعديل صورة وملف المعلم/ })).toBeTruthy();
    expect(within(sidebar()).queryByRole("button", { name: /تعديل صورة وملف المعلم/ })).toBeNull();
    // every section shows its name as visible text (not only an aria-label)
    for (const name of ["التدريس", "المتابعة والأنشطة", "الامتحانات", "الحساب"]) expect(within(sidebar()).getByText(name, { selector: ".eb-nav-section-label" })).toBeTruthy();
  });

  it("all 13 destinations + logout remain, once each, in the unchanged DOM order", () => {
    mount();
    expect(names(sidebar())).toEqual([...PRIMARY_NAV, EXAM_BANK_HEAD, ...EXAM_BANK_NAV, ...FOOTER_NAV].map(id => NAV_LABELS[id]).concat("تسجيل الخروج"));
  });

  it("the account section closes the sidebar: the activity log after the last destination, logout last (UX-R2: the identity is in the top bar)", () => {
    mount();
    const order = Array.from(sidebar().querySelectorAll<HTMLElement>("button")).map(labelOf);
    const iAudit = order.indexOf(NAV_LABELS.audit), iLogout = order.indexOf("تسجيل الخروج");
    expect(iAudit).toBeGreaterThan(order.indexOf(NAV_LABELS.reviews));
    expect(iLogout).toBeGreaterThan(iAudit);
    expect(iLogout).toBe(order.length - 1);
  });

  it("keyboard order follows the visual order: the top bar start to end (menu toggles, home, quick navigation, profile), then the 13 destinations top to bottom, logout", () => {
    mount();
    // The shell's own chrome only (the page content is the caller's): top bar first in the DOM, then the sidebar.
    const chrome = [screen.getByRole("banner"), sidebar()];
    // aria-label first (the avatar's carries a « (الحالية: …)» suffix, trimmed), else the nav label, else the visible text.
    const name = (el: HTMLElement) => (el.getAttribute("aria-label") || "").replace(/\s*\(.*\)$/, "") || (el.querySelector(".eb-nav-label")?.textContent || "").trim() || (el.textContent || "").trim();
    const focusables = chrome.flatMap(root => Array.from(root.querySelectorAll<HTMLElement>("button, input"))).filter(b => !b.hasAttribute("disabled") && b.tabIndex >= 0);
    expect(focusables.map(name)).toEqual([
      "طيّ القائمة", "القائمة", "الرئيسية", "انتقل إلى صفحة", "تعديل صورة وملف المعلم",
      ...[...PRIMARY_NAV, EXAM_BANK_HEAD, ...EXAM_BANK_NAV, ...FOOTER_NAV].map(id => NAV_LABELS[id]), "تسجيل الخروج",
    ]);
  });

  it("without an identity the top bar still names the signed-in teacher and the account section still holds logout", () => {
    mount({}, false);
    expect(screen.getByRole("banner").textContent).toContain("المعلم");
    const account = within(sidebar()).getByRole("group", { name: "الحساب" });
    expect(within(account).getByRole("button", { name: "تسجيل الخروج" })).toBeTruthy();
  });

  it("compact rail: section names stay in the accessibility tree and every destination keeps its name + tooltip", () => {
    mount({ teacherView: "reviews" });
    fireEvent.click(screen.getByRole("button", { name: "طيّ القائمة" }));
    for (const name of ["التدريس", "المتابعة والأنشطة", "الامتحانات", "الحساب"]) expect(within(sidebar()).getByRole("group", { name })).toBeTruthy();
    for (const id of [...PRIMARY_NAV, EXAM_BANK_HEAD, ...EXAM_BANK_NAV, ...FOOTER_NAV]) {
      const b = within(sidebar()).getByRole("button", { name: new RegExp(NAV_LABELS[id]) });
      expect(b.getAttribute("title")).toBe(NAV_LABELS[id]);
    }
    const current = Array.from(sidebar().querySelectorAll('[aria-current="page"]'));
    expect(current.map(e => e.textContent?.trim())).toEqual(["مراجعات النشر"]);
  });

  it("badges stay inside their destination's accessible name (projects 2 · messages 4)", () => {
    mount();
    expect(within(sidebar()).getByRole("button", { name: /المشاريع/ }).textContent).toMatch(/2\s*مراحل بانتظار الفحص/);
    expect(within(sidebar()).getByRole("button", { name: /الرسائل/ }).textContent).toMatch(/4\s*رسائل جديدة/);
  });
});

describe("21E nav — stylesheet guards (teacher-nav-21e.css)", () => {
  it("is loaded by the teacher shell after shell.css", () => {
    const shell = readFileSync(join(SRC, "shell", "TeacherAppShell.tsx"), "utf8");
    expect(shell.indexOf('import "./teacher-nav-21e.css";')).toBeGreaterThan(shell.indexOf('import "../shell.css";'));
  });
  it("adds no stacking context anywhere (no isolation, contain, filter, transform or will-change) — the #316 overlay guard", () => {
    expect(css()).not.toMatch(/\b(isolation|contain|filter|backdrop-filter|will-change|perspective)\s*:/);
    expect(css()).not.toMatch(/(?:\.eb-shell-main|\.eb-shell-content|#eb-main)[^{]*\{[^}]*\b(transform|z-index|opacity)\s*:/);
    expect(css()).not.toMatch(/z-index\s*:\s*\d/);                         // layers only through the existing --eb-z-* tokens
  });
  it("is RTL-first: logical properties only, no physical left / right sides", () => {
    expect(css()).not.toMatch(/(?:^|[;{\s])(left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right)\s*:/m);
  });
  it("the phone / tablet «القائمة» button is a 44 px target below the shell breakpoint", () => {
    expect(norm(css())).toMatch(/@media\(max-width:1023px\)\{[^@]*\.eb-drawer-toggle\{[^}]*min-width:44px;[^}]*min-height:44px;/);
  });
  it("section labels are visually hidden (never display:none) on the manual and automatic compact rails", () => {
    const c = norm(css());
    expect(c).toMatch(/\.eb-shell\.is-compact\.eb-nav-section-label\{[^}]*clip-path:inset\(50%\)/);
    expect(c).toMatch(/@media\(min-width:1024px\)and\(max-width:1279px\)\{[^@]*\.eb-nav-section-label\{[^}]*clip-path:inset\(50%\)/);
    expect(c).not.toMatch(/\.eb-nav-section-label\{[^}]*display:none/);
  });
  it("keyboard rings stay drawn inside the link (inset), as #316 required for the scrolling nav", () => {
    const rings = [...css().matchAll(/([^{}]*\.eb-nav-link:focus-visible[^{}]*)\{([^}]*)\}/g)];
    for (const [, , decls] of rings) {
      const off = decls.match(/outline-offset\s*:\s*(-?\d+)px/);
      if (off) expect(Number(off[1])).toBeLessThanOrEqual(-2);
    }
  });
  it("every --eb-* token the shell stylesheets read is defined (an undefined var() silently drops the declaration)", () => {
    const tokens = new Set([...readFileSync(join(SRC, "design-tokens.css"), "utf8").matchAll(/(--eb-[\w-]+)\s*:/g)].map(m => m[1]));
    for (const file of ["shell.css", "shell/teacher-nav-21e.css"]) {
      const text = readFileSync(join(SRC, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      const missing = [...text.matchAll(/var\((--eb-[\w-]+)\s*([,)])/g)].filter(m => m[2] === ")" && !tokens.has(m[1])).map(m => m[1]);
      expect(missing, file).toEqual([]);
    }
  });
});
