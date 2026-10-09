import { useMemo, useState } from "react";
import Interactive3DView from "./Interactive3DView";
import {
  SCENE3D_OBJECT_KINDS, SCENE3D_TARGET_KIND_LABELS, validateInteractive3DSceneSpec,
  type Interactive3DSceneSpecV1, type Scene3DObjectKind, type Scene3DObjectV1, type Scene3DTargetKind, type Scene3DTargetV1
} from "./sceneSpec";
import { freshScene3DId, SCENE3D_PRESET_KEYS, SCENE3D_PRESET_LABELS, scene3DPreset, type Scene3DPresetKey } from "./scenePresets";

type Props={scene:Interactive3DSceneSpecV1;onChange:(next:Interactive3DSceneSpecV1)=>void;name?:string;disabled?:boolean;preview?:boolean};
const num=(s:string,fallback:number)=>{const n=Number(s);return Number.isFinite(n)?n:fallback;};
const cloneObject=(o:Scene3DObjectV1,patch:Partial<Scene3DObjectV1>):Scene3DObjectV1=>({...o,...patch});
const BOX={
  face:["front","back","left","right","top","bottom"],
  edge:["AB","BC","CD","DA","EF","FG","GH","HE","AE","BF","CG","DH"],
  vertex:["A","B","C","D","E","F","G","H"]
} as const;
const PYRAMID={
  face:["base","sideAB","sideBC","sideCD","sideDA"],
  edge:["AB","BC","CD","DA","AE","BE","CE","DE"],
  vertex:["A","B","C","D","E"]
} as const;
const selectableKinds=(o:Scene3DObjectV1):Scene3DTargetKind[]=>
  o.kind==="box"||o.kind==="pyramid"?["object","face","edge","vertex"]:["object"];
const elementsFor=(o:Scene3DObjectV1,kind:Scene3DTargetKind):readonly string[]=>{
  if(kind==="object")return[];
  const map=o.kind==="box"?BOX:o.kind==="pyramid"?PYRAMID:null;
  return map?map[kind]:[];
};
const binding=(kind:Scene3DTargetKind,objectId:string,element?:string)=>kind+":"+objectId+":"+(element??"");
const nextTargetId=(targets:Scene3DTargetV1[])=>{
  const used=new Set(targets.map(t=>t.id));let n=1;while(used.has("target"+n))n++;return "target"+n;
};

export default function Scene3DEditor({scene,onChange,name="المشهد",disabled,preview=true}:Props){
  const [preset,setPreset]=useState<Scene3DPresetKey>("cube");
  const checked=useMemo(()=>validateInteractive3DSceneSpec(scene),[scene]);
  const usedBinding=(targetId:string,kind:Scene3DTargetKind,objectId:string,element?:string)=>
    scene.targets.some(t=>t.id!==targetId&&binding(t.kind,t.objectId,t.element)===binding(kind,objectId,element));
  const firstFreeBinding=()=>{
    for(const object of scene.objects){
      if(!usedBinding("", "object", object.id))return{kind:"object" as const,objectId:object.id,element:undefined};
      for(const kind of selectableKinds(object).filter(k=>k!=="object")){
        for(const element of elementsFor(object,kind))if(!usedBinding("",kind,object.id,element))return{kind,objectId:object.id,element};
      }
    }
    return null;
  };
  const updateObject=(id:string,patch:Partial<Scene3DObjectV1>)=>{
    const old=scene.objects.find(o=>o.id===id);if(!old)return;
    const next=cloneObject(old,patch);
    const kindChanged=patch.kind!==undefined&&patch.kind!==old.kind;
    onChange({
      ...scene,
      objects:scene.objects.map(o=>o.id===id?next:o),
      targets:kindChanged?scene.targets.filter(t=>t.objectId!==id||t.kind==="object"):scene.targets
    });
  };
  const removeObject=(id:string)=>onChange({...scene,objects:scene.objects.filter(o=>o.id!==id),targets:scene.targets.filter(t=>t.objectId!==id)});
  const addObject=()=>{
    const n=scene.objects.length+1,id="part"+n,targetId=nextTargetId(scene.targets);
    const object:Scene3DObjectV1={id,label:"جزء "+n,kind:"box",center:{x:0,y:0,z:0},size:{x:1,y:1,z:1},palette:1};
    const target:Scene3DTargetV1={id:targetId,kind:"object",label:object.label,objectId:id};
    onChange({...scene,objects:[...scene.objects,object],targets:[...scene.targets,target]});
  };
  const addTarget=()=>{
    const free=firstFreeBinding();if(!free)return;
    const object=scene.objects.find(o=>o.id===free.objectId)!;
    const id=nextTargetId(scene.targets);
    const suffix=free.element?" "+free.element:"";
    const target:Scene3DTargetV1={id,kind:free.kind,label:SCENE3D_TARGET_KIND_LABELS[free.kind]+" "+object.label+suffix,objectId:free.objectId,...(free.element?{element:free.element}:{})};
    onChange({...scene,targets:[...scene.targets,target]});
  };
  const removeTarget=(id:string)=>onChange({...scene,targets:scene.targets.filter(t=>t.id!==id)});
  const updateTarget=(id:string,patch:Partial<Scene3DTargetV1>)=>{
    const old=scene.targets.find(t=>t.id===id);if(!old)return;
    const objectId=patch.objectId??old.objectId;
    const object=scene.objects.find(o=>o.id===objectId);if(!object)return;
    let kind=(patch.kind??old.kind) as Scene3DTargetKind;
    if(!selectableKinds(object).includes(kind))kind="object";
    const options=elementsFor(object,kind);
    let element=kind==="object"?undefined:(patch.element??old.element);
    if(kind!=="object"&&(!element||!options.includes(element)))element=options[0];
    if(usedBinding(id,kind,objectId,element))return;
    const next:Scene3DTargetV1={...old,...patch,kind,objectId,...(element?{element}: {})};
    if(!element)delete (next as {element?:string}).element;
    if(!next.detail)delete (next as {detail?:string}).detail;
    onChange({...scene,targets:scene.targets.map(t=>t.id===id?next:t)});
  };
  const freeBinding=firstFreeBinding();

  return <div className="i3d-editor" dir="rtl">
    <div className="vq-fields" role="group" aria-label={"إعداد "+name}>
      <label className="vq-field"><span>قالب جاهز</span><select className="sb-input sb-input-sm" value={preset} disabled={disabled} onChange={e=>setPreset(e.target.value as Scene3DPresetKey)}>
        {SCENE3D_PRESET_KEYS.map(k=><option key={k} value={k}>{SCENE3D_PRESET_LABELS[k]}</option>)}
      </select></label>
      <button type="button" className="sb-mini-btn" disabled={disabled} onClick={()=>onChange(scene3DPreset(preset,freshScene3DId("scene")))}>استبدال بالقالب</button>
      <label className="vq-field"><span>عنوان المشهد</span><input className="sb-input sb-input-sm" value={scene.title} maxLength={160} disabled={disabled} onChange={e=>onChange({...scene,title:e.target.value})}/></label>
      <label className="vq-field"><span>الوصف</span><input className="sb-input sb-input-sm" value={scene.description} maxLength={800} disabled={disabled} onChange={e=>onChange({...scene,description:e.target.value})}/></label>
      <label className="vq-field"><span>زاوية أفقية</span><input className="sb-input sb-input-sm" type="number" step=".1" min={-3.14} max={3.14} value={scene.camera.yaw} disabled={disabled} onChange={e=>onChange({...scene,camera:{...scene.camera,yaw:num(e.target.value,scene.camera.yaw)}})}/></label>
      <label className="vq-field"><span>زاوية ارتفاع</span><input className="sb-input sb-input-sm" type="number" step=".1" min={-1.35} max={1.35} value={scene.camera.pitch} disabled={disabled} onChange={e=>onChange({...scene,camera:{...scene.camera,pitch:num(e.target.value,scene.camera.pitch)}})}/></label>
      <label className="vq-field"><span>التكبير</span><input className="sb-input sb-input-sm" type="number" step=".1" min={.55} max={2.2} value={scene.camera.zoom} disabled={disabled} onChange={e=>onChange({...scene,camera:{...scene.camera,zoom:num(e.target.value,scene.camera.zoom)}})}/></label>
    </div>

    <div className="i3d-editor-objects">
      <div className="i3d-editor-head"><strong>المجسمات ({scene.objects.length})</strong><button type="button" className="sb-mini-btn" disabled={disabled||scene.objects.length>=64||scene.targets.length>=128} onClick={addObject}>إضافة مجسم</button></div>
      {scene.objects.map(o=><div className="i3d-object-row" key={o.id}>
        <label><span>الاسم</span><input className="sb-input sb-input-sm" value={o.label} disabled={disabled} onChange={e=>updateObject(o.id,{label:e.target.value})}/></label>
        <label><span>النوع</span><select className="sb-input sb-input-sm" value={o.kind} disabled={disabled} onChange={e=>updateObject(o.id,{kind:e.target.value as Scene3DObjectKind})}>{SCENE3D_OBJECT_KINDS.map(k=><option key={k}>{k}</option>)}</select></label>
        {(["x","y","z"] as const).map(axis=><label key={"c"+axis}><span>{"مركز "+axis}</span><input className="sb-input sb-input-sm" type="number" step=".1" value={o.center[axis]} disabled={disabled} onChange={e=>updateObject(o.id,{center:{...o.center,[axis]:num(e.target.value,o.center[axis])}})}/></label>)}
        {(["x","y","z"] as const).map(axis=><label key={"s"+axis}><span>{"حجم "+axis}</span><input className="sb-input sb-input-sm" type="number" min=".05" max="40" step=".1" value={o.size[axis]} disabled={disabled} onChange={e=>updateObject(o.id,{size:{...o.size,[axis]:num(e.target.value,o.size[axis])}})}/></label>)}
        <label><span>لوحة اللون</span><input className="sb-input sb-input-sm" type="number" min="1" max="8" step="1" value={o.palette} disabled={disabled} onChange={e=>updateObject(o.id,{palette:Math.round(num(e.target.value,o.palette))})}/></label>
        <button type="button" className="sb-mini-btn sb-danger" disabled={disabled||scene.objects.length<=1} onClick={()=>removeObject(o.id)}>حذف</button>
      </div>)}
    </div>

    <div className="i3d-editor-targets">
      <div className="i3d-editor-head"><strong>الأهداف الدلالية ({scene.targets.length})</strong><button type="button" className="sb-mini-btn" disabled={disabled||scene.targets.length>=128||!freeBinding} onClick={addTarget}>إضافة هدف</button></div>
      <p className="vq-note">الأهداف هي العناصر التي يمكن للطالب اختيارها وتصحيحها: جزء كامل، وجه، حافة أو رأس. لا تُستخدم إحداثيات الشاشة.</p>
      {scene.targets.map(t=>{
        const object=scene.objects.find(o=>o.id===t.objectId)??scene.objects[0];
        const kinds=object?selectableKinds(object):["object"] as Scene3DTargetKind[];
        const elements=object?elementsFor(object,t.kind):[];
        return <div className="i3d-target-row" key={t.id}>
          <code dir="ltr">{t.kind+":"+t.id}</code>
          <label><span>التسمية</span><input className="sb-input sb-input-sm" value={t.label} disabled={disabled} onChange={e=>updateTarget(t.id,{label:e.target.value})}/></label>
          <label><span>المجسم</span><select className="sb-input sb-input-sm" value={t.objectId} disabled={disabled} onChange={e=>updateTarget(t.id,{objectId:e.target.value})}>{scene.objects.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          <label><span>نوع الهدف</span><select className="sb-input sb-input-sm" value={t.kind} disabled={disabled} onChange={e=>updateTarget(t.id,{kind:e.target.value as Scene3DTargetKind})}>{kinds.map(k=><option key={k} value={k}>{SCENE3D_TARGET_KIND_LABELS[k]}</option>)}</select></label>
          {t.kind!=="object"&&<label><span>العنصر</span><select className="sb-input sb-input-sm" value={t.element??""} disabled={disabled} onChange={e=>updateTarget(t.id,{element:e.target.value})}>{elements.map(el=><option key={el} value={el} disabled={usedBinding(t.id,t.kind,t.objectId,el)}>{el}</option>)}</select></label>}
          <label><span>تفصيل اختياري</span><input className="sb-input sb-input-sm" value={t.detail??""} disabled={disabled} maxLength={800} onChange={e=>updateTarget(t.id,{detail:e.target.value||undefined})}/></label>
          <button type="button" className="sb-mini-btn sb-danger" disabled={disabled} onClick={()=>removeTarget(t.id)}>حذف الهدف</button>
        </div>;
      })}
    </div>

    {!checked.ok&&<ul className="vq-issues">{checked.issues.slice(0,10).map((i,n)=><li key={n}>{i.message}</li>)}</ul>}
    {preview&&checked.ok&&<Interactive3DView spec={checked.value}/>}
  </div>;
}
