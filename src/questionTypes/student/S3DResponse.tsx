import { useMemo } from "react";
import type { StudentRendererProps } from "../registryTypes";
import Interactive3DView from "../../interactive3d/Interactive3DView";
import { SCENE3D_TARGET_KIND_LABELS } from "../../interactive3d/sceneSpec";
import { projectScene3DSelectionConfigForStudent } from "../../scene3DSelectionQuestion";

export default function Scene3DSelectionResponse({q,answer,onAnswer,disabled}:StudentRendererProps){
  const cfg=useMemo(()=>projectScene3DSelectionConfigForStudent((q as {scene3DSelection?:unknown}).scene3DSelection),[q]);
  if(!cfg)return <p className="vq-unavailable" role="note" data-testid="scene3d-unavailable">تعذّر عرض النموذج ثلاثي الأبعاد؛ أبلغ معلّمك.</p>;
  const value=answer?.kind==="scene3DSelection"&&answer.sceneId===cfg.scene.id?answer.targets:[];
  const label=cfg.label??"اختر "+SCENE3D_TARGET_KIND_LABELS[cfg.target]+" من النموذج";
  return <div className="i3d-selection-response" data-testid="scene3d-selection-response">
    <Interactive3DView spec={cfg.scene} selection={{kind:cfg.target,mode:cfg.mode,max:cfg.maxSelections,value,label,readOnly:disabled,onChange:next=>{if(!disabled)onAnswer({kind:"scene3DSelection",sceneId:cfg.scene.id,targets:next});}}}/>
  </div>;
}
