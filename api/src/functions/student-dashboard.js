
const {app}=require("@azure/functions");
const {requireActiveStudentSession}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull,listJson}=require("../lib/platform-storage");
const {normalizeClassStatus}=require("../lib/class-lifecycle");
const {attemptState,deriveAttemptStatus,attemptModelVersion,activeAttemptOf}=require("../lib/assignment-availability");
const AP="platform/assignments/",SP="platform/submissions/";
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
  const raw=await ls(c,AP),assignments=[];let completed=0,sum=0;
  for(const a of raw.filter(x=>x.status==="published"&&String(x.classId||"")===String(student.classId||""))){
   const s=await dl(c,SP+a.assignmentId+"/"+student.userId+".json"),attempts=Array.isArray(s?.attempts)?s.attempts:[],latest=attempts.length?attempts[attempts.length-1]:null,st=attemptState(a,s),allowed=st.allowedAttempts,effectiveDueAt=st.effectiveDueAt,avail=st.availability,canAttempt=st.canAttempt;
   if(latest){completed++;sum+=Number(latest.percentage||0)}
   assignments.push({assignmentId:String(a.assignmentId||""),title:String(a.title||""),instructions:String(a.instructions||""),openAt:String(a.openAt||""),dueAt:String(a.dueAt||""),effectiveDueAt:String(effectiveDueAt||""),sourceExamTitle:String(a.sourceExamTitle||""),questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),durationMinutes:Number(a.durationMinutes||0),attemptModelVersion:attemptModelVersion(a),attemptStatus:deriveAttemptStatus(s),hasActiveAttempt:!!activeAttemptOf(s),availability:avail,attemptsUsed:attempts.length,allowedAttempts:allowed,canAttempt,latestScore:latest?Number(latest.score||0):null,latestPercentage:latest?Number(latest.percentage||0):null,createdAt:String(a.createdAt||"")})
  }
  assignments.sort((a,b)=>(a.dueAt?new Date(a.dueAt).getTime():Number.MAX_SAFE_INTEGER)-(b.dueAt?new Date(b.dueAt).getTime():Number.MAX_SAFE_INTEGER));
  return {status:200,jsonBody:{ok:true,student:{userId:student.userId,code:student.code,displayName:student.displayName,classId:student.classId,avatarId:String(student.avatarId||""),shareAchievements:student.shareAchievements!==false},classroom:classroom?{classId:classroom.classId,name:classroom.name,grade:classroom.grade,schoolYear:classroom.schoolYear}:null,assignments,stats:{assigned:assignments.length,completed,average:completed?Number((sum/completed).toFixed(1)):null},phase:"2.0C"}};
 }catch{return {status:500,jsonBody:{ok:false,error:"تعذر تحميل لوحة الطالب حاليًا."}}}
}
app.http("studentDashboard",{methods:["GET"],authLevel:"anonymous",route:"student-dashboard",handler});
module.exports={handler};
