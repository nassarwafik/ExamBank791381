// 899371 enrichment P15 (docs/enterprise-899371-enrichment-plan.md §12) — defects found by the second final audit
// (scripts/audit-899371-p15.mjs: every scene, tracer and «حلّ وافحص» editor opened, 390 / 1440 × light / «داكن», axe WCAG 2.1 A/AA,
// 44 px touch targets), each pinned here at the source:
//   1. the template editor's «استعادة كل الفراغات» (a workspace button) was 30 px high on a phone (WCAG 2.5.5, the 44 px rule the
//      template's own per-gap «استعادة» already follows) → on a narrow screen it is ≥ 44 px too — in the Reader and in the exam alike;
//   2. (P14) Monaco's dimmed last line number — now fixed in the editor themes themselves for the exam and the Reader alike
//      (P17, src/coding/editor/editorTheme.p17.test.ts);
//   3. an example's input / output box and a run's output scroll but could not be reached by keyboard (axe scrollable-region-focusable,
//      24 «حلّ وافحص» pages × 4) → each is a focusable named region (coding.17e-b IDE27, codingTemplate.19f U6) with a visible focus
//      ring (here).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
/** The text inside the first `@media <query> { … }` block of `css` (brace-matched). */
function media(css: string, query: string): string {
  const at = css.indexOf("@media " + query);
  if (at < 0) return "";
  let i = css.indexOf("{", at) + 1, depth = 1;
  const start = i;
  for (; i < css.length && depth; i++) depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
  return css.slice(start, i - 1);
}
/** The declarations of every rule whose selector list contains `selector` (whitespace-insensitive), merged in order. */
function decls(css: string, selector: string): Record<string, string> {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(",").map(norm).includes(norm(selector))) continue;
    for (const d of m[2].split(";")) { const k = d.indexOf(":"); if (k > 0) out[d.slice(0, k).trim()] = d.slice(k + 1).trim(); }
  }
  return out;
}
const px = (v: string | undefined) => (v && /^\d+px$/.test(v) ? Number.parseInt(v, 10) : 0);

describe("899371 P15 — the second final audit's fixes", () => {
  it("1. on a phone, the template editor's workspace buttons («استعادة كل الفراغات») are ≥ 44 px high, as its per-gap «استعادة»", () => {
    const phone = media(read("src/coding/codingTemplate.css"), "(max-width: 600px)");
    expect(px(decls(phone, ".cx-tpl-reset")["min-height"])).toBeGreaterThanOrEqual(44);
    expect(px(decls(phone, ".cx-tpl .cx-ws-button")["min-height"])).toBeGreaterThanOrEqual(44);
  });
  it("3. a focusable example / output box shows its focus", () => {
    expect(decls(read("src/coding/coding.css"), ".cx-io-block pre:focus-visible").outline).toBe("var(--eb-focus-ring)");
  });
});
