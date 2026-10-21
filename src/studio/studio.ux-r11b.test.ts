// UX-R11b — the Exam Studio, «امتحاناتي» and the builder page's setup zone in the reference look
// (docs/enterprise-ux-r0-redesign-foundation.md R11b). Presentation only: markup, roles and behaviour are pinned by the 21F.2–21F.9
// studio suites, and studio.css's structure (token block first, every rule scoped, logical sides, 44 px coarse targets, focus ring,
// reduced motion, AA brand pairs) by studioDesign.21f2. These guards pin what R11b changes: the studio tokens name canonical --eb-*
// tokens (no literal colour is left in the sheet), the UX-R11b blocks at the end of studio.css and builder-pro.css, and the phone
// fix (the create tiles stay inside «امتحاناتي»).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", ...p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const studioSrc = read("studio", "studio.css"), builderSrc = read("builder-pro.css");
const studio = strip(studioSrc);
const tokenBlock = studio.slice(studio.indexOf(".st-studio, .st-home, .st-drawer {"), studio.indexOf("}"));
const block = (src: string) => strip(src.slice(src.lastIndexOf("/*", src.indexOf("UX-R11b — the"))));
const studioBlock = block(studioSrc), builderBlock = block(builderSrc);
/** The declarations of the rule whose selector list is exactly `sel` (at a line start) inside a block. */
const rule = (body: string, sel: string) => {
  const m = body.match(new RegExp("\\n" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s?\\{"));
  expect(m, "rule " + sel).not.toBeNull();
  const i = body.indexOf(m![0]) + m![0].length;
  return body.slice(i, body.indexOf("}", i)).trim();
};
const token = (name: string) => tokenBlock.match(new RegExp("--" + name + ":\\s*([^;]+);"))?.[1].trim();

describe("UX-R11b — the fix: «امتحاناتي» lets its create tiles shrink on a phone", () => {
  it("the home's single grid track may shrink below its content, and the rule comes after the 520 px block", () => {
    const home = rule(studioBlock, ".st-home");
    expect(home).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(studioSrc.indexOf("UX-R11b — the Exam Studio")).toBeGreaterThan(studioSrc.lastIndexOf("@media (max-width: 520px)"));
  });
});

describe("UX-R11b — the studio palette", () => {
  it("the bar is white with heading text, the accent is the primary family, the canvas is the page background", () => {
    expect(token("st-top")).toBe("var(--eb-surface)");
    expect(token("st-top-tx")).toBe("var(--eb-text-heading)");
    expect(token("st-top-mute")).toBe("var(--eb-muted)");
    expect(token("st-teal")).toBe("var(--eb-primary)");
    expect(token("st-teal-050")).toBe("var(--eb-primary-050)");
    expect(token("st-teal-tx")).toBe("var(--eb-primary-strong)");
    expect(token("st-canvas")).toBe("var(--eb-bg)");
  });

  it("cards rest flat (no shadow) and the active card keeps a 3 px primary ring", () => {
    expect(token("st-card-sh")).toBe("none");
    expect(token("st-card-sh-hover")).toBe("none");
    expect(token("st-card-sh-active")).toBe("0 0 0 3px var(--eb-primary-050)");
  });

  it("no literal colour is left anywhere in studio.css (it leaves the colour baseline at 0)", () => {
    expect(studio).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    expect(JSON.parse(readFileSync(path.join(process.cwd(), "scripts", "ux-color-inventory.baseline.json"), "utf8")).files["src/studio/studio.css"]).toBeUndefined();
  });
});

describe("UX-R11b — the studio blocks", () => {
  it("each is the last thing in its sheet and appears once", () => {
    for (const src of [studioSrc, builderSrc]) expect(src.indexOf("UX-R11b — the")).toBe(src.lastIndexOf("UX-R11b — the"));
    expect(studioSrc.indexOf("UX-R11b — the Exam Studio")).toBeGreaterThan(studioSrc.lastIndexOf("@media (prefers-reduced-motion"));
    expect(builderSrc.indexOf("UX-R11b — the")).toBeGreaterThan(builderSrc.indexOf("UX-R11a"));
  });

  it("add no stacking context, no transition, no colour literal, no physical side", () => {
    for (const b of [studioBlock, builderBlock]) {
      expect(b).not.toMatch(/\b(isolation|z-index|transform|filter|contain|will-change|transition|animation|position)\s*:/);
      expect(b).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
      expect(b).not.toMatch(/(margin|padding|border)-(left|right)|\b(left|right)\s*:/);
    }
  });

  it("scope every rule to the studio roots or to the builder's setup zone", () => {
    const sels = (b: string) => (b.match(/^[^{}@\n][^{}\n]*(?=\{)/gm) || []).flatMap(s => s.split(",")).map(s => s.trim()).filter(Boolean);
    for (const s of sels(studioBlock)) expect(s).toMatch(/^\.st-studio |^\.st-home( |$)/);
    for (const s of sels(builderBlock)) expect(s).toMatch(/^\.builder-setup-(zone|body)\b/);
  });
});

describe("UX-R11b — the studio chrome", () => {
  it("the bar sits on a hairline; the step group is a bordered group", () => {
    expect(rule(studioBlock, ".st-studio .st-topbar")).toBe("border-block-end: 1px solid var(--eb-line);");
    expect(rule(studioBlock, ".st-studio .st-steps")).toBe("background: transparent; border: 1px solid var(--eb-line);");
  });

  it("the current step is a grey pill with bold heading text, its number a heading-coloured disc (it was a white pill)", () => {
    expect(rule(studioBlock, '.st-studio .st-step[aria-current="step"]')).toBe("background: var(--eb-chrome-active); color: var(--eb-text-heading); font-weight: var(--eb-fw-bold);");
    expect(rule(studioBlock, '.st-studio .st-step[aria-current="step"] .st-step-n')).toBe("background: var(--eb-text-heading); border-color: var(--eb-text-heading); color: var(--eb-surface);");
    expect(rule(studioBlock, ".st-studio .st-step:hover")).toBe("background: var(--eb-chrome-hover);");
  });

  it("the section cards, question cards and review panels take the 8 px radius", () => {
    expect(rule(studioBlock, ".st-studio .st-section-card, .st-studio .st-card, .st-studio .st-panel")).toBe("border-radius: var(--eb-r);");
  });
});

describe("UX-R11b — «امتحاناتي»", () => {
  it("sits on the page (no grey box), with 8 px tiles and flat exam cards (no 4 px coloured top rule)", () => {
    expect(rule(studioBlock, ".st-home")).toBe("grid-template-columns: minmax(0, 1fr); padding: 0; border-radius: 0; background: transparent;");
    expect(rule(studioBlock, ".st-home .st-create, .st-home .st-home-empty")).toBe("border-radius: var(--eb-r);");
    expect(rule(studioBlock, ".st-home .st-exam-card")).toBe("border-radius: var(--eb-r); border-block-start: 1px solid var(--eb-line);");
  });

  it("each card's «فتح» is quiet, the pressed filter is a grey pill, and the continue banner is a hairline panel", () => {
    expect(rule(studioBlock, ".st-home .st-exam-actions .st-btn.is-primary, .st-home .st-exam-actions .st-btn.is-primary:hover:not(:disabled)")).toBe("background: var(--eb-surface); border-color: var(--eb-line-2); color: var(--eb-text-heading);");
    expect(rule(studioBlock, '.st-home .st-filter[aria-pressed="true"]')).toBe("background: var(--eb-chrome-active); border-color: transparent; color: var(--eb-text-heading); font-weight: var(--eb-fw-bold);");
    expect(rule(studioBlock, ".st-home .st-home-continue")).toBe("border: 1px solid var(--eb-line);");
  });
});

describe("UX-R11b — the builder page's setup zone", () => {
  it("the zone and its «ماذا تريد في الامتحان؟» card are flat 8 px hairline panels; the decorative square is gone", () => {
    expect(rule(builderBlock, ".builder-setup-zone")).toBe("border-radius:var(--eb-r); box-shadow:none;");
    expect(rule(builderBlock, ".builder-setup-zone > summary")).toBe("background:var(--eb-surface);");
    expect(rule(builderBlock, ".builder-setup-body .prompt-card")).toBe("border-radius:var(--eb-r); border-top:1px solid var(--eb-line); box-shadow:none;");
    expect(rule(builderBlock, ".builder-setup-body .prompt-card::after")).toBe("content:none;");
    expect(rule(builderBlock, ".builder-setup-body .prompt-card .ai-badge")).toBe("border-radius:var(--eb-r-sm); background:var(--eb-primary); box-shadow:none;");
  });
});
