// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import RichMath from "./RichMath";
import { parseMath, MATH_LIMITS, type MathNode } from "./richMath";
import { validateRichContent } from "./richContentModel";
import { scientificV2Candidates, V2_CELLS, type V2Case } from "./testing/mathCorpus";

// Phase 21A — the GENERATED Scientific Math v2 corpus: 40,000 deterministic cases (10 independent slices of 4,000, seeds 21101…21110), half
// VALID (every environment at every legal shape up to the 12-row / 8-column / 64-cell bounds, ragged cases / aligned, empty aligned left
// cells, trailing row separators, multi-line / CRLF / tab whitespace, embedded and consecutive grids, Arabic \text cells, the non-grid v2
// vocabulary) and half INVALID near-misses by kind (unknown / mismatched / missing / extra / nested environments, separators outside a grid
// or inside a group, every bound + 1, ragged matrices, empty cells, row spacing, bad names, bad \mathbb, escape hatches inside cells,
// over-length). Every case: the parser never throws; a valid case is accepted with EXACTLY the generated grid shapes and stored by the
// canonical validator; an invalid case is refused by both. A rendered sample proves the MathML table shape matches the AST.
afterEach(cleanup);
const SLICES = 10, PER_SLICE = 4000;

function gridsOf(n: MathNode, out: { env: string; rows: number[] }[] = []): { env: string; rows: number[] }[] {
  if (n.k === "grid") { out.push({ env: n.env, rows: n.rows.map(r => r.length) }); for (const r of n.rows) for (const c of r) gridsOf(c, out); return out; }
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) for (const x of v) { if (x && typeof x === "object" && "k" in x) gridsOf(x as MathNode, out); }
    else if (v && typeof v === "object" && "k" in v) gridsOf(v as MathNode, out);
  }
  return out;
}
const casesOf = (seed: number, n: number): V2Case[] => { const next = scientificV2Candidates(seed); return Array.from({ length: n }, () => next()); };

describe("21A-GEN generated v2 corpus", () => {
  it("every cell snippet the generator uses is valid on its own", () => {
    for (const c of V2_CELLS) expect(parseMath(c).ok, c).toBe(true);
  });
  for (let k = 0; k < SLICES; k++) {
    it(`slice ${k + 1}/${SLICES} (4,000 cases, seed ${21101 + k}): never throws; valid ⇒ accepted with the exact grid shapes and stored; invalid ⇒ refused`, () => {
      const kinds = new Map<string, number>();
      let valid = 0, invalid = 0;
      for (const c of casesOf(21101 + k, PER_SLICE)) {
        kinds.set(c.kind, (kinds.get(c.kind) ?? 0) + 1);
        let p: ReturnType<typeof parseMath>;
        expect(() => { p = parseMath(c.source); }, c.source.slice(0, 120)).not.toThrow();
        const stored = validateRichContent({ schemaVersion: 1, blocks: [{ type: "math", source: c.source }] });
        if (c.valid) {
          valid++;
          expect(c.source.length, c.kind).toBeLessThanOrEqual(MATH_LIMITS.chars);
          if (!p!.ok) throw new Error(c.kind + " refused: " + p!.message + " :: " + JSON.stringify(c.source.slice(0, 300)));
          expect(gridsOf(p!.ast), c.kind + " :: " + c.source.slice(0, 160)).toEqual(c.grids);
          expect(stored.ok, c.kind).toBe(true);
        } else {
          invalid++;
          if (p!.ok) throw new Error(c.kind + " ACCEPTED: " + JSON.stringify(c.source.slice(0, 300)));
          expect(stored.ok, c.kind).toBe(false);
          expect(stored.issues.map(i => i.code).some(x => x === "RICH_CONTENT_MATH" || x === "RICH_CONTENT_LIMIT"), c.kind).toBe(true);
        }
      }
      expect(valid + invalid).toBe(PER_SLICE);
      expect(valid).toBe(PER_SLICE / 2);
      expect(kinds.size, [...kinds.keys()].join(",")).toBeGreaterThanOrEqual(25);
    });
  }
  const FENCE: Record<string, [string | null, string | null]> = { matrix: [null, null], pmatrix: ["(", ")"], bmatrix: ["[", "]"], vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"], cases: ["{", null], aligned: [null, null] };
  for (let k = 0; k < 4; k++) it(`rendered sample ${k + 1}/4 (100 valid cases, seed ${21196 + k}): one mtable per grid, mtr / mtd counts equal the AST, fences come from the environment`, () => {
    let rendered = 0;
    for (const c of casesOf(21196 + k, 200)) {
      if (!c.valid) continue;
      const { container } = render(<RichMath source={c.source} display />);
      const tables = [...container.querySelectorAll("math mtable")];
      expect(tables.length, c.source.slice(0, 80)).toBe(c.grids.length);
      tables.forEach((t, i) => {
        const g = c.grids[i];
        expect([...t.querySelectorAll(":scope > mtr")].map(r => r.querySelectorAll(":scope > mtd").length)).toEqual(g.rows);
        const [open, close] = FENCE[g.env];
        expect(t.previousElementSibling ? t.previousElementSibling.textContent : null, g.env).toBe(open);
        expect(t.nextElementSibling ? t.nextElementSibling.textContent : null, g.env).toBe(close);
      });
      expect(container.querySelector("math")!.getAttribute("alttext")).toBe(c.source);
      cleanup();
      rendered++;
    }
    expect(rendered).toBe(100);
  });
});
