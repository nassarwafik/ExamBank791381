
import {useState} from "react";
import {createPortal} from "react-dom";
import StudentQuestionCard,{qid} from "./StudentQuestionCard";
import type {Question,Answer} from "./StudentQuestionCard";
import {normalizeExamTheme,type ExamTheme,THEME_LABELS,previousFocusIndex,nextFocusIndex,focusProgressPercent} from "./examTheme";

// Deliberately NOT importing ExamQuestion from "./App" - a structural type here (matching what
// App.tsx's ExamQuestion already looks like) accepts an ExamQuestion[] value with zero import
// coupling and zero risk of a circular value/type dependency between App.tsx and this file.
export type PreviewSourceQuestion={
 examQuestionId:string;
 questionNumber?:string;
 text:string;
 textHtml?:string;
 marks:number;
 presentationType:string;
 options?:{value?:string;label?:string;text?:string;order?:number}[];
 fields?:{id?:string;label?:string;order?:number;kind?:string;options?:{value?:string;label?:string;text?:string;order?:number}[]}[];
 wordBank?:string[];
 image?:{exists:boolean;visible:boolean;assets:{dataUrl:string}[]};
};

// Pure and exported for testing. The correct answer must NEVER reach this preview - this function
// is the single enforcement point for that guarantee, since it simply never reads/copies `answer`
// (or any other field) from the source question.
export function toPreviewQuestion(q:PreviewSourceQuestion):Question{
 return {
  examQuestionId:q.examQuestionId,
  text:q.text,
  textHtml:q.textHtml,
  marks:q.marks,
  presentationType:q.presentationType,
  options:q.options,
  fields:q.fields,
  wordBank:q.wordBank,
  image:q.image
 };
}

type Props={questions:PreviewSourceQuestion[];theme:ExamTheme;onClose:()=>void};

export default function ExamThemePreview({questions,theme,onClose}:Props){
 const normalized=normalizeExamTheme(theme),qs=questions.map(toPreviewQuestion);
 const [answers,setAnswers]=useState<Record<string,Answer>>({});
 const [focusIndex,setFocusIndex]=useState(0);
 const setChoice=(id:string,index:number)=>setAnswers(a=>({...a,[id]:{kind:"choice",index}}));
 const setSeq=(id:string,index:number,value:string)=>setAnswers(a=>{const prev=a[id]?.kind==="sequence"?(a[id] as {kind:"sequence";values:string[]}).values:[];const values=[...prev];values[index]=value;return {...a,[id]:{kind:"sequence",values}}});
 const setTable=(id:string,index:number,value:string|boolean)=>setAnswers(a=>{const prev=a[id]?.kind==="table"?(a[id] as {kind:"table";values:(string|boolean)[]}).values:[];const values=[...prev];values[index]=value;return {...a,[id]:{kind:"table",values}}});
 // Rendered via a portal directly into document.body, NOT inline in App.tsx's component tree.
 // This overlay uses position:fixed to cover the whole viewport, but position:fixed is only
 // viewport-relative when EVERY ancestor is free of transform/will-change/filter/contain - the
 // Exam Builder page has several ancestors that apply `transform` (e.g. .question-card:hover's
 // translateY, and various entrance animations), any of which turns position:fixed into
 // position:absolute relative to that ancestor instead. That produced exactly the intermittent
 // "preview renders squeezed into a tiny misaligned area, or blank, until you navigate away and
 // back" bug reported after this feature shipped. A portal sidesteps the whole ancestor-chain
 // problem (and any ancestor z-index/stacking-context issues) by attaching straight to <body>.
 return createPortal(
  <div className="exam-theme-preview-overlay" role="dialog" aria-modal="true">
   <header className="exam-theme-preview-head">
    <strong>🎨 التنسيق الحالي: {THEME_LABELS[normalized].name}</strong>
    <button type="button" onClick={onClose}>← العودة إلى بناء الامتحان</button>
   </header>
   <main className={"interactive-exam-page exam-theme-"+normalized} dir="rtl">
    <div className="iex-wrap">
     <p className="exam-theme-preview-note">هذه معاينة فقط — لا يتم حفظ أي إجابة هنا.</p>
     {normalized==="focus"&&qs.length>0?(()=>{const i=Math.min(focusIndex,qs.length-1),q=qs[i],id=qid(q,i);return <div className="iex-focus-mode"><div className="iex-focus-nav"><button onClick={()=>setFocusIndex(x=>previousFocusIndex(x,qs.length))} disabled={i===0}>◀ السابق</button><span>السؤال {i+1} من {qs.length}</span><button onClick={()=>setFocusIndex(x=>nextFocusIndex(x,qs.length))} disabled={i===qs.length-1}>التالي ▶</button></div><div className="iex-focus-progress"><i style={{width:focusProgressPercent(i,qs.length)+"%"}}/></div><StudentQuestionCard q={q} index={i} id={id} answer={answers[id]} onChoice={n=>setChoice(id,n)} onSeq={(n,v)=>setSeq(id,n,v)} onTable={(n,v)=>setTable(id,n,v)} onText={v=>setAnswers(x=>({...x,[id]:{kind:"text",value:v}}))}/></div>})():(
     <section className="iex-flow">{qs.map((q,i)=>{const id=qid(q,i);return <StudentQuestionCard key={id} q={q} index={i} id={id} answer={answers[id]} onChoice={n=>setChoice(id,n)} onSeq={(n,v)=>setSeq(id,n,v)} onTable={(n,v)=>setTable(id,n,v)} onText={v=>setAnswers(x=>({...x,[id]:{kind:"text",value:v}}))}/>})}</section>
     )}
    </div>
   </main>
  </div>,
  document.body
 );
}
