
const {app}=require("@azure/functions");
const {requireStudentAuth}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull,mutateJsonWithRetry,StorageConflictError}=require("../lib/platform-storage");
const {gradeExam}=require("../lib/assignment-grading");
const {recordAchievementIfEligible}=require("../lib/achievement-feed");
const {normalizeClassStatus}=require("../lib/class-lifecycle");
const {timerState,startRejection,writeRejection,normalizeDurationMinutes,activeAttemptOf}=require("../lib/assignment-availability");
const AP="platform/assignments/",SP="platform/submissions/";
const CONFLICT_MESSAGE="حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
// A completed attempt's public shape. timedOut/startedAt/endsAt are additive audit fields for timed
// attempts; they are "" / false for legacy/untimed attempts (backward compatible).
function pub(x){return {attemptNumber:x.attemptNumber,submittedAt:x.submittedAt,score:x.score,totalMarks:x.totalMarks,percentage:x.percentage,manualReviewMarks:x.manualReviewMarks,finalized:x.finalized,teacherFeedback:String(x.teacherFeedback||""),timedOut:!!x.timedOut,startedAt:String(x.startedAt||""),endsAt:String(x.endsAt||"")}}
// Unified state from the shared timer/availability helper, so this endpoint agrees with the
// dashboard/assignment endpoints. `canAttempt` keeps its historical (untimed) meaning; `canWrite`
// (save/submit gate) and `canStartAttempt` (timed start gate) are explicit and separate. serverNow +
// effectiveAttemptEndsAt let the client run a server-anchored countdown without trusting the device clock.
function state(a,s,nowMs=Date.now()){
 const ts=timerState(a,s,nowMs),attempts=Array.isArray(s?.attempts)?s.attempts:[],latest=attempts.length?attempts[attempts.length-1]:null;
 return {attemptsUsed:ts.attemptsUsed,allowedAttempts:ts.allowedAttempts,canAttempt:ts.canAttempt,dueClosed:ts.isClosed,availability:ts.availability,openAt:ts.openAt,effectiveDueAt:ts.effectiveDueAt,
  durationMinutes:ts.durationMinutes,timed:ts.timed,serverNow:new Date(nowMs).toISOString(),activeAttempt:ts.activeAttempt,effectiveAttemptEndsAt:ts.effectiveAttemptEndsAt,attemptExpired:ts.attemptExpired,canStartAttempt:ts.canStartAttempt,canWrite:ts.canWrite,
  draftAnswers:s?.draftAnswers||{},draftSavedAt:s?.draftSavedAt||"",latestResult:latest?pub(latest):null,attempts:attempts.map(pub)}}
function defaultSubmission(id,student){return {schemaVersion:1,assignmentId:id,studentId:student.userId,classId:student.classId,studentCode:student.code,studentName:student.displayName,allowedAttempts:null,draftAnswers:{},attempts:[],activeAttempt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used). It does not change runtime behavior.
async function handler(request,deps={}){
 const authFn=deps.requireStudentAuth||requireStudentAuth,getC=deps.getContainer||getContainer,dl=deps.downloadJsonOrNull||downloadJsonOrNull,mut=deps.mutateJsonWithRetry||mutateJsonWithRetry,gradeFn=deps.gradeExam||gradeExam,recFn=deps.recordAchievementIfEligible||recordAchievementIfEligible;
 try{const auth=authFn(request);if(!auth.ok)return auth.response;const id=String(request.params?.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};const c=getC(),student=await dl(c,"platform/users/"+auth.user.sub+".json");if(!student||student.active===false)return {status:401,jsonBody:{ok:false,error:"الحساب غير فعّال."}};
  const classroom=student.classId?await dl(c,"platform/classes/"+student.classId+".json"):null;
  if(classroom&&normalizeClassStatus(classroom)==="archived")return {status:403,jsonBody:{ok:false,error:"هذا الصف مؤرشف وانتهت السنة الدراسية."}};
  const a=await dl(c,AP+id+".json");if(!a||String(a.classId)!==String(student.classId))return {status:404,jsonBody:{ok:false,error:"الواجب غير متاح."}};const name=SP+id+"/"+student.userId+".json";
  const s=await dl(c,name);
  if(request.method==="GET"){return {status:200,jsonBody:{ok:true,state:state(a,s||defaultSubmission(id,student))}}}
  let b={};try{b=await request.json()}catch{}const action=String(b.action||"saveDraft");

  // ── startAttempt (timed) — server stamps startedAt/endsAt (server time only). IDEMPOTENT: a live
  // active attempt is returned unchanged (double-click / refresh / retry never restart the timer). ──
  if(action==="startAttempt"){
   const rej=startRejection(a,s,Date.now());
   if(rej)return {status:rej.status,jsonBody:{ok:false,error:rej.error}};
   const durationMs=normalizeDurationMinutes(a.durationMinutes)*60000;
   let resultState=null;
   try{
    await mut(c,name,current=>{
     const doc=current||defaultSubmission(id,student);
     const rj=startRejection(a,doc,Date.now()); // re-check under the lock (race backstop)
     if(rj){const err=new Error(rj.error);err.httpStatus=rj.status;throw err}
     const existing=activeAttemptOf(doc);
     if(existing){resultState=state(a,doc,Date.now());return doc} // idempotent — never restart
     const startMs=Date.now(),attemptNumber=(Array.isArray(doc.attempts)?doc.attempts.length:0)+1;
     doc.activeAttempt={attemptNumber,startedAt:new Date(startMs).toISOString(),endsAt:new Date(startMs+durationMs).toISOString()};
     doc.updatedAt=new Date(startMs).toISOString();
     resultState=state(a,doc,startMs);
     return doc;
    });
   }catch(e){
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
    throw e;
   }
   return {status:200,jsonBody:{ok:true,state:resultState}};
  }

  if(action==="saveDraft"){
   const rej=writeRejection(a,s,"saveDraft",Date.now());
   if(rej)return {status:rej.status,jsonBody:{ok:false,error:rej.error}};
   const answers=b.answers&&typeof b.answers==="object"?b.answers:{};
   let savedAt="",finalState=null;
   try{
    await mut(c,name,current=>{
     const doc=current||defaultSubmission(id,student);
     const ts=timerState(a,doc,Date.now());
     if(!ts.canWrite){const err=new Error(ts.timed?(ts.attemptExpired?"انتهى وقت المحاولة.":"ابدأ المحاولة أولاً."):"لا توجد محاولة متاحة للحفظ.");err.httpStatus=409;throw err}
     savedAt=new Date().toISOString();
     doc.draftAnswers=answers;doc.draftSavedAt=savedAt;doc.updatedAt=savedAt;
     finalState=state(a,doc,Date.now());
     return doc;
    });
   }catch(e){
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
    throw e;
   }
   return {status:200,jsonBody:{ok:true,savedAt,serverNow:new Date().toISOString(),effectiveAttemptEndsAt:finalState?finalState.effectiveAttemptEndsAt:""}};
  }

  if(action==="submit"){
   const rej=writeRejection(a,s,"submit",Date.now());
   if(rej)return {status:rej.status,jsonBody:{ok:false,error:rej.error}};
   const answers=b.answers&&typeof b.answers==="object"?b.answers:{},g=gradeFn(a.examSnapshot,answers),now=new Date().toISOString();
   let resultAttempt=null,finalState=null;
   try{
    await mut(c,name,current=>{
     const doc=current||defaultSubmission(id,student);
     const ts=timerState(a,doc,Date.now());
     if(!ts.canWrite){const err=new Error(ts.timed?(ts.attemptExpired?"انتهى وقت المحاولة.":"ابدأ المحاولة أولاً."):(ts.isClosed?"انتهى موعد التسليم.":"لا توجد محاولة إضافية متاحة."));err.httpStatus=409;throw err}
     const active=activeAttemptOf(doc),attemptNumber=active?active.attemptNumber:(doc.attempts?.length||0)+1;
     const attempt={attemptNumber,submittedAt:now,score:g.score,totalMarks:g.totalMarks,percentage:g.percentage,manualReviewMarks:g.manualReviewMarks,finalized:g.finalized,questionGrades:g.questions,sections:g.sections,answers,manualOverrides:{},teacherFeedback:"",timedOut:false,startedAt:active?active.startedAt:"",endsAt:active?active.endsAt:""};
     doc.attempts=Array.isArray(doc.attempts)?doc.attempts:[];doc.attempts.push(attempt);
     doc.draftAnswers={};doc.draftSavedAt="";doc.activeAttempt=null;doc.updatedAt=now;
     resultAttempt=attempt;finalState=state(a,doc,Date.now());
     return doc;
    });
   }catch(e){
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
    throw e;
   }
   if(resultAttempt.finalized){
    await recFn(c,{classId:student.classId,studentId:student.userId,studentDisplayName:student.displayName,assignmentId:id,assignmentTitle:a.title,percentage:resultAttempt.percentage,shareAchievements:student.shareAchievements});
   }
   return {status:200,jsonBody:{ok:true,result:pub(resultAttempt),state:finalState}};
  }

  // ── finalizeTimedOutAttempt — the ONLY safe way an expired timed attempt is closed. SECURITY: grades
  // ONLY submission.draftAnswers already on the server; any client-supplied answers are IGNORED, so a
  // student cannot edit answers after expiry and pass them as a "timeout" submission. Idempotent. ──
  if(action==="finalizeTimedOutAttempt"){
   let resultAttempt=null,finalState=null,already=false;
   try{
    await mut(c,name,current=>{
     const doc=current||defaultSubmission(id,student);
     const active=activeAttemptOf(doc);
     if(!active){already=true;finalState=state(a,doc,Date.now());return doc} // already finalized — no-op
     const ts=timerState(a,doc,Date.now());
     if(!ts.attemptExpired){const err=new Error("لم تنتهِ مدة المحاولة بعد.");err.httpStatus=409;throw err}
     const serverAnswers=doc.draftAnswers&&typeof doc.draftAnswers==="object"?doc.draftAnswers:{};
     const g=gradeFn(a.examSnapshot,serverAnswers),now=new Date().toISOString();
     const attempt={attemptNumber:active.attemptNumber,submittedAt:now,score:g.score,totalMarks:g.totalMarks,percentage:g.percentage,manualReviewMarks:g.manualReviewMarks,finalized:g.finalized,questionGrades:g.questions,sections:g.sections,answers:serverAnswers,manualOverrides:{},teacherFeedback:"",timedOut:true,startedAt:active.startedAt,endsAt:active.endsAt};
     doc.attempts=Array.isArray(doc.attempts)?doc.attempts:[];doc.attempts.push(attempt);
     doc.draftAnswers={};doc.draftSavedAt="";doc.activeAttempt=null;doc.updatedAt=now;
     resultAttempt=attempt;finalState=state(a,doc,Date.now());
     return doc;
    });
   }catch(e){
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
    throw e;
   }
   if(!already&&resultAttempt&&resultAttempt.finalized){
    await recFn(c,{classId:student.classId,studentId:student.userId,studentDisplayName:student.displayName,assignmentId:id,assignmentTitle:a.title,percentage:resultAttempt.percentage,shareAchievements:student.shareAchievements});
   }
   return {status:200,jsonBody:{ok:true,result:resultAttempt?pub(resultAttempt):(finalState?finalState.latestResult:null),state:finalState,alreadyFinalized:already}};
  }

  return {status:400,jsonBody:{ok:false,error:"Unsupported submission action."}};
 }catch{return {status:500,jsonBody:{ok:false,error:"تعذر تنفيذ عملية التسليم حاليًا."}}}
}
app.http("studentSubmission",{methods:["GET","POST"],authLevel:"anonymous",route:"student-submission/{assignmentId}",handler});
module.exports={handler,state};
