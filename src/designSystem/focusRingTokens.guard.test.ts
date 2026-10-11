/// <reference types="node" />
// Phase 21E.0 — design-system foundation guard: the FOCUS tokens are used with their actual types.
//
// `--eb-focus` is a box-shadow VALUE (`0 0 0 4px rgba(...)`, design-tokens.css). `--eb-focus-ring` is a complete outline
// VALUE (`2px solid var(--eb-primary)`). Before 21E.0, sixteen rules used `--eb-focus` as if it were a COLOUR
// (`outline: 3px solid var(--eb-focus, #…)`, `stroke: var(--eb-focus, …)`, `border: 2px dashed var(--eb-focus, …)`) and one
// nested the whole ring inside another outline (`outline: 3px solid var(--eb-focus-ring, …)`). Because the custom property
// IS defined, `var()` substitutes the shadow value, the declaration becomes invalid at computed-value time, and the
// property falls back to its INITIAL value — `outline-style: none`, `stroke: none`, `border-style: none` — never to the
// hex fallback. Real effect (certified in Chromium by scripts/check-focus-ring-browser-21e0.mjs): keyboard users got no
// focus ring on the coding editor, the inline-cloze inputs, the network CLI terminal, the visual (hotspot / label)
// questions and the AI composer; the selected region, the draft outline, the cursor ring and the resize handle of a
// visual question were invisible. CSS is stubbed under Vitest, so this is a structural guard on the sheets read from disk.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
function cssFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== "node_modules") cssFiles(full, out); }
    else if (name.endsWith(".css")) out.push(full);
  }
  return out;
}
const sheets = cssFiles(SRC).map(f => ({ file: relative(SRC, f).replace(/\\/g, "/"), css: readFileSync(f, "utf8") }));
/** Every `property: value` declaration of a sheet with its 1-based line (comments stripped). */
function declarations(css: string): { prop: string; value: string; line: number }[] {
  const out: { prop: string; value: string; line: number }[] = [];
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
  const re = /([-\w]+)\s*:\s*([^;{}]+)(?=;|\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments))) {
    const line = noComments.slice(0, m.index).split("\n").length;
    out.push({ prop: m[1].trim(), value: m[2].trim(), line });
  }
  return out;
}

describe("21E.0 focus tokens are used with their real types (src/**/*.css)", () => {
  it("the token sheet defines the shadow token and the complete outline ring", () => {
    const tokens = sheets.find(s => s.file === "design-tokens.css")!.css;
    expect(tokens).toMatch(/--eb-focus:\s*0 0 0 4px rgba\(/);
    expect(tokens).toMatch(/--eb-focus-ring:\s*2px solid var\(--eb-primary\)/);
    expect(tokens).toMatch(/--eb-focus-offset:\s*2px/);
  });

  it("`--eb-focus` (a box-shadow value) is never used as a colour — only inside box-shadow", () => {
    const offenders: string[] = [];
    for (const s of sheets) for (const d of declarations(s.css)) {
      if (!/var\(\s*--eb-focus\s*[,)]/.test(d.value)) continue;
      if (d.prop === "box-shadow" || d.prop === "--eb-focus") continue;      // the legit shadow use; a scoped redefinition
      offenders.push(s.file + ":" + d.line + "  " + d.prop + ": " + d.value);
    }
    expect(offenders, "use `outline: var(--eb-focus-ring)` / a colour token instead:\n" + offenders.join("\n")).toEqual([]);
  });

  it("`--eb-focus-ring` (a complete outline) is never nested inside another outline value", () => {
    const offenders: string[] = [];
    for (const s of sheets) for (const d of declarations(s.css)) {
      if (/\b(solid|dashed|dotted)\s+var\(\s*--eb-focus-ring/.test(d.value) || /\d+px\s+var\(\s*--eb-focus-ring/.test(d.value)) offenders.push(s.file + ":" + d.line + "  " + d.prop + ": " + d.value);
    }
    expect(offenders, "write `outline: var(--eb-focus-ring)`:\n" + offenders.join("\n")).toEqual([]);
  });

  it("the interactive surfaces fixed in 21E.0 keep the canonical ring (pins)", () => {
    const pin = (file: string, selector: string) => {
      const s = sheets.find(x => x.file === file)!;
      const rule = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^{]*\\{([^}]*)\\}").exec(s.css);
      expect(rule, file + " keeps a rule for " + selector).toBeTruthy();
      expect(rule![1].replace(/\s+/g, " ")).toMatch(/outline: ?var\(--eb-focus-ring\)/);
    };
    pin("coding/coding.css", ".cx-code-frame:focus-within");
    pin("coding/coding.css", ".cx-code-view:focus-visible");
    pin("coding/codingTemplate.css", ".cx-tpl-input:focus-visible");
    pin("inlineCloze/inlineCloze.css", ".cloze-input:focus-visible");
    pin("networkCli/networkCli.css", ".ncli-terminal:focus-within");
    pin("visual/visual.css", ".vq-marker:focus-visible");
    pin("visual/visual.css", ".vq-overlay[tabindex]:focus-visible");
    pin("aiComposer/ai-composer.css", ".ai-composer-tab:focus-visible");
    pin("presentation/presentation-studio.css", ".xp-studio :focus-visible");
  });

  it("the visual-question selection accents are real colour tokens (selected shape, draft outline, cursor, handle)", () => {
    const css = sheets.find(s => s.file === "visual/visual.css")!.css;
    for (const sel of ['.vq-svg .vq-shape[data-selected="true"]', ".vq-svg .vq-draft", ".vq-cursor", ".vq-handle"]) {
      const rule = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}").exec(css);
      expect(rule, sel).toBeTruthy();
      expect(rule![1]).not.toMatch(/var\(\s*--eb-focus\s*[,)]/);
      expect(rule![1]).toMatch(/var\(--eb-(warn|primary|danger|success|info)\)/);
    }
  });
});
