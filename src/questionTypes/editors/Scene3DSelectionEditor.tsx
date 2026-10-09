import { useMemo, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import Interactive3DView from "../../interactive3d/Interactive3DView";
import Scene3DEditor from "../../interactive3d/Scene3DEditor";
import { SCENE3D_PRESET_KEYS, SCENE3D_PRESET_LABELS, freshScene3DId, scene3DPreset, type Scene3DPresetKey } from "../../interactive3d/scenePresets";
import { SCENE3D_TARGET_KINDS, SCENE3D_TARGET_KIND_LABELS, scene3DTargetKey, scene3DTargets, validateInteractive3DSceneSpec, type Interactive3DSceneSpecV1, type Scene3DTargetKind } from "../../interactive3d/sceneSpec";
import { SCENE3D_SELECTION_LIMITS, validateScene3DSelectionQuestion, type Scene3DSelectionMode, type Scene3DSelectionScoring } from "../../scene3DSelectionQuestion";

const isObj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const MODE_LABELS:Readonly<Record<Scene3DSelectionMode,string>>=Object.freeze({single:"اختيار واحد",multiple:"اختيار متعدد"});

export default function Scene3DSelectionEditor({node,onChange,disabled}:AuthoringEditorProps){
  const raw=isObj((node as {scene3DSelection?:unknown}).scene3DSelection)?(node as {scene3DSelection:Record<string,unknown>}).scene3DSelection:{};
  const scene=isObj(raw.scene)?raw.scene as unknown as Interactive3DSceneSpecV1:null;
  const target=((SCENE3D_TARGET_KINDS as readonly unknown[]).includes(raw.target)?raw.target:"object") as Scene3DTargetKind;
  const mode:Scene3DSelectionMode=raw.mode==="multiple"?"multiple":"single";
  const max=typeof raw.maxSelections==="number"?raw.maxSelections:1;
  const label=typeof raw.label==="string"?raw.label:"";
  const key=isObj(node.answer)?node.answer as Record<string,unknown>:{};
  const scoring:Scene3DSelectionScoring=key.scoring==="partial"?"partial":"allOrNothing";
  const correct=useMemo(()=>Array.isArray(key.correct)?(key.correct as unknown[]).filter((x):x is string=>typeof x==="string"):[],[key.correct]);
  const [preset,setPreset]=useState<Scene3DPresetKey>("cube");
  const [notice,setNotice]=useState("");
  const valid=useMemo(()=>scene?validateInteractive3DSceneSpec(scene):null,[scene]);
  const counts=useMemo(()=>Object.fromEntries(SCENE3D_TARGET_KINDS.map(k=>[k,valid?.ok?scene3DTargets(valid.value,k).length:0])) as Record<Scene3DTargetKind,number>,[valid]);
  const issues=useMemo(()=>validateScene3DSelectionQuestion(node as unknown as Record<string,unknown>),[node]);
  const resolve=(next:{scene?:Interactive3DSceneSpecV1;target?:Scene3DTargetKind;mode?:Scene3DSelectionMode;max?:number;label?:string;scoring?:Scene3DSelectionScoring;correct?:string[]})=>{
    const s=next.scene??scene,t=next.target??target,m=next.mode??mode;
    const vr=s?validateInteractive3DSceneSpec(s):null,order=vr?.ok?scene3DTargets(vr.value,t).map(scene3DTargetKey):[];
    let ok=next.target!==undefined&&next.target!==target?[]:next.correct??correct;
    ok=order.filter(k=>ok.includes(k));
    let mx=m==="single"?1:Math.max(1,Math.round(next.max??max));if(order.length)mx=Math.min(mx,order.length);
    if(m==="single")ok=ok.slice(0,1);
    const sc=m==="single"?"allOrNothing":(next.scoring??scoring),l=next.label??label;
    return{scene3DSelection:{v:1,...(s?{scene:s}:{}),target:t,mode:m,maxSelections:mx,...(l.trim()?{label:l}:{})},answer:{scoring:sc,correct:ok}};
  };
  const write=(next:Parameters<typeof resolve>[0])=>{
    const r=resolve(next),lost=correct.filter(k=>!r.answer.correct.includes(k));
    if(lost.length&&next.scene)setNotice("أُزيلت إجابات صحيحة لم تعد موجودة في المشهد ("+lost.length+").");
    else if(next.target&&next.target!==target&&correct.length)setNotice("تغيير نوع الهدف مسح مفتاح الإجابة؛ حدده من جديد.");
    else setNotice("");
    onChange(r as never);
  };
  return <div className="qt-editor qt-editor-scene3DSelection" data-testid="qt-editor-scene3DSelection" dir="rtl">
    {!scene?<div className="vq-fields" role="group" aria-label="إنشاء نموذج ثلاثي الأبعاد">
      <p className="vq-note">ابدأ بقالب هندسي أو علمي ثم عدّل المجسمات. كل الإجابات دلالية وليست إحداثيات شاشة.</p>
      <label className="vq-field"><span>القالب</span><select className="sb-input sb-input-sm" value={preset} disabled={disabled} onChange={e=>setPreset(e.target.value as Scene3DPresetKey)}>{SCENE3D_PRESET_KEYS.map(k=><option key={k} value={k}>{SCENE3D_PRESET_LABELS[k]}</option>)}</select></label>
      <button type="button" className="sb-mini-btn" disabled={disabled} onClick={()=>write({scene:scene3DPreset(preset,freshScene3DId("scene")),correct:[]})}>إنشاء النموذج</button>
    </div>:<>
      <Scene3DEditor scene={scene} onChange={s=>write({scene:s})} name="النموذج" disabled={disabled} preview={false}/>
      <section className="vq-fields" aria-label="إعداد الاختيار">
        <label className="vq-field"><span>يختار الطالب</span><select className="sb-input sb-input-sm" value={target} disabled={disabled} onChange={e=>write({target:e.target.value as Scene3DTargetKind})}>
          {SCENE3D_TARGET_KINDS.map(k=><option key={k} value={k}>{SCENE3D_TARGET_KIND_LABELS[k]+" ("+counts[k]+")"}</option>)}
        </select></label>
        <label className="vq-field"><span>طريقة الاختيار</span><select className="sb-input sb-input-sm" value={mode} disabled={disabled} onChange={e=>write({mode:e.target.value as Scene3DSelectionMode})}>
          <option value="single">{MODE_LABELS.single}</option><option value="multiple">{MODE_LABELS.multiple}</option>
        </select></label>
        {mode==="multiple"&&<label className="vq-field"><span>أقصى عدد</span><input className="sb-input sb-input-sm" type="number" min="1" max={Math.max(1,counts[target])} value={max} disabled={disabled} onChange={e=>write({max:Number(e.target.value)})}/></label>}
        <label className="vq-field"><span>تعليمة للطالب</span><input className="sb-input sb-input-sm" maxLength={SCENE3D_SELECTION_LIMITS.labelChars} value={label} disabled={disabled} placeholder="مثال: اختر البطين الأيسر" onChange={e=>write({label:e.target.value})}/></label>
        {mode==="multiple"&&<label className="vq-field"><span>الاحتساب</span><select className="sb-input sb-input-sm" value={scoring} disabled={disabled} onChange={e=>write({scoring:e.target.value as Scene3DSelectionScoring})}><option value="allOrNothing">الكل أو لا شيء</option><option value="partial">جزئية</option></select></label>}
      </section>
      {notice&&<p className="vq-note" role="status">{notice}</p>}
      <section aria-label="الإجابة الصحيحة">
        <p className="vq-note">حدّد الهدف الصحيح على النموذج نفسه أو من القائمة. هذا المفتاح لا يصل إلى الطالب.</p>
        {valid?.ok&&counts[target]>=2?<Interactive3DView spec={valid.value} selection={{kind:target,mode,max:mode==="single"?1:Math.max(1,Math.min(max,counts[target])),value:correct,label:"الإجابة الصحيحة",readOnly:disabled,onChange:next=>write({correct:next})}}/>:<p className="vq-note">اختر قالبًا/نوع هدف يحتوي عنصرين قابلين للاختيار على الأقل.</p>}
      </section>
    </>}
    {issues.length>0&&<ul className="vq-issues">{issues.slice(0,12).map((i,n)=><li key={n}>{i.message}</li>)}</ul>}
  </div>;
}
