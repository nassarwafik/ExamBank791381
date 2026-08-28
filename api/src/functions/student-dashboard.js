
const {app}=require("@azure/functions");
const {requireStudentAuth}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull,listJson}=require("../lib/platform-storage");
const PREFIX="platform/assignments/";
function availability(a){const now=Date.now(),o=a.openAt?new Date(a.openAt).getTime():0,d=a.dueAt?new Date(a.dueAt).getTime():0;if(o&&o>now)return "scheduled";if(d&&d<now)return "closed";return "open"}
app.http("studentDashboard",{methods:["GET"],authLevel:"anonymous",route:"student-dashboard",handler:async request=>{
 try{
  const auth=requireStudentAuth(request);if(!auth.ok)return auth.response;
  const c=getContainer(),student=await downloadJsonOrNull(c,"platform/users/"+auth.user.sub+".json");if(!student||student.active===false)return {status:401,jsonBody:{ok:false,error:"الحساب غير فعّال."}};
  const classroom=student.classId?await downloadJsonOrNull(c,"platform/classes/"+student.classId+".json"):null;
  const raw=await listJson(c,PREFIX);
  const assignments=raw.filter(a=>a.status==="published"&&String(a.classId||"")===String(student.classId||"")).map(a=>({assignmentId:String(a.assignmentId||""),title:String(a.title||""),instructions:String(a.instructions||""),openAt:String(a.openAt||""),dueAt:String(a.dueAt||""),sourceExamTitle:String(a.sourceExamTitle||""),questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),availability:availability(a),createdAt:String(a.createdAt||"")})).sort((a,b)=>{const x=a.dueAt?new Date(a.dueAt).getTime():Number.MAX_SAFE_INTEGER,y=b.dueAt?new Date(b.dueAt).getTime():Number.MAX_SAFE_INTEGER;return x-y});
  return {status:200,jsonBody:{ok:true,student:{userId:student.userId,code:student.code,displayName:student.displayName,classId:student.classId},classroom:classroom?{classId:classroom.classId,name:classroom.name,grade:classroom.grade,schoolYear:classroom.schoolYear}:null,assignments,stats:{assigned:assignments.length,completed:0,average:null},phase:"2.0B"}};
 }catch(e){return {status:500,jsonBody:{ok:false,error:e instanceof Error?e.message:"Student dashboard failed."}}}
}});
