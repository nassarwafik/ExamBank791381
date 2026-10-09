// Phase 21C — real production-Vite browser harness: geometry + anatomy + chemistry + semantic selection.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Interactive3DView from "../src/interactive3d/Interactive3DView";
import Scene3DEditor from "../src/interactive3d/Scene3DEditor";
import { scene3DPreset } from "../src/interactive3d/scenePresets";
import type { Interactive3DSceneSpecV1 } from "../src/interactive3d/sceneSpec";

function Harness(){
  const [cube,setCube]=useState<string[]>([]);
  const [heart,setHeart]=useState<string[]>([]);
  const [teacher,setTeacher]=useState<Interactive3DSceneSpecV1>(()=>scene3DPreset("pyramid","editor-scene"));
  return <main style={{padding:"12px",maxWidth:"1200px",marginInline:"auto",boxSizing:"border-box"}}>
    <h1>اختبار محرك النماذج ثلاثية الأبعاد 21C</h1>
    <section data-testid="cube-question"><Interactive3DView spec={scene3DPreset("cube","cube-q")} selection={{kind:"face",mode:"single",max:1,value:cube,label:"اختر وجهًا من المكعب",onChange:setCube}}/><output data-testid="cube-answer">{JSON.stringify(cube)}</output></section>
    <section data-testid="pyramid"><Interactive3DView spec={scene3DPreset("pyramid","pyramid-q")}/></section>
    <section data-testid="heart-question"><Interactive3DView spec={scene3DPreset("heart","heart-q")} selection={{kind:"object",mode:"single",max:1,value:heart,label:"اختر جزءًا من القلب",onChange:setHeart}}/><output data-testid="heart-answer">{JSON.stringify(heart)}</output></section>
    <section data-testid="torso"><Interactive3DView spec={scene3DPreset("torso","torso-q")}/></section>
    <section data-testid="water"><Interactive3DView spec={scene3DPreset("water","water-q")}/></section>
    <section data-testid="editor"><h2>واجهة التأليف</h2><Scene3DEditor scene={teacher} onChange={setTeacher} name="المشهد" preview={false}/></section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
