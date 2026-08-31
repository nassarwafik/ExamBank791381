
const {app}=require("@azure/functions");
const {requireStudentAuth}=require("../lib/student-auth");
const {getContainer,mutateJsonWithRetry,StorageConflictError}=require("../lib/platform-storage");
const UP="platform/users/";
const CONFLICT_MESSAGE="حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
// Mirrors the AVATAR_OPTIONS ids in src/avatars.tsx — kept as a fixed allow-list so a student
// can only ever set avatarId to one of the preset options, never an arbitrary string.
const VALID_AVATARS=new Set(["a1","a2","a3","a4","a5","a6","a7","a8","a9","a10","a11","a12"]);
app.http("studentProfile",{methods:["POST"],authLevel:"anonymous",route:"student-profile",handler:async request=>{
 try{
  const auth=requireStudentAuth(request);if(!auth.ok)return auth.response;
  const c=getContainer();
  let b={};try{b=await request.json()}catch{}
  const action=String(b?.action||"").trim();
  if(action!=="setAvatar")return {status:400,jsonBody:{ok:false,error:"Unsupported profile action."}};
  const avatarId=String(b?.avatarId||"").trim();
  if(!VALID_AVATARS.has(avatarId))return {status:400,jsonBody:{ok:false,error:"الأيقونة غير صالحة."}};
  let updated=null;
  try{
   updated=await mutateJsonWithRetry(c,UP+auth.user.sub+".json",current=>{
    if(!current||current.role!=="student"){const err=new Error("الطالب غير موجود.");err.httpStatus=404;throw err}
    current.avatarId=avatarId;
    current.updatedAt=new Date().toISOString();
    return current;
   });
  }catch(e){
   if(e instanceof StorageConflictError)return {status:503,jsonBody:{ok:false,error:CONFLICT_MESSAGE}};
   if(e?.httpStatus)return {status:e.httpStatus,jsonBody:{ok:false,error:e.message}};
   throw e;
  }
  return {status:200,jsonBody:{ok:true,avatarId:updated.avatarId}};
 }catch{return {status:500,jsonBody:{ok:false,error:"تعذر تحديث الأيقونة حاليًا."}}}
}});
