import { useMemo, useState } from "react";
import Interactive3DView from "./Interactive3DView";
import { SCENE3D_OBJECT_KINDS, validateInteractive3DSceneSpec, type Interactive3DSceneSpecV1, type Scene3DObjectKind, type Scene3DObjectV1 } from "./sceneSpec";
import { freshScene3DId, SCENE3D_PRESET_KEYS, SCENE3D_PRESET_LABELS, scene3DPreset, type Scene3DPresetKey } from "./scenePresets";

type Props={scene:Interactive3DSceneSpecV1;onChange:(next:Interactive3DSceneSpecV1)=>void;name?:string;disabled?:boolean;preview?:boolean};
const num=(s:string,fallback:number)=>{const n=Number(s);return Number.isFinite(n)?n:fallback;};
const cloneObject=(o:Scene3DObjectV1,patch:Partial<Scene3DObjectV1>):Scene3DObjectV1=>({...o,...patch});

export default function Scene3DEditor({scene,onChange,name="المشهد",disabled,preview=true}:Props){
  const [preset,setPreset]=useState<Scene3DPresetKey>("cube");
  const checked=useMemo(()=>validateInteractive3DSceneSpec(scene),[scene]);
  const updateObject=(id:string,patch:Partial<Scene3DObjectV1>)=>onChange({...scene,objects:scene.objects.map(o=>o.id===id?cloneObject(o,patch):o)});
  const removeObject=(id:string)=>onChange({...scene,objects:scene.objects.filter(o=>o.id!==id),targets:scene.targets.filter(t=>t.objectId!==id)});
  const addObject=()=>{
    const n=scene.objects.length+1,id="part"+n;
    onChange({...scene,objects:[...scene.objects,{id,label:"جزء "+n,kind:"box",center:{x:0,y:0,z:0},size:{x:1,y:1,z:1},palette:1}]});
  };
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
      <div className="i3d-editor-head"><strong>المجسمات ({scene.objects.length})</strong><button type="button" className="sb-mini-btn" disabled={disabled||scene.objects.length>=64} onClick={addObject}>إضافة مجسم</button></div>
      {scene.objects.map(o=><div className="i3d-object-row" key={o.id}>
        <label><span>الاسم</span><input className="sb-input sb-input-sm" value={o.label} disabled={disabled} onChange={e=>updateObject(o.id,{label:e.target.value})}/></label>
        <label><span>النوع</span><select className="sb-input sb-input-sm" value={o.kind} disabled={disabled} onChange={e=>updateObject(o.id,{kind:e.target.value as Scene3DObjectKind})}>{SCENE3D_OBJECT_KINDS.map(k=><option key={k}>{k}</option>)}</select></label>
        {(["x","y","z"] as const).map(axis=><label key={"c"+axis}><span>{"مركز "+axis}</span><input className="sb-input sb-input-sm" type="number" step=".1" value={o.center[axis]} disabled={disabled} onChange={e=>updateObject(o.id,{center:{...o.center,[axis]:num(e.target.value,o.center[axis])}})}/></label>)}
        {(["x","y","z"] as const).map(axis=><label key={"s"+axis}><span>{"حجم "+axis}</span><input className="sb-input sb-input-sm" type="number" min=".05" max="40" step=".1" value={o.size[axis]} disabled={disabled} onChange={e=>updateObject(o.id,{size:{...o.size,[axis]:num(e.target.value,o.size[axis])}})}/></label>)}
        <label><span>لوحة اللون</span><input className="sb-input sb-input-sm" type="number" min="1" max="8" step="1" value={o.palette} disabled={disabled} onChange={e=>updateObject(o.id,{palette:Math.round(num(e.target.value,o.palette))})}/></label>
        <button type="button" className="sb-mini-btn sb-danger" disabled={disabled||scene.objects.length<=1} onClick={()=>removeObject(o.id)}>حذف</button>
      </div>)}
    </div>
    {!checked.ok&&<ul className="vq-issues">{checked.issues.slice(0,8).map((i,n)=><li key={n}>{i.message}</li>)}</ul>}
    {preview&&checked.ok&&<Interactive3DView spec={checked.value}/>}
  </div>;
}
