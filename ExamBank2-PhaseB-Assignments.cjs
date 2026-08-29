const fs=require("fs"),path=require("path"),{execFileSync}=require("child_process");
const root=process.cwd();
const P=(...x)=>path.join(root,...x);
const files={
 app:P("src","App.tsx"),
 teacher:P("src","TeacherPlatform.tsx"),
 student:P("src","StudentPortal.tsx"),
 panel:P("src","AssignmentsPanel.tsx"),
 css:P("src","platform.css"),
 storage:P("api","src","lib","platform-storage.js"),
 manage:P("api","src","functions","manage-assignments.js"),
 detail:P("api","src","functions","student-assignment.js"),
 dash:P("api","src","functions","student-dashboard.js")
};
function die(m){console.error("\nERROR: "+m);process.exit(1)}
function norm(s){return String(s||"").replace(/\r\n/g,"\n").replace(/^\uFEFF/,"")}
function read(f){if(!fs.existsSync(f))die("Missing "+f);return norm(fs.readFileSync(f,"utf8"))}
function write(f,s){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,norm(s),"utf8")}
function bak(f){if(fs.existsSync(f)&&!fs.existsSync(f+".bak-v2-phase-b"))fs.copyFileSync(f,f+".bak-v2-phase-b")}
function rep(s,a,b,n){const i=s.indexOf(a);if(i<0)die("Could not locate: "+n);return s.slice(0,i)+b+s.slice(i+a.length)}
let branch="";try{branch=execFileSync("git",["branch","--show-current"],{cwd:root,encoding:"utf8"}).trim()}catch{die("Cannot read Git branch")}
if(!branch||branch==="main")die("Stay on v2-dev. Phase B will not install on main.");
let app=read(files.app);
if(!app.includes("EXAMBANK_2_PHASE_A"))die("Phase A not detected.");
if(app.includes("EXAMBANK_2_PHASE_B")){console.log("Phase B already installed.");process.exit(0)}
[files.app,files.teacher,files.student,files.css,files.dash].forEach(bak);

write(files.storage,String.raw`
const {BlobServiceClient}=require("@azure/storage-blob");
const CONTAINER="bank";
async function streamToBuffer(stream){const parts=[];for await(const chunk of stream)parts.push(Buffer.from(chunk));return Buffer.concat(parts)}
function getContainer(){const cs=process.env.AZURE_STORAGE_CONNECTION_STRING;if(!cs)throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured.");return BlobServiceClient.fromConnectionString(cs).getContainerClient(CONTAINER)}
async function downloadJsonOrNull(container,name){try{const r=await container.getBlobClient(name).download();if(!r.readableStreamBody)return null;return JSON.parse((await streamToBuffer(r.readableStreamBody)).toString("utf8"))}catch(e){if(e?.statusCode===404||e?.code==="BlobNotFound")return null;throw e}}
async function uploadJson(container,name,value){const body=JSON.stringify(value,null,2);await container.getBlockBlobClient(name).upload(body,Buffer.byteLength(body),{overwrite:true,blobHTTPHeaders:{blobContentType:"application/json; charset=utf-8"}})}
async function listJson(container,prefix){const out=[];for await(const blob of container.listBlobsFlat({prefix})){if(!blob.name.endsWith(".json"))continue;const value=await downloadJsonOrNull(container,blob.name);if(value)out.push(value)}return out}
module.exports={getContainer,downloadJsonOrNull,uploadJson,listJson};
`);

write(files.manage,String.raw`
const {app}=require("@azure/functions");
const crypto=require("crypto");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull,uploadJson,listJson}=require("../lib/platform-storage");
const PREFIX="platform/assignments/",CLASS_PREFIX="platform/classes/";
function iso(v){const s=String(v||"").trim();if(!s)return "";const d=new Date(s);if(Number.isNaN(d.getTime()))throw new Error("صيغة التاريخ غير صحيحة.");return d.toISOString()}
function cleanExam(v){const x=JSON.parse(JSON.stringify(v||{}));if(Array.isArray(x.questions))x.questions=x.questions.map(q=>({...q,history:[],redoStack:[]}));x.revisionHistory=[];return x}
function summary(a){return {assignmentId:a.assignmentId,classId:a.classId,className:a.className,title:a.title,instructions:a.instructions,status:a.status,openAt:a.openAt||"",dueAt:a.dueAt||"",sourceExamId:a.sourceExamId||"",sourceExamTitle:a.sourceExamTitle||"",questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),createdAt:a.createdAt||"",updatedAt:a.updatedAt||""}}
app.http("manageAssignments",{methods:["GET","POST"],authLevel:"anonymous",route:"assignments",handler:async request=>{
 try{
  const auth=requireBuilderAuth(request);if(!auth.ok)return auth.response;
  const c=getContainer();
  if(request.method==="GET"){const u=new URL(request.url),classId=String(u.searchParams.get("classId")||"");let list=(await listJson(c,PREFIX)).map(summary);if(classId)list=list.filter(x=>x.classId===classId);list.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));return {status:200,jsonBody:{ok:true,assignments:list}}}
  let b={};try{b=await request.json()}catch{}
  const action=String(b.action||"create").toLowerCase();
  if(action==="create"){
   const classId=String(b.classId||"").trim(),title=String(b.title||"").trim(),instructions=String(b.instructions||"").trim(),exam=cleanExam(b.examSnapshot);
   if(!classId||!title)return {status:400,jsonBody:{ok:false,error:"الصف وعنوان الواجب مطلوبان."}};
   if(!Array.isArray(exam.questions)||!exam.questions.length)return {status:400,jsonBody:{ok:false,error:"افتح أو أنشئ امتحانًا قبل إنشاء الواجب."}};
   const classroom=await downloadJsonOrNull(c,CLASS_PREFIX+classId+".json");if(!classroom||classroom.active===false)return {status:400,jsonBody:{ok:false,error:"الصف غير موجود أو مؤرشف."}};
   const openAt=iso(b.openAt),dueAt=iso(b.dueAt);if(openAt&&dueAt&&new Date(dueAt)<new Date(openAt))return {status:400,jsonBody:{ok:false,error:"موعد التسليم يجب أن يكون بعد موعد الفتح."}};
   const now=new Date().toISOString(),assignmentId=crypto.randomUUID();
   const a={schemaVersion:1,assignmentId,classId,className:String(classroom.name||""),title,instructions,status:b.publish===true?"published":"draft",openAt,dueAt,sourceExamId:String(exam.examId||""),sourceExamTitle:String(exam.title||title),questionCount:exam.questions.length,totalMarks:Number(exam.totalMarks||exam.questions.reduce((s,q)=>s+Number(q.marks||0),0)),examSnapshot:exam,createdBy:String(auth.user?.sub||"teacher"),createdAt:now,updatedAt:now};
   await uploadJson(c,PREFIX+assignmentId+".json",a);return {status:200,jsonBody:{ok:true,assignment:summary(a)}};
  }
  if(action==="setstatus"){
   const id=String(b.assignmentId||""),status=String(b.status||"").toLowerCase();if(!id||!["draft","published","archived"].includes(status))return {status:400,jsonBody:{ok:false,error:"حالة الواجب غير صحيحة."}};
   const name=PREFIX+id+".json",a=await downloadJsonOrNull(c,name);if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
   a.status=status;a.updatedAt=new Date().toISOString();await uploadJson(c,name,a);return {status:200,jsonBody:{ok:true,assignment:summary(a)}};
  }
  if(action==="delete"){const id=String(b.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};await c.getBlobClient(PREFIX+id+".json").deleteIfExists();return {status:200,jsonBody:{ok:true,deleted:true}}}
  return {status:400,jsonBody:{ok:false,error:"Unsupported assignment action."}};
 }catch(e){return {status:500,jsonBody:{ok:false,error:e instanceof Error?e.message:"Assignment action failed."}}}
}});
`);

write(files.detail,String.raw`
const {app}=require("@azure/functions");
const {requireStudentAuth}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull}=require("../lib/platform-storage");
const PREFIX="platform/assignments/";
function studentExam(v){const x=JSON.parse(JSON.stringify(v||{}));x.revisionHistory=[];if(Array.isArray(x.questions))x.questions=x.questions.map(q=>({...q,answer:{},hint:"",teacherNote:"",aiInstruction:"",history:[],redoStack:[]}));return x}
app.http("studentAssignment",{methods:["GET"],authLevel:"anonymous",route:"student-assignment/{assignmentId}",handler:async(request,context)=>{
 try{
  const auth=requireStudentAuth(request);if(!auth.ok)return auth.response;
  const id=String(context.params.assignmentId||"");const c=getContainer();
  const student=await downloadJsonOrNull(c,"platform/users/"+auth.user.sub+".json");if(!student||student.active===false)return {status:401,jsonBody:{ok:false,error:"الحساب غير فعّال."}};
  const a=await downloadJsonOrNull(c,PREFIX+id+".json");if(!a||a.status!=="published"||String(a.classId)!==String(student.classId))return {status:404,jsonBody:{ok:false,error:"الواجب غير متاح لهذا الحساب."}};
  if(a.openAt&&new Date(a.openAt).getTime()>Date.now())return {status:403,jsonBody:{ok:false,error:"الواجب لم يُفتح بعد."}};
  return {status:200,jsonBody:{ok:true,assignment:{assignmentId:a.assignmentId,title:a.title,instructions:a.instructions,openAt:a.openAt||"",dueAt:a.dueAt||"",sourceExamTitle:a.sourceExamTitle||"",questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),exam:studentExam(a.examSnapshot)}}};
 }catch(e){return {status:500,jsonBody:{ok:false,error:e instanceof Error?e.message:"Unable to open assignment."}}}
}});
`);

write(files.dash,String.raw`
const {app}=require("@azure/functions");
const {requireStudentAuth}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull,listJson}=require("../lib/platform-storage");
const PREFIX="platform/assignments/";
function availability(a){const now=Date.now(),o=a.openAt?new Date(a.openAt).getTime():0,d=a.dueAt?new Date(a.dueAt).getTime():0;if(o&&o>now)return "scheduled";if(d&&d<now)return "closed";return "open"}
app.http("studentDashboard",{methods:["GET"],authLevel:"anonymous",route:"student-dashboard",handler:async request=>{
 try{
  const auth=requireStudentAuth(request);if(!auth.ok)return auth.response;
  const c=getContainer(),student=await downloadJsonOrNull(c,"platform/users/"+auth.user.sub+".json");if(!student||student.active===false)return {status:401,jsonBody:{ok:false,error:"الحساب غير فعّال."}};
  const classroom=student.classId?await downloadJsonOrNull(c,"platform/classes/"+student.classId+".json"):null;
  const raw=await listJson(c,PREFIX);
  const assignments=raw.filter(a=>a.status==="published"&&String(a.classId||"")===String(student.classId||"")).map(a=>({assignmentId:String(a.assignmentId||""),title:String(a.title||""),instructions:String(a.instructions||""),openAt:String(a.openAt||""),dueAt:String(a.dueAt||""),sourceExamTitle:String(a.sourceExamTitle||""),questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),availability:availability(a),createdAt:String(a.createdAt||"")})).sort((a,b)=>{const x=a.dueAt?new Date(a.dueAt).getTime():Number.MAX_SAFE_INTEGER,y=b.dueAt?new Date(b.dueAt).getTime():Number.MAX_SAFE_INTEGER;return x-y});
  return {status:200,jsonBody:{ok:true,student:{userId:student.userId,code:student.code,displayName:student.displayName,classId:student.classId},classroom:classroom?{classId:classroom.classId,name:classroom.name,grade:classroom.grade,schoolYear:classroom.schoolYear}:null,assignments,stats:{assigned:assignments.length,completed:0,average:null},phase:"2.0B"}};
 }catch(e){return {status:500,jsonBody:{ok:false,error:e instanceof Error?e.message:"Student dashboard failed."}}}
}});
`);

write(files.panel,String.raw`
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
`);

let teacher=read(files.teacher);
teacher=rep(teacher,`import {
  useEffect,
  useMemo,
  useState
} from "react";

type TeacherPlatformProps = {
  token: string;
};
`,`import {
  useEffect,
  useMemo,
  useState
} from "react";

import AssignmentsPanel from "./AssignmentsPanel";

type TeacherPlatformProps = {
  token: string;
  currentExam: unknown | null;
};
`,"TeacherPlatform imports");
teacher=rep(teacher,`function TeacherPlatform({
  token
}: TeacherPlatformProps) {
`,`function TeacherPlatform({
  token,
  currentExam
}: TeacherPlatformProps) {
`,"TeacherPlatform props");
teacher=rep(teacher,`        </div>
      </div>
    </section>
  );
}

export default TeacherPlatform;
`,`        </div>

        <AssignmentsPanel
          token={token}
          classes={classes}
          currentExam={currentExam}
        />
      </div>
    </section>
  );
}

export default TeacherPlatform;
`,"TeacherPlatform end");
write(files.teacher,teacher);

app=read(files.app);
app=rep(app,"// EXAMBANK_2_PHASE_A\n","// EXAMBANK_2_PHASE_A\n// EXAMBANK_2_PHASE_B\n","Phase B marker");
app=rep(app,`        <TeacherPlatform
          token={token}
        />
`,`        <TeacherPlatform
          token={token}
          currentExam={exam}
        />
`,"App TeacherPlatform prop");
write(files.app,app);

write(files.student,String.raw`
import {useEffect,useState} from "react";
type Props={token:string;displayName:string;onLogout:()=>void};
type Summary={assignmentId:string;title:string;instructions:string;openAt:string;dueAt:string;sourceExamTitle:string;questionCount:number;totalMarks:number;availability:"scheduled"|"open"|"closed";createdAt:string};
type Question={examQuestionId:string;text:string;marks:number;options?:Array<{text?:string;value?:string;label?:string}>;fields?:Array<{id?:string;label?:string}>;wordBank?:string[];image?:{exists?:boolean;visible?:boolean;assets?:Array<{dataUrl?:string}>}};
type Detail={assignmentId:string;title:string;instructions:string;openAt:string;dueAt:string;questionCount:number;totalMarks:number;exam:{title?:string;questions?:Question[]}};
type Dashboard={student:{userId:string;code:string;displayName:string;classId:string};classroom:{classId:string;name:string;grade:string;schoolYear:string}|null;assignments:Summary[];stats:{assigned:number;completed:number;average:number|null}};
const fmt=(v:string)=>v?new Date(v).toLocaleString("ar"):"بدون موعد";
const label=(v:Summary["availability"])=>v==="scheduled"?"قريبًا":v==="closed"?"انتهى الموعد":"متاح الآن";
export default function StudentPortal({token,displayName,onLogout}:Props){
 const [data,setData]=useState<Dashboard|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[detail,setDetail]=useState<Detail|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{let cancel=false;(async()=>{setLoading(true);setError("");try{const r=await fetch("/api/student-dashboard",{headers:{"x-student-token":token,Authorization:"Bearer "+token}}),j=await r.json() as {error?:string;student?:Dashboard["student"];classroom?:Dashboard["classroom"];assignments?:Summary[];stats?:Dashboard["stats"]};if(r.status===401){onLogout();return}if(!r.ok||!j.student||!j.stats)throw new Error(j.error||"تعذر تحميل صفحة الطالب.");if(!cancel)setData({student:j.student,classroom:j.classroom||null,assignments:j.assignments||[],stats:j.stats})}catch(e){if(!cancel)setError(e instanceof Error?e.message:"تعذر تحميل الصفحة.")}finally{if(!cancel)setLoading(false)}})();return()=>{cancel=true}},[token,onLogout]);
 async function open(item:Summary){if(item.availability==="scheduled")return;setBusy(true);setError("");try{const r=await fetch("/api/student-assignment/"+encodeURIComponent(item.assignmentId),{headers:{"x-student-token":token,Authorization:"Bearer "+token}}),j=await r.json() as {error?:string;assignment?:Detail};if(r.status===401){onLogout();return}if(!r.ok||!j.assignment)throw new Error(j.error||"تعذر فتح الواجب.");setDetail(j.assignment);window.scrollTo({top:0,behavior:"smooth"})}catch(e){setError(e instanceof Error?e.message:"تعذر فتح الواجب.")}finally{setBusy(false)}}
 if(detail){const qs=detail.exam.questions||[];return <main className="student-portal" dir="rtl"><header className="student-topbar"><div className="student-brand"><span className="student-logo">EB</span><div><h1>{detail.title}</h1><p>ExamBank 2.0 · واجب الطالب</p></div></div><div className="student-assignment-top-actions"><button className="student-logout" onClick={()=>setDetail(null)}>العودة للمهام</button><button className="student-logout" onClick={onLogout}>تسجيل الخروج</button></div></header><section className="student-shell">{error&&<div className="platform-error">{error}</div>}<section className="student-assignment-header"><div><span className="platform-eyebrow">Assignment</span><h2>{detail.title}</h2><p>{detail.instructions}</p></div><div className="student-assignment-summary"><strong>{detail.questionCount}</strong><span>سؤال</span><strong>{detail.totalMarks}</strong><span>علامة</span></div></section><div className="phase-c-notice"><strong>✓ الواجب وصل إلى حسابك</strong><span>حاليًا تستطيع معاينة الأسئلة. في Phase 2.0C سنفعّل الإجابة، الحفظ التلقائي، التسليم والتصحيح.</span></div><section className="student-question-list">{qs.map((q,i)=><article className="student-question-card" key={q.examQuestionId||String(i)}><div className="student-question-heading"><strong>السؤال {i+1}</strong><span>{q.marks||0} علامة</span></div><div className="student-question-text">{q.text}</div>{q.wordBank&&q.wordBank.length>0&&<div className="student-word-bank">{q.wordBank.map((w,n)=><span key={w+"-"+n}>{w}</span>)}</div>}{q.options&&q.options.length>0&&<ol className="student-question-options">{q.options.map((o,n)=><li key={n}>{o.text||o.label||o.value||""}</li>)}</ol>}{q.fields&&q.fields.length>0&&<div className="student-field-list">{q.fields.map((f,n)=><div key={f.id||String(n)}><span>{f.label||"إجابة"}</span><div className="student-answer-line"/></div>)}</div>}{q.image?.exists&&q.image.visible&&q.image.assets?.map((a,n)=>a.dataUrl?<img className="student-question-image" key={n} src={a.dataUrl} alt={"صورة السؤال "+(i+1)}/>:null)}</article>)}</section></section></main>}
 return <main className="student-portal" dir="rtl"><header className="student-topbar"><div className="student-brand"><span className="student-logo">EB</span><div><h1>ExamBank 2.0</h1><p>بوابة الطالب للتدريب والواجبات</p></div></div><button className="student-logout" onClick={onLogout}>تسجيل الخروج</button></header><section className="student-shell">{loading&&<div className="platform-loading">⏳ جارٍ تحميل حسابك...</div>}{busy&&<div className="platform-loading">⏳ جارٍ فتح الواجب...</div>}{error&&<div className="platform-error">{error}</div>}{!loading&&data&&<><section className="student-welcome-card"><div><span className="platform-eyebrow">Student Portal</span><h2>مرحبًا {data.student.displayName||displayName}</h2><p>{data.classroom?data.classroom.name+(data.classroom.grade?" · "+data.classroom.grade:""):"لم يتم ربط حسابك بصف بعد."}</p></div><div className="student-code-chip">الكود: <strong>{data.student.code}</strong></div></section><section className="student-stat-grid"><article><strong>{data.stats.assigned}</strong><span>مهام</span></article><article><strong>{data.stats.completed}</strong><span>مكتملة</span></article><article><strong>{data.stats.average===null?"—":data.stats.average+"%"}</strong><span>المعدل</span></article></section><section className="student-main-grid"><article className="student-panel"><div className="student-panel-heading"><div><span className="platform-eyebrow">Assignments</span><h3>المهام والواجبات</h3></div><span className="phase-chip">Phase 2.0B</span></div><div className="student-assignment-list">{data.assignments.map(item=><article className={"student-assignment-card "+item.availability} key={item.assignmentId}><div className="student-assignment-card-main"><div className="student-assignment-card-title"><strong>{item.title}</strong><span>{label(item.availability)}</span></div><p>{item.instructions}</p><small>{item.questionCount} سؤال · {item.totalMarks} علامة</small><small>الفتح: {fmt(item.openAt)}</small><small>التسليم: {fmt(item.dueAt)}</small></div><button onClick={()=>open(item)} disabled={busy||item.availability==="scheduled"}>{item.availability==="scheduled"?"لم يفتح بعد":item.availability==="closed"?"عرض الواجب":"فتح الواجب"}</button></article>)}{!data.assignments.length&&<div className="student-empty-state"><span>📝</span><strong>لا توجد مهام منشورة الآن</strong><p>عندما يرسل المعلم واجبًا إلى صفك سيظهر هنا تلقائيًا.</p></div>}</div></article><article className="student-panel student-next-panel"><span className="platform-eyebrow">Coming Next</span><h3>Phase 2.0C</h3><ul><li>كتابة الإجابات داخل الموقع</li><li>حفظ تلقائي أثناء الحل</li><li>تسليم الواجب</li><li>تصحيح تلقائي ونتيجة</li></ul></article></section></>}</section></main>
}
`);

let css=read(files.css);
if(!css.includes("EXAMBANK_2_PHASE_B_STYLES"))css+=String.raw`
/* EXAMBANK_2_PHASE_B_STYLES */
.assignments-panel{margin-top:18px}.assignments-heading,.assignments-list-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}.assignments-heading h3{margin:4px 0 5px}.assignments-heading p{margin:0;color:#64748b;font-size:12px}.assignments-heading>button{border:1px solid #cbd5e1;background:white;border-radius:9px;padding:8px 11px;cursor:pointer}.assignment-inline-message{margin:12px 0 0;width:100%}.assignment-source-card{margin-top:15px;border-radius:15px;border:1px solid #bfdbfe;background:#eff6ff;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px}.assignment-source-card>div:first-child{display:flex;flex-direction:column;gap:4px}.assignment-source-card span,.assignment-source-card small{color:#64748b}.assignment-source-marks{background:#1d4ed8;color:white;border-radius:999px;padding:8px 12px;white-space:nowrap;font-weight:900}.assignment-create-grid{margin-top:13px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:15px;padding:14px}.assignment-create-grid label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:800;color:#475569}.assignment-create-grid input,.assignment-create-grid select,.assignment-create-grid textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font:inherit;background:white}.assignment-create-grid textarea{min-height:78px;resize:vertical}.assignment-wide-field{grid-column:1/-1}.assignment-publish-toggle{flex-direction:row!important;align-items:center;border:1px solid #dbeafe;background:white;border-radius:11px;padding:10px}.assignment-publish-toggle input{width:auto}.assignment-create-button{align-self:end}.assignments-list-heading{margin-top:18px;padding-bottom:9px;border-bottom:1px solid #e2e8f0}.assignments-list-heading>div{display:flex;align-items:center;gap:8px}.assignments-list-heading span{min-width:25px;height:25px;border-radius:999px;background:#eff6ff;color:#1d4ed8;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:11px}.assignment-list{display:flex;flex-direction:column;gap:9px;margin-top:10px}.assignment-row{border:1px solid #e2e8f0;border-radius:14px;padding:12px;background:white;display:flex;align-items:center;justify-content:space-between;gap:13px}.assignment-row-main{display:flex;flex-direction:column;gap:4px}.assignment-title-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.assignment-row-main>span,.assignment-row-main>small{color:#64748b}.assignment-status{border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900}.assignment-status.published{background:#dcfce7;color:#166534}.assignment-status.draft{background:#fef3c7;color:#92400e}.assignment-status.archived{background:#e2e8f0;color:#475569}.assignment-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.assignment-row-actions button{border:1px solid #cbd5e1;background:white;border-radius:8px;padding:7px 9px;cursor:pointer}.assignment-delete-button{color:#b91c1c;border-color:#fecaca!important}.student-assignment-list{display:flex;flex-direction:column;gap:10px}.student-assignment-card{border:1px solid #dbeafe;border-radius:15px;background:white;padding:13px;display:flex;align-items:center;justify-content:space-between;gap:12px}.student-assignment-card.scheduled{opacity:.72}.student-assignment-card.closed{border-color:#e2e8f0;background:#f8fafc}.student-assignment-card-main{display:flex;flex-direction:column;gap:4px}.student-assignment-card-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.student-assignment-card-title span{border-radius:999px;padding:4px 8px;background:#eff6ff;color:#1d4ed8;font-size:10px;font-weight:900}.student-assignment-card p{margin:3px 0;color:#475569;line-height:1.6}.student-assignment-card small{color:#64748b}.student-assignment-card>button{border:0;border-radius:10px;background:#2563eb;color:white;padding:10px 13px;font-weight:900;cursor:pointer;white-space:nowrap}.student-assignment-card>button:disabled{background:#cbd5e1;cursor:not-allowed}.student-assignment-top-actions{display:flex;gap:8px;flex-wrap:wrap}.student-assignment-header{border-radius:20px;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:white;padding:22px;display:flex;align-items:center;justify-content:space-between;gap:18px}.student-assignment-header h2{margin:5px 0}.student-assignment-header p{margin:0;color:#dbeafe;line-height:1.7}.student-assignment-summary{min-width:135px;border-radius:15px;background:rgba(255,255,255,.12);padding:13px;display:grid;grid-template-columns:auto auto;gap:5px 8px;align-items:center}.student-assignment-summary strong{font-size:20px}.student-assignment-summary span{font-size:11px;color:#dbeafe}.phase-c-notice{margin-top:12px;border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:13px;padding:12px 14px;display:flex;flex-direction:column;gap:4px}.phase-c-notice span{line-height:1.7;font-size:12px}.student-question-list{display:flex;flex-direction:column;gap:12px;margin-top:14px}.student-question-card{border:1px solid #e2e8f0;border-radius:17px;background:white;padding:17px;box-shadow:0 8px 24px rgba(15,23,42,.04)}.student-question-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:9px;border-bottom:1px solid #e2e8f0}.student-question-heading span{border-radius:999px;background:#eff6ff;color:#1d4ed8;padding:5px 8px;font-size:10px;font-weight:900}.student-question-text{margin-top:14px;font-weight:800;line-height:1.8}.student-question-options{margin:12px 0 0;padding-right:25px;line-height:2}.student-word-bank{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px;border:1px dashed #bfdbfe;background:#f8fbff;border-radius:12px;padding:10px}.student-word-bank span{border:1px solid #dbeafe;background:white;border-radius:999px;padding:5px 9px;font-size:11px}.student-field-list{margin-top:12px;display:flex;flex-direction:column;gap:10px}.student-field-list>div{display:grid;grid-template-columns:150px 1fr;align-items:end;gap:10px}.student-answer-line{height:26px;border-bottom:1px solid #94a3b8}.student-question-image{display:block;max-width:min(720px,100%);max-height:420px;object-fit:contain;margin:14px auto 0;border-radius:12px;border:1px solid #e2e8f0}@media(max-width:760px){.assignment-create-grid{grid-template-columns:1fr}.assignment-wide-field{grid-column:auto}.assignment-row,.student-assignment-card,.student-assignment-header{align-items:stretch;flex-direction:column}.assignment-row-actions{justify-content:stretch}.assignment-row-actions button{flex:1}.student-assignment-card>button{width:100%}.student-field-list>div{grid-template-columns:1fr}}
`;
write(files.css,css);

console.log("\nChecking backend syntax...");
[files.storage,files.manage,files.detail,files.dash].forEach(f=>execFileSync(process.execPath,["--check",f],{cwd:root,stdio:"inherit"}));
console.log("\nRunning npm run build...");
try{execFileSync("cmd.exe",["/d","/s","/c","npm run build"],{cwd:root,stdio:"inherit"})}catch{die("BUILD FAILED. Do not commit. Send the first build error.")}
console.log("\nEXAMBANK 2.0 PHASE B PASSED.");
console.log("\nNext:");
console.log("git status");
console.log('git add src/App.tsx src/TeacherPlatform.tsx src/StudentPortal.tsx src/AssignmentsPanel.tsx src/platform.css api/src/lib/platform-storage.js api/src/functions/manage-assignments.js api/src/functions/student-assignment.js api/src/functions/student-dashboard.js');
console.log('git commit -m "Add ExamBank 2 assignments"');
console.log("git push");
