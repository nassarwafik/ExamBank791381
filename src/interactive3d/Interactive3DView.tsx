import { useEffect, useId, useMemo, useRef, useState } from "react";
import { buildInteractive3DMesh, projectInteractive3DScene } from "./sceneMesh";
import { SCENE3D_TARGET_KIND_LABELS, scene3DTargetKey, scene3DTargets, validateInteractive3DSceneSpec, type Interactive3DSceneSpecV1, type Scene3DCamera, type Scene3DTargetKind, type Scene3DTargetV1 } from "./sceneSpec";
import "./interactive3d.css";

const FILLS = ["#e7edf3","#c6d9ea","#9fc4df","#7fb2d5","#8fc5af","#d6a1a9","#d9b870","#adb5c8"];
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const start=(s:Interactive3DSceneSpecV1):Scene3DCamera=>({...s.camera});
export type Interactive3DSelection = {
  kind: Scene3DTargetKind;
  mode: "single" | "multiple";
  max: number;
  value: string[];
  label?: string;
  readOnly?: boolean;
  onChange: (next:string[])=>void;
};

function targetForFace(targets: Scene3DTargetV1[], objectId:string, element?:string){
  return targets.find(t=>t.kind==="face"&&t.objectId===objectId&&t.element===element) ?? targets.find(t=>t.kind==="object"&&t.objectId===objectId);
}
function targetForEdge(targets: Scene3DTargetV1[], objectId:string, element?:string){
  return targets.find(t=>t.kind==="edge"&&t.objectId===objectId&&t.element===element);
}
function targetForVertex(targets: Scene3DTargetV1[], objectId:string, element?:string){
  return targets.find(t=>t.kind==="vertex"&&t.objectId===objectId&&t.element===element);
}

export default function Interactive3DView({ spec, selection }:{spec:Interactive3DSceneSpecV1;selection?:Interactive3DSelection}) {
  const uid=useId().replace(/[^A-Za-z0-9_-]/g,"");
  const checked=useMemo(()=>validateInteractive3DSceneSpec(spec),[spec]);
  const [camera,setCamera]=useState<Scene3DCamera>(()=>start(spec));
  const drag=useRef<{id:number;x:number;y:number;yaw:number;pitch:number}|null>(null);
  useEffect(()=>setCamera(start(spec)),[spec]);
  const mesh=useMemo(()=>checked.ok?buildInteractive3DMesh(checked.value):null,[checked]);
  const scene=useMemo(()=>checked.ok&&mesh?projectInteractive3DScene(mesh,checked.value,camera):null,[checked,mesh,camera]);
  if(!checked.ok||!mesh||!scene||!mesh.faces.length) return <p className="i3d-unavailable" role="alert">تعذّر عرض المشهد ثلاثي الأبعاد؛ يحتاج مراجعة المعلم.</p>;
  const targets=selection?scene3DTargets(checked.value,selection.kind):[];
  const selected=new Set(selection?.value??[]);
  const enabled=!!selection&&checked.value.interaction.select&&!selection.readOnly;
  const reset=()=>setCamera(start(checked.value));
  const toggle=(t:Scene3DTargetV1)=>{
    if(!selection||!enabled)return;
    const key=scene3DTargetKey(t), has=selected.has(key);
    if(selection.mode==="single"){selection.onChange(has?[]:[key]);return;}
    if(has){selection.onChange(selection.value.filter(x=>x!==key));return;}
    if(selection.value.length>=Math.max(1,selection.max))return;
    selection.onChange([...selection.value,key]);
  };
  const keyCamera=(key:string)=>{
    if(!checked.value.interaction.rotate&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(key))return false;
    if(key==="ArrowLeft")setCamera(v=>({...v,yaw:clamp(v.yaw-.18,-Math.PI,Math.PI)}));
    else if(key==="ArrowRight")setCamera(v=>({...v,yaw:clamp(v.yaw+.18,-Math.PI,Math.PI)}));
    else if(key==="ArrowUp")setCamera(v=>({...v,pitch:clamp(v.pitch+.13,-1.35,1.35)}));
    else if(key==="ArrowDown")setCamera(v=>({...v,pitch:clamp(v.pitch-.13,-1.35,1.35)}));
    else if((key==="+"||key==="=")&&checked.value.interaction.zoom)setCamera(v=>({...v,zoom:clamp(v.zoom+.12,.55,2.2)}));
    else if(key==="-"&&checked.value.interaction.zoom)setCamera(v=>({...v,zoom:clamp(v.zoom-.12,.55,2.2)}));
    else if(key==="Home")reset(); else return false;
    return true;
  };
  const targetLabel=selection?.label??(selection?"اختر "+SCENE3D_TARGET_KIND_LABELS[selection.kind]+" من النموذج":undefined);
  return <figure className="i3d" dir="rtl" aria-labelledby={uid+"-title"} data-scene3d-id={checked.value.id}>
    <figcaption>
      <strong id={uid+"-title"}>{checked.value.title}</strong>
      <p>{checked.value.description}</p>
    </figcaption>
    <div className="i3d-controls" role="group" aria-label="أدوات عرض النموذج ثلاثي الأبعاد">
      {checked.value.interaction.rotate&&<>
        <button type="button" onClick={()=>setCamera(v=>({...v,yaw:clamp(v.yaw-.2,-Math.PI,Math.PI)}))}>تدوير لليسار</button>
        <button type="button" onClick={()=>setCamera(v=>({...v,yaw:clamp(v.yaw+.2,-Math.PI,Math.PI)}))}>تدوير لليمين</button>
        <button type="button" onClick={()=>setCamera(v=>({...v,pitch:clamp(v.pitch+.15,-1.35,1.35)}))}>رفع المنظور</button>
        <button type="button" onClick={()=>setCamera(v=>({...v,pitch:clamp(v.pitch-.15,-1.35,1.35)}))}>خفض المنظور</button>
      </>}
      {checked.value.interaction.zoom&&<>
        <button type="button" onClick={()=>setCamera(v=>({...v,zoom:clamp(v.zoom+.12,.55,2.2)}))}>تكبير</button>
        <button type="button" onClick={()=>setCamera(v=>({...v,zoom:clamp(v.zoom-.12,.55,2.2)}))}>تصغير</button>
      </>}
      <button type="button" onClick={reset}>إعادة العرض</button>
    </div>
    <p id={uid+"-help"} className="i3d-help">دوّر النموذج بالسحب أو بالأسهم بعد التركيز عليه. استخدم + و− للتكبير والتصغير، وHome لإعادة العرض.</p>
    {targetLabel&&<p className="i3d-selection-label">{targetLabel}</p>}
    <svg className="i3d-scene" viewBox={"0 0 "+scene.width+" "+scene.height} role="img" tabIndex={0}
      aria-describedby={uid+"-help"} aria-label={"نموذج ثلاثي الأبعاد: "+checked.value.title}
      onKeyDown={e=>{if(keyCamera(e.key))e.preventDefault();}}
      onPointerDown={e=>{if(!checked.value.interaction.rotate)return;drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:camera.yaw,pitch:camera.pitch};e.currentTarget.setPointerCapture?.(e.pointerId);}}
      onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;setCamera(v=>({...v,yaw:clamp(d.yaw+(e.clientX-d.x)*.01,-Math.PI,Math.PI),pitch:clamp(d.pitch-(e.clientY-d.y)*.008,-1.35,1.35)}));}}
      onPointerUp={e=>{if(drag.current?.id===e.pointerId)drag.current=null;e.currentTarget.releasePointerCapture?.(e.pointerId);}}
      onPointerCancel={e=>{if(drag.current?.id===e.pointerId)drag.current=null;}}>
      <rect width={scene.width} height={scene.height} className="i3d-bg"/>
      {scene.faces.map(f=>{
        const t=selection?targetForFace(targets,f.objectId,f.element):undefined, key=t?scene3DTargetKey(t):"", active=!!key&&selected.has(key);
        return <polygon key={f.id} points={f.points} fill={FILLS[(f.palette-1)%FILLS.length]} fillOpacity={f.opacity}
          className={"i3d-face"+(t?" i3d-target":"")+(active?" is-selected":"")} data-i3d-target={key||undefined}
          onClick={()=>{if(t)toggle(t);}} aria-label={t?.label}/>;
      })}
      {selection?.kind==="edge"&&scene.edges.map(e=>{
        const t=targetForEdge(targets,e.objectId,e.element); if(!t)return null; const key=scene3DTargetKey(t),active=selected.has(key);
        return <g key={e.id}><line className={"i3d-edge-target"+(active?" is-selected":"")} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} onClick={()=>toggle(t)} data-i3d-target={key}/>
          <line className="i3d-edge-hit" x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} onClick={()=>toggle(t)} /></g>;
      })}
      {selection?.kind==="vertex"&&scene.points.map((p,i)=>{
        const t=targetForVertex(targets,p.objectId,p.element);if(!t)return null;const key=scene3DTargetKey(t),active=selected.has(key);
        return <circle key={i} cx={p.x} cy={p.y} r={active?7:5} className={"i3d-vertex-target"+(active?" is-selected":"")} onClick={()=>toggle(t)} data-i3d-target={key}/>;
      })}
    </svg>
    {selection&&<div className="i3d-target-list" role="group" aria-label={targetLabel}>
      {targets.map(t=>{const key=scene3DTargetKey(t),active=selected.has(key);return <button type="button" key={key} aria-pressed={active}
        disabled={selection.readOnly} className={active?"is-selected":""} onClick={()=>toggle(t)}><span>{t.label}</span>{t.detail&&<small>{t.detail}</small>}</button>;})}
    </div>}
    <details className="i3d-summary"><summary>وصف نصي بديل للنموذج</summary>
      <ul>{checked.value.objects.map(o=><li key={o.id}>{o.label} — {o.kind}</li>)}</ul>
    </details>
  </figure>;
}
