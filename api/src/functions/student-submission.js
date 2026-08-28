
const {app}=require("@azure/functions");
const {requireStudentAuth}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull,uploadJson}=require("../lib/platform-storage");
const {gradeExam}=require("../lib/assignment-grading");
const AP="platform/assignments/",SP="platform/submissions/";
function publicState(a,s){
 const attempts=Array.isArray(s?.attempts)?s.attempts:[],base=Math.max(1,Number(a.maxAttempts||1)),limit=Math.max(base,Number(s?.allowedAttempts||0)),dueClosed=!!a.dueAt&&new Date(a.dueAt).getTime()<Date.now();
 const latest=attempts.length?attempts[attempts.length-1]:null;
 return {attemptsUsed:attempts.length,allowedAttempts:limit,canAttempt:a.status==="published"&&!dueClosed&&attempts.length<limit,dueClosed,draftAnswers:s?.draftAnswers||{},draftSavedAt:s?.draftSavedAt||"",latestResult:latest?{attemptNumber:latest.attemptNumber,submittedAt:latest.submittedAt,score:latest.score,totalMarks:latest.totalMarks,percentage:latest.percentage,manualReviewMarks:latest.manualReviewMarks,finalized:latest.finalized}:null,attempts:attempts.map(x=>({attemptNumber:x.attemptNumber,submittedAt:x.submittedAt,score:x.score,totalMarks:x.totalMarks,percentage:x.percentage,manualReviewMarks:x.manualReviewMarks,finalized:x.finalized}))};
}
app.http("studentSubmission",{methods:["GET","POST"],authLevel:"anonymous",route:"student-submission/{assignmentId}",handler:async request=>{
 try{
  const auth=requireStudentAuth(request);if(!auth.ok)return auth.response;const id=String(request.params?.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
  const c=getContainer(),student=await downloadJsonOrNull(c,"platform/users/"+auth.user.sub+".json");if(!student||student.active===false)return {status:401,jsonBody:{ok:false,error:"الحساب غير فعّال."}};
  const a=await downloadJsonOrNull(c,AP+id+".json");if(!a||String(a.classId)!==String(student.classId))return {status:404,jsonBody:{ok:false,error:"الواجب غير متاح."}};
  const name=SP+id+"/"+student.userId+".json";let s=await downloadJsonOrNull(c,name);
  if(!s)s={schemaVersion:1,assignmentId:id,studentId:student.userId,classId:student.classId,studentCode:student.code,studentName:student.displayName,allowedAttempts:null,draftAnswers:{},attempts:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(request.method==="GET")return {status:200,jsonBody:{ok:true,state:publicState(a,s)}};
  let b={};try{b=await request.json()}catch{}const action=String(b.action||"saveDraft");
  const state=publicState(a,s);
  if(action==="saveDraft"){
   if(!state.canAttempt)return {status:409,jsonBody:{ok:false,error:"لا توجد محاولة متاحة للحفظ."}};
   s.draftAnswers=b.answers&&typeof b.answers==="object"?b.answers:{};s.draftSavedAt=new Date().toISOString();s.updatedAt=s.draftSavedAt;await uploadJson(c,name,s);
   return {status:200,jsonBody:{ok:true,savedAt:s.draftSavedAt}};
  }
  if(action==="submit"){
   if(!state.canAttempt)return {status:409,jsonBody:{ok:false,error:state.dueClosed?"انتهى موعد التسليم.":"لا توجد محاولة إضافية متاحة."}};
   const answers=b.answers&&typeof b.answers==="object"?b.answers:{},g=gradeExam(a.examSnapshot,answers),now=new Date().toISOString(),attemptNumber=(s.attempts?.length||0)+1;
   const attempt={attemptNumber,submittedAt:now,score:g.score,totalMarks:g.totalMarks,percentage:g.percentage,manualReviewMarks:g.manualReviewMarks,finalized:g.finalized,questionGrades:g.questions,answers};
   s.attempts=Array.isArray(s.attempts)?s.attempts:[];s.attempts.push(attempt);s.draftAnswers={};s.draftSavedAt="";s.updatedAt=now;await uploadJson(c,name,s);
   const next=publicState(a,s);
   return {status:200,jsonBody:{ok:true,result:{attemptNumber,submittedAt:now,score:g.score,totalMarks:g.totalMarks,percentage:g.percentage,manualReviewMarks:g.manualReviewMarks,finalized:g.finalized,questionGrades:g.questions},state:next}};
  }
  return {status:400,jsonBody:{ok:false,error:"Unsupported submission action."}};
 }catch(e){return {status:500,jsonBody:{ok:false,error:e instanceof Error?e.message:"Submission failed."}}}
}});
