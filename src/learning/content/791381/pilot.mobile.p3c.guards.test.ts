/// <reference types="node" />
// Phase 3C — CSS guards for the new generic renderer bits (ordered list, LTR numeric table).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const readerCss = readFileSync(fileURLToPath(new URL("../../reader/reader.css", import.meta.url)), "utf8");
const noSpaces = (s: string) => s.replace(/\s+/g, "");

describe("Phase 3C — reader CSS", () => {
  it("the ordered list numbers its steps via a counter (real <ol> procedure)", () => {
    expect(noSpaces(readerCss)).toContain(".learning-reader-list.variant-ordered.learning-reader-list-item::before{content:counter(eb-step)");
  });
  it("a dir=ltr table reads left-to-right (numeric place values not reversed under RTL)", () => {
    expect(noSpaces(readerCss)).toContain('.learning-reader-table[dir="ltr"]{direction:ltr');
  });
});
