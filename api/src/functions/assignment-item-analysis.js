
const {app}=require("@azure/functions");
const {withObservability}=require("../lib/observability");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull,listJson,mapConcurrent,getReadConcurrency}=require("../lib/platform-storage");
// Phase 21G.0 — teacher tenancy: an assignment's attempts belong to the teacher of its class.
const {tenantOf,classAccessible}=require("../lib/teacher-tenancy");
const {isStudentClassMember}=require("../lib/class-membership");
const {questionAutoGradingPending}=require("../lib/coding/official-grading");
// QA2-5 — the QA-9 rule per question: a grade still open for a TECHNICAL reason (coding execution open, a render-failure hold the teacher has
// not marked) is not a provisional 0 in the question's average, correct rate or difficulty; the per-student grid already shows it as pending.
const technicalHold=(attempt,questionId,g)=>questionAutoGradingPending(attempt,questionId)||(g.manualReview===true&&!!attempt&&!!attempt.renderFailures&&!!attempt.renderFailures[questionId]&&attempt.renderFailures[questionId].held===true);
const AP="platform/assignments/",SP="platform/submissions/",UP="platform/users/";
function qid(q,i){return String(q?.examQuestionId||q?.id||q?.number||i+1)}
function round1(n){return Math.round(n*10)/10}
function round2(n){return Math.round(n*100)/100}
function difficultyFor(pct){if(pct===null)return null;if(pct>=75)return "easy";if(pct>=50)return "medium";return "hard"}
// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used). It does not change runtime behavior.
async function handler(request,deps={},obs=null){
 const authFn=deps.requireBuilderAuth||requireBuilderAuth,getC=deps.getContainer||getContainer,dl=deps.downloadJsonOrNull||downloadJsonOrNull,ls=deps.listJson||listJson;
 try{
  const auth=authFn(request);if(!auth.ok)return auth.response;
  const c=getC(),u=new URL(request.url),id=String(u.searchParams.get("assignmentId")||"");
  if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
  const a=await dl(c,AP+id+".json");if(!a||!(await classAccessible(n=>dl(c,n),a.classId,tenantOf(auth.user))))return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
  const questions=Array.isArray(a.examSnapshot?.questions)?a.examSnapshot.questions:[];
  // Roadmap #24: analyzed population is CLASS MEMBERSHIP (canonical predicate) — a login-disabled student's
  // historical submission stays part of the teacher's item analysis; archived students stay excluded.
  const users=(await ls(c,UP)).filter(x=>isStudentClassMember(x,a.classId));
  // Only the latest submitted attempt per student is analyzed — a student with several attempts
  // must not outweigh a student with a single attempt (see Phase 13 spec).
  const latestAttempts=[],latestByStudent=[];
  // Roadmap #27: member submissions are fetched with bounded concurrency (order preserved), then analyzed.
  const submissions=await mapConcurrent(users,getReadConcurrency(),student=>dl(c,SP+id+"/"+student.userId+".json"));
  submissions.forEach((s,i)=>{
   const attempts=Array.isArray(s?.attempts)?s.attempts:[];
   if(!attempts.length)return;
   latestAttempts.push(attempts[attempts.length-1]);
   latestByStudent.push({student:users[i],attempt:attempts[attempts.length-1]});
  });
  const questionStats=questions.map((q,i)=>{
   const questionId=qid(q,i);
   let maxMarks=Number(q?.marks??q?.points??0);if(!Number.isFinite(maxMarks)||maxMarks<0)maxMarks=0;
   let studentsAnalyzed=0,correctCount=0,manualReviewCount=0,sumScore=0;
   for(const attempt of latestAttempts){
    const grades=Array.isArray(attempt?.questionGrades)?attempt.questionGrades:[];
    const g=grades.find(x=>String(x?.questionId||"")===questionId);
    if(!g||typeof g.score!=="number"||!Number.isFinite(g.score))continue;
    if(technicalHold(attempt,questionId,g))continue;   // QA2-5
    studentsAnalyzed++;
    sumScore+=g.score;
    // rebuildAttempt() in assignment-review.js updates score/manualReview/reviewed on manual
    // grading but never recomputes the stored `correct` flag, so a manually-graded full-credit
    // answer can still show correct:false. Re-derive correctness from the score in that case.
    const isCorrect=g.reviewed===true&&maxMarks>0?g.score>=maxMarks-1e-9:g.correct===true;
    if(isCorrect)correctCount++;
    if(g.manualReview===true)manualReviewCount++;
   }
   const averageScore=studentsAnalyzed>0?round2(sumScore/studentsAnalyzed):null;
   const averagePercentage=(studentsAnalyzed>0&&maxMarks>0)?round1((sumScore/studentsAnalyzed)/maxMarks*100):null;
   const correctRate=studentsAnalyzed>0?round1(correctCount/studentsAnalyzed*100):null;
   return {
    questionId,
    number:i+1,
    text:String(q?.text||""),
    type:String(q?.presentationType||q?.type||""),
    maxMarks,
    studentsAnalyzed,
    correctCount,
    correctRate,
    averageScore,
    averagePercentage,
    manualReviewCount,
    difficulty:difficultyFor(averagePercentage)
   };
  });
  // Phase 21G.4 — the per-student grid (latest attempt, one cell per question). Grading safety: a question still waiting for the
  // teacher (manual review, a technical hold) or for automatic coding execution is "pending" and carries NO score — never the
  // provisional mark; a question with no stored grade is "none". Only a settled question grade is "graded".
  const students=latestByStudent.map(({student,attempt})=>{
   const grades=Array.isArray(attempt?.questionGrades)?attempt.questionGrades:[];
   const cells=questionStats.map(q=>{
    const g=grades.find(x=>String(x?.questionId||"")===q.questionId);
    if(!g)return {state:"none"};
    if(g.manualReview===true||questionAutoGradingPending(attempt,q.questionId))return {state:"pending"};
    if(typeof g.score!=="number"||!Number.isFinite(g.score))return {state:"none"};
    return {state:"graded",score:round2(g.score)};
   });
   return {studentId:String(student.userId||""),studentName:String(student.displayName||student.code||""),studentCode:String(student.code||""),attemptNumber:Number(attempt?.attemptNumber)||null,cells};
  });
  return {status:200,jsonBody:{ok:true,assignmentId:a.assignmentId,title:String(a.title||""),studentsInClass:users.length,studentsSubmitted:latestAttempts.length,attemptsAnalyzed:latestAttempts.length,questions:questionStats,students}};
 }catch(e){obs?.logError("assignment.itemAnalysis.error",e);return {status:500,jsonBody:{ok:false,error:"تعذر تحليل أسئلة الواجب حاليًا."}}}
}
app.http("assignmentItemAnalysis",{methods:["GET"],authLevel:"anonymous",route:"assignment-item-analysis",handler:withObservability("assignment-item-analysis",handler)});
module.exports={handler};
