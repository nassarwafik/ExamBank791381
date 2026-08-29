const fs=require("fs"),path=require("path"),{execFileSync}=require("child_process");
const root=process.cwd(),P=(...x)=>path.join(root,...x);
const F={
 app:P("src","App.tsx"),
 portal:P("src","StudentPortal.tsx"),
 exam:P("src","StudentExamPage.tsx"),
 panel:P("src","AssignmentsPanel.tsx"),
 css:P("src","platform.css"),
 grading:P("api","src","lib","assignment-grading.js"),
 manage:P("api","src","functions","manage-assignments.js"),
 assignment:P("api","src","functions","student-assignment.js"),
 submission:P("api","src","functions","student-submission.js"),
 results:P("api","src","functions","assignment-results.js"),
 dashboard:P("api","src","functions","student-dashboard.js")
};
const norm=s=>String(s||"").replace(/\r\n/g,"\n").replace(/^\uFEFF/,"");
function die(m){console.error("\nERROR: "+m);process.exit(1)}
function read(f){if(!fs.existsSync(f))die("Missing "+f);return norm(fs.readFileSync(f,"utf8"))}
function write(f,s){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,norm(s),"utf8")}
function bak(f){if(fs.existsSync(f)&&!fs.existsSync(f+".bak-v2-phase-c"))fs.copyFileSync(f,f+".bak-v2-phase-c")}
function rep(s,a,b,n){const i=s.indexOf(a);if(i<0)die("Could not locate: "+n);return s.slice(0,i)+b+s.slice(i+a.length)}
let branch="";try{branch=execFileSync("git",["branch","--show-current"],{cwd:root,encoding:"utf8"}).trim()}catch{die("Cannot determine Git branch")}
if(!branch||branch==="main")die("Phase C must be installed on v2-dev, not main.");
let app=read(F.app);
if(!app.includes("EXAMBANK_2_PHASE_B"))die("Phase B was not detected.");
if(app.includes("EXAMBANK_2_PHASE_C")){console.log("ExamBank 2.0 Phase C is already installed.");process.exit(0)}
[F.app,F.portal,F.panel,F.css,F.manage,F.assignment,F.dashboard].forEach(bak);

/* ========================= GRADING ========================= */
write(F.grading,String.raw`
function clean(v){
  return String(v??"")
    .normalize("NFKC")
    .replace(/[ـ]/g,"")
    .replace(/[،,]/g,",")
    .replace(/[؛;]/g,";")
    .replace(/[–—−]/g,"-")
    .replace(/\s+/g," ")
    .trim()
    .toLowerCase();
}
function tableRows(text){
  const lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(x=>x.startsWith("|")&&x.endsWith("|"));
  if(lines.length<2)return [];
  const split=line=>line.slice(1,-1).split("|").map(x=>x.trim());
  const rows=lines.map(split).filter(c=>!c.every(x=>/^:?-{3,}:?$/.test(x.replace(/\s/g,""))));
  return rows.length>1?rows.slice(1):[];
}
function marks(question){return Math.max(0,Number(question?.marks??question?.points??0)||0)}
function gradeChoice(question,response,answer){
  const idx=Number(response?.index);
  if(!Number.isInteger(idx)||idx<0)return false;
  const options=Array.isArray(question?.options)?question.options:[];
  const option=options[idx]||{};
  if(Number.isInteger(Number(answer?.correctOptionIndex))&&idx===Number(answer.correctOptionIndex))return true;
  if(answer?.correctText&&clean(option.text??option.label??option.value)===clean(answer.correctText))return true;
  const eng=["a","b","c","d","e","f","g","h"],ar=["أ","ب","ج","د","هـ","و","ز","ح"];
  const candidates=[
    option.value,option.label,option.text,String(idx+1),eng[idx],ar[idx]
  ].filter(v=>v!==undefined&&v!==null).map(clean);
  const expected=[answer?.correctOptionValue,answer?.correctOptionLabel,...(Array.isArray(answer?.values)?answer.values:[])].filter(Boolean).map(clean);
  return expected.some(x=>candidates.includes(x));
}
function gradeSequence(response,answer,max){
  const actual=Array.isArray(response?.values)?response.values:[];
  const expected=Array.isArray(answer?.values)?answer.values:[];
  if(!expected.length)return {score:0,manualReview:true};
  let correct=0;
  expected.forEach((v,i)=>{if(clean(actual[i])===clean(v))correct++});
  return {score:max*(correct/expected.length),manualReview:false,parts:{correct,total:expected.length}};
}
function pairMap(answerText){
  const m=new Map();
  String(answerText||"").split(/[؛;]/).forEach(part=>{
    const p=part.split("=");
    if(p.length>=2)m.set(clean(p[0]),clean(p.slice(1).join("=")));
  });
  return m;
}
function gradeTable(question,response,answer,max){
  const rows=tableRows(question?.text);
  const vals=Array.isArray(response?.values)?response.values:[];
  if(!rows.length||!vals.length)return {score:0,manualReview:true};
  const amap=pairMap(answer?.text);
  if(amap.size){
    let ok=0,total=Math.min(rows.length,vals.length);
    for(let i=0;i<total;i++){
      const key=clean(rows[i][0]),expected=amap.get(key);
      if(expected!==undefined&&clean(vals[i])===expected)ok++;
    }
    return {score:total?max*(ok/total):0,manualReview:false,parts:{correct:ok,total}};
  }
  const answerText=clean(answer?.text);
  if(answerText){
    let ok=0,total=Math.min(rows.length,vals.length);
    for(let i=0;i<total;i++){
      const expected=answerText.includes(clean(rows[i][0]));
      const actual=vals[i]===true||clean(vals[i])==="true"||clean(vals[i])==="1"||clean(vals[i])==="✓";
      if(actual===expected)ok++;
    }
    return {score:total?max*(ok/total):0,manualReview:false,parts:{correct:ok,total}};
  }
  return {score:0,manualReview:true};
}
function gradeQuestion(question,response){
  const max=marks(question),answer=question?.answer||{},type=String(question?.presentationType||question?.type||"").toLowerCase();
  if(type==="multiplechoice"||response?.kind==="choice"){
    const correct=gradeChoice(question,response,answer);
    return {score:correct?max:0,maxMarks:max,correct,manualReview:false};
  }
  if(answer?.mode==="exactSequence"||answer?.mode==="sequence"||response?.kind==="sequence"){
    const r=gradeSequence(response,answer,max);
    return {...r,maxMarks:max,correct:r.score>=max-1e-9};
  }
  if(response?.kind==="table"){
    const r=gradeTable(question,response,answer,max);
    return {...r,maxMarks:max,correct:r.score>=max-1e-9};
  }
  if(response?.kind==="text"&&answer?.text){
    const a=clean(response.value),e=clean(answer.text);
    const correct=!!a&&a===e;
    return {score:correct?max:0,maxMarks:max,correct,manualReview:!correct};
  }
  return {score:0,maxMarks:max,correct:false,manualReview:true};
}
function gradeExam(exam,answers){
  const qs=Array.isArray(exam?.questions)?exam.questions:[];
  let score=0,total=0,manualMarks=0;
  const questions=qs.map((q,i)=>{
    const id=String(q.examQuestionId||q.id||q.number||i+1);
    const r=gradeQuestion(q,answers?.[id]);
    score+=r.score;total+=r.maxMarks;if(r.manualReview)manualMarks+=r.maxMarks;
    return {questionId:id,questionNumber:i+1,score:Number(r.score.toFixed(2)),maxMarks:r.maxMarks,correct:r.correct,manualReview:r.manualReview,parts:r.parts||null};
  });
  return {score:Number(score.toFixed(2)),totalMarks:Number(total.toFixed(2)),percentage:total?Number((score/total*100).toFixed(2)):0,manualReviewMarks:Number(manualMarks.toFixed(2)),finalized:manualMarks===0,questions};
}
module.exports={gradeExam};
`);

/* ========================= MANAGE ASSIGNMENTS ========================= */
write(F.manage,String.raw`
const {app}=require("@azure/functions"),crypto=require("crypto");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,downloadJsonOrNull,uploadJson,listJson}=require("../lib/platform-storage");
const PREFIX="platform/assignments/",CLASS_PREFIX="platform/classes/";
const iso=v=>{const s=String(v||"").trim();if(!s)return "";const d=new Date(s);if(Number.isNaN(d.getTime()))throw new Error("صيغة التاريخ غير صحيحة.");return d.toISOString()};
function cleanExam(v){const x=JSON.parse(JSON.stringify(v||{}));if(Array.isArray(x.questions))x.questions=x.questions.map(q=>({...q,history:[],redoStack:[]}));x.revisionHistory=[];return x}
function summary(a){return {assignmentId:a.assignmentId,classId:a.classId,className:a.className,title:a.title,instructions:a.instructions,status:a.status,openAt:a.openAt||"",dueAt:a.dueAt||"",sourceExamId:a.sourceExamId||"",sourceExamTitle:a.sourceExamTitle||"",questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),maxAttempts:Math.max(1,Number(a.maxAttempts||1)),createdAt:a.createdAt||"",updatedAt:a.updatedAt||""}}
app.http("manageAssignments",{methods:["GET","POST"],authLevel:"anonymous",route:"assignments",handler:async request=>{
 try{
  const auth=requireBuilderAuth(request);if(!auth.ok)return auth.response;const c=getContainer();
  if(request.method==="GET"){const u=new URL(request.url),classId=String(u.searchParams.get("classId")||"");let list=(await listJson(c,PREFIX)).map(summary);if(classId)list=list.filter(x=>x.classId===classId);list.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));return {status:200,jsonBody:{ok:true,assignments:list}}}
  let b={};try{b=await request.json()}catch{}
  const action=String(b.action||"create").toLowerCase();
  if(action==="create"){
   const classId=String(b.classId||"").trim(),title=String(b.title||"").trim(),instructions=String(b.instructions||"").trim(),exam=cleanExam(b.examSnapshot);
   if(!classId||!title)return {status:400,jsonBody:{ok:false,error:"الصف وعنوان الواجب مطلوبان."}};
   if(!Array.isArray(exam.questions)||!exam.questions.length)return {status:400,jsonBody:{ok:false,error:"افتح أو أنشئ امتحانًا قبل إنشاء الواجب."}};
   const classroom=await downloadJsonOrNull(c,CLASS_PREFIX+classId+".json");if(!classroom||classroom.active===false)return {status:400,jsonBody:{ok:false,error:"الصف غير موجود أو مؤرشف."}};
   const openAt=iso(b.openAt),dueAt=iso(b.dueAt);if(openAt&&dueAt&&new Date(dueAt)<new Date(openAt))return {status:400,jsonBody:{ok:false,error:"موعد التسليم يجب أن يكون بعد موعد الفتح."}};
   const now=new Date().toISOString(),assignmentId=crypto.randomUUID(),maxAttempts=Math.min(10,Math.max(1,Number(b.maxAttempts||1)));
   const a={schemaVersion:2,assignmentId,classId,className:String(classroom.name||""),title,instructions,status:b.publish===true?"published":"draft",openAt,dueAt,maxAttempts,sourceExamId:String(exam.examId||""),sourceExamTitle:String(exam.title||title),questionCount:exam.questions.length,totalMarks:Number(exam.totalMarks||exam.questions.reduce((s,q)=>s+Number(q.marks||0),0)),examSnapshot:exam,createdBy:String(auth.user?.sub||"teacher"),createdAt:now,updatedAt:now};
   await uploadJson(c,PREFIX+assignmentId+".json",a);return {status:200,jsonBody:{ok:true,assignment:summary(a)}};
  }
  if(action==="setstatus"||action==="setmaxattempts"){
   const id=String(b.assignmentId||""),name=PREFIX+id+".json",a=await downloadJsonOrNull(c,name);if(!a)return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};
   if(action==="setstatus"){const status=String(b.status||"").toLowerCase();if(!["draft","published","archived"].includes(status))return {status:400,jsonBody:{ok:false,error:"حالة الواجب غير صحيحة."}};a.status=status}
   else a.maxAttempts=Math.min(10,Math.max(1,Number(b.maxAttempts||1)));
   a.updatedAt=new Date().toISOString();await uploadJson(c,name,a);return {status:200,jsonBody:{ok:true,assignment:summary(a)}};
  }
  if(action==="delete"){const id=String(b.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};await c.getBlobClient(PREFIX+id+".json").deleteIfExists();return {status:200,jsonBody:{ok:true,deleted:true}}}
  return {status:400,jsonBody:{ok:false,error:"Unsupported assignment action."}};
 }catch(e){return {status:500,jsonBody:{ok:false,error:e instanceof Error?e.message:"Assignment action failed."}}}
}});
`);

/* ========================= STUDENT ASSIGNMENT ========================= */
write(F.assignment,String.raw`
const {app}=require("@azure/functions");
const {requireStudentAuth}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull}=require("../lib/platform-storage");
const PREFIX="platform/assignments/";
function studentExam(v){const x=JSON.parse(JSON.stringify(v||{}));x.revisionHistory=[];if(Array.isArray(x.questions))x.questions=x.questions.map(q=>({...q,answer:{},hint:"",teacherNote:"",aiInstruction:"",history:[],redoStack:[]}));return x}
app.http("studentAssignment",{methods:["GET"],authLevel:"anonymous",route:"student-assignment/{assignmentId}",handler:async request=>{
 try{
  const auth=requireStudentAuth(request);if(!auth.ok)return auth.response;const id=String(request.params?.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
  const c=getContainer(),student=await downloadJsonOrNull(c,"platform/users/"+auth.user.sub+".json");if(!student||student.active===false)return {status:401,jsonBody:{ok:false,error:"الحساب غير فعّال."}};
  const a=await downloadJsonOrNull(c,PREFIX+id+".json");if(!a||a.status!=="published"||String(a.classId)!==String(student.classId))return {status:404,jsonBody:{ok:false,error:"الواجب غير متاح لهذا الحساب."}};
  if(a.openAt&&new Date(a.openAt).getTime()>Date.now())return {status:403,jsonBody:{ok:false,error:"الواجب لم يُفتح بعد."}};
  return {status:200,jsonBody:{ok:true,assignment:{assignmentId:a.assignmentId,title:a.title,instructions:a.instructions,openAt:a.openAt||"",dueAt:a.dueAt||"",maxAttempts:Math.max(1,Number(a.maxAttempts||1)),sourceExamTitle:a.sourceExamTitle||"",questionCount:Number(a.questionCount||0),totalMarks:Number(a.totalMarks||0),exam:studentExam(a.examSnapshot)}}};
 }catch(e){return {status:500,jsonBody:{ok:false,error:e instanceof Error?e.message:"Unable to open assignment."}}}
}});
`);

/* ========================= STUDENT SUBMISSION ========================= */
write(F.submission,String.raw`
const {app}=require("@azure/functions");
const {requireStudentAuth}=require("../lib/student-auth");
const {getContainer,downloadJsonOrNull,uploadJson}=require("../lib/platform-storage");
const {gradeExam}=require("../lib/assignment-grading");
const AP="platform/assignments/",SP="platform/submissions/";
function publicState(a,s){
 const attempts=Array.isArray(s?.attempts)?s.attempts:[],base=Math.max(1,Number(a.maxAttempts||1)),limit=Math.max(base,Number(s?.allowedAttempts||0)),dueClosed=!!a.dueAt&&new Date(a.dueAt).getTime()<Date.now();
 const latest=attempts.length?attempts[attempts.length-1]:null;
 return {attemptsUsed:attempts.length,allowedAttempts:limit,canAttempt:a.status==="published"&&!dueClosed&&attempts.length<limit,dueClosed,draftAnswers:s?.draftAnswers||{},draftSavedAt:s?.draftSavedAt||"",latestResult:latest?{attemptNumber:latest.attemptNumber,submittedAt:latest.submittedAt,score:latest.score,totalMarks:latest.totalMarks,percentage:latest.percentage,manualReviewMarks:latest.manualReviewMarks,finalized:latest.finalized}:null,attempts:attempts.map(x=>({attemptNumber:x.attemptNumber,submittedAt:x.submittedAt,score:x.score,totalMarks:x.totalMarks,percentage:x.percentage,manualReviewMarks:x.manualReviewMarks,finalized:x.finalized}))};
}
app.http("studentSubmission",{methods:["GET","POST"],authLevel:"anonymous",route:"student-submission/{assignmentId}",handler:async request=>{
 try{
  const auth=requireStudentAuth(request);if(!auth.ok)return auth.response;const id=String(request.params?.assignmentId||"");if(!id)return {status:400,jsonBody:{ok:false,error:"assignmentId is required."}};
  const c=getContainer(),student=await downloadJsonOrNull(c,"platform/users/"+auth.user.sub+".json");if(!student||student.active===false)return {status:401,jsonBody:{ok:false,error:"الحساب غير فعّال."}};
  const a=await downloadJsonOrNull(c,AP+id+".json");if(!a||String(a.classId)!==String(student.classId))return {status:404,jsonBody:{ok:false,error:"الواجب غير متاح."}};
  const name=SP+id+"/"+student.userId+".json";let s=await downloadJsonOrNull(c,name);
  if(!s)s={schemaVersion:1,assignmentId:id,studentId:student.userId,classId:student.classId,studentCode:student.code,studentName:student.displayName,allowedAttempts:null,draftAnswers:{},attempts:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(request.method==="GET")return {status:200,jsonBody:{ok:true,state:publicState(a,s)}};
  let b={};try{b=await request.json()}catch{}const action=String(b.action||"saveDraft");
  const state=publicState(a,s);
  if(action==="saveDraft"){
   if(!state.canAttempt)return {status:409,jsonBody:{ok:false,error:"لا توجد محاولة متاحة للحفظ."}};
   s.draftAnswers=b.answers&&typeof b.answers==="object"?b.answers:{};s.draftSavedAt=new Date().toISOString();s.updatedAt=s.draftSavedAt;await uploadJson(c,name,s);
   return {status:200,jsonBody:{ok:true,savedAt:s.draftSavedAt}};
  }
  if(action==="submit"){
   if(!state.canAttempt)return {status:409,jsonBody:{ok:false,error:state.dueClosed?"انتهى موعد التسليم.":"لا توجد محاولة إضافية متاحة."}};
   const answers=b.answers&&typeof b.answers==="object"?b.answers:{},g=gradeExam(a.examSnapshot,answers),now=new Date().toISOString(),attemptNumber=(s.attempts?.length||0)+1;
   const attempt={attemptNumber,submittedAt:now,score:g.score,totalMarks:g.totalMarks,percentage:g.percentage,manualReviewMarks:g.manualReviewMarks,finalized:g.finalized,questionGrades:g.questions,answers};
   s.attempts=Array.isArray(s.attempts)?s.attempts:[];s.attempts.push(attempt);s.draftAnswers={};s.draftSavedAt="";s.updatedAt=now;await uploadJson(c,name,s);
   const next=publicState(a,s);
   return {status:200,jsonBody:{ok:true,result:{attemptNumber,submittedAt:now,score:g.score,totalMarks:g.totalMarks,percentage:g.percentage,manualReviewMarks:g.manualReviewMarks,finalized:g.finalized,questionGrades:g.questions},state:next}};
  }
  return {status:400,jsonBody:{ok:false,error:"Unsupported submission action."}};
 }catch(e){return {status:500,jsonBody:{ok:false,error:e instanceof Error?e.message:"Submission failed."}}}
}});
`);

/* ========================= TEACHER RESULTS ========================= */
write(F.results,String.raw`
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
`);

/* ========================= DASHBOARD ========================= */
write(F.dashboard,String.raw`
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
`);

/* ========================= STUDENT EXAM PAGE ========================= */
write(F.exam,String.raw`
import {useEffect,useMemo,useRef,useState} from "react";

type Opt={value?:string;label?:string;text?:string;order?:number;number?:number};
type Field={id?:string;number?:number;label?:string;kind?:string};
type ImageAsset={dataUrl?:string};
type Question={examQuestionId?:string;id?:string;number?:number;text:string;textHtml?:string;marks:number;presentationType?:string;type?:string;options?:Opt[];fields?:Field[];wordBank?:string[];image?:{exists?:boolean;visible?:boolean;assets?:ImageAsset[]};images?:ImageAsset[]};
type Assignment={assignmentId:string;title:string;instructions:string;openAt:string;dueAt:string;maxAttempts:number;questionCount:number;totalMarks:number;exam:{title?:string;metadata?:{school?:string;subject?:string;grade?:string;className?:string;generalInstructions?:string};questions?:Question[]}};
type Answer={kind:"choice";index:number}|{kind:"sequence";values:string[]}|{kind:"table";values:(string|boolean)[]}|{kind:"text";value:string};
type Answers=Record<string,Answer>;
type Result={attemptNumber:number;submittedAt:string;score:number;totalMarks:number;percentage:number;manualReviewMarks:number;finalized:boolean;questionGrades?:Array<{questionId:string;score:number;maxMarks:number;correct:boolean;manualReview:boolean}>};
type State={attemptsUsed:number;allowedAttempts:number;canAttempt:boolean;dueClosed:boolean;draftAnswers:Answers;draftSavedAt:string;latestResult:Result|null;attempts:Array<Result>};
type Props={token:string;assignment:Assignment;studentName:string;className:string;onBack:()=>void;onLogout:()=>void};

const qid=(q:Question,i:number)=>String(q.examQuestionId||q.id||q.number||i+1);
const typeOf=(q:Question)=>String(q.presentationType||q.type||"").toLowerCase();
const fmt=(v:string)=>v?new Date(v).toLocaleString("ar"):"بدون موعد";
function parseTable(text:string){
 const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(x=>x.startsWith("|")&&x.endsWith("|"));
 if(lines.length<2)return null;
 const split=(x:string)=>x.slice(1,-1).split("|").map(y=>y.trim());
 const all=lines.map(split),headers=all[0],rows=all.slice(1).filter(r=>!r.every(c=>/^:?-{3,}:?$/.test(c.replace(/\s/g,""))));
 return rows.length?{headers,rows}:null;
}
function promptText(text:string){const p=text.indexOf("\n|");return p>=0?text.slice(0,p).trim():text}
function answered(a:Answer|undefined){if(!a)return false;if(a.kind==="choice")return Number.isInteger(a.index);if(a.kind==="text")return !!a.value.trim();return a.values.some(v=>typeof v==="boolean"?v:String(v).trim()!=="")}
function tableCheckbox(q:Question){return /وضع علامة|✓|خاص بالشبكات الخاصة\?|private\?/i.test(q.text)}
function imageList(q:Question){if(q.image?.exists&&q.image.visible&&Array.isArray(q.image.assets))return q.image.assets;return Array.isArray(q.images)?q.images:[]}

export default function StudentExamPage({token,assignment,studentName,className,onBack,onLogout}:Props){
 const qs=assignment.exam.questions||[],[answers,setAnswers]=useState<Answers>({}),[state,setState]=useState<State|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[submitBusy,setSubmitBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState<Result|null>(null),[started,setStarted]=useState(true);
 const loaded=useRef(false),timer=useRef<number|null>(null);
 async function api<T>(options:RequestInit={}):Promise<T>{const h=new Headers(options.headers||{});h.set("Content-Type","application/json");h.set("x-student-token",token);h.set("Authorization","Bearer "+token);const r=await fetch("/api/student-submission/"+encodeURIComponent(assignment.assignmentId),{...options,headers:h}),j=await r.json() as T&{error?:string};if(r.status===401){onLogout();throw new Error("انتهت الجلسة.")}if(!r.ok)throw new Error(j.error||"حدث خطأ.");return j}
 useEffect(()=>{let cancelled=false;(async()=>{setLoading(true);try{const r=await api<{state:State}>();if(cancelled)return;setState(r.state);setAnswers(r.state.draftAnswers||{});setResult(r.state.latestResult);setStarted(r.state.attemptsUsed===0||Object.keys(r.state.draftAnswers||{}).length>0);loaded.current=true}catch(e){if(!cancelled)setError(e instanceof Error?e.message:"تعذر تحميل المحاولة.")}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true;if(timer.current)window.clearTimeout(timer.current)}},[assignment.assignmentId,token]);
 useEffect(()=>{if(!loaded.current||!started||!state?.canAttempt)return;if(timer.current)window.clearTimeout(timer.current);timer.current=window.setTimeout(async()=>{setSaving(true);try{await api({method:"POST",body:JSON.stringify({action:"saveDraft",answers})})}catch(e){setError(e instanceof Error?e.message:"تعذر الحفظ التلقائي.")}finally{setSaving(false)}},800);return()=>{if(timer.current)window.clearTimeout(timer.current)}},[answers,started,state?.canAttempt]);
 const done=useMemo(()=>qs.reduce((n,q,i)=>n+(answered(answers[qid(q,i)])?1:0),0),[answers,qs]),pct=qs.length?Math.round(done/qs.length*100):0;
 const setChoice=(id:string,index:number)=>setAnswers(a=>({...a,[id]:{kind:"choice",index}}));
 const setSeq=(id:string,index:number,value:string)=>setAnswers(a=>{const prev=a[id]?.kind==="sequence"?(a[id] as {kind:"sequence";values:string[]}).values:[];const values=[...prev];values[index]=value;return {...a,[id]:{kind:"sequence",values}}});
 const setTable=(id:string,index:number,value:string|boolean)=>setAnswers(a=>{const prev=a[id]?.kind==="table"?(a[id] as {kind:"table";values:(string|boolean)[]}).values:[];const values=[...prev];values[index]=value;return {...a,[id]:{kind:"table",values}}});
 async function submit(){if(!state?.canAttempt||submitBusy)return;if(done<qs.length&&!window.confirm("لم تُجب عن جميع الأسئلة. هل تريد التسليم الآن؟"))return;if(done===qs.length&&!window.confirm("سيتم إرسال الحل للتصحيح. هل تريد المتابعة؟"))return;setSubmitBusy(true);setError("");try{const r=await api<{result:Result;state:State}>({method:"POST",body:JSON.stringify({action:"submit",answers})});setResult(r.result);setState(r.state);setStarted(false);setAnswers({});window.scrollTo({top:0,behavior:"smooth"})}catch(e){setError(e instanceof Error?e.message:"تعذر تسليم الواجب.")}finally{setSubmitBusy(false)}}
 function startNext(){if(!state?.canAttempt)return;setAnswers({});setResult(state.latestResult);setStarted(true);window.scrollTo({top:0,behavior:"smooth"})}
 if(loading)return <main className="student-portal" dir="rtl"><div className="platform-loading">⏳ جارٍ تجهيز صفحة الامتحان...</div></main>;
 if(!started&&result)return <main className="interactive-exam-page" dir="rtl"><div className="iex-wrap"><section className="iex-result-card"><span className="platform-eyebrow">RESULT</span><h1>تم تسليم المحاولة {result.attemptNumber}</h1><div className="iex-score">{result.score}<small> / {result.totalMarks}</small></div><strong>{result.percentage}%</strong>{result.manualReviewMarks>0&&<p>العلامة الحالية آلية، وهناك {result.manualReviewMarks} علامة تحتاج مراجعة المعلم.</p>}<p>تم الحفظ في حسابك بتاريخ {fmt(result.submittedAt)}</p><div className="iex-result-actions"><button onClick={onBack}>العودة إلى المهام</button>{state?.canAttempt&&<button className="primary" onClick={startNext}>بدء محاولة جديدة ({state.attemptsUsed+1} من {state.allowedAttempts})</button>}</div>{!state?.canAttempt&&<div className="iex-no-retry">لا توجد محاولة إضافية متاحة. يستطيع المعلم السماح بمحاولة أخرى من صفحة النتائج.</div>}</section></div></main>;
 return <main className="interactive-exam-page" dir="rtl"><div className="iex-wrap">
  <header className="iex-head"><div><span className="iex-school">{assignment.exam.metadata?.school||"ExamBank 791381"}</span><h1>{assignment.title}</h1><p>{assignment.instructions}</p><div className="iex-badges"><span>{className||assignment.exam.metadata?.className||"الصف"}</span><span>{qs.length} أسئلة</span><span>{assignment.totalMarks} علامة</span><span>المحاولة {(state?.attemptsUsed||0)+1} / {state?.allowedAttempts||assignment.maxAttempts}</span></div></div><div className="iex-student"><strong>{studentName}</strong><span>آخر موعد: {fmt(assignment.dueAt)}</span></div></header>
  {error&&<div className="platform-error iex-error">{error}</div>}
  <div className="iex-progress"><span>تقدّمك</span><div><i style={{width:pct+"%"}}/></div><strong>{done} / {qs.length}</strong><small>{saving?"جارٍ الحفظ...":"✓ حفظ تلقائي"}</small></div>
  <section className="iex-flow">{qs.map((q,i)=>{const id=qid(q,i),t=typeOf(q),a=answers[id],table=parseTable(q.text),seq=t==="wordbank"||t==="fillblank"||((q.fields?.length||0)>0&&t!=="open");return <article className={"iex-q "+(answered(a)?"done":"")} key={id}><div className="iex-node">{i+1}</div><div className="iex-card"><div className="iex-qhead"><span>{t==="multiplechoice"?"اختيار من متعدد":table?"أكمل الجدول":seq?"أكمل الناقص":"سؤال"}</span><strong>{q.marks} علامة</strong></div><p className="iex-qtext">{promptText(q.text)}</p>
   {imageList(q).map((im,n)=>im.dataUrl?<img className="iex-image" src={im.dataUrl} alt={"صورة السؤال "+(i+1)} key={n}/>:null)}
   {t==="multiplechoice"&&<div className="iex-options">{(q.options||[]).map((o,n)=><label className={"iex-option "+(a?.kind==="choice"&&a.index===n?"selected":"")} key={n}><input type="radio" name={id} checked={a?.kind==="choice"&&a.index===n} onChange={()=>setChoice(id,n)}/><span className="iex-pick"/><b>{o.text||o.label||o.value||""}</b></label>)}</div>}
   {table&&<div className="iex-table-wrap"><table><thead><tr>{table.headers.map((h,n)=><th key={n}>{h}</th>)}</tr></thead><tbody>{table.rows.map((r,n)=><tr key={n}><td>{r[0]}</td><td>{tableCheckbox(q)?<input className="iex-check" type="checkbox" checked={a?.kind==="table"&&Boolean(a.values[n])} onChange={e=>setTable(id,n,e.target.checked)}/>:<input className="iex-cell" value={a?.kind==="table"?String(a.values[n]??""):""} onChange={e=>setTable(id,n,e.target.value)} placeholder="اكتب الإجابة"/>}</td></tr>)}</tbody></table></div>}
   {!table&&seq&&<><div className="iex-bank">{(q.wordBank||[]).filter(x=>x&&x!=="— اختر —").map((w,n)=><span key={n}>{w}</span>)}</div><div className="iex-seq">{(q.fields||[]).map((f,n)=><label key={f.id||f.number||n}><span>{f.label||"الحقل "+(n+1)}</span><select value={a?.kind==="sequence"?a.values[n]||"":""} onChange={e=>setSeq(id,n,e.target.value)}><option value="">— اختر —</option>{(q.wordBank||[]).filter(x=>x&&x!=="— اختر —").map((w,k)=><option key={k}>{w}</option>)}</select></label>)}</div></>}
   {!table&&!seq&&t!=="multiplechoice"&&<textarea className="iex-open" value={a?.kind==="text"?a.value:""} onChange={e=>setAnswers(x=>({...x,[id]:{kind:"text",value:e.target.value}}))} placeholder="اكتب إجابتك هنا..."/>}
  </div></article>})}</section>
  <footer className="iex-foot"><div><strong>أجبت عن {done} من {qs.length}</strong><span>{saving?"جارٍ حفظ الإجابات...":"يتم حفظ إجاباتك تلقائيًا أثناء الحل."}</span></div><div><button onClick={onBack}>العودة بدون تسليم</button><button className="primary" onClick={submit} disabled={submitBusy||!state?.canAttempt}>{submitBusy?"⏳ جارٍ التصحيح...":"✓ تسليم وتصحيح الامتحان"}</button></div></footer>
 </div></main>
}
`);

/* ========================= STUDENT PORTAL ========================= */
write(F.portal,String.raw`
import {useEffect,useState} from "react";
import StudentExamPage from "./StudentExamPage";
type Props={token:string;displayName:string;onLogout:()=>void};
type Summary={assignmentId:string;title:string;instructions:string;openAt:string;dueAt:string;questionCount:number;totalMarks:number;availability:"scheduled"|"open"|"closed";attemptsUsed:number;allowedAttempts:number;canAttempt:boolean;latestScore:number|null;latestPercentage:number|null;createdAt:string};
type Detail={assignmentId:string;title:string;instructions:string;openAt:string;dueAt:string;maxAttempts:number;questionCount:number;totalMarks:number;exam:{title?:string;metadata?:{school?:string;subject?:string;grade?:string;className?:string;generalInstructions?:string};questions?:any[]}};
type Dashboard={student:{userId:string;code:string;displayName:string;classId:string};classroom:{classId:string;name:string;grade:string;schoolYear:string}|null;assignments:Summary[];stats:{assigned:number;completed:number;average:number|null}};
const fmt=(v:string)=>v?new Date(v).toLocaleString("ar"):"بدون موعد";
const label=(v:Summary["availability"])=>v==="scheduled"?"قريبًا":v==="closed"?"انتهى الموعد":"متاح الآن";
export default function StudentPortal({token,displayName,onLogout}:Props){
 const [data,setData]=useState<Dashboard|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[detail,setDetail]=useState<Detail|null>(null),[busy,setBusy]=useState(false);
 async function load(){setLoading(true);setError("");try{const r=await fetch("/api/student-dashboard",{headers:{"x-student-token":token,Authorization:"Bearer "+token}}),j=await r.json() as any;if(r.status===401){onLogout();return}if(!r.ok||!j.student||!j.stats)throw new Error(j.error||"تعذر تحميل صفحة الطالب.");setData({student:j.student,classroom:j.classroom||null,assignments:j.assignments||[],stats:j.stats})}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل الصفحة.")}finally{setLoading(false)}}
 useEffect(()=>{void load()},[token]);
 async function open(item:Summary){if(item.availability==="scheduled")return;setBusy(true);setError("");try{const r=await fetch("/api/student-assignment/"+encodeURIComponent(item.assignmentId),{headers:{"x-student-token":token,Authorization:"Bearer "+token}}),j=await r.json() as any;if(r.status===401){onLogout();return}if(!r.ok||!j.assignment)throw new Error(j.error||"تعذر فتح الواجب.");setDetail(j.assignment);window.scrollTo({top:0,behavior:"smooth"})}catch(e){setError(e instanceof Error?e.message:"تعذر فتح الواجب.")}finally{setBusy(false)}}
 if(detail&&data)return <StudentExamPage token={token} assignment={detail} studentName={data.student.displayName||displayName} className={data.classroom?data.classroom.name+(data.classroom.grade?" · "+data.classroom.grade:""):""} onLogout={onLogout} onBack={()=>{setDetail(null);void load()}}/>;
 return <main className="student-portal" dir="rtl"><header className="student-topbar"><div className="student-brand"><span className="student-logo">EB</span><div><h1>ExamBank 2.0</h1><p>بوابة الطالب للتدريب والواجبات</p></div></div><button className="student-logout" onClick={onLogout}>تسجيل الخروج</button></header><section className="student-shell">{loading&&<div className="platform-loading">⏳ جارٍ تحميل حسابك...</div>}{busy&&<div className="platform-loading">⏳ جارٍ فتح الواجب...</div>}{error&&<div className="platform-error">{error}</div>}{!loading&&data&&<><section className="student-welcome-card"><div><span className="platform-eyebrow">Student Portal</span><h2>مرحبًا {data.student.displayName||displayName}</h2><p>{data.classroom?data.classroom.name+(data.classroom.grade?" · "+data.classroom.grade:""):"لم يتم ربط حسابك بصف بعد."}</p></div><div className="student-code-chip">الكود: <strong>{data.student.code}</strong></div></section><section className="student-stat-grid"><article><strong>{data.stats.assigned}</strong><span>مهام</span></article><article><strong>{data.stats.completed}</strong><span>مكتملة</span></article><article><strong>{data.stats.average===null?"—":data.stats.average+"%"}</strong><span>المعدل</span></article></section><section className="student-main-grid"><article className="student-panel"><div className="student-panel-heading"><div><span className="platform-eyebrow">Assignments</span><h3>المهام والواجبات</h3></div><span className="phase-chip">Phase 2.0C</span></div><div className="student-assignment-list">{data.assignments.map(item=><article className={"student-assignment-card "+item.availability} key={item.assignmentId}><div className="student-assignment-card-main"><div className="student-assignment-card-title"><strong>{item.title}</strong><span>{label(item.availability)}</span></div><p>{item.instructions}</p><small>{item.questionCount} سؤال · {item.totalMarks} علامة</small><small>التسليم: {fmt(item.dueAt)} · المحاولات: {item.attemptsUsed}/{item.allowedAttempts}</small>{item.latestScore!==null&&<strong className="student-latest-score">آخر علامة: {item.latestScore}/{item.totalMarks} ({item.latestPercentage}%)</strong>}</div><button onClick={()=>open(item)} disabled={busy||item.availability==="scheduled"}>{item.availability==="scheduled"?"لم يفتح بعد":item.latestScore!==null?(item.canAttempt?"النتيجة / محاولة جديدة":"عرض النتيجة"):item.availability==="closed"?"عرض الواجب":"ابدأ الحل"}</button></article>)}{!data.assignments.length&&<div className="student-empty-state"><span>📝</span><strong>لا توجد مهام منشورة الآن</strong><p>عندما يرسل المعلم واجبًا إلى صفك سيظهر هنا تلقائيًا.</p></div>}</div></article><article className="student-panel student-next-panel"><span className="platform-eyebrow">ExamBank 2.0</span><h3>نظام الواجب التفاعلي</h3><ul><li>حل مباشر داخل الموقع</li><li>حفظ تلقائي للإجابات</li><li>تسليم وتصحيح آلي</li><li>تسجيل العلامة والمحاولات</li></ul></article></section></>}</section></main>
}
`);

/* ========================= TEACHER ASSIGNMENTS PANEL ========================= */
write(F.panel,String.raw`
import {useEffect,useMemo,useState} from "react";
type Classroom={classId:string;name:string;grade:string;active:boolean};
type Item={assignmentId:string;classId:string;className:string;title:string;instructions:string;status:"draft"|"published"|"archived";openAt:string;dueAt:string;sourceExamId:string;sourceExamTitle:string;questionCount:number;totalMarks:number;maxAttempts:number;createdAt:string;updatedAt:string};
type Exam={examId?:string;title?:string;totalMarks?:number;questions?:unknown[]};
type StudentResult={studentId:string;studentName:string;studentCode:string;attemptsUsed:number;allowedAttempts:number;latestResult:{score:number;totalMarks:number;percentage:number;submittedAt:string;finalized:boolean;manualReviewMarks:number}|null};
type Props={token:string;classes:Classroom[];currentExam:unknown|null};
const localDate=(hours:number)=>{const d=new Date(Date.now()+hours*3600000);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)},fmt=(v:string)=>v?new Date(v).toLocaleString("ar"):"بدون موعد";
export default function AssignmentsPanel({token,classes,currentExam}:Props){
 const exam=currentExam&&typeof currentExam==="object"?currentExam as Exam:null;
 const [items,setItems]=useState<Item[]>([]),[classId,setClassId]=useState(""),[title,setTitle]=useState(""),[instructions,setInstructions]=useState("أجب عن جميع الأسئلة واقرأ التعليمات جيدًا قبل البدء."),[openAt,setOpenAt]=useState(localDate(0)),[dueAt,setDueAt]=useState(localDate(72)),[maxAttempts,setMaxAttempts]=useState(1),[publish,setPublish]=useState(true),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[resultsFor,setResultsFor]=useState<Item|null>(null),[results,setResults]=useState<StudentResult[]>([]);
 const active=useMemo(()=>classes.filter(x=>x.active),[classes]);useEffect(()=>{if(!classId&&active[0])setClassId(active[0].classId)},[active,classId]);useEffect(()=>{if(exam?.title&&!title.trim())setTitle(exam.title)},[exam?.title]);
 async function api<T>(url:string,options:RequestInit={}):Promise<T>{const h=new Headers(options.headers||{});h.set("Content-Type","application/json");h.set("x-builder-token",token);h.set("Authorization","Bearer "+token);const r=await fetch(url,{...options,headers:h}),j=await r.json() as T&{error?:string};if(!r.ok)throw new Error(j.error||"حدث خطأ.");return j}
 async function load(){setLoading(true);try{const r=await api<{assignments:Item[]}>("/api/assignments");setItems(r.assignments||[])}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل الواجبات.")}finally{setLoading(false)}}useEffect(()=>{void load()},[]);
 async function create(){if(busy||!classId||!title.trim()||!exam||!Array.isArray(exam.questions)||!exam.questions.length)return;setBusy(true);setError("");try{const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({action:"create",classId,title:title.trim(),instructions:instructions.trim(),openAt:openAt?new Date(openAt).toISOString():"",dueAt:dueAt?new Date(dueAt).toISOString():"",maxAttempts,publish,examSnapshot:currentExam})});setItems(x=>[r.assignment,...x]);setNotice(publish?"✓ تم إنشاء الواجب ونشره.":"✓ تم حفظ الواجب كمسودة.")}catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء الواجب.")}finally{setBusy(false)}}
 async function action(item:Item,body:any){setBusy(true);try{const r=await api<{assignment:Item}>("/api/assignments",{method:"POST",body:JSON.stringify({assignmentId:item.assignmentId,...body})});setItems(x=>x.map(y=>y.assignmentId===item.assignmentId?r.assignment:y));if(resultsFor?.assignmentId===item.assignmentId)setResultsFor(r.assignment)}catch(e){setError(e instanceof Error?e.message:"تعذر تنفيذ العملية.")}finally{setBusy(false)}}
 async function remove(item:Item){if(!window.confirm("حذف الواجب «"+item.title+"»؟"))return;setBusy(true);try{await api("/api/assignments",{method:"POST",body:JSON.stringify({action:"delete",assignmentId:item.assignmentId})});setItems(x=>x.filter(y=>y.assignmentId!==item.assignmentId));if(resultsFor?.assignmentId===item.assignmentId){setResultsFor(null);setResults([])}}catch(e){setError(e instanceof Error?e.message:"تعذر حذف الواجب.")}finally{setBusy(false)}}
 async function loadResults(item:Item){setBusy(true);setError("");try{const r=await api<{students:StudentResult[]}>("/api/assignment-results?assignmentId="+encodeURIComponent(item.assignmentId));setResultsFor(item);setResults(r.students||[])}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل النتائج.")}finally{setBusy(false)}}
 async function retry(student:StudentResult){if(!resultsFor)return;setBusy(true);try{const r=await api<{allowedAttempts:number}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"allowRetry",assignmentId:resultsFor.assignmentId,studentId:student.studentId})});setResults(x=>x.map(s=>s.studentId===student.studentId?{...s,allowedAttempts:r.allowedAttempts}:s));setNotice("✓ تم السماح بمحاولة إضافية للطالب "+student.studentName)}catch(e){setError(e instanceof Error?e.message:"تعذر السماح بالمحاولة.")}finally{setBusy(false)}}
 const visible=classId?items.filter(x=>x.classId===classId):items;
 return <section className="assignments-panel platform-card"><div className="assignments-heading"><div><span className="platform-eyebrow">Assignments · Phase 2.0C</span><h3>الواجبات والنتائج</h3><p>الطالب يحل داخل الموقع، والنظام يصحح ويسجل العلامة والمحاولات.</p></div><button onClick={load} disabled={loading}>↻ تحديث</button></div>{error&&<div className="platform-error assignment-inline-message">{error}</div>}{notice&&<div className="platform-notice assignment-inline-message">{notice}</div>}
  <div className="assignment-source-card"><div><span>الامتحان الحالي</span><strong>{exam?.title||"لا يوجد امتحان مفتوح"}</strong><small>{Array.isArray(exam?.questions)?exam?.questions?.length+" سؤال":"افتح امتحانًا من باني الامتحان أولًا"}</small></div><div className="assignment-source-marks">{exam?.totalMarks?exam.totalMarks+" علامة":"—"}</div></div>
  <div className="assignment-create-grid"><label>الصف<select value={classId} onChange={e=>setClassId(e.target.value)}><option value="">اختر الصف</option>{active.map(c=><option key={c.classId} value={c.classId}>{c.name}{c.grade?" · "+c.grade:""}</option>)}</select></label><label>عنوان الواجب<input value={title} onChange={e=>setTitle(e.target.value)}/></label><label className="assignment-wide-field">تعليمات<textarea value={instructions} onChange={e=>setInstructions(e.target.value)}/></label><label>يفتح في<input type="datetime-local" value={openAt} onChange={e=>setOpenAt(e.target.value)}/></label><label>آخر موعد<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label><label>عدد المحاولات<select value={maxAttempts} onChange={e=>setMaxAttempts(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option value={n} key={n}>{n}</option>)}</select></label><label className="assignment-publish-toggle"><input type="checkbox" checked={publish} onChange={e=>setPublish(e.target.checked)}/><span>نشر مباشرة</span></label><button className="platform-primary assignment-create-button" onClick={create} disabled={busy||!classId||!title.trim()||!exam||!Array.isArray(exam.questions)||!exam.questions.length}>{busy?"⏳ جارٍ الحفظ...":"📤 إنشاء الواجب"}</button></div>
  <div className="assignment-list">{visible.map(item=><article className="assignment-row" key={item.assignmentId}><div className="assignment-row-main"><div className="assignment-title-line"><strong>{item.title}</strong><span className={"assignment-status "+item.status}>{item.status==="published"?"منشور":item.status==="archived"?"مؤرشف":"مسودة"}</span></div><span>{item.questionCount} سؤال · {item.totalMarks} علامة · {item.maxAttempts||1} محاولة</span><small>التسليم: {fmt(item.dueAt)}</small></div><div className="assignment-row-actions"><button onClick={()=>loadResults(item)} disabled={busy}>📊 النتائج</button>{item.status!=="published"&&<button onClick={()=>action(item,{action:"setStatus",status:"published"})} disabled={busy}>نشر</button>}{item.status==="published"&&<button onClick={()=>action(item,{action:"setStatus",status:"draft"})} disabled={busy}>إيقاف النشر</button>}<select className="assignment-attempt-select" value={item.maxAttempts||1} onChange={e=>action(item,{action:"setMaxAttempts",maxAttempts:Number(e.target.value)})} disabled={busy}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} محاولات</option>)}</select><button className="assignment-delete-button" onClick={()=>remove(item)} disabled={busy}>حذف</button></div></article>)}{!loading&&!visible.length&&<div className="platform-empty">لا توجد واجبات لهذا الصف بعد.</div>}</div>
  {resultsFor&&<section className="assignment-results-panel"><div className="assignments-heading"><div><span className="platform-eyebrow">Results</span><h3>نتائج: {resultsFor.title}</h3></div><button onClick={()=>{setResultsFor(null);setResults([])}}>إغلاق</button></div><div className="students-table-wrap"><table className="students-table"><thead><tr><th>الطالب</th><th>المحاولات</th><th>آخر علامة</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>{results.map(s=><tr key={s.studentId}><td><strong>{s.studentName}</strong><small className="result-code">{s.studentCode}</small></td><td>{s.attemptsUsed} / {s.allowedAttempts}</td><td>{s.latestResult?<strong>{s.latestResult.score}/{s.latestResult.totalMarks} ({s.latestResult.percentage}%)</strong>:"لم يسلّم"}</td><td>{s.latestResult?fmt(s.latestResult.submittedAt):"—"}</td><td><button onClick={()=>retry(s)} disabled={busy||s.attemptsUsed===0}>+ محاولة إضافية</button></td></tr>)}</tbody></table></div></section>}
 </section>
}
`);

/* ========================= APP MARKER ========================= */
app=read(F.app);
app=rep(app,"// EXAMBANK_2_PHASE_B\n","// EXAMBANK_2_PHASE_B\n// EXAMBANK_2_PHASE_C\n","Phase C marker");
write(F.app,app);

/* ========================= CSS ========================= */
let css=read(F.css);
if(!css.includes("EXAMBANK_2_PHASE_C_STYLES"))css+=String.raw`
/* EXAMBANK_2_PHASE_C_STYLES */
.interactive-exam-page{min-height:100vh;background:radial-gradient(900px 420px at 90% -10%,rgba(18,181,172,.11),transparent 60%),radial-gradient(800px 440px at -10% 0%,rgba(47,109,246,.09),transparent 55%),#e8eef7;color:#152238;font-family:Arial,"Segoe UI",sans-serif;padding:1px}.iex-wrap{max-width:980px;margin:0 auto;padding:24px 18px 80px}.iex-head{position:relative;overflow:hidden;background:linear-gradient(135deg,#0e1e34,#173357 55%,#123a5e);color:#eaf1fb;border-radius:22px;padding:24px;box-shadow:0 14px 40px -22px rgba(15,32,56,.45);display:flex;justify-content:space-between;gap:18px}.iex-school{display:inline-flex;background:rgba(18,181,172,.14);border:1px solid rgba(18,181,172,.35);color:#bfe9e6;padding:6px 13px;border-radius:999px;font-weight:800}.iex-head h1{margin:13px 0 5px;font-size:30px}.iex-head p{margin:0;color:#b9c9dd}.iex-badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:15px}.iex-badges span{padding:6px 10px;border-radius:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);font-weight:700;font-size:12px}.iex-student{align-self:center;min-width:180px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);padding:14px;border-radius:14px;display:flex;flex-direction:column;gap:5px}.iex-student span{font-size:11px;color:#cbd8e9}.iex-error{margin-top:12px}.iex-progress{position:sticky;top:8px;z-index:25;margin:16px 0 8px;background:rgba(232,238,247,.9);backdrop-filter:blur(8px);border:1px solid #d9e2ef;border-radius:14px;padding:10px 14px;display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:12px}.iex-progress>div{height:9px;background:#d3ddec;border-radius:999px;overflow:hidden}.iex-progress i{display:block;height:100%;background:linear-gradient(90deg,#12b5ac,#2f6df6);border-radius:999px;transition:width .25s}.iex-progress small{color:#0c8f88;white-space:nowrap}.iex-flow{position:relative;margin-top:14px}.iex-flow:before{content:"";position:absolute;top:28px;bottom:28px;right:25px;width:2px;background:linear-gradient(#12b5ac,rgba(47,109,246,.35),#d9e2ef)}.iex-q{display:grid;grid-template-columns:52px 1fr;align-items:start;margin-bottom:18px;position:relative}.iex-node{z-index:2;margin:22px auto 0;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#95a6c1;color:#fff;font-weight:900;box-shadow:0 0 0 5px #e8eef7}.iex-q.done .iex-node{background:linear-gradient(135deg,#12b5ac,#0c8f88)}.iex-card{background:#fff;border:1px solid #d9e2ef;border-radius:18px;padding:20px 22px;box-shadow:0 14px 40px -28px rgba(15,32,56,.45)}.iex-qhead{display:flex;justify-content:space-between;gap:12px}.iex-qhead span{color:#0c8f88;background:rgba(18,181,172,.1);border:1px solid rgba(18,181,172,.28);padding:4px 10px;border-radius:999px;font-size:11px;font-weight:900}.iex-qhead strong{color:#8a5a00;background:rgba(246,167,35,.15);border:1px solid rgba(246,167,35,.45);padding:5px 11px;border-radius:10px;font-size:12px}.iex-qtext{font-weight:800;font-size:17px;line-height:1.8;margin:12px 0}.iex-image{display:block;max-width:100%;max-height:420px;object-fit:contain;margin:14px auto;border-radius:12px;border:1px solid #d9e2ef}.iex-options{display:grid;gap:9px}.iex-option{display:flex;align-items:center;gap:11px;border:1.5px solid #d9e2ef;border-radius:13px;padding:12px 14px;background:#fbfcfe;cursor:pointer}.iex-option input{position:absolute;opacity:0}.iex-pick{width:21px;height:21px;border-radius:50%;border:2px solid #b6c3d8;position:relative;flex:none}.iex-option.selected{border-color:#12b5ac;background:rgba(18,181,172,.06)}.iex-option.selected .iex-pick{border-color:#12b5ac}.iex-option.selected .iex-pick:after{content:"";position:absolute;inset:4px;border-radius:50%;background:#12b5ac}.iex-table-wrap{overflow-x:auto;border:1px solid #d9e2ef;border-radius:14px}.iex-table-wrap table{width:100%;border-collapse:collapse;min-width:380px}.iex-table-wrap th{background:linear-gradient(135deg,#0f2038,#1b3a63);color:#fff;padding:12px;text-align:center}.iex-table-wrap td{padding:10px;border-top:1px solid #d9e2ef;text-align:center}.iex-table-wrap tr:nth-child(even){background:#f6f9fd}.iex-cell{width:100%;max-width:210px;border:1.5px solid #d9e2ef;border-radius:9px;padding:8px;text-align:center}.iex-check{appearance:none;width:30px;height:30px;border:2px solid #c3d0e2;border-radius:9px;cursor:pointer}.iex-check:checked{background:#12b5ac;border-color:#0c8f88}.iex-check:checked:after{content:"✓";color:white;font-weight:900;font-size:18px;display:grid;place-items:center}.iex-bank{display:flex;flex-wrap:wrap;gap:7px;padding:11px;border:1px dashed rgba(18,181,172,.55);border-radius:13px;background:rgba(18,181,172,.05)}.iex-bank span{background:#fff;border:1px solid #c9d7ea;border-radius:999px;padding:6px 10px}.iex-seq{display:grid;gap:9px;margin-top:11px}.iex-seq label{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#f8fafd;border:1px solid #d9e2ef;border-radius:11px;padding:10px}.iex-seq select{min-width:180px;border:1.5px solid #d9e2ef;border-radius:9px;padding:8px;background:white}.iex-open{width:100%;min-height:110px;border:1.5px solid #d9e2ef;border-radius:12px;padding:12px;font:inherit;resize:vertical}.iex-foot{margin-top:24px;background:#fff;border:1px solid #d9e2ef;border-radius:18px;padding:18px;display:flex;justify-content:space-between;align-items:center;gap:15px}.iex-foot>div:first-child{display:flex;flex-direction:column;gap:3px}.iex-foot>div:last-child,.iex-result-actions{display:flex;gap:9px;flex-wrap:wrap}.iex-foot button,.iex-result-card button{border:1px solid #cbd5e1;background:#fff;border-radius:11px;padding:11px 16px;font-weight:800;cursor:pointer}.iex-foot button.primary,.iex-result-card button.primary{border:0;background:linear-gradient(135deg,#12b5ac,#2f6df6);color:#fff}.iex-result-card{max-width:650px;margin:80px auto;background:#fff;border:1px solid #d9e2ef;border-radius:24px;padding:34px;text-align:center;box-shadow:0 20px 60px -35px rgba(15,32,56,.5)}.iex-score{font-size:72px;font-weight:900;color:#1d4ed8;line-height:1;margin:20px 0 6px}.iex-score small{font-size:24px;color:#64748b}.iex-result-card>strong{font-size:24px;color:#0c8f88}.iex-result-card p{color:#64748b}.iex-result-actions{justify-content:center;margin-top:20px}.iex-no-retry{margin-top:15px;padding:10px;border-radius:10px;background:#f8fafc;color:#64748b}.student-latest-score{color:#0c8f88;margin-top:3px}.assignment-attempt-select{border:1px solid #cbd5e1;border-radius:8px;padding:6px;background:#fff}.assignment-results-panel{margin-top:18px;border-top:2px solid #e2e8f0;padding-top:18px}.result-code{display:block;color:#64748b;margin-top:2px}.assignment-results-panel td button{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:8px;padding:7px 9px;font-weight:800;cursor:pointer}
@media(max-width:760px){.iex-head,.iex-foot{flex-direction:column;align-items:stretch}.iex-student{min-width:0}.iex-progress{grid-template-columns:auto 1fr auto}.iex-progress small{grid-column:1/-1}.iex-q{grid-template-columns:42px 1fr}.iex-flow:before{right:20px}.iex-card{padding:16px}.iex-seq label{align-items:stretch;flex-direction:column}.iex-seq select{width:100%;min-width:0}.iex-foot>div:last-child button{flex:1}}
`;
write(F.css,css);

/* ========================= CHECKS ========================= */
console.log("\nChecking Phase C backend syntax...");
[F.grading,F.manage,F.assignment,F.submission,F.results,F.dashboard].forEach(f=>execFileSync(process.execPath,["--check",f],{cwd:root,stdio:"inherit"}));
console.log("\nRunning npm run build...");
try{execFileSync("cmd.exe",["/d","/s","/c","npm run build"],{cwd:root,stdio:"inherit"})}catch{die("BUILD FAILED. Do not commit. Send the first TypeScript/build error.")}
console.log("\nEXAMBANK 2.0 PHASE C PASSED.");
console.log("\nImplemented:");
["Interactive exam page generated from assignment JSON","Multiple-choice grading","Word-bank / exact-sequence partial grading","Markdown-table interactive inputs","Structured table deterministic grading","Autosave to Azure","Submit + server-side grading","Score stored per student","Teacher results dashboard","Per-student extra retry permission","Assignment-wide max attempts"].forEach(x=>console.log("  ✓ "+x));
console.log("\nNext:");
console.log('git add src/App.tsx src/StudentPortal.tsx src/StudentExamPage.tsx src/AssignmentsPanel.tsx src/platform.css api/src/lib/assignment-grading.js api/src/functions/manage-assignments.js api/src/functions/student-assignment.js api/src/functions/student-submission.js api/src/functions/assignment-results.js api/src/functions/student-dashboard.js');
console.log('git commit -m "Add interactive assignments grading and retries"');
console.log("git push");
