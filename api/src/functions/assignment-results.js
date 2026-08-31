
const {app}=require("@azure/functions");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull,listJson,mutateJsonWithRetry,StorageConflictError}=require("../lib/platform-storage");
const {recordAuditEvent}=require("../lib/audit-log");
const AP="platform/assignments/",SP="platform/submissions/",UP="platform/users/";
const CONFLICT_MESSAGE="حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
app.http("assignmentResults",{methods:["GET","POST"],authLevel:"anonymous",route:"assignment-results",handler:async request=>{
 try{const auth=requireBuilderAuth(request);if(!auth.ok)return auth.response;const c=getContainer();
  if(request.method==="GET"){
   const u=new URL(request.url),id=String(u.searchParams.get("assignmentId")||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};const a=await downloadJsonOrNull(c,AP+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
   const users=(await listJson(c,UP)).filter(x=>String(x.classId||"")===String(a.classId||"")&&x.active!==false),out=[];let submitted=0,pending=0,sum=0,highest=null,lowest=null;
   for(const student of users){const s=await downloadJsonOrNull(c,SP+id+"/"+student.userId+".json"),attempts=Array.isArray(s?.attempts)?s.attempts:[],latest=attempts.length?attempts[attempts.length-1]:null,base=Math.max(1,Number(a.maxAttempts||1)),allowed=Math.max(base,Number(s?.allowedAttempts||0));if(latest){submitted++;sum+=Number(latest.percentage||0);highest=highest===null?Number(latest.percentage||0):Math.max(highest,Number(latest.percentage||0));lowest=lowest===null?Number(latest.percentage||0):Math.min(lowest,Number(latest.percentage||0));if(!latest.finalized)pending++}out.push({studentId:student.userId,studentName:student.displayName,studentCode:student.code,attemptsUsed:attempts.length,allowedAttempts:allowed,dueAtOverride:s&&s.dueAtOverride?String(s.dueAtOverride):null,attempts:attempts.map(x=>({attemptNumber:x.attemptNumber,score:x.score,totalMarks:x.totalMarks,percentage:x.percentage,submittedAt:x.submittedAt,finalized:x.finalized,manualReviewMarks:x.manualReviewMarks})),latestResult:latest?{attemptNumber:latest.attemptNumber,score:latest.score,totalMarks:latest.totalMarks,percentage:latest.percentage,submittedAt:latest.submittedAt,finalized:latest.finalized,manualReviewMarks:latest.manualReviewMarks,teacherFeedback:String(latest.teacherFeedback||"")}:null})}
   out.sort((x,y)=>String(x.studentName).localeCompare(String(y.studentName),"ar"));return {status:200,jsonBody:{ok:true,assignment:{assignmentId:a.assignmentId,title:a.title,dueAt:String(a.dueAt||""),maxAttempts:Math.max(1,Number(a.maxAttempts||1)),totalMarks:Number(a.totalMarks||0)},stats:{students:users.length,submitted,pendingReview:pending,average:submitted?Number((sum/submitted).toFixed(1)):null,highest,lowest},students:out}};
  }
  let b={};try{b=await request.json()}catch{}const resultAction=String(b.action||"");
  if(resultAction==="allowRetry"){
   const id=String(b.assignmentId||""),studentId=String(b.studentId||"");if(!id||!studentId)return {status:400,jsonBody:{ok:false,error:"assignmentId and studentId are required."}};
   const a=await downloadJsonOrNull(c,AP+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
   const student=await downloadJsonOrNull(c,UP+studentId+".json");if(!student)return {status:404,jsonBody:{ok:false,error:"الطالب غير موجود."}};
   if(String(student.classId||"")!==String(a.classId||""))return {status:403,jsonBody:{ok:false,error:"الطالب لا ينتمي إلى صف هذا الواجب."}};
   const name=SP+id+"/"+studentId+".json";
   let finalAllowed=null;
   try{
    await mutateJsonWithRetry(c,name,current=>{
     const doc=current||{schemaVersion:1,assignmentId:id,studentId,classId:a.classId,studentCode:String(student.code||""),studentName:String(student.displayName||""),allowedAttempts:null,draftAnswers:{},attempts:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
     const used=Array.isArray(doc.attempts)?doc.attempts.length:0,base=Math.max(1,Number(a.maxAttempts||1));
     doc.allowedAttempts=Math.max(base,Number(doc.allowedAttempts||0),used+1);
     doc.updatedAt=new Date().toISOString();
     finalAllowed=doc.allowedAttempts;
     return doc;
    });
   }catch(e){
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    throw e;
   }
   await recordAuditEvent(c,{actor:auth.user?.sub,action:"assignment.allowRetry",targetType:"student",targetId:studentId,targetLabel:String(student.displayName||student.code||""),details:{assignmentId:id,allowedAttempts:finalAllowed}});
   return {status:200,jsonBody:{ok:true,allowedAttempts:finalAllowed}};
  }
  if(resultAction==="setDueAtOverride"){
   const id=String(b.assignmentId||""),studentId=String(b.studentId||"");if(!id||!studentId)return {status:400,jsonBody:{ok:false,error:"assignmentId and studentId are required."}};
   const a=await downloadJsonOrNull(c,AP+id+".json");if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
   const student=await downloadJsonOrNull(c,UP+studentId+".json");if(!student)return {status:404,jsonBody:{ok:false,error:"الطالب غير موجود."}};
   if(String(student.classId||"")!==String(a.classId||""))return {status:403,jsonBody:{ok:false,error:"الطالب لا ينتمي إلى صف هذا الواجب."}};
   const raw=b.dueAtOverride;
   let nextOverride;
   if(raw===null||raw===undefined||raw===""){nextOverride=null}
   else{
    if(!a.dueAt)return {status:400,jsonBody:{ok:false,error:"الواجب لا يملك موعد تسليم أصلي لتمديده."}};
    const ms=new Date(raw).getTime();if(!Number.isFinite(ms))return {status:400,jsonBody:{ok:false,error:"تاريخ غير صالح."}};
    if(ms<=new Date(a.dueAt).getTime())return {status:400,jsonBody:{ok:false,error:"يجب أن يكون الموعد الجديد بعد الموعد الأصلي للواجب."}};
    nextOverride=new Date(ms).toISOString();
   }
   const name=SP+id+"/"+studentId+".json";
   try{
    await mutateJsonWithRetry(c,name,current=>{
     const doc=current||{schemaVersion:1,assignmentId:id,studentId,classId:a.classId,studentCode:String(student.code||""),studentName:String(student.displayName||""),allowedAttempts:null,draftAnswers:{},attempts:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
     doc.dueAtOverride=nextOverride;
     doc.updatedAt=new Date().toISOString();
     return doc;
    });
   }catch(e){
    if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
    throw e;
   }
   await recordAuditEvent(c,{actor:auth.user?.sub,action:"assignment.setDueAtOverride",targetType:"student",targetId:studentId,targetLabel:String(student.displayName||student.code||""),details:{assignmentId:id,dueAtOverride:nextOverride}});
   return {status:200,jsonBody:{ok:true,dueAtOverride:nextOverride}};
  }
  return {status:400,jsonBody:{ok:false,error:"Unsupported result action."}};
 }catch{return {status:500,jsonBody:{ok:false,error:"تعذر تنفيذ عملية النتائج حاليًا."}}}
}});
