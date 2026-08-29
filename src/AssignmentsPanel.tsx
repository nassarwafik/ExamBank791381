import {useEffect,useMemo,useState} from "react";
import AssignmentReview from "./AssignmentReview";
import {IconPlus,IconChevronDown} from "./icons";

type Classroom={classId:string;name:string;grade:string;active:boolean};
type Item={assignmentId:string;classId:string;className:string;title:string;instructions:string;status:"draft"|"published"|"archived";openAt:string;dueAt:string;questionCount:number;totalMarks:number;maxAttempts:number};
type Exam={examId?:string;title?:string;totalMarks?:number;questions?:unknown[]};
type SavedExam={blobName:string;examId:string;title:string;savedAt:string;questionCount:number;totalMarks:number};
type Attempt={attemptNumber:number;score:number;totalMarks:number;percentage:number;submittedAt:string;finalized:boolean;manualReviewMarks:number};
type StudentResult={studentId:string;studentName:string;studentCode:string;attemptsUsed:number;allowedAttempts:number;attempts:Attempt[];latestResult:Attempt|null};
type Stats={students:number;submitted:number;pendingReview:number;average:number|null;highest:number|null;lowest:number|null};
type Props={token:string;classes:Classroom[];currentExam:unknown|null};

const localDate=(h:number)=>{const d=new Date(Date.now()+h*3600000);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const fmt=(v:string)=>v?new Date(v).toLocaleString("ar"):"بدون موعد";

export default function AssignmentsPanel({token,classes,currentExam}:Props){
 const current=currentExam&&typeof currentExam==="object"?currentExam as Exam:null;
 const [items,setItems]=useState<Item[]>([]),[classId,setClassId]=useState(""),[title,setTitle]=useState(""),[instructions,setInstructions]=useState("أجب عن جميع الأسئلة واقرأ التعليمات جيدًا قبل البدء."),[openAt,setOpenAt]=useState(localDate(0)),[dueAt,setDueAt]=useState(localDate(72)),[maxAttempts,setMaxAttempts]=useState(1),[publish,setPublish]=useState(true),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[resultsFor,setResultsFor]=useState<Item|null>(null),[results,setResults]=useState<StudentResult[]>([]),[stats,setStats]=useState<Stats|null>(null),[review,setReview]=useState<{studentId:string;attemptNumber:number}|null>(null);
 const [savedExams,setSavedExams]=useState<SavedExam[]>([]),[examSource,setExamSource]=useState(current?"current":""),[savedExam,setSavedExam]=useState<Exam|null>(null),[examLoading,setExamLoading]=useState(false);
 const active=useMemo(()=>classes.filter(x=>x.active),[classes]);
 const sourceExam=examSource==="current"?current:savedExam;
 useEffect(()=>{if(!classId&&active[0])setClassId(active[0].classId)},[active,classId]);
 useEffect(()=>{if(current&&examSource===""&&Array.isArray(current.questions)&&current.questions.length)setExamSource("current")},[current,examSource]);

 async function api<T>(url:string,options:RequestInit={}):Promise<T>{
  const h=new Headers(options.headers||{});h.set("Content-Type","application/json");h.set("x-builder-token",token);h.set("Authorization","Bearer "+token);
  const r=await fetch(url,{...options,headers:h}),j=await r.json() as T&{error?:string};if(!r.ok)throw new Error(j.error||"حدث خطأ.");return j;
 }
 async function load(){setLoading(true);try{const r=await api<{assignments:Item[]}>("/api/assignments");setItems(r.assignments||[])}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل الواجبات.")}finally{setLoading(false)}}
 async function loadSavedExams(){
  try{const r=await api<{exams:SavedExam[]}>("/api/saved-exams");setSavedExams(r.exams||[])}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل الامتحانات المحفوظة.")}
 }
 useEffect(()=>{void load();void loadSavedExams()},[]);

 async function chooseExam(value:string){
  setExamSource(value);setSavedExam(null);setError("");setNotice("");
  if(!value){return}
  if(value==="current"){
   if(current?.title)setTitle(current.title);
   return;
  }
  const meta=savedExams.find(x=>x.blobName===value);
  setExamLoading(true);
  try{
   const r=await api<{exam:Exam}>("/api/saved-exams",{method:"POST",body:JSON.stringify({action:"load",blobName:value})});
   setSavedExam(r.exam||null);setTitle(String(r.exam?.title||meta?.title||""));setNotice("✓ تم اختيار الامتحان المحفوظ.");
  }catch(e){setExamSource("");setError(e instanceof Error?e.message:"تعذر فتح الامتحان المحفوظ.")}finally{setExamLoading(false)}
 }

 async function create(){
  if(busy||!classId||!title.trim()||!sourceExam||!Array.isArray(sourceExam.questions)||!sourceExam.questions.length)return;
  setBusy(true);setError("");setNotice("");
  try{
   const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"create",classId,title:title.trim(),instructions:instructions.trim(),openAt:openAt?new Date(openAt).toISOString():"",dueAt:dueAt?new Date(dueAt).toISOString():"",maxAttempts,publish,examSnapshot:sourceExam})});
   setItems(x=>[r.assignment,...x]);setNotice("✓ تم إنشاء الواجب من الامتحان المختار.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء الواجب.")}finally{setBusy(false)}
 }
 async function action(item:Item,body:any){setBusy(true);try{const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({assignmentId:item.assignmentId,...body})});setItems(x=>x.map(y=>y.assignmentId===item.assignmentId?r.assignment:y))}catch(e){setError(e instanceof Error?e.message:"تعذر تنفيذ العملية.")}finally{setBusy(false)}}
 async function remove(item:Item){if(!window.confirm("حذف الواجب «"+item.title+"»؟"))return;setBusy(true);try{await api("/api/assignments",{method:"POST",body:JSON.stringify({action:"delete",assignmentId:item.assignmentId})});setItems(x=>x.filter(y=>y.assignmentId!==item.assignmentId));if(resultsFor?.assignmentId===item.assignmentId){setResultsFor(null);setResults([]);setStats(null)}}catch(e){setError(e instanceof Error?e.message:"تعذر حذف الواجب.")}finally{setBusy(false)}}
 async function loadResults(item=resultsFor){if(!item)return;setBusy(true);try{const r=await api<{students:StudentResult[];stats:Stats}>("/api/assignment-results?assignmentId="+encodeURIComponent(item.assignmentId));setResultsFor(item);setResults(r.students||[]);setStats(r.stats||null)}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل النتائج.")}finally{setBusy(false)}}
 async function retry(s:StudentResult){if(!resultsFor)return;setBusy(true);try{const r=await api<{allowedAttempts:number}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"allowRetry",assignmentId:resultsFor.assignmentId,studentId:s.studentId})});setResults(x=>x.map(y=>y.studentId===s.studentId?{...y,allowedAttempts:r.allowedAttempts}:y));setNotice("✓ تم السماح بمحاولة إضافية للطالب "+s.studentName)}catch(e){setError(e instanceof Error?e.message:"تعذر السماح بالمحاولة.")}finally{setBusy(false)}}
 const visible=classId?items.filter(x=>x.classId===classId):items;
 const sourceCount=Array.isArray(sourceExam?.questions)?sourceExam.questions.length:0;

 return <section className="assignments-panel platform-card">
  <div className="assignments-heading"><div><span className="platform-eyebrow">Assignments · Phase 2.0E</span><h3>الواجبات، التصحيح وسجل العلامات</h3><p>اختر امتحانًا محفوظًا ثم حوّله إلى واجب للصف.</p></div><button onClick={()=>{void load();void loadSavedExams()}} disabled={loading||examLoading}>↻ تحديث</button></div>
  {error&&<div className="platform-error assignment-inline-message">{error}</div>}{notice&&<div className="platform-notice assignment-inline-message">{notice}</div>}

  {/* Zone 1: Create Assignment — collapsible, open by default only while the class has no assignments yet */}
  <details className="assignment-zone assignment-create-zone" open={items.length===0}>
   <summary><IconPlus size={16}/><span>إنشاء واجب جديد</span><IconChevronDown size={14} className="details-chevron"/></summary>
   <div className="assignment-zone-body">
    <div className="assignment-source-card">
     <div style={{flex:1}}><span>مصدر الواجب</span><strong>{sourceExam?.title||"لم يتم اختيار امتحان"}</strong><small>{sourceCount?sourceCount+" سؤال":"اختر امتحانًا من القائمة"}</small></div>
     <div style={{minWidth:"min(100%, 390px)"}}><label>اختيار الامتحان<select value={examSource} onChange={e=>void chooseExam(e.target.value)} disabled={examLoading}>
      <option value="">اختر امتحانًا محفوظًا</option>
      {current&&Array.isArray(current.questions)&&current.questions.length>0&&<option value="current">الامتحان المفتوح حاليًا · {current.title||"بدون عنوان"}</option>}
      {savedExams.map(x=><option key={x.blobName} value={x.blobName}>{x.title} · {x.questionCount} سؤال · {x.totalMarks} علامة</option>)}
     </select></label>{examLoading&&<small>⏳ جارٍ فتح الامتحان...</small>}</div>
     <div className="assignment-source-marks">{sourceExam?.totalMarks?sourceExam.totalMarks+" علامة":"—"}</div>
    </div>
    <div className="assignment-create-grid">
     <label>الصف<select value={classId} onChange={e=>setClassId(e.target.value)}><option value="">اختر الصف</option>{active.map(c=><option value={c.classId} key={c.classId}>{c.name}{c.grade?" · "+c.grade:""}</option>)}</select></label>
     <label>عنوان الواجب<input value={title} onChange={e=>setTitle(e.target.value)}/></label>
     <label className="assignment-wide-field">تعليمات<textarea value={instructions} onChange={e=>setInstructions(e.target.value)}/></label>
     <label>يفتح في<input type="datetime-local" value={openAt} onChange={e=>setOpenAt(e.target.value)}/></label>
     <label>آخر موعد<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
     <label>عدد المحاولات<select value={maxAttempts} onChange={e=>setMaxAttempts(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
     <label className="assignment-publish-toggle"><input type="checkbox" checked={publish} onChange={e=>setPublish(e.target.checked)}/><span>نشر مباشرة</span></label>
    </div>
    <div className="assignment-create-cta-row">
     <button className="platform-primary assignment-create-button" onClick={create} disabled={busy||examLoading||!classId||!title.trim()||!sourceExam||!sourceCount}>📤 إنشاء الواجب</button>
    </div>
   </div>
  </details>

  {/* Zone 2: Current Assignments */}
  <section className="assignment-zone assignment-list-zone">
   <div className="assignment-zone-heading"><h4>الواجبات الحالية</h4><span className="assignment-zone-count">{visible.length}</span></div>
   <div className="assignment-list">{visible.map(item=><article className="assignment-row" key={item.assignmentId}><div className="assignment-row-main"><div className="assignment-row-title-line"><strong>{item.title}</strong><span className={"assignment-status "+item.status}>{item.status==="published"?"منشور":item.status==="archived"?"مؤرشف":"مسودة"}</span></div><span>{item.className}{item.className?" · ":""}{item.questionCount} سؤال · {item.totalMarks} علامة · {item.maxAttempts||1} محاولة</span><small>التسليم: {fmt(item.dueAt)}</small></div><div className="assignment-row-actions"><button onClick={()=>void loadResults(item)}>📊 سجل العلامات</button>{item.status!=="published"?<button onClick={()=>action(item,{action:"setStatus",status:"published"})}>نشر</button>:<button onClick={()=>action(item,{action:"setStatus",status:"draft"})}>إيقاف النشر</button>}<select value={item.maxAttempts||1} onChange={e=>action(item,{action:"setMaxAttempts",maxAttempts:Number(e.target.value)})}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} محاولات</option>)}</select><button className="assignment-delete-button" onClick={()=>remove(item)}>حذف</button></div></article>)}
   {!visible.length&&<div className="platform-empty">لا توجد واجبات بعد.</div>}
   </div>
  </section>

  {/* Zone 3: Gradebook — visually separated section, opens only when a "سجل العلامات" is selected */}
  {resultsFor&&<section className="assignment-zone assignment-gradebook-zone"><div className="assignments-heading"><div><span className="platform-eyebrow">Gradebook</span><h3>سجل علامات: {resultsFor.title}</h3></div><button onClick={()=>{setResultsFor(null);setResults([]);setStats(null)}}>إغلاق</button></div>{stats&&<div className="gradebook-stats"><article><strong>{stats.submitted}/{stats.students}</strong><span>سلّموا</span></article><article><strong>{stats.average===null?"—":stats.average+"%"}</strong><span>المعدل</span></article><article><strong>{stats.highest===null?"—":stats.highest+"%"}</strong><span>الأعلى</span></article><article><strong>{stats.lowest===null?"—":stats.lowest+"%"}</strong><span>الأدنى</span></article><article className={stats.pendingReview?"warn":""}><strong>{stats.pendingReview}</strong><span>بانتظار التصحيح</span></article></div>}<div className="students-table-wrap"><table className="students-table"><thead><tr><th>الطالب</th><th>المحاولات</th><th>آخر علامة</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{results.map(s=><tr key={s.studentId}><td><strong>{s.studentName}</strong><small className="result-code">{s.studentCode}</small></td><td>{s.attemptsUsed}/{s.allowedAttempts}</td><td>{s.latestResult?s.latestResult.score+"/"+s.latestResult.totalMarks+" ("+s.latestResult.percentage+"%)":"لم يسلّم"}</td><td>{s.latestResult?<span className={"review-state "+(s.latestResult.finalized?"final":"pending")}>{s.latestResult.finalized?"نهائي":"مراجعة "+s.latestResult.manualReviewMarks+" ع."}</span>:"—"}</td><td><div className="gradebook-actions">{s.latestResult&&<button className="review-button" onClick={()=>setReview({studentId:s.studentId,attemptNumber:s.latestResult!.attemptNumber})}>✏️ تصحيح / تفاصيل</button>}<button onClick={()=>retry(s)} disabled={!s.attemptsUsed}>+ محاولة</button></div></td></tr>)}</tbody></table></div></section>}
  {review&&resultsFor&&<AssignmentReview token={token} assignmentId={resultsFor.assignmentId} studentId={review.studentId} initialAttempt={review.attemptNumber} onClose={()=>setReview(null)} onSaved={()=>void loadResults(resultsFor)}/>}
 </section>;
}
