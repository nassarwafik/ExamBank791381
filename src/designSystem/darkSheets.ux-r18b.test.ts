/// <reference types="node" />
// UX-R18b — the teacher's pages in the dark theme (docs/enterprise-ux-r0-redesign-foundation.md R18b). These guards pin:
//  1. Every sheet of the teacher's pages and the builder (DARK_SCOPE) answers each literal colour that would break in dark — a light
//     background, dark text, white text on a token fill that turns light, a light line — with a dark rule (the same selector under
//     :root[data-theme="dark"], the same property). scripts/ux-dark-audit.mjs reports none unanswered.
//  2. The dark rules set colours from tokens only: no new literal, so the colour inventory never grows and the light theme, where
//     no dark rule applies, is untouched.
//  3. The audit itself: what it flags and what it leaves (a saturated fill with white text, a print rule, a fallback that never
//     renders, a declaration already answered).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
// @ts-expect-error — a plain ES module script, no type declarations
import { auditSheet, darkRuleLiterals, DARK_SCOPE, DARK } from "../../scripts/ux-dark-audit.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
type Open = { selectors: string[]; prop: string; value: string; need: string };

describe("UX-R18b — the teacher's sheets in dark", () => {
  it("covers the teacher's pages and the builder", () => {
    for (const f of ["src/App.css", "src/platform.css", "src/structured-builder.css", "src/review-workspace.css", "src/governance/reviewInbox.css", "src/smart-import.css"]) expect(DARK_SCOPE, f).toContain(f);
  });

  for (const f of DARK_SCOPE as string[]) {
    it(f + ": every literal that would break in dark is answered, from tokens only", () => {
      const css = read(f);
      expect((auditSheet(css) as Open[]).map(o => o.need + ": " + o.selectors.join(", ") + " { " + o.prop + " }"), "add the dark rule (scripts/ux-dark-audit.mjs)").toEqual([]);
      expect(darkRuleLiterals(css), "a dark rule reads tokens, never a literal").toEqual([]);
    });
  }
});

describe("UX-R18b — the audit", () => {
  const open = (css: string) => (auditSheet(css) as Open[]).map(o => o.need + " " + o.selectors.join(","));

  it("flags a light background, dark text, a light line, white text on a fill that turns light and a dark fill under a label that turns dark", () => {
    expect(open(".a{background:#f0fdf4}")).toEqual(["light background .a"]);
    expect(open(".a2{background:#c7d2fe}")).toEqual(["light background .a2"]);           // a mid-light tint, not only near-white
    expect(open(".b{color:#166534}")).toEqual(["dark text .b"]);
    expect(open(".c{border:1px solid #86efac}")).toEqual(["light line .c"]);
    expect(open(".d{background:var(--eb-primary);color:#fff}")).toEqual(["white text on a fill that turns light .d"]);
    expect(open(".j{background:#9a3412;color:var(--eb-surface)}")).toEqual(["dark fill under a label that turns dark .j"]);
    expect(open(".k{background:white}")).toEqual(["light background .k"]);                // a keyword the colour inventory never counted
    expect(open(".m{box-shadow:0 8px 20px color-mix(in srgb, var(--eb-content-ink) 12%, transparent)}")).toEqual(["shadow mixed from an ink that turns light .m"]);
    expect(open(".n{box-shadow:0 8px 20px color-mix(in srgb, var(--eb-scrim) 12%, transparent)}")).toEqual([]);
    expect(open(".l{color:var(--eb-navy);border-color:var(--eb-navy-2)}")).toEqual([]);   // a token's name is not a colour keyword
  });

  it("leaves what reads the same in both themes, print, and fallbacks that never render", () => {
    expect(open(".e{background:#16a34a;color:#fff}")).toEqual([]);                        // a saturated fill with white text
    expect(open(".f{background:#7f1d1d;color:#111}")).toEqual([]);                        // a dark literal fill keeps its text
    expect(open("@media print{.g{background:#fff;color:#000}}")).toEqual([]);
    expect(open(".h{color:var(--eb-text, #333)}")).toEqual([]);
    expect(open(".i{box-shadow:0 1px 2px rgba(0,0,0,.2)}")).toEqual([]);
  });

  it("an answer is the same selector under the dark root, setting the same property family", () => {
    expect(open(`.a{background:#f0fdf4;color:#166534} ${DARK} .a{background:var(--eb-success-bg);color:var(--eb-success-tx)}`)).toEqual([]);
    expect(open(`.a{background:#f0fdf4} ${DARK} .a{color:var(--eb-text)}`)).toEqual(["light background .a"]);
    expect(open(`.a,.b{color:#166534} ${DARK} .a{color:var(--eb-success-tx)}`)).toEqual(["dark text .b"]);
    expect(darkRuleLiterals(`${DARK} .a{background:#123456}`)).toHaveLength(1);
  });
});
