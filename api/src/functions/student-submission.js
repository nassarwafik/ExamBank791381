
const {app}=require("@azure/functions");
const {requireStudentAuth}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull,mutateJsonWithRetry,StorageConflictError}=require("../lib/platform-storage");
const {gradeExam}=require("../lib/assignment-grading");
const {recordAchievementIfEligible}=require("../lib/achievement-feed");
const AP="platform/assignments/",SP="platform/submissions/";
const CONFLICT_MESSAGE="حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
function pub(x){return {attemptNumber:x.attemptNumber,submittedAt:x.submittedAt,score:x.score,totalMarks:x.totalMarks,percentage:x.percentage,manualReviewMarks:x.manualReviewMarks,finalized:x.finalized,teacherFeedback:String(x.teacherFeedback||"")}}
function effectiveDueAt(a,s){return (s&&s.dueAtOverride)?s.dueAtOverride:(a.dueAt||"")}
function state(a,s){const attempts=Array.isArray(s?.attempts)?s.attempts:[],base=Math.max(1,Number(a.maxAttempts||1)),limit=Math.max(base,Number(s?.allowedAttempts||0)),due=effectiveDueAt(a,s),dueClosed=!!due&&new Date(due).getTime()<Date.now(),latest=attempts.length?attempts[attempts.length-1]:null;return {attemptsUsed:attempts.length,allowedAttempts:limit,canAttempt:a.status==="published"&&!dueClosed&&attempts.length<limit,dueClosed,effectiveDueAt:due,draftAnswers:s?.draftAnswers||{},draftSavedAt:s?.draftSavedAt||"",latestResult:latest?pub(latest):null,attempts:attempts.map(pub)}}
function defaultSubmission(id,student){return {schemaVersion:1,assignmentId:id,studentId:student.userId,classId:student.classId,studentCode:student.code,studentName:student.displayName,allowedAttempts:null,draftAnswers:{},attempts:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
app.http("studentSubmission",{methods:["GET","POST"],authLevel:"anonymous",route:"student-submission/{assignmentId}",handler:async request=>{
 try{const auth=requireStudentAuth(request);if(!auth.ok)return auth.response;const id=String(request.params?.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};const c=getContainer(),student=await downloadJsonOrNull(c,"platform/users/"+auth.user.sub+".json");if(!student||student.active===false)return {status:401,jsonBody:{ok:false,error:"الحساب غير فعّال."}};const a=await downloadJsonOrNull(c,AP+id+".json");if(!a||String(a.classId)!==String(student.classId))return {status:404,jsonBody:{ok:false,error:"الواجب غير متاح."}};const name=SP+id+"/"+student.userId+".json";
  if(request.method==="GET"){const s=await downloadJsonOrNull(c,name);return {status:200,jsonBody:{ok:true,state:state(a,s||defaultSubmission(id,student))}}}
  let b={};try{b=await request.json()}catch{}const action=String(b.action||"saveDraft");
  if(action==="saveDraft"){
   const answers=b.answers&&typeof b.answers==="object"?b.answers:{};
   let savedAt="";
   try{
    await mutateJsonWithRetry(c,name,current=>{
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
   const answers=b.answers&&typeof b.answers==="object"?b.answers:{},g=gradeExam(a.examSnapshot,answers),now=new Date().toISOString();
   let resultAttempt=null,finalState=null;
   try{
    await mutateJsonWithRetry(c,name,current=>{
     const doc=current||defaultSubmission(id,student);
     const st=state(a,doc);
     if(!st.canAttempt){const err=new Error(st.dueClosed?"انتهى موعد التسليم.":"لا توجد محاولة إضافية متاحة.");err.httpStatus=409;throw err}
     const attemptNumber=(doc.attempts?.length||0)+1;
     const attempt={attemptNumber,submittedAt:now,score:g.score,totalMarks:g.totalMarks,percentage:g.percentage,manualReviewMarks:g.manualReviewMarks,finalized:g.finalized,questionGrades:g.questions,answers,manualOverrides:{},teacherFeedback:""};
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
    await recordAchievementIfEligible(c,{classId:student.classId,studentId:student.userId,studentDisplayName:student.displayName,assignmentId:id,assignmentTitle:a.title,percentage:resultAttempt.percentage,shareAchievements:student.shareAchievements});
   }
   return {status:200,jsonBody:{ok:true,result:pub(resultAttempt),state:finalState}};
  }
  return {status:400,jsonBody:{ok:false,error:"Unsupported submission action."}};
 }catch{return {status:500,jsonBody:{ok:false,error:"تعذر تنفيذ عملية التسليم حاليًا."}}}
}});
