// Phase 9A — Teacher Today Hub / Command Center: GET /api/teacher-today.
//
// A READ-ONLY, DERIVED view over the canonical stores the teacher's other pages already read — assignments, classes,
// users and the per-student submission documents (one folder listing + the existing blobs per published assignment
// of an ACTIVE class, bounded concurrency) plus the Phase 5D unread-messages summary. Nothing here is persisted, no
// second store is created, and no figure is invented: every count is a plain fact of those documents at request time.
//
//   attention.activeAttempts  — students with a LIVE attempt right now (started / draft / paused), newest first;
//   attention.notStarted      — OPEN assignments (per the same availability rule the student sees) with class members
//                               who have neither an attempt nor a live attempt yet, nearest deadline first;
//   attention.pendingReview   — assignments whose latest attempts still need manual review (the gradebook's rule);
//   attention.unreadMessages  — the teacher's unread direct-message summary (the SAME helper as the sidebar badge);
//   recent                    — the latest submissions / attempt starts (canonical attempt timestamps), newest first.
//
// Partial failure is explicit: the messages summary is optional (`unreadMessages: null` + "messages" in `partial`) so
// a messaging blip never blanks the attention cards. Item lists are capped for display; counts stay complete.
const {app}=require("@azure/functions");
const {withObservability}=require("../lib/observability");
const {requireBuilderAuth}=require("../lib/builder-auth");
const {getContainer,listJson,listBlobNames,downloadManyJson,getReadConcurrency}=require("../lib/platform-storage");
const {normalizeClassStatus}=require("../lib/class-lifecycle");
const {normalizeAssignmentStatus}=require("../lib/assignment-lifecycle");
const {isStudentClassMember}=require("../lib/class-membership");
const {attemptState,activeAttemptOf,deriveAttemptStatus,normalizeEndReason}=require("../lib/assignment-availability");
const {deriveGradingStatus}=require("../lib/grading-status");
const {teacherDirectUnread}=require("../lib/message-read-state");

const AP="platform/assignments/",CP="platform/classes/",UP="platform/users/",SP="platform/submissions/";
const ITEM_CAP=8,RECENT_CAP=10;
const ms=v=>{const t=Date.parse(String(v||""));return Number.isFinite(t)?t:0};
const studentName=u=>String(u.displayName||[u.firstName,u.familyName].filter(Boolean).join(" ")||u.code||u.userId||"");

/** The submission documents of ONE assignment folder, keyed by the student id THE DOCUMENT names (never the file name). */
async function loadFolder(container,assignmentId,deps){
 const list=deps.listBlobNames||listBlobNames,many=deps.downloadManyJson||downloadManyJson;
 const names=(await list(container,SP+assignmentId+"/")).filter(n=>n.endsWith(".json"));
 const docs=await many(container,names,getReadConcurrency());
 const byStudent=new Map();
 for(const d of docs){if(d&&typeof d==="object"&&String(d.assignmentId||"")===assignmentId&&d.studentId)byStudent.set(String(d.studentId),d)}
 return byStudent;
}

/** Pure derivation over already-loaded documents (exported for tests). */
function deriveTeacherToday({assignments,classes,users,submissionsByAssignment,nowMs}){
 const activeClasses=new Map();
 for(const c of classes){if(c&&c.classId&&normalizeClassStatus(c)==="active")activeClasses.set(String(c.classId),{classId:String(c.classId),name:String(c.name||"")})}
 const membersByClass=new Map();
 for(const u of users){if(!u||u.role!=="student")continue;const cid=String(u.classId||"");if(!activeClasses.has(cid)||!isStudentClassMember(u,cid))continue;if(!membersByClass.has(cid))membersByClass.set(cid,[]);membersByClass.get(cid).push(u)}
 const published=assignments.filter(a=>a&&a.assignmentId&&normalizeAssignmentStatus(a)==="published"&&activeClasses.has(String(a.classId||"")));
 const active=[],notStarted=[],pending=[],recent=[];
 let activeCount=0,notStartedCount=0,pendingCount=0;
 for(const a of published){
  const aid=String(a.assignmentId),cid=String(a.classId||""),className=activeClasses.get(cid).name,title=String(a.title||"");
  const members=membersByClass.get(cid)||[],subs=submissionsByAssignment.get(aid)||new Map();
  let ns=0,pr=0,nearestDue=ms(a.dueAt);
  for(const u of members){
   const sid=String(u.userId),s=subs.get(sid)||null,st=attemptState(a,s,nowMs),live=activeAttemptOf(s);
   const attempts=Array.isArray(s?.attempts)?s.attempts:[],latest=attempts.length?attempts[attempts.length-1]:null;
   if(live){activeCount++;active.push({assignmentId:aid,title,className,studentId:sid,studentName:studentName(u),startedAt:String(live.startedAt||""),status:deriveAttemptStatus(s)});recent.push({kind:"started",at:String(live.startedAt||""),assignmentId:aid,title,className,studentId:sid,studentName:studentName(u)})}
   if(st.availability==="open"&&!live&&attempts.length===0){ns++;const due=ms(st.effectiveDueAt||a.dueAt);if(due&&(!nearestDue||due<nearestDue))nearestDue=due}
   if(latest&&deriveGradingStatus(latest)==="pendingReview")pr++;
   for(const at of attempts){if(!at||!at.submittedAt)continue;const reason=normalizeEndReason(at);recent.push({kind:reason==="submitted"?"submitted":reason,at:String(at.submittedAt),assignmentId:aid,title,className,studentId:sid,studentName:studentName(u),percentage:Number.isFinite(Number(at.percentage))?Number(at.percentage):null})}
  }
  if(ns>0){notStartedCount+=ns;notStarted.push({assignmentId:aid,title,className,dueAt:nearestDue?new Date(nearestDue).toISOString():"",notStarted:ns,expected:members.length})}
  if(pr>0){pendingCount+=pr;pending.push({assignmentId:aid,title,className,pendingReview:pr})}
 }
 active.sort((x,y)=>ms(y.startedAt)-ms(x.startedAt));
 notStarted.sort((x,y)=>(ms(x.dueAt)||Number.MAX_SAFE_INTEGER)-(ms(y.dueAt)||Number.MAX_SAFE_INTEGER)||y.notStarted-x.notStarted);
 pending.sort((x,y)=>y.pendingReview-x.pendingReview);
 recent.sort((x,y)=>ms(y.at)-ms(x.at));
 return {
  scope:{activeClasses:activeClasses.size,students:[...membersByClass.values()].reduce((n,l)=>n+l.length,0),publishedAssignments:published.length},
  attention:{
   activeAttempts:{count:activeCount,items:active.slice(0,ITEM_CAP)},
   notStarted:{count:notStartedCount,assignments:notStarted.length,items:notStarted.slice(0,ITEM_CAP)},
   pendingReview:{count:pendingCount,assignments:pending.length,items:pending.slice(0,ITEM_CAP)}
  },
  recent:recent.slice(0,RECENT_CAP)
 };
}

// `deps` is the optional dependency-injection seam for unit tests (production passes nothing); `obs` is the request
// context withObservability passes as the third argument. Neither changes runtime behaviour.
async function handler(request,deps={},obs=null){
 try{
  const auth=(deps.requireBuilderAuth||requireBuilderAuth)(request);
  if(!auth.ok)return auth.response;
  const teacherId=String(auth.user&&auth.user.sub||"builder");
  const container=deps.container||(deps.getContainer||getContainer)();
  const lj=deps.listJson||listJson,nowMs=typeof deps.nowMs==="number"?deps.nowMs:Date.now();
  const [assignments,classes,users]=await Promise.all([lj(container,AP),lj(container,CP),lj(container,UP)]);
  const activeIds=new Set(classes.filter(c=>c&&c.classId&&normalizeClassStatus(c)==="active").map(c=>String(c.classId)));
  const published=assignments.filter(a=>a&&a.assignmentId&&normalizeAssignmentStatus(a)==="published"&&activeIds.has(String(a.classId||"")));
  // One folder listing + its blobs per published assignment of an active class — the SAME scoped read shape as the
  // class-scoped analytics path (8E-3): drafts, archived assignments and archived classes are never read.
  const folders=await Promise.all(published.map(a=>loadFolder(container,String(a.assignmentId),deps)));
  const submissionsByAssignment=new Map(published.map((a,i)=>[String(a.assignmentId),folders[i]]));
  const derived=deriveTeacherToday({assignments,classes,users,submissionsByAssignment,nowMs});
  // Optional source: a messaging failure degrades THIS card only (explicit `partial`), never the whole hub.
  const partial=[];let unreadMessages=null;
  try{const u=await (deps.teacherDirectUnread||teacherDirectUnread)(container,teacherId,{},deps);unreadMessages={total:Math.max(0,Number(u.totalUnread)||0),capped:u.capped===true}}
  catch(e){partial.push("messages");obs?.logError("teacher.today.messages",e)}
  return {status:200,jsonBody:{ok:true,generatedAt:new Date(nowMs).toISOString(),...derived,attention:{...derived.attention,unreadMessages},partial}};
 }catch(e){obs?.logError("teacher.today.error",e);return {status:500,jsonBody:{ok:false,error:"تعذر تحميل ملخص اليوم حاليًا."}}}
}
app.http("teacherToday",{methods:["GET"],authLevel:"anonymous",route:"teacher-today",handler:withObservability("teacher-today",handler)});
module.exports={handler,deriveTeacherToday};
