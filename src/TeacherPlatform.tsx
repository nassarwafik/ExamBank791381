import {useEffect,useMemo,useState} from "react";
import AssignmentsPanel from "./AssignmentsPanel";

type TeacherPlatformProps={token:string;currentExam:unknown|null};
type Classroom={classId:string;name:string;grade:string;schoolYear:string;active:boolean;studentCount:number;createdAt:string};
type Student={userId:string;code:string;identityNumber:string;firstName:string;familyName:string;displayName:string;classId:string;active:boolean;createdAt:string;lastLoginAt:string};
type Credential={userId?:string;firstName?:string;familyName?:string;displayName?:string;code:string;identityNumber?:string;password:string};
type BulkStudent={firstName:string;familyName:string;identityNumber:string};
type BulkError={index:number;firstName?:string;familyName?:string;identityNumber?:string;displayName:string;code:string;error:string};
type ApiError={ok?:boolean;error?:string};

const onlyDigits=(value:string)=>value.replace(/\D/g,"").slice(0,9);
const validIdentity=(value:string)=>/^\d{9}$/.test(value);
function normalizeImportedIdentity(value:unknown){
 const digits=String(value??"").replace(/\D/g,"");
 return digits&&digits.length<=9?digits.padStart(9,"0"):digits;
}
function splitName(value:unknown){
 const parts=String(value??"").trim().split(/\s+/).filter(Boolean);
 return {firstName:parts.shift()||"",familyName:parts.join(" ")};
}

function TeacherPlatform({token,currentExam}:TeacherPlatformProps){
 const [classes,setClasses]=useState<Classroom[]>([]),[students,setStudents]=useState<Student[]>([]),[selectedClassId,setSelectedClassId]=useState(""),[loading,setLoading]=useState(false),[actionBusy,setActionBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [newClassName,setNewClassName]=useState(""),[newClassGrade,setNewClassGrade]=useState(""),[newSchoolYear,setNewSchoolYear]=useState(String(new Date().getFullYear())+"-"+String(new Date().getFullYear()+1));
 const [newFirstName,setNewFirstName]=useState(""),[newFamilyName,setNewFamilyName]=useState(""),[newIdentityNumber,setNewIdentityNumber]=useState(""),[newStudentPassword,setNewStudentPassword]=useState("");
 const [credentialBox,setCredentialBox]=useState<{name:string;code:string;password:string}|null>(null);
 const [bulkStudents,setBulkStudents]=useState<BulkStudent[]>([]),[bulkFileName,setBulkFileName]=useState(""),[bulkCredentials,setBulkCredentials]=useState<Credential[]>([]),[bulkErrors,setBulkErrors]=useState<BulkError[]>([]);
 const [editingStudent,setEditingStudent]=useState<Student|null>(null),[editFirstName,setEditFirstName]=useState(""),[editFamilyName,setEditFamilyName]=useState(""),[editIdentityNumber,setEditIdentityNumber]=useState(""),[editClassId,setEditClassId]=useState(""),[editPassword,setEditPassword]=useState("");
 const selectedClass=useMemo(()=>classes.find(c=>c.classId===selectedClassId)||null,[classes,selectedClassId]);

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
   const result=await teacherApi<{ok:true;students:Student[]}>("/api/students?classId="+encodeURIComponent(classId));
   setStudents(result.students||[]);
  }catch(e){setError(e instanceof Error?e.message:"تعذر تحميل الطلاب.")}
  finally{setLoading(false)}
 }

 useEffect(()=>{void loadClasses(false)},[]);
 useEffect(()=>{if(selectedClassId)void loadStudents(selectedClassId);else setStudents([])},[selectedClassId]);

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
    action:"create",
    classId:selectedClassId,
    firstName:newFirstName.trim(),
    familyName:newFamilyName.trim(),
    identityNumber:newIdentityNumber,
    password:newStudentPassword
   })});
   setCredentialBox({name:result.student.displayName,code:result.student.code,password:result.temporaryPassword});
   setNewFirstName("");setNewFamilyName("");setNewIdentityNumber("");setNewStudentPassword("");
   await Promise.all([loadStudents(selectedClassId),loadClasses()]);
   setNotice("✓ تم إنشاء حساب الطالب. سيستخدم الطالب رقم الهوية لتسجيل الدخول.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر إنشاء الطالب.")}
  finally{setActionBusy(false)}
 }

 async function resetPassword(student:Student){
  if(actionBusy||!window.confirm("إنشاء كلمة مرور جديدة للطالب "+student.displayName+"؟"))return;
  setActionBusy(true);setError("");setNotice("");setCredentialBox(null);
  try{
   const result=await teacherApi<{ok:true;temporaryPassword:string}>("/api/students",{method:"POST",body:JSON.stringify({action:"resetPassword",userId:student.userId})});
   setCredentialBox({name:student.displayName,code:student.code,password:result.temporaryPassword});
   setNotice("✓ تم تغيير كلمة المرور.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تغيير كلمة المرور.")}
  finally{setActionBusy(false)}
 }

 async function toggleStudent(student:Student){
  if(actionBusy)return;
  setActionBusy(true);setError("");setNotice("");
  try{
   await teacherApi("/api/students",{method:"POST",body:JSON.stringify({action:"toggleActive",userId:student.userId})});
   await loadStudents(selectedClassId);
   setNotice(student.active?"✓ تم تعطيل حساب الطالب.":"✓ تم تفعيل حساب الطالب.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر تعديل الحساب.")}
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
    action:"update",
    userId:editingStudent.userId,
    firstName:editFirstName.trim(),
    familyName:editFamilyName.trim(),
    identityNumber:editIdentityNumber,
    classId:editClassId,
    password:editPassword
   })});
   const moved=editClassId!==selectedClassId;
   setEditingStudent(null);setEditPassword("");
   await Promise.all([loadStudents(selectedClassId),loadClasses()]);
   setNotice(moved?"✓ تم تعديل الطالب ونقله إلى الصف المختار.":"✓ تم حفظ تعديلات الطالب. سيستخدم الطالب رقم الهوية لتسجيل الدخول.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ تعديلات الطالب.")}
  finally{setActionBusy(false)}
 }

 async function readBulkFile(file:File|null){
  setBulkStudents([]);setBulkCredentials([]);setBulkErrors([]);setBulkFileName(file?.name||"");setError("");setNotice("");
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
   }).filter((x:{firstName:string;familyName:string;identityNumber:string})=>x.firstName||x.familyName||x.identityNumber);

   if(!normalized.length)throw new Error("لم أجد بيانات طلاب في ملف JSON.");
   const invalid=normalized.filter(x=>!x.firstName||!x.familyName||!validIdentity(x.identityNumber));
   if(invalid.length)throw new Error("يوجد "+invalid.length+" طالبًا ناقص البيانات. يجب أن يحتوي كل طالب على الاسم، اسم العائلة ورقم هوية من 9 أرقام.");

   setBulkStudents(normalized);
   setNotice("✓ تم قراءة "+normalized.length+" طالبًا. سيُستخدم رقم الهوية تلقائيًا لتسجيل الدخول، وستُولّد كلمة مرور لكل طالب.");
  }catch(e){
   setError(e instanceof Error?e.message:"ملف JSON غير صالح.");
   setBulkFileName("");
  }
 }

 async function importBulkStudents(){
  if(!selectedClassId||!bulkStudents.length||actionBusy)return;
  setActionBusy(true);setError("");setNotice("");setBulkCredentials([]);setBulkErrors([]);
  try{
   const result=await teacherApi<{ok:true;imported:number;failed:number;credentials:Credential[];errors:BulkError[]}>("/api/students",{method:"POST",body:JSON.stringify({action:"bulkImport",classId:selectedClassId,students:bulkStudents})});
   setBulkCredentials(result.credentials||[]);
   setBulkErrors(result.errors||[]);
   await Promise.all([loadStudents(selectedClassId),loadClasses()]);
   setNotice("✓ تم استيراد "+result.imported+" طالبًا"+(result.failed?"، وتعذر استيراد "+result.failed+".":"."));
   setBulkStudents([]);setBulkFileName("");
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
    code:x.code,
    password:x.password
   }))
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download="student-credentials.json";a.click();
  URL.revokeObjectURL(url);
 }

 return <section className="teacher-platform" dir="rtl"><div className="teacher-platform-inner">
  <section className="platform-hero"><div><span className="platform-eyebrow">ExamBank 2.0F2</span><h2>الصفوف وحسابات الطلاب</h2><p>الاسم واسم العائلة محفوظان بشكل منفصل، ويُستخدم رقم الهوية تلقائيًا كمعرّف دخول الطالب.</p></div><div className="platform-hero-stat"><strong>{classes.filter(c=>c.active).length}</strong><span>صفوف فعّالة</span></div></section>

  {error&&<div className="platform-error">{error}</div>}
  {notice&&<div className="platform-notice">{notice}</div>}

  {credentialBox&&<section className="credential-box"><div><span className="platform-eyebrow">بيانات دخول جديدة</span><h3>{credentialBox.name}</h3></div><div className="credential-values"><div><span>رقم الهوية</span><strong>{credentialBox.code}</strong></div><div><span>كلمة المرور</span><strong>{credentialBox.password}</strong></div></div><p>يُستخدم رقم الهوية تلقائيًا لتسجيل دخول الطالب، وكلمة المرور تبقى منفصلة.</p><button onClick={()=>setCredentialBox(null)}>إخفاء</button></section>}

  <div className="platform-grid">
   <section className="platform-card"><div className="platform-card-heading"><div><span className="platform-eyebrow">Classes</span><h3>الصفوف</h3></div><button onClick={()=>loadClasses()} disabled={loading}>↻ تحديث</button></div>
    <div className="platform-form-grid"><label>اسم الصف<input value={newClassName} onChange={e=>setNewClassName(e.target.value)} placeholder="مثال: العاشر 1"/></label><label>المرحلة / الصف<input value={newClassGrade} onChange={e=>setNewClassGrade(e.target.value)} placeholder="مثال: العاشر"/></label><label>السنة الدراسية<input value={newSchoolYear} onChange={e=>setNewSchoolYear(e.target.value)}/></label><button className="platform-primary" onClick={createClass} disabled={actionBusy||!newClassName.trim()}>+ إنشاء صف</button></div>
    {loading&&classes.length===0&&<div className="platform-loading">⏳ جارٍ التحميل...</div>}
    <div className="class-list">{classes.map(classroom=><article key={classroom.classId} className={"class-row "+(classroom.classId===selectedClassId?"selected ":"")+(classroom.active?"":"archived")}><button className="class-select" onClick={()=>setSelectedClassId(classroom.classId)}><strong>{classroom.name}</strong><span>{classroom.grade||"—"} · {classroom.studentCount} طالب</span><small>{classroom.schoolYear||""}</small></button><button className="class-archive" onClick={()=>toggleClassArchive(classroom)} disabled={actionBusy}>{classroom.active?"أرشفة":"تفعيل"}</button></article>)}{!loading&&classes.length===0&&<div className="platform-empty">لا توجد صفوف بعد.</div>}</div>
   </section>

   <section className="platform-card"><div className="platform-card-heading"><div><span className="platform-eyebrow">Students</span><h3>الطلاب</h3></div><span className="student-count-badge">{students.length}</span></div>
    {!selectedClass?<div className="platform-empty">أنشئ صفًا أو اختر صفًا لإدارة الطلاب.</div>:<>
     <div className="selected-class-strip"><strong>{selectedClass.name}</strong><span>{selectedClass.grade||""}</span></div>

     <div className="student-create-grid">
      <label>الاسم<input value={newFirstName} onChange={e=>setNewFirstName(e.target.value)} placeholder="الاسم الشخصي"/></label>
      <label>اسم العائلة<input value={newFamilyName} onChange={e=>setNewFamilyName(e.target.value)} placeholder="اسم العائلة"/></label>
      <label>رقم الهوية<input value={newIdentityNumber} onChange={e=>setNewIdentityNumber(onlyDigits(e.target.value))} inputMode="numeric" maxLength={9} dir="ltr" placeholder="9 أرقام"/></label>
      <label>كلمة مرور اختيارية<input type="password" value={newStudentPassword} onChange={e=>setNewStudentPassword(e.target.value)} placeholder="اتركها فارغة للتوليد التلقائي"/></label>
      <button className="platform-primary" onClick={createStudent} disabled={actionBusy||!selectedClass.active||!newFirstName.trim()||!newFamilyName.trim()||!validIdentity(newIdentityNumber)}>+ إنشاء حساب طالب</button>
     </div>

     <section className="credential-box" style={{marginTop:16}}>
      <div><span className="platform-eyebrow">JSON Import</span><h3>رفع جميع طلاب الصف من ملف JSON</h3><p>كل طالب يجب أن يحتوي على <b>firstName</b> و<b>familyName</b> و<b>identityNumber</b>. يُستخدم رقم الهوية تلقائيًا كمعرّف دخول الطالب، وتُولّد كلمة مرور لكل طالب.</p><pre dir="ltr" style={{whiteSpace:"pre-wrap"}}>{`[
  {"firstName":"Ahmad","familyName":"Ali","identityNumber":"123456789"}
]`}</pre></div>
      <div className="student-create-grid"><label>ملف الطلاب<input type="file" accept=".json,application/json" onChange={e=>void readBulkFile(e.target.files?.[0]||null)}/></label><div><span>الملف</span><strong>{bulkFileName||"لم يتم اختيار ملف"}</strong><small>{bulkStudents.length?bulkStudents.length+" طالب جاهز للاستيراد":""}</small></div><button className="platform-primary" onClick={importBulkStudents} disabled={actionBusy||!selectedClass.active||!bulkStudents.length}>⬆ استيراد الطلاب وتوليد كلمات المرور</button></div>
     </section>

     {!selectedClass.active&&<div className="platform-warning">الصف مؤرشف؛ فعّله قبل إضافة طلاب جدد.</div>}

     {bulkCredentials.length>0&&<section className="credential-box" style={{marginTop:16}}><div className="platform-card-heading"><div><span className="platform-eyebrow">Generated credentials</span><h3>بيانات الدخول التي تم إنشاؤها</h3></div><button onClick={downloadCredentials}>⬇ تنزيل JSON</button></div><p>احفظ القائمة الآن؛ كلمات المرور لا تُعرض لاحقًا كنص واضح.</p><div className="students-table-wrap"><table className="students-table"><thead><tr><th>الاسم</th><th>العائلة</th><th>رقم الهوية</th><th>كلمة المرور</th></tr></thead><tbody>{bulkCredentials.map((c,i)=><tr key={(c.userId||c.code)+i}><td>{c.firstName}</td><td>{c.familyName}</td><td dir="ltr">{c.identityNumber||c.code}</td><td dir="ltr"><strong>{c.password}</strong></td></tr>)}</tbody></table></div></section>}

     {bulkErrors.length>0&&<div className="platform-warning"><strong>طلاب لم تتم إضافتهم:</strong>{bulkErrors.map((x,i)=><div key={i}>{x.displayName||"السطر "+(x.index+1)}{x.identityNumber?" · "+x.identityNumber:""}: {x.error}</div>)}</div>}

     {editingStudent&&<section className="credential-box" style={{marginTop:16}}>
      <div className="platform-card-heading"><div><span className="platform-eyebrow">Edit Student</span><h3>تعديل تفاصيل الطالب</h3></div><button onClick={()=>setEditingStudent(null)}>إلغاء</button></div>
      <div className="student-create-grid">
       <label>الاسم<input value={editFirstName} onChange={e=>setEditFirstName(e.target.value)}/></label>
       <label>اسم العائلة<input value={editFamilyName} onChange={e=>setEditFamilyName(e.target.value)}/></label>
       <label>رقم الهوية<input value={editIdentityNumber} onChange={e=>setEditIdentityNumber(onlyDigits(e.target.value))} inputMode="numeric" maxLength={9} dir="ltr" placeholder="9 أرقام"/></label>
       <label>الصف<select value={editClassId} onChange={e=>setEditClassId(e.target.value)}>{classes.filter(c=>c.active||c.classId===editingStudent.classId).map(c=><option key={c.classId} value={c.classId}>{c.name} · {c.grade}</option>)}</select></label>
       <label>كلمة مرور جديدة<input type="password" value={editPassword} onChange={e=>setEditPassword(e.target.value)} placeholder="اتركها فارغة للإبقاء على الحالية"/></label>
       <button className="platform-primary" onClick={saveStudentEdit} disabled={actionBusy||!editFirstName.trim()||!editFamilyName.trim()||!validIdentity(editIdentityNumber)||!editClassId}>💾 حفظ التعديلات</button>
      </div>
     </section>}

     <div className="students-table-wrap"><table className="students-table">
      <thead><tr><th>الاسم</th><th>اسم العائلة</th><th>رقم الهوية</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody>{students.map(student=><tr key={student.userId}><td><strong>{student.firstName||splitName(student.displayName).firstName}</strong></td><td>{student.familyName||splitName(student.displayName).familyName||"—"}</td><td dir="ltr">{student.identityNumber||(/^\d{9}$/.test(student.code)?student.code:"يحتاج تحديث")}</td><td><span className={student.active?"status-active":"status-disabled"}>{student.active?"فعّال":"معطّل"}</span></td><td><div className="student-row-actions"><button onClick={()=>startEdit(student)} disabled={actionBusy}>✏️ تعديل</button><button onClick={()=>resetPassword(student)} disabled={actionBusy}>كلمة مرور جديدة</button><button onClick={()=>toggleStudent(student)} disabled={actionBusy}>{student.active?"تعطيل":"تفعيل"}</button></div></td></tr>)}</tbody>
     </table>{!loading&&students.length===0&&<div className="platform-empty">لا يوجد طلاب في هذا الصف بعد.</div>}</div>
    </>}
   </section>
  </div>

  <AssignmentsPanel token={token} classes={classes} currentExam={currentExam}/>
 </div></section>;
}

export default TeacherPlatform;
