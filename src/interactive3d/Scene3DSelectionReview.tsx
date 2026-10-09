import { useMemo } from "react";
import Interactive3DView from "./Interactive3DView";
import { SCENE3D_TARGET_KIND_LABELS } from "./sceneSpec";
import { evaluateScene3DSelection, validateScene3DSelectionConfig } from "../scene3DSelectionQuestion";

type Props={answer:unknown;answerKey:unknown;config:unknown};
export default function Scene3DSelectionReview({answer,answerKey,config}:Props){
  const cfg=useMemo(()=>validateScene3DSelectionConfig(config),[config]);
  const evaluation=useMemo(()=>evaluateScene3DSelection(config,answerKey,answer),[config,answerKey,answer]);
  if(!cfg.ok||!evaluation.ok)return <div className="i3d-review" data-testid="scene3d-review"><p className="vq-unavailable" data-testid="scene3d-review-unavailable">لا يمكن تقييم سؤال 3D آليًا (المشهد أو مفتاح التصحيح غير صالح) — تصحيح يدوي.</p></div>;
  const marks:Record<string,"correct"|"incorrect"|"missed">={};
  for(const r of evaluation.results)if(r.mark)marks[r.key]=r.mark;
  const selected=evaluation.results.filter(r=>r.selected).map(r=>r.key);
  const expected=evaluation.results.filter(r=>r.expected).map(r=>r.label+(r.detail?" — "+r.detail:""));
  return <div className="i3d-review" data-testid="scene3d-review">
    <Interactive3DView spec={cfg.config.scene} selection={{kind:cfg.config.target,mode:cfg.config.mode,max:cfg.config.maxSelections,value:selected,readOnly:true,review:marks,label:"اختيار الطالب ("+SCENE3D_TARGET_KIND_LABELS[cfg.config.target]+")",onChange:()=>{}}}/>
    <p className="vq-status" data-testid="scene3d-review-summary">{evaluation.correct} من {evaluation.total} صحيحة{selected.length>evaluation.correct?" · "+(selected.length-evaluation.correct)+" اختيار غير صحيح":""}{evaluation.exact?" · إجابة مطابقة":""}. الإجابة المعتمدة: <bdi>{expected.join("، ")}</bdi></p>
  </div>;
}
