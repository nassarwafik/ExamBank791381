// Learning content — the generic `practice-table` block: a `table` whose answerable cells are small closed choices
// checked in place by the Reader. Validation pins the data contract (header/row shape, ≥ 2 unique options, a key
// that is one of them, at least one choice cell, origin book allowed); the renderer stays domain-free.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { validateLearningCourseContent } from "./validation";
import { BLOCK_TYPES, type ContentBlock, type PracticeTableBlock } from "./types";
import { cloneCourse } from "./content.fixtures";

const sel = (key: string, options = ["نعم", "لا"]) => ({ kind: "select" as const, options, key });
const table = (over: Partial<PracticeTableBlock> & Record<string, unknown> = {}): ContentBlock => ({
  id: "pt-1", type: "practice-table", origin: "book", headers: ["العنصر", "الحكم"], columnDirs: ["ltr", "rtl"],
  rows: [["alpha", sel("نعم")], ["beta", sel("لا")]], ...over,
} as ContentBlock);
const issuesOf = (b: ContentBlock) => {
  const c = cloneCourse();
  c.modules[0].lessons[0].pages[0].blocks = [b];
  return validateLearningCourseContent(c).map(i => i.code);
};

describe("practice-table — typing + validation", () => {
  it("is a supported block type; a well-formed worksheet validates with origin book (the printed page IS the worksheet)", () => {
    expect(BLOCK_TYPES).toContain("practice-table");
    expect(issuesOf(table())).toEqual([]);
    expect(issuesOf(table({ origin: "teacher-enrichment" }))).toEqual([]);
    expect(issuesOf(table({ caption: "تمرين", rows: [["a", sel("نعم"), "ملاحظة"]], headers: ["x", "y", "z"], columnDirs: ["ltr", "rtl", "rtl"] }))).toEqual([]);
  });
  it("rejects a bad shape: empty/blank headers, no rows, a row width mismatch", () => {
    expect(issuesOf(table({ headers: [] }))).toContain("invalid-practice-table");
    expect(issuesOf(table({ headers: ["a", " "] }))).toContain("invalid-practice-table");
    expect(issuesOf(table({ rows: [] }))).toContain("invalid-practice-table");
    expect(issuesOf(table({ rows: [["only-one-cell"]] }))).toContain("invalid-table-row");
  });
  it("rejects a bad choice cell: one option, duplicate options, a blank option, a key outside the options, a foreign kind", () => {
    expect(issuesOf(table({ rows: [["a", sel("نعم", ["نعم"])]] }))).toContain("invalid-practice-table");
    expect(issuesOf(table({ rows: [["a", sel("نعم", ["نعم", "نعم"])]] }))).toContain("invalid-practice-table");
    expect(issuesOf(table({ rows: [["a", sel("نعم", ["نعم", ""])]] }))).toContain("invalid-practice-table");
    expect(issuesOf(table({ rows: [["a", sel("ربما")]] }))).toContain("invalid-practice-table");
    expect(issuesOf(table({ rows: [["a", { kind: "text", options: ["x", "y"], key: "x" } as unknown as string]] }))).toContain("invalid-practice-table");
  });
  it("requires at least one choice cell — a table with none must be authored as a plain `table`", () => {
    expect(issuesOf(table({ rows: [["a", "b"], ["c", "d"]] }))).toContain("invalid-practice-table");
  });
  it("still requires provenance like every block", () => {
    const b = table(); delete (b as { origin?: string }).origin;
    expect(issuesOf(b)).toContain("missing-origin");
  });
});

describe("practice-table — the renderer is generic (no page ids, no domain rules, no persistence)", () => {
  const src = readFileSync(path.join(process.cwd(), "src/learning/reader/PracticeTableView.tsx"), "utf8");
  it("contains no course/page identifiers, no address/classification vocabulary and no storage or network calls", () => {
    for (const banned of ["791381", "m07", "192.", "10.", "172.", "صالح", "خاص", "عام", "IPv4", "localStorage", "sessionStorage", "fetch(", "/api/"]) {
      expect(src, banned).not.toContain(banned);
    }
  });
  it("never writes the expected choice into the DOM (no attribute carries the key) and marks verdicts with is-right / is-wrong", () => {
    expect(src).not.toMatch(/data-key|data-answer|data-expected|value=\{cell\.key\}/);
    expect(src).toContain('"right"');
    expect(src).toContain('"wrong"');
    expect(src).not.toMatch(/className=[^\n]*correct/);
  });
});
