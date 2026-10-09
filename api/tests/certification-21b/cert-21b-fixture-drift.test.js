import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSurfacesAcceptanceExam, serializeExam, SURFACES_ACCEPTANCE_PATH, SURFACES_21B } from "../../../scripts/function-surfaces-21b-exam.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("21B-FIX deterministic 3D surface acceptance corpus", () => {
  it("the committed exam is byte-for-byte generated from the 21B source", () => {
    const committed = fs.readFileSync(path.join(repo, SURFACES_ACCEPTANCE_PATH), "utf8");
    expect(committed).toBe(serializeExam(buildSurfacesAcceptanceExam()));
  });
  it("contains four distinct safe persisted functionSurface3D blocks", () => {
    const e = buildSurfacesAcceptanceExam();
    const blocks = e.sections.flatMap(s => s.questions).map(q => q.richContent.blocks.find(b => b.type === "functionSurface3D"));
    expect(blocks).toHaveLength(4);
    expect(new Set(blocks.map(b => b.surface.id)).size).toBe(4);
    expect(blocks.map(b => b.surface.expression)).toEqual(Object.values(SURFACES_21B).map(s => s.expression));
    expect(JSON.stringify(blocks)).not.toMatch(/rawSvg|renderer|three|webgl|callback|script/i);
  });
});
