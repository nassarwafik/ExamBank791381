
const {app}=require("@azure/functions");
const {requireStudentAuth}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull}=require("../lib/platform-storage");
const PREFIX="platform/assignments/",SUB_PREFIX="platform/submissions/";
function studentExam(v){const x=JSON.parse(JSON.stringify(v||{}));x.revisionHistory=[];if(Array.isArray(x.questions))x.questions=x.questions.map(q=>({...q,answer:{},hint:"",teacherNote:"",aiInstruction:"",history:[],redoStack:[]}));return x}
app.http("studentAssignment",{methods:["GET"],authLevel:"anonymous",route:"student-assignment/{assignmentId}",handler:async request=>{
 try{
  const auth=requireStudentAuth(request);if(!auth.ok)return auth.response;const id=String(request.params?.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
  const c=getContainer(),student=await downloadJsonOrNull(c,"platform/users/"+auth.user.sub+".json");if(!student||student.active===false)return {status:401,jsonBody:{ok:false,error:"الحساب غير فعّال."}};
  const a=await downloadJsonOrNull(c,PREFIX+id+".json");if(!a||a.status!=="published"||String(a.classId)!==String(student.classId))return {status:404,jsonBody:{ok:false,error:"الواجب غير متاح لهذا الحساب."}};
  if(a.openAt&&new Date(a.openAt).getTime()>Date.now())return {status:403,jsonBody:{ok:false,error:"الواجب لم يُفتح بعد."}};
  const s=await downloadJsonOrNull(c,SUB_PREFIX+id+"/"+student.userId+".json"),effectiveDueAt=(s&&s.dueAtOverride)?s.dueAtOverride:(a.dueAt||"");
  return {status:200,jsonBody:{ok:true,assignment:{assignmentId:a.assignmentId,title:a.title,instructions:a.instructions,openAt:a.openAt||"",dueAt:a.dueAt||"",effectiveDueAt,maxAttempts:Math.max(1,Number(a.maxAttempts||1)),sourceExamTitle:a.sourceExamTitle||"",questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),exam:studentExam(a.examSnapshot)}}};
 }catch{return {status:500,jsonBody:{ok:false,error:"تعذر فتح الواجب حاليًا."}}}
}});
