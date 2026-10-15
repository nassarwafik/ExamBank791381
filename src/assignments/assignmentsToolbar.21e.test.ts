// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Phase 21E — the stacked phone toolbar (≤767px turns the toolbar and its filters into flex columns). The desktop
// search field grows with `flex: 1 1 220px`; in a column that basis becomes a 220px HEIGHT, leaving a blank band
// under the search box that pushed the status / sort controls and the first assignment below the fold.
const css = readFileSync(join(process.cwd(), "src", "assignments-pro.css"), "utf8");
const phone = (() => { const at = css.indexOf("@media (max-width:767px){"); return css.slice(at, css.indexOf("\n}", at)); })();

describe("21E assignments toolbar — stacked phone layout", () => {
  it("the phone block stacks the toolbar and resets the search field's 220px flex-basis to its content height", () => {
    expect(phone).toMatch(/\.eb-assign-toolbar,\.eb-assign-filters\{ flex-direction:column;/);
    expect(phone).toMatch(/\.eb-assign-search\{ flex:0 0 auto; \}/);
  });
});
