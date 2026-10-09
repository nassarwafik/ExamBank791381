import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as graphFixtures from "../../../src/functionGraphs/testing/graphFixtures";
import { buildGraphsAcceptanceExam, serializeExam, GRAPHS_ACCEPTANCE_PATH } from "../../../scripts/function-graphs-21a2-exam.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("21A2-FIX deterministic acceptance corpus", () => {
  it("the committed exam is byte-for-byte generated from the shared certified graph fixtures", () => {
    const committed = fs.readFileSync(path.join(repo, GRAPHS_ACCEPTANCE_PATH), "utf8");
    expect(committed).toBe(serializeExam(buildGraphsAcceptanceExam(graphFixtures)));
  });
  it("contains all nine curriculum sections and a selection child in the composite", () => {
    const e = buildGraphsAcceptanceExam(graphFixtures);
    expect(e.sections.map(s => s.id)).toEqual(["sec-a","sec-b","sec-c","sec-d","sec-e","sec-f","sec-g","sec-h","sec-i"]);
    const p = e.sections[8].questions[0].composite.groups[0].parts;
    expect(p.map(x => x.type)).toEqual(["functionGraphSelection", "numericResponse"]);
  });
  it("keeps private scoring keys and teacher-only mathematical roles out of the public-looking prose", () => {
    const e = buildGraphsAcceptanceExam(graphFixtures);
    const flat = e.sections.flatMap(s => s.questions);
    expect(flat.slice(0, 8).every(q => q.answer.correct.every(k => typeof k === "string"))).toBe(true);
    expect(e.coverPage.instructions).not.toMatch(/point:p1|line:l1|role|correct/);
  });
  it("asymptote distractors are visually neutral, never leaked by distinctive line styles", () => {
    const g = buildGraphsAcceptanceExam(graphFixtures).sections[1].questions[0].functionGraphSelection.graph;
    expect(new Set(g.lines.map(l => l.style.line))).toEqual(new Set(["solid"]));
  });
});
