
const {app}=require("@azure/functions");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull,uploadJson}=require("../lib/platform-storage");
const AP="platform/assignments/",SP="platform/submissions/",UP="platform/users/";
function qid(q,i){return String(q?.examQuestionId||q?.id||q?.number||i+1)}
function round(n){return Number(Number(n||0).toFixed(2))}
function clamp(v,min,max){return Math.min(max,Math.max(min,Number(v)||0))}
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
   const assignment=await downloadJsonOrNull(c,AP+assignmentId+".json"),student=await downloadJsonOrNull(c,UP+studentId+".json"),submission=await downloadJsonOrNull(c,SP+assignmentId+"/"+studentId+".json");
   if(!assignment||!student||!submission)return {status:404,jsonBody:{ok:false,error:"لم يتم العثور على بيانات المحاولة."}};
   const attempts=Array.isArray(submission.attempts)?submission.attempts:[],attempt=attempts.find(x=>Number(x.attemptNumber)===attemptNumber);if(!attempt)return {status:404,jsonBody:{ok:false,error:"المحاولة غير موجودة."}};
   const qs=Array.isArray(assignment.examSnapshot?.questions)?assignment.examSnapshot.questions:[],gradeMap=new Map((attempt.questionGrades||[]).map(x=>[String(x.questionId),x]));
   const questions=qs.map((q,i)=>{const id=qid(q,i),grade=gradeMap.get(id)||null,o=attempt.manualOverrides?.[id]??null;return {questionId:id,questionNumber:i+1,text:String(q.text||""),textHtml:String(q.textHtml||""),marks:Number(q.marks||q.points||0),type:String(q.presentationType||q.type||""),options:Array.isArray(q.options)?q.options:[],fields:Array.isArray(q.fields)?q.fields:[],wordBank:Array.isArray(q.wordBank)?q.wordBank:[],studentAnswer:attempt.answers?.[id]??null,expectedAnswer:q.answer??null,autoGrade:grade,manualScore:o?.score??null,teacherComment:String(o?.comment||"")}});
   return {status:200,jsonBody:{ok:true,assignment:{assignmentId:assignment.assignmentId,title:assignment.title,totalMarks:assignment.totalMarks},student:{studentId:student.userId,studentName:student.displayName,studentCode:student.code},attempt:{attemptNumber:attempt.attemptNumber,submittedAt:attempt.submittedAt,score:attempt.score,totalMarks:attempt.totalMarks,percentage:attempt.percentage,manualReviewMarks:attempt.manualReviewMarks,finalized:attempt.finalized,teacherFeedback:String(attempt.teacherFeedback||"")},attempts:attempts.map(x=>({attemptNumber:x.attemptNumber,submittedAt:x.submittedAt,score:x.score,totalMarks:x.totalMarks,percentage:x.percentage,manualReviewMarks:x.manualReviewMarks,finalized:x.finalized})),questions}};
  }
  let b={};try{b=await request.json()}catch{}if(String(b.action)!=="saveReview")return {status:400,jsonBody:{ok:false,error:"Unsupported review action."}};
  const assignmentId=String(b.assignmentId||""),studentId=String(b.studentId||""),attemptNumber=Math.max(1,Number(b.attemptNumber||1));if(!assignmentId||!studentId)return {status:400,jsonBody:{ok:false,error:"assignmentId and studentId are required."}};
  const name=SP+assignmentId+"/"+studentId+".json",submission=await downloadJsonOrNull(c,name);if(!submission)return {status:404,jsonBody:{ok:false,error:"التسليم غير موجود."}};
  const attempts=Array.isArray(submission.attempts)?submission.attempts:[],index=attempts.findIndex(x=>Number(x.attemptNumber)===attemptNumber);if(index<0)return {status:404,jsonBody:{ok:false,error:"المحاولة غير موجودة."}};
  const attempt=attempts[index],incoming=b.overrides&&typeof b.overrides==="object"?b.overrides:{};attempt.manualOverrides=attempt.manualOverrides&&typeof attempt.manualOverrides==="object"?attempt.manualOverrides:{};
  for(const [questionId,value] of Object.entries(incoming)){if(!value||typeof value!=="object")continue;const grade=(attempt.questionGrades||[]).find(g=>String(g.questionId)===String(questionId));if(!grade)continue;attempt.manualOverrides[String(questionId)]={score:round(clamp(value.score,0,Number(grade.maxMarks||0))),comment:String(value.comment||"").trim(),reviewedAt:new Date().toISOString()}}
  attempt.teacherFeedback=String(b.teacherFeedback||"").trim();attempt.reviewedAt=new Date().toISOString();rebuildAttempt(attempt);attempts[index]=attempt;submission.attempts=attempts;submission.updatedAt=new Date().toISOString();await uploadJson(c,name,submission);
  return {status:200,jsonBody:{ok:true,result:{attemptNumber:attempt.attemptNumber,score:attempt.score,totalMarks:attempt.totalMarks,percentage:attempt.percentage,manualReviewMarks:attempt.manualReviewMarks,finalized:attempt.finalized,teacherFeedback:attempt.teacherFeedback}}};
 }catch(e){return {status:500,jsonBody:{ok:false,error:e instanceof Error?e.message:"Review failed."}}}
}});
