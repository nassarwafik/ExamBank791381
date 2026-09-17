import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
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
    for (const kept of [".p794-bar", ".p794-status-badge", ".p794-stage-row", ".p794-portal-tracks"]) expect(css, kept + " must stay").toContain(kept);
  });
  it("UX-6b reports-pro.css is token-only (--eb-*), never sets outline:none and uses only the 768/1024/1280 breakpoints; the legacy reports.css and the residual .p794-chip/.p794-muted are gone", () => {
    const css = read("reports-pro.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css, "reports-pro.css raw hex").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css, "reports-pro.css raw rgb").not.toMatch(/\brgba?\(/);
    for (const m of css.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) expect(m[1], "reports-pro.css uses non-canonical token " + m[1]).toMatch(/^--eb-/);
    expect(css).not.toMatch(/outline\s*:\s*(none|0)/);
    const widths = [...css.matchAll(/@media[^{]*max-width\s*:\s*(\d+)px/g)].map(m => Number(m[1]));
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect([767, 1023, 1279], "unexpected breakpoint " + w).toContain(w);
    expect(CSS_FILES).not.toContain("reports.css");
    const legacy = read("project794589.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(legacy).not.toContain(".p794-chip"); expect(legacy).not.toContain(".p794-muted");
    for (const kept of [".p794-bar", ".p794-status-badge", ".p794-stage-row", ".p794-portal-tracks"]) expect(legacy, kept + " must stay").toContain(kept);
  });
  it("UX-7a studentportal-pro.css is mobile-first (min-width 768/1024/1280 only), token-only (--eb-*), never sets outline:none; ui.css carries the ProgressRing; the legacy portal rules left platform.css", () => {
    const css = read("studentportal-pro.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css, "studentportal-pro.css raw hex").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css, "studentportal-pro.css raw rgb").not.toMatch(/\brgba?\(/);
    for (const m of css.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) expect(m[1], "studentportal-pro.css uses non-canonical token " + m[1]).toMatch(/^--eb-/);
    expect(css).not.toMatch(/outline\s*:\s*(none|0)/);
    expect(css).not.toMatch(/max-width\s*:\s*\d+px/);                                   // mobile-first: base = phone, min-width enhances
    const widths = [...css.matchAll(/@media[^{]*min-width\s*:\s*(\d+)px/g)].map(m => Number(m[1]));
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect([768, 1024, 1280], "unexpected breakpoint " + w).toContain(w);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).not.toMatch(/margin-(left|right)|padding-(left|right)|border-(left|right)\b/);   // logical properties only
    expect(read("design-tokens.css")).toMatch(/--eb-medal-gold:\s*#eab308/);
    const ui = read("ui/ui.css");
    expect(ui).toMatch(/\.eb-ring-fill\s*\{[^}]*stroke-dashoffset/);
    expect(ui).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.eb-ring-fill\s*\{\s*transition:\s*none/);
    const legacy = read("platform.css").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const gone of [".avatar-picker-overlay", ".avatar-picker-modal", ".student-stat-grid", ".student-main-grid", ".student-empty-state", ".student-welcome-card", ".student-assignment-card", ".student-assignment-list", ".achievement-feed-item", ".achievement-share-toggle", ".achievement-teacher-note", ".student-latest-score", ".student-medal-row", ".student-code-chip", ".student-next-panel"]) {
      expect(legacy, gone + " must no longer be styled by platform.css").not.toContain(gone);
    }
    for (const kept of [".student-portal", ".student-topbar", ".student-panel", ".achievement-reaction", ".achievement-notify-card", ".student-assignment-header", ".platform-hero"]) expect(legacy, kept + " must stay").toContain(kept);
  });
  it("UX-7b-1 studentexam-pro.css is phone-first (min-width 768/1024/1280 only, no max-width), token-only outside the documented theme section, never sets outline:none; the superseded exam-runtime rules left platform.css", () => {
    const full = read("studentexam-pro.css");
    const own = full.split("Exam presentation themes")[0].replace(/\/\*[\s\S]*?\*\//g, "");
    expect(own, "studentexam-pro.css raw hex").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(own, "studentexam-pro.css raw rgb").not.toMatch(/\brgba?\(/);
    for (const m of own.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) expect(m[1], "studentexam-pro.css uses non-canonical token " + m[1]).toMatch(/^--eb-/);
    expect(full.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/outline\s*:\s*(none|0)/);
    expect(own).not.toMatch(/@media[^{]*max-width\s*:\s*\d+px/);
    const widths = [...own.matchAll(/@media[^{]*min-width\s*:\s*(\d+)px/g)].map(m => Number(m[1]));
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect([768, 1024, 1280], "unexpected breakpoint " + w).toContain(w);
    expect(own).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(own).toMatch(/\.iex-option:has\(input:focus-visible\)[^{]*\{[^}]*outline:var\(--eb-focus-ring\)/);   // visible keyboard focus on the option row
    // phone ergonomics: ≥44 px controls, comfortable textarea, 48 px footer/gate actions, contained tables, wrapped prose, safe area
    expect(own).toMatch(/\.iex-open, \.iex-cell, \.iex-cell-select, \.iex-seq select, \.iex-seq input\{[^}]*min-height:44px/);
    expect(own).toMatch(/\.iex-option\{[^}]*min-height:48px/);
    expect(own).toMatch(/\.iex-foot-actions \.eb-button\{ min-height:48px/);
    expect(own).toMatch(/\.iex-details-toggle\{[^}]*min-height:44px/);
    expect(own).toMatch(/\.iex-open\{ min-height:140px/);
    expect(own).toMatch(/\.iex-table-wrap\{ overflow-x:auto; max-width:100%/);
    expect(own).toMatch(/\.iex-qtext\{[^}]*overflow-wrap:anywhere/);
    expect(own).toMatch(/\.iex-cli\{[^}]*direction:ltr[^}]*overflow-x:auto/);
    expect(own).toMatch(/\.iex-foot\{[^}]*env\(safe-area-inset-bottom/);
    expect(own).toMatch(/prefers-reduced-motion: reduce\)\{\s*\.iex-countdown\.danger\{ animation:none; \}/);
    expect(own).not.toMatch(/(?<![a-z-])(margin|padding|border)-(left|right)\b/);                    // logical properties only
    // the theme section may carry only the two documented contract colours (classic paper tint); everything else is tokens
    const themes = full.split("Exam presentation themes")[1].replace(/\/\*[\s\S]*?\*\//g, "");
    expect([...themes.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0])).toEqual(["#fffdf7"]);
    expect(full).toMatch(/\.exam-theme-preview-overlay\{[^}]*z-index:1000/);                    // layer contract kept
    const legacy = read("platform.css").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const gone of [".interactive-exam-page{", ".iex-head", ".iex-foot", ".iex-option", ".iex-countdown", ".iex-progress", ".iex-open", ".iex-start", ".iex-result-card", ".iex-card {", ".iex-node {"]) {
      expect(legacy, gone + " must no longer be styled by platform.css").not.toContain(gone);
    }
    for (const kept of [".iex-grade-final", ".iex-grade-pending", ".iex-general-instructions", ".assignment-results-panel", ".review-state"]) expect(legacy, kept + " must stay").toContain(kept);
  });
  it("UX-7b-2 studentexam-pro.css: sticky bottom navigation with safe-area padding, 48 px Previous/Next and navigator controls, keyboard scroll margins, review/navigator states — token-only, phone-first, no max-width, no outline:none", () => {
    const full = read("studentexam-pro.css");
    const own = full.split("Exam presentation themes")[0].replace(/\/\*[\s\S]*?\*\//g, "");
    expect(own).toMatch(/\.iex-bottom-nav\{[^}]*position:sticky;[^}]*inset-block-end:0;[^}]*z-index:var\(--eb-z-sticky\)/);
    expect(own).toMatch(/\.iex-bottom-nav\{[^}]*env\(safe-area-inset-bottom/);
    expect(own).toMatch(/\.iex-bottom-nav \.eb-button\{ min-height:48px; min-width:44px/);
    expect(own).toMatch(/\.iex-nav-trigger\.eb-button\{[^}]*min-height:44px/);
    expect(own).toMatch(/\.iex-nav-q\{[^}]*min-height:56px/);
    expect(own).toMatch(/\.iex-nav-grid\{ display:grid; grid-template-columns:repeat\(auto-fill,minmax\(72px,1fr\)\)/);
    expect(own).toMatch(/\.iex-review-actions \.eb-button\{ min-height:48px/);
    // virtual keyboard safety: content padding above the bar + scroll margins on every answer control and the heading
    expect(own).toMatch(/\.iex-page\{[^}]*padding-block-end:var\(--eb-space-6\)/);
    expect(own).toMatch(/\.iex-page \.iex-open, \.iex-page \.iex-cell, \.iex-page \.iex-cell-select, \.iex-page \.iex-seq select, \.iex-page \.iex-seq input, \.iex-page \.iex-cli-input, \.iex-page \.iex-tf-select, \.iex-page \.iex-option\{ scroll-margin-block-end:96px; scroll-margin-block-start:72px; \}/);
    expect(own).toMatch(/\.iex-page-heading\{[^}]*scroll-margin-block-start:72px/);
    expect(own).toMatch(/\.iex-review-title\{[^}]*scroll-margin-block-start:72px/);
    // states are visible text + border/background tokens, and keyboard focus is visible on nav buttons and headings
    for (const st of [".iex-nav-q.is-answered{", ".iex-nav-q.is-unanswered{", ".iex-nav-q.is-current{", ".iex-nav-q:focus-visible{ outline:var(--eb-focus-ring)", ".iex-page-heading:focus-visible{ outline:var(--eb-focus-ring)", ".iex-review-title:focus-visible{ outline:var(--eb-focus-ring)", ".iex-section-context.is-first{", ".iex-review-stats > div.is-warn{"]) expect(own, st).toContain(st);
    // the focus-theme helpers stay only for the teacher preview; the student runtime has no separate focus tree
    expect(own).toContain(".iex-focus-nav{");
    // phone-first invariants re-asserted on the extended sheet
    expect(own, "raw hex").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(own, "raw rgb").not.toMatch(/\brgba?\(/);
    for (const m of own.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) expect(m[1]).toMatch(/^--eb-/);
    expect(own).not.toMatch(/@media[^{]*max-width\s*:\s*\d+px/);
    expect(full.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/outline\s*:\s*(none|0)/);
    expect(own).not.toMatch(/(?<![a-z-])(margin|padding|border)-(left|right)\b/);
    expect(own).not.toMatch(/position:\s*fixed/);                                                       // sticky, never viewport-fixed over inputs
    expect(own).not.toMatch(/visualViewport/);
  });
  it("UX-8a: phone touch targets (≥ 44 px) only under max-width 767px with desktop sizes unchanged, dvh fallbacks after the vh lines, and bidi isolation on free-text exam cells", () => {
    const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, "");
    const phoneBlock = (css, marker) => {
      const i = css.indexOf(marker); expect(i, "phone block " + marker).toBeGreaterThan(-1);
      let depth = 0, j = css.indexOf("{", i), end = -1;
      for (; j < css.length; j++) { if (css[j] === "{") depth++; else if (css[j] === "}") { depth--; if (depth === 0) { end = j; break; } } }
      return css.slice(i, end + 1);
    };
    // ui.css — the shared primitives: desktop values untouched, phone block raises them
    const ui = strip(read("ui/ui.css"));
    expect(ui).toMatch(/\.eb-icon-button \{[^}]*min-width: 40px; min-height: 40px;/);
    expect(ui).toMatch(/\.eb-button\.is-small \{ min-height: 34px;/);
    const uiPhone = ui.split("@media (max-width: 767px)").slice(1).join("\n");
    expect(uiPhone).toMatch(/\.eb-icon-button \{ min-width: 44px; min-height: 44px; \}/);
    expect(uiPhone).toMatch(/\.eb-button\.is-small \{ min-height: 44px; \}/);
    expect(uiPhone).toMatch(/\.eb-chip-button \{ min-height: 44px; \}/);
    // page-parts.css — segmented / menu / sortable headers
    const pp = strip(read("page-parts.css"));
    expect(pp).toMatch(/\.eb-segmented > button\{[^}]*min-height:34px/);
    expect(pp).toMatch(/\.eb-menu-trigger\{[^}]*min-width:36px; min-height:36px/);
    const ppPhone = phoneBlock(pp, "@media (max-width:767px)");
    for (const rule of [".eb-segmented > button{ min-height:44px; }", ".eb-menu-trigger{ min-width:44px; min-height:44px; }", ".eb-menu-item{ min-height:44px; }", ".eb-th-sort{ min-height:44px;"]) expect(ppPhone, rule).toContain(rule);
    // assignments-pro.css — gradebook chips
    const ap = strip(read("assignments-pro.css"));
    expect(ap).toMatch(/\.gradebook-chip,\.library-cat-chip\{[^}]*min-height:32px/);
    expect(phoneBlock(ap, "@media (max-width:767px)")).toContain(".gradebook-chip,.library-cat-chip{ min-height:44px; }");
    // dashboard-pro.css — toolbar + segmented
    const dp = strip(read("dashboard-pro.css"));
    expect(dp).toMatch(/\.eb-toolbar-button\{[^}]*min-height:40px/);
    expect(phoneBlock(dp, "@media (max-width:767px)")).toContain(".eb-toolbar-button,.analytics-segmented button{ min-height:44px; }");
    // studentportal-pro.css is phone-first (min-width only): 44 px base, 32 px from 768 px
    const sp = strip(read("studentportal-pro.css"));
    expect(sp).toMatch(/\.eb-sp-reaction\{ min-height:44px;/);
    expect(phoneBlock(sp, "@media (min-width: 768px)")).toContain(".eb-sp-reaction{ min-height:32px; }");
    expect(sp).not.toMatch(/@media[^{]*max-width/);
    // no min-height below 44 px was introduced into any phone block of the teacher sheets
    for (const [name, css] of [["page-parts.css", pp], ["assignments-pro.css", ap], ["dashboard-pro.css", dp]]) {
      const block = phoneBlock(css, "@media (max-width:767px)");
      for (const m of block.matchAll(/min-height:\s*(\d+)px/g)) expect(Number(m[1]), name + " phone block").toBeGreaterThanOrEqual(44);
    }
    // dvh fallbacks: the vh declaration stays and the dvh one follows it
    const rp = strip(read("review-pro.css"));
    expect(rp).toContain(".review-modal{ max-height:calc(100vh - 48px); max-height:calc(100dvh - 48px);");
    expect(rp).toContain(".review-modal{ max-height:calc(100vh - 16px); max-height:calc(100dvh - 16px); }");
    const sh = strip(read("shell.css"));
    const drawer = phoneBlock(sh, "@media (max-width: 1023px)");
    expect(drawer).toMatch(/height: 100vh;\s*height: 100dvh;/);
    expect((sh.match(/100dvh/g) || []).length).toBe(1);                                                // drawer only, no mass rewrite
    // bidi isolation on free-text answer cells; CLI stays LTR
    const ex = strip(read("studentexam-pro.css"));
    expect(ex).toContain(".iex-cell, .iex-seq input{ unicode-bidi:plaintext; }");
    expect(ex).toMatch(/\.iex-cli\{[^}]*direction:ltr/);
    expect(ex).not.toMatch(/\.iex-cli[^{]*\{[^}]*unicode-bidi/);
    expect(ex).not.toMatch(/outline\s*:\s*(none|0)/);
  });
  it("UX-8b contrast: --eb-faint is unchanged but no longer colours real text; the fixed text/background pairs meet 4.5:1 (dependency-free WCAG maths); focus ring keeps 3:1", () => {
    const tokens = read("design-tokens.css");
    const token = name => { const m = new RegExp(name + ":\\s*(#[0-9a-fA-F]{6})").exec(tokens); expect(m, name).toBeTruthy(); return m[1]; };
    const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
    expect(token("--eb-faint")).toBe("#94a3b8");                                                    // owner decision: the token itself is NOT darkened
    const faint = token("--eb-faint"), muted = token("--eb-muted"), text = token("--eb-text"), surface = token("--eb-surface"), surface2 = token("--eb-surface-2"), bg = token("--eb-bg"), primary = token("--eb-primary"), dangerTx = token("--eb-danger-tx");
    expect(ratio(faint, surface)).toBeLessThan(4.5);                                                 // why faint may not colour normal text
    expect(ratio(muted, surface)).toBeGreaterThanOrEqual(4.5);                                       // the replacement on cards
    expect(ratio(muted, surface2)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(muted, bg)).toBeLessThan(4.5);                                                      // why status lines on the page background use text-secondary
    expect(ratio(text, bg)).toBeGreaterThanOrEqual(4.5);                                             // --eb-text-secondary aliases --eb-text
    expect(tokens).toMatch(/--eb-text-secondary:\s*var\(--eb-text\)/);
    expect(ratio(dangerTx, surface)).toBeGreaterThanOrEqual(4.5);                                    // .eb-field-error
    expect(ratio(primary, surface)).toBeGreaterThanOrEqual(3);                                       // focus ring (non-text)
    // real-text selectors that used --eb-faint before UX-8b now use --eb-muted; decorative uses keep faint
    const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = (css, selector) => { const i = css.indexOf(selector); expect(i, selector).toBeGreaterThan(-1); return css.slice(i, css.indexOf("}", i)); };
    const ui = strip(read("ui/ui.css")), pp = strip(read("page-parts.css")), ap = strip(read("assignments-pro.css")), dp = strip(read("dashboard-pro.css")), pr = strip(read("projects-pro.css")), lg = strip(read("login-pro.css"));
    for (const [css, sel] of [[ui, ".eb-stat-hint {"], [pp, ".eb-chip.is-muted{"], [pp, ".eb-menu-label{"], [pp, ".student-row-archived td{"], [pp, ".never-login{"], [pp, ".medal-badge small{"], [pr, ".eb-stage-optional{"], [ap, ".eb-assign-row-due{"], [ap, ".eb-gradebook-table td .result-code{"], [ap, ".eb-source-card-text small{"], [dp, ".eb-dash-scope span{"], [dp, ".eb-attention-more{"], [dp, ".analytics-empty-chart,.analytics-loading{"], [dp, ".analytics-table td small{"], [dp, ".analytics-improvers small{"]]) {
      const r = rule(css, sel);
      expect(r, sel).toContain("var(--eb-muted)");
      expect(r, sel).not.toContain("var(--eb-faint)");
    }
    expect(rule(ui, ".eb-breadcrumb-sep {")).toContain("var(--eb-faint)");                          // decorative separator keeps faint
    expect(rule(lg, ".auth-note{")).toContain("var(--lg-muted)");
    expect(rule(lg, ".auth-input input::placeholder{")).toContain("var(--lg-muted)");
    expect(rule(pp, '.eb-muted[role="status"]{')).toContain("var(--eb-text-secondary)");
    expect(rule(strip(read("studentportal-pro.css")), ".eb-sp-status{")).toContain("var(--eb-text-secondary)");
    expect(rule(strip(read("studentexam-pro.css")), ".iex-loading{")).toContain("var(--eb-text-secondary)");
    expect(rule(ui, ".eb-field-error {")).toContain("var(--eb-danger-tx)");
    // the medal colours colour icons only (aria-hidden svg), never text — left as they are
    expect(rule(strip(read("studentportal-pro.css")), ".eb-sp-medal.is-gold{")).toContain("var(--eb-medal-gold)");
  });
  it("UX-8b reduced motion: dashboard-pro, assignments-pro, page-parts and platform sheets now switch their transitions/animations off under prefers-reduced-motion; review-pro has no motion; existing blocks untouched", () => {
    const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, "");
    const block = css => { const i = css.indexOf("@media (prefers-reduced-motion: reduce)"); expect(i).toBeGreaterThan(-1); let d = 0, j = css.indexOf("{", i); for (; j < css.length; j++) { if (css[j] === "{") d++; else if (css[j] === "}") { d--; if (d === 0) break; } } return css.slice(i, j + 1); };
    const dp = strip(read("dashboard-pro.css"));
    expect(block(dp)).toContain(".eb-toolbar-button,.analytics-segmented button,.eb-attention-item,.eb-chart-picker-item,.analytics-view-tab{ transition:none; }");
    const ap = strip(read("assignments-pro.css"));
    expect(block(ap)).toContain(".eb-assign-row,.gradebook-chip,.library-cat-chip,.library-item{ transition:none; }");
    const pp = strip(read("page-parts.css"));
    expect(block(pp)).toContain(".class-row,.eb-class-row,.eb-segmented > button,.eb-menu-trigger,.eb-search-field{ transition:none; }");
    const pl = strip(read("platform.css"));
    expect(block(pl)).toMatch(/\.teacher-platform-inner, \.analytics-card \{ animation: none; \}/);
    expect(block(pl)).toMatch(/\.teacher-workspace-nav button, \.students-table tbody tr, \.analytics-table tbody tr, \.platform-primary \{ transition: none; \}/);
    // every transition/animation selector of these sheets is covered by their reduce block
    for (const [name, css] of [["dashboard-pro.css", dp], ["assignments-pro.css", ap], ["page-parts.css", pp], ["platform.css", pl]]) {
      const b = block(css);
      const owners = [];
      const re = /([^{}]+)\{([^}]*)\}/g; let m;
      while ((m = re.exec(css))) if (/(^|;)\s*(transition|animation)\s*:/.test(m[2]) && !/animation\s*:\s*none/.test(m[2]) && !m[1].includes("@")) owners.push(m[1].trim().split(",").map(x => x.trim()));
      for (const group of owners) for (const sel of group) expect(b, name + " must cover " + sel).toContain(sel);
    }
    expect(strip(read("review-pro.css"))).not.toMatch(/transition\s*:|animation\s*:/);            // nothing to cover
    // the legacy builder scrolling in App.tsx is untouched by UX-8b
    const app = read("App.tsx");
    expect((app.match(/scrollIntoView\(/g) || []).length).toBe(8);
    expect(app).not.toMatch(/scrollIntoView\([^)]*reducedMotion/);
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


// Final Acceptance — manual-test blocker fixes (class card hit area + ActionMenu event ordering). happy-dom does no
// pointer hit-testing, so the stretched hit area is proven here from the stylesheet; the ActionMenu contract is
// proven from source (bubble-phase close, never a capture-phase close that unmounts the item mid-dispatch).
describe("Final acceptance — class card hit area and ActionMenu ordering", () => {
  const css = norm(read("page-parts.css"));
  it("the native class select button stretches an empty pseudo-element over the whole row (li is the containing block)", () => {
    expect(css).toMatch(/\.eb-class-row\{ position:relative;/);
    expect(css).toMatch(/\.eb-class-select::before\{ content:""; position:absolute; inset:0; border-radius:inherit; \}/);
  });
  it("the ⋯ actions column is layered above the hit area so the trigger never selects the class", () => {
    expect(css).toMatch(/\.eb-class-menu\{ position:relative; z-index:1; \}/);
    const pane = read("students/ClassesPane.tsx");
    expect(pane).toMatch(/<button type="button" className="eb-class-select" aria-pressed=\{selected\} onClick=\{\(\) => p\.onSelect\(classroom\.classId\)\}>/);
    expect(pane).not.toMatch(/<li[^>]*onClick/);                       // never an event handler on the <li>
    expect(pane).not.toMatch(/role="button"/);                          // never a fake button
  });
  it("ActionMenu closes in the bubble phase after the activated control's handler, never in the capture phase", () => {
    const menu = read("ui/ActionMenu.tsx");
    expect(menu).not.toMatch(/onClickCapture=\{/);                     // no capture-phase close prop (the comment may name the old one)
    expect(menu).toMatch(/onClick=\{onPanelClick\}/);
    expect(menu).toMatch(/if \(el\.closest\("button, input"\)\) close\(true\);/);
  });
  it("ActionMenu (global first click): the portal is fixed from its first frame, positioned before it is revealed, and the first control is focused with preventScroll", () => {
    const menu = read("ui/ActionMenu.tsx");
    expect(menu).toMatch(/createPortal\(/);                                                   // still portalled into document.body
    expect(menu).toMatch(/document\.body\s*\)/);
    expect(menu).toMatch(/const MEASURING: CSSProperties = \{ position: "fixed", top: 0, right: 0, visibility: "hidden", pointerEvents: "none" \};/);
    expect(menu).toMatch(/placement \? \{ position: "fixed", top: placement\.top, right: placement\.right, maxHeight: placement\.maxHeight \} : MEASURING/);
    expect(menu).not.toMatch(/useState<CSSProperties>\(\{\}\)/);                              // never an in-flow first frame
    expect(menu).toMatch(/el\.focus\(\{ preventScroll: true \}\)/);
    expect(menu).toMatch(/if \(!ready\) return;\n\s*const first = panelRef\.current\?\.querySelector/);   // focus only once positioned
    expect(menu).toMatch(/window\.addEventListener\("scroll", onLayout, true\)/);                 // a genuine scroll after opening still closes
    expect(menu).toMatch(/window\.addEventListener\("resize", onLayout\)/);
    expect(menu).toMatch(/document\.addEventListener\("mousedown", onPointer\)/);
  });
  it("no feature-specific ActionMenu fork exists: every consumer imports the shared primitive", () => {
    const walk = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const files = walk(SRC).filter(f => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
    const importers = files.filter(f => /import ActionMenu from "[^"]*ActionMenu"/.test(readFileSync(f, "utf8")) || /export \{ default \} from "\.\.\/ui\/ActionMenu"/.test(readFileSync(f, "utf8")));
    const definers = files.filter(f => /export default function ActionMenu\(/.test(readFileSync(f, "utf8")));
    expect(definers.map(f => f.replace(SRC, "src"))).toEqual(["src/ui/ActionMenu.tsx"]);
    expect(importers.map(f => f.replace(SRC, "src")).sort()).toEqual([
      "src/AssignmentsPanel.tsx", "src/assignments/AssignmentList.tsx", "src/assignments/Gradebook.tsx",
      "src/projects/ProjectStudentDetail.tsx", "src/projects/ProjectTracker.tsx",
      "src/students/ActionMenu.tsx", "src/students/ClassesPane.tsx", "src/students/RosterPane.tsx"
    ]);
  });
});
