
import {Suspense,lazy} from "react";
import CompoundPartControl from "./CompoundPartControl";
import {resolveStudentRenderer,studentUnsupported} from "./questionTypes/studentRegistry";
import StudentUnsupported from "./questionTypes/StudentUnsupported";
import {promptText} from "./questionContent";
import {answered} from "./StudentQuestionCard";
import type {Question,QuestionPart,Answer} from "./StudentQuestionCard";
import {distributePartMarks,partId,partLabel} from "./examStructure";
// Phase 19F — the shared read-only code stimulus: LAZY, loaded only when the question carries one.
const CodeStimulusView=lazy(()=>import("./questionTypes/CodeStimulusView"));

// Renders ONE displayed question that is composed of several independent subparts. The shared prompt
// / stimulus is drawn once, then each part renders its own answer control — parts may use DIFFERENT
// answer types. Each part's answer is stored under {kind:"compound",parts:{[partId]:Answer}} and every
// change bubbles up through onPart. Field-type parts reuse QuestionField, so there is no second
// rendering engine; choice/text parts are drawn by CompoundPartControl (Phase 20D: extracted unchanged so
// composite@1 legacy children share it).

type Props={
 q:Question;
 index:number;
 id:string;
 answer:Answer|undefined;
 onPart:(partId:string,answer:Answer)=>void;
 disabled?:boolean;
 excessPartIds?:Set<string>; // part ids that are answered-but-not-counted (firstN at part level)
};

export default function CompoundQuestion({q,index,id,answer,onPart,disabled,excessPartIds}:Props){
 const parts=Array.isArray(q.parts)?q.parts:[];
 const marks=distributePartMarks(q);
 const partAnswers=answer?.kind==="compound"?answer.parts:{};
 return <article className={"iex-q iex-compound "+(answered(answer)?"done":"")}><div className="iex-node">{q.displayNumber??(index+1)}</div><div className="iex-card">
  <div className="iex-qhead"><span>سؤال مركّب — {parts.length} فروع</span><strong>{q.marks} علامة</strong></div>
  <p className="iex-qtext" id={"iex-qtext-"+String(id).replace(/[^a-zA-Z0-9_-]/g,"_")}>{promptText(q.text)}</p>
  {q.codeStimulus!==undefined&&<Suspense fallback={null}><CodeStimulusView stimulus={q.codeStimulus}/></Suspense>}
  {(q.image?.exists&&q.image.visible?q.image.assets:q.images||[])?.map((im,n)=>im?.dataUrl?<img className="iex-image" src={im.dataUrl} alt={"صورة السؤال "+(index+1)} key={n}/>:null)}
  <div className="iex-parts">{parts.map((p:QuestionPart,pi)=>{
   const pid=partId(p,pi),pAns=partAnswers[pid];
   // Phase 16A — a registered (Wave 1 / plugin) part type renders through the SAME student registry a standalone question uses;
   // its answer bubbles through the existing onPart seam. Legacy part types keep the inline path below unchanged.
   const registered=resolveStudentRenderer(p.type,p.questionTypeVersion);
   const unsupported=!registered&&studentUnsupported(p.type,p.questionTypeVersion);
   const excess=excessPartIds?.has(pid);
   // UX-7b-1 accessibility (additive): each part's controls are named by the part text (or the part label when
   // the part has no text) — same answer shapes and handlers as before.
   const partTextId="iex-part-"+String(id+"-"+pid).replace(/[^a-zA-Z0-9_-]/g,"_");
   const partName="السؤال "+(q.displayNumber??(index+1))+" — الجزء "+partLabel(p,pi);
   return <div className={"iex-part "+(answered(pAns)?"done":"")} key={pid}>
    <div className="iex-part-head"><b className="iex-part-label" aria-hidden="true">{partLabel(p,pi)}</b><span className="iex-part-marks">{marks[pi]} علامة</span></div>
    {p.text&&<p className="iex-part-text" id={partTextId}>{p.text}</p>}
    {registered&&<Suspense fallback={<p className="iex-loading" role="status">جارٍ تحميل البند…</p>}><registered.Renderer q={p as unknown as Question} id={id+"-"+pid} answer={pAns} onAnswer={ans=>onPart(pid,ans)} disabled={disabled} labelPrefix={partName} textId={p.text?partTextId:undefined}/></Suspense>}
    {unsupported&&<StudentUnsupported/>}
    {!registered&&!unsupported&&<CompoundPartControl p={p} idBase={id+"-"+pid} answer={pAns} onAnswer={ans=>onPart(pid,ans)} disabled={disabled} textId={p.text?partTextId:undefined} name={partName}/>}
    {excess&&<div className="iex-extra-hint">إجابة إضافية — لن تدخل في التصحيح</div>}
   </div>;
  })}</div>
 </div></article>;
}
