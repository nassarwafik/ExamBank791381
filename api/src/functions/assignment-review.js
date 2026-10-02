
const {app}=require("@azure/functions");
const {withObservability}=require("../lib/observability");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull,mutateJsonWithRetry,StorageConflictError}=require("../lib/platform-storage");
const {recordAuditEvent}=require("../lib/audit-log");
const {recordAchievementIfEligible}=require("../lib/achievement-feed");
const {flattenQuestions,effectiveMaxMarks}=require("../lib/exam-structure");
// Phase 17C — the ONE canonical attempt-score rebuild, shared with the automatic coding grading callback.
const {rebuildAttemptGrades}=require("../lib/attempt-grade-rebuild");
const {normalizeEndReason}=require("../lib/assignment-availability");
const {deriveGradingStatus}=require("../lib/grading-status");
const {recordEventSafely}=require("../lib/notification-events");
// Phase 17E-D — the ONE teacher-safe coding evidence projection (published snapshot + stored attempt; never internal identifiers).
const {teacherCodingEvidence}=require("../lib/coding/official-grading");
// Phase 17E-D — identifiers are validated before they ever become a storage path; attemptNumber must be a real positive integer.
const SAFE_ID=/^[A-Za-z0-9._:-]{1,128}$/;
const safeId=v=>typeof v==="string"&&SAFE_ID.test(v)&&!v.includes("..");
function attemptNumberOf(v){if(v===undefined||v===null||v==="")return 1;const n=typeof v==="number"?v:/^[0-9]{1,6}$/.test(String(v))?Number(v):NaN;return Number.isInteger(n)&&n>=1?n:null}
// Phase 6D — the student-facing meaning of an attempt's review state: finalized, the score, the overall feedback and the
// per-question teacher comments (never reviewedAt timestamps, which change on every save).
function reviewFacts(attempt){
 const comments={};const o=attempt&&attempt.manualOverrides&&typeof attempt.manualOverrides==="object"?attempt.manualOverrides:{};
 for(const [id,v] of Object.entries(o))if(v&&String(v.comment||"").trim())comments[id]=String(v.comment).trim();
 return {finalized:!!(attempt&&attempt.finalized),score:round(attempt&&attempt.score),feedback:String(attempt&&attempt.teacherFeedback||"").trim(),comments};
}
function reviewChange(before,after){
 const becameFinal=!before.finalized&&after.finalized;
 const scoreChanged=before.score!==after.score;
 const newComment=Object.entries(after.comments).some(([id,c])=>before.comments[id]!==c);
 const feedbackChanged=(!!after.feedback&&after.feedback!==before.feedback)||newComment;
 return {becameFinal,scoreChanged,feedbackChanged,meaningful:becameFinal||scoreChanged||feedbackChanged};
}
const AP="platform/assignments/",SP="platform/submissions/",UP="platform/users/";
const CONFLICT_MESSAGE="حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
// Additive lifecycle audit view for a completed attempt (B2A #21 / B2B #16). Read-time normalization only.
function attemptAudit(x){return {startedAt:String(x.startedAt||""),endsAt:String(x.endsAt||""),extendedEndsAt:String(x.extendedEndsAt||""),endedAt:String(x.endedAt||""),endReason:normalizeEndReason(x),timedOut:!!x.timedOut}}
function round(n){return Number(Number(n||0).toFixed(2))}
function clamp(v,min,max){return Math.min(max,Math.max(min,Number(v)||0))}
// A student who has since moved classes must still be reviewable for a submission they
// genuinely made while in the assignment's class — the submission path itself already ties it
// to this exact assignmentId+studentId, so this only needs to rule out an actual mismatch.
// Each field is checked only when present, so older submissions missing one of them are not
// auto-rejected (the storage path already proves assignmentId/studentId; classId is the one
// field this can't infer, so it's the meaningful check when present).
function historicalSubmissionProvesOwnership(submission,assignmentId,studentId,assignmentClassId){
 if(submission.studentId!==undefined&&String(submission.studentId)!==String(studentId))return false;
 if(submission.assignmentId!==undefined&&String(submission.assignmentId)!==String(assignmentId))return false;
 if(submission.classId!==undefined&&String(submission.classId)!==String(assignmentClassId))return false;
 return true;
}
// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used). It does not change runtime behavior or the grading logic.
async function handler(request,deps={},obs=null){
 const authFn=deps.requireBuilderAuth||requireBuilderAuth,getC=deps.getContainer||getContainer,dl=deps.downloadJsonOrNull||downloadJsonOrNull,mut=deps.mutateJsonWithRetry||mutateJsonWithRetry,rec=deps.recordAuditEvent||recordAuditEvent,ach=deps.recordAchievementIfEligible||recordAchievementIfEligible;
 try{const auth=authFn(request);if(!auth.ok)return auth.response;const c=getC();
  if(request.method==="GET"){
   const u=new URL(request.url),assignmentId=String(u.searchParams.get("assignmentId")||""),studentId=String(u.searchParams.get("studentId")||""),attemptNumber=attemptNumberOf(u.searchParams.get("attemptNumber"));
   if(!assignmentId||!studentId)return {status:400,jsonBody:{ok:false,error:"assignmentId and studentId are required."}};
   if(!safeId(assignmentId)||!safeId(studentId)||attemptNumber===null)return {status:400,jsonBody:{ok:false,error:"بيانات الطلب غير صالحة."}};
   const assignment=await dl(c,AP+assignmentId+".json"),student=await dl(c,UP+studentId+".json");
   if(!assignment||!student)return {status:404,jsonBody:{ok:false,error:"لم يتم العثور على بيانات المحاولة."}};
   const submission=await dl(c,SP+assignmentId+"/"+studentId+".json");
   if(!submission)return {status:404,jsonBody:{ok:false,error:"لم يتم العثور على بيانات المحاولة."}};
   const sameClass=String(student.classId||"")===String(assignment.classId||"");
   if(!sameClass&&!historicalSubmissionProvesOwnership(submission,assignmentId,studentId,String(assignment.classId||"")))return {status:403,jsonBody:{ok:false,error:"الطالب لا ينتمي إلى صف هذا الواجب."}};
   const attempts=Array.isArray(submission.attempts)?submission.attempts:[],attempt=attempts.find(x=>Number(x.attemptNumber)===attemptNumber);if(!attempt)return {status:404,jsonBody:{ok:false,error:"المحاولة غير موجودة."}};
   const flat=flattenQuestions(assignment.examSnapshot),gradeMap=new Map((attempt.questionGrades||[]).map(x=>[String(x.questionId),x]));
   const questions=flat.map(({question:q,questionId:id,sectionId,displayNumber})=>{const grade=gradeMap.get(id)||null,o=attempt.manualOverrides?.[id]??null;return {questionId:id,questionNumber:displayNumber,sectionId,text:String(q.text||""),textHtml:String(q.textHtml||""),marks:Number(q.marks||q.points||0),type:String(q.presentationType||q.type||""),options:Array.isArray(q.options)?q.options:[],fields:Array.isArray(q.fields)?q.fields:[],wordBank:Array.isArray(q.wordBank)?q.wordBank:[],parts:Array.isArray(q.parts)?q.parts:null,studentAnswer:attempt.answers?.[id]??null,expectedAnswer:q.answer??null,autoGrade:grade,manualScore:o?.score??null,teacherComment:String(o?.comment||""),...(()=>{const v=teacherCodingEvidence({questionId:id,node:q},attempt);return v?{codingEvidence:v}:{}})()}});
   return {status:200,jsonBody:{ok:true,assignment:{assignmentId:assignment.assignmentId,title:assignment.title,totalMarks:assignment.totalMarks},student:{studentId:student.userId,studentName:student.displayName,studentCode:student.code},attempt:{attemptNumber:attempt.attemptNumber,submittedAt:attempt.submittedAt,score:attempt.score,totalMarks:attempt.totalMarks,percentage:attempt.percentage,manualReviewMarks:attempt.manualReviewMarks,finalized:attempt.finalized,gradingStatus:deriveGradingStatus(attempt),teacherFeedback:String(attempt.teacherFeedback||""),...attemptAudit(attempt)},attempts:attempts.map(x=>({attemptNumber:x.attemptNumber,submittedAt:x.submittedAt,score:x.score,totalMarks:x.totalMarks,percentage:x.percentage,manualReviewMarks:x.manualReviewMarks,finalized:x.finalized,gradingStatus:deriveGradingStatus(x),...attemptAudit(x)})),questions}};
  }
  let b={};try{b=await request.json()}catch{}if(String(b.action)!=="saveReview")return {status:400,jsonBody:{ok:false,error:"Unsupported review action."}};
  const assignmentId=String(b.assignmentId||""),studentId=String(b.studentId||""),attemptNumber=attemptNumberOf(b.attemptNumber);if(!assignmentId||!studentId)return {status:400,jsonBody:{ok:false,error:"assignmentId and studentId are required."}};
  if(!safeId(assignmentId)||!safeId(studentId)||attemptNumber===null)return {status:400,jsonBody:{ok:false,error:"بيانات الطلب غير صالحة."}};
  const reviewAssignment=await dl(c,AP+assignmentId+".json");if(!reviewAssignment)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
  const reviewStudent=await dl(c,UP+studentId+".json");if(!reviewStudent)return {status:404,jsonBody:{ok:false,error:"الطالب غير موجود."}};
  const name=SP+assignmentId+"/"+studentId+".json";
  const existingSubmission=await dl(c,name);
  if(!existingSubmission)return {status:404,jsonBody:{ok:false,error:"التسليم غير موجود."}};
  const reviewSameClass=String(reviewStudent.classId||"")===String(reviewAssignment.classId||"");
  if(!reviewSameClass&&!historicalSubmissionProvesOwnership(existingSubmission,assignmentId,studentId,String(reviewAssignment.classId||"")))return {status:403,jsonBody:{ok:false,error:"الطالب لا ينتمي إلى صف هذا الواجب."}};
  const incoming=b.overrides&&typeof b.overrides==="object"?b.overrides:{},teacherFeedback=String(b.teacherFeedback||"").trim(),reviewedAt=new Date().toISOString();
  let resultOut=null,appliedCount=0,change=null,appliedIds=[];
  try{
   await mut(c,name,current=>{
    if(!current){const err=new Error("التسليم غير موجود.");err.httpStatus=404;throw err}
    const attempts=Array.isArray(current.attempts)?current.attempts:[],index=attempts.findIndex(x=>Number(x.attemptNumber)===attemptNumber);
    if(index<0){const err=new Error("المحاولة غير موجودة.");err.httpStatus=404;throw err}
    const attempt=attempts[index];
    const factsBefore=reviewFacts(attempt);                     // of the attempt version this CAS attempt commits over
    attempt.manualOverrides=attempt.manualOverrides&&typeof attempt.manualOverrides==="object"?attempt.manualOverrides:{};
    appliedCount=0;appliedIds=[];
    for(const [questionId,value] of Object.entries(incoming)){if(!value||typeof value!=="object")continue;const grade=(attempt.questionGrades||[]).find(g=>String(g.questionId)===String(questionId));if(!grade)continue;attempt.manualOverrides[String(questionId)]={score:round(clamp(value.score,0,effectiveMaxMarks(grade))),comment:String(value.comment||"").trim(),reviewedAt};appliedCount++;appliedIds.push(String(grade.questionId))}
    attempt.teacherFeedback=teacherFeedback;attempt.reviewedAt=reviewedAt;rebuildAttemptGrades(attempt);
    change=reviewChange(factsBefore,reviewFacts(attempt));
    attempts[index]=attempt;current.attempts=attempts;current.updatedAt=reviewedAt;
    resultOut={attemptNumber:attempt.attemptNumber,score:attempt.score,totalMarks:attempt.totalMarks,percentage:attempt.percentage,manualReviewMarks:attempt.manualReviewMarks,finalized:attempt.finalized,gradingStatus:deriveGradingStatus(attempt),teacherFeedback:attempt.teacherFeedback};
    return current;
   });
  }catch(e){
   obs?.logWarn("assignment.review.failed",{action:"saveReview",assignmentId:String(b.assignmentId||""),retryable:(e instanceof StorageConflictError),errorClass:(e instanceof StorageConflictError)?"conflict":(e?.httpStatus?undefined:"internal_error")});
   if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
   if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
   throw e;
  }
  if(appliedCount>0){
   await rec(c,{actor:auth.user?.sub,action:"assignment.manualGradeOverride",targetType:"student",targetId:studentId,targetLabel:String(reviewStudent.displayName||reviewStudent.code||""),details:{assignmentId,attemptNumber,overriddenQuestions:appliedCount,questionIds:appliedIds.slice(0,100),newScore:resultOut?.score}});
  }
  // Phase 6D — ONE coalesced personal notification per meaningful save (became final / score changed / new feedback);
  // an identical re-save changes nothing and notifies nothing. Secondary: never fails the review.
  if(change&&change.meaningful&&resultOut){
   await recordEventSafely(c,{scope:"student",studentId,type:"assignment_reviewed",dedupeKey:"review:"+assignmentId+":"+attemptNumber+":"+reviewedAt,data:{assignmentId,assignmentTitle:reviewAssignment.title,attemptNumber,becameFinal:change.becameFinal,scoreChanged:change.scoreChanged,feedbackChanged:change.feedbackChanged,finalized:!!resultOut.finalized,percentage:resultOut.percentage}},deps,obs);
  }
  if(resultOut?.finalized){
   await ach(c,{classId:reviewAssignment.classId,studentId,studentDisplayName:reviewStudent.displayName,assignmentId,assignmentTitle:reviewAssignment.title,percentage:resultOut.percentage,shareAchievements:reviewStudent.shareAchievements});
  }
  obs?.logInfo("assignment.review.completed",{action:"saveReview",assignmentId:String(b.assignmentId||""),applied:appliedCount});
  return {status:200,jsonBody:{ok:true,result:resultOut}};
 }catch(e){obs?.logError("assignment.review.error",e);return {status:500,jsonBody:{ok:false,error:"تعذر تنفيذ عملية التصحيح حاليًا."}}}
}
app.http("assignmentReview",{methods:["GET","POST"],authLevel:"anonymous",route:"assignment-review",handler:withObservability("assignment-review",handler)});
module.exports={handler,historicalSubmissionProvesOwnership};
