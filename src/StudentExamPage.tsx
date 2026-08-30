
import {useEffect,useMemo,useRef,useState} from "react";
import {IconCheck} from "./icons";

type Opt={value?:string;label?:string;text?:string;order?:number;number?:number};
type Field={id?:string;number?:number;label?:string;kind?:string;options?:Opt[]};
type ImageAsset={dataUrl?:string};
type Question={examQuestionId?:string;id?:string;number?:number;text:string;textHtml?:string;marks:number;presentationType?:string;type?:string;options?:Opt[];fields?:Field[];wordBank?:string[];image?:{exists?:boolean;visible?:boolean;assets?:ImageAsset[]};images?:ImageAsset[]};
type Assignment={assignmentId:string;title:string;instructions:string;openAt:string;dueAt:string;maxAttempts:number;questionCount:number;totalMarks:number;exam:{title?:string;metadata?:{school?:string;subject?:string;grade?:string;className?:string;generalInstructions?:string};questions?:Question[]}};
type Answer={kind:"choice";index:number}|{kind:"sequence";values:string[]}|{kind:"table";values:(string|boolean)[]}|{kind:"text";value:string};
type Answers=Record<string,Answer>;
type Result={attemptNumber:number;submittedAt:string;score:number;totalMarks:number;percentage:number;manualReviewMarks:number;finalized:boolean;teacherFeedback?:string;questionGrades?:Array<{questionId:string;score:number;maxMarks:number;correct:boolean;manualReview:boolean}>};
type State={attemptsUsed:number;allowedAttempts:number;canAttempt:boolean;dueClosed:boolean;draftAnswers:Answers;draftSavedAt:string;latestResult:Result|null;attempts:Array<Result>};
type Props={token:string;assignment:Assignment;studentName:string;className:string;onBack:()=>void;onLogout:()=>void};

const qid=(q:Question,i:number)=>String(q.examQuestionId||q.id||q.number||i+1);
const typeOf=(q:Question)=>String(q.presentationType||q.type||"").toLowerCase();
const fmt=(v:string)=>v?new Date(v).toLocaleString("ar"):"بدون موعد";
function parseTable(text:string){
 const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(x=>x.startsWith("|")&&x.endsWith("|"));
 if(lines.length<2)return null;
 const split=(x:string)=>x.slice(1,-1).split("|").map(y=>y.trim());
 const all=lines.map(split),headers=all[0],rows=all.slice(1).filter(r=>!r.every(c=>/^:?-{3,}:?$/.test(c.replace(/\s/g,""))));
 return rows.length?{headers,rows}:null;
}
function promptText(text:string){const p=text.indexOf("\n|");return p>=0?text.slice(0,p).trim():text}
function answered(a:Answer|undefined){if(!a)return false;if(a.kind==="choice")return Number.isInteger(a.index);if(a.kind==="text")return !!a.value.trim();return a.values.some(v=>typeof v==="boolean"?v:String(v).trim()!=="")}
function tableCheckbox(q:Question){return /وضع علامة|✓|خاص بالشبكات الخاصة\?|private\?/i.test(q.text)}
function imageList(q:Question){if(q.image?.exists&&q.image.visible&&Array.isArray(q.image.assets))return q.image.assets;return Array.isArray(q.images)?q.images:[]}

/* EXAMBANK_WORD_BANK_DROPDOWN_FIX */
function getWordBank(q:Question){
 const values:string[]=[];
 const add=(raw:unknown)=>{
  const value=String(raw??"").trim();
  if(!value||value==="— اختر —")return;
  if(!values.includes(value))values.push(value);
 };
 if(Array.isArray(q.wordBank))q.wordBank.forEach(add);
 for(const field of q.fields||[]){
  for(const option of field.options||[]){
   add(option.text||option.label||option.value);
  }
 }
 if(!values.length&&typeOf(q)==="wordbank"){
  for(const option of q.options||[]){
   add(option.text||option.label||option.value);
  }
 }
 return values;
}

export default function StudentExamPage({token,assignment,studentName,className,onBack,onLogout}:Props){
 const qs=assignment.exam.questions||[],[answers,setAnswers]=useState<Answers>({}),[state,setState]=useState<State|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[submitBusy,setSubmitBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState<Result|null>(null),[started,setStarted]=useState(true);
 const loaded=useRef(false),timer=useRef<number|null>(null),revision=useRef(0),savedRevision=useRef(0);
 async function api<T>(options:RequestInit={}):Promise<T>{const h=new Headers(options.headers||{});h.set("Content-Type","application/json");h.set("x-student-token",token);h.set("Authorization","Bearer "+token);const r=await fetch("/api/student-submission/"+encodeURIComponent(assignment.assignmentId),{...options,headers:h}),j=await r.json() as T&{error?:string};if(r.status===401){onLogout();throw new Error("انتهت الجلسة.")}if(!r.ok)throw new Error(j.error||"حدث خطأ.");return j}
 useEffect(()=>{let cancelled=false;(async()=>{setLoading(true);try{const r=await api<{state:State}>();if(cancelled)return;setState(r.state);setAnswers(r.state.draftAnswers||{});setResult(r.state.latestResult);setStarted(r.state.attemptsUsed===0||Object.keys(r.state.draftAnswers||{}).length>0);loaded.current=true}catch(e){if(!cancelled)setError(e instanceof Error?e.message:"تعذر تحميل المحاولة.")}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true;if(timer.current)window.clearTimeout(timer.current)}},[assignment.assignmentId,token]);
 useEffect(()=>{if(!loaded.current||!started||!state?.canAttempt)return;revision.current+=1;const myRevision=revision.current;if(timer.current)window.clearTimeout(timer.current);timer.current=window.setTimeout(async()=>{setSaving(true);try{await api({method:"POST",body:JSON.stringify({action:"saveDraft",answers})});savedRevision.current=Math.max(savedRevision.current,myRevision)}catch(e){setError(e instanceof Error?e.message:"تعذر الحفظ التلقائي.")}finally{setSaving(false)}},800);return()=>{if(timer.current)window.clearTimeout(timer.current)}},[answers,started,state?.canAttempt]);
 useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(revision.current<=savedRevision.current)return;e.preventDefault();e.returnValue=""};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler)},[]);
 const done=useMemo(()=>qs.reduce((n,q,i)=>n+(answered(answers[qid(q,i)])?1:0),0),[answers,qs]),pct=qs.length?Math.round(done/qs.length*100):0;
 const setChoice=(id:string,index:number)=>setAnswers(a=>({...a,[id]:{kind:"choice",index}}));
 const setSeq=(id:string,index:number,value:string)=>setAnswers(a=>{const prev=a[id]?.kind==="sequence"?(a[id] as {kind:"sequence";values:string[]}).values:[];const values=[...prev];values[index]=value;return {...a,[id]:{kind:"sequence",values}}});
 const setTable=(id:string,index:number,value:string|boolean)=>setAnswers(a=>{const prev=a[id]?.kind==="table"?(a[id] as {kind:"table";values:(string|boolean)[]}).values:[];const values=[...prev];values[index]=value;return {...a,[id]:{kind:"table",values}}});
 async function submit(){if(!state?.canAttempt||submitBusy)return;if(done<qs.length&&!window.confirm("لم تُجب عن جميع الأسئلة. هل تريد التسليم الآن؟"))return;if(done===qs.length&&!window.confirm("سيتم إرسال الحل للتصحيح. هل تريد المتابعة؟"))return;setSubmitBusy(true);setError("");try{const r=await api<{result:Result;state:State}>({method:"POST",body:JSON.stringify({action:"submit",answers})});setResult(r.result);setState(r.state);setStarted(false);setAnswers({});savedRevision.current=revision.current;window.scrollTo({top:0,behavior:"smooth"})}catch(e){setError(e instanceof Error?e.message:"تعذر تسليم الواجب.")}finally{setSubmitBusy(false)}}
 function startNext(){if(!state?.canAttempt)return;setAnswers({});setResult(state.latestResult);setStarted(true);window.scrollTo({top:0,behavior:"smooth"})}
 if(loading)return <main className="student-portal" dir="rtl"><div className="platform-loading">⏳ جارٍ تجهيز صفحة الامتحان...</div></main>;
 if(!started&&result)return <main className="interactive-exam-page" dir="rtl"><div className="iex-wrap"><section className="iex-result-card"><span className="platform-eyebrow">RESULT</span><h1>تم تسليم المحاولة {result.attemptNumber}</h1><div className="iex-score">{result.score}<small> / {result.totalMarks}</small></div><strong>{result.percentage}%</strong>{result.manualReviewMarks>0&&<p>العلامة الحالية مؤقتة، وهناك {result.manualReviewMarks} علامة تحتاج مراجعة المعلم.</p>}{result.finalized&&<p className="iex-finalized">✓ تم اعتماد العلامة النهائية.</p>}{result.teacherFeedback&&<div className="iex-teacher-feedback"><strong>ملاحظة المعلم</strong><span>{result.teacherFeedback}</span></div>}<p>تم الحفظ في حسابك بتاريخ {fmt(result.submittedAt)}</p><div className="iex-result-actions"><button onClick={onBack}>العودة إلى المهام</button>{state?.canAttempt&&<button className="primary" onClick={startNext}>بدء محاولة جديدة ({state.attemptsUsed+1} من {state.allowedAttempts})</button>}</div>{!state?.canAttempt&&<div className="iex-no-retry">لا توجد محاولة إضافية متاحة. يستطيع المعلم السماح بمحاولة أخرى من صفحة النتائج.</div>}</section></div></main>;
 return <main className="interactive-exam-page" dir="rtl"><div className="iex-wrap">
  <header className="iex-head"><div><span className="iex-school">{assignment.exam.metadata?.school||"ExamBank 791381"}</span><h1>{assignment.title}</h1><p>{assignment.instructions}</p><div className="iex-badges"><span>{className||assignment.exam.metadata?.className||"الصف"}</span><span>{qs.length} أسئلة</span><span>{assignment.totalMarks} علامة</span><span>المحاولة {(state?.attemptsUsed||0)+1} / {state?.allowedAttempts||assignment.maxAttempts}</span></div></div><div className="iex-student"><strong>{studentName}</strong><span>آخر موعد: {fmt(assignment.dueAt)}</span></div></header>
  {error&&<div className="platform-error iex-error">{error}</div>}
  <div className="iex-progress"><span>تقدّمك</span><div><i style={{width:pct+"%"}}/></div><strong>{done} / {qs.length}</strong><small>{saving?"جارٍ الحفظ...":<><IconCheck size={11}/>حفظ تلقائي</>}</small></div>
  <section className="iex-flow">{qs.map((q,i)=>{const id=qid(q,i),t=typeOf(q),a=answers[id],table=parseTable(q.text),seq=t==="wordbank"||t==="fillblank"||((q.fields?.length||0)>0&&t!=="open");return <article className={"iex-q "+(answered(a)?"done":"")} key={id}><div className="iex-node">{i+1}</div><div className="iex-card"><div className="iex-qhead"><span>{t==="multiplechoice"?"اختيار من متعدد":table?"أكمل الجدول":seq?"أكمل الناقص":"سؤال"}</span><strong>{q.marks} علامة</strong></div><p className="iex-qtext">{promptText(q.text)}</p>
   {imageList(q).map((im,n)=>im.dataUrl?<img className="iex-image" src={im.dataUrl} alt={"صورة السؤال "+(i+1)} key={n}/>:null)}
   {t==="multiplechoice"&&<div className="iex-options">{(q.options||[]).map((o,n)=><label className={"iex-option "+(a?.kind==="choice"&&a.index===n?"selected":"")} key={n}><input type="radio" name={id} checked={a?.kind==="choice"&&a.index===n} onChange={()=>setChoice(id,n)}/><span className="iex-pick">{a?.kind==="choice"&&a.index===n&&<IconCheck size={14}/>}</span><b>{o.text||o.label||o.value||""}</b></label>)}</div>}
   {table&&<div className="iex-table-wrap"><table><thead><tr>{table.headers.map((h,n)=><th key={n}>{h}</th>)}</tr></thead><tbody>{table.rows.map((r,n)=><tr key={n}><td>{r[0]}</td><td>{tableCheckbox(q)?<input className="iex-check" type="checkbox" checked={a?.kind==="table"&&Boolean(a.values[n])} onChange={e=>setTable(id,n,e.target.checked)}/>:<input className="iex-cell" value={a?.kind==="table"?String(a.values[n]??""):""} onChange={e=>setTable(id,n,e.target.value)} placeholder="اكتب الإجابة"/>}</td></tr>)}</tbody></table></div>}
   {!table&&seq&&(()=>{const bank=getWordBank(q);return <><div className="iex-bank">{bank.map((w,n)=><span key={n}>{w}</span>)}</div><div className="iex-seq">{(q.fields||[]).map((f,n)=><label key={f.id||f.number||n}><span>{f.label||"الحقل "+(n+1)}</span><select value={a?.kind==="sequence"?a.values[n]||"":""} onChange={e=>setSeq(id,n,e.target.value)}><option value="">— اختر —</option>{bank.map((w,k)=><option key={k} value={w}>{w}</option>)}</select></label>)}</div></>})()}
   {!table&&!seq&&t!=="multiplechoice"&&<textarea className="iex-open" value={a?.kind==="text"?a.value:""} onChange={e=>setAnswers(x=>({...x,[id]:{kind:"text",value:e.target.value}}))} placeholder="اكتب إجابتك هنا..."/>}
  </div></article>})}</section>
  <footer className="iex-foot"><div><strong>أجبت عن {done} من {qs.length}</strong><span>{saving?"جارٍ حفظ الإجابات...":"يتم حفظ إجاباتك تلقائيًا أثناء الحل."}</span></div><div><button onClick={onBack}>العودة بدون تسليم</button><button className="primary" onClick={submit} disabled={submitBusy||!state?.canAttempt}>{submitBusy?"⏳ جارٍ التصحيح...":<><IconCheck size={15}/>تسليم وتصحيح الامتحان</>}</button></div></footer>
 </div></main>
}
