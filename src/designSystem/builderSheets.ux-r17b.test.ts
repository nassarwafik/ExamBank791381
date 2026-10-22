// UX-R17b — the exam builder's legacy sheets (the classic builder, smart import, the builder surroundings, the presentation studio,
// the AI composer) on the purple-neutral palette (docs/enterprise-ux-r0-redesign-foundation.md R17b). Presentation only. These
// guards pin that the slate neutrals, the white literals and the old blue chrome left the five sheets; that no text colour reads a
// stroke token; that the dark CLI and code surfaces, the old exam themes' thumbnails and the status shades did not move; and that
// the exam cover (the paper the student sees) is not part of this phase.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const flat = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const FILES = ["structured-builder.css", "smart-import.css", "builder-pro.css", "presentation/presentation-studio.css", "aiComposer/ai-composer.css"];
const sheets = Object.fromEntries(FILES.map(f => [f, flat(read("src", ...f.split("/")))]));
/** Kept on purpose: the dark CLI and code surfaces (drawn for their own ground) and the thumbnails of the old exam themes. */
const KEPT = /\.sb-cli-textarea|\.sb-code-chip|\.theme-mini/;
const chrome = (s: string) => s.split("}").filter(r => r.includes("{") && !KEPT.test(r.slice(0, r.indexOf("{")))).join("}");
const hex6 = (h: string) => (h.length === 4 ? "#" + [...h.slice(1)].map(c => c + c).join("") : h).toLowerCase();
const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const isNeutral = (h: string) => {
  const [r, g, b] = rgb(h); const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2;
  if ((mx - mn) * 255 < 6) return true;
  return b >= g && g >= r && (mx - mn) / (1 - Math.abs(2 * l - 1)) <= 0.5;
};
const OLD_BLUE = ["#2563eb", "#1d4ed8", "#1e3a8a", "#eef4ff", "#eff4ff", "#eff6ff", "#f8faff", "#f9fbff", "#f7faff", "#dbeafe", "#d7e3fb", "#c7d7f5", "#cfe0f8", "#f6f8fc", "#f7f9fd"];

describe("UX-R17b — the builder's legacy sheets", () => {
  it("hold no slate, grey or white literal outside the dark code surfaces and the theme thumbnails", () => {
    for (const [f, s] of Object.entries(sheets)) {
      const lits = (chrome(s).match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).map(hex6);
      expect(lits.filter(isNeutral), f).toEqual([]);
      expect(chrome(s), f).not.toMatch(/rgba?\(\s*(15,\s*23,\s*42|255,\s*255,\s*255)\s*[,)]/);
    }
  });

  it("hold none of the old blue chrome (fallbacks included): selected and pressed states take the primary family", () => {
    for (const [f, s] of Object.entries(sheets)) for (const h of OLD_BLUE) expect(s.toLowerCase(), f + " " + h).not.toContain(h);
    expect(sheets["structured-builder.css"]).toContain(".sb-template-row{border:1px dashed var(--eb-line-2);background:var(--eb-content-ground-2);");
    expect(sheets["builder-pro.css"]).toContain(".question-action-bar > button:hover{ background:var(--bp-primary-050); border-color:var(--eb-primary-100); color:var(--bp-primary-2); }");
    expect(sheets["presentation/presentation-studio.css"]).toContain('.xp-studio .xp-studio-btn[aria-pressed="true"]{ background:var(--eb-primary-100);');
  });

  it("no text colour reads the axis or faint token (strokes only)", () => {
    for (const [f, s] of Object.entries(sheets)) expect(s, f).not.toMatch(/(^|[;{ ])(color|fill):\s*(var\(--[\w-]+,\s*)?var\(--eb-content-(axis|faint)\)/);
  });
});

describe("UX-R17b — what did not move", () => {
  it("the classic builder's CLI and code chips keep their dark, monospace surfaces", () => {
    const sb = sheets["structured-builder.css"];
    expect(sb).toContain(".sb-cli-textarea{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#0f172a;color:#e2e8f0;");
    expect(sb).toContain(".sb-code-chip{background:#1e293b;color:#fde68a;");
  });

  it("the old exam themes' thumbnails keep the themes' own colours", () => {
    expect(sheets["builder-pro.css"]).toContain(".theme-mini-classic .tm-bar{ border-radius:0; background:#000; width:40%; height:2px; }");
  });

  it("the status shades keep their hue and value", () => {
    expect(sheets["structured-builder.css"]).toContain(".sb-banner-ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#047857}");
  });

  it("the colour baseline: the five sheets well below their old counts; the exam cover untouched (it is the student's paper)", () => {
    const base = JSON.parse(read("scripts", "ux-color-inventory.baseline.json")).files as Record<string, number>;
    const before: Record<string, number> = { "structured-builder.css": 247, "smart-import.css": 43, "builder-pro.css": 40, "presentation/presentation-studio.css": 39, "aiComposer/ai-composer.css": 34 };
    for (const f of FILES) expect(base["src/" + f] ?? 0, f).toBeLessThan(before[f] * 0.6);
    expect(base["src/structured-cover.css"]).toBe(22);
    // the cover itself still holds its 22 literals (counted from the file, so a conversion there fails even if the baseline is not rewritten)
    const cover = read("src", "structured-cover.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const literals = cover.split("}").filter(r => r.includes("{")).reduce((n, r) => n + (r.slice(r.indexOf("{")).match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || []).length, 0);
    expect(literals).toBe(22);
    expect(cover).toContain("#92400e");
  });
});
