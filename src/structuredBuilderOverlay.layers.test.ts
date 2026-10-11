import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// BUG-001 / BUG-002 — the Structured Exam Builder's full-screen shell (`.structured-builder-overlay`, App.css: it renders before the
// builder chunk loads) and every portal dialog (`.eb-dialog-root`, ui/ui.css) are both direct children of <body>, so their z-index
// values decide which one paints on top. The overlay sat at 900 while the design-token modal layer is 70: «رجوع» on an unsaved
// (imported) exam opened the unsaved-changes confirmation UNDER the opaque builder, and the eight toolbar tools opened their dialogs
// under it too — the teacher saw nothing happen. This pins the layer contract from the CSS sources; the real-browser proof is
// scripts/check-builder-overlay-browser.mjs (hit tests + pointer clicks in Chromium, which happy-dom cannot do).

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
const tokens = read("./design-tokens.css");
const appCss = read("./App.css");
const uiCss = read("./ui/ui.css");

const token = (name: string): number => {
  const m = tokens.match(new RegExp("--" + name + "\\s*:\\s*(\\d+)"));
  if (!m) throw new Error("design token --" + name + " is not defined");
  return Number(m[1]);
};
const overlayRule = () => {
  const m = appCss.match(/\.structured-builder-overlay\s*\{([^}]*)\}/);
  if (!m) throw new Error(".structured-builder-overlay rule missing from App.css");
  return m[1];
};
const overlayZ = (): number => {
  const z = overlayRule().match(/z-index\s*:\s*([^;]+);/)?.[1].trim() ?? "";
  const viaToken = z.match(/^var\(--([a-z0-9-]+)\s*(?:,\s*(\d+))?\)$/);
  if (viaToken) {
    const value = token(viaToken[1]);
    if (viaToken[2] !== undefined) expect(Number(viaToken[2]), "the inline fallback must equal the token").toBe(value);
    return value;
  }
  if (/^\d+$/.test(z)) return Number(z);
  throw new Error("unreadable overlay z-index: " + JSON.stringify(z));
};

describe("builder overlay layer contract (BUG-001 / BUG-002)", () => {
  it("portal dialogs use the design-token modal layer", () => {
    const root = uiCss.match(/\.eb-dialog-root\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(root).toMatch(/position:\s*fixed/);
    expect(root).toMatch(/z-index:\s*var\(--eb-z-modal\)/);
  });

  it("the builder overlay covers the shell layers (nav, drawer, toast) …", () => {
    const z = overlayZ();
    expect(z).toBeGreaterThan(token("eb-z-nav"));
    expect(z).toBeGreaterThan(token("eb-z-drawer"));
    expect(z).toBeGreaterThan(token("eb-z-toast"));
  });

  it("… but stays BELOW the modal layer, so the unsaved-changes confirmation and every tool dialog paint on top of it", () => {
    expect(overlayZ()).toBeLessThan(token("eb-z-modal"));
  });

  it("the teacher's manual-review modal (AssignmentReview, platform.css) uses the same layer: its coding-regrade confirmation must paint on top of it", () => {
    const rule = read("./platform.css").match(/\.review-overlay\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/position:fixed/);
    expect(rule).toMatch(/z-index:var\(--eb-z-overlay,60\)/);
    expect(token("eb-z-overlay")).toBeLessThan(token("eb-z-modal"));
  });

  it("no other fixed full-screen layer sits between the builder overlay and the modal layer", () => {
    // Every z-index literal in the shared stylesheets that is >= the modal layer must belong to a legacy 1000-level overlay
    // (preview / review / theme preview), which deliberately paint above dialogs; nothing may land in (overlay, modal).
    const modal = token("eb-z-modal"), overlay = overlayZ();
    const sheets = ["./App.css", "./platform.css", "./shell.css", "./structured-builder.css", "./studentexam-pro.css", "./page-parts.css", "./ui/ui.css"];
    const between: string[] = [];
    for (const s of sheets) for (const m of read(s).matchAll(/z-index\s*:\s*(\d+)/g)) { const v = Number(m[1]); if (v > overlay && v < modal) between.push(s + " → " + v); }
    expect(between).toEqual([]);
  });
});
