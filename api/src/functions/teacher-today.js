// Phase 9A — Teacher Today Hub / Command Center: GET /api/teacher-today.
//
// A READ-ONLY, DERIVED view over the canonical stores the teacher's other pages already read — assignments, classes,
// users and the per-student submission documents (one folder listing + the existing blobs per published assignment
// of an ACTIVE class, bounded concurrency) plus the Phase 5D unread-messages summary. Nothing here is persisted, no
// second store is created, and no figure is invented: every count is a plain fact of those documents at request time.
//
//   attention.activeAttempts  — students working RIGHT NOW: a live attempt (started / draft) whose last activity (the
//                               last autosave, else its start) is within LIVE_WINDOW_MS, newest first;
//   attention.staleAttempts   — Phase 21H.0: live attempts with no activity for longer than that window, and attempts the
//                               teacher paused — still open, but nobody is working on them «now»; most recent first;
//   attention.notStarted      — OPEN assignments (per the same availability rule the student sees) with class members
//                               who have neither an attempt nor a live attempt yet, nearest deadline first;
//   attention.pendingReview   — assignments whose latest attempts still need manual review (the gradebook's rule);
//   attention.unreadMessages  — the teacher's unread direct-message summary (the SAME helper as the sidebar badge);
//   attention.dueSoon         — Phase 21H.3: open assignments whose deadline falls within 48 hours, with how many members
//                               have not submitted yet; nearest deadline first;
//   attention.resultsUnreleased — Phase 21H.3: «manual» results-release assignments (21G.5) with submissions whose results
//                               are not published yet — the teacher's step, never taken here;
//   attention.openingSoon     — Phase 21H.3: published assignments that open within the next 24 hours;
//   recent                    — the latest submissions / attempt starts (canonical attempt timestamps), newest first.
//
// Partial failure is explicit: the messages summary is optional (`unreadMessages: null` + "messages" in `partial`) so
// a messaging blip never blanks the attention cards. Item lists are capped for display; counts stay complete.
const {app}=require("@azure/functions");
const {withObservability}=require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const {getContainer,listJson,listBlobNames,downloadManyJson,getReadConcurrency}=require("../lib/platform-storage");
const {normalizeClassStatus}=require("../lib/class-lifecycle");
const {normalizeAssignmentStatus}=require("../lib/assignment-lifecycle");
const {isStudentClassMember}=require("../lib/class-membership");
const {attemptState,activeAttemptOf,deriveAttemptStatus,normalizeEndReason}=require("../lib/assignment-availability");
const {deriveGradingStatus}=require("../lib/grading-status");
const {technicalGradingPending}=require("../lib/technical-grading-hold");
const {teacherDirectUnread}=require("../lib/message-read-state");
// Phase 21H.3 — the results-release authority (21G.5): «results waiting to be published» is ITS rule, never re-derived here.
const {releaseMode,resultsReleased}=require("../lib/results-release");
// Phase 9C — project evaluation attention (students with ungraded project stages), derived from the classes/users the
// hub already loaded + one snapshot read and one progress-folder listing per active class × enrolled project.
const {loadProjectEvaluationSources,deriveProjectEvaluationAttention}=require("../lib/project-tracker/evaluation-attention");
const {logReadCost}=require("../lib/read-cost-log");
const {loadPublishedAssignmentsForClasses}=require("../lib/class-assignment-index");
// Phase 21G.0 — teacher tenancy: the Today hub covers only the teacher's own classes (everything below derives from them).
const {tenantOf,filterAccessible}=require("../lib/teacher-tenancy");
// Phase 21H.4 — the class, user and submission documents come through an ETag-verified in-memory cache: an unchanged document
// (same ETag in the listing) is not downloaded again on the next refresh. deps.docCache = null disables it (deps.listJson /
// listBlobNames / downloadManyJson test seams keep the plain path).
const {createDocCache,loadJsonDocs}=require("../lib/etag-doc-cache");
const DOC_CACHE=createDocCache();

const CP="platform/classes/",UP="platform/users/",SP="platform/submissions/";
const ITEM_CAP=8,RECENT_CAP=10;
// Phase 21H.0 — an open attempt counts as «active now» only while the student is actually working: its last autosave (or
// its start, before the first save) is at most this old. Older open attempts, and paused ones, are reported as stale.
const LIVE_WINDOW_MS=15*60e3;
// Phase 21H.3 — time windows of the new categories: closing soon (the deadline within the next 48 hours, still open) and
// opening soon (a published assignment whose openAt falls within the next 24 hours).
const DUE_SOON_MS=48*3600e3,OPENING_MS=24*3600e3;
const ms=v=>{const t=Date.parse(String(v||""));return Number.isFinite(t)?t:0};
const studentName=u=>String(u.displayName||[u.firstName,u.familyName].filter(Boolean).join(" ")||u.code||u.userId||"");

const cacheOf=deps=>(deps.docCache===undefined?DOC_CACHE:deps.docCache);
/** A whole prefix of JSON documents: the test seam deps.listJson when given, else the ETag-verified cache (21H.4). */
async function listDocs(container,prefix,deps,tally){
 if(deps.listJson)return deps.listJson(container,prefix);
 const r=await loadJsonDocs(container,prefix,cacheOf(deps));
 if(tally){tally.cachedDocs+=r.stats.cached;tally.downloadedDocs+=r.stats.downloaded}
 return r.docs;
}

/** The requested class scope ("" = all of the teacher's classes); an unreadable URL is no scope. */
function scopeOf(request){try{return String(new URL(request.url).searchParams.get("classId")||"").trim()}catch{return ""}}

/** The submission documents of ONE assignment folder, keyed by the student id THE DOCUMENT names (never the file name). */
async function loadFolder(container,assignmentId,deps,tally){
 let docs;
 if(deps.listBlobNames||deps.downloadManyJson){
  const list=deps.listBlobNames||listBlobNames,many=deps.downloadManyJson||downloadManyJson;
  const names=(await list(container,SP+assignmentId+"/")).filter(n=>n.endsWith(".json"));
  docs=await many(container,names,getReadConcurrency());
  if(tally){tally.submissionDocsLoaded+=names.length;tally.downloadedDocs+=names.length}   // Phase 12E-A: count only
 }else{
  const r=await loadJsonDocs(container,SP+assignmentId+"/",cacheOf(deps));
  docs=r.docs;
  if(tally){tally.submissionDocsLoaded+=r.stats.listed;tally.cachedDocs+=r.stats.cached;tally.downloadedDocs+=r.stats.downloaded}
 }
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
 const active=[],stale=[],notStarted=[],pending=[],recent=[],dueSoon=[],unreleased=[],opening=[];
 let activeCount=0,staleCount=0,notStartedCount=0,pendingCount=0;
 for(const a of published){
  const aid=String(a.assignmentId),cid=String(a.classId||""),className=activeClasses.get(cid).name,title=String(a.title||"");
  const members=membersByClass.get(cid)||[],subs=submissionsByAssignment.get(aid)||new Map();
  let ns=0,pr=0,nearestDue=ms(a.dueAt),notSubmitted=0,submitted=0;
  for(const u of members){
   const sid=String(u.userId),s=subs.get(sid)||null,st=attemptState(a,s,nowMs),live=activeAttemptOf(s);
   const attempts=Array.isArray(s?.attempts)?s.attempts:[],latest=attempts.length?attempts[attempts.length-1]:null;
   if(live){
    const status=deriveAttemptStatus(s),lastActivityAt=Math.max(ms(live.lastSavedAt),ms(live.startedAt));
    const item={assignmentId:aid,title,className,studentId:sid,studentName:studentName(u),startedAt:String(live.startedAt||""),lastActivityAt:lastActivityAt?new Date(lastActivityAt).toISOString():"",status};
    if(status!=="paused"&&lastActivityAt&&nowMs-lastActivityAt<=LIVE_WINDOW_MS){activeCount++;active.push(item)}else{staleCount++;stale.push(item)}
    recent.push({kind:"started",at:String(live.startedAt||""),assignmentId:aid,title,className,studentId:sid,studentName:studentName(u)})
   }
   if(st.availability==="open"&&!live&&attempts.length===0){ns++;const due=ms(st.effectiveDueAt||a.dueAt);if(due&&(!nearestDue||due<nearestDue))nearestDue=due}
   if(latest&&deriveGradingStatus(latest)==="pendingReview")pr++;
   if(attempts.length===0&&st.availability==="open")notSubmitted++;
   if(attempts.length>0)submitted++;
   for(const at of attempts){if(!at||!at.submittedAt)continue;const reason=normalizeEndReason(at);recent.push({kind:reason==="submitted"?"submitted":reason,at:String(at.submittedAt),assignmentId:aid,title,className,studentId:sid,studentName:studentName(u),percentage:!technicalGradingPending(at)&&Number.isFinite(Number(at.percentage))?Number(at.percentage):null   /* QA2-17: never a provisional 0% for a technical hold */})}
  }
  if(ns>0){notStartedCount+=ns;notStarted.push({assignmentId:aid,title,className,dueAt:nearestDue?new Date(nearestDue).toISOString():"",notStarted:ns,expected:members.length})}
  if(pr>0){pendingCount+=pr;pending.push({assignmentId:aid,title,className,pendingReview:pr})}
  // Phase 21H.3 — closing soon: the assignment's own deadline is within DUE_SOON_MS and members can still submit.
  const due=ms(a.dueAt),open=ms(a.openAt);
  if(due&&due>nowMs&&due-nowMs<=DUE_SOON_MS&&(!open||open<=nowMs))dueSoon.push({assignmentId:aid,title,className,dueAt:new Date(due).toISOString(),notSubmitted,expected:members.length});
  // Results waiting for the teacher: manual release, not yet released, and at least one submission to release.
  if(releaseMode(a)==="manual"&&!resultsReleased(a,nowMs)&&submitted>0)unreleased.push({assignmentId:aid,title,className,submitted,dueAt:due?new Date(due).toISOString():""});
  if(open&&open>nowMs&&open-nowMs<=OPENING_MS)opening.push({assignmentId:aid,title,className,openAt:new Date(open).toISOString(),expected:members.length});
 }
 active.sort((x,y)=>ms(y.lastActivityAt)-ms(x.lastActivityAt)||ms(y.startedAt)-ms(x.startedAt));
 stale.sort((x,y)=>ms(y.lastActivityAt)-ms(x.lastActivityAt));
 dueSoon.sort((x,y)=>ms(x.dueAt)-ms(y.dueAt)||y.notSubmitted-x.notSubmitted);
 unreleased.sort((x,y)=>(ms(x.dueAt)||Number.MAX_SAFE_INTEGER)-(ms(y.dueAt)||Number.MAX_SAFE_INTEGER));
 opening.sort((x,y)=>ms(x.openAt)-ms(y.openAt));
 notStarted.sort((x,y)=>(ms(x.dueAt)||Number.MAX_SAFE_INTEGER)-(ms(y.dueAt)||Number.MAX_SAFE_INTEGER)||y.notStarted-x.notStarted);
 pending.sort((x,y)=>y.pendingReview-x.pendingReview);
 recent.sort((x,y)=>ms(y.at)-ms(x.at));
 return {
  scope:{activeClasses:activeClasses.size,students:[...membersByClass.values()].reduce((n,l)=>n+l.length,0),publishedAssignments:published.length},
  attention:{
   activeAttempts:{count:activeCount,items:active.slice(0,ITEM_CAP)},
   staleAttempts:{count:staleCount,items:stale.slice(0,ITEM_CAP)},
   notStarted:{count:notStartedCount,assignments:notStarted.length,items:notStarted.slice(0,ITEM_CAP)},
   pendingReview:{count:pendingCount,assignments:pending.length,items:pending.slice(0,ITEM_CAP)},
   dueSoon:{count:dueSoon.length,items:dueSoon.slice(0,ITEM_CAP)},
   resultsUnreleased:{count:unreleased.length,items:unreleased.slice(0,ITEM_CAP)},
   openingSoon:{count:opening.length,items:opening.slice(0,ITEM_CAP)}
  },
  recent:recent.slice(0,RECENT_CAP)
 };
}

// `deps` is the optional dependency-injection seam for unit tests (production passes nothing); `obs` is the request
// context withObservability passes as the third argument. Neither changes runtime behaviour.
async function handler(request,deps={},obs=null){
 try{
  const auth=(await requireTeacherSession(request, deps));
  if(!auth.ok)return auth.response;
  const teacherId=String(auth.user&&auth.user.sub||"builder");
  const container=deps.container||(deps.getContainer||getContainer)();
  const lj=deps.listJson||listJson,nowMs=typeof deps.nowMs==="number"?deps.nowMs:Date.now();
  const tally={submissionDocsLoaded:0,cachedDocs:0,downloadedDocs:0};
  // Classes + users are still LISTED on every request; since 21H.4 only the documents whose ETag changed are downloaded.
  const [allClasses,users]=await Promise.all([listDocs(container,CP,deps,tally),listDocs(container,UP,deps,tally)]);
  let classes=filterAccessible(allClasses,tenantOf(auth.user));
  // Phase 21H.2 — the dashboard's ONE scope: ?classId= narrows the hub to one of the teacher's OWN classes (after the
  // tenancy filter, so it can never widen); a class the teacher cannot see is «not found», never someone else's data.
  const scopeClassId=scopeOf(request);
  if(scopeClassId){
   if(!classes.some(c=>c&&String(c.classId)===scopeClassId))return {status:404,jsonBody:{ok:false,error:"الصف غير موجود."}};
   classes=classes.filter(c=>c&&String(c.classId)===scopeClassId);
  }
  const activeIds=new Set(classes.filter(c=>c&&c.classId&&normalizeClassStatus(c)==="active").map(c=>String(c.classId)));
  // Phase 12E-B — the published assignments of the ACTIVE classes through the per-class index: no global assignment
  // listing in steady state; classes not yet bootstrapped share AT MOST ONE legacy scan for this whole request.
  const idx=await loadPublishedAssignmentsForClasses(container,[...activeIds],{...deps,listJson:lj},obs);
  const assignments=[...idx.byClass.values()].flat().sort((x,y)=>{const a=String(x.assignmentId)+".json",b=String(y.assignmentId)+".json";return a<b?-1:a>b?1:0});
  const published=assignments.filter(a=>a&&a.assignmentId&&normalizeAssignmentStatus(a)==="published"&&activeIds.has(String(a.classId||"")));
  // One folder listing + its blobs per published assignment of an active class — the SAME scoped read shape as the
  // class-scoped analytics path (8E-3): drafts, archived assignments and archived classes are never read.
  // The submission folders and the project-evaluation sources are independent reads → issued together (each bounded).
  const [folders,projectSources]=await Promise.all([
   Promise.all(published.map(a=>loadFolder(container,String(a.assignmentId),deps,tally))),
   (deps.loadProjectEvaluationSources||loadProjectEvaluationSources)(container,classes,deps).then(v=>({ok:true,value:v}),e=>({ok:false,error:e}))
  ]);
  const submissionsByAssignment=new Map(published.map((a,i)=>[String(a.assignmentId),folders[i]]));
  const derived=deriveTeacherToday({assignments,classes,users,submissionsByAssignment,nowMs});
  // Optional sources: a messaging (or project-storage) failure degrades THAT block only (explicit `partial`), never the hub.
  const partial=[];let unreadMessages=null,projectEvaluation=null;
  try{const u=await (deps.teacherDirectUnread||teacherDirectUnread)(container,teacherId,{},deps);unreadMessages={total:Math.max(0,Number(u.totalUnread)||0),capped:u.capped===true}}
  catch(e){partial.push("messages");obs?.logError("teacher.today.messages",e)}
  // Phase 9C — additive block: students with ungraded project stages (Phase 9B evaluation semantics, one authority).
  if(projectSources.ok){try{projectEvaluation=deriveProjectEvaluationAttention({users,sources:projectSources.value})}catch(e){partial.push("projectEvaluation");obs?.logError("teacher.today.projectEvaluation",e)}}
  else{partial.push("projectEvaluation");obs?.logError("teacher.today.projectEvaluation",projectSources.error)}
  // Phase 12E-A — count-only read-cost telemetry (the scans' own sizes; never an id/name/title/mark).
  logReadCost(obs,"teacher.today.read_cost",{assignmentDocsScanned:idx.stats.assignmentDocsLoaded,classDocsScanned:classes.length,userDocsScanned:users.length,publishedActiveAssignments:published.length,submissionFolderListings:published.length,submissionDocsLoaded:tally.submissionDocsLoaded,assignmentIndexReads:idx.stats.indexReads,assignmentIndexesBootstrapped:idx.stats.bootstrapped,globalAssignmentScans:idx.stats.globalScans,assignmentIndexAuthoritative:idx.stats.authoritative,assignmentIndexAuthorityChanges:idx.stats.authorityChanges,docCacheHits:tally.cachedDocs,docsDownloaded:tally.downloadedDocs});
  return {status:200,jsonBody:{ok:true,generatedAt:new Date(nowMs).toISOString(),...(scopeClassId?{scopeClassId}:{}),...derived,attention:{...derived.attention,unreadMessages},projectEvaluation,partial}};
 }catch(e){obs?.logError("teacher.today.error",e);return {status:500,jsonBody:{ok:false,error:"تعذر تحميل ملخص اليوم حاليًا."}}}
}
app.http("teacherToday",{methods:["GET"],authLevel:"anonymous",route:"teacher-today",handler:withObservability("teacher-today",handler)});
module.exports={handler,deriveTeacherToday,LIVE_WINDOW_MS};
