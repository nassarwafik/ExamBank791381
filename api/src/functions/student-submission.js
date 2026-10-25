
const {app}=require("@azure/functions");
const {normalizeDraftAnswers}=require("../lib/draft-answers");
const {withObservability}=require("../lib/observability");
const {requireActiveStudentSession}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull,mutateJsonWithRetry,StorageConflictError}=require("../lib/platform-storage");
const {gradeExam,parametricGenerationContext}=require("../lib/assignment-grading");
const {syncAssessmentMedal}=require("../lib/achievement-feed");
const {normalizeClassStatus}=require("../lib/class-lifecycle");
const {timerState,startRejection,writeRejection,normalizeDurationMinutes,attemptDurationMinutes,activeAttemptOf,normalizeEndReason,attemptModelVersion,attemptPolicyOf,attemptEpochOf,pauseRejection,resumeRejection,toMs}=require("../lib/assignment-availability");
const {deriveGradingStatus}=require("../lib/grading-status");
const {releaseInfo,withholdResult}=require("../lib/results-release");
const {withAssignmentLock,AssignmentLockBusyError}=require("../lib/assignment-lock");
// Phase 17C — official hidden-test coding grading: the durable intent is planned INSIDE each completed-attempt CAS; the runner
// is reached only AFTER the commit (dispatchPlannedGrading never fails the submission; an outage is never a zero).
const {planCodingGrading,dispatchPlannedGrading,legacyAutoGradingWithhold,studentCodingGradingStatus}=require("../lib/coding/official-grading");
// Phase 21E.3 — a question the student's device could NOT display (an unrecoverable renderer failure) is reported by the client and
// VERIFIED here: only an unanswered question of the published exam is held for the teacher (score 0 / manualReview, pendingReview) —
// never an automatic zero, never a raised score. The report rides with the draft so the timeout / strict-exit paths honour it too.
const {normalizeRenderFailures,draftRenderFailuresPatch,applyRenderFailureHolds,technicalHoldsField}=require("../lib/render-failures");
const AP="platform/assignments/",SP="platform/submissions/";
const CONFLICT_MESSAGE="حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
// QA-8 — the same attempt open on two devices (or two tabs). Every write of the server draft (saveDraft, pause with answers)
// advances `draftRevision`, and the state carries it. A client that sends `expectedDraftRevision` asserts the draft it composed
// its whole-draft snapshot from: when another device has saved since, the write is refused (409 DRAFT_STALE, nothing written)
// instead of silently replacing the newer answers, and the client merges per question and saves again. A submit asserts it
// too, so a stale device never grades its older copy. A request WITHOUT the field (a bundle cached from before QA-8) is
// accepted exactly as before; a malformed value fails closed.
const DRAFT_STALE_MESSAGE="حُفظت إجابات أحدث لهذه المحاولة من جهاز أو نافذة أخرى. حدّث الصفحة لتحميلها قبل المتابعة.";
const draftRevisionOf=doc=>{const n=Number(doc&&doc.draftRevision);return Number.isInteger(n)&&n>=0?n:0};
const draftStale=(doc,b)=>{const n=b?b.expectedDraftRevision:undefined;if(n===undefined||n===null)return false;return !(Number.isInteger(n)&&n>=0)||n!==draftRevisionOf(doc)};
const draftStaleError=()=>{const err=new Error(DRAFT_STALE_MESSAGE);err.httpStatus=409;err.code="DRAFT_STALE";return err};
const failureBody=e=>({ok:false,error:e.message,...(e.code?{code:e.code}:{})});
// A completed attempt's public shape. timedOut/startedAt/endsAt/endedAt/endReason are additive audit
// fields; they are "" / false / normalized for legacy/untimed attempts (backward compatible). endReason
// is normalized from a legacy attempt's timedOut flag when the explicit field is absent (never mutates
// stored data — normalization is read-time only).
// Phase 17E-C: autoGradingStatus is the ONE student-safe aggregate of the official coding grading (omitted when not applicable);
// autoGradingPending is kept for older clients as a SCORE-WITHHOLD compatibility bit (17F-C2 RF1): true while automatic grading
// is open OR a compile error awaits the teacher (a pre-C2 client knows no "reviewRequired" word and must still withhold the mark).
// Neither ever carries a job id, revision, technical code or evidence.
function codingStatusField(x){const c=studentCodingGradingStatus(x);return c?{autoGradingStatus:c}:{}}
// Phase 21G.5 (D2) — the ONE student projection of a result, gated by the assignment's results release: before release every
// mark-bearing field is withheld here, on the server (the client only learns resultsVisible:false and when, if known).
function pub(x,a,nowMs=Date.now()){const out={attemptNumber:x.attemptNumber,submittedAt:x.submittedAt,score:x.score,totalMarks:x.totalMarks,percentage:x.percentage,manualReviewMarks:x.manualReviewMarks,finalized:x.finalized,gradingStatus:deriveGradingStatus(x),teacherFeedback:String(x.teacherFeedback||""),timedOut:!!x.timedOut,startedAt:String(x.startedAt||""),endsAt:String(x.endsAt||""),extendedEndsAt:String(x.extendedEndsAt||""),endedAt:String(x.endedAt||""),endReason:normalizeEndReason(x),...(x.pauseCount!==undefined?{pauseCount:Math.max(0,Number(x.pauseCount)||0)}:{}),...(legacyAutoGradingWithhold(x)?{autoGradingPending:true}:{}),...codingStatusField(x),...technicalHoldsField(x)};const rel=releaseInfo(a,nowMs);return rel.resultsVisible?{...out,resultsVisible:true}:{...withholdResult(out),...rel}}
// Unified state from the shared timer/availability helper, so this endpoint agrees with the
// dashboard/assignment endpoints. `canAttempt` keeps its historical (untimed) meaning; `canWrite`
// (save/submit gate) and `canStartAttempt` (timed start gate) are explicit and separate. serverNow +
// effectiveAttemptEndsAt let the client run a server-anchored countdown without trusting the device clock.
function state(a,s,nowMs=Date.now()){
 const ts=timerState(a,s,nowMs),attempts=Array.isArray(s?.attempts)?s.attempts:[],latest=attempts.length?attempts[attempts.length-1]:null;
 return {attemptsUsed:ts.attemptsUsed,allowedAttempts:ts.allowedAttempts,canAttempt:ts.canAttempt,dueClosed:ts.isClosed,availability:ts.availability,openAt:ts.openAt,effectiveDueAt:ts.effectiveDueAt,
  durationMinutes:ts.durationMinutes,timed:ts.timed,attemptModelVersion:ts.attemptModelVersion,attemptPolicy:ts.attemptPolicy,requiresStart:ts.requiresStart,attemptStatus:ts.attemptStatus,serverNow:new Date(nowMs).toISOString(),activeAttempt:ts.activeAttempt,effectiveAttemptEndsAt:ts.effectiveAttemptEndsAt,attemptExpired:ts.attemptExpired,canStartAttempt:ts.canStartAttempt,canWrite:ts.canWrite,
  draftAnswers:s?.draftAnswers||{},draftSavedAt:s?.draftSavedAt||"",draftRevision:draftRevisionOf(s),latestResult:latest?pub(latest,a,nowMs):null,attempts:attempts.map(x=>pub(x,a,nowMs))}}
function defaultSubmission(id,student){return {schemaVersion:1,assignmentId:id,studentId:student.userId,classId:student.classId,studentCode:student.code,studentName:student.displayName,allowedAttempts:null,draftAnswers:{},attempts:[],activeAttempt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
// Roadmap #10/#11 stale-attempt guard. For a MODERN attempt (timed OR attemptModelVersion>=2) a write MUST
// carry the identity (attemptNumber + startedAt) of the attempt it was composed under — this FAILS CLOSED:
// missing/empty/malformed identity, or identity that does not match the AUTHORITATIVE live active attempt
// (another tab started attempt N+1, or the old one finished), is rejected with 409 and writes NOTHING
// (draftAnswers/attempt untouched, NO grading). Legacy untimed attempts lazily create the active attempt and
// do not assert identity, so the guard is skipped for them (documented compatibility limit). startAttempt is
// exempt (a new attempt has no prior identity to assert).
// QA2-6 — a running attempt keeps its own timing (QA-3): a legacy model-0 TIMED attempt stays timed (and identity-checked) after the teacher
// sets the assignment to untimed. Reading only the assignment's CURRENT duration skipped the identity check there, so a stale tab's submit
// for the previous attempt landed on the running one as a new 0 that used up an attempt.
function isModernAttempt(a,doc){return normalizeDurationMinutes(a&&a.durationMinutes)>0||attemptModelVersion(a)>=2||(!!doc&&attemptDurationMinutes(a,doc)>0)}
function attemptIdentityOk(doc,b){
 const en=b&&b.expectedAttemptNumber,es=b&&b.expectedStartedAt;
 // STRICT (fail closed): expectedAttemptNumber must be a real integer >= 1 (reject boolean like true→1, the
 // string "1", 1.5, 0, negatives, null, missing) and expectedStartedAt must be a non-empty string. The real
 // client always sends a numeric attemptNumber and a string startedAt, so valid traffic is unaffected.
 if(typeof en!=="number"||!Number.isInteger(en)||en<1)return false;
 if(typeof es!=="string"||es==="")return false;
 const act=doc&&doc.activeAttempt;
 if(!act)return false;                                                           // asserted attempt no longer exists
 return Number(act.attemptNumber)===en&&String(act.startedAt||"")===es;
}
// Phase 7A — model-3 EPOCH guard, IN ADDITION to the identity above: a write must also assert the attempt epoch it was
// composed under (expectedAttemptEpoch). An autosave sent before a pause keeps the same attemptNumber/startedAt as the
// resumed attempt; only the epoch tells them apart. Strict integer >= 1, fail closed. Model < 3 is never checked.
function attemptEpochOk(a,doc,b){
 if(attemptModelVersion(a)<3)return true;
 const ee=b&&b.expectedAttemptEpoch;
 if(typeof ee!=="number"||!Number.isInteger(ee)||ee<1)return false;
 const act=doc&&doc.activeAttempt;
 return !!act&&attemptEpochOf(act)===ee;
}
// The epoch a lifecycle request was composed under (validated), or 0 when missing/malformed.
function expectedEpoch(b){const ee=b&&b.expectedAttemptEpoch;return typeof ee==="number"&&Number.isInteger(ee)&&ee>=1?ee:0}
// Phase 7A audit on a completed model-3 attempt: how many times it was paused (additive; never on older models).
function modelThreeAudit(a,active){return attemptModelVersion(a)>=3?{pauseCount:Math.max(0,Number(active&&active.pauseCount)||0)}:{}}
// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used). It does not change runtime behavior.
async function handler(request,deps={},obs=null){
 const ras=deps.requireActiveStudentSession||requireActiveStudentSession,dl=deps.downloadJsonOrNull||downloadJsonOrNull,mut=deps.mutateJsonWithRetry||mutateJsonWithRetry,gradeFn=deps.gradeExam||gradeExam,recFn=deps.recordAchievementIfEligible||syncAssessmentMedal,wl=deps.withAssignmentLock||withAssignmentLock;
 try{const id=String(request.params?.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};const sess=await ras(request,deps);if(!sess.ok)return sess.response;const c=sess.container,student=sess.student;
  const classroom=student.classId?await dl(c,"platform/classes/"+student.classId+".json"):null;
  if(classroom&&normalizeClassStatus(classroom)==="archived")return {status:403,jsonBody:{ok:false,error:"هذا الصف مؤرشف وانتهت السنة الدراسية."}};
  // QA-18 — membership needs a REAL class on both sides: a student and an assignment that BOTH lack a classId never match.
  const a=await dl(c,AP+id+".json");if(!a||!a.classId||!student.classId||String(a.classId)!==String(student.classId))return {status:404,jsonBody:{ok:false,error:"الواجب غير متاح."}};const name=SP+id+"/"+student.userId+".json";
  const s=await dl(c,name);
  // QA-17 — an assignment that is not published is only readable as the student's OWN history (an existing submission of an
  // archived task); otherwise its timing (due date, duration) never reaches a student who merely knows its id.
  if(request.method==="GET"){if(a.status!=="published"&&!s)return {status:404,jsonBody:{ok:false,error:"الواجب غير متاح."}};return {status:200,jsonBody:{ok:true,state:state(a,s||defaultSubmission(id,student))}}}
  // Roadmap #7: ALL student write mutations (startAttempt/saveDraft/submit/finalizeTimedOutAttempt) require
  // a PUBLISHED assignment. A draft or archived assignment blocks every mutation BEFORE any grading/write.
  // The GET above stays readable so a student can still review a historical submission of an archived task.
  if(a.status!=="published")return {status:403,jsonBody:{ok:false,error:"الواجب غير متاح حاليًا."}};
  let b={};try{b=await request.json()}catch{}const action=String(b.action||"saveDraft");
  // Concurrency (Roadmap #7): a student write that could CREATE new submission state — start a new active
  // attempt, create the FIRST submission document, or lazily create an active attempt — must be serialized
  // against assignment archive/purge via the per-assignment lifecycle lock. startAttempt always creates an
  // attempt. `stateCreating` catches the writes that are ALREADY state-creating at request-start (no
  // submission document yet, or no live active attempt).
  //
  // LEGACY UNTIMED (attemptModelVersion < 2, durationMinutes 0) needs MORE: saveDraft/submit may legally
  // run without an explicit startAttempt and LAZILY establish the next active attempt. The request-start
  // snapshot `s` can show active attempt #1, so stateCreating is false and the lock would be skipped — but
  // a concurrent submit can finish #1 and clear it, and this write then lazily creates attempt #2 with no
  // lifecycle serialization (an archive could scan zero active attempts in between). So for legacy untimed
  // assignments, saveDraft and submit ALWAYS take the lock regardless of the stale snapshot.
  //
  // Modern v2 (timed or untimed) keeps the hot path: an ORDINARY write on an already-live active attempt
  // stays lock-free — that attempt was itself created under the lock (v2 requires an explicit startAttempt),
  // so any archive necessarily observes it, and the write's own in-mutation "published" re-read already
  // blocks a write to an archived assignment. It can neither create an orphan nor hide a new attempt.
  const stateCreating=!s||!activeAttemptOf(s);
  const legacyUntimed=normalizeDurationMinutes(a.durationMinutes)===0&&attemptModelVersion(a)<2;
  const needLock=action==="startAttempt"||stateCreating||(legacyUntimed&&(action==="saveDraft"||action==="submit"));
  const maybeLock=fn=>needLock?wl(c,id,fn):fn();

  // ── startAttempt — server stamps startedAt (+ endsAt for TIMED). Works for TIMED and UNTIMED v2
  // assignments (startRejection gates which). IDEMPOTENT: a live active attempt is returned unchanged
  // (double-click / refresh / retry never restart the timer or re-stamp startedAt). ──
  if(action==="startAttempt"){
   const rej=startRejection(a,s,Date.now());
   if(rej)return {status:rej.status,jsonBody:{ok:false,error:rej.error}};
   const durMinutes=normalizeDurationMinutes(a.durationMinutes),timed=durMinutes>0,durationMs=durMinutes*60000;
   let resultState=null,created=null;
   // QA2-8 — the class archive and this start write DIFFERENT documents, so neither CAS sees the other: the archive's pending-work check
   // could pass just before this attempt was written, leaving an open attempt in an archived class (the student locked out of it, the
   // teacher's day blind to it). Each side now writes, then reads the other's state: the archive re-checks pending work after it commits
   // (manage-classrooms), and a start re-reads the class after it commits and withdraws the attempt it just created if the class was
   // archived meanwhile. At least one side always sees the other.
   const classArchivedNow=async()=>{if(!student.classId)return false;const cls=await dl(c,"platform/classes/"+student.classId+".json");return !!cls&&normalizeClassStatus(cls)==="archived"};
   const archivedError=()=>{const err=new Error("هذا الصف مؤرشف وانتهت السنة الدراسية.");err.httpStatus=403;return err};
   try{
    await maybeLock(()=>mut(c,name,async current=>{
     // Roadmap #7 race guard: re-read the assignment from storage inside the mutation and require
     // "published" before committing ANY write, in case it was archived after this request loaded it.
     const fa=await dl(c,AP+id+".json");if(!fa||fa.status!=="published"){const err=new Error("الواجب غير متاح حاليًا.");err.httpStatus=403;throw err}
     if(await classArchivedNow())throw archivedError();   // QA2-8: an archive that landed after this request loaded the class
     const doc=current||defaultSubmission(id,student);
     const rj=startRejection(a,doc,Date.now()); // re-check under the lock (race backstop)
     if(rj){const err=new Error(rj.error);err.httpStatus=rj.status;throw err}
     const existing=activeAttemptOf(doc);
     if(existing){resultState=state(a,doc,Date.now());return doc} // idempotent — never restart
     const startMs=Date.now(),attemptNumber=(Array.isArray(doc.attempts)?doc.attempts.length:0)+1;
     // UNTIMED v2: endsAt "" (no deadline). TIMED: endsAt = startedAt + durationMinutes (server time only).
     // QA-3: the attempt keeps the duration it started with (durationMinutes, 0 = untimed) — a later setting change is for new attempts.
     doc.activeAttempt={attemptNumber,startedAt:new Date(startMs).toISOString(),endsAt:timed?new Date(startMs+durationMs).toISOString():"",durationMinutes:durMinutes,status:"started"};
     created={attemptNumber,startedAt:doc.activeAttempt.startedAt};
     // Phase 7A: a model-3 attempt starts at epoch 1 (pause/resume advance it) with no pauses yet.
     if(attemptModelVersion(a)>=3){doc.activeAttempt.attemptEpoch=1;doc.activeAttempt.pauseCount=0}
     doc.updatedAt=new Date(startMs).toISOString();
     resultState=state(a,doc,startMs);
     return doc;
    }));
   }catch(e){
    // Safe technical failure event: action + assignmentId + retryability only — NEVER answers/identity/content.
    obs?.logWarn("student.submission.failed",{action,assignmentId:id,retryable:(e instanceof AssignmentLockBusyError||e instanceof StorageConflictError),errorClass:(e instanceof AssignmentLockBusyError||e instanceof StorageConflictError)?"conflict":(e?.httpStatus?undefined:"internal_error")});
    if(e instanceof AssignmentLockBusyError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:failureBody(e)};
    throw e;
   }
   if(created&&await classArchivedNow()){
    // QA2-8: withdraw ONLY the attempt this request created, untouched (nothing saved into it yet); anything else stays as it is.
    await mut(c,name,async current=>{const act=current&&activeAttemptOf(current);if(act&&act.attemptNumber===created.attemptNumber&&String(act.startedAt)===created.startedAt&&!act.lastSavedAt){current.activeAttempt=null;current.updatedAt=new Date().toISOString()}return current});
    return {status:403,jsonBody:{ok:false,error:archivedError().message}};
   }
   obs?.logInfo("student.submission.completed",{action:"startAttempt",assignmentId:id});
   return {status:200,jsonBody:{ok:true,state:resultState}};
  }

  if(action==="saveDraft"){
   const rej=writeRejection(a,s,"saveDraft",Date.now());
   if(rej)return {status:rej.status,jsonBody:{ok:false,error:rej.error}};
   const answers=normalizeDraftAnswers(b.answers&&typeof b.answers==="object"?b.answers:{},a.examSnapshot||null).answers; // Phase 16B-A — bounded simulation states; 17A — code answers bound to the published coding question
   const renderFailures=b.renderFailures===undefined?undefined:normalizeRenderFailures(b.renderFailures,a.examSnapshot||null);   // 21E.3 — absent: the stored record is left alone
   let savedAt="",finalState=null,savedRevision=0;
   try{
    await maybeLock(()=>mut(c,name,async current=>{
     // Roadmap #7 race guard: re-read the assignment from storage inside the mutation and require
     // "published" before committing ANY write, in case it was archived after this request loaded it.
     const fa=await dl(c,AP+id+".json");if(!fa||fa.status!=="published"){const err=new Error("الواجب غير متاح حاليًا.");err.httpStatus=403;throw err}
     const doc=current||defaultSubmission(id,student);
     if(isModernAttempt(a,doc)&&!attemptIdentityOk(doc,b)){const err=new Error("تم بدء محاولة جديدة لهذا الواجب. حدّث الصفحة.");err.httpStatus=409;throw err}
     if(!attemptEpochOk(a,doc,b)){const err=new Error("تغيّرت حالة المحاولة (حفظ مؤقت أو استئناف). حدّث الصفحة.");err.httpStatus=409;throw err}
     const ts=timerState(a,doc,Date.now());
     if(!ts.canWrite){const err=new Error(ts.activeAttempt&&ts.activeAttempt.status==="paused"?"المحاولة محفوظة مؤقتًا. تابع المحاولة أولًا.":ts.timed?(ts.attemptExpired?"انتهى وقت المحاولة.":"ابدأ المحاولة أولاً."):(ts.attemptModelVersion>=2&&!ts.activeAttempt?"ابدأ المحاولة أولاً.":"لا توجد محاولة متاحة للحفظ."));err.httpStatus=409;throw err}
     if(draftStale(doc,b))throw draftStaleError();                                   // QA-8: another device saved since this snapshot's base
     savedAt=new Date().toISOString();
     doc.draftAnswers=answers;doc.draftSavedAt=savedAt;doc.updatedAt=savedAt;doc.draftRevision=draftRevisionOf(doc)+1;savedRevision=doc.draftRevision;
     if(renderFailures!==undefined)draftRenderFailuresPatch(doc,renderFailures);
     // Lifecycle (B2A #10): a timed or untimed-v2 active attempt is marked "draft" and stamped with a
     // server lastSavedAt; the attemptNumber is never changed by a save.
     if(doc.activeAttempt&&doc.activeAttempt.startedAt){doc.activeAttempt.status="draft";doc.activeAttempt.lastSavedAt=savedAt}
     else if(!ts.timed){
      // Legacy untimed first meaningful write (#11): lazily establish a server startedAt for audit. This
      // never consumes an attempt and never blocks legacy writes (untimed-legacy canWrite ignores it).
      const attemptNumber=(Array.isArray(doc.attempts)?doc.attempts.length:0)+1;
      doc.activeAttempt={attemptNumber,startedAt:savedAt,endsAt:"",durationMinutes:0,status:"draft",lastSavedAt:savedAt};
     }
     finalState=state(a,doc,Date.now());
     return doc;
    }));
   }catch(e){
    // Safe technical failure event: action + assignmentId + retryability only — NEVER answers/identity/content.
    obs?.logWarn("student.submission.failed",{action,assignmentId:id,retryable:(e instanceof AssignmentLockBusyError||e instanceof StorageConflictError),errorClass:(e instanceof AssignmentLockBusyError||e instanceof StorageConflictError)?"conflict":(e?.httpStatus?undefined:"internal_error")});
    if(e instanceof AssignmentLockBusyError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:failureBody(e)};
    throw e;
   }
   return {status:200,jsonBody:{ok:true,savedAt,draftRevision:savedRevision,serverNow:new Date().toISOString(),effectiveAttemptEndsAt:finalState?finalState.effectiveAttemptEndsAt:""}};
  }

  if(action==="submit"){
   // QA-14 — a submit key (one per submit of one draft, re-sent unchanged when the student retries after a lost response): a
   // submit whose key is the one the latest completed attempt was recorded with is the SAME submit — its result is returned and
   // nothing is written. A legacy untimed assignment (no attempt identity) no longer turns a network retry into a second attempt.
   const submitKey=typeof b.submitKey==="string"&&/^[A-Za-z0-9_-]{8,64}$/.test(b.submitKey)?b.submitKey:"";
   const priorDone=s&&Array.isArray(s.attempts)&&s.attempts.length?s.attempts[s.attempts.length-1]:null;
   if(submitKey&&priorDone&&priorDone.submitKey===submitKey)return {status:200,jsonBody:{ok:true,result:pub(priorDone,a),state:state(a,s),replay:true}};
   const rej=writeRejection(a,s,"submit",Date.now());
   if(rej)return {status:rej.status,jsonBody:{ok:false,error:rej.error}};
   const answers=normalizeDraftAnswers(b.answers&&typeof b.answers==="object"?b.answers:{},a.examSnapshot||null).answers,now=new Date().toISOString(); // Phase 16B-A — bounded simulation states; 17A — code answers bound to the published coding question
   const submitFailures=b.renderFailures===undefined?null:normalizeRenderFailures(b.renderFailures,a.examSnapshot||null);   // 21E.3 — the submit's own report (the client's current knowledge) wins; absent ⇒ the draft record
   let resultAttempt=null,finalState=null,codingPlan=null,replayOf=null;   // replayOf: QA-14 — the same submit, decided under the CAS
   try{
    await maybeLock(()=>mut(c,name,async current=>{
     // Roadmap #7 race guard: re-read the assignment from storage inside the mutation and require
     // "published" before committing ANY write, in case it was archived after this request loaded it.
     const fa=await dl(c,AP+id+".json");if(!fa||fa.status!=="published"){const err=new Error("الواجب غير متاح حاليًا.");err.httpStatus=403;throw err}
     const doc=current||defaultSubmission(id,student);
     replayOf=null;
     const lastDone=Array.isArray(doc.attempts)&&doc.attempts.length?doc.attempts[doc.attempts.length-1]:null;
     if(submitKey&&lastDone&&lastDone.submitKey===submitKey){replayOf=lastDone;finalState=state(a,doc,Date.now());return doc}   // QA-14: the same submit again
     if(isModernAttempt(a,doc)&&!attemptIdentityOk(doc,b)){const err=new Error("تم بدء محاولة جديدة لهذا الواجب. حدّث الصفحة.");err.httpStatus=409;throw err}
     if(!attemptEpochOk(a,doc,b)){const err=new Error("تغيّرت حالة المحاولة (حفظ مؤقت أو استئناف). حدّث الصفحة.");err.httpStatus=409;throw err}
     const ts=timerState(a,doc,Date.now());
     if(!ts.canWrite){const err=new Error(ts.activeAttempt&&ts.activeAttempt.status==="paused"?"المحاولة محفوظة مؤقتًا. تابع المحاولة أولًا.":ts.timed?(ts.attemptExpired?"انتهى وقت المحاولة.":"ابدأ المحاولة أولاً."):(ts.isClosed?"انتهى موعد التسليم.":"لا توجد محاولة إضافية متاحة."));err.httpStatus=409;throw err}
     if(draftStale(doc,b))throw draftStaleError();                                   // QA-8: never grade a device's older copy over a newer saved draft
     // Grade ONLY after the published/identity/canWrite guards pass, so a stale or missing-identity submit
     // (409 above) never calls gradeExam or mutates anything.
     const active=activeAttemptOf(doc),attemptNumber=active?active.attemptNumber:(doc.attempts?.length||0)+1;
     const g=gradeFn(a.examSnapshot,answers,parametricGenerationContext(id,student.userId,attemptNumber));   // Phase 19B — server-owned identity
     const holds=applyRenderFailureHolds(g,submitFailures||normalizeRenderFailures(doc.draftRenderFailures,a.examSnapshot||null),answers,a.examSnapshot,now);   // 21E.3 — verified technical holds, never a zero
     // Audit (B2A #12 / B2B #16): a normal submit records endReason "submitted", endedAt = server
     // submission time, and preserves any teacher timer extension (extendedEndsAt) on the completed attempt.
     const attempt={attemptNumber,submittedAt:now,score:g.score,totalMarks:g.totalMarks,percentage:g.percentage,manualReviewMarks:g.manualReviewMarks,finalized:g.finalized,questionGrades:g.questions,sections:g.sections,answers,manualOverrides:{},teacherFeedback:"",timedOut:false,startedAt:active?active.startedAt:"",endsAt:active?active.endsAt||"":"",extendedEndsAt:active&&active.extendedEndsAt?String(active.extendedEndsAt):"",endedAt:now,endReason:"submitted",...modelThreeAudit(a,active),...(holds?{renderFailures:holds}:{}),...(submitKey?{submitKey}:{})};
     codingPlan=planCodingGrading(a.examSnapshot,attempt,{assignmentId:id,studentId:student.userId,now});   // Phase 17C — atomic with the attempt
     doc.attempts=Array.isArray(doc.attempts)?doc.attempts:[];doc.attempts.push(attempt);
     doc.draftAnswers={};doc.draftSavedAt="";doc.activeAttempt=null;doc.updatedAt=now;delete doc.draftRenderFailures;doc.draftRevision=draftRevisionOf(doc)+1;   // QA2-11
     resultAttempt=attempt;finalState=state(a,doc,Date.now());
     return doc;
    }));
   }catch(e){
    // Safe technical failure event: action + assignmentId + retryability only — NEVER answers/identity/content.
    obs?.logWarn("student.submission.failed",{action,assignmentId:id,retryable:(e instanceof AssignmentLockBusyError||e instanceof StorageConflictError),errorClass:(e instanceof AssignmentLockBusyError||e instanceof StorageConflictError)?"conflict":(e?.httpStatus?undefined:"internal_error")});
    if(e instanceof AssignmentLockBusyError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:failureBody(e)};
    throw e;
   }
   if(replayOf){obs?.logInfo("student.submission.completed",{action:"submit",assignmentId:id,replay:true});return {status:200,jsonBody:{ok:true,result:pub(replayOf,a),state:finalState,replay:true}}}
   if(resultAttempt.finalized){
    await recFn(c,{classId:student.classId,studentId:student.userId,studentDisplayName:student.displayName,assignmentId:id,assignmentTitle:a.title,percentage:resultAttempt.percentage,shareAchievements:student.shareAchievements});
   }
   await dispatchPlannedGrading(c,{assignmentId:id,studentId:student.userId,attemptNumber:resultAttempt.attemptNumber},codingPlan,deps,obs);   // AFTER the commit
   obs?.logInfo("student.submission.completed",{action:"submit",assignmentId:id,finalized:!!resultAttempt.finalized});
   return {status:200,jsonBody:{ok:true,result:pub(resultAttempt,a),state:finalState}};
  }

  // ── finalizeTimedOutAttempt — the ONLY safe way an expired timed attempt is closed. SECURITY: grades
  // ONLY submission.draftAnswers already on the server; any client-supplied answers are IGNORED, so a
  // student cannot edit answers after expiry and pass them as a "timeout" submission. Idempotent. ──
  if(action==="finalizeTimedOutAttempt"){
   let resultAttempt=null,finalState=null,already=false,codingPlan=null;
   try{
    await maybeLock(()=>mut(c,name,async current=>{
     // Roadmap #7 race guard: re-read the assignment from storage inside the mutation and require
     // "published" before committing ANY write, in case it was archived after this request loaded it.
     const fa=await dl(c,AP+id+".json");if(!fa||fa.status!=="published"){const err=new Error("الواجب غير متاح حاليًا.");err.httpStatus=403;throw err}
     const doc=current||defaultSubmission(id,student);
     const active=activeAttemptOf(doc);
     if(!active){already=true;finalState=state(a,doc,Date.now());return doc} // already finalized — no-op
     const ts=timerState(a,doc,Date.now());
     if(!ts.attemptExpired){const err=new Error("لم تنتهِ مدة المحاولة بعد.");err.httpStatus=409;throw err}
     const serverAnswers=doc.draftAnswers&&typeof doc.draftAnswers==="object"?doc.draftAnswers:{};
     const g=gradeFn(a.examSnapshot,serverAnswers,parametricGenerationContext(id,student.userId,active.attemptNumber)),now=new Date().toISOString();
     const holds=applyRenderFailureHolds(g,normalizeRenderFailures(b.renderFailures!==undefined?b.renderFailures:doc.draftRenderFailures,a.examSnapshot||null),serverAnswers,a.examSnapshot,now);   // 21E.3 — the record saved with the draft; Review Fix 4 (P1): the finalizing client's own report wins (a report the autosave could not persist offline), verified the same way — toward the teacher only, never an answer
     // Audit (B2A #12 / B2B #17): endReason "timedOut"; endedAt = the AUTHORITATIVE effective deadline
     // (teacher-extended duration OR due-clipped — ts.effectiveAttemptEndsAt already accounts for
     // extendedEndsAt), NOT this offline finalization moment. submittedAt stays the real server
     // finalization timestamp. The teacher extension is preserved on the completed attempt (extendedEndsAt).
     const endedAt=ts.effectiveAttemptEndsAt||active.endsAt||now;
     const attempt={attemptNumber:active.attemptNumber,submittedAt:now,score:g.score,totalMarks:g.totalMarks,percentage:g.percentage,manualReviewMarks:g.manualReviewMarks,finalized:g.finalized,questionGrades:g.questions,sections:g.sections,answers:serverAnswers,manualOverrides:{},teacherFeedback:"",timedOut:true,startedAt:active.startedAt,endsAt:active.endsAt,extendedEndsAt:active.extendedEndsAt?String(active.extendedEndsAt):"",endedAt,endReason:"timedOut",...modelThreeAudit(a,active),...(holds?{renderFailures:holds}:{})};
     codingPlan=planCodingGrading(a.examSnapshot,attempt,{assignmentId:id,studentId:student.userId,now});   // Phase 17C — atomic with the attempt
     doc.attempts=Array.isArray(doc.attempts)?doc.attempts:[];doc.attempts.push(attempt);
     doc.draftAnswers={};doc.draftSavedAt="";doc.activeAttempt=null;doc.updatedAt=now;delete doc.draftRenderFailures;doc.draftRevision=draftRevisionOf(doc)+1;   // QA2-11
     resultAttempt=attempt;finalState=state(a,doc,Date.now());
     return doc;
    }));
   }catch(e){
    // Safe technical failure event: action + assignmentId + retryability only — NEVER answers/identity/content.
    obs?.logWarn("student.submission.failed",{action,assignmentId:id,retryable:(e instanceof AssignmentLockBusyError||e instanceof StorageConflictError),errorClass:(e instanceof AssignmentLockBusyError||e instanceof StorageConflictError)?"conflict":(e?.httpStatus?undefined:"internal_error")});
    if(e instanceof AssignmentLockBusyError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:failureBody(e)};
    throw e;
   }
   if(!already&&resultAttempt&&resultAttempt.finalized){
    await recFn(c,{classId:student.classId,studentId:student.userId,studentDisplayName:student.displayName,assignmentId:id,assignmentTitle:a.title,percentage:resultAttempt.percentage,shareAchievements:student.shareAchievements});
   }
   if(!already&&resultAttempt)await dispatchPlannedGrading(c,{assignmentId:id,studentId:student.userId,attemptNumber:resultAttempt.attemptNumber},codingPlan,deps,obs);   // AFTER the commit
   if(!already)obs?.logInfo("student.submission.completed",{action:"finalizeTimedOutAttempt",assignmentId:id,timedOut:true});
   return {status:200,jsonBody:{ok:true,result:resultAttempt?pub(resultAttempt,a):(finalState?finalState.latestResult:null),state:finalState,alreadyFinalized:already}};
  }

  // Shared failure mapping for the Phase 7A lifecycle actions (same contract as the actions above): safe technical event
  // (action + assignmentId + retryability only — NEVER answers), 503 for lock/storage conflicts, domain status otherwise.
  const lifecycleFailure=e=>{
   const retryable=e instanceof AssignmentLockBusyError||e instanceof StorageConflictError;
   obs?.logWarn("student.submission.failed",{action,assignmentId:id,retryable,errorClass:retryable?"conflict":(e?.httpStatus?undefined:"internal_error")});
   if(retryable)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
   if(e?.httpStatus)return {status:e.httpStatus,jsonBody:failureBody(e)};
   throw e;
  };
  const stale=()=>{const err=new Error("تغيّرت حالة المحاولة في نافذة أخرى. حدّث الصفحة.");err.httpStatus=409;return err};
  const reread=async()=>{const fa=await dl(c,AP+id+".json");if(!fa||fa.status!=="published"){const err=new Error("الواجب غير متاح حاليًا.");err.httpStatus=403;throw err}};

  // ── pauseAttempt (Phase 7A, PAUSABLE only) — the explicit «حفظ مؤقت والخروج». ATOMICALLY (one CAS): saves the
  // student's latest answers, stops the duration clock and records the REMAINING budget computed from SERVER time only
  // (the current authoritative duration deadline − now; never from the device clock), keeps the SAME attemptNumber and
  // startedAt, and advances the epoch. Asserts identity + epoch; a retry of this very request (already paused at
  // epoch+1) is idempotent. Never pauses an expired attempt (that one is finalized instead). ──
  if(action==="pauseAttempt"){
   const rej=pauseRejection(a,s,Date.now());
   if(rej)return {status:rej.status,jsonBody:{ok:false,error:rej.error}};
   const answers=b.answers&&typeof b.answers==="object"?normalizeDraftAnswers(b.answers,a.examSnapshot||null).answers:null; // Phase 17A — the pause path bounds / binds answers like saveDraft / submit
   let finalState=null,already=false;
   try{
    await maybeLock(()=>mut(c,name,async current=>{
     await reread();
     const doc=current||defaultSubmission(id,student);
     if(!attemptIdentityOk(doc,b))throw stale();
     const act=doc.activeAttempt,ep=attemptEpochOf(act),exp=expectedEpoch(b);
     if(!exp)throw stale();
     if(act.status==="paused"&&ep===exp+1){already=true;finalState=state(a,doc,Date.now());return doc}   // idempotent retry
     if(act.status==="paused"||ep!==exp)throw stale();
     const nowMs=Date.now(),rj=pauseRejection(a,doc,nowMs);
     if(rj){const err=new Error(rj.error);err.httpStatus=rj.status;throw err}
     const ts=timerState(a,doc,nowMs),nowIso=new Date(nowMs).toISOString();
     if(answers&&draftStale(doc,b))throw draftStaleError();                          // QA-8: the pause's answers replace the draft too
     if(answers){doc.draftAnswers=answers;doc.draftSavedAt=nowIso;act.lastSavedAt=nowIso;doc.draftRevision=draftRevisionOf(doc)+1;if(b.renderFailures!==undefined)draftRenderFailuresPatch(doc,normalizeRenderFailures(b.renderFailures,a.examSnapshot||null))}   // 21E.3 — the report travels with the saved answers
     if(ts.timed)act.pausedRemainingMs=Math.max(0,toMs(ts.attemptDurationEndsAt)-nowMs);   // server budget, unclipped by due
     act.status="paused";act.pausedAt=nowIso;act.attemptEpoch=ep+1;act.pauseCount=Math.max(0,Number(act.pauseCount)||0)+1;
     doc.updatedAt=nowIso;
     finalState=state(a,doc,nowMs);
     return doc;
    }));
   }catch(e){return lifecycleFailure(e)}
   if(!already)obs?.logInfo("student.submission.completed",{action,assignmentId:id});
   return {status:200,jsonBody:{ok:true,state:finalState,alreadyPaused:already}};
  }

  // ── resumeAttempt (Phase 7A, PAUSABLE only) — continue the SAME paused attempt: same attemptNumber, same startedAt,
  // same answers, never a new attempt. The new running deadline is SERVER now + the stored remaining budget (never the
  // original full duration); the due date still caps it (timerState). Refused once the due date has passed. Asserts
  // identity + the PAUSED epoch; a retry of this very request (already running at epoch+1) is idempotent. ──
  if(action==="resumeAttempt"){
   const rej=resumeRejection(a,s,Date.now());
   if(rej)return {status:rej.status,jsonBody:{ok:false,error:rej.error}};
   let finalState=null,already=false;
   try{
    await maybeLock(()=>mut(c,name,async current=>{
     await reread();
     const doc=current||defaultSubmission(id,student);
     if(!attemptIdentityOk(doc,b))throw stale();
     const act=doc.activeAttempt,ep=attemptEpochOf(act),exp=expectedEpoch(b);
     if(!exp)throw stale();
     if(act.status!=="paused"&&ep===exp+1){already=true;finalState=state(a,doc,Date.now());return doc}   // idempotent retry
     if(act.status!=="paused"||ep!==exp)throw stale();
     const nowMs=Date.now(),rj=resumeRejection(a,doc,nowMs);
     if(rj){const err=new Error(rj.error);err.httpStatus=rj.status;throw err}
     if(attemptDurationMinutes(a,doc)>0){                                            // QA-3: the attempt's own timing, not the current setting
      const remaining=Math.max(0,Number(act.pausedRemainingMs)||0);                    // corrupt/missing → 0 (fails closed)
      act.runEndsAt=new Date(nowMs+remaining).toISOString();
     }
     act.status=act.lastSavedAt?"draft":"started";act.attemptEpoch=ep+1;
     delete act.pausedAt;delete act.pausedRemainingMs;
     doc.updatedAt=new Date(nowMs).toISOString();
     finalState=state(a,doc,nowMs);
     return doc;
    }));
   }catch(e){return lifecycleFailure(e)}
   if(!already)obs?.logInfo("student.submission.completed",{action,assignmentId:id});
   return {status:200,jsonBody:{ok:true,state:finalState,alreadyResumed:already}};
  }

  // ── finalizeIntegrityExit (Phase 7A, STRICT only) — the student left the exam page of a running strict attempt.
  // Closes THAT attempt exactly once (identity + epoch asserted, so a late/duplicated exit can never end a newer
  // attempt): grades ONLY the server's saved draft (any client answers are ignored), consumes the attempt, clears it and
  // records endReason "integrityExit" (endedAt = now). If the attempt had already expired by time, it is closed as
  // "timedOut" instead (the time ran out first). No active attempt → idempotent no-op (a duplicate exit, or a submit
  // that won the race): never a second result. ──
  if(action==="finalizeIntegrityExit"){
   if(attemptPolicyOf(a)!=="strict")return {status:400,jsonBody:{ok:false,error:"هذا الواجب ليس بوضع صارم."}};
   let resultAttempt=null,finalState=null,already=false,codingPlan=null;
   try{
    await maybeLock(()=>mut(c,name,async current=>{
     await reread();
     const doc=current||defaultSubmission(id,student);
     const active=activeAttemptOf(doc);
     if(!active){already=true;finalState=state(a,doc,Date.now());return doc}
     if(!attemptIdentityOk(doc,b)||!attemptEpochOk(a,doc,b))throw stale();
     const nowMs=Date.now(),ts=timerState(a,doc,nowMs),now=new Date(nowMs).toISOString();
     const serverAnswers=doc.draftAnswers&&typeof doc.draftAnswers==="object"?doc.draftAnswers:{};
     const g=gradeFn(a.examSnapshot,serverAnswers,parametricGenerationContext(id,student.userId,active.attemptNumber)),timedOut=!!ts.attemptExpired;
     const holds=applyRenderFailureHolds(g,normalizeRenderFailures(b.renderFailures!==undefined?b.renderFailures:doc.draftRenderFailures,a.examSnapshot||null),serverAnswers,a.examSnapshot,now);   // 21E.3 — the record saved with the draft; Review Fix 4 (P1): the finalizing client's own report wins (a report the autosave could not persist offline), verified the same way — toward the teacher only, never an answer
     const attempt={attemptNumber:active.attemptNumber,submittedAt:now,score:g.score,totalMarks:g.totalMarks,percentage:g.percentage,manualReviewMarks:g.manualReviewMarks,finalized:g.finalized,questionGrades:g.questions,sections:g.sections,answers:serverAnswers,manualOverrides:{},teacherFeedback:"",timedOut,startedAt:active.startedAt,endsAt:active.endsAt||"",extendedEndsAt:active.extendedEndsAt?String(active.extendedEndsAt):"",endedAt:timedOut?(ts.effectiveAttemptEndsAt||now):now,endReason:timedOut?"timedOut":"integrityExit",...modelThreeAudit(a,active),...(holds?{renderFailures:holds}:{})};
     codingPlan=planCodingGrading(a.examSnapshot,attempt,{assignmentId:id,studentId:student.userId,now});   // Phase 17C — atomic with the attempt
     doc.attempts=Array.isArray(doc.attempts)?doc.attempts:[];doc.attempts.push(attempt);
     doc.draftAnswers={};doc.draftSavedAt="";doc.activeAttempt=null;doc.updatedAt=now;delete doc.draftRenderFailures;doc.draftRevision=draftRevisionOf(doc)+1;   // QA2-11
     resultAttempt=attempt;finalState=state(a,doc,nowMs);
     return doc;
    }));
   }catch(e){return lifecycleFailure(e)}
   if(!already&&resultAttempt&&resultAttempt.finalized){
    await recFn(c,{classId:student.classId,studentId:student.userId,studentDisplayName:student.displayName,assignmentId:id,assignmentTitle:a.title,percentage:resultAttempt.percentage,shareAchievements:student.shareAchievements});
   }
   if(!already&&resultAttempt)await dispatchPlannedGrading(c,{assignmentId:id,studentId:student.userId,attemptNumber:resultAttempt.attemptNumber},codingPlan,deps,obs);   // AFTER the commit
   if(!already)obs?.logInfo("student.submission.completed",{action,assignmentId:id,endReason:resultAttempt?resultAttempt.endReason:""});
   return {status:200,jsonBody:{ok:true,result:resultAttempt?pub(resultAttempt,a):(finalState?finalState.latestResult:null),state:finalState,alreadyFinalized:already}};
  }

  return {status:400,jsonBody:{ok:false,error:"Unsupported submission action."}};
 }catch(e){obs?.logError("student.submission.error",e);return {status:500,jsonBody:{ok:false,error:"تعذر تنفيذ عملية التسليم حاليًا."}}}
}
app.http("studentSubmission",{methods:["GET","POST"],authLevel:"anonymous",route:"student-submission/{assignmentId}",handler:withObservability("student-submission",handler)});
module.exports={handler,state};
