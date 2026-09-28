// @vitest-environment happy-dom
//
// Phase 12C — StudentMobileNav in isolation (a stand-in portal with the five real heading ids): the five destinations
// and their Arabic labels / ids, scrolling + heading focus (smooth vs reduced motion), the single aria-current item,
// the IntersectionObserver scroll-spy (manual scroll, tap hand-off, no redundant state), the no-IO fallback, a missing
// destination, and no URL / history / timer / network side effects. Plus the phone-only CSS contract (read from disk:
// CSS is stubbed under Vitest).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import { Profiler } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import StudentMobileNav from "./StudentMobileNav";
import { STUDENT_QUICK_NAV, scrollToStudentSection } from "./studentQuickNav";

// ---------- a controllable IntersectionObserver ----------
class FakeIO {
  static instances: FakeIO[] = [];
  targets = new Set<Element>();
  cb: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) { this.cb = cb; this.options = options; FakeIO.instances.push(this); }
  observe(t: Element) { this.targets.add(t); }
  unobserve(t: Element) { this.targets.delete(t); }
  disconnect() { this.targets.clear(); }
  takeRecords() { return []; }
  /** Report `ids` (heading ids) as crossing / leaving the spy band. */
  emit(changes: Record<string, boolean>) {
    const entries = Object.entries(changes).map(([id, on]) => ({ target: document.getElementById(id)!.closest("section")!, isIntersecting: on }) as unknown as IntersectionObserverEntry);
    act(() => { this.cb(entries, this as unknown as IntersectionObserver); });
  }
}
const io = () => FakeIO.instances[FakeIO.instances.length - 1];

const SECTIONS: [string, string][] = [
  ["eb-sp-today-title", "أكمل من حيث توقفت"], ["eb-sp-now-title", "ماذا عليّ أن أفعل الآن؟"], ["eb-sp-learning-title", "موادي التعليمية"],
  ["eb-sp-progress-title", "تقدّمي وقوتي"], ["eb-sp-tasks-title", "المهام والواجبات"], ["eb-sp-projects-title", "مشاريعي"], ["eb-sp-feed-title", "إنجازات الصف"],
];
function Page({ reducedMotion = false, omit = [] as string[], hidden = false, onRender }: { reducedMotion?: boolean; omit?: string[]; hidden?: boolean; onRender?: () => void }) {
  const nav = <StudentMobileNav reducedMotion={reducedMotion} hidden={hidden} />;
  return (
    <main className="student-portal eb-student-shell has-quick-nav">
      <section className="student-shell">
        {SECTIONS.filter(([id]) => !omit.includes(id)).map(([id, title]) => <section key={id} aria-labelledby={id}><h2 id={id}>{title}</h2><p>…</p></section>)}
      </section>
      {onRender ? <Profiler id="nav" onRender={onRender}>{nav}</Profiler> : nav}
    </main>
  );
}
const navRegion = () => screen.getByRole("navigation", { name: "التنقل السريع في بوابة الطالب" });
const items = () => within(navRegion()).getAllByRole("button");
const item = (label: string) => items().find(b => b.textContent === label)!;
const current = () => items().filter(b => b.getAttribute("aria-current")).map(b => b.textContent);

let scrolls: { id: string; opts: ScrollIntoViewOptions }[] = [];
beforeEach(() => {
  FakeIO.instances = [];
  scrolls = [];
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, opts?: boolean | ScrollIntoViewOptions) { scrolls.push({ id: this.id, opts: opts as ScrollIntoViewOptions }); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("12C destinations — five, Arabic, exact ids", () => {
  it("(1) renders exactly five destinations in one named <nav>, each a real button", () => {
    render(<Page />);
    expect(screen.getAllByRole("navigation", { name: "التنقل السريع في بوابة الطالب" })).toHaveLength(1);
    expect(items()).toHaveLength(5);
    for (const b of items()) { expect(b.tagName).toBe("BUTTON"); expect(b.getAttribute("type")).toBe("button"); }
    expect(STUDENT_QUICK_NAV).toHaveLength(5);
  });

  it("(2) Arabic labels in the RTL order اليوم · المواد · الواجبات · التقدم · المشاريع, each with an Arabic accessible name and an aria-hidden icon", () => {
    render(<Page />);
    expect(items().map(b => b.textContent)).toEqual(["اليوم", "المواد", "الواجبات", "التقدم", "المشاريع"]);
    expect(items().map(b => b.getAttribute("aria-label"))).toEqual(["انتقل إلى اليوم", "انتقل إلى موادي التعليمية", "انتقل إلى المهام والواجبات", "انتقل إلى تقدّمي وقوتي", "انتقل إلى مشاريعي"]);
    for (const b of items()) {
      const svg = b.querySelector("svg")!;
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(b.getAttribute("aria-label")).toMatch(/^[\u0600-\u06FF\s]+$/);
    }
  });

  it("(3) each destination points at the EXISTING section heading id (no «الآن», no feed, no sixth item)", () => {
    render(<Page />);
    expect(Object.fromEntries(STUDENT_QUICK_NAV.map(d => [d.key, d.target]))).toEqual({
      today: "eb-sp-today-title", learning: "eb-sp-learning-title", tasks: "eb-sp-tasks-title", progress: "eb-sp-progress-title", projects: "eb-sp-projects-title",
    });
    expect(items().map(b => b.getAttribute("data-target"))).toEqual(["eb-sp-today-title", "eb-sp-learning-title", "eb-sp-tasks-title", "eb-sp-progress-title", "eb-sp-projects-title"]);
  });
});

describe("12C tap → scroll to the section + focus its heading", () => {
  const cases: [string, string, string][] = [
    ["(4) الواجبات", "الواجبات", "eb-sp-tasks-title"],
    ["(5) المواد", "المواد", "eb-sp-learning-title"],
    ["(6) التقدم", "التقدم", "eb-sp-progress-title"],
    ["(7) المشاريع", "المشاريع", "eb-sp-projects-title"],
  ];
  for (const [name, label, id] of cases) {
    it(`${name} scrolls exactly that section's heading into view (block start) and focuses it without a Tab stop`, () => {
      render(<Page />);
      fireEvent.click(item(label));
      expect(scrolls).toEqual([{ id, opts: { block: "start", behavior: "smooth" } }]);
      const heading = document.getElementById(id)!;
      expect(document.activeElement).toBe(heading);
      expect(heading.getAttribute("tabindex")).toBe("-1");               // programmatic focus only, never a Tab stop
      expect(current()).toEqual([label]);
    });
  }

  it("(8) reduced motion → behavior «auto» (instant)", () => {
    render(<Page reducedMotion />);
    fireEvent.click(item("الواجبات"));
    expect(scrolls[0].opts.behavior).toBe("auto");
  });

  it("(9) motion allowed → behavior «smooth»", () => {
    render(<Page reducedMotion={false} />);
    fireEvent.click(item("التقدم"));
    expect(scrolls[0].opts.behavior).toBe("smooth");
  });

  it("focus is moved without a second (instant) scroll: preventScroll", () => {
    render(<Page />);
    const spy = vi.spyOn(document.getElementById("eb-sp-learning-title")!, "focus");
    fireEvent.click(item("المواد"));
    expect(spy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("scrollToStudentSection is a no-op (false) for a section that is not on the page", () => {
    render(<Page omit={["eb-sp-projects-title"]} />);
    expect(scrollToStudentSection("eb-sp-projects-title", false)).toBe(false);
    expect(scrolls).toEqual([]);
  });

  it("no URL hash, no history entry, no timer, no network", () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(); globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const hash = location.hash, len = history.length, push = vi.spyOn(history, "pushState"), replace = vi.spyOn(history, "replaceState");
    render(<Page />);
    for (const label of ["الواجبات", "المشاريع", "التقدم", "المواد", "اليوم"]) fireEvent.click(item(label));
    expect(location.hash).toBe(hash);
    expect(history.length).toBe(len);
    expect(push).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);                                  // no polling, no delayed work
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("12C active item — aria-current, scroll-spy, exactly one", () => {
  it("(10) initial item is «اليوم» with aria-current=location and the is-active marker; a tap moves both", () => {
    render(<Page />);
    expect(current()).toEqual(["اليوم"]);
    expect(item("اليوم").getAttribute("aria-current")).toBe("location");
    expect(item("اليوم").className).toContain("is-active");
    fireEvent.click(item("الواجبات"));
    expect(current()).toEqual(["الواجبات"]);
    expect(item("اليوم").hasAttribute("aria-current")).toBe(false);
    expect(item("اليوم").className).not.toContain("is-active");
  });

  it("(11) manual scrolling updates the active item through the IntersectionObserver (a thin band, observed sections only)", () => {
    render(<Page />);
    const o = io();
    expect(o.options?.rootMargin).toBe("-45% 0px -54% 0px");
    expect([...o.targets].map(t => t.getAttribute("aria-labelledby")).sort()).toEqual(["eb-sp-learning-title", "eb-sp-progress-title", "eb-sp-projects-title", "eb-sp-tasks-title", "eb-sp-today-title"]);
    o.emit({ "eb-sp-today-title": false, "eb-sp-learning-title": true });
    expect(current()).toEqual(["المواد"]);
    o.emit({ "eb-sp-learning-title": false, "eb-sp-progress-title": true });
    expect(current()).toEqual(["التقدم"]);
    o.emit({ "eb-sp-progress-title": false });                            // a gap / an unlisted section: keep the last
    expect(current()).toEqual(["التقدم"]);
    o.emit({ "eb-sp-projects-title": true });
    expect(current()).toEqual(["المشاريع"]);
  });

  it("(11b) a tap hands off to its own section: sections passed during the smooth scroll never flash active; a user gesture ends the hand-off", () => {
    render(<Page />);
    const o = io();
    fireEvent.click(item("المشاريع"));
    o.emit({ "eb-sp-learning-title": true });                            // passing by
    expect(current()).toEqual(["المشاريع"]);
    o.emit({ "eb-sp-learning-title": false, "eb-sp-projects-title": true }); // arrived
    expect(current()).toEqual(["المشاريع"]);
    o.emit({ "eb-sp-projects-title": false, "eb-sp-tasks-title": true });    // the student scrolls back up
    expect(current()).toEqual(["الواجبات"]);
    // a tap whose section never reaches the band stays active until the student takes over
    fireEvent.click(item("التقدم"));
    o.emit({ "eb-sp-tasks-title": true });
    expect(current()).toEqual(["التقدم"]);
    fireEvent.touchStart(window);
    o.emit({ "eb-sp-tasks-title": false, "eb-sp-learning-title": true });
    expect(current()).toEqual(["المواد"]);
  });

  it("(12) exactly ONE item is active through any sequence of taps and observer reports", () => {
    render(<Page />);
    const o = io();
    const seq: (() => void)[] = [
      () => fireEvent.click(item("المواد")), () => o.emit({ "eb-sp-learning-title": true, "eb-sp-progress-title": true }),
      () => fireEvent.wheel(window), () => o.emit({ "eb-sp-tasks-title": true }), () => fireEvent.click(item("اليوم")),
      () => o.emit({ "eb-sp-today-title": true }), () => fireEvent.keyDown(window, { key: "PageDown" }), () => o.emit({ "eb-sp-projects-title": true }),
    ];
    for (const step of seq) { step(); expect(current()).toHaveLength(1); expect(document.querySelectorAll(".eb-sp-quicknav-item.is-active")).toHaveLength(1); }
  });

  it("does not set state when the active section is unchanged (no extra render), and the spy never moves focus", () => {
    let commits = 0;
    render(<Page onRender={() => { commits += 1; }} />);
    const o = io();
    const base = commits;
    const focused = document.activeElement;
    o.emit({ "eb-sp-today-title": true });                               // already «اليوم»
    o.emit({ "eb-sp-today-title": true, "eb-sp-now-title": false } as Record<string, boolean>);
    expect(commits).toBe(base);
    o.emit({ "eb-sp-today-title": false, "eb-sp-tasks-title": true });
    expect(commits).toBe(base + 1);
    o.emit({ "eb-sp-tasks-title": true });
    expect(commits).toBe(base + 1);
    expect(document.activeElement).toBe(focused);                        // ordinary scrolling never steals focus
  });

  it("fallback without IntersectionObserver: taps still scroll, focus and set the single active item", () => {
    delete (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
    render(<Page />);
    expect(current()).toEqual(["اليوم"]);
    fireEvent.click(item("الواجبات"));
    expect(scrolls.map(s => s.id)).toEqual(["eb-sp-tasks-title"]);
    expect(document.activeElement?.id).toBe("eb-sp-tasks-title");
    expect(current()).toEqual(["الواجبات"]);
  });

  it("the observer is disconnected on unmount", () => {
    const { unmount } = render(<Page />);
    const o = io();
    expect(o.targets.size).toBe(5);
    unmount();
    expect(o.targets.size).toBe(0);
  });
});

describe("12C a destination that is not on the page (no projects yet)", () => {
  it("stays one of the five but is aria-disabled with an Arabic explanation, does nothing when tapped, and becomes live when the section appears", async () => {
    const { rerender } = render(<Page omit={["eb-sp-projects-title"]} />);
    const b = item("المشاريع");
    expect(items()).toHaveLength(5);
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.getAttribute("aria-label")).toBe("انتقل إلى مشاريعي — غير متاحة الآن");
    fireEvent.click(b);
    expect(scrolls).toEqual([]);
    expect(current()).toEqual(["اليوم"]);
    rerender(<Page />);                                                   // the project panel's own read landed
    await act(async () => { await Promise.resolve(); });                 // MutationObserver delivery
    expect(item("المشاريع").hasAttribute("aria-disabled")).toBe(false);
    expect([...io().targets].some(t => t.getAttribute("aria-labelledby") === "eb-sp-projects-title")).toBe(true);
    fireEvent.click(item("المشاريع"));
    expect(scrolls.map(s => s.id)).toEqual(["eb-sp-projects-title"]);
  });

  it("`hidden` (a screen-takeover dialog) hides the bar without unmounting it", () => {
    const { rerender } = render(<Page />);
    fireEvent.click(item("التقدم"));
    rerender(<Page hidden />);
    expect(document.querySelector(".eb-sp-quicknav")!.hasAttribute("hidden")).toBe(true);
    rerender(<Page />);
    expect(current()).toEqual(["التقدم"]);                                // state kept
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
