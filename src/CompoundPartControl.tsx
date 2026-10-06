import {IconCheck} from "./icons";
import QuestionField from "./QuestionField";
import {optionsFor} from "./StudentQuestionCard";
import type {QuestionPart,Answer,FieldValue} from "./StudentQuestionCard";

// Phase 20D — the LEGACY per-part answer control (choice radios / QuestionField fields / free-text textarea), extracted verbatim from
// CompoundQuestion so the composite@1 renderer reuses the SAME markup, classes, aria attributes and answer shapes for its legacy children.
// It covers only types WITHOUT a registered renderer and that are not unsupported (the caller decides that); compound@1's rendered DOM is
// unchanged (pinned by the 20D freeze digests). `name` names the controls when the part has no text; `textId` is set only when it has text.

const isChoice=(t:string)=>t==="multiplechoice"||t==="truefalse";
const fieldPartTypes=new Set(["multitruefalse","clifill","tablefill","wordbank","matching"]);

type Props={
 p:QuestionPart;
 idBase:string;
 answer:Answer|undefined;
 onAnswer:(answer:Answer)=>void;
 disabled?:boolean;
 textId?:string;
 name:string;
};

export default function CompoundPartControl({p,idBase,answer:pAns,onAnswer,disabled,textId,name}:Props){
 const t=String(p.type||"").toLowerCase();
 const isField=fieldPartTypes.has(t)||((p.fields?.length||0)>0&&!isChoice(t)&&t!=="shortanswer"&&t!=="open");
 const labelled=textId?{"aria-labelledby":textId}:{"aria-label":name};
 const setField=(fieldId:string,value:FieldValue)=>{const prev=pAns?.kind==="fields"?pAns.values:{};onAnswer({kind:"fields",values:{...prev,[fieldId]:value}});};
 return <>
  {isChoice(t)&&<fieldset className="iex-options" {...labelled}>{optionsFor(p).map((o,n)=><label className={"iex-option "+(pAns?.kind==="choice"&&pAns.index===n?"selected":"")} key={n}><input type="radio" name={idBase} checked={pAns?.kind==="choice"&&pAns.index===n} onChange={()=>onAnswer({kind:"choice",index:n})} disabled={disabled}/><span className="iex-pick" aria-hidden="true">{pAns?.kind==="choice"&&pAns.index===n&&<IconCheck size={14}/>}</span><b>{o.text||o.label||o.value||""}</b></label>)}</fieldset>}
  {isField&&<QuestionField q={p} idBase={idBase} values={pAns?.kind==="fields"?pAns.values:{}} onField={setField} disabled={disabled} labelPrefix={name}/>}
  {!isChoice(t)&&!isField&&<textarea className="iex-open" {...labelled} value={pAns?.kind==="text"?pAns.value:""} onChange={e=>onAnswer({kind:"text",value:e.target.value})} placeholder="اكتب إجابتك هنا..." disabled={disabled}/>}
 </>;
}
