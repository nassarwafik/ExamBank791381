import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as chartFixtures from "../../../src/charts/testing/chartFixtures";
import { buildChartsAcceptanceExam, serializeExam, CHARTS_ACCEPTANCE_PATH } from "../../../scripts/data-charts-21a1-exam.mjs";

// Phase 21A.1 — the committed Interactive Charts Mini Acceptance Exam is GENERATED from the shared chart fixtures the unit suites also use.
// This pins the committed file to the builder's output byte-for-byte: a change to a shared fixture (or to the builder) that is not followed
// by `node scripts/generate-data-charts-21a1-fixture.mjs` fails here instead of drifting silently from the delivered exam.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("21A1-FIX acceptance fixture drift", () => {
  it("the committed acceptance exam is byte-for-byte the builder's output from the shared chart fixtures", () => {
    const committed = fs.readFileSync(path.join(repo, CHARTS_ACCEPTANCE_PATH), "utf8");
    expect(committed).toBe(serializeExam(buildChartsAcceptanceExam(chartFixtures)));
  });
  it("the scatter question's points carry neutral ids and no label (nothing on the chart names the answer)", () => {
    const exam = JSON.parse(fs.readFileSync(path.join(repo, CHARTS_ACCEPTANCE_PATH), "utf8"));
    const c1 = exam.sections.flatMap(s => s.questions).find(q => q.examQuestionId === "c1");
    const points = c1.chartSelection.chart.series.flatMap(s => s.points);
    expect(points.map(p => p.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(points.some(p => "label" in p)).toBe(false);
    expect(c1.answer.correct).toEqual(["p2"]);
  });
});
