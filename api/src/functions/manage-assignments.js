
const {app}=require("@azure/functions"),crypto=require("crypto");
const {withObservability}=require("../lib/observability");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull,uploadJson,listJson,listBlobNames,deleteBlob,mutateJsonWithRetry,StorageConflictError}=require("../lib/platform-storage");
const {recordAuditEvent}=require("../lib/audit-log");
const {examOfficialStats}=require("../lib/exam-structure");
const {normalizeAssignmentStatus,applyAssignmentArchive,applyAssignmentRestore}=require("../lib/assignment-lifecycle");
const {normalizeClassStatus}=require("../lib/class-lifecycle");
const {activeAttemptOf,attemptPolicyOf,ATTEMPT_POLICIES}=require("../lib/assignment-availability");
const {withAssignmentLock,AssignmentLockBusyError}=require("../lib/assignment-lock");
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
function summary(a){return {assignmentId:a.assignmentId,classId:a.classId,className:a.className,title:a.title,instructions:a.instructions,status:a.status,openAt:a.openAt||"",dueAt:a.dueAt||"",sourceExamId:a.sourceExamId||"",sourceExamTitle:a.sourceExamTitle||"",questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),maxAttempts:Math.max(1,Number(a.maxAttempts||1)),durationMinutes:Number(a.durationMinutes||0),attemptModelVersion:Number(a.attemptModelVersion||0),attemptPolicy:attemptPolicyOf(a),archivedAt:String(a.archivedAt||""),archivedBy:String(a.archivedBy||""),archivedFromStatus:String(a.archivedFromStatus||""),archiveReason:String(a.archiveReason||""),createdAt:a.createdAt||"",updatedAt:a.updatedAt||""}}
// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the
// real implementations are used). It does not change runtime behavior.
async function handler(request,deps={},obs=null){
 const authFn=deps.requireBuilderAuth||requireBuilderAuth,getC=deps.getContainer||getContainer,dl=deps.downloadJsonOrNull||downloadJsonOrNull,up=deps.uploadJson||uploadJson,ls=deps.listJson||listJson,lbn=deps.listBlobNames||listBlobNames,db=deps.deleteBlob||deleteBlob,mut=deps.mutateJsonWithRetry||mutateJsonWithRetry,rec=deps.recordAuditEvent||recordAuditEvent,wl=deps.withAssignmentLock||withAssignmentLock;
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
   // Phase 7A — the teacher's explicit attempt policy (طريقة المحاولة). Omitted → "continuous" (today's behaviour);
   // anything else that is not one of the three values is a client error and is REJECTED (never silently coerced).
   const policyRaw=b.attemptPolicy===undefined||b.attemptPolicy===null||b.attemptPolicy===""?"continuous":b.attemptPolicy;
   if(!ATTEMPT_POLICIES.includes(policyRaw))return {status:400,jsonBody:{ok:false,error:"طريقة المحاولة غير صالحة."}};
   const attemptPolicy=policyRaw;
   const classroom=await dl(c,CLASS_PREFIX+classId+".json");if(!classroom||normalizeClassStatus(classroom)==="archived")return {status:400,jsonBody:{ok:false,error:"الصف غير موجود أو مؤرشف."}};
   const openAt=iso(b.openAt),dueAt=iso(b.dueAt);if(openAt&&dueAt&&new Date(dueAt)<new Date(openAt))return {status:400,jsonBody:{ok:false,error:"موعد التسليم يجب أن يكون بعد موعد الفتح."}};
   const now=new Date().toISOString(),assignmentId=crypto.randomUUID(),maxAttempts=Math.min(10,Math.max(1,Number(b.maxAttempts||1)));
   // attemptModelVersion:2 (B2A) marks this assignment as using the UNIFIED attempt lifecycle: even an
   // UNTIMED assignment now requires an explicit server startAttempt (opening != starting). Assignments
   // created before B2A lack this flag and are treated as LEGACY (version 0) — there is NO bulk migration
   // and those documents keep their exact historical untimed behavior.
   // Phase 7A: strict / pausable attempts need the per-attempt epoch → attemptModelVersion 3. A continuous assignment
   // stays on model 2, i.e. EXACTLY the pre-7A lifecycle. The policy is persisted on the document and never changed
   // afterwards (there is no edit action — historical assignments keep theirs).
   const a={schemaVersion:2,attemptModelVersion:attemptPolicy==="continuous"?2:3,attemptPolicy,assignmentId,classId,className:String(classroom.name||""),title,instructions,status:b.publish===true?"published":"draft",openAt,dueAt,maxAttempts,durationMinutes:dur.value,sourceExamId:String(exam.examId||""),sourceExamTitle:String(exam.title||title),questionCount:stats.questionCount,totalMarks:stats.totalMarks,examSnapshot:exam,createdBy:String(auth.user?.sub||"teacher"),createdAt:now,updatedAt:now};
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
    updated=await mut(c,name,async current=>{
     if(!current){const err=new Error("الواجب غير موجود.");err.httpStatus=404;throw err}
     // An archived assignment must be restored before any status/attempt change (never bypass restore).
     if(normalizeAssignmentStatus(current)==="archived"){const err=new Error(action==="setstatus"?"الواجب مؤرشف. استعد الواجب أولًا.":"الواجب مؤرشف. استعده أولًا قبل تعديل عدد المحاولات.");err.httpStatus=409;throw err}
     // Roadmap #20 class-lifecycle gate: PUBLISHING is new active school work, so it must target an ACTIVE
     // class. Re-read the class inside the mutation (authoritative) and reject if archived. Unpublishing
     // (published->draft) and maxAttempts are historical/administrative and are NOT class-gated here.
     if(action==="setstatus"&&nextStatus==="published"){
      const cls=await dl(c,CLASS_PREFIX+String(current.classId||"")+".json");
      if(!cls||normalizeClassStatus(cls)==="archived"){const err=new Error("صف الواجب مؤرشف — لا يمكن نشر واجب جديد له. فعّل الصف أولًا.");err.httpStatus=409;throw err}
     }
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

  // ── updateTiming (Phase 5A) — class-wide TIME AVAILABILITY edit: move the submission dueAt (primarily an
  // EXTENSION of an expired/near assignment) and optionally the default per-attempt durationMinutes. It
  // changes ONLY timing on the assignment blob — never status, maxAttempts, examSnapshot, submissions,
  // attempts, drafts, grades or results — so the server-authoritative attempt lifecycle stays the sole
  // authority: an extension reopens the assignment for students who still have attempts left and gives an
  // EXHAUSTED student nothing. Assignment-blob-only, so it uses plain ETag CAS (like setmaxattempts) and
  // does NOT take the per-assignment lifecycle lock — unrelated students are never serialized. Changing the
  // default duration affects only FUTURE attempts: an already-started attempt keeps its stored
  // startedAt/endsAt/extendedEndsAt (timerState never recomputes a live attempt from the new duration). ──
  if(action==="updatetiming"){
   const id=String(b.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
   // New class-wide submission deadline. Must be a valid timestamp and in the FUTURE (this is an extension).
   let newDueAt;try{newDueAt=iso(b.dueAt)}catch{return {status:400,jsonBody:{ok:false,error:"صيغة موعد التسليم غير صحيحة."}}}
   if(!newDueAt)return {status:400,jsonBody:{ok:false,error:"موعد التسليم الجديد مطلوب."}};
   const newDueMs=new Date(newDueAt).getTime();
   if(!(newDueMs>Date.now()))return {status:400,jsonBody:{ok:false,error:"يجب أن يكون موعد التسليم الجديد في المستقبل."}};
   // Optional duration edit — the SAME validator as create (integer 1..1440, or 0/"" untimed). When the key
   // is omitted entirely the stored duration is left unchanged.
   const durationProvided=b.durationMinutes!==undefined;
   let durValue=0;
   if(durationProvided){const dur=parseDurationMinutes(b.durationMinutes);if(!dur.ok)return {status:400,jsonBody:{ok:false,error:"مدة المحاولة يجب أن تكون رقمًا صحيحًا بين 1 و1440 دقيقة، أو بدون مؤقت."}};durValue=dur.value;}
   let prevDueAt="",prevDuration=0,newDuration=0,auditTitle="";
   let updated=null;
   try{
    updated=await mut(c,PREFIX+id+".json",current=>{
     if(!current){const err=new Error("الواجب غير موجود.");err.httpStatus=404;throw err}
     // An archived assignment must be restored before any timing change (never bypass restore).
     if(normalizeAssignmentStatus(current)==="archived"){const err=new Error("الواجب مؤرشف. استعده أولًا قبل تعديل الوقت والموعد.");err.httpStatus=409;throw err}
     // Extension-only guard (authoritative, read under CAS): never silently SHORTEN an existing deadline.
     // Equal is allowed (e.g. a duration-only edit that keeps the same deadline); strictly earlier is rejected.
     const curDueMs=(()=>{const t=new Date(String(current.dueAt||"")).getTime();return Number.isFinite(t)?t:0})();
     if(curDueMs&&newDueMs<curDueMs){const err=new Error("لا يمكن تقليص موعد التسليم. أدخل موعدًا لاحقًا لتمديد الواجب.");err.httpStatus=400;throw err}
     prevDueAt=String(current.dueAt||"");prevDuration=Number(current.durationMinutes||0);auditTitle=String(current.title||"");
     current.dueAt=newDueAt;
     if(durationProvided)current.durationMinutes=durValue;
     newDuration=Number(current.durationMinutes||0);
     current.updatedAt=new Date().toISOString();
     return current;   // status / maxAttempts / examSnapshot / submissions / attempts intentionally untouched
    });
   }catch(e){
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
    throw e;
   }
   // Safe audit metadata only — timing values, never student/exam content. Emitted once on success.
   await rec(c,{actor:auth.user?.sub,action:"assignment.updateTiming",targetType:"assignment",targetId:id,targetLabel:auditTitle,details:{assignmentId:id,previousDueAt:prevDueAt,newDueAt,previousDurationMinutes:prevDuration,newDurationMinutes:newDuration}});
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
  // active attempts, requires an explicit confirmActiveAttempts. The ENTIRE impact scan + commit runs under
  // the per-assignment lifecycle lock, so no student state-write (startAttempt / first submission / lazy
  // active attempt) can interleave between the scan and the commit: a newly-started attempt is either
  // observed here (=> 409 requiresConfirmation) or is blocked by the committed archived state. ──
  if(action==="archive"||action==="delete"){
   const id=String(b.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
   const legacyDelete=action==="delete";
   let auditImpact=null,auditTitle="";
   try{
    const out=await wl(c,id,async()=>{
     const a=await dl(c,PREFIX+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
     auditTitle=a.title||"";
     if(normalizeAssignmentStatus(a)==="archived")return {status:200,jsonBody:{ok:true,archived:true,alreadyArchived:true,...(legacyDelete?{legacyDeleteRedirected:true}:{}),assignment:summary(a)}};
     // Authoritative impact scan, serialized by the lock (no student write can appear between here and the
     // commit below). computeImpact reads the live submission set.
     const names=await lbn(c,SUB_PREFIX+id+"/"),subs=await ls(c,SUB_PREFIX+id+"/"),impact=computeImpact(a,names.length,subs);
     if(impact.activeAttempts>0&&b.confirmActiveAttempts!==true){
      return {status:409,jsonBody:{ok:false,requiresConfirmation:true,impact,error:"يوجد طلاب في محاولات نشطة. تأكيد الأرشفة سيمنعهم من المتابعة حتى تتم الاستعادة، ولن تُحذف إجاباتهم أو محاولاتهم."}};
     }
     // ETag CAS on the assignment blob keeps this correct against the lock-free setstatus/setmaxattempts
     // (which mutate the same blob without the lifecycle lock).
     const updated=await mut(c,PREFIX+id+".json",current=>{
      if(!current){const err=new Error("الواجب غير موجود.");err.httpStatus=404;throw err}
      if(normalizeAssignmentStatus(current)==="archived")return current;
      return applyAssignmentArchive(current,{actor:auth.user?.sub,now:new Date().toISOString(),reason:"manual"});
     });
     auditImpact=impact;
     return {status:200,jsonBody:{ok:true,archived:true,...(legacyDelete?{legacyDeleteRedirected:true}:{}),assignment:summary(updated)}};
    });
    if(auditImpact){await rec(c,{actor:auth.user?.sub,action:"assignment.archive",targetType:"assignment",targetId:id,targetLabel:auditTitle,details:{previousStatus:auditImpact.status,activeAttempts:auditImpact.activeAttempts,submissionDocuments:auditImpact.submissionDocuments,requestedAction:action}});}
    // Safe technical lifecycle outcome: action + assignmentId + status only — never submission content.
    if(out&&out.status>=400)obs?.logWarn((out.status===409||out.status===503)?"assignment.lifecycle.conflict":"assignment.lifecycle.failed",{action,assignmentId:id,status:out.status,retryable:out.status===503});
    else obs?.logInfo("assignment.lifecycle.completed",{action,assignmentId:id});
    return out;
   }catch(e){
    if(e instanceof AssignmentLockBusyError||e instanceof StorageConflictError)obs?.logWarn("assignment.lifecycle.conflict",{action,assignmentId:id,retryable:true});
    else obs?.logWarn("assignment.lifecycle.failed",{action,assignmentId:id,errorClass:e?.httpStatus?undefined:"internal_error"});
    if(e instanceof AssignmentLockBusyError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
    throw e;
   }
  }

  // ── restore — bring an archived assignment back to its prior draft/published state (legacy => draft).
  // Preserves all submissions/results/active attempts; never restarts a timer (timerState re-derives). ──
  if(action==="restore"){
   const id=String(b.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
   // Under the lifecycle lock so restore is serialized against archive/purge on the same assignment.
   let restoredStatus=null,auditTitle="";
   try{
    const out=await wl(c,id,async()=>{
     const a=await dl(c,PREFIX+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
     auditTitle=a.title||"";
     if(normalizeAssignmentStatus(a)!=="archived")return {status:409,jsonBody:{ok:false,error:"الواجب غير مؤرشف."}};
     const updated=await mut(c,PREFIX+id+".json",current=>{
      if(!current){const err=new Error("الواجب غير موجود.");err.httpStatus=404;throw err}
      if(normalizeAssignmentStatus(current)!=="archived"){const err=new Error("الواجب غير مؤرشف.");err.httpStatus=409;throw err}
      const next=applyAssignmentRestore(current,{now:new Date().toISOString()});restoredStatus=next.status;return next;
     });
     return {status:200,jsonBody:{ok:true,restored:true,assignment:summary(updated)}};
    });
    if(restoredStatus)await rec(c,{actor:auth.user?.sub,action:"assignment.restore",targetType:"assignment",targetId:id,targetLabel:auditTitle,details:{restoredStatus}});
    // Safe technical lifecycle outcome: action + assignmentId + status only — never submission content.
    if(out&&out.status>=400)obs?.logWarn((out.status===409||out.status===503)?"assignment.lifecycle.conflict":"assignment.lifecycle.failed",{action,assignmentId:id,status:out.status,retryable:out.status===503});
    else obs?.logInfo("assignment.lifecycle.completed",{action,assignmentId:id});
    return out;
   }catch(e){
    if(e instanceof AssignmentLockBusyError||e instanceof StorageConflictError)obs?.logWarn("assignment.lifecycle.conflict",{action,assignmentId:id,retryable:true});
    else obs?.logWarn("assignment.lifecycle.failed",{action,assignmentId:id,errorClass:e?.httpStatus?undefined:"internal_error"});
    if(e instanceof AssignmentLockBusyError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
    throw e;
   }
  }

  // ── purge — the ONLY physical deletion path (Roadmap #7). Allowed ONLY for an archived assignment with
  // ZERO submission history and an exact id+title confirmation; re-checks history immediately before the
  // delete so a submission created after the impact check aborts it. NO cascade — history always wins. ──
  if(action==="purge"){
   const id=String(b.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
   // The ENTIRE verify → final-list → delete sequence runs under the per-assignment lifecycle lock. Because
   // a state-CREATING student write also takes this lock (and re-reads the assignment under it), it is
   // impossible for an in-flight first submission to commit inside this window: either it created its blob
   // BEFORE the purge acquired the lock (=> the final list sees it => 409 blockedByHistory, nothing deleted)
   // or it runs AFTER the delete (=> its under-lock assignment re-read is gone/archived => 403, no orphan).
   // Ordering inside the lock: (1) fresh-read assignment, (2) verify archived, (3) verify confirmation
   // against the FRESH doc, (4) FINAL submission list, (5) delete. Nothing reads between the final list and
   // the delete.
   let purgedTitle=null;
   try{
    const out=await wl(c,id,async()=>{
     const a=await dl(c,PREFIX+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
     if(normalizeAssignmentStatus(a)!=="archived")return {status:409,jsonBody:{ok:false,error:"لا يمكن الحذف النهائي إلا لواجب مؤرشف. أرشفه أولًا."}};
     if(String(b.confirmAssignmentId||"")!==String(a.assignmentId||"")||String(b.confirmTitle||"")!==String(a.title||"")){
      return {status:400,jsonBody:{ok:false,error:"تأكيد الحذف النهائي غير مطابق."}};
     }
     const names=await lbn(c,SUB_PREFIX+id+"/");   // FINAL check — closest operation to the physical delete
     if(names.length>0){
      const subs=await ls(c,SUB_PREFIX+id+"/");
      return {status:409,jsonBody:{ok:false,blockedByHistory:true,impact:computeImpact(a,names.length,subs),error:"لا يمكن حذف الواجب نهائيًا لأن له بيانات طلاب محفوظة. اتركه مؤرشفًا للحفاظ على السجل."}};
     }
     await db(c,PREFIX+id+".json");
     purgedTitle=a.title||"";
     return {status:200,jsonBody:{ok:true,purged:true,assignmentId:id}};
    });
    if(purgedTitle!==null)await rec(c,{actor:auth.user?.sub,action:"assignment.purge",targetType:"assignment",targetId:id,targetLabel:purgedTitle,details:{submissionDocuments:0,previousStatus:"archived"}});
    // Safe technical lifecycle outcome: action + assignmentId + status only — never submission content.
    if(out&&out.status>=400)obs?.logWarn((out.status===409||out.status===503)?"assignment.lifecycle.conflict":"assignment.lifecycle.failed",{action,assignmentId:id,status:out.status,retryable:out.status===503});
    else obs?.logInfo("assignment.lifecycle.completed",{action,assignmentId:id});
    return out;
   }catch(e){
    if(e instanceof AssignmentLockBusyError||e instanceof StorageConflictError)obs?.logWarn("assignment.lifecycle.conflict",{action,assignmentId:id,retryable:true});
    else obs?.logWarn("assignment.lifecycle.failed",{action,assignmentId:id,errorClass:e?.httpStatus?undefined:"internal_error"});
    if(e instanceof AssignmentLockBusyError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
    throw e;
   }
  }

  return {status:400,jsonBody:{ok:false,error:"Unsupported assignment action."}};
 }catch(e){obs?.logError("assignment.manage.error",e);return {status:500,jsonBody:{ok:false,error:"تعذر تنفيذ إجراء الواجب حاليًا."}}}
}
app.http("manageAssignments",{methods:["GET","POST"],authLevel:"anonymous",route:"assignments",handler:withObservability("assignments",handler)});
module.exports={handler,summary};
