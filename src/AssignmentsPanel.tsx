
import {useEffect,useMemo,useState} from "react";
type Classroom={classId:string;name:string;grade:string;active:boolean};
type Item={assignmentId:string;classId:string;className:string;title:string;instructions:string;status:"draft"|"published"|"archived";openAt:string;dueAt:string;sourceExamId:string;sourceExamTitle:string;questionCount:number;totalMarks:number;createdAt:string;updatedAt:string};
type Exam={examId?:string;title?:string;totalMarks?:number;questions?:unknown[]};
type Props={token:string;classes:Classroom[];currentExam:unknown|null};
const localDate=(hours:number)=>{const d=new Date(Date.now()+hours*3600000);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const fmt=(v:string)=>v?new Date(v).toLocaleString("ar"):"بدون موعد";
export default function AssignmentsPanel({token,classes,currentExam}:Props){
 const exam=currentExam&&typeof currentExam==="object"?currentExam as Exam:null;
 const [items,setItems]=useState<Item[]>([]),[classId,setClassId]=useState(""),[title,setTitle]=useState(""),[instructions,setInstructions]=useState("أجب عن جميع الأسئلة واقرأ التعليمات جيدًا قبل البدء."),[openAt,setOpenAt]=useState(localDate(0)),[dueAt,setDueAt]=useState(localDate(72)),[publish,setPublish]=useState(true),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const active=useMemo(()=>classes.filter(x=>x.active),[classes]);
 useEffect(()=>{if(!classId&&active[0])setClassId(active[0].classId)},[active,classId]);
 useEffect(()=>{if(exam?.title&&!title.trim())setTitle(exam.title)},[exam?.title]);
 async function api<T>(url:string,options:RequestInit={}):Promise<T>{const h=new Headers(options.headers||{});h.set("Content-Type","application/json");h.set("x-builder-token",token);h.set("Authorization","Bearer "+token);const r=await fetch(url,{...options,headers:h}),j=await r.json() as T&{error?:string};if(!r.ok)throw new Error(j.error||"حدث خطأ.");return j}
 async function load(){setLoading(true);setError("");try{const r=await api<{assignments:Item[]}>("/api/assignments");setItems(r.assignments||[])}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل الواجبات.")}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 async function create(){if(busy||!classId||!title.trim()||!exam||!Array.isArray(exam.questions)||!exam.questions.length)return;setBusy(true);setError("");setNotice("");try{const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"create",classId,title:title.trim(),instructions:instructions.trim(),openAt:openAt?new Date(openAt).toISOString():"",dueAt:dueAt?new Date(dueAt).toISOString():"",publish,examSnapshot:currentExam})});setItems(x=>[r.assignment,...x]);setNotice(publish?"✓ تم إنشاء الواجب ونشره للطلاب.":"✓ تم حفظ الواجب كمسودة.")}catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء الواجب.")}finally{setBusy(false)}}
 async function status(item:Item,next:Item["status"]){setBusy(true);setError("");try{const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"setStatus",assignmentId:item.assignmentId,status:next})});setItems(x=>x.map(y=>y.assignmentId===item.assignmentId?r.assignment:y));setNotice(next==="published"?"✓ تم نشر الواجب.":next==="draft"?"✓ تم إيقاف النشر.":"✓ تم أرشفة الواجب.")}catch(e){setError(e instanceof Error?e.message:"تعذر تغيير الحالة.")}finally{setBusy(false)}}
 async function remove(item:Item){if(!window.confirm("حذف الواجب «"+item.title+"»؟"))return;setBusy(true);try{await api("/api/assignments",{method:"POST",body:JSON.stringify({action:"delete",assignmentId:item.assignmentId})});setItems(x=>x.filter(y=>y.assignmentId!==item.assignmentId));setNotice("✓ تم حذف الواجب.")}catch(e){setError(e instanceof Error?e.message:"تعذر حذف الواجب.")}finally{setBusy(false)}}
 const visible=classId?items.filter(x=>x.classId===classId):items;
 return <section className="assignments-panel platform-card">
  <div className="assignments-heading"><div><span className="platform-eyebrow">Assignments · Phase 2.0B</span><h3>الواجبات والاختبارات للطلاب</h3><p>افتح أو أنشئ امتحانًا في باني الامتحان، ثم عد هنا لإرساله إلى صف.</p></div><button onClick={load} disabled={loading}>↻ تحديث</button></div>
  {error&&<div className="platform-error assignment-inline-message">{error}</div>}{notice&&<div className="platform-notice assignment-inline-message">{notice}</div>}
  <div className="assignment-source-card"><div><span>الامتحان الحالي</span><strong>{exam?.title||"لا يوجد امتحان مفتوح"}</strong><small>{Array.isArray(exam?.questions)?exam?.questions?.length+" سؤال":"ارجع إلى باني الامتحان وافتح امتحانًا أولًا"}</small></div><div className="assignment-source-marks">{exam?.totalMarks?exam.totalMarks+" علامة":"—"}</div></div>
  <div className="assignment-create-grid">
   <label>الصف<select value={classId} onChange={e=>setClassId(e.target.value)}><option value="">اختر الصف</option>{active.map(c=><option key={c.classId} value={c.classId}>{c.name}{c.grade?" · "+c.grade:""}</option>)}</select></label>
   <label>عنوان الواجب<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثال: مراجعة IPv4"/></label>
   <label className="assignment-wide-field">تعليمات للطلاب<textarea value={instructions} onChange={e=>setInstructions(e.target.value)}/></label>
   <label>يفتح في<input type="datetime-local" value={openAt} onChange={e=>setOpenAt(e.target.value)}/></label>
   <label>آخر موعد<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
   <label className="assignment-publish-toggle"><input type="checkbox" checked={publish} onChange={e=>setPublish(e.target.checked)}/><span>نشر مباشرة للطلاب</span></label>
   <button className="platform-primary assignment-create-button" onClick={create} disabled={busy||!classId||!title.trim()||!exam||!Array.isArray(exam.questions)||!exam.questions.length}>{busy?"⏳ جارٍ الحفظ...":publish?"📤 إنشاء ونشر الواجب":"💾 حفظ كمسودة"}</button>
  </div>
  <div className="assignments-list-heading"><div><strong>واجبات الصف المحدد</strong><span>{visible.length}</span></div>{loading&&<small>جارٍ التحديث...</small>}</div>
  <div className="assignment-list">{visible.map(item=><article className="assignment-row" key={item.assignmentId}><div className="assignment-row-main"><div className="assignment-title-line"><strong>{item.title}</strong><span className={"assignment-status "+item.status}>{item.status==="published"?"منشور":item.status==="archived"?"مؤرشف":"مسودة"}</span></div><span>{item.questionCount} سؤال · {item.totalMarks} علامة</span><small>الفتح: {fmt(item.openAt)} · التسليم: {fmt(item.dueAt)}</small></div><div className="assignment-row-actions">{item.status!=="published"&&<button onClick={()=>status(item,"published")} disabled={busy}>نشر</button>}{item.status==="published"&&<button onClick={()=>status(item,"draft")} disabled={busy}>إيقاف النشر</button>}{item.status!=="archived"&&<button onClick={()=>status(item,"archived")} disabled={busy}>أرشفة</button>}<button className="assignment-delete-button" onClick={()=>remove(item)} disabled={busy}>حذف</button></div></article>)}{!loading&&!visible.length&&<div className="platform-empty">لا توجد واجبات لهذا الصف بعد.</div>}</div>
 </section>
}
