
const {app}=require("@azure/functions");
const {requireStudentAuth}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull}=require("../lib/platform-storage");
const {normalizeClassStatus}=require("../lib/class-lifecycle");
const {sanitizeExamForStudent}=require("../lib/student-exam-sanitize");
const {getAssignmentAvailability}=require("../lib/assignment-availability");
const PREFIX="platform/assignments/",SUB_PREFIX="platform/submissions/";
// Delegates to the single recursive student-safe sanitizer so BOTH legacy exam.questions and
// structured exam.sections[].questions (with compound parts and generalized fields) have every
// answer key / teacher-side field stripped before the exam is sent to the student's browser.
function studentExam(v){return sanitizeExamForStudent(v)}
app.http("studentAssignment",{methods:["GET"],authLevel:"anonymous",route:"student-assignment/{assignmentId}",handler:async request=>{
 try{
  const auth=requireStudentAuth(request);if(!auth.ok)return auth.response;const id=String(request.params?.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
  const c=getContainer(),student=await downloadJsonOrNull(c,"platform/users/"+auth.user.sub+".json");if(!student||student.active===false)return {status:401,jsonBody:{ok:false,error:"الحساب غير فعّال."}};
  const classroom=student.classId?await downloadJsonOrNull(c,"platform/classes/"+student.classId+".json"):null;
  if(classroom&&normalizeClassStatus(classroom)==="archived")return {status:403,jsonBody:{ok:false,error:"هذا الصف مؤرشف وانتهت السنة الدراسية."}};
  const a=await downloadJsonOrNull(c,PREFIX+id+".json");if(!a||a.status!=="published"||String(a.classId)!==String(student.classId))return {status:404,jsonBody:{ok:false,error:"الواجب غير متاح لهذا الحساب."}};
  const s=await downloadJsonOrNull(c,SUB_PREFIX+id+"/"+student.userId+".json"),av=getAssignmentAvailability(a,s);
  // Scheduled (before openAt) => 403 and NO exam payload. CLOSED is intentionally NOT blocked here: a
  // student must still be able to open a past-due assignment to view/review a submitted result (the
  // authoritative block on NEW saves/submits after the due date lives in student-submission).
  if(av.isBeforeOpen)return {status:403,jsonBody:{ok:false,error:"الواجب لم يُفتح بعد."}};
  const effectiveDueAt=av.effectiveDueAt;
  return {status:200,jsonBody:{ok:true,assignment:{assignmentId:a.assignmentId,title:a.title,instructions:a.instructions,openAt:a.openAt||"",dueAt:a.dueAt||"",effectiveDueAt,maxAttempts:Math.max(1,Number(a.maxAttempts||1)),sourceExamTitle:a.sourceExamTitle||"",questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),exam:studentExam(a.examSnapshot)}}};
 }catch{return {status:500,jsonBody:{ok:false,error:"تعذر فتح الواجب حاليًا."}}}
}});
module.exports={studentExam};
