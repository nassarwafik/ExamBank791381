// 791381s Phase 9 (docs/enterprise-791381s-enrichment-plan.md §20) — DEFECT found by the final audit: on a phone (390 px) the
// «تدريبات الوحدة» pages of units 21 and 33 scrolled sideways (document 396 / 416 px wide), because a practice question whose
// prompt or option is one long unbreakable token (a full IPv6 address such as 2001:0db8:0000:0000:0000:ff00:0042:8329) could
// not wrap — every other Reader text block already allows `overflow-wrap:anywhere`, the practice block did not. The rule is
// inherited, so setting it on the practice container covers the prompt, the options, the feedback and the explanation.
// (The browser audit measured 396 → 390 and 416 → 390 on the same pages; this pins the rule.)
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const css = readFileSync(fileURLToPath(new URL("./reader.css", import.meta.url)), "utf8");
const ruleOf = (selector: string) => {
  const at = css.indexOf(selector + "{");
  expect(at, selector).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf("}", at));
};

describe("practice questions wrap long unbreakable tokens (no sideways scroll on a phone)", () => {
  it("the practice container allows overflow-wrap:anywhere, like every other Reader text block", () => {
    expect(ruleOf(".learning-reader-practice, .learning-reader-simulation")).toMatch(/overflow-wrap:anywhere/);
    for (const s of [".learning-reader-text", ".learning-reader-callout-body", ".learning-reader-list-text"]) expect(ruleOf(s)).toMatch(/overflow-wrap:anywhere/);
  });
});
