
import type {ReactNode} from "react";
import StudentQuestionCard,{answered} from "./StudentQuestionCard";
import type {Answer,FieldValue,Question} from "./StudentQuestionCard";
import CompoundQuestion from "./CompoundQuestion";
import {IconCheck} from "./icons";
import {
 type NormalizedSection,
 type Stimulus,
 sectionQuestionId,
 partId,
 questionParts,
 isCompound,
 selectGradedUnits,
 calculateSectionProgress
} from "./examStructure";

// Shared stimulus (topology / command output / passage) rendered ONCE before the questions that
// reference it via groupId. Content comes from section.stimuli[groupId], falling back to a per-question
// stimulus object. Reuses the existing image support; no page builder, no redesign.
function StimulusBlock({stimulus}:{stimulus:Stimulus}){
 if(!stimulus||(!stimulus.title&&!stimulus.text&&!stimulus.image?.dataUrl))return null;
 return <div className="iex-stimulus">{stimulus.title&&<strong className="iex-stimulus-title">{stimulus.title}</strong>}{stimulus.text&&<p className="iex-stimulus-text">{stimulus.text}</p>}{stimulus.image?.dataUrl&&<img className="iex-image" src={stimulus.image.dataUrl} alt={stimulus.title||"مادة مشتركة"}/>}</div>;
}

// Renders one exam SECTION: its header (title, instructions, grading rule, live progress) and its
// questions. Simple questions go through the existing StudentQuestionCard; compound questions go
// through CompoundQuestion. The section's grading policy only affects DISPLAY here (a subtle
// "extra answer" hint on answers beyond the required count) — the server still decides the score.

type Handlers={
 onChoice:(id:string,index:number)=>void;
 onSeq:(id:string,index:number,value:string)=>void;
 onTable:(id:string,index:number,value:string|boolean)=>void;
 onText:(id:string,value:string)=>void;
 onField:(id:string,fieldId:string,value:FieldValue)=>void;
 onPart:(id:string,partId:string,answer:Answer)=>void;
};

type Props=Handlers&{
 section:NormalizedSection;
 sectionNumber:number;
 startIndex:number; // global 0-based display offset so question node numbers stay continuous
 answers:Record<string,Answer>;
 disabled?:boolean;
};

function ruleLine(section:NormalizedSection){
 if(section.gradingPolicy==="capScore")return "أجب عمّا تشاء من الأسئلة — تُحتسب العلامات حتى الحد الأقصى"+(section.maxMarks!=null?" ("+section.maxMarks+" علامة)":"");
 if(section.gradingPolicy==="firstNAnswered"&&section.requiredAnswers!=null)return "أجب عن "+section.requiredAnswers+" "+(section.answerUnit==="part"?"بنود":"أسئلة")+" فقط — سيتم تصحيح أول "+section.requiredAnswers+" مجاب عنها";
 return "";
}

export default function StructuredExamSection(props:Props){
 const {section,sectionNumber,startIndex,answers,disabled,onChoice,onSeq,onTable,onText,onField,onPart}=props;
 const {countedKeys}=selectGradedUnits(section,answers);
 const progress=calculateSectionProgress(section,answers);
 const rule=ruleLine(section);
 return <section className="iex-section">
  <header className="iex-section-head">
   <div className="iex-section-title"><span className="iex-section-eyebrow">القسم {sectionNumber}</span><h2>{section.title||"القسم "+sectionNumber}</h2></div>
   {section.instructions&&<p className="iex-section-instructions">{section.instructions}</p>}
   <div className="iex-section-meta">
    {rule&&<span className="iex-section-rule">{rule}</span>}
    {section.maxMarks!=null&&<span className="iex-section-mark">العلامة: {section.maxMarks}</span>}
   </div>
   <div className="iex-section-progress">
    {progress.required!=null
     ?<><strong>أجبت عن {progress.answered} من {progress.required} المطلوبة</strong>{progress.excess>0&&<em className="iex-section-excess">أجبت عن {progress.answered} — سيُصحَّح أول {progress.required} فقط</em>}</>
     :<strong>أجبت عن {progress.answered} من {progress.total}</strong>}
   </div>
  </header>
  <div className="iex-flow">{(()=>{const stimuli=section.stimuli||{};const rendered=new Set<string>();return section.questions.map((q:Question,i)=>{
   const id=sectionQuestionId(section,q,i),globalIndex=startIndex+i;
   // Render this question's shared stimulus once, on first appearance of its groupId.
   let stimulusNode=null;
   if(q.groupId&&!rendered.has(q.groupId)){rendered.add(q.groupId);const stim=stimuli[q.groupId]||q.stimulus;if(stim)stimulusNode=<StimulusBlock stimulus={stim}/>;}
   const wrap=(content:ReactNode)=><div key={id}>{stimulusNode}{content}</div>;
   if(isCompound(q)){
    // Part-level firstN: mark each answered-but-excess part. Question-level: mark whole question.
    let excessPartIds:Set<string>|undefined;
    if(section.answerUnit==="part"){
     excessPartIds=new Set<string>();
     questionParts(q).forEach((p,pi)=>{const pid=partId(p,pi),resp=answers[id];const pAns=resp?.kind==="compound"?resp.parts?.[pid]:undefined;if(answered(pAns)&&!countedKeys.has(id+"::"+pid))excessPartIds!.add(pid);});
    }
    const wholeExcess=section.answerUnit==="question"&&answered(answers[id])&&!countedKeys.has(id);
    return wrap(<>{wholeExcess&&<div className="iex-extra-hint iex-extra-hint-block"><IconCheck size={11}/>إجابة إضافية — لن تدخل في التصحيح</div>}<CompoundQuestion q={q} index={globalIndex} id={id} answer={answers[id]} onPart={(pid,ans)=>onPart(id,pid,ans)} disabled={disabled} excessPartIds={excessPartIds}/></>);
   }
   const excess=answered(answers[id])&&!countedKeys.has(id);
   return wrap(<>{excess&&<div className="iex-extra-hint iex-extra-hint-block"><IconCheck size={11}/>إجابة إضافية — لن تدخل في التصحيح</div>}<StudentQuestionCard q={q} index={globalIndex} id={id} answer={answers[id]} onChoice={n=>onChoice(id,n)} onSeq={(n,v)=>onSeq(id,n,v)} onTable={(n,v)=>onTable(id,n,v)} onText={v=>onText(id,v)} onField={(fid,v)=>onField(id,fid,v)} disabled={disabled}/></>);
  });})()}</div>
 </section>;
}
