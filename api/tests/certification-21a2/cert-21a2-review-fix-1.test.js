import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Phase 21A.2 — Review Fix 1, finding B-1 at the server authority: a functionGraphSelection whose tangent was justified only by an authored
// derivative curve (teacher-only; removed from the student projection) passed server finalization on 65c21e7, was published and delivered,
// could not render for the student, and a blank attempt graded 0 without review. The server must refuse it before publishing.
const require_ = createRequire(import.meta.url);
const { evaluateServerFinalization } = require_("../../src/lib/server-finalization.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const { validateFunctionGraphSpec } = require_("../../src/lib/shared-finalization/functionGraphs/functionGraphSpec.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const load = () => JSON.parse(fs.readFileSync(path.join(root, "docs/fixtures/function-graphs-21a2/ExamBank_21A2_Function_Graphs_Mini_Acceptance.json"), "utf8"));
const question = (exam, id) => exam.sections.flatMap(s => s.questions).find(q => q.examQuestionId === id);
const graphsIn = (value, out = []) => {
  if (Array.isArray(value)) value.forEach(v => graphsIn(v, out));
  else if (value && typeof value === "object") {
    if (value.version === 1 && Array.isArray(value.curves) && value.viewport) out.push(value);
    Object.values(value).forEach(v => graphsIn(v, out));
  }
  return out;
};

describe("21A2-RF1 B-1 server authority keeps every published graph renderable for the student", () => {
  it("RF1: server finalization refuses a tangent justified only by an authored derivative curve", () => {
    const exam = load();
    const f1 = question(exam, "f1");
    f1.functionGraphSelection.graph = {
      version: 1, id: "g-end", title: "مماس عند طرف المجال", description: "f(x) = x² على x ≥ 0 ومشتقتها 2x، ومماسان T1 و T2.",
      viewport: { xMin: -1, xMax: 3, yMin: -1, yMax: 9 },
      curves: [
        { id: "f", kind: "explicit", label: "f", expression: "x^2", domain: { min: 0 } },
        { id: "df", kind: "explicit", label: "df", expression: "2*x", derivativeOf: "f" }
      ],
      tangents: [{ id: "t1", curve: "f", x: 0, kind: "tangent", label: "T1" }, { id: "t2", curve: "f", x: 1, kind: "tangent", label: "T2" }]
    };
    f1.answer = { scoring: "allOrNothing", correct: ["tangent:t1"] };
    expect(evaluateServerFinalization(exam).canFinalize).toBe(false);
  });

  it("pin: every graph the student receives for the acceptance exam validates again on its own", () => {
    const exam = load();
    expect(evaluateServerFinalization(exam).canFinalize).toBe(true);
    const delivered = graphsIn(sanitizeExamForStudent(exam));
    expect(delivered.length).toBeGreaterThanOrEqual(10);
    for (const g of delivered) expect(validateFunctionGraphSpec(g).ok, g.id).toBe(true);
  });
});
