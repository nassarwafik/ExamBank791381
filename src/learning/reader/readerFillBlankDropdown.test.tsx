// @vitest-environment happy-dom
// Reader interactive fix — the three keyed `fillBlank` questions that used to render as a non-interactive placeholder
// ("سيتوفر التحقق من الإجابة في مرحلة لاحقة") are now dropdown self-checks, converted to `practice-table` blocks with a
// single `select` cell and reused through the existing PracticeTableView. This suite proves, for each of the three
// affected pages, that: the block is a practice-table (no longer a fillBlank practice), it renders a usable <select>
// with no placeholder, the correct choice succeeds and a wrong choice fails-then-retries, the answer key is not
// revealed before interaction, the RTL/mobile table contract holds, and the exercises stay OUT of Study Strength so
// the 453-activity baseline (247 MC / 86 T/F / 60 short input / 60 practice-table) is unchanged.
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { render, cleanup, fireEvent } from "@testing-library/react";
import m20 from "../content/791381/modules/m20";
import m22 from "../content/791381/modules/m22";
import m24 from "../content/791381/modules/m24";
import type { ContentModule, ContentPage, PracticeTableBlock, PracticeTableSelectCell } from "../content/types";
import { studyActivityOf } from "../study/eligibility";
import PracticeTableView from "./PracticeTableView";

afterEach(cleanup);

const PLACEHOLDER = "سيتوفر التحقق من الإجابة في مرحلة لاحقة";
const pagesOf = (m: ContentModule): ContentPage[] => m.lessons.flatMap(l => l.pages);
const findBlock = (m: ContentModule, pageId: string, blockId: string) => {
  const page = pagesOf(m).find(p => p.id === pageId)!;
  const block = page.blocks.find(b => b.id === blockId) as PracticeTableBlock;
  return { page, block };
};
const selectCell = (b: PracticeTableBlock) => b.rows[0].find((c): c is PracticeTableSelectCell => typeof c !== "string")!;
const text = (el: Element) => el.textContent || "";

// The three converted questions (module, page, block, options, correct key, a wrong option).
const CASES = [
  { name: "site 147 / PDF 160 — Wi-Fi radio waves", module: m20, pageId: "791381-m20-l01-p02", blockId: "m20-l01-p02-q2", options: ["الراديو", "الضوء", "الكابلات"], key: "الراديو", wrong: "الكابلات" },
  { name: "site 163 / PDF 176 — CIDR /24",          module: m22, pageId: "791381-m22-l03-p01", blockId: "m22-l03-p01-q2", options: ["24", "16", "32"], key: "24", wrong: "32" },
  { name: "site 172 / PDF 185 — Cisco access Enable", module: m24, pageId: "791381-m24-l01-p01", blockId: "m24-l01-p01-q2", options: ["Enable", "DHCP", "VLAN"], key: "Enable", wrong: "VLAN" },
] as const;

describe("Reader fillBlank→dropdown — content shape", () => {
  for (const c of CASES) {
    it(`${c.name}: block is a practice-table select, studyEligible:false, correct source-faithful key/options`, () => {
      const { block } = findBlock(c.module, c.pageId, c.blockId);
      expect(block.type).toBe("practice-table");
      expect(block.origin).toBe("teacher-enrichment");
      expect(block.studyEligible).toBe(false);
      expect(block.columnDirs).toBeDefined();
      const cell = selectCell(block);
      expect(cell.options).toEqual([...c.options]);
      expect(cell.key).toBe(c.key);
      expect(cell.options).toContain(cell.key);
      expect(new Set(cell.options).size).toBe(cell.options.length);   // unique distractors
      // no leftover fillBlank anywhere in the block
      expect(JSON.stringify(block)).not.toContain("fillBlank");
    });
  }
});

describe("Reader fillBlank→dropdown — interactive rendering (PracticeTableView, the reader's practice-table surface)", () => {
  for (const c of CASES) {
    it(`${c.name}: exposes a usable <select>, hides the answer before interaction, and shows no static placeholder`, () => {
      const { block } = findBlock(c.module, c.pageId, c.blockId);
      const { container } = render(<PracticeTableView block={block} pageId={c.pageId} />);
      // usable dropdown with a neutral placeholder option + all the choices
      const select = container.querySelector("select")!;
      expect(select).not.toBeNull();
      const optionValues = [...select.querySelectorAll("option")].map(o => (o as HTMLOptionElement).value);
      expect(optionValues).toEqual(["", ...c.options]);   // "" = «اختر...» placeholder, then the closed list
      expect(select.value).toBe("");                       // nothing pre-selected
      // the OLD non-interactive placeholder is gone
      expect(text(container)).not.toContain(PLACEHOLDER);
      // answer key is not revealed before the student picks: no correctness marker/feedback yet, and no data attribute holds the key
      expect(container.querySelector(".learning-reader-practice-feedback")).toBeNull();
      expect(container.querySelector(".is-right")).toBeNull();
      expect(container.innerHTML).not.toContain(`data-answer`);
    });

    it(`${c.name}: correct choice succeeds; wrong choice fails and can be retried; reset clears`, () => {
      const { block } = findBlock(c.module, c.pageId, c.blockId);
      const u = render(<PracticeTableView block={block} pageId={c.pageId} />);
      const select = u.container.querySelector("select")! as HTMLSelectElement;
      // wrong first → explicit incorrect feedback (never colour-only)
      fireEvent.change(select, { target: { value: c.wrong } });
      expect(u.container.querySelector(".learning-reader-practice-feedback.is-wrong")).not.toBeNull();
      expect(text(u.container)).toContain("غير صحيح");
      expect(u.container.querySelector(".learning-reader-practice-feedback.is-right")).toBeNull();
      // retry with the correct choice → success
      fireEvent.change(select, { target: { value: c.key } });
      expect(u.container.querySelector(".learning-reader-practice-feedback.is-right")).not.toBeNull();
      // reset clears back to the neutral state
      fireEvent.click(u.getByText("امسح الإجابات"));
      expect((u.container.querySelector("select") as HTMLSelectElement).value).toBe("");
      expect(u.container.querySelector(".learning-reader-practice-feedback")).toBeNull();
    });

    it(`${c.name}: RTL/mobile table contract intact (scroll wrapper + practice table + per-column direction)`, () => {
      const { block } = findBlock(c.module, c.pageId, c.blockId);
      const { container } = render(<PracticeTableView block={block} pageId={c.pageId} />);
      expect(container.querySelector(".learning-reader-tablewrap")).not.toBeNull();     // horizontal-scroll wrapper (mobile)
      expect(container.querySelector("table.learning-reader-table.is-practice")).not.toBeNull();
      const sentenceCell = container.querySelector("tbody td")!;                        // first cell = the Arabic sentence
      expect(sentenceCell.getAttribute("dir")).toBe(block.columnDirs![0]);              // per-column direction applied (RTL)
    });
  }
});

describe("Reader fillBlank→dropdown — Study Strength unaffected", () => {
  it("each converted block is excluded from the shared eligibility rule (studyActivityOf → null)", () => {
    for (const c of CASES) {
      const { block } = findBlock(c.module, c.pageId, c.blockId);
      expect(studyActivityOf(block)).toBeNull();
    }
  });
  it("the committed server study index still holds exactly 453 eligible (247 MC / 86 T/F / 60 shortInput / 60 practice-table) and none of the three converted ids", () => {
    const idx = JSON.parse(readFileSync(resolve(process.cwd(), "api/src/data/learning-study/791381.json"), "utf8"));
    const kinds: Record<string, number> = {};
    let total = 0;
    const ids = new Set<string>();
    for (const p of Object.values(idx.pages as Record<string, { activities: Record<string, { kind: string }> }>)) {
      for (const [id, a] of Object.entries(p.activities)) { total++; ids.add(id); kinds[a.kind] = (kinds[a.kind] || 0) + 1; }
    }
    expect(total).toBe(453);
    expect(kinds).toEqual({ multipleChoice: 247, trueFalse: 86, shortInput: 60, "practice-table": 60 });
    for (const c of CASES) expect(ids.has(c.blockId)).toBe(false);
  });
});
