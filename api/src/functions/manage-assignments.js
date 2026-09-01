
const {app}=require("@azure/functions"),crypto=require("crypto");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull,uploadJson,listJson,mutateJsonWithRetry,StorageConflictError}=require("../lib/platform-storage");
const {recordAuditEvent}=require("../lib/audit-log");
const PREFIX="platform/assignments/",CLASS_PREFIX="platform/classes/";
const CONFLICT_MESSAGE="حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const iso=v=>{const s=String(v||"").trim();if(!s)return "";const d=new Date(s);if(Number.isNaN(d.getTime()))throw new Error("صيغة التاريخ غير صحيحة.");return d.toISOString()};
function cleanExam(v){const x=JSON.parse(JSON.stringify(v||{}));if(Array.isArray(x.questions))x.questions=x.questions.map(q=>({...q,history:[],redoStack:[]}));x.revisionHistory=[];return x}
function summary(a){return {assignmentId:a.assignmentId,classId:a.classId,className:a.className,title:a.title,instructions:a.instructions,status:a.status,openAt:a.openAt||"",dueAt:a.dueAt||"",sourceExamId:a.sourceExamId||"",sourceExamTitle:a.sourceExamTitle||"",questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),maxAttempts:Math.max(1,Number(a.maxAttempts||1)),createdAt:a.createdAt||"",updatedAt:a.updatedAt||""}}
app.http("manageAssignments",{methods:["GET","POST"],authLevel:"anonymous",route:"assignments",handler:async request=>{
 try{
  const auth=requireBuilderAuth(request);if(!auth.ok)return auth.response;const c=getContainer();
  if(request.method==="GET"){const u=new URL(request.url),classId=String(u.searchParams.get("classId")||"");let list=(await listJson(c,PREFIX)).map(summary);if(classId)list=list.filter(x=>x.classId===classId);list.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));return {status:200,jsonBody:{ok:true,assignments:list}}}
  let b={};try{b=await request.json()}catch{}
  const action=String(b.action||"create").toLowerCase();
  if(action==="create"){
   const classId=String(b.classId||"").trim(),title=String(b.title||"").trim(),instructions=String(b.instructions||"").trim(),exam=cleanExam(b.examSnapshot);
   if(!classId||!title)return {status:400,jsonBody:{ok:false,error:"الصف وعنوان الواجب مطلوبان."}};
   if(!Array.isArray(exam.questions)||!exam.questions.length)return {status:400,jsonBody:{ok:false,error:"افتح أو أنشئ امتحانًا قبل إنشاء الواجب."}};
   const classroom=await downloadJsonOrNull(c,CLASS_PREFIX+classId+".json");if(!classroom||classroom.active===false)return {status:400,jsonBody:{ok:false,error:"الصف غير موجود أو مؤرشف."}};
   const openAt=iso(b.openAt),dueAt=iso(b.dueAt);if(openAt&&dueAt&&new Date(dueAt)<new Date(openAt))return {status:400,jsonBody:{ok:false,error:"موعد التسليم يجب أن يكون بعد موعد الفتح."}};
   const now=new Date().toISOString(),assignmentId=crypto.randomUUID(),maxAttempts=Math.min(10,Math.max(1,Number(b.maxAttempts||1)));
   const a={schemaVersion:2,assignmentId,classId,className:String(classroom.name||""),title,instructions,status:b.publish===true?"published":"draft",openAt,dueAt,maxAttempts,sourceExamId:String(exam.examId||""),sourceExamTitle:String(exam.title||title),questionCount:exam.questions.length,totalMarks:Number(exam.totalMarks||exam.questions.reduce((s,q)=>s+Number(q.marks||0),0)),examSnapshot:exam,createdBy:String(auth.user?.sub||"teacher"),createdAt:now,updatedAt:now};
   await uploadJson(c,PREFIX+assignmentId+".json",a);return {status:200,jsonBody:{ok:true,assignment:summary(a)}};
  }
  if(action==="setstatus"||action==="setmaxattempts"){
   const id=String(b.assignmentId||""),name=PREFIX+id+".json";
   let nextStatus=null,nextMaxAttempts=null;
   if(action==="setstatus"){
    nextStatus=String(b.status||"").toLowerCase();
    if(!["draft","published","archived"].includes(nextStatus))return {status:400,jsonBody:{ok:false,error:"حالة الواجب غير صحيحة."}};
   }else{
    nextMaxAttempts=Math.min(10,Math.max(1,Number(b.maxAttempts||1)));
   }
   let updated=null;
   try{
    updated=await mutateJsonWithRetry(c,name,current=>{
     if(!current){const err=new Error("الواجب غير موجود.");err.httpStatus=404;throw err}
     if(action==="setstatus")current.status=nextStatus;else current.maxAttempts=nextMaxAttempts;
     current.updatedAt=new Date().toISOString();
     return current;
    });
   }catch(e){
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
    throw e;
   }
   return {status:200,jsonBody:{ok:true,assignment:summary(updated)}};
  }
  if(action==="delete"){const id=String(b.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};const existing=await downloadJsonOrNull(c,PREFIX+id+".json");await c.getBlobClient(PREFIX+id+".json").deleteIfExists();await recordAuditEvent(c,{actor:auth.user?.sub,action:"assignment.delete",targetType:"assignment",targetId:id,targetLabel:existing?.title||""});return {status:200,jsonBody:{ok:true,deleted:true}}}
  return {status:400,jsonBody:{ok:false,error:"Unsupported assignment action."}};
 }catch{return {status:500,jsonBody:{ok:false,error:"تعذر تنفيذ إجراء الواجب حاليًا."}}}
}});
