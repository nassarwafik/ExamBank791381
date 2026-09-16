import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// UX-2 — Design Foundation + App Shell: SOURCE-LEVEL guards over the frontend (kept with the other source-guard
// suites under api/tests, which run on Node). Behavioural coverage lives in src/shell/*.test.tsx and src/AppShell.test.tsx.
//   1. Root document: lang="ar", dir="rtl", a real title.
//   2. Canonical focus: index.css owns the ONE :focus-visible rule and it uses a real outline; the old App.css override
//      (`:focus-visible { outline: none; box-shadow: var(--eb-focus) }`) is gone; every remaining `outline: none|0` is on
//      an ALLOW-LIST with the reason an equivalent visible focus treatment exists; the three unprotected rules corrected
//      in UX-2 must not come back.
//   3. New UX-2 stylesheets are token-only (--eb-*); the shell layers stay below the legacy 900/1000 overlays.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC = join(ROOT, "src");
const read = f => readFileSync(join(SRC, f), "utf8");
const CSS_FILES = readdirSync(SRC).filter(f => f.endsWith(".css") && !f.includes(".bak"));

// selector → why it is safe (an equivalent visible focus treatment exists)
const OUTLINE_NONE_ALLOW_LIST = {
  ".login-card input": "App.css `.login-card input:focus` re-adds border-color + box-shadow ring",
  ".model-picker select": "App.css `.model-picker select:focus` re-adds border-color + box-shadow ring",
  ".login-card input:focus, .builder-card > textarea:focus, .marks-field input:focus, .model-picker select:focus": "same rule sets border-color + box-shadow ring",
  ".auth-input input:focus": "same rule sets border-color + box-shadow ring"
};
const norm = s => s.replace(/\s+/g, " ").trim();

// every rule whose body contains `outline: none|0`, as its (normalised) selector text
function outlineNoneRules(css) {
  const out = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(stripped))) {
    if (/outline\s*:\s*(none|0)\b/.test(m[2])) out.push(norm(m[1].split("}").pop()));
  }
  return out;
}

describe("UX-2 root document", () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  it('declares lang="ar" and dir="rtl" on <html>', () => {
    expect(html).toMatch(/<html[^>]*\slang="ar"/);
    expect(html).toMatch(/<html[^>]*\sdir="rtl"/);
  });
  it("carries a meaningful ExamBank title", () => {
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] || "";
    expect(title).toMatch(/ExamBank 791381/);
    expect(title).not.toBe("exambank791381");
  });
});

describe("UX-2 focus foundation", () => {
  it("index.css defines the canonical :focus-visible ring with a real outline (token-based)", () => {
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(read("index.css"))?.[1] || "";
    expect(rule).toMatch(/outline\s*:\s*var\(--eb-focus-ring\)/);
    expect(rule).toMatch(/outline-offset/);
    expect(rule).not.toMatch(/outline\s*:\s*none/);
    expect(read("design-tokens.css")).toMatch(/--eb-focus-ring:\s*2px solid var\(--eb-primary\)/);
  });
  it("the old global App.css override is removed and no stylesheet blanks focus-visible", () => {
    expect(read("App.css")).not.toMatch(/:focus-visible\s*\{[^}]*outline\s*:\s*none/);
    for (const f of CSS_FILES) expect(read(f), f).not.toMatch(/:focus-visible[^{]*\{[^}]*outline\s*:\s*(none|0)\b/);
  });
  it("every remaining outline:none is on the allow-list (equivalent visible focus treatment exists)", () => {
    const allowed = Object.keys(OUTLINE_NONE_ALLOW_LIST).map(norm);
    const found = CSS_FILES.flatMap(f => outlineNoneRules(read(f)).map(sel => f + " → " + sel));
    for (const entry of found) {
      const sel = entry.split(" → ")[1];
      expect(allowed.includes(sel), "unprotected outline:none in " + entry + " — add a visible focus treatment or justify it in OUTLINE_NONE_ALLOW_LIST").toBe(true);
    }
    for (const sel of [".teacher-note-panel textarea", ".select-action select", ".exam-metadata-grid textarea"]) {
      expect(found.some(e => e.endsWith("→ " + sel)), sel + " must keep the canonical ring").toBe(false);
    }
    expect(found.length).toBe(allowed.length);
  });
  it("UX-3 dashboard-pro.css is token-only (--eb-*) outside its shared view-tabs block and never sets outline:none", () => {
    const css = read("dashboard-pro.css");
    const own = css.split("Shared segmented tabs")[0].replace(/\/\*[\s\S]*?\*\//g, "");
    expect(own, "dashboard-pro.css raw hex").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(own, "dashboard-pro.css raw rgb").not.toMatch(/\brgba?\(/);
    for (const m of own.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) expect(m[1], "dashboard-pro.css uses non-canonical token " + m[1]).toMatch(/^--eb-/);
    expect(css).not.toMatch(/outline\s*:\s*(none|0)/);
    expect(css, "shared .analytics-view-tabs block must stay for TeacherPlatform / projects screens").toMatch(/\.analytics-view-tabs\{/);
  });
  it("UX-4 classes & students styles (page-parts.css UX-4 block) are token-only (--eb-*) and never set outline:none", () => {
    const css = read("page-parts.css");
    const marker = "UX-4 — Classes & Students workspace";
    expect(css.includes(marker), "UX-4 block present").toBe(true);
    const own = css.slice(css.indexOf(marker)).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(own, "page-parts.css UX-4 raw hex").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(own, "page-parts.css UX-4 raw rgb").not.toMatch(/\brgba?\(/);
    for (const m of own.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) expect(m[1], "page-parts.css UX-4 uses non-canonical token " + m[1]).toMatch(/^--eb-/);
    expect(own).not.toMatch(/outline\s*:\s*(none|0)/);
    for (const f of ["ui/ui.css"]) expect(read(f)).not.toMatch(/outline\s*:\s*(none|0)/);
  });
  it("UX-5 assignments-pro.css is token-only (--eb-*) and never sets outline:none", () => {
    const css = read("assignments-pro.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css, "assignments-pro.css raw hex").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css, "assignments-pro.css raw rgb").not.toMatch(/\brgba?\(/);
    for (const m of css.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) expect(m[1], "assignments-pro.css uses non-canonical token " + m[1]).toMatch(/^--eb-/);
    expect(css).not.toMatch(/outline\s*:\s*(none|0)/);
  });
  it("UX-6a projects-pro.css is token-only (--eb-*), never sets outline:none and uses only the 768/1024/1280 breakpoints", () => {
    const css = read("projects-pro.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css, "projects-pro.css raw hex").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css, "projects-pro.css raw rgb").not.toMatch(/\brgba?\(/);
    for (const m of css.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) expect(m[1], "projects-pro.css uses non-canonical token " + m[1]).toMatch(/^--eb-/);
    expect(css).not.toMatch(/outline\s*:\s*(none|0)/);
    const widths = [...css.matchAll(/@media[^{]*max-width\s*:\s*(\d+)px/g)].map(m => Number(m[1]));
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect([767, 1023, 1279], "unexpected breakpoint " + w).toContain(w);
  });
  it("UX-6a the legacy project794589.css keeps only student-panel / Reports selectors (no teacher-workspace rules)", () => {
    const css = read("project794589.css").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const forbidden of [".p794-hub", ".p794-kpi", ".p794-class-selector", ".p794-student-card", ".p794-heatmap", ".p794-settings", ".p794-danger", ".p794-analytics", ".p794-tab-bar", ".app-sidebar-group", ".class-program-tag", ".p794-stage-action", ".p794-timeline"]) {
      expect(css, forbidden + " must not remain").not.toContain(forbidden);
    }
    for (const kept of [".p794-bar", ".p794-status-badge", ".p794-stage-row", ".p794-portal-tracks", ".p794-chip", ".p794-muted"]) expect(css, kept + " must stay").toContain(kept);
  });
  it("new UX-2 stylesheets are token-only (--eb-*) with no raw colours", () => {
    for (const f of ["ui/ui.css", "shell.css"]) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css, f + " raw hex").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css, f + " raw rgb").not.toMatch(/\brgba?\(/);
      for (const m of css.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) expect(m[1], f + " uses non-canonical token " + m[1]).toMatch(/^--eb-/);
    }
  });
  it("shell layers stay below the legacy full-screen builder overlays (900 / 1000), which are left untouched", () => {
    const tokens = read("design-tokens.css");
    const z = name => Number(new RegExp(name + ":\\s*(\\d+)").exec(tokens)?.[1]);
    expect(z("--eb-z-nav")).toBeLessThan(900);
    expect(z("--eb-z-drawer")).toBeLessThan(900);
    expect(read("shell.css")).toMatch(/z-index:\s*var\(--eb-z-nav\)/);
    expect(read("shell.css")).toMatch(/z-index:\s*var\(--eb-z-drawer\)/);
    expect(read("App.css")).toMatch(/\.structured-builder-overlay\{[^}]*z-index:900/);
    expect(read("structured-builder.css")).toMatch(/\.sb-preview-overlay\{[^}]*z-index:1000/);
    expect(read("studentexam-pro.css")).toMatch(/\.exam-theme-preview-overlay\{[^}]*z-index:1000/);
  });
  it("closed mobile drawer is removed from keyboard/accessibility interaction; open restores it; desktop sidebar never hidden", () => {
    const css = read("shell.css").replace(/\/\*[\s\S]*?\*\//g, "");
    // isolate the mobile block (brace-balanced) and the rest
    const start = css.indexOf("@media (max-width: 1023px)");
    expect(start).toBeGreaterThan(-1);
    let depth = 0, i = css.indexOf("{", start), end = -1;
    for (; i < css.length; i++) { if (css[i] === "{") depth++; else if (css[i] === "}") { depth--; if (depth === 0) { end = i; break; } } }
    const mobile = css.slice(start, end + 1);
    const outsideMobile = css.slice(0, start) + css.slice(end + 1);
    const rule = sel => { const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}").exec(mobile); return m ? m[1] : ""; };
    const closed = rule(".eb-sidebar");
    expect(closed).toMatch(/visibility\s*:\s*hidden/);
    expect(closed).toMatch(/pointer-events\s*:\s*none/);
    expect(closed).toMatch(/transform\s*:\s*translateX\(100%\)/);   // slide direction kept
    const open = rule(".eb-shell.is-drawer-open .eb-sidebar");
    expect(open).toMatch(/transform\s*:\s*none/);
    expect(open).toMatch(/visibility\s*:\s*visible/);
    expect(open).toMatch(/pointer-events\s*:\s*auto/);
    // the persistent desktop / rail sidebar is never hidden and never aria-hidden
    expect(outsideMobile).not.toMatch(/\.eb-sidebar[^{]*\{[^}]*visibility\s*:\s*hidden/);
    expect(read("shell/TeacherAppShell.tsx")).not.toMatch(/aria-hidden[^>]*\n?\s*className="eb-sidebar/);
    expect(/<aside[^>]*aria-hidden/.test(read("shell/TeacherAppShell.tsx"))).toBe(false);
  });
  it("the teacher shell has no emoji and no phone bottom bar; App.tsx no longer owns projectNavOpen", () => {
    const shell = read("shell/TeacherAppShell.tsx");
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}▸▾]/u.test(shell)).toBe(false);
    expect(read("shell.css")).not.toMatch(/inset-block-end:\s*0/);
    expect(read("App.tsx")).not.toMatch(/projectNavOpen/);
    expect(read("App.tsx")).toMatch(/<TeacherAppShell/);
  });
});

describe("UX-4 membership authority guards", () => {
  const API = join(SRC, "..", "api", "src");
  it("the canonical class-membership predicate is untouched (USER document is membership truth; studentIds is never consulted)", () => {
    const src = readFileSync(join(API, "lib", "class-membership.js"), "utf8");
    expect(src).toContain("function isStudentClassMember(student, classId) {");
    expect(src).toContain('if (student.role !== "student") return false;');
    expect(src).toContain("if (student.archived === true) return false;");
    expect(src).toContain('return String(student.classId || "") === String(classId ?? "");');
    expect(src).not.toMatch(/studentIds/);
    expect(src).not.toMatch(/\.active\b/);
  });
  it("the Classes & Students UI never reads classroom.studentIds and keeps class lifecycle on normalizeClassStatus", () => {
    const files = ["TeacherPlatform.tsx", "students/ClassesPane.tsx", "students/RosterPane.tsx", "students/StudentDialog.tsx", "students/BulkActionBar.tsx", "students/StudentForms.tsx", "students/ActionMenu.tsx", "students/types.ts"];
    for (const f of files) {
      const src = read(f);
      expect(src, f + " must not read studentIds").not.toMatch(/studentIds/);
      expect(src, f + " must not call window.confirm").not.toMatch(/window\.confirm/);
      expect(src, f + " must not use role=tablist").not.toMatch(/role="tablist"/);
    }
    const platform = read("TeacherPlatform.tsx");
    expect(platform).toMatch(/const isActiveClass=\(c:Classroom\)=>normalizeClassStatus\(c\)==="active";/);
    expect(platform).toMatch(/needsAuthoritativeReload\(/);
    expect(platform).toMatch(/selectedClassRef\.current!==classId\)return;/);
  });
});

