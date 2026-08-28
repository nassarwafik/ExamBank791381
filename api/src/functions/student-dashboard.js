
const {app}=require("@azure/functions");
const {requireStudentAuth}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull,listJson}=require("../lib/platform-storage");
const AP="platform/assignments/",SP="platform/submissions/";
function availability(a){const now=Date.now(),o=a.openAt?new Date(a.openAt).getTime():0,d=a.dueAt?new Date(a.dueAt).getTime():0;if(o&&o>now)return "scheduled";if(d&&d<now)return "closed";return "open"}
app.http("studentDashboard",{methods:["GET"],authLevel:"anonymous",route:"student-dashboard",handler:async request=>{
 try{
  const auth=requireStudentAuth(request);if(!auth.ok)return auth.response;const c=getContainer(),student=await downloadJsonOrNull(c,"platform/users/"+auth.user.sub+".json");if(!student||student.active===false)return {status:401,jsonBody:{ok:false,error:"الحساب غير فعّال."}};
  const classroom=student.classId?await downloadJsonOrNull(c,"platform/classes/"+student.classId+".json"):null,raw=await listJson(c,AP),assignments=[];let completed=0,sum=0;
  for(const a of raw.filter(x=>x.status==="published"&&String(x.classId||"")===String(student.classId||""))){
   const s=await downloadJsonOrNull(c,SP+a.assignmentId+"/"+student.userId+".json"),attempts=Array.isArray(s?.attempts)?s.attempts:[],latest=attempts.length?attempts[attempts.length-1]:null,base=Math.max(1,Number(a.maxAttempts||1)),allowed=Math.max(base,Number(s?.allowedAttempts||0)),avail=availability(a),canAttempt=avail==="open"&&attempts.length<allowed;
   if(latest){completed++;sum+=Number(latest.percentage||0)}
   assignments.push({assignmentId:String(a.assignmentId||""),title:String(a.title||""),instructions:String(a.instructions||""),openAt:String(a.openAt||""),dueAt:String(a.dueAt||""),sourceExamTitle:String(a.sourceExamTitle||""),questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),availability:avail,attemptsUsed:attempts.length,allowedAttempts:allowed,canAttempt,latestScore:latest?Number(latest.score||0):null,latestPercentage:latest?Number(latest.percentage||0):null,createdAt:String(a.createdAt||"")})
  }
  assignments.sort((a,b)=>(a.dueAt?new Date(a.dueAt).getTime():Number.MAX_SAFE_INTEGER)-(b.dueAt?new Date(b.dueAt).getTime():Number.MAX_SAFE_INTEGER));
  return {status:200,jsonBody:{ok:true,student:{userId:student.userId,code:student.code,displayName:student.displayName,classId:student.classId},classroom:classroom?{classId:classroom.classId,name:classroom.name,grade:classroom.grade,schoolYear:classroom.schoolYear}:null,assignments,stats:{assigned:assignments.length,completed,average:completed?Number((sum/completed).toFixed(1)):null},phase:"2.0C"}};
 }catch(e){return {status:500,jsonBody:{ok:false,error:e instanceof Error?e.message:"Student dashboard failed."}}}
}});
