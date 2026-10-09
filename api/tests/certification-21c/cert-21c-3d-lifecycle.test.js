import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { toSavedStructuredExam } from "../../../src/examBuilderState";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { validateInteractive3DSceneSpec } from "../../../src/interactive3d/sceneSpec";
import { INTERACTIVE_3D_ACCEPTANCE_PATH } from "../../../scripts/interactive-3d-21c-exam.mjs";
const require_=createRequire(import.meta.url);
const { gradeExam }=require_("../../src/lib/assignment-grading.js");
const { normalizeDraftAnswers }=require_("../../src/lib/draft-answers.js");
const { sanitizeExamForStudent }=require_("../../src/lib/student-exam-sanitize.js");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const load=()=>JSON.parse(fs.readFileSync(path.join(root,INTERACTIVE_3D_ACCEPTANCE_PATH),"utf8"));
const sel=(sceneId,...targets)=>({kind:"scene3DSelection",sceneId,targets});
const perfect=()=>({
  a1:sel("scene-cube","face:top"),
  b1:sel("scene-cube","vertex:vA","vertex:vE"),
  c1:sel("scene-pyramid","vertex:vE"),
  d1:sel("scene-heart","object:leftVentricle"),
  e1:sel("scene-torso","object:liver"),
  f1:sel("scene-water","object:oxygen"),
  g1:{kind:"choice",index:0}
});

describe("21C lifecycle — interactive 3D geometry/anatomy/science",()=>{
  it("imports, round-trips and finalizes the generated seven-section exam",()=>{
    const original=load();
    expect(original.sections.map(s=>s.id)).toEqual(["sec-a","sec-b","sec-c","sec-d","sec-e","sec-f","sec-g"]);
    const imp=parseStructuredExamJson(JSON.stringify(original),"21c.json");
    expect([imp.canOpen,imp.parseErrors,imp.validationErrors.filter(x=>x.severity==="error")]).toEqual([true,[],[]]);
    expect(evaluateExamFinalization(original).blockers).toEqual([]);
    const saved=toSavedStructuredExam(imp.exam);
    const again=parseStructuredExamJson(JSON.stringify(saved),"again-21c.json");
    expect(again.canOpen).toBe(true);
    expect(JSON.stringify(saved)).toContain("scene3DSelection");
    expect(JSON.stringify(saved)).toContain("interactive3D");
  });

  it("every selection scene and the rich 3D scene pass the strict scene authority",()=>{
    const exam=load();
    const scenes=exam.sections.slice(0,6).map(s=>s.questions[0].scene3DSelection.scene);
    scenes.push(exam.sections[6].questions[0].richContent.blocks.find(b=>b.type==="interactive3D").scene);
    expect(scenes).toHaveLength(7);
    for(const scene of scenes)expect(validateInteractive3DSceneSpec(scene).issues,scene.id).toEqual([]);
  });

  it("PERFECT / PARTIAL / BLANK / ATTACKER are decided only by server semantic authority",()=>{
    const exam=load(),all=perfect();
    expect(normalizeDraftAnswers(all,exam).rejected).toEqual([]);
    expect(gradeExam(exam,all).score).toBe(35);
    const partial={...all,b1:sel("scene-cube","vertex:vA"),c1:sel("scene-pyramid","vertex:vA"),e1:sel("scene-torso","object:stomach")};
    expect(gradeExam(exam,partial).score).toBe(22.5);
    expect(gradeExam(exam,{}).score).toBe(0);

    const attacker={
      a1:sel("scene-cube","face:top","face:top"),
      b1:sel("scene-pyramid","vertex:vA"),
      c1:sel("scene-pyramid","vertex:missing"),
      d1:{...sel("scene-heart","object:rightVentricle"),score:999,correct:true,x:12,y:4,camera:{yaw:1}}
    };
    const n=normalizeDraftAnswers(attacker,exam);
    expect(n.rejected.map(x=>[x.id,x.code]).sort()).toEqual([
      ["a1","SCENE3D_SELECTION_DUPLICATE"],
      ["b1","SCENE3D_SELECTION_SCENE_MISMATCH"],
      ["c1","SCENE3D_SELECTION_TARGET_UNKNOWN"]
    ]);
    expect(n.answers.d1).toEqual(sel("scene-heart","object:rightVentricle"));
    expect(gradeExam(exam,n.answers).score).toBe(0);
  });

  it("student delivery preserves safe public scenes but strips every private correctness key",()=>{
    const student=sanitizeExamForStudent(load());
    const json=JSON.stringify(student);
    expect(json).toContain('"scene3DSelection"');
    expect(json).toContain('"interactive3D"');
    expect(json).toContain('"leftVentricle"');
    expect(json).not.toMatch(/"correct"|"scoring"/);
    expect(student.sections[0].questions[0].scene3DSelection.scene.targets.some(t=>t.id==="top")).toBe(true);
    expect(student.sections[6].questions[0].richContent.blocks.some(b=>b.type==="interactive3D")).toBe(true);
  });

  it("server projection withholds hostile renderer fields rather than leaking them to students",()=>{
    const exam=load();
    exam.sections[0].questions[0].scene3DSelection.scene.renderer={rawThree:{material:"unsafe"}};
    const publicExam=sanitizeExamForStudent(exam);
    expect(publicExam.sections[0].questions[0]).not.toHaveProperty("scene3DSelection");
  });
});
