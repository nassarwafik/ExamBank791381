
const {app}=require("@azure/functions");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull,listJson,mutateJsonWithRetry,StorageConflictError}=require("../lib/platform-storage");
const {recordAuditEvent}=require("../lib/audit-log");
const {timerState,normalizeEndReason,extendRejection,activeAttemptOf,toMs}=require("../lib/assignment-availability");
const AP="platform/assignments/",SP="platform/submissions/",UP="platform/users/";
const CONFLICT_MESSAGE="حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
// Additive audit view of a completed attempt for the teacher gradebook (B2A #20 / B2B #16). startedAt/
// endsAt/extendedEndsAt/endedAt are "" for legacy attempts; endReason is normalized (never mutates data).
function attemptAudit(x){return {startedAt:String(x.startedAt||""),endsAt:String(x.endsAt||""),extendedEndsAt:String(x.extendedEndsAt||""),endedAt:String(x.endedAt||""),endReason:normalizeEndReason(x),timedOut:!!x.timedOut}}
// One authoritative per-student lifecycle snapshot (B2B #18) derived from the shared timerState. Given to
// the teacher GET row AND returned by every mutating action so the UI never has to guess.
function lifecycle(a,s){
 const ts=timerState(a,s);
 return {attemptStatus:ts.attemptStatus,activeAttempt:ts.activeAttempt,effectiveAttemptEndsAt:ts.effectiveAttemptEndsAt,
  attemptDurationEndsAt:ts.attemptDurationEndsAt,attemptExpired:ts.attemptExpired,canStartAttempt:ts.canStartAttempt,
  canWrite:ts.canWrite,timed:ts.timed,durationMinutes:ts.durationMinutes,attemptsUsed:ts.attemptsUsed,
  allowedAttempts:ts.allowedAttempts,dueAtOverride:s&&s.dueAtOverride?String(s.dueAtOverride):null};
}
function defaultSub(id,studentId,a,student){return {schemaVersion:1,assignmentId:id,studentId,classId:a.classId,studentCode:String(student.code||""),studentName:String(student.displayName||""),allowedAttempts:null,draftAnswers:{},attempts:[],activeAttempt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
// Validate teacher + assignment + that the student belongs to the assignment's class. Returns
// { a, student, name } or { error:{status,error} }.
async function loadTarget(dl,c,id,studentId){
 if(!id||!studentId)return {error:{status:400,error:"assignmentId and studentId are required."}};
 const a=await dl(c,AP+id+".json");if(!a)return {error:{status:404,error:"الواجب غير موجود."}};
 const student=await dl(c,UP+studentId+".json");if(!student)return {error:{status:404,error:"الطالب غير موجود."}};
 if(String(student.classId||"")!==String(a.classId||""))return {error:{status:403,error:"الطالب لا ينتمي إلى صف هذا الواجب."}};
 return {a,student,name:SP+id+"/"+studentId+".json"};
}
// `deps` is an optional dependency-injection seam for unit tests (production passes nothing).
async function handler(request,deps={}){
 const authFn=deps.requireBuilderAuth||requireBuilderAuth,getC=deps.getContainer||getContainer,dl=deps.downloadJsonOrNull||downloadJsonOrNull,ls=deps.listJson||listJson,mut=deps.mutateJsonWithRetry||mutateJsonWithRetry,rec=deps.recordAuditEvent||recordAuditEvent;
 try{const auth=authFn(request);if(!auth.ok)return auth.response;const c=getC();
  if(request.method==="GET"){
   const u=new URL(request.url),id=String(u.searchParams.get("assignmentId")||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};const a=await dl(c,AP+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
   const users=(await ls(c,UP)).filter(x=>String(x.classId||"")===String(a.classId||"")&&x.active!==false),out=[];let submitted=0,pending=0,sum=0,highest=null,lowest=null;
   for(const student of users){const s=await dl(c,SP+id+"/"+student.userId+".json"),attempts=Array.isArray(s?.attempts)?s.attempts:[],latest=attempts.length?attempts[attempts.length-1]:null;if(latest){submitted++;sum+=Number(latest.percentage||0);highest=highest===null?Number(latest.percentage||0):Math.max(highest,Number(latest.percentage||0));lowest=lowest===null?Number(latest.percentage||0):Math.min(lowest,Number(latest.percentage||0));if(!latest.finalized)pending++}out.push({studentId:student.userId,studentName:student.displayName,studentCode:student.code,...lifecycle(a,s),attempts:attempts.map(x=>({attemptNumber:x.attemptNumber,score:x.score,totalMarks:x.totalMarks,percentage:x.percentage,submittedAt:x.submittedAt,finalized:x.finalized,manualReviewMarks:x.manualReviewMarks,...attemptAudit(x)})),latestResult:latest?{attemptNumber:latest.attemptNumber,score:latest.score,totalMarks:latest.totalMarks,percentage:latest.percentage,submittedAt:latest.submittedAt,finalized:latest.finalized,manualReviewMarks:latest.manualReviewMarks,teacherFeedback:String(latest.teacherFeedback||""),...attemptAudit(latest)}:null})}
   out.sort((x,y)=>String(x.studentName).localeCompare(String(y.studentName),"ar"));return {status:200,jsonBody:{ok:true,assignment:{assignmentId:a.assignmentId,title:a.title,dueAt:String(a.dueAt||""),durationMinutes:Number(a.durationMinutes||0),maxAttempts:Math.max(1,Number(a.maxAttempts||1)),totalMarks:Number(a.totalMarks||0)},stats:{students:users.length,submitted,pendingReview:pending,average:submitted?Number((sum/submitted).toFixed(1)):null,highest,lowest},students:out}};
  }
  let b={};try{b=await request.json()}catch{}const resultAction=String(b.action||"");

  // ── allowRetry — ensure the student has at least one unused NEXT attempt. Never deletes/resets a
  // completed attempt, never overwrites grades, never touches an active attempt (B2B #1/#2). ──
  if(resultAction==="allowRetry"){
   const t=await loadTarget(dl,c,String(b.assignmentId||""),String(b.studentId||""));if(t.error)return {status:t.error.status,jsonBody:{ok:false,error:t.error.error}};
   const {a,student,name}=t;let snap=null,finalAllowed=null;
   try{
    await mut(c,name,current=>{
     const doc=current||defaultSub(a.assignmentId,student.userId,a,student);
     const used=Array.isArray(doc.attempts)?doc.attempts.length:0,base=Math.max(1,Number(a.maxAttempts||1));
     // An active attempt already occupies the next slot (it is not yet in attempts.length), so to grant a
     // genuinely FUTURE unused attempt we must reserve one BEYOND it (B2B blocker-1). No active => used+1.
     const hasActive=!!activeAttemptOf(doc);
     doc.allowedAttempts=Math.max(base,Number(doc.allowedAttempts||0),used+(hasActive?2:1));
     doc.updatedAt=new Date().toISOString();
     finalAllowed=doc.allowedAttempts;snap=lifecycle(a,doc);
     return doc;
    });
   }catch(e){if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};throw e}
   await rec(c,{actor:auth.user?.sub,action:"assignment.allowRetry",targetType:"student",targetId:student.userId,targetLabel:String(student.displayName||student.code||""),details:{assignmentId:a.assignmentId,allowedAttempts:finalAllowed}});
   return {status:200,jsonBody:{ok:true,allowedAttempts:finalAllowed,...snap}};
  }

  // ── setDueAtOverride — unchanged semantics (per-student due date). Returns a lifecycle snapshot too. ──
  if(resultAction==="setDueAtOverride"){
   const t=await loadTarget(dl,c,String(b.assignmentId||""),String(b.studentId||""));if(t.error)return {status:t.error.status,jsonBody:{ok:false,error:t.error.error}};
   const {a,student,name}=t;const raw=b.dueAtOverride;let nextOverride;
   if(raw===null||raw===undefined||raw===""){nextOverride=null}
   else{
    const ms=new Date(raw).getTime();if(!Number.isFinite(ms))return {status:400,jsonBody:{ok:false,error:"تاريخ غير صالح."}};
    // With a global dueAt: the per-student override must EXTEND it (be later). Without a global dueAt
    // (B2B: a reopen/timer flow on an undated assignment), a per-student override is still allowed — it
    // just has to be a valid FUTURE timestamp (effectiveDueAt = dueAtOverride || dueAt handles the rest).
    if(a.dueAt){
     if(ms<=new Date(a.dueAt).getTime())return {status:400,jsonBody:{ok:false,error:"يجب أن يكون الموعد الجديد بعد الموعد الأصلي للواجب."}};
    }else if(ms<=Date.now()){
     return {status:400,jsonBody:{ok:false,error:"يجب أن يكون الموعد الجديد في المستقبل."}};
    }
    nextOverride=new Date(ms).toISOString();
   }
   let snap=null;
   try{
    await mut(c,name,current=>{
     const doc=current||defaultSub(a.assignmentId,student.userId,a,student);
     doc.dueAtOverride=nextOverride;doc.updatedAt=new Date().toISOString();snap=lifecycle(a,doc);
     return doc;
    });
   }catch(e){if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};throw e}
   await rec(c,{actor:auth.user?.sub,action:"assignment.setDueAtOverride",targetType:"student",targetId:student.userId,targetLabel:String(student.displayName||student.code||""),details:{assignmentId:a.assignmentId,dueAtOverride:nextOverride}});
   return {status:200,jsonBody:{ok:true,dueAtOverride:nextOverride,...snap}};
  }

  // ── reopenStudent — restore eligibility for one student to begin another attempt, even after the due
  // date. Never starts the attempt, never touches completed attempts/grades, never changes global dueAt
  // (B2B #3–7). Rejects while an active attempt exists. reopenUntil is REQUIRED when currently closed. ──
  if(resultAction==="reopenStudent"){
   const t=await loadTarget(dl,c,String(b.assignmentId||""),String(b.studentId||""));if(t.error)return {status:t.error.status,jsonBody:{ok:false,error:t.error.error}};
   const {a,student,name}=t;const existing=await dl(c,name);
   const stNow=timerState(a,existing,Date.now());
   if(stNow.activeAttempt)return {status:409,jsonBody:{ok:false,error:"لا يمكن إعادة الفتح أثناء وجود محاولة نشطة للطالب."}};
   const raw=b.reopenUntil;const hasReopen=!(raw===null||raw===undefined||raw==="");
   let nextOverride=existing&&existing.dueAtOverride?String(existing.dueAtOverride):null;
   if(hasReopen){
    const ms=new Date(raw).getTime();if(!Number.isFinite(ms))return {status:400,jsonBody:{ok:false,error:"تاريخ إعادة الفتح غير صالح."}};
    if(ms<=Date.now())return {status:400,jsonBody:{ok:false,error:"يجب أن يكون موعد إعادة الفتح في المستقبل."}};
    if(a.dueAt&&ms<=new Date(a.dueAt).getTime())return {status:400,jsonBody:{ok:false,error:"يجب أن يكون موعد إعادة الفتح بعد الموعد الأصلي للواجب."}};
    nextOverride=new Date(ms).toISOString();
   }else if(stNow.availability==="closed"){
    return {status:400,jsonBody:{ok:false,error:"الواجب مغلق: يجب تحديد موعد إعادة الفتح (reopenUntil)."}};
   }
   let snap=null,finalAllowed=null;
   try{
    await mut(c,name,current=>{
     const doc=current||defaultSub(a.assignmentId,student.userId,a,student);
     if(activeAttemptOf(doc)){const err=new Error("لا يمكن إعادة الفتح أثناء وجود محاولة نشطة للطالب.");err.httpStatus=409;throw err} // race backstop
     const used=Array.isArray(doc.attempts)?doc.attempts.length:0,base=Math.max(1,Number(a.maxAttempts||1));
     doc.allowedAttempts=Math.max(base,Number(doc.allowedAttempts||0),used+1);
     if(hasReopen)doc.dueAtOverride=nextOverride;
     doc.updatedAt=new Date().toISOString();
     finalAllowed=doc.allowedAttempts;snap=lifecycle(a,doc);
     return doc;
    });
   }catch(e){if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};throw e}
   await rec(c,{actor:auth.user?.sub,action:"assignment.reopenStudent",targetType:"student",targetId:student.userId,targetLabel:String(student.displayName||student.code||""),details:{assignmentId:a.assignmentId,allowedAttempts:finalAllowed,dueAtOverride:nextOverride}});
   return {status:200,jsonBody:{ok:true,allowedAttempts:finalAllowed,dueAtOverride:nextOverride,...snap}};
  }

  // ── extendActiveAttempt — extend the timer of an existing TIMED active attempt (B2B #8–17/#26). Adds
  // activeAttempt.extendedEndsAt (a strictly-later absolute deadline); NEVER changes startedAt/endsAt/
  // attemptNumber, never shortens, never starts a new attempt. Reviving an expired-but-not-finalized
  // attempt is intentional. dueAtOverride and the timer extension stay separate controls. ──
  if(resultAction==="extendActiveAttempt"){
   const t=await loadTarget(dl,c,String(b.assignmentId||""),String(b.studentId||""));if(t.error)return {status:t.error.status,jsonBody:{ok:false,error:t.error.error}};
   const {a,student,name}=t;const newEndsAt=b.newEndsAt;const existing=await dl(c,name);
   const rej=extendRejection(a,existing,newEndsAt,Date.now());
   if(rej)return {status:rej.status,jsonBody:{ok:false,error:rej.error}};
   let snap=null,auditDetails=null;
   try{
    await mut(c,name,current=>{
     const rj=extendRejection(a,current,newEndsAt,Date.now()); // atomic re-check against live state
     if(rj){const err=new Error(rj.error);err.httpStatus=rj.status;throw err}
     const doc=current,active=doc.activeAttempt; // extendRejection guarantees a live active attempt
     const oldOriginal=String(active.endsAt||""),oldExtended=String(active.extendedEndsAt||"");
     active.extendedEndsAt=new Date(toMs(newEndsAt)).toISOString(); // canonical ISO; startedAt/endsAt/number untouched
     doc.updatedAt=new Date().toISOString();
     const ts=timerState(a,doc,Date.now());snap=lifecycle(a,doc);
     auditDetails={assignmentId:a.assignmentId,oldOriginalEndsAt:oldOriginal,oldExtendedEndsAt:oldExtended,newExtendedEndsAt:active.extendedEndsAt,effectiveAttemptEndsAt:ts.effectiveAttemptEndsAt};
     return doc;
    });
   }catch(e){if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};throw e}
   await rec(c,{actor:auth.user?.sub,action:"assignment.extendActiveAttempt",targetType:"student",targetId:student.userId,targetLabel:String(student.displayName||student.code||""),details:auditDetails});
   return {status:200,jsonBody:{ok:true,...snap}};
  }

  return {status:400,jsonBody:{ok:false,error:"Unsupported result action."}};
 }catch{return {status:500,jsonBody:{ok:false,error:"تعذر تنفيذ عملية النتائج حاليًا."}}}
}
app.http("assignmentResults",{methods:["GET","POST"],authLevel:"anonymous",route:"assignment-results",handler});
module.exports={handler};
