// @vitest-environment happy-dom
/// <reference types="node" />
// Phase 21E.0 — Review Fix 1 regression test: the keyboard focus ring INSIDE a themed exam keeps the exam's own 3px ring in the
// preset primary, on every control. Finding (certified in real Chromium by scripts/check-exam-focus-ring-browser-21e0-rf1.mjs,
// 69/129 on the 21E.0 head a8ef36f → 129/129 with this fix): the 21E.0 migration pointed the per-control rules (inline-cloze
// input / dropdown, hotspot overlay / marker, coding frame, …) at the canonical `--eb-focus-ring`. That token is `2px solid
// var(--eb-primary)` SUBSTITUTED AT :root — it inherits into `.exam-presentation` already resolved to the platform blue, so the
// scope's `--eb-primary: var(--xp-primary)` override cannot recolour it. Inside a themed exam those controls therefore showed
// the platform-default 2px blue ring (the high-contrast preset included) instead of the 3px ring in the preset primary that the
// scoped `.exam-presentation :focus-visible` rule paints on generic controls (and painted on these controls before 21E.0, when
// their own rules were invalid and fell through). The minimal fix redefines the ring token inside the scope:
// `--eb-focus-ring: 3px solid var(--xp-primary)`. CSS is stubbed under Vitest, so the sheet is read from disk and pinned
// structurally; the rendered root is checked for the preset primary it hands the ring (`--xp-primary`).
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import PresentationRoot from "./PresentationRoot";
import { PRESENTATION_PRESETS } from "./presentationModel";

const sheet = readFileSync(path.join(process.cwd(), "src", "presentation", "presentation.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const scopeBlock = () => { const m = /\.exam-presentation\s*\{([^}]*)\}/.exec(sheet); return m ? m[1] : ""; };
afterEach(cleanup);

describe("21E.0 RF1 — exam-scoped focus ring", () => {
  it("`.exam-presentation` redefines the ring token as the 3px ring in the preset primary", () => {
    expect(scopeBlock()).toMatch(/--eb-focus-ring\s*:\s*3px solid var\(--xp-primary\)\s*;/);
  });

  it("the scoped generic rule is untouched: `.exam-presentation :focus-visible` still paints 3px in the preset primary with a 2px offset", () => {
    expect(sheet).toMatch(/\.exam-presentation :focus-visible\s*\{\s*outline\s*:\s*3px solid var\(--xp-primary\)\s*;\s*outline-offset\s*:\s*2px\s*;\s*\}/);
  });

  it("the scope still re-points the platform primary to the preset primary (the colour the ring follows)", () => {
    expect(scopeBlock()).toMatch(/--eb-primary\s*:\s*var\(--xp-primary\)\s*;/);
  });

  it.each([["highContrast", "#000000"], ["default", "#1D4ED8"]])("the %s preset hands the ring its primary %s through --xp-primary on the real root", (preset, primary) => {
    expect(PRESENTATION_PRESETS[preset as keyof typeof PRESENTATION_PRESETS].colors.primary).toBe(primary);
    const { container } = render(<PresentationRoot presentation={{ schemaVersion: 1, preset }}><button type="button">زر</button></PresentationRoot>);
    const root = container.querySelector(".exam-presentation") as HTMLElement;
    expect(root.getAttribute("data-xp-preset")).toBe(preset);
    expect(root.style.getPropertyValue("--xp-primary")).toBe(primary);
    // the platform ring token is never set inline (JSON cannot restyle the ring); only the stylesheet scope redefines it
    expect(root.style.getPropertyValue("--eb-focus-ring")).toBe("");
  });

  it("the high-contrast preset's primary is pure black, so its ring can never read as the platform blue", () => {
    expect(PRESENTATION_PRESETS.highContrast.colors.primary.toLowerCase()).toBe("#000000");
    expect(PRESENTATION_PRESETS.highContrast.colors.primary.toLowerCase()).not.toBe("#2563eb");
  });
});
