
const {app}=require("@azure/functions");
const {withObservability}=require("../lib/observability");
const {requireActiveStudentSession}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull}=require("../lib/platform-storage");
const {normalizeClassStatus}=require("../lib/class-lifecycle");
const {sanitizeExamForStudent}=require("../lib/student-exam-sanitize");
const {getAssignmentAvailability,timerState}=require("../lib/assignment-availability");
const {normalizeExamStructure,sectionOfficialMaxMarks}=require("../lib/exam-structure");
const PREFIX="platform/assignments/",SUB_PREFIX="platform/submissions/";
// Delegates to the single recursive student-safe sanitizer so BOTH legacy exam.questions and
// structured exam.sections[].questions (with compound parts and generalized fields) have every
// answer key / teacher-side field stripped before the exam is sent to the student's browser.
function studentExam(v){return sanitizeExamForStudent(v)}
// Safe, answer-free marks distribution (section titles + official max marks) for the pre-start cover.
// Contains NO question text/options/fields/parts — only titles and totals, so it can be shown before
// the student presses Start without leaking the exam body.
function safeMarksDistribution(exam){
 const norm=normalizeExamStructure(exam);
 const rows=norm.sections.filter(s=>s.id!=="__default__").map((s,i)=>({title:String(s.title||("القسم "+(i+1))),marks:sectionOfficialMaxMarks(s)}));
 const total=norm.sections.reduce((n,s)=>n+sectionOfficialMaxMarks(s),0);
 return {rows,total};
}
// Pre-start (not yet started) safe metadata: everything needed to render the cover/start card EXCEPT the
// answerable exam body. The exam.questions/exam.sections are intentionally omitted. Applies to BOTH a
// TIMED assignment and an UNTIMED attemptModelVersion>=2 assignment (opening != starting). `timed` tells
// the client whether to show a countdown; UNTIMED reports durationMinutes 0 and never a deadline.
function preStartAssignment(a,timed){
 const snap=a.examSnapshot||{};
 return {assignmentId:a.assignmentId,title:a.title,instructions:a.instructions,openAt:a.openAt||"",dueAt:a.dueAt||"",
  effectiveDueAt:"",maxAttempts:Math.max(1,Number(a.maxAttempts||1)),durationMinutes:timed?Number(a.durationMinutes||0):0,
  sourceExamTitle:a.sourceExamTitle||"",questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),
  requiresStart:true,timed:!!timed,marksDistribution:safeMarksDistribution(snap),
  exam:{title:snap.title||a.title,metadata:snap.metadata||{},presentationTheme:snap.presentationTheme||"",coverPage:snap.coverPage||null}};
}
// `deps` is an optional dependency-injection seam for unit tests (production passes nothing).
async function handler(request,deps={},obs=null){
 const ras=deps.requireActiveStudentSession||requireActiveStudentSession,dl=deps.downloadJsonOrNull||downloadJsonOrNull;
 try{
  const id=String(request.params?.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
  const sess=await ras(request,deps);if(!sess.ok)return sess.response;const c=sess.container,student=sess.student;
  const classroom=student.classId?await dl(c,"platform/classes/"+student.classId+".json"):null;
  if(classroom&&normalizeClassStatus(classroom)==="archived")return {status:403,jsonBody:{ok:false,error:"هذا الصف مؤرشف وانتهت السنة الدراسية."}};
  const a=await dl(c,PREFIX+id+".json");if(!a||a.status!=="published"||String(a.classId)!==String(student.classId))return {status:404,jsonBody:{ok:false,error:"الواجب غير متاح لهذا الحساب."}};
  const s=await dl(c,SUB_PREFIX+id+"/"+student.userId+".json"),av=getAssignmentAvailability(a,s),ts=timerState(a,s);
  // Scheduled (before openAt) => 403 and NO exam payload. CLOSED is intentionally NOT blocked here: a
  // student must still be able to open a past-due assignment to view/review a submitted result (the
  // authoritative block on NEW saves/submits after the due date lives in student-submission).
  if(av.isBeforeOpen)return {status:403,jsonBody:{ok:false,error:"الواجب لم يُفتح بعد."}};
  // QUESTION SECURITY (B2A #7): an assignment that requires a server start (TIMED, or UNTIMED
  // attemptModelVersion>=2) with NO active attempt must NOT deliver the answerable exam body (otherwise
  // the student could read the questions in DevTools before pressing Start). Only after startAttempt
  // (activeAttempt exists — live or expired) is the full student-sanitized exam returned. Legacy untimed
  // (requiresStart false) keeps its historical behavior and receives the full exam immediately.
  if(ts.requiresStart&&!ts.activeAttempt){return {status:200,jsonBody:{ok:true,assignment:preStartAssignment(a,ts.timed)}}}
  const effectiveDueAt=av.effectiveDueAt;
  return {status:200,jsonBody:{ok:true,assignment:{assignmentId:a.assignmentId,title:a.title,instructions:a.instructions,openAt:a.openAt||"",dueAt:a.dueAt||"",effectiveDueAt,maxAttempts:Math.max(1,Number(a.maxAttempts||1)),durationMinutes:Number(a.durationMinutes||0),sourceExamTitle:a.sourceExamTitle||"",questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),exam:studentExam(a.examSnapshot)}}};
 }catch(e){obs?.logError("student.assignment.error",e);return {status:500,jsonBody:{ok:false,error:"تعذر فتح الواجب حاليًا."}}}
}
app.http("studentAssignment",{methods:["GET"],authLevel:"anonymous",route:"student-assignment/{assignmentId}",handler:withObservability("student-assignment",handler)});
module.exports={studentExam,handler};
