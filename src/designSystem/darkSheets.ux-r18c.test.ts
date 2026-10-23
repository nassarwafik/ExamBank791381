// @vitest-environment happy-dom
/// <reference types="node" />
// UX-R18c — the student's pages and the content in the dark theme (docs/enterprise-ux-r0-redesign-foundation.md R18c). These guards pin:
//  1. The audit's scope is every stylesheet under src/: with darkSheets.ux-r18b.test.ts, no sheet leaves a literal that breaks in
//     dark unanswered, and every dark rule reads tokens only.
//  2. No sheet follows the device's colour scheme (the owner's decision): the simulators' former device-dark blocks are dark rules.
//  3. The light islands the plan keeps: the exam paper and its previews, the reader's sepia page, the 3D viewer's scene.
//  4. The audit's R18c rules: island selectors need no answer; a declaration a later token rule of the same sheet overrides needs none.
//  5. The code editor: light on a light ground (the contract of 17F-C1 unchanged), the dark theme on a dark ground, and it follows the
//     switch on a live page.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";
// @ts-expect-error — a plain ES module script, no type declarations
import { auditSheet, darkRulesNotWhere, DARK_SCOPE, DARK, DARK_WHERE } from "../../scripts/ux-dark-audit.mjs";
import { createMonacoEngine, editorThemeFor, type MonacoLike } from "../coding/editor/monacoAdapter";
import { SMARTASSESS_EDITOR_THEME, SMARTASSESS_EDITOR_THEME_DARK } from "../coding/editor/editorOptions";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const flat = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const sheets = (function walk(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p, out); else if (n.endsWith(".css")) out.push(relative(ROOT, p).split(sep).join("/")); }
  return out;
})(join(ROOT, "src"));
type Open = { selectors: string[]; need: string };
const open = (css: string) => (auditSheet(css) as Open[]).map(o => o.need + " " + o.selectors.join(","));

describe("UX-R18c — every sheet in dark", () => {
  it("the audit's scope is every stylesheet under src/", () => {
    expect(sheets.length).toBeGreaterThan(90);
    expect([...(DARK_SCOPE as string[])].sort()).toEqual([...sheets].sort());
  });

  it("every dark answer is written :where(:root[data-theme=\"dark\"]) …: it adds no specificity, so the light theme's own overrides still win", () => {
    for (const f of sheets.filter(f => f !== "src/design-tokens-dark.css")) expect(darkRulesNotWhere(read(f)), f).toEqual([]);
  });

  it("no sheet follows the device's colour scheme: the switch decides", () => {
    for (const f of sheets) expect(read(f), f).not.toMatch(/prefers-color-scheme/);
  });

  it("the simulators' former device-dark blocks are dark rules from tokens", () => {
    expect(flat(read("src/chemistryReactions/rxn.css"))).toContain(`${DARK_WHERE} .rxn-status.is-off { color: var(--eb-danger-tx); }`);
    expect(flat(read("src/functionStudy/function-study.css"))).toContain(`${DARK_WHERE} .fnstudy-saved { color: var(--eb-success-tx); }`);
    expect(flat(read("src/physicsMotion/motion.css"))).toContain(`${DARK_WHERE} .motion-banner { color: var(--eb-warn-tx); }`);
    expect(flat(read("src/chemistryLab/chemLab.css"))).toContain(`${DARK_WHERE} .clab-display { fill: var(--eb-scrim); }`);
  });

  it("the islands stay light: the exam paper, its previews and its question list, the reader's sepia page, the 3D scene", () => {
    const tokens = flat(read("src/design-tokens-dark.css"));
    expect(tokens).toContain(".eb-light-island { color-scheme: light; }");
    expect(tokens).toContain('.interactive-exam-page, .iex-navigator, .i3d-scene, .learning-reader:not(.is-presentation)[data-read-theme="sepia"] .learning-reader-page { color-scheme: light; }');
  });

  it("the CLI terminal stays a dark panel (its ink, --eb-navy, turns light in dark)", () => {
    expect(flat(read("src/learning/cli/cli.css"))).toContain(`${DARK_WHERE} .learning-cli-terminal { background: var(--eb-scrim); color: var(--eb-text); }`);
  });
});

describe("UX-R18c — the audit's island and override rules", () => {
  it("an answer in the :where() form counts; a dark rule outside it is reported", () => {
    expect(open(`.a{background:#f0fdf4} ${DARK_WHERE} .a{background:var(--eb-success-bg)}`)).toEqual([]);
    expect(darkRulesNotWhere(`${DARK} .a{color:var(--eb-text)} ${DARK_WHERE} .b{color:var(--eb-text)}`)).toEqual([`${DARK} .a`]);
  });

  it("a selector rooted in a light island needs no answer; the same literal elsewhere does", () => {
    expect(open(".interactive-exam-page .x{background:#fffbeb}")).toEqual([]);
    expect(open(".exam-theme-classic .iex-card{background:#fffdf7}")).toEqual([]);
    expect(open(".i3d-vertex-target{fill:#fff;stroke:#334155}")).toEqual([]);
    expect(open(".x .interactive-exam-page{background:#fffbeb}")).toEqual(["light background .x .interactive-exam-page"]);
    expect(open(".i3d-hint{background:#fff}")).toEqual(["light background .i3d-hint"]);
  });

  it("a declaration a LATER top-level token rule of the same selector and family overrides needs no answer", () => {
    expect(open(".a{color:white;background:var(--eb-primary)} .a{color:var(--eb-text)}")).toEqual([]);
    expect(open(".a{color:var(--eb-text)} .a{color:white;background:var(--eb-primary)}")).toEqual(["white text on a fill that turns light .a"]);
    expect(open(".a{background:#fff} .a{color:var(--eb-text)}")).toEqual(["light background .a"]);
    expect(open(".a{background:#fff} @media (max-width:600px){ .a{background:var(--eb-surface)} }")).toEqual(["light background .a"]);
    expect(open(".a{background:#fff} .a{background:#fafafa}")).toEqual(["light background .a", "light background .a"]);
  });
});

describe("UX-R18c — the code editor follows its ground", () => {
  type Call = [string, unknown];
  const fake = () => {
    const calls = { defineTheme: [] as Call[], setTheme: [] as string[], create: [] as Record<string, unknown>[] };
    const model = { getValue: () => "", setValue() {}, setEOL() {}, getPositionAt: () => ({ lineNumber: 1, column: 1 }), getOffsetAt: () => 0, getLanguageId: () => "python", dispose() {} };
    const editor = { updateOptions() {}, getModel: () => model, onDidChangeModelContent: () => ({ dispose() {} }), onKeyDown: () => ({ dispose() {} }), onDidBlurEditorWidget: () => ({ dispose() {} }), focus() {}, hasTextFocus: () => false, setPosition() {}, getPosition: () => null, revealPositionInCenterIfOutsideViewport() {}, layout() {}, dispose() {} };
    const monaco: MonacoLike = { editor: { defineTheme: (n, d) => { calls.defineTheme.push([n, d]); }, setTheme: n => { calls.setTheme.push(n); }, createModel: () => model, setModelLanguage() {}, create: (_h, o) => { calls.create.push(o); return editor; } }, KeyCode: { Escape: 9, Tab: 2 } };
    return { calls, monaco };
  };
  const opts = { value: "", languageMode: "python", label: "محرر الكود", readOnly: false, indentUnit: "    ", describedBy: "hint", accept: () => true };
  const withScheme = (scheme: string, fn: () => void) => {
    const real = globalThis.getComputedStyle;
    globalThis.getComputedStyle = ((el: Element) => ({ ...real(el), colorScheme: (el as HTMLElement).dataset?.scheme ?? scheme })) as typeof getComputedStyle;
    try { fn(); } finally { globalThis.getComputedStyle = real; }
  };

  it("light ground: the light theme only, as 17F-C1 pins it", () => {
    const { calls, monaco } = fake(); const host = document.createElement("div"); document.body.append(host);
    createMonacoEngine(monaco).create(host, opts);
    expect(editorThemeFor(host)).toBe(SMARTASSESS_EDITOR_THEME.name);
    expect(calls.defineTheme.map(c => c[0])).toEqual([SMARTASSESS_EDITOR_THEME.name]);
    expect(calls.create[0].theme).toBe("smartassess-light");
    host.remove();
  });

  it("dark ground: the dark theme, registered once; the exam paper's light island stays light", () => {
    withScheme("dark", () => {
      const { calls, monaco } = fake(); const engine = createMonacoEngine(monaco);
      const host = document.createElement("div"); document.body.append(host);
      engine.create(host, opts); engine.create(host, opts);
      expect(calls.create.map(o => o.theme)).toEqual(["smartassess-dark", "smartassess-dark"]);
      expect(calls.defineTheme.filter(c => c[0] === SMARTASSESS_EDITOR_THEME_DARK.name)).toHaveLength(1);
      expect(SMARTASSESS_EDITOR_THEME_DARK.data.base).toBe("vs-dark");
      const island = document.createElement("div"); island.dataset.scheme = "light"; document.body.append(island);
      engine.create(island, opts);
      expect(calls.create[2].theme).toBe("smartassess-light");
      host.remove(); island.remove();
    });
  });

  it("follows the switch on a live page, and stops once released", async () => {
    const { calls, monaco } = fake(); const host = document.createElement("div"); document.body.append(host);
    const handle = createMonacoEngine(monaco).create(host, opts);
    await withSchemeAsync("dark", async () => { document.documentElement.setAttribute("data-theme", "dark"); await Promise.resolve(); await new Promise(r => setTimeout(r, 0)); });
    expect(calls.setTheme).toEqual(["smartassess-dark"]);
    handle.dispose();
    document.documentElement.removeAttribute("data-theme"); await new Promise(r => setTimeout(r, 0));
    expect(calls.setTheme).toEqual(["smartassess-dark"]);
    host.remove();
  });
  async function withSchemeAsync(scheme: string, fn: () => Promise<void>) {
    const real = globalThis.getComputedStyle;
    globalThis.getComputedStyle = ((el: Element) => ({ ...real(el), colorScheme: scheme })) as typeof getComputedStyle;
    try { await fn(); } finally { globalThis.getComputedStyle = real; }
  }
});
