// UX-R16d — the exam presentation presets, option A (owner direction; docs/enterprise-ux-r0-redesign-foundation.md §4.1 and R16d):
// the reference look is a NEW code-owned preset, appended, and the studio starts an exam that has no presentation yet from it.
// Existing presets keep their ids and colours, so every stored exam keeps its look; the runtime fallback, the WCAG policy (it blocks
// finalization) and the schema stay as they are. The preset's own behaviour is pinned by the 20D.1 suites like every other preset.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as P from "./presentationModel";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = strip(readFileSync(path.join(process.cwd(), "src", "design-tokens.css"), "utf8"));
const token = (name: string) => tokens.match(new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{6})"))![1].toUpperCase();
const studio = readFileSync(path.join(process.cwd(), "src", "presentation", "PresentationStudio.tsx"), "utf8");

// The eleven pre-R16d presets exactly as they were (ids, order and colours): option A changes none of them.
const BEFORE: Record<string, Record<string, string>> = {
  default: { primary: "#1D4ED8", accent: "#0369A1", background: "#F8FAFC", surface: "#FFFFFF", surfaceAlt: "#F1F5F9", text: "#0F172A", muted: "#475569", border: "#CBD5E1" },
  modernAcademic: { primary: "#1D4ED8", accent: "#0EA5E9", background: "#F8FAFC", surface: "#FFFFFF", surfaceAlt: "#F1F5F9", text: "#172033", muted: "#64748B", border: "#CBD5E1" },
  compact: { primary: "#1D4ED8", accent: "#0369A1", background: "#F8FAFC", surface: "#FFFFFF", surfaceAlt: "#F1F5F9", text: "#0F172A", muted: "#475569", border: "#CBD5E1" },
  highContrast: { primary: "#000000", accent: "#0000CC", background: "#FFFFFF", surface: "#FFFFFF", surfaceAlt: "#F2F2F2", text: "#000000", muted: "#222222", border: "#000000" },
};

describe("UX-R16d — the reference preset", () => {
  it("is appended after the eleven existing presets, which keep their ids, order and colours", () => {
    const ids = Object.keys(P.PRESENTATION_PRESETS);
    expect(ids.slice(0, 11)).toEqual(["default", "classicPaper", "modernAcademic", "cards", "focus", "compact", "scienceLab", "networkLab", "developerWorkspace", "friendly", "highContrast"]);
    expect(ids[11]).toBe("reference");
    for (const [id, colors] of Object.entries(BEFORE)) expect(P.PRESENTATION_PRESETS[id as P.PresetId].colors, id).toMatchObject(colors);
  });

  it("carries the design tokens' values (purple primary, lavender-grey ground, hairline border, the status tokens)", () => {
    const c = P.PRESENTATION_PRESETS.reference.colors;
    expect(c.primary).toBe(token("eb-primary")); expect(c.accent).toBe(token("eb-primary-strong"));
    expect(c.background).toBe(token("eb-bg")); expect(c.surface).toBe(token("eb-surface")); expect(c.surfaceAlt).toBe(token("eb-surface-2"));
    expect(c.text).toBe(token("eb-text")); expect(c.muted).toBe(token("eb-muted")); expect(c.border).toBe(token("eb-line-2"));
    expect(c.success).toBe(token("eb-success-tx")); expect(c.warning).toBe(token("eb-warn-tx")); expect(c.danger).toBe(token("eb-danger-tx"));
  });

  it("is the flat reference look: 8 px radius, no shadow, outlined question cards", () => {
    const r = P.resolvePresentation({ schemaVersion: 1, preset: "reference" })!;
    expect(r.tokens.radius).toBe("md"); expect(r.tokens.shadow).toBe("none"); expect(r.components.questionCard).toBe("outlined");
    expect(P.presentationCssVars(r)["--xp-radius"]).toBe("8px");
  });

  it("passes the WCAG policy that blocks finalization, and validates as a stored value", () => {
    expect(P.presentationContrastIssues(P.PRESENTATION_PRESETS.reference.colors)).toEqual([]);
    expect(P.validatePresentation({ schemaVersion: 1, preset: "reference" }).ok).toBe(true);
  });
});

describe("UX-R16d — only new presentations start from it", () => {
  it("the studio starts an exam with no presentation from the reference preset", () => {
    expect(P.STARTING_PRESET).toBe("reference");
    expect(studio).toContain('return { kind: "absent", raw: { schemaVersion: 1, preset: STARTING_PRESET }, preset: STARTING_PRESET, contrast: [] };');
  });

  it("a missing or malformed stored value still falls back to the safe default (no stored exam changes look)", () => {
    expect(P.resolvePresentation(undefined)).toBeNull();                                   // no presentation: the legacy theme decides, unchanged
    expect(P.resolvePresentation({ schemaVersion: 1, preset: "neon" })).toMatchObject({ preset: "default", fallback: true });
    expect(P.resolvePresentation({ schemaVersion: 1, preset: "default" })).toMatchObject({ preset: "default", fallback: false });
    expect(studio).toContain('analysis.kind === "malformed" ? { schemaVersion: 1, preset: "default" } : analysis.raw');
  });

  it("the API's shared copy knows the preset too (an exam saved with it validates on the server)", () => {
    const shared = createRequire(import.meta.url)("../../api/src/lib/shared-finalization/presentation/presentationModel.js");
    expect(Object.keys(shared.PRESENTATION_PRESETS)).toEqual(Object.keys(P.PRESENTATION_PRESETS));
    expect(shared.validatePresentation({ schemaVersion: 1, preset: "reference" }).ok).toBe(true);
  });
});
