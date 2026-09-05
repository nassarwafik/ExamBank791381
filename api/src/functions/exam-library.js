const {app}=require("@azure/functions");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull}=require("../lib/platform-storage");
const PREFIX="platform/exam-library/";
const VALID_ID=/^[A-Za-z0-9_-]+$/;
app.http("examLibrary",{methods:["GET"],authLevel:"anonymous",route:"exam-library/{id?}",handler:async request=>{
 try{
  const auth=requireBuilderAuth(request);if(!auth.ok)return auth.response;
  const c=getContainer(),id=String(request.params?.id||"").trim();
  if(!id){
   const catalog=await downloadJsonOrNull(c,PREFIX+"catalog.json");
   return {status:200,jsonBody:{ok:true,catalog:Array.isArray(catalog)?catalog:[]}};
  }
  if(!VALID_ID.test(id))return {status:400,jsonBody:{ok:false,error:"معرّف غير صالح."}};
  const item=await downloadJsonOrNull(c,PREFIX+"items/"+id+".json");
  if(!item)return {status:404,jsonBody:{ok:false,error:"العنصر غير موجود في المكتبة."}};
  return {status:200,jsonBody:{ok:true,item}};
 }catch{return {status:500,jsonBody:{ok:false,error:"تعذر تحميل مكتبة الامتحانات حاليًا."}}}
}});
