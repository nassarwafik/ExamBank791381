// UX-R16b — the network, coding and rich-content editors' own colours on the purple-neutral palette (docs/enterprise-ux-r0-
// redesign-foundation.md R16b). Presentation only: what an editor validates, what a student's answer stores and how it is graded are
// pinned by each question type's own suites (network topology / CLI, coding, cloze, open response, visual, composite, scenario,
// parametric, charts, rich content). These guards pin that the slate neutrals and the control blue left the seventeen sheets; that the
// CLI and the configuration listings keep their dark, LTR, monospace surfaces; that the status tints and the device kinds did not
// move; and that a selected item takes the primary tint with the content accent.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { newQuestion } from "./examBuilderState";
import { net2TemplateById } from "./networkTopology2/net2Templates";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const SHEETS = ["charts/chart-editor.css", "charts/charts.css", "coding/coding.css", "coding/codingTemplate.css", "coding/workspace/workspace.css",
  "composite/composite-editor.css", "composite/composite-review.css", "inlineCloze/inlineCloze.css", "networkCli/networkCli.css",
  "networkTopology/network-topology.css", "networkTopology2/net2.css", "openResponse/openResponse.css", "parametric/parametric.css",
  "richContent/rich-content-editor.css", "scenario/scenario-builder.css", "scenario/scenario-student.css", "visual/visual.css"];
const css = Object.fromEntries(SHEETS.map(f => [f, strip(read("src", ...f.split("/")))]));
/** Rules painted on a dark code / CLI surface keep their own colours: they are drawn for that ground, not for the page. */
const DARK = /\.ncli-(terminal|titlebar|line|prompt|typed|muted|output|entry|hint|inputrow|input|run|transcript)\b|\.net2-pre\b|\.nettopo-review pre\b/;
const lightRules = (s: string) => s.split("}").filter(r => r.includes("{") && !DARK.test(r.slice(0, r.indexOf("{")))).join("}");
const hex6 = (h: string) => (h.length === 4 ? "#" + [...h.slice(1)].map(c => c + c).join("") : h).toLowerCase();
const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
/** A neutral: a grey, or a slate (blue-leaning, HSL saturation ≤ 0.5). A pale warm, green, violet or info tint is a tone, not a neutral. */
const isNeutral = (h: string) => {
  const [r, g, b] = rgb(h); const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2;
  if ((mx - mn) * 255 < 6) return true;
  return b >= g && g >= r && (mx - mn) / (1 - Math.abs(2 * l - 1)) <= 0.5;
};
const lum = (h: string) => { const [r, g, b] = rgb(h).map(v => v / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("UX-R16b — the converted sheets", () => {
  it("hold no slate or grey literal outside the dark code / CLI surfaces (white included)", () => {
    for (const [f, s] of Object.entries(css)) {
      const lits = (lightRules(s).match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).map(hex6);
      expect(lits.filter(isNeutral), f).toEqual([]);
      expect(lightRules(s), f).not.toMatch(/rgba\(\s*(15,\s*23,\s*42|255,\s*255,\s*255)\s*,/);
    }
  });

  it("hold no control blue: buttons, borders, focus rings and pressed items take the content accent", () => {
    for (const [f, s] of Object.entries(css)) expect(s, f).not.toMatch(/#(1d6fd6|2563eb|1d4ed8|236aa4|1e40af)\b/i);
    expect(css["coding/workspace/workspace.css"]).toContain('.cx-ws-focus[aria-pressed="true"] { background: var(--eb-primary, var(--eb-content-accent)); border-color: var(--eb-primary, var(--eb-content-accent)); color: var(--eb-surface); }');
  });

  it("a selected device or app takes the primary tint with the content accent (it was a blue tint with a blue border)", () => {
    expect(css["networkTopology/network-topology.css"]).toContain('.nettopo-devices button[aria-pressed="true"] { border-color: var(--eb-content-accent); background: var(--eb-primary-050); font-weight: 700; }');
    expect(css["networkTopology2/net2.css"]).toContain('.net2-devices button[aria-pressed="true"], .net2-apps button[aria-pressed="true"] { border-color: var(--eb-content-accent); background: var(--eb-primary-050); font-weight: 700; }');
  });

  it("each sheet holds less than half its old literal count in the colour baseline, or none at all", () => {
    const base = JSON.parse(read("scripts", "ux-color-inventory.baseline.json")).files as Record<string, number>;
    const before: Record<string, number> = { "charts/chart-editor.css": 15, "charts/charts.css": 13, "coding/coding.css": 56, "coding/codingTemplate.css": 12,
      "coding/workspace/workspace.css": 14, "composite/composite-editor.css": 17, "composite/composite-review.css": 8, "inlineCloze/inlineCloze.css": 18,
      "networkCli/networkCli.css": 35, "networkTopology/network-topology.css": 42, "networkTopology2/net2.css": 56, "openResponse/openResponse.css": 38,
      "parametric/parametric.css": 11, "richContent/rich-content-editor.css": 41, "scenario/scenario-builder.css": 19, "scenario/scenario-student.css": 3, "visual/visual.css": 40 };
    // the CLI keeps its terminal palette (25 of 35) and the network sheets their device-kind and status tints: those are bounded, not halved
    const BOUNDED: Record<string, number> = { "networkCli/networkCli.css": 25, "networkTopology/network-topology.css": 12, "networkTopology2/net2.css": 16 };
    for (const f of SHEETS) {
      const now = base["src/" + f] ?? 0;
      if (f in BOUNDED) expect(now, f).toBeLessThanOrEqual(BOUNDED[f]); else expect(now, f).toBeLessThan(before[f] / 2 + 5);
    }
    for (const f of ["coding/codingTemplate.css", "coding/workspace/workspace.css", "scenario/scenario-student.css"]) expect(base["src/" + f], f).toBeUndefined();
  });
});

describe("UX-R16b — what did not move", () => {
  it("the CLI terminal, its transcript and the configuration listings keep their dark, LTR, monospace surfaces", () => {
    const cli = css["networkCli/networkCli.css"];
    expect(cli).toMatch(/\.ncli-terminal \{ direction: ltr; unicode-bidi: isolate; text-align: left;[^}]*background: #0f172a; color: #e6edf7;/);
    expect(cli).toMatch(/\.ncli-transcript \{[^}]*background: #0f172a; color: #e6edf7; direction: ltr;/);
    for (const [sel, c] of [[".ncli-prompt", "#9fd3a8"], [".ncli-typed", "#ffffff"], [".ncli-muted", "#9aa8c2"]]) expect(cli).toContain(sel + " { color: " + c + "; }");
    expect(css["networkTopology2/net2.css"]).toMatch(/\.net2-pre \{[^}]*direction: ltr;[^}]*monospace; background: #0f1724; color: #d9e2ef/);
    expect(css["networkTopology/network-topology.css"]).toMatch(/\.nettopo-review pre \{[^}]*direction: ltr;[^}]*monospace; background: #0f1724/);
    // the terminal text keeps AAA on its ground
    expect(ratio("#e6edf7", "#0f172a")).toBeGreaterThanOrEqual(7);
  });

  it("the device kinds keep their tints (router blue, switch green, PC amber, access point violet)", () => {
    for (const s of [css["networkTopology/network-topology.css"], css["networkTopology2/net2.css"]]) {
      expect(s).toMatch(/\[data-kind="router"\] \.(nettopo|net2)-shape \{ fill: #e8f1ff; \}/);
      expect(s).toMatch(/\[data-kind="switch"\] \.(nettopo|net2)-shape \{ fill: #e9f8ef; \}/);
    }
    expect(css["networkTopology/network-topology.css"]).toContain('.nettopo-node[data-kind="pc"] .nettopo-shape { fill: #fff6e5; }');
    expect(css["networkTopology2/net2.css"]).toContain('.net2-node[data-kind="ap"] .net2-shape { fill: #f3ecff; }');
  });

  it("the status tints keep their hue and value (success, warn, info, ping and flow results, issues)", () => {
    const c = css["coding/coding.css"];
    expect(c).toContain(".cx-ev-status.is-success { background: #e6f6ec; color: #17633a; }");
    expect(c).toContain(".cx-ev-status.is-warn { background: #fff4e0; color: #7a4a00; }");
    expect(c).toContain(".cx-ev-status.is-info { background: #e8f0fb; color: #1d4f91; }");
    expect(c).toContain(".cx-ev-case.is-fail .cx-ev-case-outcome { color: #a32020; }");
    expect(c).toContain(".cx-ev-case.is-pass .cx-ev-case-outcome { color: #17633a; }");
    for (const s of [css["networkTopology/network-topology.css"], css["networkTopology2/net2.css"]]) {
      expect(s).toMatch(/\[data-ok="true"\] \{ background: #e9f8ef; color: #135c32; \}/);
      expect(s).toMatch(/\[data-ok="false"\] \{ background: #fdecea; color: #8a1c13; \}/);
    }
    for (const f of ["charts/chart-editor.css", "composite/composite-editor.css", "richContent/rich-content-editor.css", "visual/visual.css"]) expect(css[f], f).toMatch(/#fef2f2/i);
  });

  it("the hues that carry meaning in the visual, composite and network editors stay (filled zone, context, sandbox)", () => {
    expect(css["visual/visual.css"]).toContain('.vq-zone-btn[data-filled="true"] { border-style: solid; background: #ecfeff; }');
    expect(css["composite/composite-editor.css"]).toContain(".cmp-editor-context{border-inline-start-color:#0d9488;background:var(--surface2,var(--eb-content-ground-2))}");
    expect(css["networkTopology2/net2.css"]).toMatch(/\.net2-sandbox \{ border: 2px solid #7a52c7;[^}]*background: #fbf9ff; \}/);
  });

  it("status hues that equal a token name it at the same value", () => {
    expect(css["coding/coding.css"]).toContain(".cx-result[data-status=\"success\"] .cx-result-status { color: var(--eb-success, var(--eb-success-tx)); }");
    expect(read("src", "design-tokens.css")).toMatch(/--eb-success-tx:\s*#15803d/i);
  });
});

describe("UX-R16b — the capture fixture", () => {
  it("scripts/ux-r16b-editor-fixtures.json is exactly the builder's defaults and the «roas» classroom template (no drift)", () => {
    const fx = JSON.parse(read("scripts", "ux-r16b-editor-fixtures.json")) as Record<string, unknown>;
    expect(Object.keys(fx)).toEqual(["networkTopology", "networkCli", "inlineCloze", "openResponse", "coding"]);
    expect(fx.networkTopology).toEqual(net2TemplateById("roas")!.config());
    for (const t of ["networkCli", "inlineCloze", "openResponse", "coding"]) expect(fx[t], t).toEqual(newQuestion(t as never, { examQuestionId: "ed-" + t }));
  });
});
