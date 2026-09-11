
import {IconCheck} from "./icons";
import QuestionField from "./QuestionField";
import {promptText} from "./questionContent";
import {answered} from "./StudentQuestionCard";
import type {Question,QuestionPart,Answer,FieldValue} from "./StudentQuestionCard";
import {distributePartMarks,partId} from "./examStructure";

// Renders ONE displayed question that is composed of several independent subparts. The shared prompt
// / stimulus is drawn once, then each part renders its own answer control — parts may use DIFFERENT
// answer types. Each part's answer is stored under {kind:"compound",parts:{[partId]:Answer}} and every
// change bubbles up through onPart. Field-type parts reuse QuestionField, so there is no second
// rendering engine; choice/text parts are drawn inline.

const isChoice=(t:string)=>t==="multiplechoice"||t==="truefalse";
const fieldPartTypes=new Set(["multitruefalse","clifill","tablefill","wordbank","matching"]);

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
 const setChoice=(pid:string,idx:number)=>onPart(pid,{kind:"choice",index:idx});
 const setText=(pid:string,value:string)=>onPart(pid,{kind:"text",value});
 const setField=(pid:string,fieldId:string,value:FieldValue)=>{const prev=partAnswers[pid]?.kind==="fields"?partAnswers[pid].values:{};onPart(pid,{kind:"fields",values:{...prev,[fieldId]:value}});};
 return <article className={"iex-q iex-compound "+(answered(answer)?"done":"")}><div className="iex-node">{index+1}</div><div className="iex-card">
  <div className="iex-qhead"><span>سؤال مركّب — {parts.length} فروع</span><strong>{q.marks} علامة</strong></div>
  <p className="iex-qtext">{promptText(q.text)}</p>
  {(q.image?.exists&&q.image.visible?q.image.assets:q.images||[])?.map((im,n)=>im?.dataUrl?<img className="iex-image" src={im.dataUrl} alt={"صورة السؤال "+(index+1)} key={n}/>:null)}
  <div className="iex-parts">{parts.map((p:QuestionPart,pi)=>{
   const pid=partId(p,pi),t=String(p.type||"").toLowerCase(),pAns=partAnswers[pid];
   const isField=fieldPartTypes.has(t)||((p.fields?.length||0)>0&&!isChoice(t)&&t!=="shortanswer"&&t!=="open");
   const excess=excessPartIds?.has(pid);
   return <div className={"iex-part "+(answered(pAns)?"done":"")} key={pid}>
    <div className="iex-part-head"><b className="iex-part-label">{p.label||String.fromCharCode(0x0623)/*أ fallback*/}</b><span className="iex-part-marks">{marks[pi]} علامة</span></div>
    {p.text&&<p className="iex-part-text">{p.text}</p>}
    {isChoice(t)&&<div className="iex-options">{(p.options||[]).map((o,n)=><label className={"iex-option "+(pAns?.kind==="choice"&&pAns.index===n?"selected":"")} key={n}><input type="radio" name={id+"-"+pid} checked={pAns?.kind==="choice"&&pAns.index===n} onChange={()=>setChoice(pid,n)} disabled={disabled}/><span className="iex-pick">{pAns?.kind==="choice"&&pAns.index===n&&<IconCheck size={14}/>}</span><b>{o.text||o.label||o.value||""}</b></label>)}</div>}
    {isField&&<QuestionField q={p} idBase={id+"-"+pid} values={pAns?.kind==="fields"?pAns.values:{}} onField={(fid,v)=>setField(pid,fid,v)} disabled={disabled}/>}
    {!isChoice(t)&&!isField&&<textarea className="iex-open" value={pAns?.kind==="text"?pAns.value:""} onChange={e=>setText(pid,e.target.value)} placeholder="اكتب إجابتك هنا..." disabled={disabled}/>}
    {excess&&<div className="iex-extra-hint">إجابة إضافية — لن تدخل في التصحيح</div>}
   </div>;
  })}</div>
 </div></article>;
}
