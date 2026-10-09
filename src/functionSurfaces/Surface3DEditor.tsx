import { useMemo,useState } from "react";
import Surface3DView from "./Surface3DView";
import { SURFACE_LIMITS,type SurfaceSpecV1,validateSurfaceSpec } from "./surfaceSpec";
import { SURFACE_TEMPLATE_KEYS,SURFACE_TEMPLATE_LABELS,surfaceTemplate,type SurfaceTemplateKey } from "./surfaceEditing";
import "./surface-3d.css";
type Props={surface:SurfaceSpecV1;name?:string;disabled?:boolean;onChange:(surface:SurfaceSpecV1)=>void};
export default function Surface3DEditor({surface,name="السطح ثلاثي الأبعاد",disabled,onChange}:Props){
 const checked=useMemo(()=>validateSurfaceSpec(surface),[surface]); const [template,setTemplate]=useState<SurfaceTemplateKey>("paraboloid");
 const setViewport=(key:keyof SurfaceSpecV1["viewport"],value:number)=>onChange({...surface,viewport:{...surface.viewport,[key]:value}});
 const setGrid=(key:keyof SurfaceSpecV1["grid"],value:number)=>onChange({...surface,grid:{...surface.grid,[key]:value}});
 return <div className="ex3d-editor" data-testid="surface-3d-editor" dir="rtl">
  <div className="ex3d-editor-toolbar"><label>قالب جاهز<select aria-label="قالب سطح ثلاثي الأبعاد" value={template} disabled={disabled} onChange={e=>setTemplate(e.target.value as SurfaceTemplateKey)}>{SURFACE_TEMPLATE_KEYS.map(k=><option key={k} value={k}>{SURFACE_TEMPLATE_LABELS[k]}</option>)}</select></label><button type="button" disabled={disabled} onClick={()=>onChange(surfaceTemplate(template,surface.id))}>تطبيق القالب</button></div>
  <fieldset disabled={disabled} className="ex3d-editor-fields"><legend>{name}</legend>
   <label>العنوان<input value={surface.title} maxLength={SURFACE_LIMITS.textChars} onChange={e=>onChange({...surface,title:e.target.value})}/></label>
   <label className="ex3d-wide">الوصف<textarea value={surface.description} maxLength={SURFACE_LIMITS.descriptionChars} rows={2} onChange={e=>onChange({...surface,description:e.target.value})}/></label>
   <label className="ex3d-wide">المعادلة z = f(x,y)<input dir="ltr" spellCheck={false} autoComplete="off" value={surface.expression} maxLength={SURFACE_LIMITS.expressionChars} onChange={e=>onChange({...surface,expression:e.target.value})}/></label>
   {(["xMin","xMax","yMin","yMax","zMin","zMax"] as const).map(k=><label key={k}>{k}<input dir="ltr" type="number" step="0.1" min={-SURFACE_LIMITS.axisAbsMax} max={SURFACE_LIMITS.axisAbsMax} value={surface.viewport[k]} onChange={e=>setViewport(k,Number(e.target.value))}/></label>)}
   <label>خطوات x<input type="number" min={SURFACE_LIMITS.minSteps} max={SURFACE_LIMITS.maxSteps} step="1" value={surface.grid.xSteps} onChange={e=>setGrid("xSteps",Number(e.target.value))}/></label>
   <label>خطوات y<input type="number" min={SURFACE_LIMITS.minSteps} max={SURFACE_LIMITS.maxSteps} step="1" value={surface.grid.ySteps} onChange={e=>setGrid("ySteps",Number(e.target.value))}/></label>
  </fieldset>
  <p className="ex3d-hint">اللغة الرياضية آمنة ومحدودة: استعمل x وy فقط، واكتب 2*x للضرب وx^2 للأسس.</p>
  {checked.ok?<Surface3DView spec={checked.value}/>:<div className="ex3d-errors" role="alert"><strong>صحّح السطح قبل الحفظ النهائي:</strong><ul>{checked.issues.slice(0,10).map((i,n)=><li key={n}>{i.message} ({i.code})</li>)}</ul></div>}
 </div>;
}
