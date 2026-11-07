// @vitest-environment happy-dom
//
// Phase 12C — StudentMobileNav in isolation: the five destinations and their Arabic labels, the single aria-current item, an
// unavailable destination, `hidden`, and the phone-only CSS contract (read from disk: CSS is stubbed under Vitest).
// UX-S2 (approved design docs/enterprise-ux-student-s2.md §2.3): each item now OPENS a view — the bar reports the choice to the
// portal (which owns the view, its #/s/<view> link and the heading focus); the former scroll spy (IntersectionObserver) is gone.
// The portal-level behaviour (link, back button, focus, reads) is in src/StudentPortal.mobileNav.12c.test.tsx.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import StudentMobileNav from "./StudentMobileNav";
import { scrollToStudentSection } from "./studentQuickNav";
import { STUDENT_VIEWS, type StudentView } from "../student/portalViews";

const navRegion = () => screen.getByRole("navigation", { name: "التنقل السريع في بوابة الطالب" });
const items = () => within(navRegion()).getAllByRole("button");
const item = (label: string) => items().find(b => b.textContent === label)!;
const current = () => items().filter(b => b.getAttribute("aria-current")).map(b => b.textContent);
function Bar({ active = "today" as StudentView, onSelect = (() => {}) as (v: StudentView) => void, unavailable = [] as StudentView[], hidden = false }) {
  return <StudentMobileNav active={active} onSelect={onSelect} unavailable={unavailable} hidden={hidden} />;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("12C destinations — five, Arabic, the portal's views", () => {
  it("(1) renders exactly five destinations in one named <nav>, each a real button", () => {
    render(<Bar />);
    expect(screen.getAllByRole("navigation", { name: "التنقل السريع في بوابة الطالب" })).toHaveLength(1);
    expect(items()).toHaveLength(5);
    for (const b of items()) expect(b.getAttribute("type")).toBe("button");
  });

  it("(2) Arabic labels in the RTL order اليوم · المواد · الواجبات · التقدم · المشاريع, each with an Arabic accessible name and an aria-hidden icon", () => {
    render(<Bar />);
    expect(items().map(b => b.textContent)).toEqual(["اليوم", "المواد", "الواجبات", "التقدم", "المشاريع"]);
    expect(items().map(b => b.getAttribute("aria-label"))).toEqual(["انتقل إلى اليوم", "انتقل إلى موادي التعليمية", "انتقل إلى المهام والواجبات", "انتقل إلى تقدّمي وقوتي", "انتقل إلى مشاريعي"]);
    for (const b of items()) expect(b.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("(3) each destination is one of the portal's five views, in the views' own order (no sixth item)", () => {
    render(<Bar />);
    expect(items().map(b => b.getAttribute("data-view"))).toEqual(STUDENT_VIEWS.map(v => v.key));
    expect(STUDENT_VIEWS.map(v => v.key)).toEqual(["today", "learning", "tasks", "progress", "projects"]);
  });
});

describe("UX-S2 tap → the portal opens that view", () => {
  const cases: [string, StudentView][] = [["اليوم", "today"], ["المواد", "learning"], ["الواجبات", "tasks"], ["التقدم", "progress"], ["المشاريع", "projects"]];
  for (const [label, view] of cases) {
    it(`«${label}» reports «${view}» to the portal, once`, () => {
      const onSelect = vi.fn();
      render(<Bar onSelect={onSelect} />);
      fireEvent.click(item(label));
      expect(onSelect.mock.calls).toEqual([[view]]);
    });
  }

  it("the bar itself scrolls nothing, writes no link, starts no timer and reads nothing (the portal owns all of that)", () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(); globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const scroll = vi.fn(); HTMLElement.prototype.scrollIntoView = scroll;
    const push = vi.spyOn(history, "pushState");
    render(<Bar />);
    for (const label of ["الواجبات", "المشاريع", "التقدم", "المواد", "اليوم"]) fireEvent.click(item(label));
    expect(scroll).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("12C active item — aria-current, exactly one", () => {
  it("(10) the active view carries aria-current=page and the is-active marker; it follows the portal's view", () => {
    const { rerender } = render(<Bar active="today" />);
    expect(current()).toEqual(["اليوم"]);
    expect(item("اليوم").className).toContain("is-active");
    rerender(<Bar active="tasks" />);
    expect(current()).toEqual(["الواجبات"]);
    expect(item("الواجبات").getAttribute("aria-current")).toBe("page");
    expect(item("اليوم").className).not.toContain("is-active");
  });

  it("(12) exactly ONE item is active for every view", () => {
    const { rerender } = render(<Bar />);
    for (const v of STUDENT_VIEWS) { rerender(<Bar active={v.key} />); expect(current()).toEqual([v.label]); }
  });

  it("no IntersectionObserver is created any more (no scroll spy)", () => {
    const IO = vi.fn(); (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
    render(<Bar />);
    expect(IO).not.toHaveBeenCalled();
  });
});

describe("12C a destination that is not available (no projects)", () => {
  it("stays one of the five but is aria-disabled with an Arabic explanation and does nothing when tapped; it becomes live when available", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<Bar onSelect={onSelect} unavailable={["projects"]} />);
    expect(items()).toHaveLength(5);
    expect(item("المشاريع").getAttribute("aria-disabled")).toBe("true");
    expect(item("المشاريع").getAttribute("aria-label")).toBe("انتقل إلى مشاريعي — غير متاحة الآن");
    fireEvent.click(item("المشاريع"));
    expect(onSelect).not.toHaveBeenCalled();
    rerender(<Bar onSelect={onSelect} />);
    expect(item("المشاريع").hasAttribute("aria-disabled")).toBe(false);
    fireEvent.click(item("المشاريع"));
    expect(onSelect.mock.calls).toEqual([["projects"]]);
  });

  it("`hidden` (a screen-takeover dialog) hides the bar without unmounting it", () => {
    const { rerender } = render(<Bar active="progress" />);
    rerender(<Bar active="progress" hidden />);
    expect(document.querySelector(".eb-sp-quicknav")!.hasAttribute("hidden")).toBe(true);
    rerender(<Bar active="progress" />);
    expect(current()).toEqual(["التقدم"]);
  });
});

// The portal still uses this helper to bring an element INSIDE a view into sight (e.g. the opened project after a drill).
describe("scrollToStudentSection (kept helper)", () => {
  it("scrolls the heading into view (block start, smooth unless reduced motion), focuses it without a Tab stop and without a second scroll", () => {
    const scrolls: unknown[] = [];
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, o?: boolean | ScrollIntoViewOptions) { scrolls.push([this.id, o]); };
    render(<section aria-labelledby="h"><h2 id="h">x</h2></section>);
    const h = document.getElementById("h")!;
    const focus = vi.spyOn(h, "focus");
    expect(scrollToStudentSection("h", false)).toBe(true);
    expect(scrollToStudentSection("h", true)).toBe(true);
    expect(scrolls).toEqual([["h", { block: "start", behavior: "smooth" }], ["h", { block: "start", behavior: "auto" }]]);
    expect(h.getAttribute("tabindex")).toBe("-1");
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it("is a no-op (false) for a section that is not on the page", () => {
    expect(scrollToStudentSection("eb-missing", false)).toBe(false);
  });
});

// ---------- the CSS contract (phone only, safe area, clearance, 320px) ----------
const css = readFileSync(path.join(process.cwd(), "src/shell/studentMobileNav.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
function mediaBlock(src: string, query: string): string {
  const at = src.indexOf("@media " + query);
  if (at < 0) return "";
  let i = src.indexOf("{", at) + 1, depth = 1; const start = i;
  for (; i < src.length && depth; i++) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; }
  return src.slice(start, i - 1);
}
function rule(src: string, selector: string): string {
  const re = new RegExp("(^|})\\s*" + selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}", "m");
  return re.exec(src)?.[2] ?? "";
}
const phone = mediaBlock(css, "(max-width: 767px)");
const outside = (() => { const at = css.indexOf("@media"); return css.slice(0, at); })();

describe("12C CSS — phone only, safe-area aware, clearance, 320px", () => {
  it("(17) the bar is display:none by default and is drawn ONLY inside (max-width: 767px); no other media query shows it (tablet/desktop unchanged)", () => {
    expect(rule(outside, ".eb-sp-quicknav")).toMatch(/display:\s*none/);
    expect(phone).not.toBe("");
    expect(rule(phone, ".eb-sp-quicknav")).toMatch(/display:\s*block/);
    expect(rule(phone, ".eb-sp-quicknav")).toMatch(/position:\s*fixed/);
    const queries = [...css.matchAll(/@media\s*([^{]+)\{/g)].map(m => m[1].trim());
    expect(queries).toEqual(["(max-width: 767px)"]);
  });

  it("(18) the bar pads its bottom by env(safe-area-inset-bottom) (and the side insets)", () => {
    const bar = rule(phone, ".eb-sp-quicknav");
    expect(bar).toMatch(/padding-block:[^;]*calc\([^;]*env\(safe-area-inset-bottom,\s*0px\)/);
    expect(bar).toMatch(/env\(safe-area-inset-right/);
    expect(bar).toMatch(/env\(safe-area-inset-left/);
  });

  it("(19) the portal content gets bottom clearance (bar height + safe area) on phone only, and only when the bar is present", () => {
    const clear = rule(phone, ".eb-student-shell.has-quick-nav .student-shell");
    expect(clear).toMatch(/padding-block-end:\s*calc\(var\(--eb-sp-quicknav-h\)\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)/);
    expect(outside).not.toMatch(/has-quick-nav/);
    expect(rule(phone, ".eb-student-shell")).toMatch(/--eb-sp-quicknav-h:\s*60px/);
  });

  it("(20) 320px guard: five equal shrinkable columns, ≥44px targets, ellipsis labels, visible focus, non-colour active marker", () => {
    expect(rule(phone, ".eb-sp-quicknav-list")).toMatch(/grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
    const it_ = rule(phone, ".eb-sp-quicknav-item");
    expect(it_).toMatch(/min-width:\s*0/);
    expect(it_).toMatch(/min-height:\s*max\(44px/);
    expect(rule(phone, ".eb-sp-quicknav-label")).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule(phone, ".eb-sp-quicknav-item:focus-visible")).toMatch(/outline:\s*var\(--eb-focus-ring\)/);
    expect(rule(phone, ".eb-sp-quicknav-item.is-active::before")).toMatch(/content:\s*""/);
    expect(rule(phone, ".eb-sp-quicknav-item.is-active")).toMatch(/font-weight/);
  });

  it("a hidden bar and any open Dialog (portalled .eb-dialog-root) hide it; z-index stays below dialogs", () => {
    expect(phone).toMatch(/\.eb-sp-quicknav\[hidden\],\s*body:has\(\.eb-dialog-root\) \.eb-sp-quicknav\s*\{\s*display:\s*none;?\s*\}/);
    expect(rule(phone, ".eb-sp-quicknav")).toMatch(/z-index:\s*var\(--eb-z-nav\)/);
  });
});
