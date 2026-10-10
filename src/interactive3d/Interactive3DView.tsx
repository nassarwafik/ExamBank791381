import { useId, useMemo, useState } from "react";
import { buildInteractive3DMesh, projectInteractive3DScene, scene3DQualityFor, SCENE3D_INTERACTION_BUDGET, SCENE3D_REST_BUDGET, type ProjectedScene3DFace, type ProjectedScene3DLine, type Scene3DMesh, type Scene3DQuality } from "./sceneMesh";
import { useOrbitCamera, type OrbitLimits } from "./orbitCamera";
import { SCENE3D_LIMITS, SCENE3D_TARGET_KIND_LABELS, scene3DTargetKey, scene3DTargets, validateInteractive3DSceneSpec, type Interactive3DSceneSpecV1, type Scene3DTargetKind, type Scene3DTargetV1 } from "./sceneSpec";
import "./interactive3d.css";

// Phase 21D — the production viewer of Interactive3DSceneSpecV1 (owned SVG renderer; no WebGL, no external asset). The camera is the
// shared orbit controller (orbitCamera.ts); geometry, framing and lighting come from sceneMesh.ts. Presentation state (camera, display
// mode, quality) never reaches an answer: answers are semantic target keys emitted only by explicit selection.
export type Interactive3DSelection = {
  kind: Scene3DTargetKind;
  mode: "single" | "multiple";
  max: number;
  value: string[];
  label?: string;
  readOnly?: boolean;
  review?: Record<string, "correct" | "incorrect" | "missed">;
  onChange: (next:string[])=>void;
};
export type Scene3DDisplayMode = "solidEdges" | "solid" | "wireframe" | "transparent";
const MODES: readonly Scene3DDisplayMode[] = ["solidEdges", "solid", "wireframe", "transparent"];
const MODE_LABELS: Readonly<Record<Scene3DDisplayMode, string>> = { solidEdges: "مجسم مع الحواف", solid: "مجسم", wireframe: "هيكل سلكي", transparent: "شفاف" };
type QualityChoice = "auto" | Exclude<Scene3DQuality, "draft">;
const QUALITY_CHOICES: readonly QualityChoice[] = ["auto", "low", "medium", "high"];
const QUALITY_LABELS: Readonly<Record<QualityChoice, string>> = { auto: "تلقائية", low: "منخفضة", medium: "متوسطة", high: "عالية" };
const LIMITS: OrbitLimits = { pitchMin: -1.45, pitchMax: 1.45, zoomMin: SCENE3D_LIMITS.zoomMin, zoomMax: SCENE3D_LIMITS.zoomMax };
const SELECTED_TINT = "#f2b134";
const REVIEW_TINT: Readonly<Record<"correct" | "incorrect" | "missed", string>> = { correct: "#2f9e5b", incorrect: "#c2413b", missed: "#d39b2a" };

// meshes are shared between viewers and re-renders (bounded): a parent that re-derives an identical scene never rebuilds geometry
const MESHES = new Map<string, Scene3DMesh>();
function meshFor(scene: Interactive3DSceneSpecV1, contentKey: string, quality: Scene3DQuality): Scene3DMesh {
  const key = quality + "|" + contentKey, hit = MESHES.get(key);
  if (hit) return hit;
  const mesh = buildInteractive3DMesh(scene, quality);
  MESHES.set(key, mesh);
  if (MESHES.size > 12) MESHES.delete(MESHES.keys().next().value as string);
  return mesh;
}
const mix = (a: string, b: string, t: number) => "#" + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("");

function targetForFace(targets: Scene3DTargetV1[], objectId:string, element?:string){
  return targets.find(t=>t.kind==="face"&&t.objectId===objectId&&t.element===element) ?? targets.find(t=>t.kind==="object"&&t.objectId===objectId);
}
function targetForEdge(targets: Scene3DTargetV1[], objectId:string, element?:string){
  return targets.find(t=>t.kind==="edge"&&t.objectId===objectId&&t.element===element);
}
function targetForVertex(targets: Scene3DTargetV1[], objectId:string, element?:string){
  return targets.find(t=>t.kind==="vertex"&&t.objectId===objectId&&t.element===element);
}
type Item = { face: ProjectedScene3DFace; line?: undefined } | { line: ProjectedScene3DLine; face?: undefined };
/** Lines drawn per display mode. While the model moves in the solid modes only true edges (creases) are drawn: silhouettes are the
 *  most numerous lines and the lit facets already show the outline; they return as soon as the motion settles. */
function lineShown(mode: Scene3DDisplayMode, moving: boolean, l: { kind: ProjectedScene3DLine["kind"]; front: boolean }): boolean {
  if (mode === "wireframe") return true;
  if (mode === "transparent") return l.kind !== "facet";
  if (mode === "solid") return !moving && l.kind === "silhouette";
  return l.front && (l.kind === "crease" || (!moving && l.kind === "silhouette"));
}

export default function Interactive3DView({ spec, selection }:{spec:Interactive3DSceneSpecV1;selection?:Interactive3DSelection}) {
  const uid=useId().replace(/[^A-Za-z0-9_-]/g,"");
  const checked=useMemo(()=>validateInteractive3DSceneSpec(spec),[spec]);
  const value=checked.ok?checked.value:null;
  const contentKey=useMemo(()=>value?JSON.stringify(value):"",[value]);
  const [mode,setMode]=useState<Scene3DDisplayMode>("solidEdges");
  const [qualityChoice,setQualityChoice]=useState<QualityChoice>("auto");
  const {camera,interacting,autoRotating,reducedMotion,reset,rotateBy,zoomBy,fit,setAutoRotate,consumeSuppressedClick,attachTo,onKeyDown,pointerHandlers}=useOrbitCamera({
    initial:value?value.camera:{yaw:0,pitch:0,zoom:1},
    resetKey:value?value.id+"|"+value.camera.yaw+"|"+value.camera.pitch+"|"+value.camera.zoom:"",
    limits:LIMITS, rotate:!!value?.interaction.rotate, zoom:!!value?.interaction.zoom
  });
  const restQuality:Scene3DQuality=!value?"draft":qualityChoice==="auto"?scene3DQualityFor(value,SCENE3D_REST_BUDGET):qualityChoice;
  const motionQuality:Scene3DQuality=!value?"draft":qualityChoice==="auto"?scene3DQualityFor(value,SCENE3D_INTERACTION_BUDGET,restQuality):qualityChoice;
  const quality=interacting?motionQuality:restQuality;
  const mesh=useMemo(()=>value?meshFor(value,contentKey,quality):null,[value,contentKey,quality]);
  const scene=useMemo(()=>{
    if(!value||!mesh)return null;
    // only what this display mode draws is projected in full (see showFace / showLine below)
    const opaque=new Set(value.objects.filter(o=>(o.opacity??1)>=1).map(o=>o.id)), seeThrough=mode==="transparent"||mode==="wireframe";
    return projectInteractive3DScene(mesh,value,camera,undefined,undefined,{
      face:f=>mode!=="wireframe"&&(f.front||f.rim||seeThrough||!opaque.has(f.objectId)),
      line:l=>lineShown(mode,interacting,l)
    });
  },[value,mesh,camera,mode,interacting]);
  if(!value||!mesh||!scene||!mesh.faces.length) return <p className="i3d-unavailable" role="alert">تعذّر عرض المشهد ثلاثي الأبعاد؛ يحتاج مراجعة المعلم.</p>;
  const targets=selection?scene3DTargets(value,selection.kind):[];
  const selected=new Set(selection?.value??[]);
  const enabled=!!selection&&value.interaction.select&&!selection.readOnly;
  const toggle=(t:Scene3DTargetV1)=>{
    if(!selection||!enabled)return;
    const key=scene3DTargetKey(t), has=selected.has(key);
    if(selection.mode==="single"){selection.onChange(has?[]:[key]);return;}
    if(has){selection.onChange(selection.value.filter(x=>x!==key));return;}
    if(selection.value.length>=Math.max(1,selection.max))return;
    selection.onChange([...selection.value,key]);
  };
  const clickTarget=(t?:Scene3DTargetV1)=>{ if(consumeSuppressedClick()||!t)return; toggle(t); };
  const objects=new Map(value.objects.map(o=>[o.id,o]));
  const seeThrough=mode==="transparent"||mode==="wireframe";
  const showFace=(f:ProjectedScene3DFace)=>mode!=="wireframe"&&(f.front||f.rim||seeThrough||(objects.get(f.objectId)?.opacity??1)<1);
  const showLine=(l:ProjectedScene3DLine)=>lineShown(mode,interacting,l);
  const faces=scene.faces.filter(showFace), lines=scene.lines.filter(showLine), items:Item[]=[];
  for(let i=0,j=0;i<faces.length||j<lines.length;){
    if(j>=lines.length||(i<faces.length&&faces[i].depth<=lines[j].depth)) items.push({face:faces[i++]}); else items.push({line:lines[j++]});
  }
  const faceOpacity=(f:ProjectedScene3DFace)=>mode==="transparent"?Math.min(f.opacity,0.38):f.opacity;
  const targetLabel=selection?.label??(selection?"اختر "+SCENE3D_TARGET_KIND_LABELS[selection.kind]+" من النموذج":undefined);
  const r2=(n:number)=>Math.round(n*1000)/1000;
  return <figure className="i3d" dir="rtl" aria-labelledby={uid+"-title"} data-scene3d-id={value.id}>
    <figcaption>
      <strong id={uid+"-title"}>{value.title}</strong>
      <p>{value.description}</p>
    </figcaption>
    <div className="i3d-controls" role="group" aria-label="أدوات عرض النموذج ثلاثي الأبعاد">
      {value.interaction.rotate&&<>
        <button type="button" className="i3d-icon" title="تدوير لليسار" aria-label="تدوير لليسار" onClick={()=>rotateBy(-.2,0)}>⟲</button>
        <button type="button" className="i3d-icon" title="تدوير لليمين" aria-label="تدوير لليمين" onClick={()=>rotateBy(.2,0)}>⟳</button>
        <button type="button" className="i3d-icon" title="رفع المنظور" aria-label="رفع المنظور" onClick={()=>rotateBy(0,.15)}>⤒</button>
        <button type="button" className="i3d-icon" title="خفض المنظور" aria-label="خفض المنظور" onClick={()=>rotateBy(0,-.15)}>⤓</button>
      </>}
      {value.interaction.zoom&&<>
        <button type="button" className="i3d-icon" title="تكبير" aria-label="تكبير" onClick={()=>zoomBy(1.12)}>+</button>
        <button type="button" className="i3d-icon" title="تصغير" aria-label="تصغير" onClick={()=>zoomBy(1/1.12)}>−</button>
        <button type="button" onClick={fit}>عرض النموذج كاملًا</button>
      </>}
      <button type="button" onClick={reset}>إعادة العرض</button>
      {value.interaction.rotate&&!reducedMotion&&<button type="button" aria-pressed={autoRotating} onClick={()=>setAutoRotate(!autoRotating)}>{autoRotating?"إيقاف الدوران التلقائي":"دوران تلقائي"}</button>}
    </div>
    <div className="i3d-options">
      <label>طريقة العرض <select value={mode} onChange={e=>setMode(e.target.value as Scene3DDisplayMode)}>{MODES.map(m=><option key={m} value={m}>{MODE_LABELS[m]}</option>)}</select></label>
      <label>جودة العرض <select value={qualityChoice} onChange={e=>setQualityChoice(e.target.value as QualityChoice)}>{QUALITY_CHOICES.map(q=><option key={q} value={q}>{QUALITY_LABELS[q]}</option>)}</select></label>
    </div>
    <p id={uid+"-help"} className="i3d-help">اسحب النموذج لتدويره بحرية في كل الاتجاهات. للتكبير: إصبعان على الشاشة اللمسية، أو عجلة الفأرة بعد النقر على النموذج (أو مع Ctrl). بعد التركيز على النموذج: الأسهم للتدوير، و+ و− للتكبير والتصغير، وHome لإعادة العرض.</p>
    {targetLabel&&<p className="i3d-selection-label">{targetLabel}</p>}
    <svg ref={attachTo} className="i3d-scene" viewBox={"0 0 "+scene.width+" "+scene.height} role="img" tabIndex={0}
      aria-describedby={uid+"-help"} aria-label={"نموذج ثلاثي الأبعاد: "+value.title}
      data-yaw={r2(camera.yaw)} data-pitch={r2(camera.pitch)} data-zoom={r2(camera.zoom)} data-quality={mesh.quality} data-mode={mode} data-interacting={interacting||undefined}
      onKeyDown={e=>{if(onKeyDown(e))e.preventDefault();}} {...pointerHandlers}>
      <defs><radialGradient id={uid+"-bg"} cx="50%" cy="42%" r="72%"><stop offset="0%" stopColor="#ffffff"/><stop offset="100%" stopColor="#e6eef6"/></radialGradient></defs>
      <rect width={scene.width} height={scene.height} className="i3d-bg" fill={"url(#"+uid+"-bg)"}/>
      {items.map(it=>{
        if(it.line){const l=it.line;return <line key={l.id} className={"i3d-line i3d-line-"+l.kind+(l.front?"":" is-hidden")} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}/>;}
        const f=it.face, t=selection?targetForFace(targets,f.objectId,f.element):undefined, key=t?scene3DTargetKey(t):"", active=!!key&&selected.has(key), mark=key?selection?.review?.[key]:undefined;
        const fill=mark?mix(f.fill,REVIEW_TINT[mark],.42):active?mix(f.fill,SELECTED_TINT,.45):f.fill, op=faceOpacity(f);
        return <polygon key={f.id} points={f.points} fill={fill} stroke={fill} fillOpacity={op} strokeOpacity={op}
          className={"i3d-face"+(f.curved?" is-curved":"")+(f.front||f.rim?"":" is-back")+(t?" i3d-target":"")+(active?" is-selected":"")+(mark?" review-"+mark:"")} data-i3d-target={key||undefined}
          onClick={t?()=>clickTarget(t):undefined} aria-label={t?.label}/>;
      })}
      {selection?.kind==="edge"&&scene.edges.map(e=>{
        const t=targetForEdge(targets,e.objectId,e.element); if(!t||(!e.visible&&!seeThrough))return null; const key=scene3DTargetKey(t),active=selected.has(key),mark=selection?.review?.[key];
        return <g key={e.id}><line className={"i3d-edge-target"+(active?" is-selected":"")+(mark?" review-"+mark:"")+(e.visible?"":" is-hidden")} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} onClick={()=>clickTarget(t)} data-i3d-target={key}/>
          <line className="i3d-edge-hit" x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} onClick={()=>clickTarget(t)} /></g>;
      })}
      {selection?.kind==="vertex"&&scene.points.map((p,i)=>{
        const t=targetForVertex(targets,p.objectId,p.element);if(!t||(!p.visible&&!seeThrough))return null;const key=scene3DTargetKey(t),active=selected.has(key),mark=selection?.review?.[key];
        return <circle key={i} cx={p.x} cy={p.y} r={active?8:6} className={"i3d-vertex-target"+(active?" is-selected":"")+(mark?" review-"+mark:"")} onClick={()=>clickTarget(t)} data-i3d-target={key}/>;
      })}
    </svg>
    {selection&&<div className="i3d-target-list" role="group" aria-label={targetLabel}>
      {targets.map(t=>{const key=scene3DTargetKey(t),active=selected.has(key),mark=selection.review?.[key],reviewText=mark==="correct"?"صحيح":mark==="incorrect"?"غير صحيح":mark==="missed"?"إجابة صحيحة لم تُختر":"";return <button type="button" key={key} aria-pressed={active}
        disabled={selection.readOnly} className={(active?"is-selected ":"")+(mark?"review-"+mark:"")} onClick={()=>toggle(t)}><span>{t.label}</span>{t.detail&&<small>{t.detail}</small>}{reviewText&&<small className="i3d-review-mark">{reviewText}</small>}</button>;})}
    </div>}
    <details className="i3d-summary"><summary>وصف نصي بديل للنموذج</summary>
      <ul>{value.objects.map(o=><li key={o.id}>{o.label} — {o.kind}</li>)}</ul>
    </details>
  </figure>;
}
