/// <reference types="node" />
// UX-R18c2 — dark mode released (docs/enterprise-ux-r0-redesign-foundation.md R18c2). These guards pin:
//  1. The release flag is on (the toggle renders in both top bars: themePreference.ux-r18a.test.tsx).
//  2. index.html applies the stored dark choice BEFORE the first paint: an inline script in <head>, ahead of every stylesheet and
//     module, reading the same key as themePreference.ts and only its literal "dark"; storage failures leave the page light.
//  3. The visual gate compares both themes; the offline page stays a static light page (its 6A guard forbids scripts).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { DARK_MODE_RELEASED, THEME_KEY } from "./themePreference";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const html = read("index.html");
const head = html.slice(0, html.indexOf("</head>"));
const prePaint = (/<script>([\s\S]*?)<\/script>/.exec(head) || [])[1] ?? "";

/** Runs the pre-paint script against a fake document and storage; returns the data-theme it set (null when none). */
function runPrePaint(storage: { getItem(k: string): string | null }): string | null {
  const attrs: Record<string, string> = {};
  const document = { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
  new Function("localStorage", "document", prePaint)(storage, document);
  return attrs["data-theme"] ?? null;
}

describe("UX-R18c2 — dark mode released", () => {
  it("the release flag is on", () => {
    expect(DARK_MODE_RELEASED).toBe(true);
  });

  it("index.html has one inline pre-paint script in <head>, before every stylesheet and module, reading the toggle's key", () => {
    expect(prePaint).not.toBe("");
    const at = head.indexOf("<script>");
    for (const later of ['<link rel="stylesheet"', '<script type="module"', "<style"]) { const i = html.indexOf(later); if (i >= 0) expect(at, later).toBeLessThan(i); }
    expect(prePaint).toContain(JSON.stringify(THEME_KEY));
    expect(prePaint).toMatch(/^try\{[\s\S]*\}catch\(e\)\{\}$/);
  });

  it("the stored dark choice is applied; anything else (no key, another value, blocked storage) leaves the page light", () => {
    expect(runPrePaint({ getItem: k => (k === THEME_KEY ? "dark" : null) })).toBe("dark");
    expect(runPrePaint({ getItem: () => null })).toBeNull();
    expect(runPrePaint({ getItem: () => "light" })).toBeNull();
    expect(runPrePaint({ getItem: () => "DARK" })).toBeNull();
    expect(runPrePaint({ getItem: () => { throw new Error("blocked"); } })).toBeNull();
  });

  it("the visual gate compares both themes; the light jobs keep their names", () => {
    const wf = read(".github", "workflows", "ux-visual-regression-r19b.yml");
    expect(wf).toContain("theme: [light, dark]");
    expect(wf).toContain("THEME: ${{ matrix.theme }}");
    expect(wf).toContain("name: Visual regression (${{ matrix.viewport }}${{ matrix.theme == 'dark' && ', dark' || '' }})");
  });

  it("the offline page stays a static light page (no script: the 6A guard; color-scheme light)", () => {
    const offline = read("public", "offline.html");
    expect(offline).not.toMatch(/<script/);
    expect(offline).toContain(":root { color-scheme: light; }");
  });
});
