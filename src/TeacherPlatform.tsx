import {useEffect,useMemo,useRef,useState} from "react";
import AssignmentsPanel from "./AssignmentsPanel";
import AssignmentReview from "./AssignmentReview";
import TeacherDashboard from "./TeacherDashboard";
import AuditHistoryPanel from "./AuditHistoryPanel";
import {parseBulkStudents} from "./bulkStudentsParse";
import {normalizeClassStatus} from "./classLifecycle";
import {getClassProgramCodes} from "./projects/classPrograms";
import {useConfirm} from "./ui/useConfirm";
import ClassesPane from "./students/ClassesPane";
import RosterPane from "./students/RosterPane";
import StudentDialog from "./students/StudentDialog";
import {CreateClassDialog,AddStudentDialog,ImportStudentsDialog,EditStudentDialog} from "./students/StudentForms";
import type {ClassArchiveView,Classroom,ProjectOption,Student,Credential,BulkStudent,BulkError,ImportPreviewRow,SubmittedAssignment,StudentProfile,SortKey,StatusFilter,ProfileSection} from "./students/types";
import {type CredentialBatch,openCredentialBatch,toggleCredentialBatchCollapsed,credentialBatchVisible,buildCredentialsDownload} from "./credentialBatch";
import {appendStudentRow,mergeStudentRow,removeStudentRow,pruneSelectedIds,needsAuthoritativeReload} from "./rosterPatch";

type WorkspaceTab="dashboard"|"students"|"assignments"|"audit";
// onCopyLibraryExamToBuilder: forwarded straight to AssignmentsPanel; the snapshot is typed loosely
// here (App owns the real ExamDraft type) to avoid a value/type import coupling to App.tsx.
type TeacherPlatformProps={token:string;currentExam:unknown|null;workspaceTab:WorkspaceTab;onCopyLibraryExamToBuilder?:(examSnapshot:any,title:string)=>void};
type ApiError={ok?:boolean;error?:string};
type WorkspaceDialog="none"|"createClass"|"addStudent"|"import";

const onlyDigits=(value:string)=>value.replace(/\D/g,"").slice(0,9);
const validIdentity=(value:string)=>/^\d{9}$/.test(value);
const fmtDate=(value:string)=>value?new Date(value).toLocaleString("ar"):"—";
const toLocalInput=(iso:string)=>{if(!iso)return "";const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
function splitName(value:unknown){
 const parts=String(value??"").trim().split(/\s+/).filter(Boolean);
 return {firstName:parts.shift()||"",familyName:parts.join(" ")};
}
// Roadmap #34: the ONE class-lifecycle predicate for this screen — a class is active only through the canonical helper
// (status "archived" OR active:false ⇒ archived). Never the raw `active` flag, which is a compatibility field of
// /api/classrooms. Unrelated to Student.active (login eligibility).
const isActiveClass=(c:Classroom)=>normalizeClassStatus(c)==="active";
function statusLabel(student:Student){
 if(student.archived)return "مؤرشف";
 return student.active?"فعّال":"معطّل";
}
// Roadmap #25: a membership change may finish with the class COUNT index sync deferred (rosterSynced:false).
// The operation itself succeeded; the count self-heals on the next roster load — tell the teacher, non-fatally.
const ROSTER_SYNC_NOTE=" تم تنفيذ العملية، وسيتم تحديث عداد الصف تلقائيًا.";
function withRosterNote(result:{rosterSynced?:boolean}|null|undefined,message:string):string{
 return result&&result.rosterSynced===false?message+ROSTER_SYNC_NOTE:message;
}
function csvCell(value:unknown){
 const text=String(value??"");
 return `"${text.replace(/"/g,'""')}"`;
}

function TeacherPlatform({token,currentExam,workspaceTab,onCopyLibraryExamToBuilder}:TeacherPlatformProps){
 const [classes,setClasses]=useState<Classroom[]>([]);
 const [projects,setPrograms]=useState<ProjectOption[]>([]);
 const [classArchiveView,setClassArchiveView]=useState<ClassArchiveView>("active");
 const [students,setStudents]=useState<Student[]>([]);
 const [selectedClassId,setSelectedClassId]=useState("");
 // Roadmap #32: the class that is CURRENTLY selected, readable after an await. A response that belongs to a
 // class the teacher has since left is never committed into the visible roster (see loadStudents and the
 // single-row actions below).
 const selectedClassRef=useRef("");
 const [loading,setLoading]=useState(false);
 const [actionBusy,setActionBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");

 const [newClassName,setNewClassName]=useState("");
 const [newClassGrade,setNewClassGrade]=useState("");
 const [newSchoolYear,setNewSchoolYear]=useState(String(new Date().getFullYear())+"-"+String(new Date().getFullYear()+1));

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
 function isGraduationEligible(classroom:Classroom){
  const grade=classroom.grade||"";
  return grade.includes("12")||grade.includes("الثاني عشر");
 }

 const stats=useMemo(()=>{
  const current=students.filter(s=>!s.archived);
  return {
   total:students.length,
   active:current.filter(s=>s.active).length,
   disabled:current.filter(s=>!s.active).length,
   archived:students.filter(s=>s.archived).length,
   neverLogged:students.filter(s=>!s.archived&&!s.lastLoginAt).length
  };
 },[students]);

 const visibleStudents=useMemo(()=>{
  const q=searchText.trim().toLocaleLowerCase("ar");
  const filtered=students.filter(student=>{
   if(statusFilter==="active"&&(student.archived||!student.active))return false;
   if(statusFilter==="disabled"&&(student.archived||student.active))return false;
   if(statusFilter==="archived"&&!student.archived)return false;
   if(!q)return true;
   const hay=[student.firstName,student.familyName,student.displayName,student.identityNumber,student.code].join(" ").toLocaleLowerCase("ar");
   return hay.includes(q);
  });

  const factor=sortAsc?1:-1;
  return [...filtered].sort((a,b)=>{
   let av="",bv="";
   if(sortKey==="status"){av=statusLabel(a);bv=statusLabel(b)}
   else {av=String(a[sortKey]||"");bv=String(b[sortKey]||"")}
   return av.localeCompare(bv,"ar",{numeric:true})*factor;
  });
 },[students,searchText,statusFilter,sortKey,sortAsc]);

 async function teacherApi<T>(url:string,options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers||{});
  headers.set("Content-Type","application/json");
  headers.set("x-builder-token",token);
  headers.set("Authorization","Bearer "+token);
  const response=await fetch(url,{...options,headers});
  const result=await response.json() as T&ApiError;
  if(!response.ok)throw new Error(result.error||"حدث خطأ.");
  return result;
 }

 async function loadClasses(preserveSelection=true){
  setLoading(true);setError("");
  try{
   const result=await teacherApi<{ok:true;classes:Classroom[]}>("/api/classrooms");
   const loaded=result.classes||[];
   setClasses(loaded);
   if(!preserveSelection||!selectedClassId||!loaded.some(c=>c.classId===selectedClassId)){
    const first=loaded.find(isActiveClass)||loaded[0];
    setSelectedClassId(first?.classId||"");
   }
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل الصفوف.")}
  finally{setLoading(false)}
 }

 // Authoritative roster read. GET /api/students is ALSO the server-side roster-index self-heal path, so it is
 // always issued when asked for (even for a class that is no longer selected — the reconcile still runs); its
 // result is committed to the visible roster ONLY while `classId` is still the selected class (Roadmap #32).
 async function loadStudents(classId:string){
  if(!classId){setStudents([]);return}
  setLoading(true);setError("");
  try{
   const result=await teacherApi<{ok:true;students:Student[]}>("/api/students?classId="+encodeURIComponent(classId)+"&includeArchived=1");
   if(selectedClassRef.current!==classId)return;
   setStudents(result.students||[]);
   setSelectedIds(prev=>prev.filter(id=>(result.students||[]).some(s=>s.userId===id)));
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل الطلاب.")}
  finally{setLoading(false)}
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
 // Registry-driven list of projects for the per-class project selector (no hard-coded codes).
 useEffect(()=>{teacherApi<{projects?:ProjectOption[]}>("/api/project-tracker?resource=projects").then(r=>setPrograms(r.projects||[])).catch(()=>setPrograms([]));},[]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{
  selectedClassRef.current=selectedClassId;
  setSelectedIds([]);setProfile(null);setEditingStudent(null);setReviewTarget(null);setHistoryDeadlineFor(null);setDialog("none");cancelPending();clearPasswordReveal();
  // Single-student credential box + bulk errors are cleared so a plaintext password / error never shows
  // under a different class. The bulk credentialBatch is NOT cleared here — it stays in memory and is
  // simply HIDDEN unless its owning class is selected again (avoids accidental loss on a stray click).
  setCredentialBox(null);setBulkErrors([]);
  if(selectedClassId)void loadStudents(selectedClassId);else setStudents([]);
 },[selectedClassId]);
 useEffect(()=>()=>{if(passwordRevealTimer.current)window.clearInterval(passwordRevealTimer.current)},[]);

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

 async function createClass(){
  if(!newClassName.trim()||actionBusy)return;
  setActionBusy(true);setError("");setNotice("");
  try{
   const result=await teacherApi<{ok:true;classroom:Classroom}>("/api/classrooms",{method:"POST",body:JSON.stringify({action:"create",name:newClassName.trim(),grade:newClassGrade.trim(),schoolYear:newSchoolYear.trim()})});
   setNewClassName("");setNewClassGrade("");setDialog("none");
   await loadClasses(false);
   setSelectedClassId(result.classroom.classId);
   setNotice("✓ تم إنشاء الصف.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء الصف.")}
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
   await teacherApi("/api/classrooms",{method:"POST",body:JSON.stringify({action:"setPrograms",classId:classroom.classId,programCodes:next})});
   await loadClasses();
   setNotice(enable?("✓ تمت إضافة "+projectTitle(code)+" للصف. افتحه من قسم المشاريع."):("✓ تمت إزالة "+projectTitle(code)+" من الصف (البيانات محفوظة)."));
  }catch(e){setError(e instanceof Error?e.message:"تعذر تعديل مشاريع الصف.")}
  finally{setActionBusy(false)}
 }

 async function toggleClassArchive(classroom:Classroom){
  const archiving=normalizeClassStatus(classroom)==="active";
  const message=archiving
   ?"أرشفة الصف "+classroom.name+"؟\n\nسيُنقل إلى الأرشيف مع الاحتفاظ بجميع الطلاب والواجبات والنتائج. لن يتم حذف أي بيانات."
   :"إعادة تفعيل الصف "+classroom.name+"؟";
  if(actionBusy)return;
  if(!(await confirm({message,confirmLabel:archiving?"أرشفة":"تفعيل"})))return;
  setActionBusy(true);setError("");setNotice("");
  try{
   await teacherApi("/api/classrooms",{method:"POST",body:JSON.stringify({action:archiving?"archive":"unarchive",classId:classroom.classId})});
   await loadClasses();
   setNotice(archiving?"✓ تم أرشفة الصف.":"✓ تم تفعيل الصف.");
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
   const result=await teacherApi<{ok:true;active?:unknown}>("/api/students",{method:"POST",body:JSON.stringify({action:"toggleActive",userId:student.userId})});
   // Roadmap #32: login eligibility never touches the class count index — patch `active` only, no reloads.
   if(needsAuthoritativeReload("toggleActive",result))await reloadAuthoritative(sourceClassId);
   else if(stillSelected(sourceClassId))setStudents(prev=>mergeStudentRow(prev,{userId:student.userId,active:result.active===true}));
   setNotice(student.active?"✓ تم تعطيل حساب الطالب.":"✓ تم تفعيل حساب الطالب.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تعديل الحساب.")}
  finally{setActionBusy(false)}
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
  finally{setActionBusy(false)}
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
  finally{setActionBusy(false)}
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
    action:"update",userId,firstName:editFirstName.trim(),familyName:editFamilyName.trim(),identityNumber:editIdentityNumber,classId:targetClassId,password:editPassword
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
  }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ تعديلات الطالب.")}
  finally{setActionBusy(false)}
 }

 // Stage 1: parse + normalize the picked file LOCALLY (JSON or CSV) — no account is created here.
 // Stage 2: send the normalized rows for a server-authoritative PREVIEW (validation only). Selecting a
 // file NEVER creates students; creation happens only in importBulkStudents after explicit confirmation.
 async function readBulkFile(file:File|null){
  setBulkStudents([]);setBulkErrors([]);setImportPreview([]);setBulkFileName(file?.name||"");setError("");setNotice("");
  if(!file)return;
  try{
   const {students:normalized}=parseBulkStudents(await file.text(),file.name);
   if(!normalized.length)throw new Error("لم أجد بيانات طلاب في الملف.");
   setBulkStudents(normalized);
   setPreviewBusy(true);
   const result=await teacherApi<{ok:true;preview:ImportPreviewRow[];valid:number;duplicates:number;invalid:number}>("/api/students",{
    method:"POST",body:JSON.stringify({action:"previewImport",classId:selectedClassId,students:normalized})
   });
   setImportPreview(result.preview||[]);
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
  try{
   const payload=validRows.map(x=>({firstName:x.firstName,familyName:x.familyName,identityNumber:x.identityNumber}));
   const result=await teacherApi<{ok:true;imported:number;failed:number;credentials:Credential[];errors:BulkError[];rosterSynced?:boolean}>("/api/students",{
    method:"POST",body:JSON.stringify({action:"bulkImport",classId:selectedClassId,students:payload})
   });
   if((result.credentials||[]).length)showCredentialBatch(result.credentials||[]);
   setBulkErrors(result.errors||[]);
   await Promise.all([loadStudents(selectedClassId),loadClasses()]);
   setNotice(withRosterNote(result,"✓ تم استيراد "+result.imported+" طالبًا"+(result.failed?"، وتعذر استيراد "+result.failed+".":".")));
   setBulkStudents([]);setBulkFileName("");setImportPreview([]);setDialog("none");
  }catch(e){setError(e instanceof Error?e.message:"تعذر استيراد الطلاب.")}
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
  a.href=url;a.download=(credentialBatch.className||"class")+"-student-credentials.json";a.click();
  URL.revokeObjectURL(url);
 }

 function exportCsv(){
  const rows=[
   ["الاسم","اسم العائلة","رقم الهوية","الصف","الحالة","آخر دخول"],
   ...visibleStudents.map(s=>[s.firstName,s.familyName,s.identityNumber||s.code,selectedClass?.name||"",statusLabel(s),s.lastLoginAt?fmtDate(s.lastLoginAt):"لم يسجل الدخول"])
  ];
  const csv="\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=(selectedClass?.name||"students")+"-students.csv";a.click();
  URL.revokeObjectURL(url);
 }

 async function openProfile(student:Student){
  clearPasswordReveal();setProfileSection("summary");setEditingStudent(null);setDialog("none");
  setProfileBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;profile:StudentProfile}>("/api/students?profileUserId="+encodeURIComponent(student.userId));
   setProfile(result.profile);
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل تفاصيل الطالب.")}
  finally{setProfileBusy(false)}
 }

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

 async function openHistory(userId:string){
  clearPasswordReveal();setProfileSection("history");setEditingStudent(null);setDialog("none");
  setProfileBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;profile:StudentProfile}>("/api/students?profileUserId="+encodeURIComponent(userId));
   setProfile(result.profile);
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل سجل الوظائف.")}
  finally{setProfileBusy(false)}
 }

 async function historyAllowRetry(item:SubmittedAssignment){
  if(!profile||actionBusy)return;
  setActionBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;allowedAttempts:number}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"allowRetry",assignmentId:item.assignmentId,studentId:profile.student.userId})});
   setProfile(h=>h?{...h,submittedAssignments:h.submittedAssignments.map(x=>x.assignmentId===item.assignmentId?{...x,allowedAttempts:result.allowedAttempts}:x)}:h);
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
   const result=await teacherApi<{ok:true;dueAtOverride:string|null}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"setDueAtOverride",assignmentId:item.assignmentId,studentId:profile.student.userId,dueAtOverride:new Date(historyDeadlineValue).toISOString()})});
   setProfile(h=>h?{...h,submittedAssignments:h.submittedAssignments.map(x=>x.assignmentId===item.assignmentId?{...x,dueAtOverride:result.dueAtOverride,effectiveDueAt:result.dueAtOverride||x.dueAt}:x)}:h);
   setHistoryDeadlineFor(null);
   setNotice("✓ تم تمديد الموعد.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ التمديد.")}
  finally{setActionBusy(false)}
 }

 async function clearHistoryDeadline(item:SubmittedAssignment){
  if(!profile||actionBusy)return;
  setActionBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;dueAtOverride:string|null}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"setDueAtOverride",assignmentId:item.assignmentId,studentId:profile.student.userId,dueAtOverride:null})});
   setProfile(h=>h?{...h,submittedAssignments:h.submittedAssignments.map(x=>x.assignmentId===item.assignmentId?{...x,dueAtOverride:result.dueAtOverride,effectiveDueAt:x.dueAt}:x)}:h);
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
  if(!selectedIds.length||actionBusy)return;

  const count=selectedIds.length;
  if(operation==="move"&&!bulkTargetClassId){setError("اختر الصف الهدف أولًا.");return}

  let question="";
  if(operation==="delete")question="⚠️ حذف نهائي لـ "+count+" طالب؟\n\nالأرشفة أكثر أمانًا إذا كنت تريد الاحتفاظ بالبيانات.";
  else if(operation==="archive")question="أرشفة "+count+" طالب مع منع تسجيل الدخول والاحتفاظ بالبيانات؟";
  else if(operation==="unarchive")question="استعادة "+count+" طالب من الأرشيف وتفعيل حساباتهم؟";
  else if(operation==="resetpasswords")question="إنشاء كلمات مرور جديدة لـ "+count+" طالب؟ ستظهر الكلمات الجديدة مرة واحدة بعد العملية.";
  else if(operation==="move")question="نقل "+count+" طالب إلى الصف المختار؟";
  if(question&&!(await confirm({message:question,tone:operation==="delete"?"danger":"default",confirmLabel:operation==="delete"?"حذف نهائي":"تأكيد"})))return;
  if(operation==="resetpasswords"&&!(await confirmReplaceCredentialBatch()))return;

  setActionBusy(true);setError("");setNotice("");setBulkErrors([]);
  try{
   const result=await teacherApi<{ok:true;processed:number;failed:number;credentials:Credential[];errors:BulkError[];rosterSynced?:boolean}>("/api/students",{
    method:"POST",
    body:JSON.stringify({action:"bulkAction",operation,userIds:selectedIds,targetClassId:bulkTargetClassId})
   });
   if(result.credentials?.length)showCredentialBatch(result.credentials);
   if(result.errors?.length)setBulkErrors(result.errors);
   await Promise.all([loadStudents(selectedClassId),loadClasses()]);
   setSelectedIds([]);
   setNotice(withRosterNote(result,"✓ نُفذت العملية على "+result.processed+" طالب"+(result.failed?"، وفشلت لدى "+result.failed+".":".")));
  }catch(e){setError(e instanceof Error?e.message:"تعذر تنفيذ العملية الجماعية.")}
  finally{setActionBusy(false)}
 }

 function toggleSort(key:SortKey){if(sortKey===key)setSortAsc(x=>!x);else{setSortKey(key);setSortAsc(true)}}
 function openImportDialog(){setBulkStudents([]);setBulkErrors([]);setImportPreview([]);setBulkFileName("");setDialog("import")}

 if(workspaceTab==="dashboard")return <section className="teacher-platform" dir="rtl"><div className="teacher-platform-inner"><TeacherDashboard token={token}/></div></section>;
 if(workspaceTab==="audit")return <AuditHistoryPanel token={token}/>;
 if(workspaceTab==="assignments")return <section className="teacher-platform" dir="rtl"><div className="teacher-platform-inner"><section className="teacher-assignment-heading"><span className="platform-eyebrow">Assignments</span><h2>الواجبات والاختبارات المرسلة</h2><p>إنشاء الواجبات، متابعة التسليمات، التصحيح والنتائج.</p></section><AssignmentsPanel token={token} classes={classes} currentExam={currentExam} onCopyLibraryExamToBuilder={onCopyLibraryExamToBuilder}/></div></section>;

 const classActive=selectedClass?isActiveClass(selectedClass):false;
 const canCreateStudent=Boolean(newFirstName.trim()&&newFamilyName.trim()&&validIdentity(newIdentityNumber));
 const canSaveEdit=Boolean(editFirstName.trim()&&editFamilyName.trim()&&validIdentity(editIdentityNumber)&&editClassId);
 const visibleBatch=credentialBatch&&credentialBatchVisible(credentialBatch,selectedClassId)?credentialBatch:null;

 return <section className="teacher-platform eb-students-workspace" dir="rtl"><div className="teacher-platform-inner">
  {error&&<div className="platform-error" role="alert">{error}</div>}
  {notice&&<div className="platform-notice" role="status" aria-live="polite">{notice}</div>}

  <div className="eb-students-layout">
   <ClassesPane
    classes={visibleClasses} view={classArchiveView} onViewChange={setClassArchiveView}
    activeCount={activeClasses.length} archivedCount={archivedClasses.length}
    selectedClassId={selectedClassId} onSelect={setSelectedClassId}
    projects={projects} projectTitle={projectTitle} isGraduationEligible={isGraduationEligible}
    onToggleProject={(classroom,code,enable)=>void toggleClassProject(classroom,code,enable)}
    onToggleArchive={classroom=>void toggleClassArchive(classroom)} onGraduate={classroom=>void graduateAndArchiveClass(classroom)}
    onCreate={()=>setDialog("createClass")} onRefresh={()=>void reloadAuthoritative(selectedClassId)}
    loading={loading} busy={actionBusy} fmtDate={fmtDate}/>

   <RosterPane
    classroom={selectedClass} classActive={classActive} students={students} visibleStudents={visibleStudents} stats={stats}
    loading={loading} busy={actionBusy}
    searchText={searchText} onSearch={setSearchText} statusFilter={statusFilter} onStatusFilter={setStatusFilter}
    sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort}
    selectedIds={selectedIds} onToggleSelected={toggleSelected} onToggleSelectVisible={toggleSelectVisible} onClearSelection={()=>setSelectedIds([])}
    onAddStudent={()=>setDialog("addStudent")} onImport={openImportDialog} onRefresh={()=>void reloadAuthoritative(selectedClassId)} onExportCsv={exportCsv}
    onOpenProfile={student=>void openProfile(student)} onOpenHistory={student=>void openHistory(student.userId)} onEdit={startEdit}
    onCopyIdentity={student=>void copyText(student.identityNumber||student.code,"✓ تم نسخ رقم الهوية.")}
    onToggleActive={student=>void toggleStudent(student)} onArchive={student=>void archiveStudent(student)} onDelete={student=>void deleteStudent(student)}
    bulk={{targetClasses:classes.filter(c=>isActiveClass(c)&&c.classId!==selectedClassId),targetClassId:bulkTargetClassId,onTargetChange:setBulkTargetClassId,onAction:operation=>void runBulkAction(operation)}}
    credentialBox={credentialBox}
    onCopyCredentialBox={()=>{if(credentialBox)void copyText(credentialText(credentialBox.name,credentialBox.identityNumber,credentialBox.password),"✓ تم نسخ بيانات الدخول.")}}
    onHideCredentialBox={()=>setCredentialBox(null)}
    credentialBatch={visibleBatch}
    onToggleBatch={()=>setCredentialBatch(b=>b?toggleCredentialBatchCollapsed(b):b)} onDownloadBatch={downloadCredentials} onDiscardBatch={()=>void discardCredentialBatch()}
    onCopyCredential={c=>void copyText(credentialText(((c.firstName||"")+" "+(c.familyName||"")).trim(),c.identityNumber||c.code,c.password),"✓ تم نسخ بيانات دخول الطالب.")}
    bulkErrors={bulkErrors} statusLabel={statusLabel} fmtDate={fmtDate} splitName={splitName}/>
  </div>

  <CreateClassDialog open={dialog==="createClass"} onClose={()=>setDialog("none")} name={newClassName} grade={newClassGrade} schoolYear={newSchoolYear}
   onName={setNewClassName} onGrade={setNewClassGrade} onSchoolYear={setNewSchoolYear} onSubmit={()=>void createClass()} busy={actionBusy}/>
  <AddStudentDialog open={dialog==="addStudent"} onClose={()=>setDialog("none")} classroom={selectedClass} classActive={classActive}
   firstName={newFirstName} familyName={newFamilyName} identityNumber={newIdentityNumber} password={newStudentPassword}
   onFirstName={setNewFirstName} onFamilyName={setNewFamilyName} onIdentityNumber={v=>setNewIdentityNumber(onlyDigits(v))} onPassword={setNewStudentPassword}
   canSubmit={canCreateStudent} onSubmit={()=>void createStudent()} busy={actionBusy}/>
  <ImportStudentsDialog open={dialog==="import"} onClose={()=>setDialog("none")} classroom={selectedClass} classActive={classActive}
   fileName={bulkFileName} previewBusy={previewBusy} preview={importPreview} onFile={file=>void readBulkFile(file)} onImport={()=>void importBulkStudents()} busy={actionBusy}/>
  <EditStudentDialog open={editingStudent!==null} onClose={()=>setEditingStudent(null)}
   classes={classes.filter(c=>isActiveClass(c)||c.classId===(editingStudent?.classId||""))}
   firstName={editFirstName} familyName={editFamilyName} identityNumber={editIdentityNumber} classId={editClassId} password={editPassword}
   onFirstName={setEditFirstName} onFamilyName={setEditFamilyName} onIdentityNumber={v=>setEditIdentityNumber(onlyDigits(v))} onClassId={setEditClassId} onPassword={setEditPassword}
   canSubmit={canSaveEdit} onSubmit={()=>void saveStudentEdit()} busy={actionBusy}/>

  {profileBusy&&<div className="platform-loading" role="status">جارٍ تحميل ملف الطالب...</div>}
  {profile&&<StudentDialog profile={profile} section={profileSection} onClose={()=>{clearPasswordReveal();setProfile(null);setHistoryDeadlineFor(null)}}
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
