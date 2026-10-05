
import {lazy,Suspense,type ReactNode} from "react";
import StudentQuestionCard,{answered} from "./StudentQuestionCard";
// Phase 19G — the scenario presentation (shared sources + instructions) is LAZY: loaded only for a section that carries scenarios, so the
// initial graph is unchanged; the view runs the strict projection itself (a malformed scenario renders nothing).
const ScenarioView=lazy(()=>import("./scenario/ScenarioView"));
import type {Answer,FieldValue,Question} from "./StudentQuestionCard";
import CompoundQuestion from "./CompoundQuestion";
import {IconCheck} from "./icons";
import {sectionRuleLine} from "./student/exam/sectionRule";
// Phase 13C-A — interactive CONTEXT (data descriptor → trusted lazy host). Never a scored response.
import {AssessmentActivityContext} from "./AssessmentActivityContext";
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
// F2: descriptor placement — only the literal "after" moves the context after the content; anything else means before.
function activityPlacement(activity:unknown):"before"|"after"{
 return !!activity&&typeof activity==="object"&&(activity as {placement?:unknown}).placement==="after"?"after":"before";
}
function StimulusBlock({stimulus}:{stimulus:Stimulus}){
 if(!stimulus||(!stimulus.title&&!stimulus.text&&!stimulus.image?.dataUrl&&!stimulus.activity))return null;
 // F2: `placement` is honored — "after" renders the interactive context after the stimulus content, default before it.
 const stimActivity=stimulus.activity!==undefined?<AssessmentActivityContext descriptor={stimulus.activity} scope="stimulus"/>:null;
 const stimAfter=activityPlacement(stimulus.activity)==="after";
 return <div className="iex-stimulus">{!stimAfter&&stimActivity}{stimulus.title&&<strong className="iex-stimulus-title">{stimulus.title}</strong>}{stimulus.text&&<p className="iex-stimulus-text">{stimulus.text}</p>}{stimulus.image?.dataUrl&&<img className="iex-image" src={stimulus.image.dataUrl} alt={stimulus.title||"مادة مشتركة"}/>}{stimAfter&&stimActivity}</div>;
}

// Renders one exam SECTION: its header (title, instructions, grading rule, live progress) and its
// questions. Simple questions go through the existing StudentQuestionCard; compound questions go
// through CompoundQuestion. The section's grading policy only affects DISPLAY here (a subtle
// "extra answer" hint on answers beyond the required count) — the server still decides the score.

export type SectionHandlers={
 onChoice:(id:string,index:number)=>void;
 onSeq:(id:string,index:number,value:string)=>void;
 onTable:(id:string,index:number,value:string|boolean)=>void;
 onText:(id:string,value:string)=>void;
 onField:(id:string,fieldId:string,value:FieldValue)=>void;
 onPart:(id:string,partId:string,answer:Answer)=>void;
 // Phase 16A — generic seam for registered question types (the owner stores the whole next Answer under the question id).
 onAnswer?:(id:string,answer:Answer)=>void;
};

type Props=SectionHandlers&{
 section:NormalizedSection;
 sectionNumber:number;
 startIndex:number; // global 0-based display offset so question node numbers stay continuous
 answers:Record<string,Answer>;
 disabled?:boolean;
};


export default function StructuredExamSection(props:Props){
 const {section,sectionNumber,startIndex,answers,disabled,onChoice,onSeq,onTable,onText,onField,onPart,onAnswer}=props;
 const {countedKeys}=selectGradedUnits(section,answers);
 const progress=calculateSectionProgress(section,answers);
 const rule=sectionRuleLine(section);
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
  <div className="iex-flow">{(()=>{const rendered=new Set<string>();return section.questions.map((q:Question,i)=>{
   const id=sectionQuestionId(section,q,i);
   // Render this question's shared stimulus once, on first appearance of its groupId.
   let showStimulus=false;
   if(q.groupId&&!rendered.has(q.groupId)){rendered.add(q.groupId);showStimulus=true;}
   return <div key={id}><StructuredSectionQuestion section={section} q={q} questionIndex={i} globalIndex={startIndex+i} answers={answers} countedKeys={countedKeys} showStimulus={showStimulus} disabled={disabled} onChoice={onChoice} onSeq={onSeq} onTable={onTable} onText={onText} onField={onField} onPart={onPart} onAnswer={onAnswer}/></div>;
  });})()}</div>
 </section>;
}

// ONE structured question with its section semantics (answer key = sectionQuestionId, the firstN "extra answer" hint
// from the shared selectGradedUnits, compound vs simple routing, optional shared stimulus). Extracted verbatim from
// the long-form map above so the paged student runtime (UX-7b-2) and the long-form teacher preview render a question
// through the exact same code — the semantics are reused, the all-questions container is not.
export type StructuredQuestionProps=SectionHandlers&{
 section:NormalizedSection;
 q:Question;
 questionIndex:number; // 0-based position inside the section (identity)
 globalIndex:number;   // 0-based display offset across the exam (node number)
 answers:Record<string,Answer>;
 countedKeys:Set<string>;
 showStimulus:boolean;
 /** 19G — false when the owner renders the scenario block itself (the paged runtime places it beside the question on wide screens). */
 showScenario?:boolean;
 disabled?:boolean;
};
export function StructuredSectionQuestion(props:StructuredQuestionProps){
 const {section,q,questionIndex,globalIndex,answers,countedKeys,showStimulus,showScenario=true,disabled,onChoice,onSeq,onTable,onText,onField,onPart,onAnswer}=props;
 const id=sectionQuestionId(section,q,questionIndex);
 let stimulusNode:ReactNode=null;
 if(showStimulus&&q.groupId){const stim=(section.stimuli||{})[q.groupId]||q.stimulus;if(stim)stimulusNode=<StimulusBlock stimulus={stim}/>;}
 // 19G — the scenario block (sources first, then any legacy stimulus, then the card); rendered on every member's page / before every member.
 const scenarioNode:ReactNode=showScenario&&Array.isArray(section.scenarios)&&section.scenarios.length>0?<Suspense fallback={null}><ScenarioView section={section} questionId={id}/></Suspense>:null;
 // Question-level interactive context: rendered with the question (before its body); the response controls are untouched.
 const qActivity=(q as {activity?:unknown}).activity;
 const activityNode:ReactNode=qActivity!==undefined?<AssessmentActivityContext descriptor={qActivity} scope="question"/>:null;
 // F2: `placement` is honored — "after" renders the context after the question body, default before it.
 const activityAfter=activityPlacement(qActivity)==="after";
 const activityBefore:ReactNode=activityAfter?null:activityNode, activityTail:ReactNode=activityAfter?activityNode:null;
 if(isCompound(q)){
  // Part-level firstN: mark each answered-but-excess part. Question-level: mark whole question.
  let excessPartIds:Set<string>|undefined;
  if(section.answerUnit==="part"){
   excessPartIds=new Set<string>();
   questionParts(q).forEach((p,pi)=>{const pid=partId(p,pi),resp=answers[id];const pAns=resp?.kind==="compound"?resp.parts?.[pid]:undefined;if(answered(pAns)&&!countedKeys.has(id+"::"+pid))excessPartIds!.add(pid);});
  }
  const wholeExcess=section.answerUnit==="question"&&answered(answers[id])&&!countedKeys.has(id);
  return <>{scenarioNode}{stimulusNode}{activityBefore}{wholeExcess&&<div className="iex-extra-hint iex-extra-hint-block"><IconCheck size={11}/>إجابة إضافية — لن تدخل في التصحيح</div>}<CompoundQuestion q={q} index={globalIndex} id={id} answer={answers[id]} onPart={(pid,ans)=>onPart(id,pid,ans)} disabled={disabled} excessPartIds={excessPartIds}/>{activityTail}</>;
 }
 const excess=answered(answers[id])&&!countedKeys.has(id);
 return <>{scenarioNode}{stimulusNode}{activityBefore}{excess&&<div className="iex-extra-hint iex-extra-hint-block"><IconCheck size={11}/>إجابة إضافية — لن تدخل في التصحيح</div>}<StudentQuestionCard q={q} index={globalIndex} id={id} answer={answers[id]} onChoice={n=>onChoice(id,n)} onSeq={(n,v)=>onSeq(id,n,v)} onTable={(n,v)=>onTable(id,n,v)} onText={v=>onText(id,v)} onField={(fid,v)=>onField(id,fid,v)} onAnswer={onAnswer?next=>onAnswer(id,next):undefined} disabled={disabled}/>{activityTail}</>;
}
