
const {app}=require("@azure/functions");
const {requireStudentAuth}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull,mutateJsonWithRetry,StorageConflictError}=require("../lib/platform-storage");
const {gradeExam}=require("../lib/assignment-grading");
const {recordAchievementIfEligible}=require("../lib/achievement-feed");
const {normalizeClassStatus}=require("../lib/class-lifecycle");
const {attemptState,actionRejection}=require("../lib/assignment-availability");
const AP="platform/assignments/",SP="platform/submissions/";
const CONFLICT_MESSAGE="حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
function pub(x){return {attemptNumber:x.attemptNumber,submittedAt:x.submittedAt,score:x.score,totalMarks:x.totalMarks,percentage:x.percentage,manualReviewMarks:x.manualReviewMarks,finalized:x.finalized,teacherFeedback:String(x.teacherFeedback||"")}}
// Unified state: availability (scheduled/open/closed incl. openAt), attempt limits and canAttempt all
// come from the shared assignment-availability helper, so the submission endpoint agrees with the
// dashboard/assignment endpoints. `dueClosed` is kept for backward compatibility.
function state(a,s){const av=attemptState(a,s),attempts=Array.isArray(s?.attempts)?s.attempts:[],latest=attempts.length?attempts[attempts.length-1]:null;return {attemptsUsed:av.attemptsUsed,allowedAttempts:av.allowedAttempts,canAttempt:av.canAttempt,dueClosed:av.isClosed,availability:av.availability,openAt:av.openAt,effectiveDueAt:av.effectiveDueAt,draftAnswers:s?.draftAnswers||{},draftSavedAt:s?.draftSavedAt||"",latestResult:latest?pub(latest):null,attempts:attempts.map(pub)}}
function defaultSubmission(id,student){return {schemaVersion:1,assignmentId:id,studentId:student.userId,classId:student.classId,studentCode:student.code,studentName:student.displayName,allowedAttempts:null,draftAnswers:{},attempts:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
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
  // AUTHORITATIVE server gate — enforced BEFORE any grading or storage mutation. openAt is now honored
  // here (scheduled => "الواجب لم يُفتح بعد."), so no save/submit can land before the assignment opens;
  // closed and attempt-limit rejections are handled the same way. The atomic mutation below re-checks
  // canAttempt as a race backstop.
  const rej=actionRejection(a,s,action);
  if(rej)return {status:rej.status,jsonBody:{ok:false,error:rej.error}};
  if(action==="saveDraft"){
   const answers=b.answers&&typeof b.answers==="object"?b.answers:{};
   let savedAt="";
   try{
    await mut(c,name,current=>{
     const doc=current||defaultSubmission(id,student);
     if(!state(a,doc).canAttempt){const err=new Error("لا توجد محاولة متاحة للحفظ.");err.httpStatus=409;throw err}
     savedAt=new Date().toISOString();
     doc.draftAnswers=answers;doc.draftSavedAt=savedAt;doc.updatedAt=savedAt;
     return doc;
    });
   }catch(e){
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
    throw e;
   }
   return {status:200,jsonBody:{ok:true,savedAt}};
  }
  if(action==="submit"){
   const answers=b.answers&&typeof b.answers==="object"?b.answers:{},g=gradeFn(a.examSnapshot,answers),now=new Date().toISOString();
   let resultAttempt=null,finalState=null;
   try{
    await mut(c,name,current=>{
     const doc=current||defaultSubmission(id,student);
     const st=state(a,doc);
     if(!st.canAttempt){const err=new Error(st.dueClosed?"انتهى موعد التسليم.":"لا توجد محاولة إضافية متاحة.");err.httpStatus=409;throw err}
     const attemptNumber=(doc.attempts?.length||0)+1;
     const attempt={attemptNumber,submittedAt:now,score:g.score,totalMarks:g.totalMarks,percentage:g.percentage,manualReviewMarks:g.manualReviewMarks,finalized:g.finalized,questionGrades:g.questions,sections:g.sections,answers,manualOverrides:{},teacherFeedback:""};
     doc.attempts=Array.isArray(doc.attempts)?doc.attempts:[];doc.attempts.push(attempt);
     doc.draftAnswers={};doc.draftSavedAt="";doc.updatedAt=now;
     resultAttempt=attempt;finalState=state(a,doc);
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
  return {status:400,jsonBody:{ok:false,error:"Unsupported submission action."}};
 }catch{return {status:500,jsonBody:{ok:false,error:"تعذر تنفيذ عملية التسليم حاليًا."}}}
}
app.http("studentSubmission",{methods:["GET","POST"],authLevel:"anonymous",route:"student-submission/{assignmentId}",handler});
module.exports={handler,state};
