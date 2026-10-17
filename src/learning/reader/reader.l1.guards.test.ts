// @vitest-environment happy-dom
/// <reference types="node" />
// Phase L.1 — structural guards for reader-enterprise-l1.css (CSS is stubbed under Vitest, so it is read from disk) and
// for the swipe guard. They pin the decisions the behavioural tests cannot see: the index only docks through the
// Reader's data-toc flag, focus mode hides exactly the teacher shell's navigation column and page header (whose class
// names are cross-checked against the shell source), and the «داكن» palette is scoped to normal reading with figures
// and activities kept on their light plate.
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { swipeBlocked } from "./useReaderSwipe";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const css = read("./reader-enterprise-l1.css").replace(/\/\*[\s\S]*?\*\//g, "");   // rules only, comments stripped
const component = read("./LearningReader.tsx");
const noSpaces = (s: string) => s.replace(/\s+/g, "");

describe("L.1 stylesheet", () => {
  it("is loaded by the Reader after every earlier reader sheet and never uses !important", () => {
    const at = component.indexOf('import "./reader-enterprise-l1.css";');
    expect(at).toBeGreaterThan(component.indexOf('import "./reader-enterprise-l3b.css";'));
    expect(css).not.toContain("!important");
  });

  it("docks the index only for data-toc=docked; data-toc=drawer turns the desktop grid back into one column", () => {
    const flat = noSpaces(css);
    expect(flat).toContain('.learning-reader:not(.is-presentation)[data-toc="drawer"].learning-reader-layout{display:block;}');
    expect(flat).toContain('.learning-reader:not(.is-presentation)[data-toc="drawer"].learning-reader-sidebar{display:none;}');
    expect(flat).toContain('.learning-reader:not(.is-presentation).learning-reader-toc-toggle{display:inline-flex;}');
    expect(component).toContain('data-toc={presentation ? undefined : sidebarDocked ? "docked" : "drawer"}');
    expect(component).toContain('const wide = useMediaQuery("(min-width: 1280px)");');
  });

  it("focus mode hides exactly the teacher shell's navigation column and page header", () => {
    const flat = noSpaces(css);
    expect(flat).toContain("html[data-eb-reading-focus].eb-shell>.eb-sidebar");
    expect(flat).toContain("html[data-eb-reading-focus].eb-shell-main>.eb-page-header");
    // the shell really renders those classes in that structure
    const shell = read("../../shell/TeacherAppShell.tsx");
    expect(shell).toContain('className="eb-sidebar eb-on-dark"');
    expect(shell).toContain('className="app-shell-main eb-shell-main"');
    expect(read("../../ui/PageHeader.tsx")).toContain('<header className="eb-page-header">');
    // no other host element is hidden by the flag
    const hidden = [...css.matchAll(/html\[data-eb-reading-focus\][^{,]*/g)].map(m => m[0].trim());
    expect(hidden.every(sel => /\.eb-sidebar$|\.eb-drawer-backdrop$|\.eb-page-header$|\.eb-lm-reader$/.test(sel))).toBe(true);
  });

  it("toolbar labels are hidden visually (never removed) in normal reading only", () => {
    expect(noSpaces(css)).toContain(".learning-reader:not(.is-presentation).learning-reader-topbar.learning-reader-btn-label{position:absolute;");
  });

  it("the dark palette is scoped to normal reading, and figures / activities keep the light plate", () => {
    expect(css).toContain('.learning-reader:not(.is-presentation)[data-read-theme="dark"] {');
    expect(css).toContain('.learning-reader:not(.is-presentation)[data-read-theme="dark"] :is(.learning-activity, .eb-visual-figure) {');
    // raw colours live only in the palette token block, the light plate and the settings swatch
    const rules = css.split("}").filter(r => /#[0-9a-fA-F]{3,8}\b/.test(r)).map(r => r.slice(r.lastIndexOf("\n", r.indexOf("{")) + 1, r.indexOf("{")).trim());
    expect(rules).toEqual([
      ".learning-reader",
      '.learning-reader:not(.is-presentation)[data-read-theme="dark"] :is(.learning-activity, .eb-visual-figure)',
      '.learning-reader-settings-swatch[data-theme="dark"]',
    ]);
  });

  it("has reduced-motion and forced-colors fallbacks", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
  });
});

describe("L.1 swipe guard", () => {
  afterEach(() => { document.body.innerHTML = ""; });
  it("blocks a gesture that starts on a control, an activity or a horizontally scrolling element; allows plain text", () => {
    document.body.innerHTML = '<div id="root"><p id="text">نص</p><button id="btn">زر</button><div class="learning-activity"><span id="act">x</span></div><div id="scroller" style="overflow-x:auto"><span id="wide">wide</span></div></div>';
    const root = document.getElementById("root")!;
    const scroller = document.getElementById("scroller")!;
    Object.defineProperty(scroller, "scrollWidth", { value: 900 });
    Object.defineProperty(scroller, "clientWidth", { value: 300 });
    expect(swipeBlocked(document.getElementById("text"), root)).toBe(false);
    expect(swipeBlocked(document.getElementById("btn"), root)).toBe(true);
    expect(swipeBlocked(document.getElementById("act"), root)).toBe(true);
    expect(swipeBlocked(document.getElementById("wide"), root)).toBe(true);
    expect(swipeBlocked(null, root)).toBe(true);
  });
  it("an ancestor dialog (the presentation overlay) does not block the surface inside it", () => {
    document.body.innerHTML = '<div role="dialog"><div id="root"><p id="text">نص</p></div></div>';
    expect(swipeBlocked(document.getElementById("text"), document.getElementById("root"))).toBe(false);
  });
});
