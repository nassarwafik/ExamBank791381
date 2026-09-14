
const {app}=require("@azure/functions");
const {withObservability}=require("../lib/observability");
const {requireActiveStudentSession}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull,listJson}=require("../lib/platform-storage");
const {normalizeClassStatus}=require("../lib/class-lifecycle");
const {attemptState,deriveAttemptStatus,attemptModelVersion,activeAttemptOf}=require("../lib/assignment-availability");
const {deriveGradingStatus}=require("../lib/grading-status");
const AP="platform/assignments/",SP="platform/submissions/";
// Roadmap #12 — a single server-derived presentation state for a dashboard assignment card. It COMBINES
// availability + attempt lifecycle + grading status into one value the UI renders directly, but never
// replaces the independent gradingStatus (a final previous result stays final even while a new attempt is
// inProgress). Precedence: active attempt wins (inProgress) → grading (awaitingReview/completed) →
// availability (scheduled / closedUnsubmitted) → available.
function deriveDashboardState(submission,availability,gradingStatus){
 if(activeAttemptOf(submission))return "inProgress";                 // a live/started/draft attempt always wins
 if(gradingStatus==="pendingReview")return "awaitingReview";
 if(gradingStatus==="final")return "completed";
 if(availability==="scheduled")return "scheduled";
 if(availability==="closed")return "closedUnsubmitted";             // closed with no completed result
 return "available";
}
// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used). It does not change runtime behavior.
async function handler(request,deps={}){
 const ras=deps.requireActiveStudentSession||requireActiveStudentSession,dl=deps.downloadJsonOrNull||downloadJsonOrNull,ls=deps.listJson||listJson;
 try{
  // Hardened, server-authoritative session (§7): loads + validates the current student (active/archived/
  // authVersion) and returns the loaded document + container so there is no duplicate user read.
  const sess=await ras(request,deps);if(!sess.ok)return sess.response;const c=sess.container,student=sess.student;
  const classroom=student.classId?await dl(c,"platform/classes/"+student.classId+".json"):null;
  if(classroom&&normalizeClassStatus(classroom)==="archived")return {status:403,jsonBody:{ok:false,error:"هذا الصف مؤرشف وانتهت السنة الدراسية."}};
  const raw=await ls(c,AP),assignments=[];
  // Legacy stats (kept for backward compatibility) + Roadmap #12 additive authoritative stats.
  let completed=0,sum=0;                                                     // legacy: any completed latest result
  let submitted=0,inProgress=0,pendingReview=0,finalized=0,scheduled=0,available=0,closedUnsubmitted=0,finalSum=0,finalCount=0;
  for(const a of raw.filter(x=>x.status==="published"&&String(x.classId||"")===String(student.classId||""))){
   // ONE submission read per assignment (unchanged) — every new field is derived from this same object.
   const s=await dl(c,SP+a.assignmentId+"/"+student.userId+".json"),attempts=Array.isArray(s?.attempts)?s.attempts:[],latest=attempts.length?attempts[attempts.length-1]:null,st=attemptState(a,s),allowed=st.allowedAttempts,effectiveDueAt=st.effectiveDueAt,avail=st.availability,canAttempt=st.canAttempt;
   const gradingStatus=deriveGradingStatus(latest);                          // notSubmitted | pendingReview | final
   const dashboardState=deriveDashboardState(s,avail,gradingStatus);
   if(latest){completed++;sum+=Number(latest.percentage||0)}
   if(latest)submitted++;
   if(dashboardState==="inProgress")inProgress++;
   else if(dashboardState==="awaitingReview")pendingReview++;
   else if(dashboardState==="completed")finalized++;
   else if(dashboardState==="scheduled")scheduled++;
   else if(dashboardState==="closedUnsubmitted")closedUnsubmitted++;
   else if(dashboardState==="available")available++;
   // averageFinalized: latest percentage ONLY for assignments whose latest grading status is final
   // (never includes a provisional/pending grade).
   if(gradingStatus==="final"&&latest){finalSum+=Number(latest.percentage||0);finalCount++}
   const latestResult=latest?{attemptNumber:Number(latest.attemptNumber||0),score:Number(latest.score||0),totalMarks:Number(latest.totalMarks||0),percentage:Number(latest.percentage||0),submittedAt:String(latest.submittedAt||""),manualReviewMarks:Number(latest.manualReviewMarks||0),finalized:latest.finalized===true,gradingStatus,teacherFeedback:String(latest.teacherFeedback||"")}:null;
   assignments.push({assignmentId:String(a.assignmentId||""),title:String(a.title||""),instructions:String(a.instructions||""),openAt:String(a.openAt||""),dueAt:String(a.dueAt||""),effectiveDueAt:String(effectiveDueAt||""),sourceExamTitle:String(a.sourceExamTitle||""),questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),durationMinutes:Number(a.durationMinutes||0),attemptModelVersion:attemptModelVersion(a),attemptStatus:deriveAttemptStatus(s),hasActiveAttempt:!!activeAttemptOf(s),availability:avail,dashboardState,gradingStatus,attemptsUsed:attempts.length,allowedAttempts:allowed,canAttempt,latestScore:latest?Number(latest.score||0):null,latestPercentage:latest?Number(latest.percentage||0):null,latestResult,createdAt:String(a.createdAt||"")})
  }
  assignments.sort((a,b)=>(a.dueAt?new Date(a.dueAt).getTime():Number.MAX_SAFE_INTEGER)-(b.dueAt?new Date(b.dueAt).getTime():Number.MAX_SAFE_INTEGER));
  return {status:200,jsonBody:{ok:true,student:{userId:student.userId,code:student.code,displayName:student.displayName,classId:student.classId,avatarId:String(student.avatarId||""),shareAchievements:student.shareAchievements!==false},classroom:classroom?{classId:classroom.classId,name:classroom.name,grade:classroom.grade,schoolYear:classroom.schoolYear}:null,assignments,stats:{assigned:assignments.length,completed,average:completed?Number((sum/completed).toFixed(1)):null,submitted,inProgress,pendingReview,finalized,scheduled,available,closedUnsubmitted,averageFinalized:finalCount?Number((finalSum/finalCount).toFixed(1)):null},phase:"2.0C"}};
 }catch{return {status:500,jsonBody:{ok:false,error:"تعذر تحميل لوحة الطالب حاليًا."}}}
}
app.http("studentDashboard",{methods:["GET"],authLevel:"anonymous",route:"student-dashboard",handler:withObservability("student-dashboard",handler)});
module.exports={handler};
