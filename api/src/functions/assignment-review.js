
const {app}=require("@azure/functions");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull,mutateJsonWithRetry,StorageConflictError}=require("../lib/platform-storage");
const AP="platform/assignments/",SP="platform/submissions/",UP="platform/users/";
const CONFLICT_MESSAGE="حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
function qid(q,i){return String(q?.examQuestionId||q?.id||q?.number||i+1)}
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
function rebuildAttempt(attempt){
 const grades=Array.isArray(attempt.questionGrades)?attempt.questionGrades:[],overrides=attempt.manualOverrides&&typeof attempt.manualOverrides==="object"?attempt.manualOverrides:{};let score=0,remaining=0;
 attempt.questionGrades=grades.map(g=>{const id=String(g.questionId||""),o=overrides[id];if(o&&o.score!==undefined&&o.score!==null){const s=clamp(o.score,0,Number(g.maxMarks||0));score+=s;return {...g,score:round(s),manualScore:round(s),manualReview:false,reviewed:true,teacherComment:String(o.comment||"")}}score+=Number(g.score||0);if(g.manualReview)remaining+=Number(g.maxMarks||0);return {...g,reviewed:!g.manualReview}});
 attempt.score=round(score);attempt.manualReviewMarks=round(remaining);attempt.totalMarks=round(attempt.totalMarks);attempt.percentage=attempt.totalMarks?round(attempt.score/attempt.totalMarks*100):0;attempt.finalized=remaining===0;return attempt;
}
app.http("assignmentReview",{methods:["GET","POST"],authLevel:"anonymous",route:"assignment-review",handler:async request=>{
 try{const auth=requireBuilderAuth(request);if(!auth.ok)return auth.response;const c=getContainer();
  if(request.method==="GET"){
   const u=new URL(request.url),assignmentId=String(u.searchParams.get("assignmentId")||""),studentId=String(u.searchParams.get("studentId")||""),attemptNumber=Math.max(1,Number(u.searchParams.get("attemptNumber")||1));
   if(!assignmentId||!studentId)return {status:400,jsonBody:{ok:false,error:"assignmentId and studentId are required."}};
   const assignment=await downloadJsonOrNull(c,AP+assignmentId+".json"),student=await downloadJsonOrNull(c,UP+studentId+".json");
   if(!assignment||!student)return {status:404,jsonBody:{ok:false,error:"لم يتم العثور على بيانات المحاولة."}};
   const submission=await downloadJsonOrNull(c,SP+assignmentId+"/"+studentId+".json");
   if(!submission)return {status:404,jsonBody:{ok:false,error:"لم يتم العثور على بيانات المحاولة."}};
   const sameClass=String(student.classId||"")===String(assignment.classId||"");
   if(!sameClass&&!historicalSubmissionProvesOwnership(submission,assignmentId,studentId,String(assignment.classId||"")))return {status:403,jsonBody:{ok:false,error:"الطالب لا ينتمي إلى صف هذا الواجب."}};
   const attempts=Array.isArray(submission.attempts)?submission.attempts:[],attempt=attempts.find(x=>Number(x.attemptNumber)===attemptNumber);if(!attempt)return {status:404,jsonBody:{ok:false,error:"المحاولة غير موجودة."}};
   const qs=Array.isArray(assignment.examSnapshot?.questions)?assignment.examSnapshot.questions:[],gradeMap=new Map((attempt.questionGrades||[]).map(x=>[String(x.questionId),x]));
   const questions=qs.map((q,i)=>{const id=qid(q,i),grade=gradeMap.get(id)||null,o=attempt.manualOverrides?.[id]??null;return {questionId:id,questionNumber:i+1,text:String(q.text||""),textHtml:String(q.textHtml||""),marks:Number(q.marks||q.points||0),type:String(q.presentationType||q.type||""),options:Array.isArray(q.options)?q.options:[],fields:Array.isArray(q.fields)?q.fields:[],wordBank:Array.isArray(q.wordBank)?q.wordBank:[],studentAnswer:attempt.answers?.[id]??null,expectedAnswer:q.answer??null,autoGrade:grade,manualScore:o?.score??null,teacherComment:String(o?.comment||"")}});
   return {status:200,jsonBody:{ok:true,assignment:{assignmentId:assignment.assignmentId,title:assignment.title,totalMarks:assignment.totalMarks},student:{studentId:student.userId,studentName:student.displayName,studentCode:student.code},attempt:{attemptNumber:attempt.attemptNumber,submittedAt:attempt.submittedAt,score:attempt.score,totalMarks:attempt.totalMarks,percentage:attempt.percentage,manualReviewMarks:attempt.manualReviewMarks,finalized:attempt.finalized,teacherFeedback:String(attempt.teacherFeedback||"")},attempts:attempts.map(x=>({attemptNumber:x.attemptNumber,submittedAt:x.submittedAt,score:x.score,totalMarks:x.totalMarks,percentage:x.percentage,manualReviewMarks:x.manualReviewMarks,finalized:x.finalized})),questions}};
  }
  let b={};try{b=await request.json()}catch{}if(String(b.action)!=="saveReview")return {status:400,jsonBody:{ok:false,error:"Unsupported review action."}};
  const assignmentId=String(b.assignmentId||""),studentId=String(b.studentId||""),attemptNumber=Math.max(1,Number(b.attemptNumber||1));if(!assignmentId||!studentId)return {status:400,jsonBody:{ok:false,error:"assignmentId and studentId are required."}};
  const reviewAssignment=await downloadJsonOrNull(c,AP+assignmentId+".json");if(!reviewAssignment)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
  const reviewStudent=await downloadJsonOrNull(c,UP+studentId+".json");if(!reviewStudent)return {status:404,jsonBody:{ok:false,error:"الطالب غير موجود."}};
  const name=SP+assignmentId+"/"+studentId+".json";
  const existingSubmission=await downloadJsonOrNull(c,name);
  if(!existingSubmission)return {status:404,jsonBody:{ok:false,error:"التسليم غير موجود."}};
  const reviewSameClass=String(reviewStudent.classId||"")===String(reviewAssignment.classId||"");
  if(!reviewSameClass&&!historicalSubmissionProvesOwnership(existingSubmission,assignmentId,studentId,String(reviewAssignment.classId||"")))return {status:403,jsonBody:{ok:false,error:"الطالب لا ينتمي إلى صف هذا الواجب."}};
  const incoming=b.overrides&&typeof b.overrides==="object"?b.overrides:{},teacherFeedback=String(b.teacherFeedback||"").trim(),reviewedAt=new Date().toISOString();
  let resultOut=null;
  try{
   await mutateJsonWithRetry(c,name,current=>{
    if(!current){const err=new Error("التسليم غير موجود.");err.httpStatus=404;throw err}
    const attempts=Array.isArray(current.attempts)?current.attempts:[],index=attempts.findIndex(x=>Number(x.attemptNumber)===attemptNumber);
    if(index<0){const err=new Error("المحاولة غير موجودة.");err.httpStatus=404;throw err}
    const attempt=attempts[index];
    attempt.manualOverrides=attempt.manualOverrides&&typeof attempt.manualOverrides==="object"?attempt.manualOverrides:{};
    for(const [questionId,value] of Object.entries(incoming)){if(!value||typeof value!=="object")continue;const grade=(attempt.questionGrades||[]).find(g=>String(g.questionId)===String(questionId));if(!grade)continue;attempt.manualOverrides[String(questionId)]={score:round(clamp(value.score,0,Number(grade.maxMarks||0))),comment:String(value.comment||"").trim(),reviewedAt}}
    attempt.teacherFeedback=teacherFeedback;attempt.reviewedAt=reviewedAt;rebuildAttempt(attempt);
    attempts[index]=attempt;current.attempts=attempts;current.updatedAt=reviewedAt;
    resultOut={attemptNumber:attempt.attemptNumber,score:attempt.score,totalMarks:attempt.totalMarks,percentage:attempt.percentage,manualReviewMarks:attempt.manualReviewMarks,finalized:attempt.finalized,teacherFeedback:attempt.teacherFeedback};
    return current;
   });
  }catch(e){
   if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
   if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
   throw e;
  }
  return {status:200,jsonBody:{ok:true,result:resultOut}};
 }catch{return {status:500,jsonBody:{ok:false,error:"تعذر تنفيذ عملية التصحيح حاليًا."}}}
}});
