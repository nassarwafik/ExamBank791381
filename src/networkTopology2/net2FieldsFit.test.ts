// PIN (not fail-first: the layout itself can only be measured in a real browser — scripts/check-network-build-browser.mjs measures it
// and failed on the baseline 735b9b7e): the Desktop's IP Configuration fields (and every .net2-field) never grow past their grid column.
// A grid item defaults to min-width:auto, so an input kept its intrinsic ~20ch width and its left-aligned value slid under the next
// field — a saved address looked empty. These rules keep each input inside its own field.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./net2.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
describe("net2 fields fit their columns", () => {
  it("a field and the fields' grid items may shrink; an input / select fills its field and no more", () => {
    expect(css).toMatch(/\.net2-fields > \*, \.net2-field \{ min-width: 0; \}/);
    expect(css).toMatch(/\.net2-field > input, \.net2-field > select \{ width: 100%; min-width: 0; box-sizing: border-box; \}/);
  });
});
