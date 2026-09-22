
const {app}=require("@azure/functions");
const {withObservability}=require("../lib/observability");
const {requireActiveStudentSession}=require("../lib/student-auth");
const {downloadJsonOrNull,listJson,mapConcurrent,getReadConcurrency}=require("../lib/platform-storage");
const {normalizeClassStatus}=require("../lib/class-lifecycle");
const {attemptState,deriveAttemptStatus,attemptModelVersion,activeAttemptOf}=require("../lib/assignment-availability");
const {deriveGradingStatus}=require("../lib/grading-status");
// Unified Strength (نقاط القوة): finalized exams × 100 + Learning-Practice best (≤ 40 each, all 36 items) + Study
// Practice (≤ 20 per module) + projects (round(overallProgress × 4), ≤ 400 each) → the raw total and the visible
// 25-stage path (80 points per stage, 2000 max) — every stage field is decided HERE by student-strength.js; the
// browser never derives a stage. Project progress comes from the SAME loader as /api/student-project-tracker.
const {buildStrengthSummary}=require("../lib/student-strength");
const {studyDocName,studyModulesForStrength}=require("../lib/learning-study");
const {listLearningCourses}=require("../lib/learning-materials-registry");
const {loadStudentProjects}=require("../lib/project-tracker/student-projects");
const {aggregateRecognition,medalTierFromPercentage,emptyRecognition}=require("../lib/achievement-feed");
const {recordGlobalRankMilestone}=require("../lib/achievement-milestones");
const AP="platform/assignments/",SP="platform/submissions/",LP="platform/learning-practice/";
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
// implementations are used). It does not change runtime behavior. Roadmap #30 adds `mapConcurrent` and
// `getReadConcurrency` seams so concurrency tests stay isolated (never by changing the global read concurrency).
async function handler(request,deps={},obs=null){
 const ras=deps.requireActiveStudentSession||requireActiveStudentSession,dl=deps.downloadJsonOrNull||downloadJsonOrNull,ls=deps.listJson||listJson,mc=deps.mapConcurrent||mapConcurrent,readConcurrency=deps.getReadConcurrency||getReadConcurrency;
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
  // Exam Strength is DERIVED from the CURRENT authoritative final percentages (gradingStatus==="final"), summed and
  // rounded per result — never a flat per-exam award and never a stored counter. Collected in the SAME loop below
  // (no extra read); a correction to a stored final grade changes the value on the next dashboard read.
  const finalizedPercentages=[];
  // Roadmap #30: the selected assignments (published, this student's class) are fixed FIRST, then their
  // submissions are read with BOUNDED concurrency through the R27 primitive (order-preserving, index-aligned,
  // the first non-404 failure rejects — nothing partial). Still exactly ONE submission read per selected
  // assignment and zero for drafts/archived/other classes; the derivation below runs in the same order as before.
  const selected=raw.filter(x=>x.status==="published"&&String(x.classId||"")===String(student.classId||""));
  const submissions=await mc(selected,readConcurrency(),a=>dl(c,SP+a.assignmentId+"/"+student.userId+".json"));
  for(let i=0;i<selected.length;i++){const a=selected[i];
   // ONE submission read per assignment (unchanged) — every new field is derived from this same object.
   const s=submissions[i],attempts=Array.isArray(s?.attempts)?s.attempts:[],latest=attempts.length?attempts[attempts.length-1]:null,st=attemptState(a,s),allowed=st.allowedAttempts,effectiveDueAt=st.effectiveDueAt,avail=st.availability,canAttempt=st.canAttempt;
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
   if(gradingStatus==="final"&&latest){finalSum+=Number(latest.percentage||0);finalCount++;finalizedPercentages.push(Number(latest.percentage))}
   // gradingStatus is the normalized authoritative field. `finalized` is echoed as the historical RAW value
   // and OMITTED entirely when the stored result never had it (legacy) — never fabricated to false, which
   // would contradict a legacy result whose gradingStatus normalizes to "final".
   const latestResult=latest?{attemptNumber:Number(latest.attemptNumber||0),score:Number(latest.score||0),totalMarks:Number(latest.totalMarks||0),percentage:Number(latest.percentage||0),submittedAt:String(latest.submittedAt||""),manualReviewMarks:Number(latest.manualReviewMarks||0),gradingStatus,teacherFeedback:String(latest.teacherFeedback||""),...(latest.finalized===undefined?{}:{finalized:latest.finalized})}:null;
   assignments.push({assignmentId:String(a.assignmentId||""),title:String(a.title||""),instructions:String(a.instructions||""),openAt:String(a.openAt||""),dueAt:String(a.dueAt||""),effectiveDueAt:String(effectiveDueAt||""),sourceExamTitle:String(a.sourceExamTitle||""),questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),durationMinutes:Number(a.durationMinutes||0),attemptModelVersion:attemptModelVersion(a),attemptStatus:deriveAttemptStatus(s),hasActiveAttempt:!!activeAttemptOf(s),availability:avail,dashboardState,gradingStatus,attemptsUsed:attempts.length,allowedAttempts:allowed,canAttempt,latestScore:latest?Number(latest.score||0):null,latestPercentage:latest?Number(latest.percentage||0):null,latestResult,createdAt:String(a.createdAt||"")})
  }
  assignments.sort((a,b)=>(a.dueAt?new Date(a.dueAt).getTime():Number.MAX_SAFE_INTEGER)-(b.dueAt?new Date(b.dueAt).getTime():Number.MAX_SAFE_INTEGER));
  // Strength: ONE practice-summary read + the class's projects (one config + one progress read per project, bounded
  // concurrency, no scans). `finalized` is the same server-derived count the stats expose.
  const now=new Date().toISOString();
  const practiceDoc=await dl(c,LP+student.userId+".json");
  // Study Practice: ONE completion-state read; points re-derived against the generated key index (never stored).
  const studyDoc=await dl(c,studyDocName(student.userId));
  const study=studyModulesForStrength(studyDoc,listLearningCourses().map(x=>x.courseId));
  const projects=classroom?await loadStudentProjects(c,classroom,String(student.classId||""),student.userId,now,{...deps,downloadJsonOrNull:dl,mapConcurrent:mc,getReadConcurrency:readConcurrency}):[];
  const strength=buildStrengthSummary({finalizedPercentages,trainings:practiceDoc&&practiceDoc.trainings,study,projects:projects.map(p=>({projectCode:p.projectCode,overallProgress:p.summary.overallProgress}))});
  // Recognition (never Strength): the global stage-up milestone is observed HERE — the one place the total Strength is
  // built — against the persisted last-seen stage (create-only event ids, baseline on first sight); the summary counts
  // medals (the same finalized-only authority as the portal), reactions RECEIVED and non-medal achievements lifetime.
  const recMilestone=deps.recordGlobalRankMilestone||recordGlobalRankMilestone,recAgg=deps.aggregateRecognition||aggregateRecognition;
  await recMilestone(c,{student,classId:String(student.classId||""),strength,now},deps);
  const medals={total:0,gold:0,silver:0,bronze:0};
  for(const a of assignments){if(a.gradingStatus!=="final"||!a.latestResult)continue;const t=medalTierFromPercentage(Number(a.latestResult.percentage));if(t){medals.total++;medals[t]++}}
  let rec=emptyRecognition();
  try{rec=(await recAgg(c,[student.userId],deps)).get(student.userId)||rec}catch(e){obs?.logError("student.dashboard.recognition",e)}   // secondary: never fails the dashboard
  const recognition={medals,reactionsReceived:{total:rec.receivedReactionCount,byType:rec.receivedReactionByType},achievements:{total:rec.achievementCount,byType:rec.achievementByType}};
  return {status:200,jsonBody:{ok:true,student:{userId:student.userId,code:student.code,displayName:student.displayName,classId:student.classId,avatarId:String(student.avatarId||""),shareAchievements:student.shareAchievements!==false,profilePhoto:student.profilePhoto&&typeof student.profilePhoto==="object"&&Number(student.profilePhoto.version)>0?{version:Number(student.profilePhoto.version),updatedAt:String(student.profilePhoto.updatedAt||"")}:null},classroom:classroom?{classId:classroom.classId,name:classroom.name,grade:classroom.grade,schoolYear:classroom.schoolYear}:null,assignments,stats:{assigned:assignments.length,completed,average:completed?Number((sum/completed).toFixed(1)):null,submitted,inProgress,pendingReview,finalized,scheduled,available,closedUnsubmitted,averageFinalized:finalCount?Number((finalSum/finalCount).toFixed(1)):null},strength,recognition,phase:"2.0C"}};
 }catch(e){obs?.logError("student.dashboard.error",e);return {status:500,jsonBody:{ok:false,error:"تعذر تحميل لوحة الطالب حاليًا."}}}
}
app.http("studentDashboard",{methods:["GET"],authLevel:"anonymous",route:"student-dashboard",handler:withObservability("student-dashboard",handler)});
module.exports={handler};
