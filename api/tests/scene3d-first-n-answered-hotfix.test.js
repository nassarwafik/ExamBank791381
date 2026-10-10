import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { answered } from "../../src/answerState";

// Hotfix — a scene3DSelection@1 answer was never "answered" for the SERVER's section policy (exam-structure.isResponseAnswered had no
// case for it, while the client's answered() counts every semantic target selection). In a firstNAnswered section the student's 3D
// answer therefore never consumed a slot and was never graded: a correct answer scored 0, and a later wrong answer took its slot — a
// manufactured academic zero. Fail-first on 8ff966f; the server now mirrors the client for every answer kind.
const require_ = createRequire(import.meta.url);
const { isResponseAnswered } = require_("../src/lib/exam-structure.js");
const { gradeExam } = require_("../src/lib/assignment-grading.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const exam21c = () => JSON.parse(fs.readFileSync(path.join(root, "docs/fixtures/interactive-3d-21c/ExamBank_21C_Interactive_3D_Acceptance.json"), "utf8"));

describe("hotfix — scene3DSelection answers count as answered on the server", () => {
  it("a 3D target selection is answered when it selects something, and not when empty", () => {
    expect(isResponseAnswered({ kind: "scene3DSelection", sceneId: "scene-heart", targets: ["object:leftVentricle"] })).toBe(true);
    expect(isResponseAnswered({ kind: "scene3DSelection", sceneId: "scene-heart", targets: [] })).toBe(false);
  });

  it("server and client agree on answered-ness for every answer kind (non-empty and empty samples)", () => {
    const samples = [
      { kind: "choice", index: 0 }, { kind: "text", value: "x" }, { kind: "sequence", values: ["a"] }, { kind: "table", values: [true] },
      { kind: "fields", values: { a: "x" } }, { kind: "compound", parts: { a: { kind: "choice", index: 1 } } }, { kind: "multiChoice", optionIds: ["o1"] },
      { kind: "numeric", value: "3" }, { kind: "code", language: "python", languageVersion: 3, source: "print(1)" },
      { kind: "networkCli", commands: ["show vlan"], state: {} }, { kind: "hotspot", points: [{ x: 0.1, y: 0.2 }] },
      { kind: "chartSelection", chartId: "c", targets: ["category:a"] }, { kind: "functionGraphSelection", graphId: "g", targets: ["point:p"] },
      { kind: "scene3DSelection", sceneId: "s", targets: ["object:o"] }, { kind: "smartSim", pluginKey: "p", pluginVersion: 1, actions: [{}], state: {} },
      { kind: "codeTemplate", language: "python", languageVersion: 3, values: { g1: "x" } }
    ];
    const empty = s => JSON.parse(JSON.stringify(s), (k, v) => (Array.isArray(v) ? [] : k === "value" || k === "source" ? "" : k === "index" ? null : v));
    for (const s of samples) {
      expect(isResponseAnswered(s), s.kind).toBe(answered(s));
      expect(isResponseAnswered(s), s.kind).toBe(true);
      const e = empty(s);
      if (s.kind !== "fields" && s.kind !== "compound" && s.kind !== "codeTemplate") expect(isResponseAnswered(e), s.kind + " (empty)").toBe(answered(e));
    }
  });

  it("firstNAnswered: a correct 3D answer takes its slot and is graded (never displaced by a later answer)", () => {
    const exam = exam21c();
    const q3d = exam.sections[3].questions[0], qmc = exam.sections[6].questions[0];
    const sec = { ...exam.sections[3], id: "sec-x", gradingPolicy: "firstNAnswered", requiredAnswers: 1, questions: [q3d, qmc] };
    const one = { ...exam, sections: [sec] };
    const a3d = { [q3d.examQuestionId]: { kind: "scene3DSelection", sceneId: "scene-heart", targets: ["object:leftVentricle"] } };
    expect(gradeExam(one, a3d).score).toBe(5);
    expect(gradeExam(one, { ...a3d, [qmc.examQuestionId]: { kind: "choice", index: 1 } }).score).toBe(5);
    expect(gradeExam({ ...one, sections: [{ ...sec, gradingPolicy: "all", requiredAnswers: null }] }, a3d).score).toBe(5);
  });
});
