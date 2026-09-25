
const {app}=require("@azure/functions");
const {withObservability}=require("../lib/observability");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull,listJson,mutateJsonWithRetry,StorageConflictError,mapConcurrent,getReadConcurrency}=require("../lib/platform-storage");
const {recordAuditEvent}=require("../lib/audit-log");
const {timerState,normalizeEndReason,extendRejection,activeAttemptOf,toMs,attemptPolicyOf,attemptModelVersion,attemptEpochOf}=require("../lib/assignment-availability");
const {gradeExam}=require("../lib/assignment-grading");
const {normalizeAssignmentStatus}=require("../lib/assignment-lifecycle");
const {deriveGradingStatus}=require("../lib/grading-status");
const {isStudentClassMember}=require("../lib/class-membership");
const AP="platform/assignments/",SP="platform/submissions/",UP="platform/users/";
const CONFLICT_MESSAGE="حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
// Additive audit view of a completed attempt for the teacher gradebook (B2A #20 / B2B #16). startedAt/
// endsAt/extendedEndsAt/endedAt are "" for legacy attempts; endReason is normalized (never mutates data).
function attemptAudit(x){return {startedAt:String(x.startedAt||""),endsAt:String(x.endsAt||""),extendedEndsAt:String(x.extendedEndsAt||""),endedAt:String(x.endedAt||""),endReason:normalizeEndReason(x),timedOut:!!x.timedOut,...(x.pauseCount!==undefined?{pauseCount:Math.max(0,Number(x.pauseCount)||0)}:{})}}
// One authoritative per-student lifecycle snapshot (B2B #18) derived from the shared timerState. Given to
// the teacher GET row AND returned by every mutating action so the UI never has to guess.
function lifecycle(a,s){
 const ts=timerState(a,s);
 return {attemptStatus:ts.attemptStatus,activeAttempt:ts.activeAttempt,effectiveAttemptEndsAt:ts.effectiveAttemptEndsAt,
  attemptDurationEndsAt:ts.attemptDurationEndsAt,attemptExpired:ts.attemptExpired,canStartAttempt:ts.canStartAttempt,
  canWrite:ts.canWrite,timed:ts.timed,durationMinutes:ts.durationMinutes,attemptsUsed:ts.attemptsUsed,
  allowedAttempts:ts.allowedAttempts,dueAtOverride:s&&s.dueAtOverride?String(s.dueAtOverride):null};
}
// The graded-result half of a gradebook row (completed attempts + latest result + its grading status). Shared by the GET
// row and by endActiveAttempt, so the row a teacher action returns is byte-for-byte the row a reload would show.
function resultFields(s){
 const attempts=Array.isArray(s?.attempts)?s.attempts:[],latest=attempts.length?attempts[attempts.length-1]:null,latestGrading=deriveGradingStatus(latest);
 return {gradingStatus:latestGrading,attempts:attempts.map(x=>({attemptNumber:x.attemptNumber,score:x.score,totalMarks:x.totalMarks,percentage:x.percentage,submittedAt:x.submittedAt,finalized:x.finalized,manualReviewMarks:x.manualReviewMarks,gradingStatus:deriveGradingStatus(x),...attemptAudit(x)})),latestResult:latest?{attemptNumber:latest.attemptNumber,score:latest.score,totalMarks:latest.totalMarks,percentage:latest.percentage,submittedAt:latest.submittedAt,finalized:latest.finalized,manualReviewMarks:latest.manualReviewMarks,gradingStatus:latestGrading,teacherFeedback:String(latest.teacherFeedback||""),...attemptAudit(latest)}:null};
}
// Phase 7B — the identity a teacher's endActiveAttempt was composed under. STRICT, fail closed (same rules as the student
// write guard): attemptNumber a real integer >= 1, startedAt a non-empty string, and for model 3 an attemptEpoch integer
// >= 1. Returns null when anything is missing or malformed — a generic "end this student's attempt" is never accepted.
function teacherEndIdentity(a,b){
 const en=b&&b.expectedAttemptNumber,es=b&&b.expectedStartedAt,ee=b&&b.expectedAttemptEpoch;
 if(typeof en!=="number"||!Number.isInteger(en)||en<1)return null;
 if(typeof es!=="string"||es==="")return null;
 if(attemptModelVersion(a)<3)return {attemptNumber:en,startedAt:es};
 if(typeof ee!=="number"||!Number.isInteger(ee)||ee<1)return null;
 return {attemptNumber:en,startedAt:es,attemptEpoch:ee};
}
function httpError(status,message){const err=new Error(message);err.httpStatus=status;return err}
function defaultSub(id,studentId,a,student){return {schemaVersion:1,assignmentId:id,studentId,classId:a.classId,studentCode:String(student.code||""),studentName:String(student.displayName||""),allowedAttempts:null,draftAnswers:{},attempts:[],activeAttempt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
// Validate teacher + assignment + that the student belongs to the assignment's class. Returns
// { a, student, name } or { error:{status,error} }.
async function loadTarget(dl,c,id,studentId){
 if(!id||!studentId)return {error:{status:400,error:"assignmentId and studentId are required."}};
 const a=await dl(c,AP+id+".json");if(!a)return {error:{status:404,error:"الواجب غير موجود."}};
 const student=await dl(c,UP+studentId+".json");if(!student)return {error:{status:404,error:"الطالب غير موجود."}};
 if(String(student.classId||"")!==String(a.classId||""))return {error:{status:403,error:"الطالب لا ينتمي إلى صف هذا الواجب."}};
 // Roadmap #7: an archived assignment's attempt controls (allowRetry/setDueAtOverride/reopenStudent/
 // extendActiveAttempt) are blocked — restore it first. Read paths (GET results/review) stay available.
 if(normalizeAssignmentStatus(a)==="archived")return {error:{status:409,error:"الواجب مؤرشف. استعد الواجب أولًا قبل تعديل محاولات الطلاب."}};
 return {a,student,name:SP+id+"/"+studentId+".json"};
}
// `deps` is an optional dependency-injection seam for unit tests (production passes nothing).
async function handler(request,deps={},obs=null){
 const gradeFn=deps.gradeExam||gradeExam,authFn=deps.requireBuilderAuth||requireBuilderAuth,getC=deps.getContainer||getContainer,dl=deps.downloadJsonOrNull||downloadJsonOrNull,ls=deps.listJson||listJson,mut=deps.mutateJsonWithRetry||mutateJsonWithRetry,rec=deps.recordAuditEvent||recordAuditEvent;
 try{const auth=authFn(request);if(!auth.ok)return auth.response;const c=getC();
  if(request.method==="GET"){
   const u=new URL(request.url),id=String(u.searchParams.get("assignmentId")||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};const a=await dl(c,AP+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
   // Roadmap #24: the gradebook population is CLASS MEMBERSHIP (canonical predicate) — a login-disabled
   // (active:false, non-archived) student keeps their row, results and pending-review visibility.
   const users=(await ls(c,UP)).filter(x=>isStudentClassMember(x,a.classId)),out=[];
   let submitted=0,pending=0,finalizedCount=0,notSubmitted=0,active=0,sum=0,highest=null,lowest=null;
   // Roadmap #27: fetch every member's submission with bounded concurrency (aligned with `users`), then aggregate in order.
   const submissionsByIndex=await mapConcurrent(users,getReadConcurrency(),student=>dl(c,SP+id+"/"+student.userId+".json"));
   for(let index=0;index<users.length;index++){
    const student=users[index];
    const s=submissionsByIndex[index],rf=resultFields(s),latest=rf.latestResult;
    const latestGrading=rf.gradingStatus;                                   // notSubmitted | pendingReview | final
    if(latest){submitted++;sum+=Number(latest.percentage||0);highest=highest===null?Number(latest.percentage||0):Math.max(highest,Number(latest.percentage||0));lowest=lowest===null?Number(latest.percentage||0):Math.min(lowest,Number(latest.percentage||0));if(latestGrading==="pendingReview")pending++;else if(latestGrading==="final")finalizedCount++}
    else notSubmitted++;
    if(activeAttemptOf(s))active++;                                         // active attempt is INDEPENDENT of grading status
    out.push({studentId:student.userId,studentName:student.displayName,studentCode:student.code,...lifecycle(a,s),...rf})}
   out.sort((x,y)=>String(x.studentName).localeCompare(String(y.studentName),"ar"));return {status:200,jsonBody:{ok:true,assignment:{assignmentId:a.assignmentId,title:a.title,dueAt:String(a.dueAt||""),durationMinutes:Number(a.durationMinutes||0),maxAttempts:Math.max(1,Number(a.maxAttempts||1)),totalMarks:Number(a.totalMarks||0),attemptPolicy:attemptPolicyOf(a)},stats:{students:users.length,submitted,pendingReview:pending,finalized:finalizedCount,notSubmitted,active,average:submitted?Number((sum/submitted).toFixed(1)):null,highest,lowest},students:out}};
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
   }catch(e){if(e instanceof StorageConflictError){obs?.logWarn("assignment.lifecycle.conflict",{action:resultAction,assignmentId:String(b.assignmentId||""),retryable:true});return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}}}obs?.logWarn("assignment.lifecycle.failed",{action:resultAction,assignmentId:String(b.assignmentId||"")});throw e}
   await rec(c,{actor:auth.user?.sub,action:"assignment.allowRetry",targetType:"student",targetId:student.userId,targetLabel:String(student.displayName||student.code||""),details:{assignmentId:a.assignmentId,allowedAttempts:finalAllowed}});
   obs?.logInfo("assignment.lifecycle.completed",{action:resultAction,assignmentId:a.assignmentId});
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
   }catch(e){if(e instanceof StorageConflictError){obs?.logWarn("assignment.lifecycle.conflict",{action:resultAction,assignmentId:String(b.assignmentId||""),retryable:true});return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}}}obs?.logWarn("assignment.lifecycle.failed",{action:resultAction,assignmentId:String(b.assignmentId||"")});throw e}
   await rec(c,{actor:auth.user?.sub,action:"assignment.setDueAtOverride",targetType:"student",targetId:student.userId,targetLabel:String(student.displayName||student.code||""),details:{assignmentId:a.assignmentId,dueAtOverride:nextOverride}});
   obs?.logInfo("assignment.lifecycle.completed",{action:resultAction,assignmentId:a.assignmentId});
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
   }catch(e){if(e instanceof StorageConflictError){obs?.logWarn("assignment.lifecycle.conflict",{action:resultAction,assignmentId:String(b.assignmentId||""),retryable:true});return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}}}if(e?.httpStatus){obs?.logWarn(e.httpStatus===409?"assignment.lifecycle.conflict":"assignment.lifecycle.failed",{action:resultAction,assignmentId:String(b.assignmentId||""),status:e.httpStatus});return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}}}obs?.logWarn("assignment.lifecycle.failed",{action:resultAction,assignmentId:String(b.assignmentId||"")});throw e}
   await rec(c,{actor:auth.user?.sub,action:"assignment.reopenStudent",targetType:"student",targetId:student.userId,targetLabel:String(student.displayName||student.code||""),details:{assignmentId:a.assignmentId,allowedAttempts:finalAllowed,dueAtOverride:nextOverride}});
   obs?.logInfo("assignment.lifecycle.completed",{action:resultAction,assignmentId:a.assignmentId});
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
   }catch(e){if(e instanceof StorageConflictError){obs?.logWarn("assignment.lifecycle.conflict",{action:resultAction,assignmentId:String(b.assignmentId||""),retryable:true});return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}}}if(e?.httpStatus){obs?.logWarn(e.httpStatus===409?"assignment.lifecycle.conflict":"assignment.lifecycle.failed",{action:resultAction,assignmentId:String(b.assignmentId||""),status:e.httpStatus});return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}}}obs?.logWarn("assignment.lifecycle.failed",{action:resultAction,assignmentId:String(b.assignmentId||"")});throw e}
   await rec(c,{actor:auth.user?.sub,action:"assignment.extendActiveAttempt",targetType:"student",targetId:student.userId,targetLabel:String(student.displayName||student.code||""),details:auditDetails});
   obs?.logInfo("assignment.lifecycle.completed",{action:resultAction,assignmentId:a.assignmentId});
   return {status:200,jsonBody:{ok:true,...snap}};
  }

  // ── endActiveAttempt (Phase 7B) — the teacher ends ONE student's CURRENT attempt from the gradebook. The request must
  // carry the identity of the attempt the teacher saw (attemptNumber + startedAt, + attemptEpoch on model 3); inside the
  // single CAS the LIVE activeAttempt is re-read and must match exactly, so a stale request can never end a newer attempt
  // (409). Grades ONLY the server's draftAnswers (client answers are never read), appends exactly ONE completed attempt,
  // clears the active attempt + draft, and never deletes/resets attempts, attemptsUsed or allowedAttempts. A PAUSED
  // attempt may be ended too: its clock is NOT resumed and pausedRemainingMs is never recomputed — the attempt simply
  // closes. If the attempt had already expired by the server clock it is closed with the server semantics ("timedOut",
  // endedAt = the effective deadline), exactly as the student's finalizeTimedOutAttempt would. Races with submit /
  // pause / resume / timeout / a duplicate click are decided by the CAS: exactly one writer closes the attempt; the loser
  // gets 409 — except a duplicate of THIS teacher end, which is an idempotent 200 (alreadyEnded) and writes nothing. ──
  if(resultAction==="endActiveAttempt"){
   const t=await loadTarget(dl,c,String(b.assignmentId||""),String(b.studentId||""));if(t.error)return {status:t.error.status,jsonBody:{ok:false,error:t.error.error}};
   const {a,student,name}=t;const want=teacherEndIdentity(a,b);
   if(!want)return {status:400,jsonBody:{ok:false,error:"بيانات المحاولة المطلوب إنهاؤها ناقصة. حدّث القائمة ثم حاول مرة أخرى."}};
   const ALREADY={};let snap=null,auditDetails=null;
   try{
    await mut(c,name,async current=>{
     // The LIVE assignment, re-read on every CAS attempt, is the ONLY authority for every decision below (archived
     // status, timing/expiry → end reason, policy, model/epoch rules, the returned lifecycle). The outer `a` from
     // loadTarget is kept only for immutable identifiers: a concurrent updateTiming (assignment-blob CAS, independent of
     // this submission CAS) may have moved dueAt/duration since, and must not be judged against the stale copy.
     const fa=await dl(c,AP+a.assignmentId+".json");
     if(!fa)throw httpError(404,"الواجب غير موجود.");
     if(normalizeAssignmentStatus(fa)==="archived")throw httpError(409,"الواجب مؤرشف. استعد الواجب أولًا قبل تعديل محاولات الطلاب.");
     const live=teacherEndIdentity(fa,b);                                   // model/epoch rule of the LIVE assignment (fail closed)
     if(!live)throw httpError(400,"بيانات المحاولة المطلوب إنهاؤها ناقصة. حدّث القائمة ثم حاول مرة أخرى.");
     const doc=current,active=activeAttemptOf(doc);
     const same=!!active&&Number(active.attemptNumber)===want.attemptNumber&&String(active.startedAt||"")===want.startedAt;
     if(!same){
      // The asserted attempt is no longer live. A duplicate of this very teacher end finds it completed as teacherEnded →
      // idempotent (no write). Anything else (the student submitted, it timed out, a newer attempt started) → 409.
      const done=(Array.isArray(doc?.attempts)?doc.attempts:[]).find(x=>Number(x.attemptNumber)===want.attemptNumber&&String(x.startedAt||"")===want.startedAt);
      if(done&&normalizeEndReason(done)==="teacherEnded"){snap={...lifecycle(fa,doc),...resultFields(doc)};throw ALREADY}
      throw httpError(409,done?"انتهت هذه المحاولة بالفعل. حدّث القائمة.":"تغيّرت محاولة الطالب. حدّث القائمة ثم حاول مرة أخرى.");
     }
     if(live.attemptEpoch!==undefined&&attemptEpochOf(active)!==live.attemptEpoch)throw httpError(409,"تغيّرت حالة محاولة الطالب (حفظ مؤقت أو استئناف). حدّث القائمة ثم حاول مرة أخرى.");
     const nowMs=Date.now(),now=new Date(nowMs).toISOString(),ts=timerState(fa,doc,nowMs);
     const previousStatus=ts.activeAttempt?ts.activeAttempt.status:"started",timedOut=!!ts.attemptExpired;
     const serverAnswers=doc.draftAnswers&&typeof doc.draftAnswers==="object"?doc.draftAnswers:{};
     const g=gradeFn(fa.examSnapshot,serverAnswers),endReason=timedOut?"timedOut":"teacherEnded",endedAt=timedOut?(ts.effectiveAttemptEndsAt||now):now;
     const attempt={attemptNumber:active.attemptNumber,submittedAt:now,score:g.score,totalMarks:g.totalMarks,percentage:g.percentage,manualReviewMarks:g.manualReviewMarks,finalized:g.finalized,questionGrades:g.questions,sections:g.sections,answers:serverAnswers,manualOverrides:{},teacherFeedback:"",timedOut,startedAt:active.startedAt,endsAt:active.endsAt||"",extendedEndsAt:active.extendedEndsAt?String(active.extendedEndsAt):"",endedAt,endReason,...(attemptModelVersion(fa)>=3?{pauseCount:Math.max(0,Number(active.pauseCount)||0)}:{})};
     doc.attempts=Array.isArray(doc.attempts)?doc.attempts:[];doc.attempts.push(attempt);
     doc.draftAnswers={};doc.draftSavedAt="";doc.activeAttempt=null;doc.updatedAt=now;
     snap={...lifecycle(fa,doc),...resultFields(doc)};
     // Audit: identity + timing + policy only — NEVER answers, grades of questions, tokens or exam content.
     auditDetails={assignmentId:a.assignmentId,attemptNumber:attempt.attemptNumber,startedAt:String(attempt.startedAt),endedAt,endReason,attemptPolicy:attemptPolicyOf(fa),pauseCount:Math.max(0,Number(active.pauseCount)||0),previousStatus,timed:!!ts.timed};
     return doc;
    });
   }catch(e){
    if(e===ALREADY){obs?.logInfo("assignment.lifecycle.completed",{action:resultAction,assignmentId:a.assignmentId,alreadyEnded:true});return {status:200,jsonBody:{ok:true,alreadyEnded:true,...snap}}}
    if(e instanceof StorageConflictError){obs?.logWarn("assignment.lifecycle.conflict",{action:resultAction,assignmentId:String(b.assignmentId||""),retryable:true});return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}}}if(e?.httpStatus){obs?.logWarn(e.httpStatus===409?"assignment.lifecycle.conflict":"assignment.lifecycle.failed",{action:resultAction,assignmentId:String(b.assignmentId||""),status:e.httpStatus});return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}}}obs?.logWarn("assignment.lifecycle.failed",{action:resultAction,assignmentId:String(b.assignmentId||"")});throw e}
   await rec(c,{actor:auth.user?.sub,action:"assignment.endActiveAttempt",targetType:"student",targetId:student.userId,targetLabel:String(student.displayName||student.code||""),details:auditDetails});
   obs?.logInfo("assignment.lifecycle.completed",{action:resultAction,assignmentId:a.assignmentId,endReason:auditDetails.endReason});
   return {status:200,jsonBody:{ok:true,alreadyEnded:false,...snap}};
  }

  return {status:400,jsonBody:{ok:false,error:"Unsupported result action."}};
 }catch(e){obs?.logError("assignment.results.error",e);return {status:500,jsonBody:{ok:false,error:"تعذر تنفيذ عملية النتائج حاليًا."}}}
}
app.http("assignmentResults",{methods:["GET","POST"],authLevel:"anonymous",route:"assignment-results",handler:withObservability("assignment-results",handler)});
module.exports={handler};
