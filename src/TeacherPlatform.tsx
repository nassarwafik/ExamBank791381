import {lazy,Suspense,useEffect,useMemo,useRef,useState} from "react";
import {TeacherHttpError,isStaleEdit} from "./teacherFetch";
import {validIdentity} from "./students/identity";
import AssignmentsPanel from "./AssignmentsPanel";
import AssignmentReview from "./AssignmentReview";
import {lazyWithRetry} from "./lazyWithRetry";
import {newRequestKey} from "./bank/bankQuestionModel";
// Phase 8E-2 — the Dashboard (and with it the whole Chart.js graph) is a LAZY chunk: it is the only initial-graph consumer
// of chart.js, so a static import shipped ~186 KB of charting code to every user (students included) before first paint.
// lazyWithRetry keeps the one-shot stale-chunk deployment recovery; the module is fetched once per page load and then
// served from the module cache on every return to the tab. The chunk is guarded by scripts/check-bundle-budget.mjs.
const TeacherDashboard=lazy(lazyWithRetry(()=>import("./TeacherDashboard"),"teacher-dashboard"));
import AuditHistoryPanel from "./AuditHistoryPanel";
import TeacherTodayHub from "./teacher/TeacherTodayHub";
import { TodaySlot, type TodayScope } from "./teacher/todaySlot";
import type { ProjectEvaluationQueueItem, ProjectStudentRef } from "./projects/drillTarget";
import type { AssignmentDrill, AssignmentDrillTarget } from "./assignments/drillTarget";
import type {TeacherNavId} from "./shell/teacherNav";
import {parseBulkStudents,readImportFileText,IMPORT_TEMPLATE_CSV} from "./bulkStudentsParse";
import {normalizeClassStatus} from "./classLifecycle";
import {getClassProgramCodes} from "./projects/classPrograms";
import {useConfirm} from "./ui/useConfirm";
import ClassesPane from "./students/ClassesPane";
import RosterPane from "./students/RosterPane";
import ClassLearningMaterialsPanel from "./students/ClassLearningMaterialsPanel";
import {classLearningMaterials} from "./students/classLearningMaterials";
import StudentDialog from "./students/StudentDialog";
import {CreateClassDialog,EditClassDialog,AddStudentDialog,ImportStudentsDialog,EditStudentDialog} from "./students/StudentForms";
import {identityDigits,matchesSearch,isTwelfthGrade,defaultSchoolYear,safeFileName} from "./students/rosterText";
import {buildCredentialsCsv,buildCredentialCardsHtml,printHtmlDocument} from "./students/credentialSheets";
import type {ClassArchiveView,Classroom,ClassLearningMaterial,LearningCatalogCourse,ProjectOption,Student,Credential,BulkStudent,BulkError,ImportPreviewRow,SubmittedAssignment,StudentProfile,SortKey,StatusFilter,ProfileSection} from "./students/types";
import {type CredentialBatch,openCredentialBatch,toggleCredentialBatchCollapsed,credentialBatchVisible,buildCredentialsDownload,markCredentialBatchSaved,credentialBatchUnsaved} from "./credentialBatch";
import {appendStudentRow,mergeStudentRow,removeStudentRow,pruneSelectedIds,needsAuthoritativeReload} from "./rosterPatch";
// Phase 11A — the ONE trusted CSV cell encoder (quotes + formula-injection guard), shared with the Reports Center.
import {csvCell} from "./reports/csv";
import {arabicCount,STUDENTS_GENITIVE} from "./learning/arabicCount";

type WorkspaceTab="dashboard"|"students"|"assignments"|"audit";
// onCopyLibraryExamToBuilder: forwarded straight to AssignmentsPanel; the snapshot is typed loosely
// here (App owns the real ExamDraft type) to avoid a value/type import coupling to App.tsx.
type TeacherPlatformProps={token:string;currentExam:unknown|null;workspaceTab:WorkspaceTab;onCopyLibraryExamToBuilder?:(examSnapshot:any,title:string)=>void;
 /** UX-6a: the project catalog App already loaded at boot. When provided, this panel issues NO catalog request of its own. */
 projects?:ProjectOption[];
 /** Phase 9A — the shell's navigation (App owns the state): the Today Hub's quick actions go through it, never a second router. */
 onNavigate?:(id:TeacherNavId)=>void;
 /** Phase 9C — App's existing project navigation (goToProjects) for the Today Hub's project-evaluation rows. */
 onOpenProject?:(projectCode:string)=>void;
 /** Phase 9D — App's drill-in (exact project + class + student) for the Today Hub's evaluation rows. */
 onOpenProjectStudent?:(ref:ProjectStudentRef)=>void;
 /** Phase 9F — App's evaluation queue session (the hub's server-ordered rows, started at the clicked row). */
 onStartEvaluationQueue?:(items:ProjectEvaluationQueueItem[],startIndex:number)=>void;
 /** Phase 12B — App's assignment drill-in: the Today Hub hands a typed target (identifiers + intent) to App, App switches to
  * the assignments workspace and publishes the sequenced drill; AssignmentsPanel applies it once and reports it consumed. */
 onOpenAssignmentTarget?:(target:AssignmentDrillTarget)=>void;
 assignmentDrill?:AssignmentDrill|null;
 onAssignmentDrillConsumed?:(seq:number)=>void;
 /** The shell's logout: an authoritative 401 from this workspace's API ends the teacher session (like App's apiRequest). */
 onSessionExpired?:()=>void;
 /** Phase S.3 — reports whether a generated credential batch is open and was never downloaded or printed: App asks before a
  * navigation that would unmount this workspace (its plaintext passwords live only here). */
 onCredentialsPendingChange?:(pending:boolean)=>void};
type ApiError={ok?:boolean;error?:string;code?:string};
type WorkspaceDialog="none"|"createClass"|"addStudent"|"import"|"editClass";

// Arabic-Indic digits typed on an Arabic keyboard are digits too (the server maps them the same way).
const onlyDigits=identityDigits;
const fmtDate=(value:string)=>{if(!value)return "—";const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleString("ar")};
// U.2 — a day without the time (the archived class card: «19 أكتوبر 2026»).
const fmtDay=(value:string)=>{if(!value)return "—";const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("ar",{day:"numeric",month:"long",year:"numeric"})};
const toLocalInput=(iso:string)=>{if(!iso)return "";const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
function splitName(value:unknown){
 const parts=String(value??"").trim().split(/\s+/).filter(Boolean);
 return {firstName:parts.shift()||"",familyName:parts.join(" ")};
}
// Roadmap #34: the ONE class-lifecycle predicate for this screen — a class is active only through the canonical helper
// (status "archived" OR active:false ⇒ archived). Never the raw `active` flag, which is a compatibility field of
// /api/classrooms. Unrelated to Student.active (login eligibility).
const isActiveClass=(c:Classroom)=>normalizeClassStatus(c)==="active";
const NO_STUDENTS:Student[]=[];
function statusLabel(student:Student){
 if(student.archived)return "مؤرشف";
 return student.active?"فعّال":"معطّل";
}
// Roadmap #25: a membership change may finish with the class COUNT index sync deferred (rosterSynced:false).
// The operation itself succeeded; the count self-heals on the next roster load — tell the teacher, non-fatally.
const ROSTER_SYNC_NOTE=" تم تنفيذ العملية، وسيتم تحديث عداد الصف تلقائيًا.";
// Phase S.3 — a failed import keeps its preview and its retry key: retrying is safe (no duplicate account is created, and an
// account the lost attempt created comes back with a new password).
const IMPORT_RETRY_NOTE=" يمكنك إعادة المحاولة بأمان: لن تُنشأ حسابات مكررة، وتظهر كلمات مرور جديدة لأي حساب أُنشئ دون أن تصلك بياناته.";
// The key must be unguessable (it lets a retry re-issue passwords of never-used accounts it created); without a cryptographic
// source no key is sent and the import behaves as before (rows already created are reported as duplicates).
function newImportId(){
 const c=globalThis.crypto;
 if(c&&typeof c.randomUUID==="function")return c.randomUUID();
 if(c&&typeof c.getRandomValues==="function")return Array.from(c.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("");
 return "";
}
function withRosterNote(result:{rosterSynced?:boolean}|null|undefined,message:string):string{
 return result&&result.rosterSynced===false?message+ROSTER_SYNC_NOTE:message;
}

function TeacherPlatform(props:TeacherPlatformProps){
 const {token,currentExam,workspaceTab,onCopyLibraryExamToBuilder}=props;
 const [classes,setClasses]=useState<Classroom[]>([]);
 const [fetchedProjects,setPrograms]=useState<ProjectOption[]>([]);
 const projects=props.projects??fetchedProjects;
 const [classArchiveView,setClassArchiveView]=useState<ClassArchiveView>("active");
 const [students,setStudents]=useState<Student[]>([]);
 const [selectedClassId,setSelectedClassId]=useState("");
 // Roadmap #32: the class that is CURRENTLY selected, readable after an await. A response that belongs to a
 // class the teacher has since left is never committed into the visible roster (see loadStudents and the
 // single-row actions below).
 const selectedClassRef=useRef("");
 // Phase S.0 — the classes read and the roster read have SEPARATE load states (one finishing never ends the other's
 // skeleton). The roster state names the class it belongs to: rows, counts and row actions are shown only once the
 // SELECTED class's roster is loaded, so another class's rows never appear under this class's name. A failed first read is
 // an error with a retry (never «no students / no classes yet»); a failed refresh keeps the last rows and reports it above.
 const [classesLoad,setClassesLoad]=useState<{status:"loading"|"ready"|"error";error:string;busy:boolean}>({status:"loading",error:"",busy:true});
 const [rosterLoad,setRosterLoad]=useState<{classId:string;status:"loading"|"ready"|"error";error:string;busy:boolean}>({classId:"",status:"loading",error:"",busy:false});
 const classesReadyRef=useRef(false);
 const rosterReadyFor=useRef("");
 const [actionBusy,setActionBusy]=useState(false);
 // Class Learning Materials: the publishable catalog (GET /api/learning-materials-catalog) is read ONCE per students
 // workspace lifecycle — never per class card — and is metadata only (course/module ids, titles, order).
 const [learningCatalog,setLearningCatalog]=useState<LearningCatalogCourse[]|null>(null);
 const [learningCatalogError,setLearningCatalogError]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");

 const [newClassName,setNewClassName]=useState("");
 const [newClassGrade,setNewClassGrade]=useState("");
 // From August a new school year starts (a class created in February belongs to the year that began last autumn).
 const [newSchoolYear,setNewSchoolYear]=useState(()=>defaultSchoolYear());
 const [editClass,setEditClass]=useState<{classId:string;name:string;grade:string;schoolYear:string;original:{name:string;grade:string;schoolYear:string}}|null>(null);

 const [newFirstName,setNewFirstName]=useState("");
 const [newFamilyName,setNewFamilyName]=useState("");
 const [newIdentityNumber,setNewIdentityNumber]=useState("");
 const [newStudentPassword,setNewStudentPassword]=useState("");

 const [credentialBox,setCredentialBox]=useState<{name:string;identityNumber:string;password:string}|null>(null);
 // Class-scoped, in-memory-only batch of generated plaintext credentials (see credentialBatch.ts).
 const [credentialBatch,setCredentialBatch]=useState<CredentialBatch|null>(null);
 const [bulkErrors,setBulkErrors]=useState<BulkError[]>([]);

 const [,setBulkStudents]=useState<BulkStudent[]>([]);
 const [bulkFileName,setBulkFileName]=useState("");
 const [importPreview,setImportPreview]=useState<ImportPreviewRow[]>([]);
 // Phase S.3 — the retry key of ONE previewed file: every attempt to import that preview sends the same key, so a retry after
 // a lost response recovers the accounts the first attempt created instead of reporting them as duplicates (see the server).
 const [importId,setImportId]=useState("");
 const [previewBusy,setPreviewBusy]=useState(false);

 const [editingStudent,setEditingStudent]=useState<Student|null>(null);
 const [editFirstName,setEditFirstName]=useState("");
 const [editFamilyName,setEditFamilyName]=useState("");
 const [editIdentityNumber,setEditIdentityNumber]=useState("");
 const [editClassId,setEditClassId]=useState("");
 const [editPassword,setEditPassword]=useState("");

 const [searchText,setSearchText]=useState("");
 const [statusFilter,setStatusFilter]=useState<StatusFilter>("all");
 const [sortKey,setSortKey]=useState<SortKey>("familyName");
 const [sortAsc,setSortAsc]=useState(true);
 const [selectedIds,setSelectedIds]=useState<string[]>([]);
 const [bulkTargetClassId,setBulkTargetClassId]=useState("");

 const [profile,setProfile]=useState<StudentProfile|null>(null);
 const [profileBusy,setProfileBusy]=useState(false);
 const [passwordReveal,setPasswordReveal]=useState<{password:string;secondsLeft:number}|null>(null);
 const passwordRevealTimer=useRef<number|null>(null);
 // The profile request generation: a profile response is committed only if no newer profile request (another student,
 // a class switch, a close) superseded it — a late response for student A never opens over student B or another class.
 const profileSeq=useRef(0);

 const [profileSection,setProfileSection]=useState<ProfileSection>("summary");
 const [dialog,setDialog]=useState<WorkspaceDialog>("none");
 // UX-4: accessible confirm dialog with the awaited adapter — same messages and gating order as the old synchronous browser confirm.
 const {confirm,cancelPending,confirmDialog}=useConfirm();
 const [reviewTarget,setReviewTarget]=useState<{assignmentId:string;studentId:string;attemptNumber:number}|null>(null);
 const [historyDeadlineFor,setHistoryDeadlineFor]=useState<string|null>(null);
 const [historyDeadlineValue,setHistoryDeadlineValue]=useState("");

 const selectedClass=useMemo(()=>classes.find(c=>c.classId===selectedClassId)||null,[classes,selectedClassId]);
 const activeClasses=useMemo(()=>classes.filter(c=>normalizeClassStatus(c)==="active"),[classes]);
 const archivedClasses=useMemo(()=>classes.filter(c=>normalizeClassStatus(c)==="archived"),[classes]);
 const visibleClasses=classArchiveView==="active"?activeClasses:archivedClasses;
 // "12", "١٢", "12-ب", "الثاني عشر", "ثاني عشر" (never "112"): see rosterText.isTwelfthGrade.
 function isGraduationEligible(classroom:Classroom){return isTwelfthGrade(classroom.grade||"")}

 const rosterReady=rosterLoad.classId===selectedClassId&&rosterLoad.status==="ready";
 const rosterError=rosterLoad.classId===selectedClassId&&rosterLoad.status==="error"?rosterLoad.error:"";
 // Only the selected class's loaded roster is ever shown or acted on (see rosterLoad).
 const rosterStudents=useMemo(()=>rosterReady?students:NO_STUDENTS,[rosterReady,students]);
 const stats=useMemo(()=>{
  const current=rosterStudents.filter(s=>!s.archived);
  return {
   total:rosterStudents.length,
   active:current.filter(s=>s.active).length,
   disabled:current.filter(s=>!s.active).length,
   archived:rosterStudents.filter(s=>s.archived).length,
   neverLogged:rosterStudents.filter(s=>!s.archived&&!s.lastLoginAt).length
  };
 },[rosterStudents]);

 const visibleStudents=useMemo(()=>{
  const tieBreak=(a:Student,b:Student)=>{
   for(const key of ["firstName","displayName","identityNumber"] as const){const d=String(a[key]||"").localeCompare(String(b[key]||""),"ar",{numeric:true});if(d)return d}
   return 0;
  };
  // Arabic-aware search: hamza / taa-marbuta / alef-maqsura variants, diacritics and Arabic digits fold together, and
  // every typed word must match ("احمد علي" finds "أحمد العلي").
  const filtered=rosterStudents.filter(student=>{
   if(statusFilter==="active"&&(student.archived||!student.active))return false;
   if(statusFilter==="disabled"&&(student.archived||student.active))return false;
   if(statusFilter==="archived"&&!student.archived)return false;
   if(statusFilter==="neverLogged"&&(student.archived||student.lastLoginAt))return false;
   return matchesSearch([student.firstName,student.familyName,student.displayName,student.identityNumber,student.code],searchText);
  });

  const factor=sortAsc?1:-1;
  return [...filtered].sort((a,b)=>{
   let av="",bv="";
   if(sortKey==="status"){av=statusLabel(a);bv=statusLabel(b)}
   else {av=String(a[sortKey]||"");bv=String(b[sortKey]||"")}
   // U.2 — equal keys (a family, a status) fall back to the first name, then the full name and the identity, all with
   // numeric order («طالب2» before «طالب10»), so ties never keep the server's listing order.
   return (av.localeCompare(bv,"ar",{numeric:true})||tieBreak(a,b))*factor;
  });
 },[rosterStudents,searchText,statusFilter,sortKey,sortAsc]);

 // A bulk action applies only to students the teacher can SEE: rows hidden by the search / status filter are never part
 // of the effective selection (a hidden selected row could otherwise be deleted without being visible).
 const visibleSelectedIds=useMemo(()=>{const visible=new Set(visibleStudents.map(s=>s.userId));return selectedIds.filter(id=>visible.has(id))},[selectedIds,visibleStudents]);

 async function teacherApi<T>(url:string,options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers||{});
  headers.set("Content-Type","application/json");
  headers.set("x-builder-token",token);
  headers.set("Authorization","Bearer "+token);
  let response:Response;
  try{response=await fetch(url,{...options,headers})}
  catch{throw new Error("تعذر الاتصال بالخادم. تحقق من الاتصال وأعد المحاولة.")}
  // A non-JSON body (gateway 502 page, cold-start HTML) is never surfaced as a parser error in English.
  let result:(T&ApiError)|null=null;
  try{result=await response.json() as T&ApiError}catch{result=null}
  if(response.status===401){props.onSessionExpired?.();throw new Error(result?.error||"انتهت الجلسة. سجّل الدخول من جديد.")}
  if(!response.ok)throw new TeacherHttpError(result?.error||(response.status>=500?"الخادم غير متاح حاليًا. أعد المحاولة بعد قليل.":"حدث خطأ."),response.status,typeof result?.code==="string"?result.code:"");   // QA-7: the code travels (STUDENT_STALE)
  if(!result)throw new Error("استجابة غير متوقعة من الخادم. أعد المحاولة.");
  return result;
 }

 async function loadClasses(preserveSelection=true){
  setClassesLoad(prev=>({...prev,busy:true}));setError("");
  try{
   const result=await teacherApi<{ok:true;classes:Classroom[]}>("/api/classrooms");
   const loaded=result.classes||[];
   setClasses(loaded);
   if(!preserveSelection||!selectedClassId||!loaded.some(c=>c.classId===selectedClassId)){
    const first=loaded.find(isActiveClass)||loaded[0];
    setSelectedClassId(first?.classId||"");
   }
   classesReadyRef.current=true;
   setClassesLoad({status:"ready",error:"",busy:false});
  }catch(e){
   const message=e instanceof Error?e.message:"تعذر تحميل الصفوف.";
   // A failed refresh keeps the listed classes (reported above); a failed first read is the pane's own error state.
   if(classesReadyRef.current){setError(message);setClassesLoad(prev=>({...prev,busy:false}))}
   else setClassesLoad({status:"error",error:message,busy:false});
  }
 }

 // Authoritative roster read. GET /api/students is ALSO the server-side roster-index self-heal path, so it is
 // always issued when asked for (even for a class that is no longer selected — the reconcile still runs); its
 // result is committed to the visible roster ONLY while `classId` is still the selected class (Roadmap #32).
 async function loadStudents(classId:string){
  if(!classId){setStudents([]);return}
  // A repair-only read (a class that is not selected) never touches the visible roster or its load state.
  if(selectedClassRef.current===classId){
   setError("");
   setRosterLoad(prev=>prev.classId===classId&&prev.status==="ready"?{...prev,busy:true}:{classId,status:"loading",error:"",busy:true});
  }
  try{
   const result=await teacherApi<{ok:true;students:Student[]}>("/api/students?classId="+encodeURIComponent(classId)+"&includeArchived=1");
   if(selectedClassRef.current!==classId)return;
   setStudents(result.students||[]);
   setSelectedIds(prev=>prev.filter(id=>(result.students||[]).some(s=>s.userId===id)));
   rosterReadyFor.current=classId;
   setRosterLoad({classId,status:"ready",error:"",busy:false});
  }catch(e){
   if(selectedClassRef.current!==classId)return;
   const message=e instanceof Error?e.message:"تعذر تحميل الطلاب.";
   // A failed refresh keeps the rows already shown (reported above); a failed first read is the roster's error state.
   if(rosterReadyFor.current===classId){setError(message);setRosterLoad(prev=>({...prev,busy:false}))}
   else setRosterLoad({classId,status:"error",error:message,busy:false});
  }
 }

 // Roadmap #32: the authoritative fallback after a single-row mutation whose response cannot be patched locally
 // (rosterSynced:false, incomplete/unexpected body), and the manual refresh. ORDER MATTERS and is sequential:
 // the roster read first (it repairs the class count index on the server), THEN the classes read, so the
 // repaired studentCount is what the class cards show. Never Promise.all here.
 async function reloadAuthoritative(classId:string){
  await loadStudents(classId);
  await loadClasses();
 }
 // A MOVE touches TWO roster indexes (remove from the source class, add to the target class) and the server reports
 // rosterSynced = removed.synced && added.synced, so an ambiguous move must reconcile BOTH classes — each GET students
 // runs the server-side repair for its own class — source first, then target, and only then the classes read.
 // loadStudents commits a roster only for the currently selected class, so at most one of the two reads renders;
 // the other (or both, when a third class is selected) is repair-only.
 async function reloadAuthoritativeMove(sourceClassId:string,targetClassId:string){
  await loadStudents(sourceClassId);
  if(targetClassId!==sourceClassId)await loadStudents(targetClassId);
  await loadClasses();
 }
 // A patch is applied to the visible roster only if the action's source class is still the selected one.
 function stillSelected(classId:string){return selectedClassRef.current===classId}

 useEffect(()=>{void loadClasses(false)},[]);
 function loadLearningCatalog(){
  return teacherApi<{ok:true;courses?:LearningCatalogCourse[]}>("/api/learning-materials-catalog")
   .then(result=>{setLearningCatalog(Array.isArray(result.courses)?result.courses:[]);setLearningCatalogError("")})
   .catch(e=>{setLearningCatalog(null);setLearningCatalogError(e instanceof Error?e.message:"تعذر تحميل قائمة المواد التعليمية.")});
 }
 // The catalog is needed only by the Classes & Students workspace (the panel lives there); other tabs never request it.
 useEffect(()=>{if(workspaceTab!=="students"||learningCatalog!==null)return;void loadLearningCatalog()},[workspaceTab]);// eslint-disable-line react-hooks/exhaustive-deps
 // Registry-driven list of projects for the per-class project selector (no hard-coded codes).
 // Only a standalone mount (no catalog from App) reads the registry itself; inside the app the boot read is reused.
 useEffect(()=>{if(props.projects!==undefined)return;teacherApi<{projects?:ProjectOption[]}>("/api/project-tracker?resource=projects").then(r=>setPrograms(r.projects||[])).catch(()=>setPrograms([]));},[]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{
  selectedClassRef.current=selectedClassId;
  profileSeq.current++;setProfileBusy(false);
  // The move target never carries over to another class (it could equal the newly selected class).
  setBulkTargetClassId("");
  // The create-class dialog is not scoped to the selected class: a class change (including the first selection after the load,
  // whose effect can flush just after the dialog was opened) keeps it open; every class-scoped dialog closes.
  setSelectedIds([]);setProfile(null);setEditingStudent(null);setReviewTarget(null);setHistoryDeadlineFor(null);setDialog(d=>d==="createClass"?d:"none");cancelPending();clearPasswordReveal();
  // Single-student credential box + bulk errors are cleared so a plaintext password / error never shows
  // under a different class. The bulk credentialBatch is NOT cleared here — it stays in memory and is
  // simply HIDDEN unless its owning class is selected again (avoids accidental loss on a stray click).
  setCredentialBox(null);setBulkErrors([]);
  // Phase S.0: the previous class's rows are dropped before the new class's roster is read.
  rosterReadyFor.current="";setStudents([]);
  if(selectedClassId)void loadStudents(selectedClassId);
 },[selectedClassId]);
 useEffect(()=>()=>{if(passwordRevealTimer.current)window.clearInterval(passwordRevealTimer.current)},[]);
 // Phase S.3 — an open batch that was never downloaded or printed exists only in this tab: closing or reloading the page asks
 // first (the browser's own prompt), and App asks before a navigation that unmounts this workspace.
 const credentialsPending=credentialBatchUnsaved(credentialBatch);
 const onCredentialsPendingChange=props.onCredentialsPendingChange;
 useEffect(()=>{
  onCredentialsPendingChange?.(credentialsPending);
  if(!credentialsPending)return;
  const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=""};
  window.addEventListener("beforeunload",warn);
  return ()=>{window.removeEventListener("beforeunload",warn);onCredentialsPendingChange?.(false)};
 },[credentialsPending,onCredentialsPendingChange]);

 // Phase S.4 — a row or bulk action can remove the control focus returns to (the row and its menu after a delete, a move or a
 // filtered-out status change; the bulk bar once the selection is cleared). Focus then lands on the roster heading instead of
 // falling to <body>, where a keyboard or screen-reader user would start again from the top of the page. A teacher who has
 // already moved focus to a control that is still on the page is left where they are.
 function keepRosterFocus(){
  window.setTimeout(()=>{
   // A removed focused element hands focus to <body> (the HTML focus fix-up rule), so <body> is the "lost" signal.
   const active=document.activeElement;
   if(active&&active!==document.body)return;
   const heading=document.getElementById("eb-roster-title");
   if(!heading)return;
   if(!heading.hasAttribute("tabindex"))heading.setAttribute("tabindex","-1");
   heading.focus();
  },0);
 }
 function clearPasswordReveal(){
  if(passwordRevealTimer.current){window.clearInterval(passwordRevealTimer.current);passwordRevealTimer.current=null}
  setPasswordReveal(null);
 }
 function startPasswordReveal(password:string){
  clearPasswordReveal();
  setPasswordReveal({password,secondsLeft:10});
  passwordRevealTimer.current=window.setInterval(()=>{
   setPasswordReveal(prev=>{
    if(!prev)return null;
    if(prev.secondsLeft<=1){
     if(passwordRevealTimer.current){window.clearInterval(passwordRevealTimer.current);passwordRevealTimer.current=null}
     return null;
    }
    return {...prev,secondsLeft:prev.secondsLeft-1};
   });
  },1000);
 }

 // Batch-4 fix (D3): one request key per «إنشاء الصف» submission (kept for a retry after a failure, renewed after a
 // success), and a synchronous in-flight guard: a double click or a retry never creates the class twice.
 const createKeyRef=useRef("");
 const createInFlightRef=useRef(false);
 async function createClass(){
  if(!newClassName.trim()||actionBusy||createInFlightRef.current)return;
  createInFlightRef.current=true;
  if(!createKeyRef.current)createKeyRef.current=newRequestKey();
  setActionBusy(true);setError("");setNotice("");
  try{
   const result=await teacherApi<{ok:true;classroom:Classroom}>("/api/classrooms",{method:"POST",body:JSON.stringify({action:"create",name:newClassName.trim(),grade:newClassGrade.trim(),schoolYear:newSchoolYear.trim(),requestKey:createKeyRef.current})});
   createKeyRef.current="";
   setNewClassName("");setNewClassGrade("");setDialog("none");
   await loadClasses(false);
   setSelectedClassId(result.classroom.classId);
   setNotice("✓ تم إنشاء الصف.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء الصف.")}
  finally{setActionBusy(false);createInFlightRef.current=false}
 }

 function openEditClass(classroom:Classroom){
  setError("");setNotice("");
  const original={name:classroom.name||"",grade:classroom.grade||"",schoolYear:classroom.schoolYear||""};
  setEditClass({classId:classroom.classId,...original,original});setDialog("editClass");
 }
 async function saveClassEdit(){
  if(!editClass||!editClass.name.trim()||actionBusy)return;
  setActionBusy(true);setError("");setNotice("");
  try{
   const result=await teacherApi<{ok:true;changed?:boolean}>("/api/classrooms",{method:"POST",body:JSON.stringify({action:"update",classId:editClass.classId,name:editClass.name.trim(),grade:editClass.grade.trim(),schoolYear:editClass.schoolYear.trim()})});
   setDialog("none");setEditClass(null);
   await loadClasses();
   setNotice(result.changed===false?"لم تتغير بيانات الصف.":"✓ تم حفظ بيانات الصف.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ بيانات الصف.")}
  finally{setActionBusy(false)}
 }

 function projectTitle(code:string){return projects.find(p=>p.projectCode===code)?.title||("مشروع "+code);}
 // Toggle ONE project on/off for a class (add or remove) via the modern programCodes[] set. A class can
 // hold any number of projects; toggling one never touches the others' snapshots/progress.
 async function toggleClassProject(classroom:Classroom,code:string,enable:boolean){
  if(actionBusy)return;
  const current=getClassProgramCodes(classroom);
  const next=enable?[...current,code]:current.filter(c=>c!==code);
  if(enable){
   // Adding is low-friction — a light confirm only.
   if(!(await confirm({message:"إضافة "+projectTitle(code)+" للصف \""+classroom.name+"\"؟\nلن تتأثر بيانات المشاريع الأخرى.",confirmLabel:"إضافة"})))return;
  }else{
   if(!(await confirm({message:"سيتم إخفاء "+projectTitle(code)+" عن هذا الصف.\nلن تُحذف بيانات التقدم أو إعدادات المشروع، ويمكن إعادته لاحقًا.",confirmLabel:"إزالة"})))return;
  }
  setActionBusy(true);setError("");setNotice("");
  try{
   await teacherApi("/api/classrooms",{method:"POST",body:JSON.stringify({action:"setPrograms",classId:classroom.classId,programCodes:next,baseProgramCodes:current})});   // QA-7: applied as a change to the stored list
   await loadClasses();
   setNotice(enable?("✓ تمت إضافة "+projectTitle(code)+" للصف. افتحه من قسم المشاريع."):("✓ تمت إزالة "+projectTitle(code)+" من الصف (البيانات محفوظة)."));
  }catch(e){setError(e instanceof Error?e.message:"تعذر تعديل مشاريع الصف.")}
  finally{setActionBusy(false)}
 }

 // ── Class Learning Materials (progressive release) ─────────────────────────────────────────────────────────────
 // Every mutation goes through POST /api/classrooms; the server validates course/module ids against ITS registry,
 // canonicalizes the order and returns the class's normalized `learningMaterials`, which is patched into the classes
 // list BY classId (Roadmap #32 discipline: a response for class A can never overwrite the panel of a class B the
 // teacher selected meanwhile — the patch targets A's row only, and the visible panel always reads the selected row).
 function commitLearningMaterials(classId:string,learningMaterials:ClassLearningMaterial[]){
  setClasses(prev=>prev.map(c=>c.classId===classId?{...c,learningMaterials}:c));
 }
 const learningCourseTitle=(courseId:string)=>learningCatalog?.find(c=>c.courseId===courseId)?.title||("كتاب "+courseId);
 const learningModuleTitle=(courseId:string,moduleId:string)=>learningCatalog?.find(c=>c.courseId===courseId)?.modules.find(m=>m.moduleId===moduleId)?.title||moduleId;
 async function setLearningCourseModules(classroom:Classroom,courseId:string,moduleIds:string[],successMessage:string){
  setActionBusy(true);setError("");setNotice("");
  try{
   const result=await teacherApi<{ok:true;classId:string;learningMaterials:ClassLearningMaterial[]}>("/api/classrooms",{method:"POST",body:JSON.stringify({action:"setLearningCourseModules",classId:classroom.classId,courseId,moduleIds})});
   commitLearningMaterials(classroom.classId,Array.isArray(result.learningMaterials)?result.learningMaterials:[]);
   setNotice(successMessage);
  }catch(e){setError(e instanceof Error?e.message:"تعذر تعديل المواد التعليمية للصف.")}
  finally{setActionBusy(false)}
 }
 // Attach a course with its INITIAL published modules ([] is valid: attached, nothing released yet).
 async function addLearningCourse(classroom:Classroom,courseId:string,moduleIds:string[]){
  if(actionBusy)return;
  const title=learningCourseTitle(courseId);
  await setLearningCourseModules(classroom,courseId,moduleIds,moduleIds.length?("✓ تمت إضافة «"+title+"» للصف ونشر "+moduleIds.length+" من فصوله للطلاب."):("✓ تمت إضافة «"+title+"» للصف. لم يُنشر أي فصل بعد — انشر الفصول عندما تكون جاهزًا."));
 }
 // Publish / hide ONE module. Hiding an already visible module is confirmed (it is not a deletion: the content stays
 // and can be published again). The next list is computed from the class's CURRENT normalized materials.
 async function toggleLearningModule(classroom:Classroom,courseId:string,moduleId:string,publish:boolean){
  if(actionBusy)return;
  const entry=classLearningMaterials(classroom).find(e=>e.courseId===courseId);
  const current=entry?entry.visibleModuleIds:[];
  const moduleTitle=learningModuleTitle(courseId,moduleId);
  if(!publish){
   if(!(await confirm({message:"سيختفي فصل \""+moduleTitle+"\" من طلاب الصف. لن يتم حذف المحتوى ويمكن نشره مرة أخرى.",confirmLabel:"إخفاء عن الطلاب"})))return;
  }
  // The next list is sent in the catalog's canonical content order (the server canonicalizes anyway; the request
  // simply never implies that the teacher controls order — only visibility).
  const wanted=new Set(publish?[...current,moduleId]:current.filter(id=>id!==moduleId));
  const order=learningCatalog?.find(c=>c.courseId===courseId)?.modules.map(m=>m.moduleId)||[];
  const next=[...order.filter(id=>wanted.has(id)),...[...wanted].filter(id=>!order.includes(id))];
  await setLearningCourseModules(classroom,courseId,next,publish?("✓ نُشر فصل «"+moduleTitle+"» لطلاب الصف."):("✓ أُخفي فصل «"+moduleTitle+"» عن طلاب الصف (المحتوى محفوظ)."));
 }
 // Detach the whole course from THIS class (its publication list goes with it). Never deletes book content.
 async function removeLearningCourse(classroom:Classroom,courseId:string){
  if(actionBusy)return;
  if(!(await confirm({message:"ستختفي المادة التعليمية من طلاب الصف. لن يتم حذف محتوى الكتاب، ويمكن إضافتها مرة أخرى لاحقًا.",confirmLabel:"إزالة من الصف"})))return;
  setActionBusy(true);setError("");setNotice("");
  try{
   const result=await teacherApi<{ok:true;classId:string;removed:boolean;learningMaterials:ClassLearningMaterial[]}>("/api/classrooms",{method:"POST",body:JSON.stringify({action:"removeLearningCourse",classId:classroom.classId,courseId})});
   commitLearningMaterials(classroom.classId,Array.isArray(result.learningMaterials)?result.learningMaterials:[]);
   setNotice("✓ أُزيلت «"+learningCourseTitle(courseId)+"» من الصف (محتوى الكتاب محفوظ).");
  }catch(e){setError(e instanceof Error?e.message:"تعذر إزالة المادة التعليمية من الصف.")}
  finally{setActionBusy(false)}
 }

 async function toggleClassArchive(classroom:Classroom){
  const archiving=normalizeClassStatus(classroom)==="active";
  const message=archiving
   ?"أرشفة الصف "+classroom.name+"؟\n\nسيُنقل إلى الأرشيف مع الاحتفاظ بجميع الطلاب والواجبات والنتائج. لن يتم حذف أي بيانات."
   :"استعادة الصف "+classroom.name+" من الأرشيف؟";
  if(actionBusy)return;
  if(!(await confirm({message,confirmLabel:archiving?"أرشفة":"استعادة"})))return;
  setActionBusy(true);setError("");setNotice("");
  try{
   await teacherApi("/api/classrooms",{method:"POST",body:JSON.stringify({action:archiving?"archive":"unarchive",classId:classroom.classId})});
   await loadClasses();
   setNotice(archiving?"✓ تمت أرشفة الصف.":"✓ تمت استعادة الصف.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تعديل الصف.")}
  finally{setActionBusy(false)}
 }

 async function graduateAndArchiveClass(classroom:Classroom){
  const message="سيتم نقل الصف إلى الأرشيف مع الاحتفاظ بجميع الطلاب والواجبات والنتائج. لن يتم حذف أي بيانات.";
  if(actionBusy)return;
  if(!(await confirm({message,title:"تخريج وأرشفة الصف",confirmLabel:"تخريج وأرشفة"})))return;
  setActionBusy(true);setError("");setNotice("");
  try{
   await teacherApi("/api/classrooms",{method:"POST",body:JSON.stringify({action:"graduateAndArchive",classId:classroom.classId})});
   await loadClasses();
   setNotice("✓ تم تخريج وأرشفة الصف.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تخريج الصف.")}
  finally{setActionBusy(false)}
 }

 async function createStudent(){
  if(!selectedClassId||!newFirstName.trim()||!newFamilyName.trim()||!validIdentity(newIdentityNumber)||actionBusy)return;
  setActionBusy(true);setError("");setNotice("");setCredentialBox(null);
  try{
   const sourceClassId=selectedClassId;
   const result=await teacherApi<{ok:true;student?:Student;temporaryPassword:string;rosterSynced?:boolean}>("/api/students",{method:"POST",body:JSON.stringify({
    action:"create",classId:sourceClassId,firstName:newFirstName.trim(),familyName:newFamilyName.trim(),identityNumber:newIdentityNumber,password:newStudentPassword
   })});
   setCredentialBox({name:result.student?.displayName||"",identityNumber:result.student?.identityNumber||newIdentityNumber,password:result.temporaryPassword});
   setNewFirstName("");setNewFamilyName("");setNewIdentityNumber("");setNewStudentPassword("");setDialog("none");
   // Roadmap #32: append the server-returned student locally (counters start at 0); the class count changed, so
   // the classes list is refreshed. Anything ambiguous takes the authoritative reload instead.
   if(needsAuthoritativeReload("create",result,sourceClassId)||!result.student)await reloadAuthoritative(sourceClassId);
   else{
    const created=result.student;
    if(stillSelected(sourceClassId))setStudents(prev=>appendStudentRow(prev,created));
    await loadClasses();
   }
   setNotice(withRosterNote(result,"✓ تم إنشاء حساب الطالب. سيستخدم رقم الهوية لتسجيل الدخول."));
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء الطالب.")}
  finally{setActionBusy(false)}
 }

 async function copyText(text:string,success:string){
  try{
   await navigator.clipboard.writeText(text);
   setNotice(success);
  }catch{
   setError("تعذر النسخ تلقائيًا. يمكنك تحديد النص ونسخه يدويًا.");
  }
 }

 function credentialText(name:string,identityNumber:string,password:string){
  return `الطالب: ${name}\nرقم الهوية / الدخول: ${identityNumber}\nكلمة المرور: ${password}`;
 }

 async function toggleStudent(student:Student){
  if(actionBusy||student.archived)return;
  setActionBusy(true);setError("");setNotice("");
  try{
   const sourceClassId=selectedClassId;
   // The explicit target state makes a retry / double click idempotent (the server never flips it back).
   const result=await teacherApi<{ok:true;active?:unknown}>("/api/students",{method:"POST",body:JSON.stringify({action:"toggleActive",userId:student.userId,active:!student.active})});
   // Roadmap #32: login eligibility never touches the class count index — patch `active` only, no reloads.
   if(needsAuthoritativeReload("toggleActive",result))await reloadAuthoritative(sourceClassId);
   else if(stillSelected(sourceClassId))setStudents(prev=>mergeStudentRow(prev,{userId:student.userId,active:result.active===true}));
   setNotice(student.active?"✓ تم تعطيل حساب الطالب.":"✓ تم تفعيل حساب الطالب.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تعديل الحساب.")}
  finally{setActionBusy(false);keepRosterFocus()}
 }

 async function archiveStudent(student:Student){
  const action=student.archived?"unarchive":"archive";
  const message=student.archived
   ?"استعادة الطالب "+student.displayName+" إلى الصف وتفعيل حسابه؟"
   :"أرشفة الطالب "+student.displayName+"؟\n\nسيُزال من عدد طلاب الصف الفعّالين ويُمنع من تسجيل الدخول، مع الاحتفاظ ببياناته ونتائجه.";
  if(actionBusy)return;
  if(!(await confirm({message,confirmLabel:student.archived?"استعادة":"أرشفة"})))return;
  setActionBusy(true);setError("");setNotice("");
  try{
   const sourceClassId=selectedClassId;
   const result=await teacherApi<{ok:true;archived?:unknown;rosterSynced?:boolean}>("/api/students",{method:"POST",body:JSON.stringify({action,userId:student.userId})});
   // Roadmap #32: archive ⇒ archived:true + active:false, unarchive ⇒ archived:false + active:true (server
   // invariants confirmed by the returned flag). Membership changed, so the classes list is refreshed.
   if(needsAuthoritativeReload(action,result))await reloadAuthoritative(sourceClassId);
   else{
    if(stillSelected(sourceClassId))setStudents(prev=>mergeStudentRow(prev,{userId:student.userId,archived:action==="archive",active:action!=="archive"}));
    await loadClasses();
   }
   setNotice(withRosterNote(result,student.archived?"✓ تمت استعادة الطالب.":"✓ تمت أرشفة الطالب مع الاحتفاظ ببياناته."));
  }catch(e){setError(e instanceof Error?e.message:"تعذر تغيير حالة الأرشفة.")}
  finally{setActionBusy(false);keepRosterFocus()}
 }

 async function deleteStudent(student:Student){
  const identity=student.identityNumber||student.code;
  const confirmed=await confirm({tone:"danger",title:"حذف نهائي",confirmLabel:"حذف نهائي",message:
   "⚠️ حذف نهائي\n\n"+
   "الطالب: "+student.displayName+"\n"+
   "رقم الهوية: "+identity+"\n\n"+
   "سيتم حذف حساب الطالب وبياناته الأساسية نهائيًا وإزالته من الصف. "+
   "استخدم الأرشفة بدل الحذف إذا أردت الاحتفاظ بالحساب.\n\nهل أنت متأكد؟"
  });
  if(actionBusy||!confirmed)return;
  setActionBusy(true);setError("");setNotice("");
  try{
   const sourceClassId=selectedClassId;
   const result=await teacherApi<{ok:true;deleted?:unknown;rosterSynced?:boolean}>("/api/students",{method:"POST",body:JSON.stringify({action:"delete",userId:student.userId})});
   if(profile?.student.userId===student.userId)setProfile(null);
   if(editingStudent?.userId===student.userId)setEditingStudent(null);
   // Roadmap #32: the row is removed ONLY after the server confirmed the delete; selection is pruned too.
   if(needsAuthoritativeReload("delete",result))await reloadAuthoritative(sourceClassId);
   else{
    if(stillSelected(sourceClassId)){setStudents(prev=>removeStudentRow(prev,student.userId));setSelectedIds(prev=>pruneSelectedIds(prev,student.userId));}
    await loadClasses();
   }
   setNotice(withRosterNote(result,"✓ تم حذف الطالب نهائيًا."));
  }catch(e){setError(e instanceof Error?e.message:"تعذر حذف الطالب.")}
  finally{setActionBusy(false);keepRosterFocus()}
 }

 function startEdit(student:Student){
  const fallback=splitName(student.displayName);
  setEditingStudent(student);
  setEditFirstName(student.firstName||fallback.firstName);
  setEditFamilyName(student.familyName||fallback.familyName);
  setEditIdentityNumber(student.identityNumber||(/^\d{9}$/.test(student.code)?student.code:""));
  setEditClassId(student.classId);
  setEditPassword("");
  setCredentialBox(null);setError("");setNotice("");
  setProfile(null);setDialog("none");
 }

 async function saveStudentEdit(){
  if(!editingStudent||!editFirstName.trim()||!editFamilyName.trim()||!validIdentity(editIdentityNumber)||!editClassId||actionBusy)return;
  setActionBusy(true);setError("");setNotice("");
  try{
   const sourceClassId=selectedClassId;
   const targetClassId=editClassId;
   const userId=editingStudent.userId;
   const result=await teacherApi<{ok:true;student?:Student;passwordChanged:boolean;rosterSynced?:boolean}>("/api/students",{method:"POST",body:JSON.stringify({
    action:"update",userId,firstName:editFirstName.trim(),familyName:editFamilyName.trim(),identityNumber:editIdentityNumber,classId:targetClassId,password:editPassword,
    ...(typeof editingStudent.profileRevision==="number"?{expectedProfileRevision:editingStudent.profileRevision}:{})   // QA-7
   })});
   const moved=targetClassId!==sourceClassId;
   setEditingStudent(null);setEditPassword("");
   // Roadmap #32: same-class edit → merge the server-returned document into the row (computed counters kept), no
   // reloads; move → drop the row from the source roster and refresh the classes list (two counts changed).
   if(needsAuthoritativeReload("update",result,targetClassId)||!result.student){
    if(moved)await reloadAuthoritativeMove(sourceClassId,targetClassId);
    else await reloadAuthoritative(sourceClassId);
   }else if(moved){
    if(stillSelected(sourceClassId)){setStudents(prev=>removeStudentRow(prev,userId));setSelectedIds(prev=>pruneSelectedIds(prev,userId));}
    // The teacher switched to the TARGET class while the move was in flight: its roster may have been loaded
    // before the move committed, so it is re-read authoritatively (never patched from this response).
    else if(stillSelected(targetClassId))await loadStudents(targetClassId);
    await loadClasses();
   }else{
    const updated=result.student;
    if(stillSelected(sourceClassId))setStudents(prev=>mergeStudentRow(prev,updated));
   }
   setNotice(withRosterNote(result,moved?"✓ تم تعديل الطالب ونقله إلى الصف المختار.":"✓ تم حفظ تعديلات الطالب."));
  }catch(e){
   // QA-7 — the student was edited elsewhere since this form opened: close it on the authoritative roster, so the teacher re-opens
   // the CURRENT data instead of writing the older values back.
   if(isStaleEdit(e,"STUDENT_STALE")){setEditingStudent(null);setEditPassword("");await reloadAuthoritative(selectedClassId)}
   setError(e instanceof Error?e.message:"تعذر حفظ تعديلات الطالب.")}
  finally{setActionBusy(false);keepRosterFocus()}
 }

 // Stage 1: parse + normalize the picked file LOCALLY (JSON or CSV) — no account is created here.
 // Stage 2: send the normalized rows for a server-authoritative PREVIEW (validation only). Selecting a
 // file NEVER creates students; creation happens only in importBulkStudents after explicit confirmation.
 async function readBulkFile(file:File|null){
  setBulkStudents([]);setBulkErrors([]);setImportPreview([]);setImportId("");setBulkFileName(file?.name||"");setError("");setNotice("");
  if(!file)return;
  try{
   const {students:normalized}=parseBulkStudents(await readImportFileText(file),file.name);
   if(!normalized.length)throw new Error("لم أجد بيانات طلاب في الملف.");
   setBulkStudents(normalized);
   setPreviewBusy(true);
   const result=await teacherApi<{ok:true;preview:ImportPreviewRow[];valid:number;duplicates:number;invalid:number}>("/api/students",{
    method:"POST",body:JSON.stringify({action:"previewImport",classId:selectedClassId,students:normalized})
   });
   setImportPreview(result.preview||[]);
   setImportId(newImportId());
   setNotice("✓ تمت معاينة الملف: "+result.valid+" صالح، "+result.duplicates+" مكرر، "+result.invalid+" غير صالح. لن يتم الحفظ قبل الضغط على زر الاستيراد.");
  }catch(e){
   setError(e instanceof Error?e.message:"الملف غير صالح.");
   setBulkFileName("");
  }finally{setPreviewBusy(false)}
 }

 async function importBulkStudents(){
  const validRows=importPreview.filter(x=>x.status==="valid");
  if(!selectedClassId||!validRows.length||actionBusy)return;
  if(!(await confirmReplaceCredentialBatch()))return;
  setActionBusy(true);setError("");setNotice("");setBulkErrors([]);
  const sourceClassId=selectedClassId;
  try{
   const payload=validRows.map(x=>({firstName:x.firstName,familyName:x.familyName,identityNumber:x.identityNumber}));
   const result=await teacherApi<{ok:true;imported:number;failed:number;recovered?:number;credentials:Credential[];errors:BulkError[];rosterSynced?:boolean}>("/api/students",{
    method:"POST",body:JSON.stringify({action:"bulkImport",classId:sourceClassId,students:payload,...(importId?{importId}:{})})
   });
   if((result.credentials||[]).length)showCredentialBatch(result.credentials||[]);
   setBulkErrors(result.errors||[]);
   // Sequential, like reloadAuthoritative: the roster read repairs the class count index BEFORE the classes read.
   await reloadAuthoritative(sourceClassId);
   const recovered=Number(result.recovered)||0;
   setNotice(withRosterNote(result,"✓ تم استيراد "+arabicCount(result.imported,STUDENTS_GENITIVE)+(result.failed?"، وتعذر استيراد "+result.failed+".":".")+(recovered?" "+recovered+" منها أُنشئت في محاولة سابقة لم يصل ردها، وأُعطيت كلمات مرور جديدة.":"")));
   setBulkStudents([]);setBulkFileName("");setImportPreview([]);setImportId("");setDialog("none");
  }catch(e){setError((e instanceof Error?e.message:"تعذر استيراد الطلاب.")+IMPORT_RETRY_NOTE)}
  finally{setActionBusy(false)}
 }

 // Open a new credential batch, capturing the class AT GENERATION TIME (never derived later). Warns
 // before replacing an existing, not-yet-closed batch so the teacher can download it first.
 async function confirmReplaceCredentialBatch():Promise<boolean>{
  if(credentialBatch&&credentialBatch.credentials.length){
   return confirm({message:"يوجد لديك قائمة كلمات مرور لم تُغلق بعد للصف «"+(credentialBatch.className||"")+"». إنشاء قائمة جديدة سيستبدلها.",confirmLabel:"استبدال القائمة"});
  }
  return true;
 }
 function showCredentialBatch(credentials:Credential[]){
  setCredentialBatch(openCredentialBatch(selectedClassId,selectedClass?.name||"",credentials));
 }
 // Explicit close: discards ONLY the temporary UI batch (no students/passwords/backend changes).
 async function discardCredentialBatch(){
  if(!(await confirm({message:"بعد إغلاق هذه القائمة لن تتمكن من عرض كلمات المرور الحالية كنص واضح مرة أخرى. هل تريد المتابعة؟",confirmLabel:"إغلاق القائمة"})))return;
  setCredentialBatch(null);
 }

 function downloadCredentials(){
  if(!credentialBatch||!credentialBatch.credentials.length)return;
  // Uses the batch's ORIGINAL class metadata + generation time — never the currently-selected class.
  const payload=buildCredentialsDownload(credentialBatch);
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=safeFileName(credentialBatch.className,"class")+"-student-credentials.json";a.click();
  URL.revokeObjectURL(url);
  setCredentialBatch(b=>b?markCredentialBatchSaved(b):b);
 }

 function downloadBlob(content:string,type:string,fileName:string){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=fileName;a.click();
  URL.revokeObjectURL(url);
 }
 function downloadCredentialsCsv(){
  if(!credentialBatch||!credentialBatch.credentials.length)return;
  downloadBlob(buildCredentialsCsv(credentialBatch),"text/csv;charset=utf-8",safeFileName(credentialBatch.className,"class")+"-student-credentials.csv");
  setCredentialBatch(b=>b?markCredentialBatchSaved(b):b);
 }
 function printCredentialCards(){
  if(!credentialBatch||!credentialBatch.credentials.length)return;
  printHtmlDocument(buildCredentialCardsHtml(credentialBatch,"ادخل إلى المنصة برقم الهوية وكلمة المرور أعلاه."));
  setCredentialBatch(b=>b?markCredentialBatchSaved(b):b);
 }
 function downloadImportTemplate(){downloadBlob(IMPORT_TEMPLATE_CSV,"text/csv;charset=utf-8","students-import-template.csv")}

 function exportCsv(){
  const rows=[
   ["الاسم","اسم العائلة","رقم الهوية","الصف","الحالة","آخر دخول"],
   ...visibleStudents.map(s=>[s.firstName,s.familyName,s.identityNumber||s.code,selectedClass?.name||"",statusLabel(s),s.lastLoginAt?fmtDate(s.lastLoginAt):"لم يسجل الدخول"])
  ];
  const csv="\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=safeFileName(selectedClass?.name||"","students")+"-students.csv";a.click();
  URL.revokeObjectURL(url);
 }

 // ONE profile loader for both entry points. Only the newest request may commit (profileSeq), and only while its class
 // is still selected — a slow response can never open a profile over another student or another class.
 async function loadProfile(userId:string,section:ProfileSection,failure:string){
  const seq=++profileSeq.current;
  const classAtStart=selectedClassRef.current;
  clearPasswordReveal();setProfileSection(section);setEditingStudent(null);setDialog("none");
  setProfileBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;profile:StudentProfile}>("/api/students?profileUserId="+encodeURIComponent(userId));
   if(seq!==profileSeq.current||selectedClassRef.current!==classAtStart)return;
   setProfile(result.profile);
  }catch(e){if(seq===profileSeq.current)setError(e instanceof Error?e.message:failure)}
  finally{if(seq===profileSeq.current)setProfileBusy(false)}
 }
 function openProfile(student:Student){return loadProfile(student.userId,"summary","تعذر تحميل تفاصيل الطالب.")}
 function closeProfile(){profileSeq.current++;setProfileBusy(false);clearPasswordReveal();setProfile(null);setHistoryDeadlineFor(null);setError("")}

 async function resetProfilePassword(){
  if(!profile||actionBusy)return;
  if(!(await confirm({message:"سيتم إنشاء كلمة مرور جديدة للطالب، ولن تعمل كلمة المرور القديمة. هل تريد المتابعة؟",confirmLabel:"إنشاء كلمة مرور"})))return;
  setActionBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;temporaryPassword:string}>("/api/students",{method:"POST",body:JSON.stringify({action:"resetPassword",userId:profile.student.userId})});
   startPasswordReveal(result.temporaryPassword);
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء كلمة مرور جديدة.")}
  finally{setActionBusy(false)}
 }

 function openHistory(userId:string){return loadProfile(userId,"history","تعذر تحميل سجل الواجبات.")}

 async function historyAllowRetry(item:SubmittedAssignment){
  if(!profile||actionBusy)return;
  setActionBusy(true);setError("");
  try{
   const studentId=profile.student.userId;
   const result=await teacherApi<{ok:true;allowedAttempts:number}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"allowRetry",assignmentId:item.assignmentId,studentId})});
   setProfile(h=>h&&h.student.userId===studentId?{...h,submittedAssignments:h.submittedAssignments.map(x=>x.assignmentId===item.assignmentId?{...x,allowedAttempts:result.allowedAttempts}:x)}:h);
   setNotice("✓ تم السماح بمحاولة إضافية.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر السماح بالمحاولة.")}
  finally{setActionBusy(false)}
 }

 function openHistoryDeadline(item:SubmittedAssignment){
  setError("");setHistoryDeadlineFor(item.assignmentId);setHistoryDeadlineValue(item.dueAtOverride?toLocalInput(item.dueAtOverride):"");
 }

 async function saveHistoryDeadline(item:SubmittedAssignment){
  if(!profile||!historyDeadlineValue||actionBusy)return;
  setActionBusy(true);setError("");
  try{
   const studentId=profile.student.userId;
   const result=await teacherApi<{ok:true;dueAtOverride:string|null}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"setDueAtOverride",assignmentId:item.assignmentId,studentId,dueAtOverride:new Date(historyDeadlineValue).toISOString()})});
   setProfile(h=>h&&h.student.userId===studentId?{...h,submittedAssignments:h.submittedAssignments.map(x=>x.assignmentId===item.assignmentId?{...x,dueAtOverride:result.dueAtOverride,effectiveDueAt:result.dueAtOverride||x.dueAt}:x)}:h);
   setHistoryDeadlineFor(null);
   setNotice("✓ تم تمديد الموعد.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ التمديد.")}
  finally{setActionBusy(false)}
 }

 async function clearHistoryDeadline(item:SubmittedAssignment){
  if(!profile||actionBusy)return;
  setActionBusy(true);setError("");
  try{
   const studentId=profile.student.userId;
   const result=await teacherApi<{ok:true;dueAtOverride:string|null}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"setDueAtOverride",assignmentId:item.assignmentId,studentId,dueAtOverride:null})});
   setProfile(h=>h&&h.student.userId===studentId?{...h,submittedAssignments:h.submittedAssignments.map(x=>x.assignmentId===item.assignmentId?{...x,dueAtOverride:result.dueAtOverride,effectiveDueAt:x.dueAt}:x)}:h);
   setHistoryDeadlineFor(null);
   setNotice("✓ تم إلغاء التمديد.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر إلغاء التمديد.")}
  finally{setActionBusy(false)}
 }

 function toggleSelected(id:string){
  setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
 }

 function toggleSelectVisible(){
  const visibleIds=visibleStudents.map(s=>s.userId);
  const allSelected=visibleIds.length>0&&visibleIds.every(id=>selectedIds.includes(id));
  if(allSelected)setSelectedIds(prev=>prev.filter(id=>!visibleIds.includes(id)));
  else setSelectedIds(prev=>Array.from(new Set([...prev,...visibleIds])));
 }

 async function runBulkAction(operation:"activate"|"deactivate"|"archive"|"unarchive"|"move"|"resetpasswords"|"delete"){
  const userIds=visibleSelectedIds;
  if(!userIds.length||actionBusy)return;

  const count=userIds.length;
  if(operation==="move"&&!bulkTargetClassId){setError("اختر الصف الهدف أولًا.");return}

  // The destructive confirmation names who is affected (up to ten names, then a count).
  const names=students.filter(s=>userIds.includes(s.userId)).map(s=>s.displayName);
  const nameList=names.length?"\n\n"+names.slice(0,10).join("، ")+(names.length>10?" و"+(names.length-10)+" آخرين":""):"";
  let question="";
  if(operation==="delete")question="⚠️ حذف نهائي لـ "+count+" طالب؟"+nameList+"\n\nالأرشفة أكثر أمانًا إذا كنت تريد الاحتفاظ بالبيانات.";
  else if(operation==="archive")question="أرشفة "+arabicCount(count,STUDENTS_GENITIVE)+" مع منع تسجيل الدخول والاحتفاظ بالبيانات؟";
  else if(operation==="unarchive")question="استعادة "+arabicCount(count,STUDENTS_GENITIVE)+" من الأرشيف وتفعيل حساباتهم؟";
  else if(operation==="resetpasswords")question="إنشاء كلمات مرور جديدة لـ "+arabicCount(count,STUDENTS_GENITIVE)+"؟ ستظهر الكلمات الجديدة مرة واحدة بعد العملية.";
  else if(operation==="move")question="نقل "+arabicCount(count,STUDENTS_GENITIVE)+" إلى الصف المختار؟";
  // Phase S.3 — a bulk delete cannot be undone and reaches many accounts at once: the teacher TYPES the number of students
  // before «حذف نهائي» unlocks (the message itself is unchanged).
  const typeToConfirm=operation==="delete"?{label:"للتأكيد، اكتب عدد الطلاب الذين سيُحذفون ("+count+"):",expected:String(count)}:undefined;
  if(question&&!(await confirm({message:question,tone:operation==="delete"?"danger":"default",confirmLabel:operation==="delete"?"حذف نهائي":"تأكيد",typeToConfirm})))return;
  if(operation==="resetpasswords"&&!(await confirmReplaceCredentialBatch()))return;

  setActionBusy(true);setError("");setNotice("");setBulkErrors([]);
  const sourceClassId=selectedClassId;
  try{
   const result=await teacherApi<{ok:true;processed:number;failed:number;credentials:Credential[];errors:BulkError[];rosterSynced?:boolean}>("/api/students",{
    method:"POST",
    body:JSON.stringify({action:"bulkAction",operation,userIds,targetClassId:bulkTargetClassId})
   });
   if(result.credentials?.length)showCredentialBatch(result.credentials);
   if(result.errors?.length)setBulkErrors(result.errors.map(x=>({...x,displayName:x.displayName||students.find(s=>s.userId===x.userId)?.displayName||x.userId})));
   // Sequential reconcile (roster reads repair the count indexes BEFORE the classes read); a move repairs BOTH classes.
   if(operation==="move")await reloadAuthoritativeMove(sourceClassId,bulkTargetClassId);
   else await reloadAuthoritative(sourceClassId);
   setSelectedIds([]);
   setNotice(withRosterNote(result,"✓ نُفذت العملية على "+arabicCount(result.processed,STUDENTS_GENITIVE)+(result.failed?"، وفشلت لدى "+result.failed+".":".")));
  }catch(e){setError(e instanceof Error?e.message:"تعذر تنفيذ العملية الجماعية.")}
  finally{setActionBusy(false);keepRosterFocus()}
 }

 // U.2 — switching between the active classes and the archive selects the view's first class when the selected one is not
 // in it (the roster never shows a class the bar does not list); an empty view keeps the current selection.
 function switchClassView(view:ClassArchiveView){
  setClassArchiveView(view);
  const list=view==="active"?activeClasses:archivedClasses;
  if(list.length&&!list.some(c=>c.classId===selectedClassId))setSelectedClassId(list[0].classId);
 }
 function toggleSort(key:SortKey){if(sortKey===key)setSortAsc(x=>!x);else{setSortKey(key);setSortAsc(true)}}
 function openImportDialog(){setBulkStudents([]);setBulkErrors([]);setImportPreview([]);setImportId("");setBulkFileName("");setError("");setDialog("import")}

 // The Suspense boundary wraps ONLY the dashboard body: the teacher shell, sidebar and this workspace wrapper stay mounted
 // while the chunk loads, and the fallback is a local status line inside the same inner container (never a blank page).
 // Phase 9A — the Today Hub (command center) is the FIRST thing on the teacher's home, above the analytics dashboard; it is
 // part of this chunk (one small read of its own), so the lazy Dashboard boundary below is unchanged.
 // Phase 21H.2 — ONE scope for the whole page: the dashboard owns the scope bar (class, period, refresh) and places the hub
 // right under it with that class and that refresh (mounted once, in every dashboard state, so it reads its summary once).
 if(workspaceTab==="dashboard"){
  const hub=(scope:TodayScope)=><TeacherTodayHub token={token} onNavigate={props.onNavigate} onOpenProject={props.onOpenProject} onOpenProjectStudent={props.onOpenProjectStudent} onStartEvaluationQueue={props.onStartEvaluationQueue} onOpenAssignmentTarget={props.onOpenAssignmentTarget} classId={scope.classId} refreshSignal={scope.refreshSignal} embedded/>;
  return <section className="teacher-platform" dir="rtl"><div className="teacher-platform-inner"><TodaySlot.Provider value={hub}><Suspense fallback={<p className="eb-muted" role="status">جارٍ تحميل لوحة المتابعة...</p>}><TeacherDashboard token={token}/></Suspense></TodaySlot.Provider></div></section>;
 }
 if(workspaceTab==="audit")return <AuditHistoryPanel token={token}/>;
 if(workspaceTab==="assignments")return <section className="teacher-platform" dir="rtl"><div className="teacher-platform-inner"><AssignmentsPanel token={token} classes={classes} currentExam={currentExam} onCopyLibraryExamToBuilder={onCopyLibraryExamToBuilder} drill={props.assignmentDrill??null} onDrillConsumed={props.onAssignmentDrillConsumed}/></div></section>;

 const classActive=selectedClass?isActiveClass(selectedClass):false;
 const canCreateStudent=Boolean(newFirstName.trim()&&newFamilyName.trim()&&validIdentity(newIdentityNumber));
 const canSaveEdit=Boolean(editFirstName.trim()&&editFamilyName.trim()&&validIdentity(editIdentityNumber)&&editClassId);
 const visibleBatch=credentialBatch&&credentialBatchVisible(credentialBatch,selectedClassId)?credentialBatch:null;
 const canSaveClassEdit=Boolean(editClass&&editClass.name.trim()&&(editClass.name.trim()!==editClass.original.name||editClass.grade.trim()!==editClass.original.grade||editClass.schoolYear.trim()!==editClass.original.schoolYear));
 // While one of this workspace's dialogs is open, its error is rendered INSIDE that dialog (the page banner would sit
 // under the modal backdrop); closing the dialog clears it so a stale rejection never reappears on the page.
 const dialogWithError=dialog!=="none"||editingStudent!==null||profile!==null;
 const closeDialog=()=>{setDialog("none");setEditClass(null);setError("")};
 const dialogError=dialogWithError?error:"";

 return <section className="teacher-platform eb-students-workspace" dir="rtl"><div className="teacher-platform-inner">
  {error&&!dialogWithError&&<div className="platform-error" role="alert">{error}</div>}
  {notice&&<div className="platform-notice eb-dismissible" role="status" aria-live="polite"><span>{notice}</span><button type="button" className="eb-link-button eb-notice-close" onClick={()=>setNotice("")} aria-label="إخفاء الرسالة">إخفاء</button></div>}
  {profileBusy&&<div className="platform-loading" role="status">جارٍ تحميل ملف الطالب...</div>}

  <div className="eb-students-layout">
   <ClassesPane
    classes={visibleClasses} view={classArchiveView} onViewChange={switchClassView}
    activeCount={activeClasses.length} archivedCount={archivedClasses.length}
    selectedClassId={selectedClassId} onSelect={setSelectedClassId}
    projects={projects} projectTitle={projectTitle} isGraduationEligible={isGraduationEligible}
    onToggleProject={(classroom,code,enable)=>void toggleClassProject(classroom,code,enable)}
    onToggleArchive={classroom=>void toggleClassArchive(classroom)} onGraduate={classroom=>void graduateAndArchiveClass(classroom)}
    onCreate={()=>{setError("");setDialog("createClass")}} onEdit={openEditClass} onRefresh={()=>void reloadAuthoritative(selectedClassId)}
    loading={classesLoad.busy} loadError={classesLoad.status==="error"&&!classesLoad.busy?classesLoad.error:""} onRetry={()=>void loadClasses(false)}
    busy={actionBusy} fmtDate={fmtDay}/>

   <RosterPane
    classroom={selectedClass} classActive={classActive} students={rosterStudents} visibleStudents={visibleStudents} stats={stats}
    loading={selectedClass?!rosterReady&&!rosterError:classesLoad.status==="loading"} refreshing={rosterLoad.busy}
    loadError={selectedClass?rosterError:""} onRetry={()=>void loadStudents(selectedClassId)}
    busy={actionBusy}
    searchText={searchText} onSearch={setSearchText} statusFilter={statusFilter} onStatusFilter={setStatusFilter}
    sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort}
    selectedIds={visibleSelectedIds} onToggleSelected={toggleSelected} onToggleSelectVisible={toggleSelectVisible} onClearSelection={()=>setSelectedIds([])}
    onAddStudent={()=>{setError("");setDialog("addStudent")}} onImport={openImportDialog} onRefresh={()=>void reloadAuthoritative(selectedClassId)} onExportCsv={exportCsv}
    onOpenProfile={student=>void openProfile(student)} onOpenHistory={student=>void openHistory(student.userId)} onEdit={startEdit}
    onCopyIdentity={student=>void copyText(student.identityNumber||student.code,"✓ تم نسخ رقم الهوية.")}
    onToggleActive={student=>void toggleStudent(student)} onArchive={student=>void archiveStudent(student)} onDelete={student=>void deleteStudent(student)}
    bulk={{targetClasses:classes.filter(c=>isActiveClass(c)&&c.classId!==selectedClassId),targetClassId:bulkTargetClassId,onTargetChange:setBulkTargetClassId,onAction:operation=>void runBulkAction(operation)}}
    credentialBox={credentialBox}
    onCopyCredentialBox={()=>{if(credentialBox)void copyText(credentialText(credentialBox.name,credentialBox.identityNumber,credentialBox.password),"✓ تم نسخ بيانات الدخول.")}}
    onHideCredentialBox={()=>setCredentialBox(null)}
    credentialBatch={visibleBatch}
    onToggleBatch={()=>setCredentialBatch(b=>b?toggleCredentialBatchCollapsed(b):b)} onDownloadBatch={downloadCredentials} onDiscardBatch={()=>void discardCredentialBatch()}
    onDownloadBatchCsv={downloadCredentialsCsv} onPrintBatch={printCredentialCards}
    onCopyCredential={c=>void copyText(credentialText(((c.firstName||"")+" "+(c.familyName||"")).trim(),c.identityNumber||c.code,c.password),"✓ تم نسخ بيانات دخول الطالب.")}
    bulkErrors={bulkErrors} statusLabel={statusLabel} fmtDate={fmtDate} splitName={splitName} token={token}/>
  </div>

  <ClassLearningMaterialsPanel
   classroom={selectedClass} classActive={classActive}
   catalog={learningCatalog} catalogError={learningCatalogError} busy={actionBusy}
   onRetryCatalog={()=>void loadLearningCatalog()}
   onAddCourse={(classroom,courseId,moduleIds)=>void addLearningCourse(classroom,courseId,moduleIds)}
   onToggleModule={(classroom,courseId,moduleId,publish)=>void toggleLearningModule(classroom,courseId,moduleId,publish)}
   onRemoveCourse={(classroom,courseId)=>void removeLearningCourse(classroom,courseId)}/>

  <CreateClassDialog open={dialog==="createClass"} onClose={closeDialog} name={newClassName} grade={newClassGrade} schoolYear={newSchoolYear}
   onName={setNewClassName} onGrade={setNewClassGrade} onSchoolYear={setNewSchoolYear} onSubmit={()=>void createClass()} busy={actionBusy} error={dialog==="createClass"?dialogError:""}/>
  <EditClassDialog open={dialog==="editClass"&&editClass!==null} onClose={closeDialog} name={editClass?.name||""} grade={editClass?.grade||""} schoolYear={editClass?.schoolYear||""}
   onName={v=>setEditClass(c=>c?{...c,name:v}:c)} onGrade={v=>setEditClass(c=>c?{...c,grade:v}:c)} onSchoolYear={v=>setEditClass(c=>c?{...c,schoolYear:v}:c)}
   onSubmit={()=>void saveClassEdit()} busy={actionBusy} canSubmit={canSaveClassEdit} error={dialog==="editClass"?dialogError:""}/>
  <AddStudentDialog open={dialog==="addStudent"} onClose={closeDialog} classroom={selectedClass} classActive={classActive} error={dialog==="addStudent"?dialogError:""}
   firstName={newFirstName} familyName={newFamilyName} identityNumber={newIdentityNumber} password={newStudentPassword}
   onFirstName={setNewFirstName} onFamilyName={setNewFamilyName} onIdentityNumber={v=>setNewIdentityNumber(onlyDigits(v))} onPassword={setNewStudentPassword}
   canSubmit={canCreateStudent} onSubmit={()=>void createStudent()} busy={actionBusy}/>
  <ImportStudentsDialog open={dialog==="import"} onClose={closeDialog} classroom={selectedClass} classActive={classActive}
   fileName={bulkFileName} previewBusy={previewBusy} preview={importPreview} onFile={file=>void readBulkFile(file)} onImport={()=>void importBulkStudents()} busy={actionBusy}
   error={dialog==="import"?dialogError:""} onDownloadTemplate={downloadImportTemplate}/>
  <EditStudentDialog open={editingStudent!==null} onClose={()=>{setEditingStudent(null);setError("")}} error={editingStudent!==null?dialogError:""}
   classes={classes.filter(c=>isActiveClass(c)||c.classId===(editingStudent?.classId||""))}
   firstName={editFirstName} familyName={editFamilyName} identityNumber={editIdentityNumber} classId={editClassId} password={editPassword}
   onFirstName={setEditFirstName} onFamilyName={setEditFamilyName} onIdentityNumber={v=>setEditIdentityNumber(onlyDigits(v))} onClassId={setEditClassId} onPassword={setEditPassword}
   canSubmit={canSaveEdit} onSubmit={()=>void saveStudentEdit()} busy={actionBusy}
   photo={editingStudent?{token,student:editingStudent,onChange:meta=>{const userId=editingStudent.userId;setEditingStudent(prev=>prev&&prev.userId===userId?{...prev,profilePhoto:meta}:prev);setStudents(prev=>mergeStudentRow(prev,{userId,profilePhoto:meta}));}}:undefined}/>

  {profile&&<StudentDialog profile={profile} section={profileSection} onClose={closeProfile} error={editingStudent===null&&dialog==="none"?dialogError:""}
   busy={actionBusy} suspended={reviewTarget!==null}
   passwordReveal={passwordReveal} onResetPassword={()=>void resetProfilePassword()} onCopyPassword={password=>void copyText(password,"✓ تم نسخ كلمة المرور.")}
   onReview={item=>setReviewTarget({assignmentId:item.assignmentId,studentId:profile.student.userId,attemptNumber:item.latestAttemptNumber})}
   onAllowRetry={item=>void historyAllowRetry(item)}
   deadlineFor={historyDeadlineFor} deadlineValue={historyDeadlineValue} onDeadlineValue={setHistoryDeadlineValue}
   onOpenDeadline={openHistoryDeadline} onCloseDeadline={()=>setHistoryDeadlineFor(null)} onSaveDeadline={item=>void saveHistoryDeadline(item)} onClearDeadline={item=>void clearHistoryDeadline(item)}
   fmtDate={fmtDate}/>}
  {reviewTarget&&<AssignmentReview token={token} assignmentId={reviewTarget.assignmentId} studentId={reviewTarget.studentId} initialAttempt={reviewTarget.attemptNumber} onClose={()=>setReviewTarget(null)} onSaved={()=>{if(profile)void openHistory(profile.student.userId)}}/>}
  {confirmDialog}
 </div></section>;
}

export default TeacherPlatform;
