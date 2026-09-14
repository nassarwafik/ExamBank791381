
const {app}=require("@azure/functions"),crypto=require("crypto");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull,uploadJson,listJson,listBlobNames,deleteBlob,mutateJsonWithRetry,StorageConflictError}=require("../lib/platform-storage");
const {recordAuditEvent}=require("../lib/audit-log");
const {examOfficialStats}=require("../lib/exam-structure");
const {normalizeAssignmentStatus,applyAssignmentArchive,applyAssignmentRestore}=require("../lib/assignment-lifecycle");
const {activeAttemptOf}=require("../lib/assignment-availability");
const PREFIX="platform/assignments/",CLASS_PREFIX="platform/classes/",SUB_PREFIX="platform/submissions/";
const CONFLICT_MESSAGE="حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
// Read-only impact of deleting/archiving an assignment (Roadmap #7). submissionDocuments is the count of
// stored submission blobs (authoritative for purge-blocking); the rest are derived from the parsed docs.
function computeImpact(a,submissionDocuments,subs){
 let completedAttempts=0,studentsWithCompletedAttempts=0,activeAttempts=0,draftDocuments=0;
 for(const s of (Array.isArray(subs)?subs:[])){
  const attempts=Array.isArray(s&&s.attempts)?s.attempts:[];
  completedAttempts+=attempts.length;if(attempts.length>0)studentsWithCompletedAttempts++;
  if(activeAttemptOf(s))activeAttempts++;
  const da=s&&s.draftAnswers&&typeof s.draftAnswers==="object"?s.draftAnswers:{};
  if((s&&s.draftSavedAt)||Object.keys(da).length>0)draftDocuments++;
 }
 const status=normalizeAssignmentStatus(a);
 return {assignmentId:a.assignmentId,status,submissionDocuments,studentsWithCompletedAttempts,completedAttempts,activeAttempts,draftDocuments,canPurge:status==="archived"&&submissionDocuments===0};
}
const iso=v=>{const s=String(v||"").trim();if(!s)return "";const d=new Date(s);if(Number.isNaN(d.getTime()))throw new Error("صيغة التاريخ غير صحيحة.");return d.toISOString()};
function cleanExam(v){const x=JSON.parse(JSON.stringify(v||{}));if(Array.isArray(x.questions))x.questions=x.questions.map(q=>({...q,history:[],redoStack:[]}));x.revisionHistory=[];return x}
// Validate the optional per-attempt duration. null / undefined / "" / 0 => untimed (0). A positive
// INTEGER 1..1440 => timed. Anything else (negative, fractional, NaN, >1440) is a teacher error and is
// REJECTED (never silently clamped). Returns { ok, value } | { ok:false }.
function parseDurationMinutes(v){
 if(v===undefined||v===null||v==="")return {ok:true,value:0};
 const n=Number(v);
 if(!Number.isFinite(n)||!Number.isInteger(n))return {ok:false};
 if(n===0)return {ok:true,value:0};
 if(n<1||n>1440)return {ok:false};
 return {ok:true,value:n};
}
function summary(a){return {assignmentId:a.assignmentId,classId:a.classId,className:a.className,title:a.title,instructions:a.instructions,status:a.status,openAt:a.openAt||"",dueAt:a.dueAt||"",sourceExamId:a.sourceExamId||"",sourceExamTitle:a.sourceExamTitle||"",questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),maxAttempts:Math.max(1,Number(a.maxAttempts||1)),durationMinutes:Number(a.durationMinutes||0),attemptModelVersion:Number(a.attemptModelVersion||0),archivedAt:String(a.archivedAt||""),archivedBy:String(a.archivedBy||""),archivedFromStatus:String(a.archivedFromStatus||""),archiveReason:String(a.archiveReason||""),createdAt:a.createdAt||"",updatedAt:a.updatedAt||""}}
// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the
// real implementations are used). It does not change runtime behavior.
async function handler(request,deps={}){
 const authFn=deps.requireBuilderAuth||requireBuilderAuth,getC=deps.getContainer||getContainer,dl=deps.downloadJsonOrNull||downloadJsonOrNull,up=deps.uploadJson||uploadJson,ls=deps.listJson||listJson,lbn=deps.listBlobNames||listBlobNames,db=deps.deleteBlob||deleteBlob,mut=deps.mutateJsonWithRetry||mutateJsonWithRetry,rec=deps.recordAuditEvent||recordAuditEvent;
 try{
  const auth=authFn(request);if(!auth.ok)return auth.response;const c=getC();
  if(request.method==="GET"){const u=new URL(request.url),classId=String(u.searchParams.get("classId")||"");let list=(await ls(c,PREFIX)).map(summary);if(classId)list=list.filter(x=>x.classId===classId);list.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));return {status:200,jsonBody:{ok:true,assignments:list}}}
  let b={};try{b=await request.json()}catch{}
  const action=String(b.action||"create").toLowerCase();
  if(action==="create"){
   const classId=String(b.classId||"").trim(),title=String(b.title||"").trim(),instructions=String(b.instructions||"").trim(),exam=cleanExam(b.examSnapshot);
   if(!classId||!title)return {status:400,jsonBody:{ok:false,error:"الصف وعنوان الواجب مطلوبان."}};
   // AUTHORITATIVE structural stats — the CURRENT exam structure is the single source of truth for
   // questionCount and totalMarks. A stale/imported top-level exam.totalMarks can NEVER override it
   // (see examOfficialStats). The values match gradeExam() so the assignment total, the grader total
   // and the cover total agree.
   const stats=examOfficialStats(exam);
   if(!stats.questionCount)return {status:400,jsonBody:{ok:false,error:"افتح أو أنشئ امتحانًا قبل إنشاء الواجب."}};
   // Normalize the CLEANED snapshot's own totalMarks to the authoritative structural value so
   // assignment.totalMarks and assignment.examSnapshot.totalMarks can never contradict each other.
   // `exam` is a deep clone (cleanExam), so the original source exam object is never mutated.
   exam.totalMarks=stats.totalMarks;
   // Optional server-authoritative per-attempt timer (B1). 0 => untimed (unchanged behavior).
   const dur=parseDurationMinutes(b.durationMinutes);
   if(!dur.ok)return {status:400,jsonBody:{ok:false,error:"مدة المحاولة يجب أن تكون رقمًا صحيحًا بين 1 و1440 دقيقة، أو بدون مؤقت."}};
   const classroom=await dl(c,CLASS_PREFIX+classId+".json");if(!classroom||classroom.active===false)return {status:400,jsonBody:{ok:false,error:"الصف غير موجود أو مؤرشف."}};
   const openAt=iso(b.openAt),dueAt=iso(b.dueAt);if(openAt&&dueAt&&new Date(dueAt)<new Date(openAt))return {status:400,jsonBody:{ok:false,error:"موعد التسليم يجب أن يكون بعد موعد الفتح."}};
   const now=new Date().toISOString(),assignmentId=crypto.randomUUID(),maxAttempts=Math.min(10,Math.max(1,Number(b.maxAttempts||1)));
   // attemptModelVersion:2 (B2A) marks this assignment as using the UNIFIED attempt lifecycle: even an
   // UNTIMED assignment now requires an explicit server startAttempt (opening != starting). Assignments
   // created before B2A lack this flag and are treated as LEGACY (version 0) — there is NO bulk migration
   // and those documents keep their exact historical untimed behavior.
   const a={schemaVersion:2,attemptModelVersion:2,assignmentId,classId,className:String(classroom.name||""),title,instructions,status:b.publish===true?"published":"draft",openAt,dueAt,maxAttempts,durationMinutes:dur.value,sourceExamId:String(exam.examId||""),sourceExamTitle:String(exam.title||title),questionCount:stats.questionCount,totalMarks:stats.totalMarks,examSnapshot:exam,createdBy:String(auth.user?.sub||"teacher"),createdAt:now,updatedAt:now};
   await up(c,PREFIX+assignmentId+".json",a);return {status:200,jsonBody:{ok:true,assignment:summary(a)}};
  }
  if(action==="setstatus"||action==="setmaxattempts"){
   const id=String(b.assignmentId||""),name=PREFIX+id+".json";
   let nextStatus=null,nextMaxAttempts=null;
   if(action==="setstatus"){
    nextStatus=String(b.status||"").toLowerCase();
    // Archiving/restoring are dedicated actions now (Roadmap #7); setstatus handles ONLY draft/published.
    if(!["draft","published"].includes(nextStatus))return {status:400,jsonBody:{ok:false,error:"حالة الواجب غير صحيحة."}};
   }else{
    nextMaxAttempts=Math.min(10,Math.max(1,Number(b.maxAttempts||1)));
   }
   let updated=null;
   try{
    updated=await mut(c,name,current=>{
     if(!current){const err=new Error("الواجب غير موجود.");err.httpStatus=404;throw err}
     // An archived assignment must be restored before any status/attempt change (never bypass restore).
     if(normalizeAssignmentStatus(current)==="archived"){const err=new Error(action==="setstatus"?"الواجب مؤرشف. استعد الواجب أولًا.":"الواجب مؤرشف. استعده أولًا قبل تعديل عدد المحاولات.");err.httpStatus=409;throw err}
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

  // ── deleteImpact — read-only impact report used by the teacher UI before archive/purge (Roadmap #7). ──
  if(action==="deleteimpact"){
   const id=String(b.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
   const a=await dl(c,PREFIX+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
   const names=await lbn(c,SUB_PREFIX+id+"/"),subs=await ls(c,SUB_PREFIX+id+"/");
   return {status:200,jsonBody:{ok:true,impact:computeImpact(a,names.length,subs)}};
  }

  // ── archive (default deletion) + legacy "delete" alias — archive-first, NEVER physical deletion.
  // Preserves examSnapshot/timing/submissions/attempts/drafts/results. Idempotent. When students have live
  // active attempts, requires an explicit confirmActiveAttempts (re-checked here, never trusting the UI). ──
  if(action==="archive"||action==="delete"){
   const id=String(b.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
   const a=await dl(c,PREFIX+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
   const legacyDelete=action==="delete";
   if(normalizeAssignmentStatus(a)==="archived"){
    return {status:200,jsonBody:{ok:true,archived:true,alreadyArchived:true,...(legacyDelete?{legacyDeleteRedirected:true}:{}),assignment:summary(a)}};
   }
   const names=await lbn(c,SUB_PREFIX+id+"/"),subs=await ls(c,SUB_PREFIX+id+"/"),impact=computeImpact(a,names.length,subs);
   if(impact.activeAttempts>0&&b.confirmActiveAttempts!==true){
    return {status:409,jsonBody:{ok:false,requiresConfirmation:true,impact,error:"يوجد طلاب في محاولات نشطة. تأكيد الأرشفة سيمنعهم من المتابعة حتى تتم الاستعادة، ولن تُحذف إجاباتهم أو محاولاتهم."}};
   }
   let updated=null;
   try{
    updated=await mut(c,PREFIX+id+".json",current=>{
     if(!current){const err=new Error("الواجب غير موجود.");err.httpStatus=404;throw err}
     if(normalizeAssignmentStatus(current)==="archived")return current; // idempotent under the lock
     return applyAssignmentArchive(current,{actor:auth.user?.sub,now:new Date().toISOString(),reason:"manual"});
    });
   }catch(e){
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
    throw e;
   }
   await rec(c,{actor:auth.user?.sub,action:"assignment.archive",targetType:"assignment",targetId:id,targetLabel:a.title||"",details:{previousStatus:impact.status,activeAttempts:impact.activeAttempts,submissionDocuments:impact.submissionDocuments,requestedAction:action}});
   return {status:200,jsonBody:{ok:true,archived:true,...(legacyDelete?{legacyDeleteRedirected:true}:{}),assignment:summary(updated)}};
  }

  // ── restore — bring an archived assignment back to its prior draft/published state (legacy => draft).
  // Preserves all submissions/results/active attempts; never restarts a timer (timerState re-derives). ──
  if(action==="restore"){
   const id=String(b.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
   const a=await dl(c,PREFIX+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
   if(normalizeAssignmentStatus(a)!=="archived")return {status:409,jsonBody:{ok:false,error:"الواجب غير مؤرشف."}};
   let updated=null,restoredStatus=null;
   try{
    updated=await mut(c,PREFIX+id+".json",current=>{
     if(!current){const err=new Error("الواجب غير موجود.");err.httpStatus=404;throw err}
     if(normalizeAssignmentStatus(current)!=="archived"){const err=new Error("الواجب غير مؤرشف.");err.httpStatus=409;throw err}
     const next=applyAssignmentRestore(current,{now:new Date().toISOString()});restoredStatus=next.status;return next;
    });
   }catch(e){
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
    throw e;
   }
   await rec(c,{actor:auth.user?.sub,action:"assignment.restore",targetType:"assignment",targetId:id,targetLabel:a.title||"",details:{restoredStatus}});
   return {status:200,jsonBody:{ok:true,restored:true,assignment:summary(updated)}};
  }

  // ── purge — the ONLY physical deletion path (Roadmap #7). Allowed ONLY for an archived assignment with
  // ZERO submission history and an exact id+title confirmation; re-checks history immediately before the
  // delete so a submission created after the impact check aborts it. NO cascade — history always wins. ──
  if(action==="purge"){
   const id=String(b.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
   const a=await dl(c,PREFIX+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
   if(normalizeAssignmentStatus(a)!=="archived")return {status:409,jsonBody:{ok:false,error:"لا يمكن الحذف النهائي إلا لواجب مؤرشف. أرشفه أولًا."}};
   if(String(b.confirmAssignmentId||"")!==String(a.assignmentId||"")||String(b.confirmTitle||"")!==String(a.title||"")){
    return {status:400,jsonBody:{ok:false,error:"تأكيد الحذف النهائي غير مطابق."}};
   }
   const names=await lbn(c,SUB_PREFIX+id+"/");
   if(names.length>0){
    const subs=await ls(c,SUB_PREFIX+id+"/");
    return {status:409,jsonBody:{ok:false,blockedByHistory:true,impact:computeImpact(a,names.length,subs),error:"لا يمكن حذف الواجب نهائيًا لأن له بيانات طلاب محفوظة. اتركه مؤرشفًا للحفاظ على السجل."}};
   }
   const fresh=await dl(c,PREFIX+id+".json");
   if(!fresh||normalizeAssignmentStatus(fresh)!=="archived")return {status:409,jsonBody:{ok:false,error:"تعذّر الحذف النهائي: تغيّرت حالة الواجب. حدّث الصفحة وحاول مجددًا."}};
   await db(c,PREFIX+id+".json");
   await rec(c,{actor:auth.user?.sub,action:"assignment.purge",targetType:"assignment",targetId:id,targetLabel:a.title||"",details:{submissionDocuments:0,previousStatus:"archived"}});
   return {status:200,jsonBody:{ok:true,purged:true,assignmentId:id}};
  }

  return {status:400,jsonBody:{ok:false,error:"Unsupported assignment action."}};
 }catch{return {status:500,jsonBody:{ok:false,error:"تعذر تنفيذ إجراء الواجب حاليًا."}}}
}
app.http("manageAssignments",{methods:["GET","POST"],authLevel:"anonymous",route:"assignments",handler});
module.exports={handler,summary};
