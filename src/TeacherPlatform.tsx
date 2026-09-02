import {useEffect,useMemo,useRef,useState,Fragment} from "react";
import AssignmentsPanel from "./AssignmentsPanel";
import AssignmentReview from "./AssignmentReview";
import TeacherDashboard from "./TeacherDashboard";
import {IconSearch,IconDownload,IconUpload,IconPlus,IconChevronDown,IconMore,IconUser,IconEdit,IconCopy,IconKey,IconTrash,IconClose,IconMedal} from "./icons";
import {MEDAL_COLORS,MEDAL_LABELS,medalTier} from "./medals";

type WorkspaceTab="dashboard"|"students"|"assignments";
type TeacherPlatformProps={token:string;currentExam:unknown|null;workspaceTab:WorkspaceTab};
type Classroom={classId:string;name:string;grade:string;schoolYear:string;active:boolean;studentCount:number;createdAt:string};
type Student={userId:string;code:string;identityNumber:string;firstName:string;familyName:string;displayName:string;classId:string;active:boolean;archived:boolean;createdAt:string;updatedAt:string;lastLoginAt:string;submittedAssignmentsCount:number;likesCount:number};
type Credential={userId?:string;firstName?:string;familyName?:string;displayName?:string;code:string;identityNumber?:string;password:string};
type BulkStudent={firstName:string;familyName:string;identityNumber:string};
type BulkError={index?:number;firstName?:string;familyName?:string;identityNumber?:string;displayName?:string;code?:string;error:string;userId?:string};
type ImportPreviewRow={index:number;firstName:string;familyName:string;identityNumber:string;status:"valid"|"duplicate"|"invalid";error:string;existingStudent?:{userId:string;displayName:string;classId:string;className:string;active:boolean;archived:boolean}|null};
type SubmittedAssignment={assignmentId:string;title:string;submittedAt:string;latestAttemptNumber:number;attemptsUsed:number;allowedAttempts:number;score:number;totalMarks:number;percentage:number;finalized:boolean;isCurrentClassAssignment:boolean;dueAt:string;dueAtOverride:string|null;effectiveDueAt:string};
type StudentProfile={
 student:Student;
 classroom:{classId:string;name:string;grade:string;schoolYear:string}|null;
 stats:{assigned:number;completed:number;pending:number;average:number|null;lastLoginAt:string};
 assignments:Array<{assignmentId:string;title:string;status:string;dueAt:string;totalMarks:number;attemptsUsed:number;latestScore:number|null;latestPercentage:number|null;submittedAt:string;finalized:boolean}>;
 submittedAssignmentsCount:number;
 submittedAssignments:SubmittedAssignment[];
};
type ApiError={ok?:boolean;error?:string};
type SortKey="firstName"|"familyName"|"identityNumber"|"status";
type StatusFilter="all"|"active"|"disabled"|"archived";

const onlyDigits=(value:string)=>value.replace(/\D/g,"").slice(0,9);
const validIdentity=(value:string)=>/^\d{9}$/.test(value);
const fmtDate=(value:string)=>value?new Date(value).toLocaleString("ar"):"—";
const toLocalInput=(iso:string)=>{if(!iso)return "";const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
function medalItemsFor(assignments:StudentProfile["assignments"]){
 return assignments
  .filter(a=>a.latestPercentage!==null)
  .map(a=>({assignmentId:a.assignmentId,title:a.title,submittedAt:a.submittedAt,tier:medalTier(a.latestPercentage as number)}))
  .filter((item):item is {assignmentId:string;title:string;submittedAt:string;tier:"gold"|"silver"|"bronze"}=>item.tier!==null);
}

function normalizeImportedIdentity(value:unknown){
 const digits=String(value??"").replace(/\D/g,"");
 return digits&&digits.length<=9?digits.padStart(9,"0"):digits;
}
function splitName(value:unknown){
 const parts=String(value??"").trim().split(/\s+/).filter(Boolean);
 return {firstName:parts.shift()||"",familyName:parts.join(" ")};
}
function statusLabel(student:Student){
 if(student.archived)return "مؤرشف";
 return student.active?"فعّال":"معطّل";
}
function csvCell(value:unknown){
 const text=String(value??"");
 return `"${text.replace(/"/g,'""')}"`;
}

function TeacherPlatform({token,currentExam,workspaceTab}:TeacherPlatformProps){
 const [classes,setClasses]=useState<Classroom[]>([]);
 const [students,setStudents]=useState<Student[]>([]);
 const [selectedClassId,setSelectedClassId]=useState("");
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
 const [bulkCredentials,setBulkCredentials]=useState<Credential[]>([]);
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

 const [history,setHistory]=useState<StudentProfile|null>(null);
 const [historyBusy,setHistoryBusy]=useState(false);
 const [reviewTarget,setReviewTarget]=useState<{assignmentId:string;studentId:string;attemptNumber:number}|null>(null);
 const [historyDeadlineFor,setHistoryDeadlineFor]=useState<string|null>(null);
 const [historyDeadlineValue,setHistoryDeadlineValue]=useState("");

 const selectedClass=useMemo(()=>classes.find(c=>c.classId===selectedClassId)||null,[classes,selectedClassId]);

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
    const first=loaded.find(c=>c.active)||loaded[0];
    setSelectedClassId(first?.classId||"");
   }
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل الصفوف.")}
  finally{setLoading(false)}
 }

 async function loadStudents(classId:string){
  if(!classId){setStudents([]);return}
  setLoading(true);setError("");
  try{
   const result=await teacherApi<{ok:true;students:Student[]}>("/api/students?classId="+encodeURIComponent(classId)+"&includeArchived=1");
   setStudents(result.students||[]);
   setSelectedIds(prev=>prev.filter(id=>(result.students||[]).some(s=>s.userId===id)));
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل الطلاب.")}
  finally{setLoading(false)}
 }

 useEffect(()=>{void loadClasses(false)},[]);
 useEffect(()=>{
  setSelectedIds([]);setProfile(null);setEditingStudent(null);setHistory(null);setReviewTarget(null);clearPasswordReveal();
  if(selectedClassId)void loadStudents(selectedClassId);else setStudents([]);
 },[selectedClassId]);
 useEffect(()=>()=>{if(passwordRevealTimer.current)window.clearInterval(passwordRevealTimer.current)},[]);
 useEffect(()=>{
  if(!(profile||editingStudent||history))return;
  function onKey(e:KeyboardEvent){if(e.key==="Escape"){setProfile(null);setEditingStudent(null);setHistory(null);setHistoryDeadlineFor(null)}}
  window.addEventListener("keydown",onKey);
  return()=>window.removeEventListener("keydown",onKey);
 },[profile,editingStudent,history]);

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
   setNewClassName("");setNewClassGrade("");
   await loadClasses(false);
   setSelectedClassId(result.classroom.classId);
   setNotice("✓ تم إنشاء الصف.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء الصف.")}
  finally{setActionBusy(false)}
 }

 async function toggleClassArchive(classroom:Classroom){
  if(actionBusy)return;
  setActionBusy(true);setError("");setNotice("");
  try{
   await teacherApi("/api/classrooms",{method:"POST",body:JSON.stringify({action:classroom.active?"archive":"unarchive",classId:classroom.classId})});
   await loadClasses();
   setNotice(classroom.active?"✓ تم أرشفة الصف.":"✓ تم تفعيل الصف.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تعديل الصف.")}
  finally{setActionBusy(false)}
 }

 async function createStudent(){
  if(!selectedClassId||!newFirstName.trim()||!newFamilyName.trim()||!validIdentity(newIdentityNumber)||actionBusy)return;
  setActionBusy(true);setError("");setNotice("");setCredentialBox(null);
  try{
   const result=await teacherApi<{ok:true;student:Student;temporaryPassword:string}>("/api/students",{method:"POST",body:JSON.stringify({
    action:"create",classId:selectedClassId,firstName:newFirstName.trim(),familyName:newFamilyName.trim(),identityNumber:newIdentityNumber,password:newStudentPassword
   })});
   setCredentialBox({name:result.student.displayName,identityNumber:result.student.identityNumber,password:result.temporaryPassword});
   setNewFirstName("");setNewFamilyName("");setNewIdentityNumber("");setNewStudentPassword("");
   await Promise.all([loadStudents(selectedClassId),loadClasses()]);
   setNotice("✓ تم إنشاء حساب الطالب. سيستخدم رقم الهوية لتسجيل الدخول.");
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
   await teacherApi("/api/students",{method:"POST",body:JSON.stringify({action:"toggleActive",userId:student.userId})});
   await loadStudents(selectedClassId);
   setNotice(student.active?"✓ تم تعطيل حساب الطالب.":"✓ تم تفعيل حساب الطالب.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تعديل الحساب.")}
  finally{setActionBusy(false)}
 }

 async function archiveStudent(student:Student){
  const action=student.archived?"unarchive":"archive";
  const message=student.archived
   ?"استعادة الطالب "+student.displayName+" إلى الصف وتفعيل حسابه؟"
   :"أرشفة الطالب "+student.displayName+"؟\n\nسيُزال من عدد طلاب الصف الفعّالين ويُمنع من تسجيل الدخول، مع الاحتفاظ ببياناته ونتائجه.";
  if(actionBusy||!window.confirm(message))return;
  setActionBusy(true);setError("");setNotice("");
  try{
   await teacherApi("/api/students",{method:"POST",body:JSON.stringify({action,userId:student.userId})});
   await Promise.all([loadStudents(selectedClassId),loadClasses()]);
   setNotice(student.archived?"✓ تمت استعادة الطالب.":"✓ تمت أرشفة الطالب مع الاحتفاظ ببياناته.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تغيير حالة الأرشفة.")}
  finally{setActionBusy(false)}
 }

 async function deleteStudent(student:Student){
  const identity=student.identityNumber||student.code;
  const confirmed=window.confirm(
   "⚠️ حذف نهائي\n\n"+
   "الطالب: "+student.displayName+"\n"+
   "رقم الهوية: "+identity+"\n\n"+
   "سيتم حذف حساب الطالب وبياناته الأساسية نهائيًا وإزالته من الصف. "+
   "استخدم الأرشفة بدل الحذف إذا أردت الاحتفاظ بالحساب.\n\nهل أنت متأكد؟"
  );
  if(actionBusy||!confirmed)return;
  setActionBusy(true);setError("");setNotice("");
  try{
   await teacherApi("/api/students",{method:"POST",body:JSON.stringify({action:"delete",userId:student.userId})});
   if(profile?.student.userId===student.userId)setProfile(null);
   if(editingStudent?.userId===student.userId)setEditingStudent(null);
   await Promise.all([loadStudents(selectedClassId),loadClasses()]);
   setNotice("✓ تم حذف الطالب نهائيًا.");
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
 }

 async function saveStudentEdit(){
  if(!editingStudent||!editFirstName.trim()||!editFamilyName.trim()||!validIdentity(editIdentityNumber)||!editClassId||actionBusy)return;
  setActionBusy(true);setError("");setNotice("");
  try{
   await teacherApi<{ok:true;student:Student;passwordChanged:boolean}>("/api/students",{method:"POST",body:JSON.stringify({
    action:"update",userId:editingStudent.userId,firstName:editFirstName.trim(),familyName:editFamilyName.trim(),identityNumber:editIdentityNumber,classId:editClassId,password:editPassword
   })});
   const moved=editClassId!==selectedClassId;
   setEditingStudent(null);setEditPassword("");
   await Promise.all([loadStudents(selectedClassId),loadClasses()]);
   setNotice(moved?"✓ تم تعديل الطالب ونقله إلى الصف المختار.":"✓ تم حفظ تعديلات الطالب.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ تعديلات الطالب.")}
  finally{setActionBusy(false)}
 }

 async function readBulkFile(file:File|null){
  setBulkStudents([]);setBulkCredentials([]);setBulkErrors([]);setImportPreview([]);setBulkFileName(file?.name||"");setError("");setNotice("");
  if(!file)return;
  try{
   const json=JSON.parse(await file.text());
   const raw=Array.isArray(json)?json:Array.isArray(json?.students)?json.students:[];
   const normalized:BulkStudent[]=raw.map((item:unknown)=>{
    if(typeof item==="string"){
     const names=splitName(item);
     return {firstName:names.firstName,familyName:names.familyName,identityNumber:""};
    }
    const x=item as Record<string,unknown>;
    const directFirst=String(x?.firstName??x?.givenName??"").trim();
    const directFamily=String(x?.familyName??x?.lastName??x?.surname??"").trim();
    const names=(directFirst||directFamily)?{firstName:directFirst,familyName:directFamily}:splitName(x?.displayName??x?.name??x?.studentName??"");
    const identityNumber=normalizeImportedIdentity(x?.identityNumber??x?.idNumber??x?.studentId??x?.identity??x?.id??x?.code??x?.studentCode??"");
    return {firstName:names.firstName,familyName:names.familyName,identityNumber};
   }).filter((x:BulkStudent)=>x.firstName||x.familyName||x.identityNumber);

   if(!normalized.length)throw new Error("لم أجد بيانات طلاب في ملف JSON.");
   setBulkStudents(normalized);
   setPreviewBusy(true);
   const result=await teacherApi<{ok:true;preview:ImportPreviewRow[];valid:number;duplicates:number;invalid:number}>("/api/students",{
    method:"POST",body:JSON.stringify({action:"previewImport",classId:selectedClassId,students:normalized})
   });
   setImportPreview(result.preview||[]);
   setNotice("✓ تمت معاينة الملف: "+result.valid+" صالح، "+result.duplicates+" مكرر، "+result.invalid+" غير صالح. لن يتم الحفظ قبل الضغط على زر الاستيراد.");
  }catch(e){
   setError(e instanceof Error?e.message:"ملف JSON غير صالح.");
   setBulkFileName("");
  }finally{setPreviewBusy(false)}
 }

 async function importBulkStudents(){
  const validRows=importPreview.filter(x=>x.status==="valid");
  if(!selectedClassId||!validRows.length||actionBusy)return;
  setActionBusy(true);setError("");setNotice("");setBulkCredentials([]);setBulkErrors([]);
  try{
   const payload=validRows.map(x=>({firstName:x.firstName,familyName:x.familyName,identityNumber:x.identityNumber}));
   const result=await teacherApi<{ok:true;imported:number;failed:number;credentials:Credential[];errors:BulkError[]}>("/api/students",{
    method:"POST",body:JSON.stringify({action:"bulkImport",classId:selectedClassId,students:payload})
   });
   setBulkCredentials(result.credentials||[]);
   setBulkErrors(result.errors||[]);
   await Promise.all([loadStudents(selectedClassId),loadClasses()]);
   setNotice("✓ تم استيراد "+result.imported+" طالبًا"+(result.failed?"، وتعذر استيراد "+result.failed+".":"."));
   setBulkStudents([]);setBulkFileName("");setImportPreview([]);
  }catch(e){setError(e instanceof Error?e.message:"تعذر استيراد الطلاب.")}
  finally{setActionBusy(false)}
 }

 function downloadCredentials(){
  if(!bulkCredentials.length)return;
  const payload={
   classId:selectedClassId,
   className:selectedClass?.name||"",
   generatedAt:new Date().toISOString(),
   students:bulkCredentials.map(x=>({
    firstName:x.firstName||"",
    familyName:x.familyName||"",
    displayName:x.displayName||"",
    identityNumber:x.identityNumber||x.code,
    password:x.password
   }))
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=(selectedClass?.name||"class")+"-student-credentials.json";a.click();
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
  clearPasswordReveal();
  setProfileBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;profile:StudentProfile}>("/api/students?profileUserId="+encodeURIComponent(student.userId));
   setProfile(result.profile);
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل تفاصيل الطالب.")}
  finally{setProfileBusy(false)}
 }

 async function resetProfilePassword(){
  if(!profile||actionBusy)return;
  if(!window.confirm("سيتم إنشاء كلمة مرور جديدة للطالب، ولن تعمل كلمة المرور القديمة. هل تريد المتابعة؟"))return;
  setActionBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;temporaryPassword:string}>("/api/students",{method:"POST",body:JSON.stringify({action:"resetPassword",userId:profile.student.userId})});
   startPasswordReveal(result.temporaryPassword);
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء كلمة مرور جديدة.")}
  finally{setActionBusy(false)}
 }

 async function openHistory(userId:string){
  setHistoryBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;profile:StudentProfile}>("/api/students?profileUserId="+encodeURIComponent(userId));
   setHistory(result.profile);
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل سجل الوظائف.")}
  finally{setHistoryBusy(false)}
 }

 async function historyAllowRetry(item:SubmittedAssignment){
  if(!history||actionBusy)return;
  setActionBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;allowedAttempts:number}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"allowRetry",assignmentId:item.assignmentId,studentId:history.student.userId})});
   setHistory(h=>h?{...h,submittedAssignments:h.submittedAssignments.map(x=>x.assignmentId===item.assignmentId?{...x,allowedAttempts:result.allowedAttempts}:x)}:h);
   setNotice("✓ تم السماح بمحاولة إضافية.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر السماح بالمحاولة.")}
  finally{setActionBusy(false)}
 }

 function openHistoryDeadline(item:SubmittedAssignment){
  setError("");setHistoryDeadlineFor(item.assignmentId);setHistoryDeadlineValue(item.dueAtOverride?toLocalInput(item.dueAtOverride):"");
 }

 async function saveHistoryDeadline(item:SubmittedAssignment){
  if(!history||!historyDeadlineValue||actionBusy)return;
  setActionBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;dueAtOverride:string|null}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"setDueAtOverride",assignmentId:item.assignmentId,studentId:history.student.userId,dueAtOverride:new Date(historyDeadlineValue).toISOString()})});
   setHistory(h=>h?{...h,submittedAssignments:h.submittedAssignments.map(x=>x.assignmentId===item.assignmentId?{...x,dueAtOverride:result.dueAtOverride,effectiveDueAt:result.dueAtOverride||x.dueAt}:x)}:h);
   setHistoryDeadlineFor(null);
   setNotice("✓ تم تمديد الموعد.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ التمديد.")}
  finally{setActionBusy(false)}
 }

 async function clearHistoryDeadline(item:SubmittedAssignment){
  if(!history||actionBusy)return;
  setActionBusy(true);setError("");
  try{
   const result=await teacherApi<{ok:true;dueAtOverride:string|null}>("/api/assignment-results",{method:"POST",body:JSON.stringify({action:"setDueAtOverride",assignmentId:item.assignmentId,studentId:history.student.userId,dueAtOverride:null})});
   setHistory(h=>h?{...h,submittedAssignments:h.submittedAssignments.map(x=>x.assignmentId===item.assignmentId?{...x,dueAtOverride:result.dueAtOverride,effectiveDueAt:x.dueAt}:x)}:h);
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
  if(question&&!window.confirm(question))return;

  setActionBusy(true);setError("");setNotice("");setBulkErrors([]);
  try{
   const result=await teacherApi<{ok:true;processed:number;failed:number;credentials:Credential[];errors:BulkError[]}>("/api/students",{
    method:"POST",
    body:JSON.stringify({action:"bulkAction",operation,userIds:selectedIds,targetClassId:bulkTargetClassId})
   });
   if(result.credentials?.length)setBulkCredentials(result.credentials);
   if(result.errors?.length)setBulkErrors(result.errors);
   await Promise.all([loadStudents(selectedClassId),loadClasses()]);
   setSelectedIds([]);
   setNotice("✓ نُفذت العملية على "+result.processed+" طالب"+(result.failed?"، وفشلت لدى "+result.failed+".":"."));
  }catch(e){setError(e instanceof Error?e.message:"تعذر تنفيذ العملية الجماعية.")}
  finally{setActionBusy(false)}
 }

 function sortButton(key:SortKey,label:string){
  return <button className="student-sort-button" onClick={()=>{if(sortKey===key)setSortAsc(x=>!x);else{setSortKey(key);setSortAsc(true)}}}>
   {label} {sortKey===key?(sortAsc?"↑":"↓"):"↕"}
  </button>;
 }

 if(workspaceTab==="dashboard")return <section className="teacher-platform" dir="rtl"><div className="teacher-platform-inner"><TeacherDashboard token={token}/></div></section>;
 if(workspaceTab==="assignments")return <section className="teacher-platform" dir="rtl"><div className="teacher-platform-inner"><section className="teacher-assignment-heading"><span className="platform-eyebrow">Assignments</span><h2>الواجبات والاختبارات المرسلة</h2><p>إنشاء الواجبات، متابعة التسليمات، التصحيح والنتائج.</p></section><AssignmentsPanel token={token} classes={classes} currentExam={currentExam}/></div></section>;

 const selectedCount=selectedIds.length;
 const previewValid=importPreview.filter(x=>x.status==="valid").length;
 const previewDuplicates=importPreview.filter(x=>x.status==="duplicate").length;
 const previewInvalid=importPreview.filter(x=>x.status==="invalid").length;

 return <section className="teacher-platform" dir="rtl"><div className="teacher-platform-inner">
  <section className="platform-hero">
   <div><span className="platform-eyebrow">ExamBank 2.0I</span><h2>إدارة الطلاب المتقدمة</h2><p>بحث وفرز، عمليات جماعية، معاينة استيراد، أرشفة، ملف طالب، علامات وتصدير.</p></div>
   <div className="platform-hero-stat"><strong>{classes.filter(c=>c.active).length}</strong><span>صفوف فعّالة</span></div>
  </section>

  {error&&<div className="platform-error">{error}</div>}
  {notice&&<div className="platform-notice">{notice}</div>}

  {credentialBox&&<section className="credential-box">
   <div><span className="platform-eyebrow">بيانات دخول جديدة</span><h3>{credentialBox.name}</h3></div>
   <div className="credential-values">
    <div><span>رقم الهوية / الدخول</span><strong>{credentialBox.identityNumber}</strong></div>
    <div><span>كلمة المرور</span><strong>{credentialBox.password}</strong></div>
   </div>
   <div className="student-row-actions">
    <button onClick={()=>void copyText(credentialText(credentialBox.name,credentialBox.identityNumber,credentialBox.password),"✓ تم نسخ بيانات الدخول.")}>📋 نسخ بيانات الدخول</button>
    <button onClick={()=>setCredentialBox(null)}>إخفاء</button>
   </div>
  </section>}

  <div className="platform-grid">
   <section className="platform-card">
    <div className="platform-card-heading"><div><span className="platform-eyebrow">Classes</span><h3>الصفوف</h3></div><button onClick={()=>loadClasses()} disabled={loading}>↻ تحديث</button></div>
    <div className="platform-form-grid">
     <label>اسم الصف<input value={newClassName} onChange={e=>setNewClassName(e.target.value)} placeholder="مثال: الثاني عشر 8"/></label>
     <label>المرحلة / الصف<input value={newClassGrade} onChange={e=>setNewClassGrade(e.target.value)} placeholder="مثال: الثاني عشر"/></label>
     <label>السنة الدراسية<input value={newSchoolYear} onChange={e=>setNewSchoolYear(e.target.value)}/></label>
     <button className="platform-primary" onClick={createClass} disabled={actionBusy||!newClassName.trim()}>+ إنشاء صف</button>
    </div>
    {loading&&classes.length===0&&<div className="platform-loading">⏳ جارٍ التحميل...</div>}
    <div className="class-list">
     {classes.map(classroom=><article key={classroom.classId} className={"class-row "+(classroom.classId===selectedClassId?"selected ":"")+(classroom.active?"":"archived")}>
      <button className="class-select" onClick={()=>setSelectedClassId(classroom.classId)}><strong>{classroom.name}</strong><span>{classroom.grade||"—"} · {classroom.studentCount} طالب</span><small>{classroom.schoolYear||""}</small></button>
      <button className="class-archive" onClick={()=>toggleClassArchive(classroom)} disabled={actionBusy}>{classroom.active?"أرشفة":"تفعيل"}</button>
     </article>)}
     {!loading&&classes.length===0&&<div className="platform-empty">لا توجد صفوف بعد.</div>}
    </div>
   </section>

   <section className="platform-card student-admin-card">
    <div className="platform-card-heading"><div><span className="platform-eyebrow">Students</span><h3>الطلاب</h3></div><span className="student-count-badge">{students.length}</span></div>
    {!selectedClass?<div className="platform-empty">أنشئ صفًا أو اختر صفًا لإدارة الطلاب.</div>:<>
     <div className="selected-class-strip"><strong>{selectedClass.name}</strong><span>{selectedClass.grade||""}</span></div>

     <div className="student-admin-stats">
      <article><strong>{stats.total}</strong><span>إجمالي</span></article>
      <article><strong>{stats.active}</strong><span>فعّال</span></article>
      <article><strong>{stats.disabled}</strong><span>معطّل</span></article>
      <article><strong>{stats.archived}</strong><span>مؤرشف</span></article>
      <article><strong>{stats.neverLogged}</strong><span>لم يدخلوا بعد</span></article>
     </div>

     <div className="student-toolbar-pro">
      <div className="student-search-field">
       <IconSearch size={16} aria-hidden="true"/>
       <input value={searchText} onChange={e=>setSearchText(e.target.value)} placeholder="ابحث بالاسم، العائلة أو رقم الهوية" aria-label="ابحث بالاسم، العائلة أو رقم الهوية"/>
      </div>
      <select className="student-status-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value as StatusFilter)}>
       <option value="all">كل الحالات</option><option value="active">فعّال</option><option value="disabled">معطّل</option><option value="archived">مؤرشف</option>
      </select>
      <div className="student-sort-row">
       <span>الفرز:</span>{sortButton("firstName","الاسم")}{sortButton("familyName","العائلة")}{sortButton("identityNumber","الهوية")}{sortButton("status","الحالة")}
      </div>
      <button className="student-toolbar-export" onClick={exportCsv}><IconDownload size={16}/>تصدير CSV</button>
     </div>

     <div className="student-quick-actions">
      <details className="student-admin-details student-quick-panel">
       <summary><IconPlus size={16}/><span>إضافة طالب جديد</span><IconChevronDown size={14} className="details-chevron"/></summary>
       <div className="student-create-grid">
        <label>الاسم<input value={newFirstName} onChange={e=>setNewFirstName(e.target.value)} placeholder="الاسم الشخصي"/></label>
        <label>اسم العائلة<input value={newFamilyName} onChange={e=>setNewFamilyName(e.target.value)} placeholder="اسم العائلة"/></label>
        <label>رقم الهوية<input value={newIdentityNumber} onChange={e=>setNewIdentityNumber(onlyDigits(e.target.value))} inputMode="numeric" maxLength={9} dir="ltr" placeholder="9 أرقام"/></label>
        <label>كلمة مرور اختيارية<input type="password" value={newStudentPassword} onChange={e=>setNewStudentPassword(e.target.value)} placeholder="اتركها فارغة للتوليد التلقائي"/></label>
        <button className="platform-primary" onClick={createStudent} disabled={actionBusy||!selectedClass.active||!newFirstName.trim()||!newFamilyName.trim()||!validIdentity(newIdentityNumber)}>+ إنشاء حساب طالب</button>
       </div>
      </details>

      <details className="student-admin-details student-quick-panel">
       <summary><IconUpload size={16}/><span>استيراد من JSON مع معاينة قبل الحفظ</span><IconChevronDown size={14} className="details-chevron"/></summary>
       <div className="student-create-grid">
        <label>ملف الطلاب<input type="file" accept=".json,application/json" onChange={e=>void readBulkFile(e.target.files?.[0]||null)}/></label>
        <div><span>الملف</span><strong>{bulkFileName||"لم يتم اختيار ملف"}</strong><small>{previewBusy?" جارٍ فحص البيانات...":importPreview.length?` ${previewValid} صالح · ${previewDuplicates} مكرر · ${previewInvalid} غير صالح`:""}</small></div>
        <button className="platform-primary" onClick={importBulkStudents} disabled={actionBusy||previewBusy||!selectedClass.active||!previewValid}>✓ استيراد {previewValid||""} طالب صالح</button>
       </div>

       {importPreview.length>0&&<div className="students-table-wrap import-preview-wrap"><table className="students-table">
        <thead><tr><th>الحالة</th><th>الاسم</th><th>العائلة</th><th>رقم الهوية</th><th>ملاحظة</th></tr></thead>
        <tbody>{importPreview.map(row=><tr key={row.index} className={"import-row-"+row.status}>
         <td><span className={"import-badge "+row.status}>{row.status==="valid"?"✓ صالح":row.status==="duplicate"?"⚠ مكرر":"✕ خطأ"}</span></td>
         <td>{row.firstName||"—"}</td><td>{row.familyName||"—"}</td><td dir="ltr">{row.identityNumber||"—"}</td>
         <td>{row.error||"جاهز للاستيراد"}</td>
        </tr>)}</tbody>
       </table></div>}
      </details>
     </div>

     {!selectedClass.active&&<div className="platform-warning">الصف مؤرشف؛ فعّله قبل إضافة أو استعادة الطلاب.</div>}

     {selectedCount>0&&<section className="student-bulk-bar">
      <strong>{selectedCount} طالب محدد</strong>
      <div className="student-bulk-safe">
       <button onClick={()=>void runBulkAction("activate")} disabled={actionBusy}>تفعيل</button>
       <button onClick={()=>void runBulkAction("deactivate")} disabled={actionBusy}>تعطيل</button>
       <button onClick={()=>void runBulkAction("archive")} disabled={actionBusy}>أرشفة</button>
       <button onClick={()=>void runBulkAction("unarchive")} disabled={actionBusy}>استعادة</button>
       <button onClick={()=>void runBulkAction("resetpasswords")} disabled={actionBusy}><IconKey size={14}/>كلمات مرور جديدة</button>
       <select value={bulkTargetClassId} onChange={e=>setBulkTargetClassId(e.target.value)}>
        <option value="">اختر صفًا للنقل</option>
        {classes.filter(c=>c.active&&c.classId!==selectedClassId).map(c=><option key={c.classId} value={c.classId}>{c.name}</option>)}
       </select>
       <button onClick={()=>void runBulkAction("move")} disabled={actionBusy||!bulkTargetClassId}>نقل</button>
       <button onClick={()=>setSelectedIds([])}>إلغاء التحديد</button>
      </div>
      <div className="student-bulk-danger">
       <button className="danger-button" onClick={()=>void runBulkAction("delete")} disabled={actionBusy}><IconTrash size={14}/>حذف نهائي</button>
      </div>
     </section>}

     {bulkCredentials.length>0&&<section className="credential-box" style={{marginTop:16}}>
      <div className="platform-card-heading"><div><span className="platform-eyebrow">Generated credentials</span><h3>بيانات الدخول الجديدة</h3></div><button onClick={downloadCredentials}>⬇ تنزيل JSON</button></div>
      <p>احفظ هذه البيانات الآن؛ كلمات المرور لا تُعرض لاحقًا كنص واضح.</p>
      <div className="students-table-wrap"><table className="students-table">
       <thead><tr><th>الاسم</th><th>العائلة</th><th>رقم الهوية</th><th>كلمة المرور</th><th></th></tr></thead>
       <tbody>{bulkCredentials.map((c,i)=>{
        const fullName=(c.firstName||"")+" "+(c.familyName||"");
        const identity=c.identityNumber||c.code;
        return <tr key={(c.userId||c.code)+i}><td>{c.firstName}</td><td>{c.familyName}</td><td dir="ltr">{identity}</td><td dir="ltr"><strong>{c.password}</strong></td>
         <td><button onClick={()=>void copyText(credentialText(fullName.trim(),identity,c.password),"✓ تم نسخ بيانات دخول الطالب.")}>📋 نسخ</button></td></tr>
       })}</tbody>
      </table></div>
     </section>}

     {bulkErrors.length>0&&<div className="platform-warning"><strong>عمليات لم تكتمل:</strong>{bulkErrors.map((x,i)=><div key={x.userId||i}>{x.displayName||x.userId||"السطر "+((x.index??i)+1)}: {x.error}</div>)}</div>}

     {(profile||editingStudent||history)&&<div className="slide-over-backdrop" onClick={()=>{setProfile(null);setEditingStudent(null);setHistory(null);setHistoryDeadlineFor(null)}}/>}

     {editingStudent&&<section className="credential-box centered-modal-panel">
      <div className="platform-card-heading"><div><span className="platform-eyebrow">Edit Student</span><h3>تعديل تفاصيل الطالب</h3></div><button onClick={()=>setEditingStudent(null)}>إلغاء</button></div>
      <div className="student-create-grid">
       <label>الاسم<input value={editFirstName} onChange={e=>setEditFirstName(e.target.value)}/></label>
       <label>اسم العائلة<input value={editFamilyName} onChange={e=>setEditFamilyName(e.target.value)}/></label>
       <label>رقم الهوية<input value={editIdentityNumber} onChange={e=>setEditIdentityNumber(onlyDigits(e.target.value))} inputMode="numeric" maxLength={9} dir="ltr"/></label>
       <label>الصف<select value={editClassId} onChange={e=>setEditClassId(e.target.value)}>{classes.filter(c=>c.active||c.classId===(editingStudent?.classId||"")).map(c=><option key={c.classId} value={c.classId}>{c.name} · {c.grade}</option>)}</select></label>
       <label>كلمة مرور جديدة<input type="password" value={editPassword} onChange={e=>setEditPassword(e.target.value)} placeholder="اتركها فارغة للإبقاء على الحالية"/></label>
       <button className="platform-primary" onClick={saveStudentEdit} disabled={actionBusy||!editFirstName.trim()||!editFamilyName.trim()||!validIdentity(editIdentityNumber)||!editClassId}>💾 حفظ التعديلات</button>
      </div>
     </section>}

     {profileBusy&&<div className="platform-loading">⏳ جارٍ تحميل ملف الطالب...</div>}
     {profile&&<section className="student-profile-card centered-modal-panel">
      <div className="platform-card-heading">
       <div><span className="platform-eyebrow">Student Profile</span><h3>{profile.student.displayName}</h3><small>{profile.classroom?.name||"—"} · {profile.student.identityNumber}</small></div>
       <div className="student-row-actions">
        <button onClick={resetProfilePassword} disabled={actionBusy}><IconKey size={14}/>كلمة المرور</button>
        <button onClick={()=>{clearPasswordReveal();setProfile(null)}}><IconClose size={14}/>إغلاق</button>
       </div>
      </div>
      {passwordReveal&&<div className="credential-box">
       <div><span className="platform-eyebrow">كلمة مرور جديدة</span></div>
       <div className="credential-values"><div><span>كلمة المرور الجديدة</span><strong>{passwordReveal.password}</strong></div></div>
       <div className="student-row-actions"><button onClick={()=>void copyText(passwordReveal.password,"✓ تم نسخ كلمة المرور.")}><IconCopy size={14}/>نسخ</button></div>
       <p>ستختفي كلمة المرور بعد {passwordReveal.secondsLeft} ثوانٍ</p>
      </div>}
      <div className="student-profile-stats">
       <article><strong>{profile.stats.assigned}</strong><span>واجبات</span></article>
       <article><strong>{profile.stats.completed}</strong><span>مكتملة</span></article>
       <article><strong>{profile.stats.pending}</strong><span>لم تُحل</span></article>
       <article><strong>{profile.stats.average===null?"—":profile.stats.average+"%"}</strong><span>المعدل</span></article>
      </div>
      <p><b>آخر دخول:</b> {profile.stats.lastLoginAt?fmtDate(profile.stats.lastLoginAt):"لم يسجل الدخول بعد"} · <b>إنشاء الحساب:</b> {fmtDate(profile.student.createdAt)}</p>
      <div className="student-medals-section">
       <h4>الميداليات والإنجازات</h4>
       {(()=>{const medals=medalItemsFor(profile.assignments);return medals.length?<div className="medal-badge-grid">{medals.map(item=><div key={item.assignmentId} className="medal-badge"><IconMedal size={22} style={{color:MEDAL_COLORS[item.tier]}}/><div><strong>ميدالية {MEDAL_LABELS[item.tier]}</strong><span>{item.title}</span>{item.submittedAt&&<small>{fmtDate(item.submittedAt)}</small>}</div></div>)}</div>:<p className="medal-badge-empty">لم يحصل الطالب على ميداليات بعد.</p>})()}
      </div>
      <div className="students-table-wrap"><table className="students-table">
       <thead><tr><th>الواجب</th><th>الحالة</th><th>المحاولات</th><th>العلامة</th><th>النسبة</th><th>آخر تسليم</th></tr></thead>
       <tbody>{profile.assignments.map(a=><tr key={a.assignmentId}>
        <td>{a.title}</td><td>{a.latestScore===null?"لم يُحل":a.finalized?"مصحح":"بانتظار المراجعة"}</td><td>{a.attemptsUsed}</td>
        <td>{a.latestScore===null?"—":a.latestScore+"/"+a.totalMarks}</td><td>{a.latestPercentage===null?"—":a.latestPercentage+"%"}</td><td>{a.submittedAt?fmtDate(a.submittedAt):"—"}</td>
       </tr>)}{!profile.assignments.length&&<tr><td colSpan={6}>لا توجد واجبات لهذا الصف.</td></tr>}</tbody>
      </table></div>
     </section>}

     {historyBusy&&<div className="platform-loading">⏳ جارٍ تحميل سجل الوظائف...</div>}
     {history&&<section className="student-profile-card centered-modal-panel">
      <div className="platform-card-heading">
       <div><span className="platform-eyebrow">Assignment History</span><h3>{history.student.displayName}</h3><small>{history.classroom?.name||"—"} · {history.student.identityNumber}</small></div>
       <button onClick={()=>{setHistory(null);setHistoryDeadlineFor(null)}}><IconClose size={14}/>إغلاق</button>
      </div>
      <div className="students-table-wrap"><table className="students-table">
       <thead><tr><th>اسم الوظيفة</th><th>تاريخ آخر تسليم</th><th>العلامة</th><th>عدد المحاولات</th><th>الحالة</th><th>إجراءات</th></tr></thead>
       <tbody>{history.submittedAssignments.map(item=><Fragment key={item.assignmentId}>
        <tr>
         <td>{item.title||"—"}</td>
         <td>{item.submittedAt?fmtDate(item.submittedAt):"—"}</td>
         <td>{item.score+"/"+item.totalMarks+" - "+item.percentage+"%"}</td>
         <td>{item.attemptsUsed>1?"المحاولات: "+item.attemptsUsed:item.attemptsUsed}</td>
         <td>{item.finalized?"تم التسليم":"بانتظار المراجعة"}</td>
         <td><div className="student-row-actions">
          <button onClick={()=>setReviewTarget({assignmentId:item.assignmentId,studentId:history.student.userId,attemptNumber:item.latestAttemptNumber})}>👁 فحص الوظيفة</button>
          {item.isCurrentClassAssignment?<>
           <button onClick={()=>void historyAllowRetry(item)} disabled={actionBusy}>🔄 محاولة إضافية</button>
           <button onClick={()=>historyDeadlineFor===item.assignmentId?setHistoryDeadlineFor(null):openHistoryDeadline(item)} disabled={actionBusy}>⏰ تمديد الموعد</button>
          </>:<small className="result-code">سجل سابق</small>}
         </div></td>
        </tr>
        {historyDeadlineFor===item.assignmentId&&<tr className="deadline-edit-row"><td colSpan={6}><div className="deadline-edit-inline">
         <span>الموعد الأصلي: {fmtDate(item.dueAt)}</span>
         {item.dueAtOverride&&<span>التمديد الحالي: {fmtDate(item.dueAtOverride)}</span>}
         <input type="datetime-local" value={historyDeadlineValue} onChange={e=>setHistoryDeadlineValue(e.target.value)}/>
         <button onClick={()=>void saveHistoryDeadline(item)} disabled={actionBusy||!historyDeadlineValue}>حفظ التمديد</button>
         {item.dueAtOverride&&<button onClick={()=>void clearHistoryDeadline(item)} disabled={actionBusy}>إلغاء التمديد</button>}
         <button onClick={()=>setHistoryDeadlineFor(null)}>إغلاق</button>
        </div></td></tr>}
       </Fragment>)}
       {!history.submittedAssignments.length&&<tr><td colSpan={6}>لا توجد وظائف مسلّمة.</td></tr>}</tbody>
      </table></div>
     </section>}
     {reviewTarget&&<AssignmentReview token={token} assignmentId={reviewTarget.assignmentId} studentId={reviewTarget.studentId} initialAttempt={reviewTarget.attemptNumber} onClose={()=>setReviewTarget(null)} onSaved={()=>{if(history)void openHistory(history.student.userId)}}/>}

     <div className="students-table-wrap"><table className="students-table students-table-pro">
      <thead><tr>
       <th><input type="checkbox" checked={visibleStudents.length>0&&visibleStudents.every(s=>selectedIds.includes(s.userId))} onChange={toggleSelectVisible} aria-label="تحديد الكل"/></th>
       <th>الاسم</th><th>اسم العائلة</th><th>رقم الهوية</th><th>الحالة</th><th>آخر دخول</th><th>إجراءات</th>
      </tr></thead>
      <tbody>{visibleStudents.map(student=><tr key={student.userId} className={student.archived?"student-row-archived":""}>
       <td><input type="checkbox" checked={selectedIds.includes(student.userId)} onChange={()=>toggleSelected(student.userId)} aria-label={"تحديد "+student.displayName}/></td>
       <td><strong>{student.firstName||splitName(student.displayName).firstName}</strong>{student.likesCount>0&&<span className="student-likes-badge" title={student.likesCount+" ردّ فعل على إنجازاته"}>❤️ {student.likesCount}</span>}</td>
       <td>{student.familyName||splitName(student.displayName).familyName||"—"}</td>
       <td dir="ltr">{student.identityNumber||student.code||"يحتاج تحديث"}</td>
       <td><span className={student.archived?"status-archived":student.active?"status-active":"status-disabled"}>{statusLabel(student)}</span></td>
       <td>{student.lastLoginAt?fmtDate(student.lastLoginAt):<span className="never-login">لم يدخل بعد</span>}</td>
       <td><div className="student-row-actions">
        <button className="student-row-primary" onClick={()=>void openProfile(student)} disabled={actionBusy}><IconUser size={14}/>التفاصيل</button>
        {student.submittedAssignmentsCount>0&&<button onClick={()=>void openHistory(student.userId)} disabled={actionBusy}>📚 الوظائف ({student.submittedAssignmentsCount})</button>}
        <details className="row-menu" name="student-row-menu">
         <summary aria-label="مزيد من الإجراءات"><IconMore size={16}/></summary>
         <div className="row-menu-panel">
          <button onClick={()=>startEdit(student)} disabled={actionBusy}><IconEdit size={14}/>تعديل</button>
          <button onClick={()=>void copyText(student.identityNumber||student.code,"✓ تم نسخ رقم الهوية.")}><IconCopy size={14}/>نسخ رقم الهوية</button>
          {!student.archived&&<button onClick={()=>toggleStudent(student)} disabled={actionBusy}>{student.active?"تعطيل الحساب":"تفعيل الحساب"}</button>}
          <button onClick={()=>archiveStudent(student)} disabled={actionBusy}>{student.archived?"↩ استعادة":"📦 أرشفة"}</button>
          <hr className="row-menu-sep"/>
          <button className="danger-button" onClick={()=>deleteStudent(student)} disabled={actionBusy}><IconTrash size={14}/>حذف نهائي</button>
         </div>
        </details>
       </div></td>
      </tr>)}</tbody>
     </table>
     {!loading&&visibleStudents.length===0&&<div className="platform-empty">لا توجد نتائج مطابقة.</div>}
     </div>
    </>}
   </section>
  </div>

 </div></section>;
}

export default TeacherPlatform;
