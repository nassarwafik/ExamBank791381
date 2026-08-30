
const {app}=require("@azure/functions");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull,listJson}=require("../lib/platform-storage");
const AP="platform/assignments/",SP="platform/submissions/",UP="platform/users/";
function qid(q,i){return String(q?.examQuestionId||q?.id||q?.number||i+1)}
function round1(n){return Math.round(n*10)/10}
function round2(n){return Math.round(n*100)/100}
function difficultyFor(pct){if(pct===null)return null;if(pct>=75)return "easy";if(pct>=50)return "medium";return "hard"}
app.http("assignmentItemAnalysis",{methods:["GET"],authLevel:"anonymous",route:"assignment-item-analysis",handler:async request=>{
 try{
  const auth=requireBuilderAuth(request);if(!auth.ok)return auth.response;
  const c=getContainer(),u=new URL(request.url),id=String(u.searchParams.get("assignmentId")||"");
  if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
  const a=await downloadJsonOrNull(c,AP+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
  const questions=Array.isArray(a.examSnapshot?.questions)?a.examSnapshot.questions:[];
  const users=(await listJson(c,UP)).filter(x=>String(x.classId||"")===String(a.classId||"")&&x.active!==false);
  // Only the latest submitted attempt per student is analyzed — a student with several attempts
  // must not outweigh a student with a single attempt (see Phase 13 spec).
  const latestAttempts=[];
  for(const student of users){
   const s=await downloadJsonOrNull(c,SP+id+"/"+student.userId+".json");
   const attempts=Array.isArray(s?.attempts)?s.attempts:[];
   if(!attempts.length)continue;
   latestAttempts.push(attempts[attempts.length-1]);
  }
  const questionStats=questions.map((q,i)=>{
   const questionId=qid(q,i);
   let maxMarks=Number(q?.marks??q?.points??0);if(!Number.isFinite(maxMarks)||maxMarks<0)maxMarks=0;
   let studentsAnalyzed=0,correctCount=0,manualReviewCount=0,sumScore=0;
   for(const attempt of latestAttempts){
    const grades=Array.isArray(attempt?.questionGrades)?attempt.questionGrades:[];
    const g=grades.find(x=>String(x?.questionId||"")===questionId);
    if(!g||typeof g.score!=="number"||!Number.isFinite(g.score))continue;
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
  return {status:200,jsonBody:{ok:true,assignmentId:a.assignmentId,title:String(a.title||""),studentsInClass:users.length,studentsSubmitted:latestAttempts.length,attemptsAnalyzed:latestAttempts.length,questions:questionStats}};
 }catch(e){return {status:500,jsonBody:{ok:false,error:e instanceof Error?e.message:"Item analysis failed."}}}
}});
