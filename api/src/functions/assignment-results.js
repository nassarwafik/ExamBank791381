
const {app}=require("@azure/functions");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull,uploadJson,listJson}=require("../lib/platform-storage");
const AP="platform/assignments/",SP="platform/submissions/",UP="platform/users/";
app.http("assignmentResults",{methods:["GET","POST"],authLevel:"anonymous",route:"assignment-results",handler:async request=>{
 try{
  const auth=requireBuilderAuth(request);if(!auth.ok)return auth.response;const c=getContainer();
  if(request.method==="GET"){
   const u=new URL(request.url),id=String(u.searchParams.get("assignmentId")||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
   const a=await downloadJsonOrNull(c,AP+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
   const users=(await listJson(c,UP)).filter(x=>String(x.classId||"")===String(a.classId||"")&&x.active!==false);
   const out=[];for(const student of users){const s=await downloadJsonOrNull(c,SP+id+"/"+student.userId+".json"),attempts=Array.isArray(s?.attempts)?s.attempts:[],latest=attempts.length?attempts[attempts.length-1]:null,base=Math.max(1,Number(a.maxAttempts||1)),allowed=Math.max(base,Number(s?.allowedAttempts||0));out.push({studentId:student.userId,studentName:student.displayName,studentCode:student.code,attemptsUsed:attempts.length,allowedAttempts:allowed,latestResult:latest?{score:latest.score,totalMarks:latest.totalMarks,percentage:latest.percentage,submittedAt:latest.submittedAt,finalized:latest.finalized,manualReviewMarks:latest.manualReviewMarks}:null})}
   out.sort((x,y)=>String(x.studentName).localeCompare(String(y.studentName),"ar"));return {status:200,jsonBody:{ok:true,assignment:{assignmentId:a.assignmentId,title:a.title,maxAttempts:Math.max(1,Number(a.maxAttempts||1))},students:out}};
  }
  let b={};try{b=await request.json()}catch{}if(String(b.action)!=="allowRetry")return {status:400,jsonBody:{ok:false,error:"Unsupported result action."}};
  const id=String(b.assignmentId||""),studentId=String(b.studentId||"");if(!id||!studentId)return {status:400,jsonBody:{ok:false,error:"assignmentId and studentId are required."}};
  const a=await downloadJsonOrNull(c,AP+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
  const name=SP+id+"/"+studentId+".json";let s=await downloadJsonOrNull(c,name);if(!s)s={schemaVersion:1,assignmentId:id,studentId,classId:a.classId,allowedAttempts:null,draftAnswers:{},attempts:[],createdAt:new Date().toISOString()};
  const used=Array.isArray(s.attempts)?s.attempts.length:0,base=Math.max(1,Number(a.maxAttempts||1));s.allowedAttempts=Math.max(base,Number(s.allowedAttempts||0),used+1);s.updatedAt=new Date().toISOString();await uploadJson(c,name,s);
  return {status:200,jsonBody:{ok:true,allowedAttempts:s.allowedAttempts}};
 }catch(e){return {status:500,jsonBody:{ok:false,error:e instanceof Error?e.message:"Results action failed."}}}
}});
