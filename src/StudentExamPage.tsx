
import {useEffect,useMemo,useRef,useState} from "react";
import {IconCheck} from "./icons";
import StudentQuestionCard,{qid,answered} from "./StudentQuestionCard";
import type {Question,Answer} from "./StudentQuestionCard";
import {normalizeExamTheme,previousFocusIndex,nextFocusIndex,focusProgressPercent} from "./examTheme";

type Assignment={assignmentId:string;title:string;instructions:string;openAt:string;dueAt:string;effectiveDueAt?:string;maxAttempts:number;questionCount:number;totalMarks:number;exam:{title?:string;metadata?:{school?:string;subject?:string;grade?:string;className?:string;generalInstructions?:string};presentationTheme?:string;questions?:Question[]}};
type Answers=Record<string,Answer>;
type Result={attemptNumber:number;submittedAt:string;score:number;totalMarks:number;percentage:number;manualReviewMarks:number;finalized:boolean;teacherFeedback?:string;questionGrades?:Array<{questionId:string;score:number;maxMarks:number;correct:boolean;manualReview:boolean}>};
type State={attemptsUsed:number;allowedAttempts:number;canAttempt:boolean;dueClosed:boolean;draftAnswers:Answers;draftSavedAt:string;latestResult:Result|null;attempts:Array<Result>};
type Props={token:string;assignment:Assignment;studentName:string;className:string;onBack:()=>void;onLogout:()=>void};

class ApiError extends Error{
 status:number;
 constructor(status:number,message:string){super(message);this.status=status}
}

const fmt=(v:string)=>v?new Date(v).toLocaleString("ar"):"بدون موعد";

export default function StudentExamPage({token,assignment,studentName,className,onBack,onLogout}:Props){
 const qs=assignment.exam.questions||[],theme=normalizeExamTheme(assignment.exam.presentationTheme),[answers,setAnswers]=useState<Answers>({}),[state,setState]=useState<State|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[retrying,setRetrying]=useState(false),[saveFailed,setSaveFailed]=useState(false),[dirty,setDirty]=useState(false),[submitBusy,setSubmitBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState<Result|null>(null),[started,setStarted]=useState(true),[focusIndex,setFocusIndex]=useState(0);
 const loaded=useRef(false),timer=useRef<number|null>(null),revision=useRef(0),savedRevision=useRef(0),saveQueue=useRef<Promise<void>>(Promise.resolve()),submittingRef=useRef(false),initialAnswersSynced=useRef(false),mountedRef=useRef(true),latestTargetRevision=useRef(0);
 async function api<T>(options:RequestInit={}):Promise<T>{const h=new Headers(options.headers||{});h.set("Content-Type","application/json");h.set("x-student-token",token);h.set("Authorization","Bearer "+token);const r=await fetch("/api/student-submission/"+encodeURIComponent(assignment.assignmentId),{...options,headers:h}),j=await r.json() as T&{error?:string};if(r.status===401){onLogout();throw new ApiError(401,"انتهت الجلسة.")}if(!r.ok)throw new ApiError(r.status,j.error||"حدث خطأ.");return j}
 async function saveDraftSnapshot(snapshot:Answers,myRevision:number){
  if(myRevision<latestTargetRevision.current)return;
  if(mountedRef.current){setSaving(true);setSaveFailed(false)}
  try{
   for(let attempt=0;attempt<=3;attempt++){
    if(myRevision<latestTargetRevision.current)return;
    try{
     await api({method:"POST",body:JSON.stringify({action:"saveDraft",answers:snapshot})});
     savedRevision.current=Math.max(savedRevision.current,myRevision);
     if(mountedRef.current){setSaveFailed(false);setError("");setDirty(revision.current>savedRevision.current)}
     return;
    }catch(e){
     if(myRevision<latestTargetRevision.current)return;
     const retryable=!(e instanceof ApiError)||e.status>=500;
     if(!retryable||attempt===3){
      if(mountedRef.current){setError(e instanceof Error?e.message:"تعذر الحفظ التلقائي.");setSaveFailed(true)}
      return;
     }
     if(mountedRef.current)setRetrying(true);
     await new Promise(resolve=>window.setTimeout(resolve,[1000,2000,4000][attempt]));
    }
   }
  }finally{
   if(mountedRef.current){setSaving(false);setRetrying(false)}
  }
 }
 useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false}},[]);
 useEffect(()=>{let cancelled=false;(async()=>{setLoading(true);try{const r=await api<{state:State}>();if(cancelled)return;setState(r.state);setAnswers(r.state.draftAnswers||{});setResult(r.state.latestResult);setStarted(r.state.attemptsUsed===0||Object.keys(r.state.draftAnswers||{}).length>0);loaded.current=true}catch(e){if(!cancelled)setError(e instanceof Error?e.message:"تعذر تحميل المحاولة.")}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true;if(timer.current)window.clearTimeout(timer.current)}},[assignment.assignmentId,token]);
 useEffect(()=>{if(!loaded.current||!started||!state?.canAttempt||submittingRef.current)return;if(!initialAnswersSynced.current){initialAnswersSynced.current=true;return}revision.current+=1;latestTargetRevision.current=revision.current;setDirty(true);const myRevision=revision.current,snapshot=answers;if(timer.current)window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>{if(submittingRef.current)return;saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveDraftSnapshot(snapshot,myRevision))},800);return()=>{if(timer.current)window.clearTimeout(timer.current)}},[answers,started,state?.canAttempt]);
 useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(revision.current<=savedRevision.current)return;e.preventDefault();e.returnValue=""};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler)},[]);
 useEffect(()=>{const handleOnline=()=>{if(submittingRef.current||!started||!state?.canAttempt)return;if(revision.current>savedRevision.current){const myRevision=revision.current,snapshot=answers;saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveDraftSnapshot(snapshot,myRevision))}};window.addEventListener("online",handleOnline);return()=>window.removeEventListener("online",handleOnline)},[answers,started,state?.canAttempt]);
 const done=useMemo(()=>qs.reduce((n,q,i)=>n+(answered(answers[qid(q,i)])?1:0),0),[answers,qs]),pct=qs.length?Math.round(done/qs.length*100):0;
 const setChoice=(id:string,index:number)=>setAnswers(a=>({...a,[id]:{kind:"choice",index}}));
 const setSeq=(id:string,index:number,value:string)=>setAnswers(a=>{const prev=a[id]?.kind==="sequence"?(a[id] as {kind:"sequence";values:string[]}).values:[];const values=[...prev];values[index]=value;return {...a,[id]:{kind:"sequence",values}}});
 const setTable=(id:string,index:number,value:string|boolean)=>setAnswers(a=>{const prev=a[id]?.kind==="table"?(a[id] as {kind:"table";values:(string|boolean)[]}).values:[];const values=[...prev];values[index]=value;return {...a,[id]:{kind:"table",values}}});
 async function submit(){if(!state?.canAttempt||submitBusy)return;if(done<qs.length&&!window.confirm("لم تُجب عن جميع الأسئلة. هل تريد التسليم الآن؟"))return;if(done===qs.length&&!window.confirm("سيتم إرسال الحل للتصحيح. هل تريد المتابعة؟"))return;submittingRef.current=true;setSubmitBusy(true);setError("");if(timer.current)window.clearTimeout(timer.current);const submitSnapshot=answers,submitRevision=revision.current;if(submitRevision>savedRevision.current){saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveDraftSnapshot(submitSnapshot,submitRevision))}try{await saveQueue.current;if(savedRevision.current<submitRevision){setError("تعذر حفظ إجاباتك بسبب مشكلة في الاتصال. تحقق من الإنترنت وحاول التسليم مرة أخرى.");return}const r=await api<{result:Result;state:State}>({method:"POST",body:JSON.stringify({action:"submit",answers:submitSnapshot})});setResult(r.result);setState(r.state);setStarted(false);setAnswers({});savedRevision.current=revision.current;window.scrollTo({top:0,behavior:"smooth"})}catch(e){setError(e instanceof Error?e.message:"تعذر تسليم الواجب.")}finally{setSubmitBusy(false);submittingRef.current=false}}
 function startNext(){if(!state?.canAttempt)return;setAnswers({});setResult(state.latestResult);setStarted(true);window.scrollTo({top:0,behavior:"smooth"})}
 function backWithoutSubmit(){if(revision.current>savedRevision.current&&!window.confirm("توجد إجابات لم تُحفظ بعد. هل تريد المغادرة على أي حال؟"))return;onBack()}
 if(loading)return <main className="student-portal" dir="rtl"><div className="platform-loading">⏳ جارٍ تجهيز صفحة الامتحان...</div></main>;
 if(!started&&result)return <main className={"interactive-exam-page exam-theme-"+theme} dir="rtl"><div className="iex-wrap"><section className="iex-result-card"><span className="platform-eyebrow">RESULT</span><h1>تم تسليم المحاولة {result.attemptNumber}</h1><div className="iex-score">{result.score}<small> / {result.totalMarks}</small></div><strong>{result.percentage}%</strong>{result.manualReviewMarks>0&&<p>العلامة الحالية مؤقتة، وهناك {result.manualReviewMarks} علامة تحتاج مراجعة المعلم.</p>}{result.finalized&&<p className="iex-finalized">✓ تم اعتماد العلامة النهائية.</p>}{result.teacherFeedback&&<div className="iex-teacher-feedback"><strong>ملاحظة المعلم</strong><span>{result.teacherFeedback}</span></div>}<p>تم الحفظ في حسابك بتاريخ {fmt(result.submittedAt)}</p><div className="iex-result-actions"><button onClick={onBack}>العودة إلى المهام</button>{state?.canAttempt&&<button className="primary" onClick={startNext}>بدء محاولة جديدة ({state.attemptsUsed+1} من {state.allowedAttempts})</button>}</div>{!state?.canAttempt&&<div className="iex-no-retry">لا توجد محاولة إضافية متاحة. يستطيع المعلم السماح بمحاولة أخرى من صفحة النتائج.</div>}</section></div></main>;
 return <main className={"interactive-exam-page exam-theme-"+theme} dir="rtl"><div className="iex-wrap">
  <header className="iex-head"><div><span className="iex-school">{assignment.exam.metadata?.school||"ExamBank 791381"}</span><h1>{assignment.title}</h1><p>{assignment.instructions}</p><div className="iex-badges"><span>{className||assignment.exam.metadata?.className||"الصف"}</span><span>{qs.length} أسئلة</span><span>{assignment.totalMarks} علامة</span><span>المحاولة {(state?.attemptsUsed||0)+1} / {state?.allowedAttempts||assignment.maxAttempts}</span></div></div><div className="iex-student"><strong>{studentName}</strong><span>آخر موعد: {fmt(assignment.effectiveDueAt||assignment.dueAt)}</span></div></header>
  {error&&<div className="platform-error iex-error">{error}</div>}
  <div className="iex-progress"><span>تقدّمك</span><div><i style={{width:pct+"%"}}/></div><strong>{done} / {qs.length}</strong><small>{saveFailed?"غير محفوظ — تحقق من الاتصال":retrying?"تعذر الحفظ — إعادة المحاولة...":(saving||dirty)?"جارٍ الحفظ...":<><IconCheck size={11}/>تم الحفظ</>}</small></div>
  {theme==="focus"&&qs.length>0?(()=>{const i=Math.min(focusIndex,qs.length-1),q=qs[i],id=qid(q,i);return <div className="iex-focus-mode"><div className="iex-focus-nav"><button onClick={()=>setFocusIndex(x=>previousFocusIndex(x,qs.length))} disabled={i===0}>◀ السابق</button><span>السؤال {i+1} من {qs.length}</span><button onClick={()=>setFocusIndex(x=>nextFocusIndex(x,qs.length))} disabled={i===qs.length-1}>التالي ▶</button></div><div className="iex-focus-progress"><i style={{width:focusProgressPercent(i,qs.length)+"%"}}/></div><StudentQuestionCard q={q} index={i} id={id} answer={answers[id]} onChoice={n=>setChoice(id,n)} onSeq={(n,v)=>setSeq(id,n,v)} onTable={(n,v)=>setTable(id,n,v)} onText={v=>setAnswers(x=>({...x,[id]:{kind:"text",value:v}}))} disabled={submitBusy}/></div>})():(
  <section className="iex-flow">{qs.map((q,i)=>{const id=qid(q,i);return <StudentQuestionCard key={id} q={q} index={i} id={id} answer={answers[id]} onChoice={n=>setChoice(id,n)} onSeq={(n,v)=>setSeq(id,n,v)} onTable={(n,v)=>setTable(id,n,v)} onText={v=>setAnswers(x=>({...x,[id]:{kind:"text",value:v}}))} disabled={submitBusy}/>})}</section>
  )}
  <footer className="iex-foot"><div><strong>أجبت عن {done} من {qs.length}</strong><span>{saving?"جارٍ حفظ الإجابات...":"يتم حفظ إجاباتك تلقائيًا أثناء الحل."}</span></div><div><button onClick={backWithoutSubmit}>العودة بدون تسليم</button><button className="primary" onClick={submit} disabled={submitBusy||!state?.canAttempt}>{submitBusy?"⏳ جارٍ التصحيح...":<><IconCheck size={15}/>تسليم وتصحيح الامتحان</>}</button></div></footer>
 </div></main>
}
